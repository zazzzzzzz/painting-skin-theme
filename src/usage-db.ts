/* 用量层 · 读 ZCode 的用量库并聚合出快照。
 *
 * 数据源是 **ZCode CLI 自己的 SQLite 库**（`~/.zcode/cli/db/db.sqlite`），我们**只读**。
 * 四张表：model_usage / turn_usage / tool_usage / session。
 *
 * 与来源项目（Dream-Work-Theme）的差别：那边是 Electron 33 / Node 20.18，没有 node:sqlite，
 * 于是自写了 B-Tree + WAL 遍历器（~850 行）。本机 Node 24.16 自带 node:sqlite，
 * 所以这里直接用 DatabaseSync + SQL 聚合 —— 同样的口径，代码少一个数量级。
 *
 * 聚合口径（与来源一致，改动会导致数字对不上）：
 *   - 只统计 `status='completed'` 的请求；`query_source='subagent'` 单独聚合，不计入父会话
 *   - `turns` = 已完成请求里 distinct turn_id 的数量
 *   - `today` = 本地零点起的一天（用设备本地时区，不用 UTC）
 *   - `ctx` = **最后一次完成请求的 input_tokens**（不是历史最大值）
 *   - `ctxExc` = 出现过 `context_exceeded=1` 的最新时间戳；页面用 `ctxExc >= lastAt` 判"仍未超限"
 *   - `live.state` 由"运行中的 tool/model + 完成/失败时间窗"推导，驱动宠物状态 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';

export function usageDbDir(): string {
  return path.join(os.homedir(), '.zcode', 'cli', 'db');
}

/** 库活动戳：db.sqlite / -wal / -shm 的最新 mtime（WAL 模式下写入主要落在 -wal） */
export function usageDbStamp(): number {
  const dir = usageDbDir();
  let newest = 0;
  for (const file of ['db.sqlite', 'db.sqlite-wal', 'db.sqlite-shm']) {
    try { newest = Math.max(newest, fs.statSync(path.join(dir, file)).mtimeMs); } catch { /* 文件可能还没建 */ }
  }
  return newest;
}

export interface TurnSnap {
  requests: number;
  retries: number;
  toolCalls: number;
  toolErrors: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  durationMs: number;
  ttftMs: number;
}

export interface ToolItem { name: string; count: number; durationMs: number; errors: number }

export interface SubItem {
  sid: string; title: string; requests: number; total: number;
  input: number; output: number; cacheRead: number; reasoning: number; cacheWrite: number;
  last: number; active: boolean;
}

export interface SessionSnap {
  sid: string;
  title: string;
  active: boolean;
  turns: number;
  requests: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  toolCalls: number;
  retries: number;
  /** 最后一次完成请求的 input_tokens（上下文占用） */
  ctx: number;
  updated: string;
  lastAt: number;
  live: { state: 'idle' | 'thinking' | 'running' | 'done' | 'failed'; at: number };
  last: { durationMs: number; ttftMs: number; model: string; tps: number };
  lastTurn: TurnSnap;
  tools: { total: number; errors: number; list: ToolItem[] };
  sub: {
    requests: number; total: number; input: number; output: number;
    cacheRead: number; reasoning: number; cacheWrite: number; active: boolean; list: SubItem[];
  };
  code: { add: number | null; del: number | null; files: number | null };
  ctxExc: number;
  contextWindow: number;
  contextAuto: boolean;
  isSub: boolean;
  parent: string | null;
}

export interface UsageSnapshot {
  v: 1;
  generatedAt: number;
  today: {
    requests: number; input: number; output: number; cacheRead: number;
    cacheWrite: number; reasoning: number; total: number; retries: number;
  };
  session: SessionSnap | null;
  recent: SessionSnap[];
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;   // 活跃会话判定（与来源一致）
const SUB_RUNNING_MS = 30 * 1000;
const TOOL_RUNNING_MS = 10 * 60 * 1000;
const FAILED_WINDOW_MS = 12 * 1000;
const DONE_WINDOW_MS = 8 * 1000;
const FALLBACK_CONTEXT_WINDOW = 128000;
const POOL_REGULAR = 6;
const POOL_SUB = 6;
/* 推送体积上限：实测单个大会话有 1400+ 条工具明细，12 个会话全带上会让 CDP 表达式过大。
 * 条上只展示前若干条，这里按 count 排序后截断即可。 */
const TOOL_LIST_CAP = 20;
const SUB_LIST_CAP = 12;

const EMPTY_TURN: TurnSnap = {
  requests: 0, retries: 0, toolCalls: 0, toolErrors: 0, input: 0, output: 0,
  reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0, durationMs: 0, ttftMs: 0,
};

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function hhmmss(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

/* ---------- 模型上下文窗口目录（model_id → contextWindow） ---------- */

let catalogCache: { at: number; map: Map<string, number> } | null = null;

function modelCatalog(): Map<string, number> {
  if (catalogCache && Date.now() - catalogCache.at < 600000) return catalogCache.map;
  const map = new Map<string, number>();
  const dirs = [
    process.env.ZCODE_MODEL_PROVIDERS_DIR,
    'D:\\ZCode\\resources\\model-providers',   // 与来源项目同路径；可用环境变量覆盖
  ].filter((d): d is string => Boolean(d));
  for (const dir of dirs) {
    let files: string[] = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const file of files) {
      if (!/\.json$/i.test(file)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        for (const model of raw?.models ?? []) {
          const id = String(model?.id ?? '').toLowerCase();
          const window = Number(model?.contextWindow ?? model?.context_window);
          if (id && Number.isFinite(window) && window > 0) map.set(id, window);
        }
      } catch { /* 单个坏文件不影响其它 */ }
    }
    if (map.size) break;
  }
  catalogCache = { at: Date.now(), map };
  return map;
}

/** 先精确匹配，再按"最长前缀 + 分隔符"匹配变体（如 glm-4.6-air → glm-4.6） */
function lookupContextWindow(key: string): number | undefined {
  if (!key) return undefined;
  const catalog = modelCatalog();
  const exact = catalog.get(key);
  if (exact !== undefined) return exact;
  let best: string | null = null;
  for (const candidate of catalog.keys()) {
    if (key.startsWith(candidate + '-') && (!best || candidate.length > best.length)) best = candidate;
  }
  return best ? catalog.get(best) : undefined;
}

/* ---------- 聚合 ---------- */

interface SessAgg {
  requests: number;
  input: number; output: number; reasoning: number; cacheRead: number; cacheWrite: number; total: number;
  retries: number; toolCalls: number;
  lastAt: number;
  lastTurnId: string;
  lastIn: number; lastOut: number; lastDuration: number; lastTtft: number; lastModel: string;
}

function newAgg(): SessAgg {
  return {
    requests: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0,
    retries: 0, toolCalls: 0, lastAt: 0, lastTurnId: '', lastIn: 0, lastOut: 0,
    lastDuration: 0, lastTtft: 0, lastModel: '',
  };
}

function openDb(): DatabaseSync | null {
  try {
    const db = new DatabaseSync(path.join(usageDbDir(), 'db.sqlite'), { readOnly: true });
    // 只读：即使误写成写语句也会被驱动拒绝（双保险）
    try { db.exec('PRAGMA query_only = 1'); } catch { /* 某些构建不支持，忽略 */ }
    return db;
  } catch {
    return null;
  }
}

/** 只统计已完成请求；subagent 单独归集 */
function collectModelUsage(db: DatabaseSync, sessionId: string | null, aggs: Map<string, SessAgg>, subAggs: Map<string, SessAgg>) {
  // 逐行扫 model_usage（约万行量级），保持与来源完全相同的口径
  const rows = db.prepare(`
    SELECT session_id, turn_id, status, completed_at, duration_ms, time_to_first_token_ms,
           first_token_at, input_tokens, output_tokens, reasoning_tokens,
           cache_read_input_tokens, cache_creation_input_tokens, computed_total_tokens,
           tool_call_count, retry_count, model_id, query_source
    FROM model_usage
    WHERE status = 'completed'
  `).all() as Array<Record<string, unknown>>;
  for (const row of rows) {
    const sid = str(row.session_id);
    if (!sid) continue;
    const isSub = str(row.query_source) === 'subagent';
    const target = isSub ? subAggs : aggs;
    let agg = target.get(sid);
    if (!agg) { agg = newAgg(); target.set(sid, agg); }
    agg.requests++;
    agg.input += num(row.input_tokens);
    agg.output += num(row.output_tokens);
    agg.reasoning += num(row.reasoning_tokens);
    agg.cacheRead += num(row.cache_read_input_tokens);
    agg.cacheWrite += num(row.cache_creation_input_tokens);
    agg.total += num(row.computed_total_tokens);
    agg.retries += num(row.retry_count);
    agg.toolCalls += num(row.tool_call_count);
    const completedAt = num(row.completed_at);
    if (completedAt >= agg.lastAt) {
      agg.lastAt = completedAt;
      agg.lastTurnId = str(row.turn_id);
      agg.lastIn = num(row.input_tokens);
      agg.lastOut = num(row.output_tokens);
      agg.lastDuration = num(row.duration_ms);
      agg.lastTtft = num(row.time_to_first_token_ms);
      agg.lastModel = str(row.model_id);
    }
  }
  void sessionId;
}

export function buildUsageSnapshot(forceSids: string[] = []): UsageSnapshot | null {
  const db = openDb();
  if (!db) return null;
  try {
    const aggs = new Map<string, SessAgg>();
    const subAggs = new Map<string, SessAgg>();
    collectModelUsage(db, null, aggs, subAggs);
    if (!aggs.size && !subAggs.size) return null;

    /* turns：distinct turn_id */
    const turns = new Map<string, number>();
    const turnRows = db.prepare(`
      SELECT session_id, COUNT(DISTINCT turn_id) AS turns FROM model_usage
      WHERE status = 'completed' AND turn_id IS NOT NULL GROUP BY session_id
    `).all() as Array<Record<string, unknown>>;
    for (const row of turnRows) turns.set(str(row.session_id), num(row.turns));

    /* 今日：本地零点起 */
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const today = { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, retries: 0 };
    const todayRow = db.prepare(`
      SELECT COUNT(*) AS requests, SUM(input_tokens) AS input, SUM(output_tokens) AS output,
             SUM(cache_read_input_tokens) AS cache_read, SUM(cache_creation_input_tokens) AS cache_write,
             SUM(reasoning_tokens) AS reasoning, SUM(computed_total_tokens) AS total, SUM(retry_count) AS retries
      FROM model_usage WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?
    `).get(dayStartMs, dayStartMs + 86400000) as Record<string, unknown> | undefined;
    if (todayRow) {
      today.requests = num(todayRow.requests);
      today.input = num(todayRow.input);
      today.output = num(todayRow.output);
      today.cacheRead = num(todayRow.cache_read);
      today.cacheWrite = num(todayRow.cache_write);
      today.reasoning = num(todayRow.reasoning);
      today.total = num(todayRow.total);
      today.retries = num(todayRow.retries);
    }

    /* 上下文超限 / 运行中（驱动 live.state） */
    const ctxExcBySid = new Map<string, number>();
    for (const row of db.prepare(`
      SELECT session_id, MAX(COALESCE(completed_at, started_at)) AS at FROM model_usage
      WHERE context_exceeded = 1 GROUP BY session_id
    `).all() as Array<Record<string, unknown>>) {
      ctxExcBySid.set(str(row.session_id), num(row.at));
    }
    const runningModelAt = new Map<string, number>();
    for (const row of db.prepare(`
      SELECT session_id, MAX(started_at) AS at FROM model_usage WHERE status = 'running' GROUP BY session_id
    `).all() as Array<Record<string, unknown>>) {
      runningModelAt.set(str(row.session_id), num(row.at));
    }
    const runningToolAt = new Map<string, number>();
    for (const row of db.prepare(`
      SELECT session_id, MAX(started_at) AS at FROM tool_usage WHERE status = 'running' GROUP BY session_id
    `).all() as Array<Record<string, unknown>>) {
      runningToolAt.set(str(row.session_id), num(row.at));
    }

    /* 最近一轮的状态（failed/done 判定用） */
    const lastTurnStatus = new Map<string, { status: string; at: number }>();
    for (const row of db.prepare(`
      SELECT session_id, status, MAX(COALESCE(completed_at, started_at)) AS at FROM turn_usage GROUP BY session_id
    `).all() as Array<Record<string, unknown>>) {
      lastTurnStatus.set(str(row.session_id), { status: str(row.status), at: num(row.at) });
    }

    /* 每个会话最后一次完成的 turn 的明细（turn_usage 优先，缺失时回退逐行聚合） */
    const turnDetail = new Map<string, TurnSnap>();
    for (const row of db.prepare(`
      SELECT session_id, turn_id, model_request_count, model_retry_count, tool_call_count, tool_error_count,
             input_tokens, output_tokens, reasoning_tokens, cache_read_input_tokens,
             cache_creation_input_tokens, computed_total_tokens, duration_ms, time_to_first_token_ms
      FROM turn_usage WHERE status = 'completed'
    `).all() as Array<Record<string, unknown>>) {
      const key = str(row.session_id) + '|' + str(row.turn_id);
      turnDetail.set(key, {
        requests: num(row.model_request_count),
        retries: num(row.model_retry_count),
        toolCalls: num(row.tool_call_count),
        toolErrors: num(row.tool_error_count),
        input: num(row.input_tokens),
        output: num(row.output_tokens),
        reasoning: num(row.reasoning_tokens),
        cacheRead: num(row.cache_read_input_tokens),
        cacheWrite: num(row.cache_creation_input_tokens),
        total: num(row.computed_total_tokens),
        durationMs: num(row.duration_ms),
        ttftMs: num(row.time_to_first_token_ms),
      });
    }

    /* 工具聚合 */
    const toolsBySid = new Map<string, Map<string, ToolItem>>();
    for (const row of db.prepare(`
      SELECT session_id, tool_name, COUNT(*) AS count, SUM(duration_ms) AS duration,
             SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors
      FROM tool_usage WHERE status IN ('completed', 'error') GROUP BY session_id, tool_name
    `).all() as Array<Record<string, unknown>>) {
      const sid = str(row.session_id);
      let map = toolsBySid.get(sid);
      if (!map) { map = new Map(); toolsBySid.set(sid, map); }
      map.set(str(row.tool_name), {
        name: str(row.tool_name), count: num(row.count), durationMs: num(row.duration), errors: num(row.errors),
      });
    }

    /* 会话元信息 */
    const meta = new Map<string, { title: string; parent: string | null; add: number | null; del: number | null; files: number | null }>();
    for (const row of db.prepare(`
      SELECT id, title, parent_id, summary_additions, summary_deletions, summary_files FROM session
    `).all() as Array<Record<string, unknown>>) {
      const additions = row.summary_additions;
      meta.set(str(row.id), {
        title: str(row.title) || '(未命名)',
        parent: str(row.parent_id) || null,
        add: typeof additions === 'number' ? additions : null,
        del: typeof row.summary_deletions === 'number' ? (row.summary_deletions as number) : null,
        files: typeof row.summary_files === 'number' ? (row.summary_files as number) : null,
      });
    }

    const now = Date.now();
    const buildSession = (sid: string, agg: SessAgg, sub: Map<string, SessAgg>): SessionSnap => {
      const info = meta.get(sid);
      const lastTurn = turnDetail.get(sid + '|' + agg.lastTurnId);
      const toolMap = toolsBySid.get(sid) ?? new Map<string, ToolItem>();
      const allTools = [...toolMap.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const toolList = allTools.slice(0, TOOL_LIST_CAP);
      const toolTotal = toolList.reduce((sum, t) => sum + t.count, 0);
      const toolErrors = toolList.reduce((sum, t) => sum + t.errors, 0);

      /* 子代理：parent_id 指向本会话的那些 */
      const subList: SubItem[] = [];
      let subRequests = 0, subTotal = 0, subInput = 0, subOutput = 0, subCacheRead = 0, subReasoning = 0, subCacheWrite = 0;
      let subActive = false;
      for (const [childSid, childAgg] of sub) {
        if ((meta.get(childSid)?.parent ?? null) !== sid) continue;
        const active = now - childAgg.lastAt < SUB_RUNNING_MS;
        subActive = subActive || active;
        subRequests += childAgg.requests;
        subTotal += childAgg.total;
        subInput += childAgg.input;
        subOutput += childAgg.output;
        subCacheRead += childAgg.cacheRead;
        subReasoning += childAgg.reasoning;
        subCacheWrite += childAgg.cacheWrite;
        subList.push({
          sid: childSid,
          title: meta.get(childSid)?.title ?? childSid,
          requests: childAgg.requests, total: childAgg.total, input: childAgg.input, output: childAgg.output,
          cacheRead: childAgg.cacheRead, reasoning: childAgg.reasoning, cacheWrite: childAgg.cacheWrite,
          last: childAgg.lastAt, active,
        });
      }
      subList.sort((a, b) => b.last - a.last);
      const subListCapped = subList.slice(0, SUB_LIST_CAP);

      /* live.state：运行中的 tool → running；运行中的 model → thinking；
         最近一轮失败/完成的时间窗 → failed / done；否则 idle */
      let liveState: SessionSnap['live']['state'] = 'idle';
      let liveAt = 0;
      const toolAt = runningToolAt.get(sid) ?? 0;
      const modelAt = runningModelAt.get(sid) ?? 0;
      const turn = lastTurnStatus.get(sid);
      if (toolAt && now - toolAt < TOOL_RUNNING_MS) { liveState = 'running'; liveAt = toolAt; }
      else if (modelAt && now - modelAt < TOOL_RUNNING_MS) { liveState = 'thinking'; liveAt = modelAt; }
      else if (turn && (turn.status === 'error' || turn.status === 'cancelled') && now - turn.at < FAILED_WINDOW_MS) {
        liveState = 'failed'; liveAt = turn.at;
      } else if (turn && turn.status === 'completed' && now - turn.at < DONE_WINDOW_MS) {
        liveState = 'done'; liveAt = turn.at;
      }

      const generationMs = agg.lastOut > 0
        ? Math.max(1, agg.lastDuration - agg.lastTtft)
        : 0;
      const tps = agg.lastOut > 0 && generationMs > 0
        ? Math.round((agg.lastOut / (generationMs / 1000)) * 10) / 10
        : 0;

      return {
        sid,
        title: info?.title ?? sid,
        active: now - agg.lastAt < SESSION_TIMEOUT_MS,
        turns: turns.get(sid) ?? 0,
        requests: agg.requests,
        input: agg.input, output: agg.output, reasoning: agg.reasoning,
        cacheRead: agg.cacheRead, cacheWrite: agg.cacheWrite, total: agg.total,
        toolCalls: agg.toolCalls, retries: agg.retries,
        ctx: agg.lastIn,
        updated: hhmmss(agg.lastAt),
        lastAt: agg.lastAt,
        live: { state: liveState, at: liveAt },
        last: { durationMs: agg.lastDuration, ttftMs: agg.lastTtft, model: agg.lastModel, tps },
        lastTurn: lastTurn ?? { ...EMPTY_TURN },
        tools: { total: toolTotal, errors: toolErrors, list: toolList },
        sub: {
          requests: subRequests, total: subTotal, input: subInput, output: subOutput,
          cacheRead: subCacheRead, reasoning: subReasoning, cacheWrite: subCacheWrite,
          active: subActive, list: subListCapped,
        },
        code: { add: info?.add ?? null, del: info?.del ?? null, files: info?.files ?? null },
        ctxExc: ctxExcBySid.get(sid) ?? 0,
        // 上下文窗口：这里取目录值；页面端若能从原生 UI 读到"总量 N"会优先用页面值
        get contextWindow() { return lookupContextWindow(agg.lastModel.toLowerCase()) ?? FALLBACK_CONTEXT_WINDOW; },
        get contextAuto() { return lookupContextWindow(agg.lastModel.toLowerCase()) !== undefined; },
        isSub: sid.includes('subagent'),
        parent: info?.parent ?? null,
      } as SessionSnap;
    };

    /* 会话池：显式请求的 + 全局最新 + 6 个常规 + 6 个子代理 */
    const validSid = (sid: string) => /^[A-Za-z0-9_-]{1,255}$/.test(sid);
    const byLastAt = [...aggs.keys()].filter(validSid).sort((a, b) => (aggs.get(b)!.lastAt) - (aggs.get(a)!.lastAt));
    const subByLastAt = [...subAggs.keys()].filter(validSid).sort((a, b) => (subAggs.get(b)!.lastAt) - (subAggs.get(a)!.lastAt));
    const pool: string[] = [];
    const push = (sid: string) => {
      if (sid && validSid(sid) && !pool.includes(sid) && (aggs.has(sid) || subAggs.has(sid))) pool.push(sid);
    };
    for (const sid of forceSids) push(sid);
    if (byLastAt[0]) push(byLastAt[0]);
    for (const sid of byLastAt.filter((s) => !s.includes('subagent')).slice(0, POOL_REGULAR)) push(sid);
    for (const sid of subByLastAt.slice(0, POOL_SUB)) push(sid);

    const recent = pool.map((sid) => buildSession(sid, (aggs.get(sid) ?? subAggs.get(sid))!, subAggs));
    const globalLatest = byLastAt[0] ?? subByLastAt[0] ?? null;
    const session = globalLatest ? buildSession(globalLatest, (aggs.get(globalLatest) ?? subAggs.get(globalLatest))!, subAggs) : null;

    return { v: 1, generatedAt: Date.now(), today, session, recent };
  } catch (error) {
    console.warn('[usage-db] 聚合失败:', (error as Error).message);
    return null;
  } finally {
    try { db.close(); } catch { /* 已关闭 */ }
  }
}
