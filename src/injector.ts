/* 引擎层 · 注入器（合并的核心）。
 *
 * 皮肤样式层：原样取自 Diana Multi-App Launcher 的 theme-packs/zcode
 *   - skin/theme.css                 日夜双套 token + 组件钩子 + 美术覆盖层 + 消息导轨
 *   - skin/runtime-template.js       页面端运行时（几何定位工作区/前景/导轨，挂 11 节点美术层）
 *   - assets/*.png                   10 张形状蒙版/立绘
 *
 * 注入机制：取自 Dream-Work-Theme
 *   - 挂到运行中的实例（不接管启动、不改安装目录、不开新端口）
 *   - 把 CSS 与素材打成 payload，经 CDP Runtime.evaluate 一次性执行
 *   - 注入后逐项复核结构，而不是把"求值没报错"当作"皮肤生效"
 *
 * 两侧的接缝就是 Diana 运行时定义的 payload 契约：
 *   { adapterVersion, requestedTheme, css, assets: { <角色名>: dataURL } }
 * 由 __DIANA_PAYLOAD_BASE64__ 占位符注入，运行时自带 disable() 可完整回退。 */

import * as fs from 'fs';
import * as path from 'path';
import { CdpSession, fetchTargets, pickRendererTarget } from './cdp';
import { debugPortCandidates } from './target-app';
import { listSkins, loadSkin, readAssetDataUrl, readText, type SkinEntry } from './theme-store';
import { buildUsageBarScript } from './usage-bar';
import { buildPetScript, getPetRegistry, petSelectExpression } from './pet';
import type { ApplyResult, SkinMode, SkinStatus } from './types';

/* 读库用的是 node:sqlite，而 **Electron 33（Node 20.18）没有这个内置模块** ——
 * 静态引入会让面板主进程一加载就崩（实测 `No such built-in module: node:sqlite`）。
 * 所以这里惰性加载并兜住异常：注入器在系统 Node（24，有 node:sqlite）下能推首帧快照；
 * 在 Electron 里则跳过首帧，数据交给子进程泵去推。 */
function loadSnapshotBuilder(): ((forceSids?: string[]) => unknown) | null {
  try {
    const mod = require('./usage-db') as { buildUsageSnapshot?: (forceSids?: string[]) => unknown };
    return typeof mod.buildUsageSnapshot === 'function' ? mod.buildUsageSnapshot : null;
  } catch {
    return null;
  }
}

export { listSkins } from './theme-store';
export type { SkinEntry } from './theme-store';

/* 探测超时：面板一次快照要连着开几次 CDP（状态 / 宠物 / 已注入皮肤），
 * 主机繁忙时 1.5s 会假性失败（实测：面板显示未挂载而实际已注入）。 */
const PROBE_TIMEOUT_MS = 1500;

/** 运行时的复核项：结构与 Diana 适配器 verify 命令同口径 */
interface MountReport {
  mounted: boolean;
  adapterVersion?: string;
  rootTheme?: string;
  rail?: { count: number; profile: string } | null;
  workspace?: { left: number; top: number; width: number; height: number } | null;
}

export function buildPayloadExpression(skin: SkinEntry, mode: SkinMode): string {
  const { manifest, dir } = skin;
  const assets: Record<string, string> = {};
  for (const [role, file] of Object.entries(manifest.assets)) {
    assets[role] = readAssetDataUrl(dir, file);
  }
  const payload = {
    adapterVersion: manifest.adapterVersion,
    requestedTheme: mode,
    css: readText(dir, manifest.skin.css),
    assets,
  };
  const template = readText(dir, manifest.skin.runtime);
  const placeholder = '__DIANA_PAYLOAD_BASE64__';
  if (!template.includes(placeholder)) {
    throw new Error(`运行时模板缺少占位符 ${placeholder}`);
  }
  return template.replace(placeholder, Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64'));
}

/** 复核表达式：与 Diana 的 verify 同口径，额外回报够我们诊断的细节。
 *  导轨依赖宿主后续渲染 + 运行时的有界重试，先轮询等它就位（出现即继续，最多 3.5s），
 *  否则会把"还没挂上"误报成失败。 */
function verifyExpression(adapterVersion: string): string {
  return `(async () => {
  const deadline = performance.now() + 3500;
  while (performance.now() < deadline) {
    if (globalThis.__DIANA_ZCODE_THEME__?.rail || document.querySelector('.diana-zcode-message-rail')) break;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  const controller = globalThis.__DIANA_ZCODE_THEME__;
  const chrome = document.getElementById('diana-zcode-chrome');
  const style = document.getElementById('diana-zcode-runtime-style');
  const workspace = document.querySelector("[data-diana-zcode-workspace='true']");
  const foreground = document.querySelector('.diana-zcode-foreground');
  const rect = workspace?.getBoundingClientRect();
  const pointTarget = rect
    ? document.elementFromPoint(Math.max(0, rect.right - 24), Math.max(0, rect.bottom - 24))
    : null;
  const character = document.querySelector('.diana-zcode-character');
  const characterPaint = character ? getComputedStyle(character).backgroundImage : 'none';
  const rail = document.querySelector('.diana-zcode-message-rail');
  const railTick = rail ? rail.querySelector('button > span') : null;
  const railTickColor = railTick ? getComputedStyle(railTick).backgroundColor : null;
  const focusTarget = workspace
    ? [...workspace.querySelectorAll("textarea:not(:disabled), button:not(:disabled), input:not(:disabled), [tabindex='0']")]
        .find((element) => {
          const bounds = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return bounds.width > 0 && bounds.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
    : null;
  let keyboardReachable = false;
  if (focusTarget instanceof HTMLElement) {
    const previous = document.activeElement;
    focusTarget.focus({ preventScroll: true });
    keyboardReachable = document.activeElement === focusTarget;
    focusTarget.blur();
    if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
  }
  return {
    controllerPresent: Boolean(controller),
    adapterMatches: controller?.adapterVersion === ${JSON.stringify(adapterVersion)},
    host: document.documentElement.classList.contains('diana-zcode-host'),
    rootTheme: document.documentElement.classList.contains('theme-zai-light') ? 'light' : 'dark',
    styleCount: style ? 1 : 0,
    chromeCount: chrome ? 1 : 0,
    foregroundCount: foreground ? 1 : 0,
    artworkNodeCount: chrome ? chrome.querySelectorAll('span').length : 0,
    artworkResolved: Boolean(character && characterPaint && characterPaint !== 'none'),
    railPaint: rail ? Boolean(railTickColor && railTickColor !== 'rgba(0, 0, 0, 0)' && railTickColor !== 'transparent') : true,
    pointerSafe: Boolean(chrome && getComputedStyle(chrome).pointerEvents === 'none'),
    pointPassesThrough: Boolean(pointTarget && !chrome?.contains(pointTarget)),
    keyboardReachable,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    workspace: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
    rail: controller?.railStats ?? null,
  };
})()`;
}

const DISABLE_EXPRESSION = `(() => {
  const controller = globalThis.__DIANA_ZCODE_THEME__;
  if (controller && typeof controller.disable === 'function') return controller.disable();
  document.getElementById('diana-zcode-runtime-style')?.remove();
  document.getElementById('diana-zcode-chrome')?.remove();
  document.documentElement.classList.remove('diana-zcode-host');
  return { disabled: true, fallback: true };
})()`;

/** 拆掉已有的用量条实例。
 *  为什么必须显式拆：页面端脚本开头有防重入（已存在就直接 return），
 *  否则重注入是空操作 —— 旧实例的 rAF 循环还在跑旧代码，改了定位/样式也不会生效。 */
async function teardownExtras(session: CdpSession): Promise<void> {
  await session.evaluate(`(() => {
    window.__dianaUsageGen = (window.__dianaUsageGen || 0) + 1;   // 让旧实例的所有回调失效
    for (const id of ['diana-usage-bar', 'diana-usage-tip', 'diana-usage-exc']) {
      document.getElementById(id)?.remove();
    }
    clearInterval(window.__dianaPetTimer);
    delete window.__dianaPetTimer;
    document.getElementById('diana-skin-pet-host')?.remove();
    delete window.__dianaUsageBar;
    delete window.__dianaUsageUpdate;
    delete window.__dianaUsageWant;
    return true;
  })()`).catch(() => undefined);
}

/* 用量条与宠物：这两个是**功能**而不是皮肤内容（源项目里也挂在注入器上），
 * 所以独立注入、独立复核，失败也不影响皮肤本身的 ok。
 * 用量条的数据由 usage-pump 持续推入；这里只负责把脚本装上、并推第一帧，
 * 让"注入完就能看到数字"而不是等到下一次库写入。 */
async function injectExtras(session: CdpSession): Promise<NonNullable<ApplyResult['extra']>> {
  const result: NonNullable<ApplyResult['extra']> = { usageBar: null, pet: null };
  try {
    await teardownExtras(session);
    await session.evaluate(buildUsageBarScript());
    let todayTotal = 0;
    let pushed = false;
    try {
      const buildSnapshot = loadSnapshotBuilder();
      const snapshot = buildSnapshot ? (buildSnapshot([]) as { today?: { total?: number }; session?: unknown } | null) : null;
      if (snapshot) {
        todayTotal = Number((snapshot.today as { total?: number } | undefined)?.total ?? 0);
        // U+2028/2029 转义：会话标题可能含任意文本，塞进表达式字面量会有语法风险
        const json = JSON.stringify(snapshot).replace(/[\u2028\u2029]/g, (c) => (c === '\u2028' ? '\\u2028' : '\\u2029'));
        await session.evaluate(`window.__dianaUsageUpdate && window.__dianaUsageUpdate(${json})`);
        pushed = true;
      }
    } catch (error) {
      result.error = `用量快照推送失败：${(error as Error).message}`;
    }
    const probe = await session.evaluate(`(() => {
      const bar = document.getElementById('diana-usage-bar');
      const main = bar ? bar.querySelector('.du-main') : null;
      return {
        present: Boolean(bar),
        rendered: Boolean(main && main.textContent && main.textContent.trim().length > 0),
        pickedSid: (window.__dianaUsageWant || ''),
        barVisible: Boolean(bar && getComputedStyle(bar).display !== 'none'),
      };
    })()`);
    result.usageBar = {
      present: Boolean(probe?.present),
      rendered: Boolean(probe?.rendered),
      pickedSid: String(probe?.pickedSid ?? ''),
      todayTotal,
      snapshotPushed: pushed,
    };

    /* 宠物：素材以 file:// URL 注入，页面自己按状态切 GIF */
    const pets = getPetRegistry(path.resolve(themesRoot(), '..'));
    if (pets.length) {
      await session.evaluate(buildPetScript(pets));
      const petProbe = await session.evaluate(`(() => {
        const host = document.getElementById('diana-skin-pet-host');
        const root = host && host.shadowRoot;
        const img = root ? root.querySelector('img') : null;
        return {
          present: Boolean(host),
          petId: host ? (host.dataset.petId || '') : '',
          state: img ? (img.dataset.gif || '') : '',
          hasSrc: Boolean(img && img.src),
          visible: host ? getComputedStyle(host).display !== 'none' : false,
        };
      })()`);
      result.pet = {
        present: Boolean(petProbe?.present),
        state: String(petProbe?.state ?? ''),
        petId: String(petProbe?.petId ?? ''),
        visible: Boolean(petProbe?.visible),
      };
    } else {
      result.pet = null;
    }
  } catch (error) {
    result.error = `${result.error ? result.error + '；' : ''}用量条注入失败：${(error as Error).message}`;
  }
  return result;
}

/** 列出可用的宠物（供 CLI 与面板） */
export function listPets(): Array<{ id: string; name: string; states: number }> {
  return getPetRegistry(path.resolve(themesRoot(), '..')).map((pet) => ({
    id: pet.id,
    name: pet.name,
    states: Object.keys(pet.states).length,
  }));
}

/** 切换宠物：写入 localStorage 并派发事件，页面即时生效（'none' = 不显示） */
export async function selectPet(petId: string): Promise<{ ok: boolean; error?: string }> {
  const skin = listSkins(themesRoot())[0];
  if (!skin) return { ok: false, error: '没有可用主题' };
  const found = pickRendererTarget(await fetchTargets(skin.manifest.app.debugPort, 2000), skin.manifest.app.targetUrlHint);
  if (!found?.webSocketDebuggerUrl) return { ok: false, error: '调试端点不可达' };
  const session = new CdpSession(found.webSocketDebuggerUrl);
  try {
    await session.open();
    await session.evaluate(petSelectExpression(petId));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  } finally {
    session.close();
  }
}

export async function applySkin(skin: SkinEntry, mode: SkinMode): Promise<ApplyResult> {
  const { manifest } = skin;
  /* 端口候选与"以调试端口重启"共用一份（target-app.debugPortCandidates）：
     主端口被占用时重启会挑备选端口，这边必须能找到它，否则重启完还是注入不上去。 */
  const candidates = debugPortCandidates(manifest.app);
  let target: { port: number; target: NonNullable<ReturnType<typeof pickRendererTarget>> } | null = null;
  for (const port of candidates) {
    const found = pickRendererTarget(await fetchTargets(port, 1500), manifest.app.targetUrlHint);
    if (found) { target = { port, target: found }; break; }
  }
  if (!target) {
    return {
      ok: false, port: candidates[0], mode, mounted: false, rootTheme: null, workspace: null, rail: null,
      checks: {}, needsDebugPort: true,
      error: `未找到调试端点。请确认目标应用已带 --remote-debugging-port 启动（候选端口 ${candidates.join('/')}），且本机代理没有截胡回环请求。`,
    };
  }

  const session = new CdpSession(target.target.webSocketDebuggerUrl!);
  try {
    await session.open();
    const applied = await session.evaluate(buildPayloadExpression(skin, mode));
    if (!applied?.mounted || applied.adapterVersion !== manifest.adapterVersion) {
      return {
        ok: false, port: target.port, mode, mounted: false, rootTheme: applied?.rootTheme ?? null,
        workspace: applied?.workspace ?? null, rail: applied?.rail ?? null, checks: {},
        error: `运行时返回未挂载：${JSON.stringify(applied)?.slice(0, 200)}`,
      };
    }
    const report: MountReport & Record<string, unknown> = await session.evaluate(verifyExpression(manifest.adapterVersion));
    const checks: Record<string, boolean> = {
      controllerPresent: Boolean(report.controllerPresent),
      adapterMatches: Boolean(report.adapterMatches),
      hostClass: Boolean(report.host),
      style: Number(report.styleCount) === 1,
      chrome: Number(report.chromeCount) === 1,
      foreground: Number(report.foregroundCount) === 1,
      artworkNodes: Number(report.artworkNodeCount) === 11,
      artworkResolved: Boolean(report.artworkResolved),
      railPaintOrAbsent: Boolean(report.railPaint),
      pointerSafe: Boolean(report.pointerSafe),
      pointPassesThrough: Boolean(report.pointPassesThrough),
      keyboardReachable: Boolean(report.keyboardReachable),
      noOverflowX: !report.overflowX,
    };
    const ok = Object.values(checks).every(Boolean);
    /* 功能层（用量条/宠物）：独立注入，不参与 ok 判定，但结果照样报出来供肉眼核对 */
    const extra = await injectExtras(session);
    return {
      ok,
      port: target.port,
      mode,
      mounted: true,
      rootTheme: (report.rootTheme as string) ?? null,
      workspace: (report.workspace as ApplyResult['workspace']) ?? null,
      rail: (report.rail as ApplyResult['rail']) ?? null,
      checks,
      extra,
      error: ok ? undefined : `复核未全绿：${Object.entries(checks).filter(([, value]) => !value).map(([key]) => key).join(', ')}`,
    };
  } catch (error) {
    return {
      ok: false, port: target.port, mode, mounted: false, rootTheme: null, workspace: null, rail: null,
      checks: {}, error: (error as Error).message,
    };
  } finally {
    session.close();
  }
}

export async function removeSkin(skin: SkinEntry): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  const { manifest } = skin;
  const found = pickRendererTarget(await fetchTargets(manifest.app.debugPort, 2000), manifest.app.targetUrlHint);
  if (!found?.webSocketDebuggerUrl) {
    return { ok: true, changed: false, error: '调试端点不可达（目标应用可能已退出，皮肤随之消失）' };
  }
  const session = new CdpSession(found.webSocketDebuggerUrl);
  try {
    await session.open();
    const result = await session.evaluate(DISABLE_EXPRESSION);
    // 功能层也一并收掉：用量条与宠物的宿主/计时器不归运行时管
    await teardownExtras(session);
    return { ok: true, changed: Boolean(result?.disabled) };
  } catch (error) {
    return { ok: false, changed: false, error: (error as Error).message };
  } finally {
    session.close();
  }
}

export async function getStatus(skin: SkinEntry): Promise<SkinStatus> {
  const { manifest } = skin;
  const found = pickRendererTarget(await fetchTargets(manifest.app.debugPort, 1500), manifest.app.targetUrlHint);
  if (!found?.webSocketDebuggerUrl) {
    return { app: manifest.app.id, port: null, target: null, injected: false, hostClassPresent: false, rootTheme: null, controllerPresent: false };
  }
  const session = new CdpSession(found.webSocketDebuggerUrl);
  try {
    await session.open();
    const state = await session.evaluate(`(() => ({
      host: document.documentElement.classList.contains('diana-zcode-host'),
      rootTheme: document.documentElement.classList.contains('theme-zai-light') ? 'light' : 'dark',
      controller: Boolean(globalThis.__DIANA_ZCODE_THEME__),
      hasChrome: Boolean(document.getElementById('diana-zcode-chrome')),
    }))()`);
    return {
      app: manifest.app.id,
      port: manifest.app.debugPort,
      target: found.url ?? null,
      injected: Boolean(state?.host && state?.hasChrome),
      hostClassPresent: Boolean(state?.host),
      rootTheme: state?.rootTheme ?? null,
      controllerPresent: Boolean(state?.controller),
    };
  } catch (error) {
    return { app: manifest.app.id, port: manifest.app.debugPort, target: found.url ?? null, injected: false, hostClassPresent: false, rootTheme: null, controllerPresent: false };
  } finally {
    session.close();
  }
}

/** 认当前实际注入的是哪套皮肤：用 adapterVersion 反查（每套主题的清单里它是唯一的）。
 *  面板要显示"现在挂的是哪套"，而不是"上次选了哪套" —— 两者可能不一致。 */
export async function detectInjectedSkin(): Promise<string> {
  const list = listSkins(themesRoot());
  const first = list[0];
  if (!first) return '';
  const found = pickRendererTarget(await fetchTargets(first.manifest.app.debugPort, PROBE_TIMEOUT_MS), first.manifest.app.targetUrlHint);
  if (!found?.webSocketDebuggerUrl) return '';
  const session = new CdpSession(found.webSocketDebuggerUrl);
  try {
    await session.open();
    const version = await session.evaluate(
      `(() => { const c = globalThis.__DIANA_ZCODE_THEME__; return c && c.adapterVersion ? c.adapterVersion : ''; })()`,
    );
    const match = list.find((entry) => entry.manifest.adapterVersion === version);
    return match?.manifest.id ?? '';
  } catch {
    return '';
  } finally {
    session.close();
  }
}

/** 读当前宠物选择（真值存在页面 localStorage 里，面板要显示就得问页面） */
export async function readPetSelection(): Promise<string> {
  const skin = listSkins(themesRoot())[0];
  if (!skin) return '';
  const found = pickRendererTarget(await fetchTargets(skin.manifest.app.debugPort, PROBE_TIMEOUT_MS), skin.manifest.app.targetUrlHint);
  if (!found?.webSocketDebuggerUrl) return '';
  const session = new CdpSession(found.webSocketDebuggerUrl);
  try {
    await session.open();
    const value = await session.evaluate(`(() => {
      const host = document.getElementById('diana-skin-pet-host');
      if (host && host.dataset.petId) return host.dataset.petId;
      try { return localStorage.getItem('dianaskin.pet.id') || ''; } catch (e) { return ''; }
    })()`);
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  } finally {
    session.close();
  }
}

export function themesRoot(): string {
  return path.resolve(__dirname, '..', 'themes');
}

export function skinById(id: string): SkinEntry {
  const dir = path.join(themesRoot(), id);
  if (!fs.existsSync(path.join(dir, 'theme.json'))) throw new Error(`主题不存在：${id}`);
  const { loadSkin } = require('./theme-store') as typeof import('./theme-store');
  return loadSkin(dir);
}
