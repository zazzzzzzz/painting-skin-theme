/* 引擎层 · 目标应用（ZCode）的可执行文件定位、本机配置、以调试端口重启。
 *
 * 存在的理由：`--remote-debugging-port` 只在应用**启动时**生效。用户自己双击打开的实例没有调试口，
 * 面板上表现为"注入失败"，而且在应用内部没有任何补救手段（改不了已启动进程的命令行）。
 * 这里把补救做完整：按默认路径（或手动指定的路径）找到 exe → 需要时带调试端口重启。
 *
 * 路径从哪来，优先级从高到低：
 *   1. 本机配置（面板上"选择…"手动指定的，或上一次自动落下来的）—— 存在 ~/.painting-skin-theme/app.json
 *   2. 主题清单里的 app.exePath / app.exePaths（仓库自带的默认值）
 *   3. 内置默认路径（各环境变量拼出的常见安装位置 + 本机实测位置）
 * 不做注册表/快捷方式/全盘扫描 —— 默认路径 + 手动指认已经够用，而且行为可预期。
 *
 * 配置刻意**不**落在主题目录里：主题是仓库里的源文件，把机器相关的绝对路径写进去会污染 git 工作树；
 * 打包后主题目录还在 app.asar 内，根本不可写。所以配置放在用户目录下（可用 DIANA_SKIN_CONFIG 覆盖）。 */

import { execFile, spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { fetchTargets, pickRendererTarget } from './cdp';

export interface TargetAppSpec {
  appId: string;
  processName: string;
  debugPort: number;
  targetUrlHint: string;
  /** 主题清单里写的默认路径（仓库提供的值） */
  exePath?: string;
  exePaths?: string[];
}

export interface ExeCandidate {
  path: string;
  /** 这条路径是怎么来的，面板/CLI 要显示给用户看 */
  source: string;
}

interface TargetConfigEntry {
  exePath: string;
  source: string;
  updatedAt: string;
}

/** 本机实测位置放在最前：装在别的盘/别的目录时用面板上的"选择…"覆盖即可 */
const BUILTIN_DEFAULTS = [
  'D:\\Zcode\\ZCode.exe',
  'D:\\Program Files\\ZCode\\ZCode.exe',
  'D:\\ZCode\\ZCode.exe',
];

export function targetSpecOf(app: {
  id: string;
  debugPort: number;
  targetUrlHint: string;
  processName?: string;
  exePath?: string;
  exePaths?: string[];
}): TargetAppSpec {
  return {
    appId: app.id,
    processName: app.processName || `${app.id}.exe`,
    debugPort: app.debugPort,
    targetUrlHint: app.targetUrlHint,
    exePath: app.exePath,
    exePaths: app.exePaths,
  };
}

/* ---------- 本机配置（不进仓库） ---------- */

export function configPath(): string {
  return process.env.DIANA_SKIN_CONFIG || path.join(os.homedir(), '.painting-skin-theme', 'app.json');
}

export function readConfig(): Record<string, TargetConfigEntry> {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveTargetExe(appId: string, exePath: string, source: string): TargetConfigEntry {
  const file = configPath();
  const config = readConfig();
  const entry: TargetConfigEntry = { exePath, source, updatedAt: new Date().toISOString() };
  config[appId] = entry;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
  return entry;
}

/** 丢掉手动/自动存下来的路径，回到默认路径 */
export function clearTargetExe(appId: string): boolean {
  const file = configPath();
  const config = readConfig();
  if (!config[appId]) return false;
  delete config[appId];
  try {
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    return false;
  }
  return true;
}

/* ---------- 候选路径（默认路径，不做系统扫描） ---------- */

function isExe(file: string): boolean {
  try {
    return /\.exe$/i.test(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** 内置默认路径：先在几个标准安装位置里找，再退到本机实测位置 */
export function defaultPaths(spec: TargetAppSpec): string[] {
  const bare = spec.processName.replace(/\.exe$/i, '');
  const exe = spec.processName;
  const env = process.env;
  const out: string[] = [];
  const push = (...parts: string[]) => { if (parts.every(Boolean)) out.push(path.join(...parts)); };

  if (env.LOCALAPPDATA) {
    push(env.LOCALAPPDATA, 'Programs', bare, exe);
    push(env.LOCALAPPDATA, bare, exe);
  }
  if (env.ProgramFiles) push(env.ProgramFiles, bare, exe);
  if (env['ProgramFiles(x86)']) push(env['ProgramFiles(x86)'], bare, exe);
  for (const fallback of BUILTIN_DEFAULTS) out.push(fallback);

  return out.filter((value, index, all) => all.indexOf(value) === index);
}

/** 按优先级给出**存在**的候选路径（默认只做文件系统判断，很快） */
export function candidatesFor(spec: TargetAppSpec): ExeCandidate[] {
  const found: ExeCandidate[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined, source: string) => {
    if (!value || !isExe(value)) return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ path: value, source });
  };
  /* 有的安装器把可执行文件放在版本子目录里（<装目录>/3.12.3/App.exe），
     Dream-Work-Theme 的解析器也走这一层，这里照做。 */
  const addWithVersions = (dir: string | undefined, source: string) => {
    if (!dir || !fs.existsSync(dir)) return;
    add(dir, source);
    add(path.join(dir, spec.processName), source);
    try {
      if (!fs.statSync(dir).isDirectory()) return;
      const versions = fs.readdirSync(dir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .sort((left, right) => right.name.localeCompare(left.name, undefined, { numeric: true }));
      for (const item of versions) add(path.join(dir, item.name, spec.processName), source);
    } catch { /* 目录读不了就跳过 */ }
  };

  const configured = readConfig()[spec.appId];
  // 标出这条路径原本是从哪来的（默认路径 / 手动指定），不然存进配置之后就看不出区别了
  add(configured?.exePath, configured?.source ? `本机配置 · ${configured.source}` : '本机配置');
  addWithVersions(spec.exePath, '主题清单');
  for (const value of spec.exePaths ?? []) addWithVersions(value, '主题清单');
  for (const value of defaultPaths(spec)) add(value, '默认路径');

  return found;
}

export function resolveTargetApp(spec: TargetAppSpec): ExeCandidate | null {
  return candidatesFor(spec)[0] ?? null;
}

/** 解析路径并在"结果是默认/清单路径"时顺手写进本机配置 —— 这就是自动配置那一步 */
export function resolveAndRemember(spec: TargetAppSpec): ExeCandidate | null {
  const candidate = resolveTargetApp(spec);
  if (candidate && candidate.source !== '本机配置') {
    // 存进配置时把"本机配置 · "前缀去掉，否则下次读出来会一层层套上去
    const origin = candidate.source.replace(/^本机配置 · /, '');
    try { saveTargetExe(spec.appId, candidate.path, origin); } catch { /* 配置目录不可写时不影响本次使用 */ }
  }
  return candidate;
}

/** 面板要显示/判断的全部信息：路径从哪来、有没有在跑、调试端口通不通 */
export async function describeTargetApp(spec: TargetAppSpec): Promise<Record<string, unknown>> {
  const quick = candidatesFor(spec);
  const configured = readConfig()[spec.appId];
  return {
    appId: spec.appId,
    processName: spec.processName,
    port: spec.debugPort,
    exePath: quick[0]?.path ?? configured?.exePath ?? null,
    source: quick[0]?.source ?? (configured ? '本机配置（该文件已不存在）' : null),
    defaults: defaultPaths(spec),
    running: await isProcessRunning(spec.processName),
    endpointReady: await probeDebugEndpoint(spec, 1200),
    configPath: configPath(),
  };
}

/* ---------- 运行状态与调试端口 ---------- */

/** 调试端口候选：主端口被别的进程占住时，CDP 会**静默**绑定失败 ——
 *  应用照常起来、界面照常用，就是没有调试口，于是"重启完还是注入不上去"。
 *  所以按 Dream-Work-Theme 的做法准备备选端口，下面挑第一个能绑的用。
 *  注入侧也必须用同一份候选（见 injector 的 applySkin），否则重启到备选端口后就找不到了。 */
export function debugPortCandidates(spec: { debugPort: number }): number[] {
  return [spec.debugPort, 9333, 9345].filter((value, index, all) => all.indexOf(value) === index);
}

/** 挑一个能绑上的端口（绑一下再关，Dream-Work-Theme 的 findAvailablePort 同款） */
export function findFreePort(candidates: number[]): Promise<number | null> {
  return new Promise((resolve) => {
    const attempt = (index: number) => {
      if (index >= candidates.length) { resolve(null); return; }
      const port = candidates[index];
      const server = net.createServer();
      server.once('error', () => { try { server.close(); } catch { /* 已关 */ } attempt(index + 1); });
      server.once('listening', () => { server.close(); resolve(port); });
      server.listen(port, '127.0.0.1');
    };
    attempt(0);
  });
}

/** CDP 是否已经活着（只看 /json/version，不要求渲染页已经出现 —— 那是注入阶段的事） */
export async function probeCdpVersion(port: number, timeoutMs = 1500): Promise<boolean> {
  const previous = { http: process.env.HTTP_PROXY, https: process.env.HTTPS_PROXY, all: process.env.ALL_PROXY };
  delete process.env.HTTP_PROXY; delete process.env.HTTPS_PROXY; delete process.env.ALL_PROXY;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  } finally {
    if (previous.http !== undefined) process.env.HTTP_PROXY = previous.http;
    if (previous.https !== undefined) process.env.HTTPS_PROXY = previous.https;
    if (previous.all !== undefined) process.env.ALL_PROXY = previous.all;
  }
}

export async function isProcessRunning(processName: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FI', `IMAGENAME eq ${processName}`, '/FO', 'CSV', '/NH'],
      { timeout: 15_000, windowsHide: true },
      (error, stdout) => {
        if (error) { resolve(false); return; }
        resolve(String(stdout || '').toLowerCase().includes(processName.toLowerCase()));
      });
  });
}

/** 调试端点是否已经可用（可用就不需要重启了） */
export async function probeDebugEndpoint(spec: TargetAppSpec, timeoutMs = 2500): Promise<boolean> {
  const targets = await fetchTargets(spec.debugPort, timeoutMs);
  return Boolean(pickRendererTarget(targets, spec.targetUrlHint));
}

function waitForPortClosed(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.createConnection(port, '127.0.0.1');
      const done = (open: boolean) => {
        socket.destroy();
        if (!open) { resolve(true); return; }
        if (Date.now() - start >= timeoutMs) { resolve(false); return; }
        setTimeout(attempt, 250);
      };
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.setTimeout(600, () => done(true));
    };
    attempt();
  });
}

export interface RelaunchResult {
  ok: boolean;
  exePath: string | null;
  source: string | null;
  port: number;
  steps: string[];
  error?: string;
}

/** 进度回调：第二个参数是给面板按钮用的短标签（steps 里的原文太长，放不进按钮） */
export type StepReporter = (step: string, label?: string) => void;

/** 拉起目标应用时的环境：**必须清掉"让 Electron 以纯 Node 跑"的那几个变量**。
 *
 *  面板与 CLI 之间的约定是用应用自身的 Electron 当 Node（main.ts 里往子进程环境塞
 *  ELECTRON_RUN_AS_NODE=1），这个变量会被一路继承到我们 spawn 的目标应用上 ——
 *  于是 ZCode 以纯 Node 启动：不开界面、不看命令行参数、立刻报错退出。
 *  实测（.verify/env-inherit-ab.js）：继承时 Electron 应用跑 main.js 当脚本执行，
 *  `require('electron').ipcMain` 是 undefined，秒退；清掉后 GUI 正常常驻。
 *  表现是"看起来重启了但调试端口永远不出现"，白等满超时。Dream-Work-Theme 的启动器同样要清这几个。 */
function launchEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'ELECTRON_RENDERER_URL',
    'ELECTRON_NO_ATTACH_CONSOLE',
    'VITE_DEV_SERVER_URL',
    'MAIN_VITE_DEV_SERVER_URL',
    'NODE_OPTIONS',
  ]) delete env[key];
  return env;
}

/** 重启过程写一份日志：这类"目标应用没起来"的问题，没有日志就只能靠猜 */
function appendLog(line: string): void {
  try {
    const file = path.join(path.dirname(configPath()), 'relaunch.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${line}\n`, 'utf-8');
  } catch { /* 日志写不进去不影响主流程 */ }
}

/** 关闭正在运行的实例（连同进程树），再用调试端口拉起来，等 CDP 真正就绪 */
export async function relaunchWithDebugPort(
  spec: TargetAppSpec,
  timeoutMs = 45_000,
  onStep?: StepReporter,
): Promise<RelaunchResult> {
  const steps: string[] = [];
  const result: RelaunchResult = { ok: false, exePath: null, source: null, port: spec.debugPort, steps };
  const report: StepReporter = (step, label) => {
    steps.push(step);
    appendLog(step);
    try { onStep?.(step, label); } catch { /* 面板不在也不影响重启 */ }
  };

  appendLog(`--- relaunch 开始：port=${spec.debugPort} processName=${spec.processName} ---`);
  if (await probeDebugEndpoint(spec, 1200)) {
    report(`调试端点 ${spec.debugPort} 已就绪，无需重启`, '调试端口已就绪');
    return { ...result, ok: true };
  }

  const target = resolveAndRemember(spec);
  if (!target) {
    report('默认路径下没有找到可执行文件');
    return {
      ...result,
      error: `未找到 ${spec.processName}，默认路径里都没有；请用面板上的"选择…"手动指定（默认：${defaultPaths(spec)[0]}）`,
    };
  }
  result.exePath = target.path;
  result.source = target.source;
  report(`目标应用：${target.path}（来源：${target.source}）`, '找到 ZCode');

  const running = await isProcessRunning(spec.processName);
  if (running) {
    report(`关闭正在运行的 ${spec.processName}（含进程树）`, '正在关闭 ZCode…');
    await new Promise<void>((resolve) => {
      execFile('taskkill.exe', ['/T', '/F', '/IM', spec.processName], { timeout: 20_000, windowsHide: true }, () => resolve());
    });
    // 端口没释放就 spawn 的话，新实例会因为单实例锁/端口占用直接退出
    const closed = await waitForPortClosed(spec.debugPort, 20_000);
    report(closed ? `端口 ${spec.debugPort} 已释放` : `端口 ${spec.debugPort} 仍未释放（继续尝试启动）`, '端口已释放');
  } else {
    report('当前没有运行中的实例', '当前没有运行中的实例');
  }

  /* 端口得确保能绑上：被别的进程占着时 CDP 是静默失败的，表现就是"重启完还是没有调试口" */
  const port = await findFreePort(debugPortCandidates(spec));
  if (!port) {
    report(`候选端口都不可用：${debugPortCandidates(spec).join('/')}`);
    return { ...result, error: `候选调试端口都被占用（${debugPortCandidates(spec).join('/')}），无法带调试口启动` };
  }
  if (port !== spec.debugPort) report(`端口 ${spec.debugPort} 被占用，改用 ${port}`, `改用端口 ${port}`);
  result.port = port;

  let exited: number | null = null;
  try {
    const child = spawn(target.path, [`--remote-debugging-port=${port}`], {
      cwd: path.dirname(target.path),
      detached: true,
      stdio: 'ignore',
      env: launchEnv(),          // ← 清掉 ELECTRON_RUN_AS_NODE 等，否则应用会当 Node 跑一下就退出
      windowsHide: false,
    });
    child.once('exit', (code) => { exited = code ?? -1; });
    child.unref();
    report(`已启动：--remote-debugging-port=${port}`, '正在启动 ZCode…');
  } catch (error) {
    report(`启动失败：${(error as Error).message}`);
    return { ...result, error: `启动失败：${(error as Error).message}` };
  }

  /* 就绪判定分两步，照 Dream-Work-Theme 的口径：
     ① 只要 /json/version 通了就算"起来了" —— 不要求渲染页已经出现（那是注入阶段会轮询的）；
     ② 渲染页由 applySkin 自己轮询找（它本来就带候选端口与超时）。 */
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probeCdpVersion(port, 1200)) {
      report(`CDP 就绪，用时 ${((Date.now() - start) / 1000).toFixed(1)}s（端口 ${port}）`, '调试端口已就绪');
      return { ...result, ok: true };
    }
    if (exited !== null && Date.now() - start > 1500) {
      // 再给 3s 宽限：部分应用会先退出再由别的进程接管界面
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (await probeCdpVersion(port, 1200)) {
        report('CDP 就绪（启动器交接后）', '调试端口已就绪');
        return { ...result, ok: true };
      }
      report(`目标应用启动后立刻退出（退出码 ${exited}）`);
      return {
        ...result,
        error: `目标应用启动后立刻退出（退出码 ${exited}）——通常是启动环境被污染或单实例锁未释放，详见 ${path.join(path.dirname(configPath()), 'relaunch.log')}`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  report(`等待 ${(timeoutMs / 1000).toFixed(0)}s 仍未就绪`);
  return { ...result, error: `等待调试端口超时（${(timeoutMs / 1000).toFixed(0)}s）。详见 ${path.join(path.dirname(configPath()), 'relaunch.log')}` };
}
