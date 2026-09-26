/* 宠物层 · 桌宠注册表与页面端运行时。
 *
 * 移植自 Dream-Work-Theme 的 injector.ts（宠物部分），改动：
 *   1. 宿主 id / 全局名 / localStorage 键统一到本项目前缀（diana-skin-pet-*、dianaskin.pet.id）
 *   2. 状态输入事件由本项目的用量条广播（diana-usage）—— 没有它宠物照样工作，
 *      只靠三个 DOM 探针（等待确认 / 停止生成 / 正在执行）与回合边沿计时也能跑
 *   3. 宠物选择原来挂在源项目的注入菜单上，本项目没有菜单，改为 CLI 参数 / 面板下拉
 *      （写入 localStorage 后派发 diana-pet 事件即时生效）
 *
 * 素材以 `file:///` URL 注入：ZCode 页面本身就是 file:// 源，Chromium 能直接读；
 * 无需内嵌 base64（那会把 payload 撑大），查询串带 mtime 防止缓存旧 GIF。
 * 那套「asar 解包 + file:// URL」的工具在 src/media-url.ts，与动态立绘（themes/<id>/assets 下的 .webm）共用。 */

import * as fs from 'fs';
import * as path from 'path';
import { fileUrl, unpackedIfNeeded } from './media-url';

export interface PetDef {
  id: string;
  name: string;
  order: number;
  scale: number;
  /** 状态键 → file:/// URL（带 mtime 查询串） */
  states: Record<string, string>;
}

const STATE_EXTENSIONS = ['.gif', '.webp', '.png'];

/** 扫描 `<root>/assets/pet/<id>/`：一目录一宠物，文件名（去扩展名）即状态键。
 *  同一状态多格式时 .webp 优先（8 位 alpha 轮廓更平滑）。 */
export function getPetRegistry(projectRoot: string): PetDef[] {
  const base = unpackedIfNeeded(path.resolve(path.join(projectRoot, 'assets', 'pet')));
  const out: PetDef[] = [];
  let dirs: string[] = [];
  try { dirs = fs.readdirSync(base); } catch { return out; }
  for (const dirName of dirs) {
    // 越界防御：目录名只接受 basename，解析结果必须落在 assets/pet 之内
    if (dirName !== path.basename(dirName)) continue;
    const dir = path.resolve(base, dirName);
    if (dir !== base && !dir.startsWith(base + path.sep)) continue;
    try { if (!fs.statSync(dir).isDirectory()) continue; } catch { continue; }

    let meta: { id?: unknown; name?: unknown; order?: unknown; scale?: unknown } = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf-8')); } catch { /* 没有 pet.json 也能用，回退目录名 */ }

    const states: Record<string, string> = {};
    let files: string[] = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!STATE_EXTENSIONS.includes(ext) || file !== path.basename(file)) continue;
      const key = file.slice(0, -ext.length);
      if (states[key] && ext !== '.webp') continue;
      const filePath = unpackedIfNeeded(path.join(dir, file));
      let stamp = 0;
      try { stamp = Math.round(fs.statSync(filePath).mtimeMs); } catch { /* 读不到 mtime 就不带查询串 */ }
      states[key] = fileUrl(filePath) + (stamp ? '?v=' + stamp : '');
    }
    if (!Object.keys(states).length) continue;

    out.push({
      id: String(meta.id || dirName),
      name: String(meta.name || dirName),
      order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : 99,
      scale: Number.isFinite(Number(meta.scale)) && Number(meta.scale) > 0 ? Number(meta.scale) : 0.5,
      states,
    });
  }
  out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
  return out;
}

/** 页面端宠物脚本。pets 为空时整个脚本直接返回（不建宿主）。 */
export function buildPetScript(pets: PetDef[]): string {
  const payload = JSON.stringify(pets);
  return String.raw`(() => {
  const pets = ${payload};
  if (!pets.length) return;
  const HOST_ID = 'diana-skin-pet-host';
  const SEL_KEY = 'dianaskin.pet.id';
  const LEGACY_SEL_KEY = 'dreamPet.id';        // 兼容从来源项目迁过来的选择
  const SRC_W = 192, SRC_H = 208;              // 素材原始尺寸，按宠物 scale 缩放

  clearInterval(window.__dianaPetTimer);       // 重注入：旧实例停表
  document.getElementById(HOST_ID)?.remove();

  let PET_W = 96, PET_H = 104;
  const host = document.createElement('div');
  host.id = HOST_ID;
  /* all:initial!important 会把后面无 !important 的 left/top/display 一起重置，
   * 所以定位与显隐都必须走 setProperty(..., 'important') */
  host.style.cssText = 'all:initial!important;position:fixed!important;z-index:2147483640!important;display:block!important;' +
    'pointer-events:none!important;width:fit-content!important;height:fit-content!important;contain:none!important;isolation:isolate!important;';
  const mount = host.attachShadow({ mode: 'open' });
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;line-height:0;';
  /* 落地阴影：静态椭圆。用 drop-shadow 滤镜会随 GIF 每帧轮廓重算，精灵一动影子就闪 */
  const shadow = document.createElement('div');
  shadow.style.cssText = 'position:absolute;left:50%;bottom:1px;transform:translateX(-50%);width:58%;height:9px;border-radius:50%;' +
    'background:radial-gradient(ellipse at center,rgba(0,0,0,.34) 0%,rgba(0,0,0,.16) 48%,transparent 74%);pointer-events:none;';
  const img = document.createElement('img');
  img.draggable = false;
  img.alt = '';
  img.style.cssText = 'position:relative;display:block;pointer-events:none;user-select:none;-webkit-user-select:none;';
  wrap.append(shadow, img);
  mount.appendChild(wrap);
  document.documentElement.appendChild(host);

  /* ---------- 选择 ---------- */
  const readSel = () => {
    try {
      const own = localStorage.getItem(SEL_KEY);
      if (own) return own;
      const legacy = localStorage.getItem(LEGACY_SEL_KEY);
      if (legacy) return legacy;
      return localStorage.getItem('dreamPet.enabled') === '0' ? 'none' : '';
    } catch (e) { return ''; }
  };
  let activePet = null;
  const resolvePet = () => {
    const sel = readSel();
    if (sel === 'none') return null;
    for (let i = 0; i < pets.length; i++) if (pets[i].id === sel) return pets[i];
    return pets[0] || null;
  };
  let cur = '';
  const applyPet = () => {
    activePet = resolvePet();
    const scale = activePet && activePet.scale ? activePet.scale : 0.5;
    PET_W = Math.round(SRC_W * scale);
    PET_H = Math.round(SRC_H * scale);
    img.style.width = PET_W + 'px';
    img.style.height = PET_H + 'px';
    host.dataset.petId = activePet ? activePet.id : 'none';
    cur = '';                                   // 换宠物：状态键不变也要重挂新图
  };
  applyPet();
  document.addEventListener('diana-pet', () => { applyPet(); idleNextAt = 0; });

  /* ---------- 状态 → 素材 ---------- */
  const stateGif = (key) => {
    const s = activePet ? activePet.states : null;
    if (!s) return '';
    return s[key] || ((key === 'running-left' || key === 'running-right') ? (s.running || s.idle) : '') || s.idle || '';
  };
  const setGif = (name) => {
    const key = name === 'thinking' ? 'review' : name === 'done' ? 'jumping' : name;
    if (cur === key) return;
    cur = key;
    const url = stateGif(key);
    if (url) img.src = url;
    img.dataset.gif = key;
  };

  /* ---------- 定位：贴着输入框上沿 ---------- */
  let edgeY = 0, spanLeft = 0, spanRight = 0;
  const pos = { x: -1, y: 0 };
  const trackEdge = () => {
    const region = document.querySelector('.chat-composer-region');
    if (!region) return false;
    try {
      /* 设置页等整页路由**不卸载会话 DOM**（工作区保活），几何依旧有效；
       * 必须叠加 checkVisibility，否则宠物会跟着保活的输入框留在设置页 */
      if (typeof region.checkVisibility === 'function' &&
        !region.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true })) return false;
    } catch (e) { }
    const r = region.getBoundingClientRect();
    if (r.width < 120 || r.height < 40) return false;
    edgeY = r.top - PET_H;
    spanLeft = r.left;
    spanRight = Math.max(r.left, r.right - PET_W);
    return true;
  };
  const place = () => {
    host.style.setProperty('left', Math.round(pos.x) + 'px', 'important');
    host.style.setProperty('top', Math.round(pos.y) + 'px', 'important');
    img.dataset.petPos = Math.round(pos.x) + ',' + Math.round(pos.y);
  };

  /* ---------- 状态输入：用量条广播 + 三个 DOM 探针 ---------- */
  let live = null, liveAt = 0, lastUseSid = '', synthDoneUntil = 0;
  document.addEventListener('diana-usage', (e) => {
    const d = e && e.detail;
    if (!d) return;
    if (d.sid && lastUseSid && d.sid !== lastUseSid) synthDoneUntil = 0;   // 切会话：复位
    if (d.sid) lastUseSid = d.sid;
    live = d.live || null;
    liveAt = Date.now();
  });

  const visible = (el) => {
    if (!el) return false;
    try { if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true, contentVisibilityAuto: true })) return false; } catch (e) { }
    return el.getClientRects().length > 0;
  };
  const domWaiting = () => {                    // 等待确认（含代理提问）
    const li = document.querySelector('li[data-testid^=task-item-].bg-selected');
    if (li && li.textContent && li.textContent.indexOf('等待确认') >= 0) return true;
    const nodes = document.querySelectorAll('span,div,button');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.closest('#sidebar')) continue;
      if (el.children.length) continue;
      if ((el.textContent || '').trim() !== '等待确认') continue;
      if (visible(el)) return true;
    }
    return false;
  };
  const domTurnActive = () => {                 // 输入框区里有"停止生成"按钮
    const region = document.querySelector('.chat-composer-region');
    if (!region) return false;
    const nodes = region.querySelectorAll('button,[aria-label],[title]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const label = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.textContent || '');
      if (/停止|Stop/i.test(label) && visible(el)) return true;
    }
    return false;
  };
  const domToolRunning = () => {                // 有"正在执行"标签
    const nodes = document.querySelectorAll('span,div');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.closest('#sidebar')) continue;
      if (el.children.length) continue;
      if ((el.textContent || '').trim() !== '正在执行') continue;
      if (visible(el)) return true;
    }
    return false;
  };

  const pickState = (now, turnActive) => {
    if (domWaiting()) return 'waiting';
    if (live && now - liveAt < 150000) {
      if (live.state === 'waiting') return 'waiting';
      if (live.state === 'failed' && now - live.at < 12000) return 'failed';
      if (live.state === 'done' && now - live.at < 8000) return 'done';
    }
    /* 工具执行中沿输入框上沿跑动。要求回合在跑：否则残留的"正在执行"标签
     * 会压住紧随其后的完成跳跃（done 依赖回合边沿） */
    if (turnActive && domToolRunning()) return 'running';
    if (live && live.state === 'running') return 'running';
    if (turnActive) return 'thinking';
    if (now < synthDoneUntil) return 'done';    // DOM 边沿：回合刚结束，立即跳跃
    return 'idle';
  };

  /* ---------- 主循环 ---------- */
  let target = null, pauseUntil = 0, idleNextAt = 0, idleIdx = 0, idleCount = 0;
  let lastState = '', lastTurnActive = false;
  const tick = () => {
    if (!host.isConnected) return;              // 旧实例：宿主已被重注入替换
    try {
      if (!activePet) { host.style.setProperty('display', 'none', 'important'); return; }
      const now = Date.now();
      const turnActive = domTurnActive();
      if (lastTurnActive && !turnActive) synthDoneUntil = now + 8000;   // 回合刚结束
      lastTurnActive = turnActive;

      const state = pickState(now, turnActive);
      if (!trackEdge()) { host.style.setProperty('display', 'none', 'important'); return; }
      host.style.setProperty('display', 'block', 'important');

      if (pos.x < 0) pos.x = spanRight;         // 首次：从输入框右端起
      if (pos.x < spanLeft) pos.x = spanLeft;
      if (pos.x > spanRight) pos.x = spanRight;
      pos.y = edgeY;

      if (state === 'running') {
        if (pauseUntil && now < pauseUntil) setGif('running');
        else if (target === null) target = spanLeft + Math.random() * (spanRight - spanLeft);
        else {
          const dx = target - pos.x;
          if (Math.abs(dx) < 4) { target = null; pauseUntil = now + 500 + Math.random() * 1000; setGif('running'); }
          else { pos.x += Math.min(Math.abs(dx), 14) * (dx > 0 ? 1 : -1); setGif(dx > 2 ? 'running-right' : dx < -2 ? 'running-left' : 'running'); }
        }
      } else if (state === 'idle') {
        target = null; pauseUntil = 0;
        if (lastState !== 'idle') idleNextAt = 0;   // 从其它状态回空闲：立刻换回空闲帧
        if (now >= idleNextAt) {
          idleNextAt = now + 3000 + Math.random() * 2000;
          const seq = ['idle', 'look-left-side', 'look-right-side'];
          setGif(idleCount > 0 && idleCount % 5 === 0 ? 'waving' : seq[idleIdx % 3]);
          idleIdx++; idleCount++;
        }
      } else {
        target = null; pauseUntil = 0;
        setGif(state);
      }
      lastState = state;
      place();
    } catch (e) { }
  };
  if (trackEdge()) pos.x = spanRight;
  pos.y = Math.max(0, edgeY);
  setGif('idle');
  place();
  window.__dianaPetTimer = setInterval(tick, 120);
})()`;
}

/** 设置当前宠物（写入 localStorage 并派发事件让页面即时切换）。'none' = 不显示。 */
export function petSelectExpression(petId: string): string {
  return `(() => {
    try { localStorage.setItem('dianaskin.pet.id', ${JSON.stringify(petId)}); } catch (e) { }
    document.dispatchEvent(new CustomEvent('diana-pet'));
    return true;
  })()`;
}
