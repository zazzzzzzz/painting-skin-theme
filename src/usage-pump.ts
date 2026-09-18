/* 用量层 · 页面端数据的推送泵。
 *
 * 为什么必须有常驻进程：用量条页面端**没有任何自取数据的路径**（页面不该有读本地库的能力），
 * 数据只由这里推入 __dianaUsageUpdate(snapshot)。泵一停，条上只剩一个 ⚙。
 *
 * 移植自 Dream-Work-Theme 的 electron/manager/usage-pump.ts，节奏与去重口径一致：
 *   fs.watch 库目录 → 去抖 120ms → 限频 400ms → 读各窗口的 want → 聚合 → 经 CDP 推给每个页面
 *   心跳 30s（不条件强制推一帧）、want 轮询 2s（切会话不写库，只靠心跳会滞后）、
 *   启动斜坡 3/8/15s（注入可能晚于首推）
 *
 * 按本项目的选择：**由 Electron 面板驱动**（开窗启动、关窗停止）；CLI 另有 `pump` 子命令
 * 供无面板时前台常驻。 */

import * as fs from 'fs';
import { CdpSession, fetchTargets, pickRendererTarget } from './cdp';
import { buildUsageSnapshot, usageDbDir, usageDbStamp } from './usage-db';
import type { RendererTarget } from './types';

const ACTIVITY_MIN_MS = 400;   // 活跃时限频：去抖已合并连写风暴，这里只防极端刷屏
const HEARTBEAT_MS = 30000;    // 兜底心跳：防 fs.watch 丢事件后条一直空着
const DEBOUNCE_MS = 120;
const WANT_WATCH_MS = 2000;

interface PumpState {
  urlHint: string;
  watcher: fs.FSWatcher | null;
  heartbeat: NodeJS.Timeout | null;
  wantWatch: NodeJS.Timeout | null;
  debounceTimer: NodeJS.Timeout | null;
  retryTimer: NodeJS.Timeout | null;
  settleTimer: NodeJS.Timeout | null;
  rampTimers: NodeJS.Timeout[];
  busy: boolean;
  lastSpawnAt: number;
  lastStamp: number;
  lastWants: string;
  lastPushAt: number;
  lastSid: string;
}

const pumps = new Map<number, PumpState>();

function log(...args: unknown[]): void {
  console.error('[usage-pump]', ...args);
}

async function listTargets(port: number, urlHint: string): Promise<RendererTarget[]> {
  const targets = await fetchTargets(port, 1500);
  const page = pickRendererTarget(targets, urlHint);
  return page ? [page] : [];
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** 读各窗口当前想看的会话 id（页面把它暴露在 __dianaUsageWant 上） */
async function collectWants(targets: RendererTarget[]): Promise<string[]> {
  const wants: string[] = [];
  for (const target of targets) {
    const session = new CdpSession(target.webSocketDebuggerUrl!);
    try {
      await session.open();
      const value = await withTimeout(session.evaluate(`(window.__dianaUsageWant || '')`), 1500);
      const sid = typeof value === 'string' ? value.trim() : '';
      if (sid && /^[A-Za-z0-9_-]{1,255}$/.test(sid) && !wants.includes(sid)) wants.push(sid);
    } catch { /* 单窗口失败不影响其它 */ } finally {
      session.close();
    }
  }
  return wants;
}

async function pushCycle(port: number, state: PumpState, force = false): Promise<void> {
  const targets = await listTargets(port, state.urlHint);
  if (!targets.length) return;

  const wants = await collectWants(targets);
  const stamp = usageDbStamp();
  const wantsKey = wants.join(',');
  // 数据没变且要看的会话没变 → 跳过（心跳走 force 绕开）
  if (!force && wantsKey === state.lastWants && stamp > 0 && stamp === state.lastStamp) return;

  const now = Date.now();
  if (now - state.lastSpawnAt < ACTIVITY_MIN_MS) {
    scheduleRetry(port, ACTIVITY_MIN_MS - (now - state.lastSpawnAt) + 50);
    return;
  }
  state.lastWants = wantsKey;
  if (stamp) state.lastStamp = stamp;
  state.lastSpawnAt = now;

  const snapshot = buildUsageSnapshot(wants);
  if (!snapshot) return;
  // U+2028/2029 转义：会话标题可能含任意文本，放进表达式字面量有语法风险
  const js = `window.__dianaUsageUpdate && window.__dianaUsageUpdate(${JSON.stringify(snapshot).replace(/[\u2028\u2029]/g, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'))})`;
  for (const target of targets) {
    const session = new CdpSession(target.webSocketDebuggerUrl!);
    try {
      await session.open();
      await withTimeout(session.evaluate(js), 5000);
      state.lastPushAt = Date.now();
      state.lastSid = snapshot.session?.sid ?? '';
    } catch { /* 忽略：下一轮会补 */ } finally {
      session.close();
    }
  }
  /* 追补：轮完成/失败是瞬时状态（页面展示窗只有 8/12 秒），2.5s 后强制再采一次，
   * 保证"完成→跳跃 / 失败→沮丧"一定送达 */
  if (!force) {
    if (state.settleTimer) clearTimeout(state.settleTimer);
    state.settleTimer = setTimeout(() => {
      const current = pumps.get(port);
      if (!current) return;
      current.settleTimer = null;
      void maybeSpawn(port, true);
    }, 2500);
  }
}

function scheduleRetry(port: number, ms: number): void {
  const state = pumps.get(port);
  if (!state) return;
  if (state.retryTimer) clearTimeout(state.retryTimer);
  state.retryTimer = setTimeout(() => {
    const current = pumps.get(port);
    if (!current) return;
    current.retryTimer = null;
    void maybeSpawn(port);
  }, Math.max(50, ms));
}

async function maybeSpawn(port: number, force = false): Promise<void> {
  const state = pumps.get(port);
  if (!state || state.busy) return;
  state.busy = true;
  try {
    await pushCycle(port, state, force);
  } catch (error) {
    log('推送周期失败:', (error as Error).message);
  } finally {
    state.busy = false;
  }
}

function watchDb(port: number): void {
  const state = pumps.get(port);
  if (!state || state.watcher) return;
  try {
    state.watcher = fs.watch(usageDbDir(), (_event, file) => {
      if (file && !/db\.sqlite/.test(file)) return;   // 同时匹配 -wal / -shm
      const current = pumps.get(port);
      if (!current) return;
      if (current.debounceTimer) clearTimeout(current.debounceTimer);
      current.debounceTimer = setTimeout(() => {
        const latest = pumps.get(port);
        if (!latest) return;
        latest.debounceTimer = null;
        void maybeSpawn(port);
      }, DEBOUNCE_MS);
    });
    state.watcher.on('error', () => {
      log('库监听出错，5s 后重挂');
      const current = pumps.get(port);
      if (current?.watcher) {
        try { current.watcher.close(); } catch { /* 已关闭 */ }
        current.watcher = null;
      }
      setTimeout(() => { if (pumps.has(port)) watchDb(port); }, 5000);
    });
    log('已监听', usageDbDir(), '（端口', port + '）');
  } catch (error) {
    log('fs.watch 失败，5s 后重试:', (error as Error).message);
    setTimeout(() => { if (pumps.has(port)) watchDb(port); }, 5000);
  }
}

/** 切会话本身不写库，只靠 30s 心跳会让条滞后很久 —— 每 2s 轻量读一次 want */
async function wantWatchOnce(port: number): Promise<void> {
  const state = pumps.get(port);
  if (!state || state.busy) return;
  const targets = await listTargets(port, state.urlHint).catch(() => []);
  const first = targets[0];
  if (!first) return;
  const session = new CdpSession(first.webSocketDebuggerUrl!);
  try {
    await session.open();
    const value = await withTimeout(session.evaluate(`(window.__dianaUsageWant || '')`), 1200);
    const sid = typeof value === 'string' ? value.trim() : '';
    if (sid && /^[A-Za-z0-9_-]{1,255}$/.test(sid) && !state.lastWants.split(',').includes(sid)) {
      void maybeSpawn(port);
    }
  } catch { /* 忽略 */ } finally {
    session.close();
  }
}

export function startUsagePump(port: number, urlHint = 'renderer/index.html'): void {
  const existing = pumps.get(port);
  if (existing) {
    if (!existing.watcher) watchDb(port);
    return;
  }
  const state: PumpState = {
    urlHint,
    watcher: null, heartbeat: null, wantWatch: null, debounceTimer: null, retryTimer: null,
    settleTimer: null, rampTimers: [], busy: false,
    lastSpawnAt: 0, lastStamp: 0, lastWants: '', lastPushAt: 0, lastSid: '',
  };
  pumps.set(port, state);
  watchDb(port);
  state.heartbeat = setInterval(() => void maybeSpawn(port, true), HEARTBEAT_MS);
  state.wantWatch = setInterval(() => void wantWatchOnce(port), WANT_WATCH_MS);
  // 启动斜坡：注入可能晚于首推，补几帧确保条尽快有数据
  state.rampTimers = [3000, 8000, 15000].map((ms) => setTimeout(() => {
    if (pumps.has(port)) void maybeSpawn(port, true);
  }, ms));
  log('已启动（端口', port + '）：心跳 30s + want 轮询 2s + 去抖 120ms');
  void maybeSpawn(port);   // 启动先推一次
}

export function stopUsagePump(port: number): void {
  const state = pumps.get(port);
  if (!state) return;
  pumps.delete(port);
  if (state.watcher) { try { state.watcher.close(); } catch { /* 已关闭 */ } }
  if (state.heartbeat) clearInterval(state.heartbeat);
  if (state.wantWatch) clearInterval(state.wantWatch);
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  if (state.retryTimer) clearTimeout(state.retryTimer);
  if (state.settleTimer) clearTimeout(state.settleTimer);
  for (const timer of state.rampTimers) clearTimeout(timer);
  log('已停止（端口', port + '）');
}

export function isUsagePumpRunning(port: number): boolean {
  return pumps.has(port);
}

export function usagePumpStatus(port: number): { running: boolean; lastPushAt: number; lastSid: string } {
  const state = pumps.get(port);
  return {
    running: Boolean(state),
    lastPushAt: state?.lastPushAt ?? 0,
    lastSid: state?.lastSid ?? '',
  };
}
