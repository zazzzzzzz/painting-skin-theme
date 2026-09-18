/* 应用外壳 · Electron 主进程。
 *
 * 面板做成启动器那种"手裁板"界面的风格（参照 diana-multi-app-launcher 的打包程序）：
 * 不规则板形 + 板中央是**当前皮肤的立绘** + 底部按钮 deck + 板外状态卡。
 * 皮肤与宠物各一个"切到下一个"的循环按钮 —— 按现有顺序轮换，不列列表。
 *
 * **主进程不碰 CDP，也不读库**，只做两件事：起停子进程、转发面板请求。
 * 原因是 Electron 33 = Node 20.18：既没有全局 WebSocket（CDP 连不上，而且失败是静默的），
 * 也没有 node:sqlite（读库会在加载期直接崩）。这两样都由跑在系统 Node 上的 CLI 子进程承担。 */

import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
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

ipcMain.handle('panel:set-mode', async (_event, mode: PanelState['mode']) => {
  panelState.mode = mode;
  const snapshot = await panelSnapshot();
  const current = currentSkinOf(snapshot);
  if (!current) return { error: '没有可用主题' };
  const applied = await runCli(['apply', '--skin', current.id, '--mode', mode], 150_000);
  return { applied: applied.ok ? applied.data : { ok: false, error: applied.error }, ...(await panelSnapshot()) };
});

ipcMain.handle('panel:apply', async () => {
  const snapshot = await panelSnapshot();
  const current = currentSkinOf(snapshot);
  if (!current) return { error: '没有可用主题' };
  const applied = await runCli(['apply', '--skin', current.id, '--mode', panelState.mode], 150_000);
  return { applied: applied.ok ? applied.data : { ok: false, error: applied.error }, ...(await panelSnapshot()) };
});

ipcMain.handle('panel:remove', async () => {
  const snapshot = await panelSnapshot();
  const current = currentSkinOf(snapshot);
  const removed = await runCli(['remove', '--skin', current?.id ?? ''], 60_000);
  return { removed: removed.ok ? removed.data : { ok: false, error: removed.error }, ...(await panelSnapshot()) };
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
    width: 620,
    height: 745,
    // 透明窗口：板子是不规则形状，若窗口本身仍是不透明矩形，外面就必然留一圈方形边框。
    // transparent + frame:false 之后，只有板子与卡片自己的形状可见，其余区域透出桌面。
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
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
