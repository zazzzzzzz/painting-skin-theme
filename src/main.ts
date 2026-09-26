/* 应用外壳 · Electron 主进程。
 *
 * 面板界面 = Superdesign C1 v8「情报页 · 抽屉」：左列整身动态立绘（webm alpha），
 * 中列抽屉条（5 格缩略图，点格直接换肤），底栏 明暗三态 / 桌宠 / ZCode 路径 / 注入动作。
 *
 * **主进程不碰 CDP，也不读库**，只做两件事：起停子进程、转发面板请求。
 * 原因是 Electron 33 = Node 20.18：既没有全局 WebSocket（CDP 连不上，而且失败是静默的），
 * 也没有 node:sqlite（读库会在加载期直接崩）。这两样都由跑在系统 Node 上的 CLI 子进程承担。 */

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { execFile, spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
/** 子进程的 cwd 必须是**真实目录**：打包后 PROJECT_ROOT 指向 app.asar，那是虚拟路径、
 *  不是文件系统里的目录；拿它当 cwd 会让 spawn 失败，而且报出来是 exe 的 ENOENT（实测）。 */
const SPAWN_CWD = PROJECT_ROOT.includes('.asar') ? path.dirname(PROJECT_ROOT) : PROJECT_ROOT;
const CLI = path.join(PROJECT_ROOT, 'dist', 'cli.js');
/** 子进程用哪个运行时跑：**默认用应用自己的可执行文件**（Electron 43 自带 Node 24.18，
 *  含 WebSocket 与 node:sqlite），配合 ELECTRON_RUN_AS_NODE=1 就是一个完整的 Node。
 *  这样打包后不依赖用户机器上装了 Node，也不必额外塞一个 node.exe。
 *  DIANA_SKIN_NODE 可覆盖成某个具体的 node。 */
const NODE_BIN = process.env.DIANA_SKIN_NODE || process.execPath;
const NODE_ENV_EXTRA = process.env.DIANA_SKIN_NODE ? {} : { ELECTRON_RUN_AS_NODE: '1' };
/** 应用图标：自己生成的（不是 Electron 默认图标），窗口与托盘共用 */
const ICON = path.join(PROJECT_ROOT, 'assets', 'icon.png');

interface PanelState {
  skinId: string;
  mode: 'auto' | 'dark' | 'light';
}

const panelState: PanelState = { skinId: '', mode: 'auto' };
let pumpChild: ChildProcess | null = null;
let pumpStartedAt = 0;
let tray: Tray | null = null;
let isQuitting = false;

/** 跑一次 CLI 并解析它的 JSON 输出（CLI 的每个命令都输出 JSON） */
function runCli(args: string[], timeoutMs = 90_000): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    execFile(NODE_BIN, [CLI, ...args], {
      cwd: SPAWN_CWD,
      env: { ...process.env, ...NODE_ENV_EXTRA },
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const text = String(stdout || '').trim();
      if (!text) {
        resolve({ ok: false, error: (error?.message || String(stderr || '')).slice(0, 300) || 'CLI 没有输出' });
        return;
      }
      try {
        resolve({ ok: true, data: JSON.parse(text) });
      } catch {
        resolve({ ok: false, error: `CLI 输出不是 JSON：${text.slice(0, 200)}` });
      }
    });
  });
}

/** 跑一次 CLI 并把 stderr 上的进度行实时转发出去（用于"重启并注入"这种要等十几秒的操作）。
 *  CLI 约定：进度行形如 `PROGRESS <短语>`，stdout 仍然只放最终 JSON。 */
function runCliStreaming(args: string[], onProgress: (text: string) => void, timeoutMs = 240_000): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(NODE_BIN, [CLI, ...args], {
      cwd: SPAWN_CWD,
      env: { ...process.env, ...NODE_ENV_EXTRA },
      windowsHide: true,
    });
    let stdout = '';
    let stderrTail = '';
    const timer = setTimeout(() => { try { child.kill(); } catch { /* 已退出 */ } }, timeoutMs);
    child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr?.on('data', (chunk) => {
      for (const raw of String(chunk).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('PROGRESS ')) { try { onProgress(line.slice(9).trim()); } catch { /* 面板已关 */ } }
        else stderrTail = (stderrTail + line).slice(-300);
      }
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on('exit', () => {
      clearTimeout(timer);
      const text = stdout.trim();
      if (!text) { resolve({ ok: false, error: stderrTail || 'CLI 没有输出' }); return; }
      try {
        resolve({ ok: true, data: JSON.parse(text) });
      } catch {
        resolve({ ok: false, error: `CLI 输出不是 JSON：${text.slice(0, 200)}` });
      }
    });
  });
}

async function panelSnapshot(): Promise<Record<string, unknown>> {
  const result = await runCli(['panel'], 60_000);
  if (!result.ok) return { error: result.error };
  const data = result.data as Record<string, unknown>;
  const skins = (data.skins as Array<{ id: string }>) ?? [];
  if (typeof data.skinIndex === 'number' && skins[data.skinIndex]) panelState.skinId = skins[data.skinIndex].id;
  // mode 是面板自己的状态（页面里只反映 dark/light，观察不到 auto），由主进程并进去
  return { ...data, mode: panelState.mode, pid: process.pid };
}

/* ---------- 用量泵：跑在子进程里，面板只负责起停与看状态 ---------- */
function startPumpChild(): void {
  if (pumpChild && !pumpChild.killed) return;
  try {
    pumpChild = spawn(NODE_BIN, [CLI, 'pump'], { cwd: SPAWN_CWD, env: { ...process.env, ...NODE_ENV_EXTRA }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    pumpStartedAt = Date.now();
    pumpChild.stderr?.on('data', () => undefined);   // 子进程日志不往面板里灌
    pumpChild.on('exit', () => { pumpChild = null; });
  } catch {
    pumpChild = null;
  }
}

function stopPumpChild(): void {
  if (!pumpChild) return;
  try { pumpChild.kill(); } catch { /* 已退出 */ }
  pumpChild = null;
}

/** 当前皮肤（以 CLI 报的"实际已注入"为准，面板不自己记） */
function currentSkinOf(snapshot: Record<string, unknown>): { id: string } | null {
  const skins = (snapshot.skins as Array<{ id: string }>) ?? [];
  return skins[Number(snapshot.skinIndex ?? 0)] ?? null;
}

/* ---------- IPC ---------- */

ipcMain.handle('panel:snapshot', async () => {
  try {
    return await panelSnapshot();
  } catch (error) {
    return { error: (error as Error).message };
  }
});

/* 切到下一个皮肤：按 CLI 报的顺序循环（不列列表），并立刻注入 —— 不重启目标应用 */
ipcMain.handle('panel:cycle-skin', async (_event, step: number) => {
  const snapshot = await panelSnapshot();
  if (snapshot.error) return snapshot;
  const skins = (snapshot.skins as Array<{ id: string }>) ?? [];
  if (!skins.length) return { error: '没有可用主题' };
  const index = Number(snapshot.skinIndex ?? 0);
  const next = skins[(index + (step >= 0 ? 1 : -1) + skins.length) % skins.length];
  const applied = await runCli(['apply', '--skin', next.id, '--mode', panelState.mode], 150_000);
  panelState.skinId = next.id;
  return { applied: applied.ok ? applied.data : { ok: false, error: applied.error }, ...(await panelSnapshot()) };
});

/* 切到下一个宠物：同样循环，'none' 也在序列里 */
ipcMain.handle('panel:cycle-pet', async (_event, step: number) => {
  const snapshot = await panelSnapshot();
  if (snapshot.error) return snapshot;
  const pets = (snapshot.pets as Array<{ id: string }>) ?? [];
  if (!pets.length) return { error: '没有可用宠物' };
  const index = Number(snapshot.petIndex ?? 0);
  const next = pets[(index + (step >= 0 ? 1 : -1) + pets.length) % pets.length];
  const selected = await runCli(['pet', next.id], 60_000);
  return { selected: selected.ok ? selected.data : { ok: false, error: selected.error }, ...(await panelSnapshot()) };
});

/** 当前该用哪个主题：优先用主进程记住的那个（进面板时由 panelSnapshot 填过），
 *  只有不知道时才去问 CLI。每次操作前都取一次快照的代价不小：目标应用没带调试口时，
 *  快照里的每个探测都要等超时，点一下先白等好几秒 —— 这是"点了像卡死"的一大来源。 */
async function ensureSkinId(): Promise<string | null> {
  if (panelState.skinId) return panelState.skinId;
  const snapshot = await panelSnapshot();
  const current = currentSkinOf(snapshot);
  if (current) panelState.skinId = current.id;
  return current?.id ?? null;
}

ipcMain.handle('panel:set-mode', async (_event, mode: PanelState['mode']) => {
  panelState.mode = mode;
  const skinId = await ensureSkinId();
  if (!skinId) return { error: '没有可用主题' };
  const applied = await runCli(['apply', '--skin', skinId, '--mode', mode], 150_000);
  return { applied: applied.ok ? applied.data : { ok: false, error: applied.error }, ...(await panelSnapshot()) };
});

/* 注入只发生在主按钮：它把面板当前**预选**的皮肤 id 带上来（点选只是预览，不注入），
   没带 id 才回落到"实际已注入"的那只。 */
ipcMain.handle('panel:apply', async (_event, id?: string) => {
  const skinId = (typeof id === 'string' && id) ? id : await ensureSkinId();
  if (!skinId) return { error: '没有可用主题' };
  const applied = await runCli(['apply', '--skin', skinId, '--mode', panelState.mode], 150_000);
  panelState.skinId = skinId;
  return { applied: applied.ok ? applied.data : { ok: false, error: applied.error }, ...(await panelSnapshot()) };
});

ipcMain.handle('panel:remove', async () => {
  const skinId = await ensureSkinId();
  const removed = await runCli(['remove', '--skin', skinId ?? ''], 60_000);
  return { removed: removed.ok ? removed.data : { ok: false, error: removed.error }, ...(await panelSnapshot()) };
});

/* 恢复默认路径：丢掉手动指定的 exe，按默认路径重新解析并写进本机配置 */
ipcMain.handle('panel:defaults', async () => {
  const resolved = await runCli(['defaults', '--reset'], 30_000);
  return { resolved: resolved.ok ? resolved.data : { ok: false, error: resolved.error }, ...(await panelSnapshot()) };
});

/* 手动指定：弹系统的文件对话框选 exe，选完存进本机配置（覆盖自动扫描的结果） */
ipcMain.handle('panel:pick-exe', async () => {
  const snapshot = await panelSnapshot();
  const appInfo = snapshot.app as { exePath?: string | null } | undefined;
  const current = appInfo?.exePath ?? null;
  const picked = await dialog.showOpenDialog({
    title: '选择 ZCode 的可执行文件',
    defaultPath: current ? path.dirname(current) : undefined,
    filters: [{ name: '可执行文件', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || !picked.filePaths[0]) return { canceled: true, ...(await panelSnapshot()) };
  const saved = await runCli(['setexe', picked.filePaths[0]], 30_000);
  return {
    saved: saved.ok ? saved.data : { ok: false, error: saved.error },
    picked: picked.filePaths[0],
    ...(await panelSnapshot()),
  };
});

/* 以调试端口重启目标应用并立刻注入，注入的是面板**预选**的皮肤。
 * 之所以由面板自己发起：重启会结束目标应用（连带结束里面正在跑的会话），
 * 这个过程必须由用户在面板上明确点一下，不能塞进普通注入里悄悄做。
 *
 * 三处刻意为之（都是"点了像卡死"的来源，实测过一次）：
 *   · 一次子进程搞定 —— CLI 用 --panel-state 把面板状态一起带回来，不再前后各取一次快照；
 *   · 进度实时转发 —— 重启要等应用真正启动，按钮上得看得见在做什么；
 *   · 不预先取快照 —— 目标应用没带调试口时，每个探测都要等超时，点一下先白等好几秒。 */
ipcMain.handle('panel:relaunch-apply', async (event, id?: string) => {
  const skinId = (typeof id === 'string' && id) ? id : await ensureSkinId();
  if (!skinId) return { error: '没有可用主题' };
  const result = await runCliStreaming(
    ['relaunch', '--skin', skinId, '--mode', panelState.mode, '--apply', '--progress', '--panel-state'],
    (text) => { try { event.sender.send('panel:progress', text); } catch { /* 面板已关 */ } },
  );
  const data = result.ok ? (result.data as { relaunched?: unknown; applied?: unknown; panel?: Record<string, unknown> }) : null;
  if (data) panelState.skinId = skinId;
  return {
    relaunched: data?.relaunched ?? { ok: false, error: result.error },
    applied: data?.applied ?? null,
    ...(data?.panel ?? await panelSnapshot()),
  };
});

ipcMain.handle('panel:toggle-pump', (_event, enabled: boolean) => {
  if (enabled) startPumpChild();
  else stopPumpChild();
  return { running: Boolean(pumpChild && !pumpChild.killed), port: 9344, since: pumpStartedAt };
});

/* 无系统标题栏，面板自带的 − × 走这里 */
ipcMain.handle('panel:window', (event, action: 'minimize' | 'close') => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return null;
  if (action === 'minimize') window.minimize();
  // 关闭 = 收进系统托盘，不退出：注入与用量泵还在跑，退出会中断它们
  else window.hide();
  return true;
});

function showPanel(): void {
  const windows = BrowserWindow.getAllWindows();
  if (!windows.length) { createWindow(); return; }
  windows[0].show();
  windows[0].focus();
}

function createTray(): void {
  if (tray) return;
  let image = nativeImage.createEmpty();
  try {
    image = nativeImage.createFromPath(ICON);
  } catch { /* 图标缺失时退化为空图，托盘仍可用 */ }
  try {
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }));
  } catch {
    tray = null;
    return;
  }
  tray.setToolTip('Painting Skin Theme');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示面板', click: showPanel },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showPanel);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: 'Painting Skin Theme',
    // 不要默认 Electron 图标
    icon: fs.existsSync(ICON) ? ICON : undefined,
    // C1 v8 的画布规格：1080×720，左列 500px 立绘 + 抽屉条 + 72px 底栏。
    // 允许缩放：面板是流式布局（左列定宽、抽屉条与底栏随窗口伸缩），放大缩小都不破版。
    width: 1080,
    height: 720,
    // C1 v8 是不透明满幅界面，透明窗口已无形状意义（那是旧异形板的需求）；且透明窗口在
    // Windows 上视频帧走独立合成路径不上屏（实测 <video> 播放中但画面全透明），关闭后视频正常。
    transparent: false,
    frame: false,
    hasShadow: true,
    backgroundColor: '#171718',   // 内容加载前先铺底色，避免白闪
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      // 面板是本地自带页面，不存在远端内容；为了少一层 preload 脚手架直接开 node。
      // 若以后要加载远端页面，必须改回 contextIsolation + preload。
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  void window.loadFile(path.join(PROJECT_ROOT, 'src', 'panel.html'));
  return window;
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startPumpChild();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 关闭按钮只是隐藏窗口；只有从托盘菜单退出才真正结束
  if (isQuitting) {
    stopPumpChild();
    if (process.platform !== 'darwin') app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopPumpChild();
  try { tray?.destroy(); } catch { /* 已销毁 */ }
  tray = null;
});
