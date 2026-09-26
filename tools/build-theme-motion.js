/* 通用生成器：**一个 4K 动态立绘帧序列 + 一句命令 → 一整套主题**。
 *
 *   node tools/build-theme-motion.js --src "D:/BigModel/鸣潮立绘4K/C_JinXi_1/frames" \
 *        --id jinxi-line --name "金曦线稿 · 今汐" [--crf 20] [--hue 45] [--still 800]
 *
 * 它做五件事（全部可复现，只依赖 ffmpeg 与本仓库工具）：
 *   ① 量：扫一遍帧序列，得到**并集内容框**（只裁四周全透明空白，不裁内容；并集保证每帧的飘带都在框内）
 *      与四个配色锚点：主色（高饱和像素均值）、辉光（亮且饱和）、近白、近黑。
 *   ② 立绘：VP9 + alpha 的 WebM（原生分辨率、不重采样）+ 同构图静止帧（面板立绘 / 视频兜底）。
 *   ③ 涂鸦：**直接使用 Diana 的原文件**（与源文件逐字节一致），
 *      目标锚点取本主题的「外层浅色 / 内层深色」（alpha 与形状一像素不动）。
 *   ④ 主题：以 themes/diana 为基准重写主题色（明度阶梯照搬、色相换到本角色的族中心），
 *      并写 theme.json（含 characterMotion 动态立绘角色）+ 照搬 tokens / artwork-contract。
 *   ⑤ 报告：素材体积、配色锚点、alpha 结构自检、以及"有没有旧色残留"。
 *
 * 配色规则（与 shorekeeper-line 同一套，可复现）：
 *   族中心 hue = (主色 hue + 辉光 hue) / 2
 *   暗夜 accent = 辉光实测均值；日间 accent = 同色相 S .72 / L .33（白底对比度够用）
 *   涂鸦外层 = 族色相 S .25 / L .93（带色冰白）；内层 = 族色相 S .78 / L .45
 *   明度阶梯（surface/panel/ink/muted…）照搬 diana，只换色相 —— 直接动 S/L 会把 UI 层级搞坏。 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { decode } = require('./png');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const SRC = argOf('src', '');
const ID = argOf('id', '');
/* 显示名：**colors-only 时不给就用清单里原有的**（拿 ID 兜底会把已经起好的名字冲掉 ——
 * 实测：`--name "霜蓝线稿 · 尤诺"` 建好后再跑一次 `--colors-only --accent`，名字就变回 `younuo-line`，
 * 而面板显示的就是这个名字）。真没名字才退回 ID。 */
let NAME = argOf('name', '');
/* 素材来源的说明文字（写进清单 author）。默认"帧目录的上一级 + 动态序列"，由 --source 覆盖。 */
const SOURCE_LABEL = argOf('source', '');
/* 只改配色：复用第 ④ 步的 token 逻辑，但**跳过导出/编码/涂鸦**——否则重跑会把这套主题里
 * 已经优化好的立绘视频覆盖成"原生尺寸无损"的大文件（实测：优化完 1.94MB，重跑生成器变回 38MB）。 */
const COLORS_ONLY = argv.includes('--colors-only');
/* 跳过第 ② 步里那次**原生尺寸**的 VP9 编码（`--skip-motion`）：量/裁/配色/涂鸦/清单照做，
 * 只是不写 assets/character-motion.webm。用于"生成器量完几何、紧接着由 optimize-motion.js
 * 按 2× 显示宽重编"的流程 —— 那一次原生编码几分钟后就被覆盖，纯属白烧时间。 */
const SKIP_MOTION = argv.includes('--skip-motion');
if (!ID || (!SRC && !COLORS_ONLY)) {
  console.error('用法：node tools/build-theme-motion.js --src <帧目录> --id <主题 id> --name "<显示名>" [--crf 20] [--hue N] [--still 800] [--skip-motion] [--source "<素材来源>"]');
  console.error('      只改配色：node tools/build-theme-motion.js --id <主题 id> --colors-only [--accent #rrggbb] [--hue N] [--name "<显示名>"] [--source "<素材来源>"]');
  process.exit(1);
}
const CRF = Number(argOf('crf', '20'));
const FPS = Number(argOf('fps', '12'));
const STILL_W = Number(argOf('still', '800'));
const HUE_OVERRIDE = argOf('hue', '') ? Number(argOf('hue', '')) : null;
/* 强调色可显式覆盖（默认取立绘辉光实测值）。用来把"主题色"定到某个指定的颜色，
 * 比如"雷电紫" = 同色相、提高饱和度的那一档 —— 实测辉光往往偏淡，不够"电"。 */
const ACCENT_OVERRIDE = argOf('accent', '');
/* 真·无损：VP9 -lossless 1。画质与源帧逐像素一致（可验），代价是体积约 6.5 倍
 * （实测 c223 10 帧：CRF20 1.47MB → 无损 9.55MB）。 */
const LOSSLESS = argv.includes('--lossless');
/* 裁剪窗口可人工指定："x,y,w,h"。用于**横构图**的立绘：自动取并集内容框会把整幅铺陈都算进来，
 * 人物于是被缩得很小（吟霖那张 6247×4096 里她本体只占 22%×30%，整幅显示时她只有 143px 高）。
 * 指定窗口后盒子纵横比也跟着窗口走，人物就能按窗口高度满尺寸显示。 */
const CROP_OVERRIDE = argOf('crop', '');
/* 去官方雾噪（可选，`--clean-glow`）：坎特蕾拉那张立绘在伞的周围有一大圈**很淡的半透明脏雾**
 * （实测 alpha≈56、颜色 #2e3537 —— 在深色主题上就是一层灰噪；另有零星白色颗粒）。
 * 规则：先取"主体"掩码（alpha>200 的实心像素，**不看颜色** —— 伞面的白蕾丝也算主体），
 * 把它膨胀 K 像素以保住贴身柔边；**膨胀区之外、alpha 低于阈值**的像素一律清成透明。
 * 实测：一帧里这样的像素约 219k，范围 1193×2008，正好覆盖伞那一圈（x1798..3000, y910..2900）。
 * 于是"伞（含蕾丝）+ 人"原样保留，雾噪消失、透出主题背景。 */
const CLEAN_GLOW = argv.includes('--clean-glow');
const GLOW_ALPHA = 200;    // 雾噪判定：alpha 上限（高于它的视为真实内容；140 时伞左上的淡残影还在）
const GLOW_KEEP = 24;      // 主体掩码膨胀半径（像素）

const ROOT = path.resolve(__dirname, '..');
const DIANA = path.join(ROOT, 'themes', 'diana');
const OUT = path.join(ROOT, 'themes', ID);
const WORK = path.join(ROOT, 'tools', 'work', ID);
/* 槽位：写成 [输出文件名（= 素材角色名的连字符形式）, 清单里的角色名]。
   清单用驼峰（candyWrapped），文件名用连字符（candy-wrapped）—— 两边都得对上。 */
const CLEAN_NOTE = "**去过官方雾噪**（`--clean-glow`）：官方帧里伞周围有一大圈很淡的半透明脏雾（实测 alpha≈56、颜色 #2e3537，约 235k 像素/帧，另有零星白颗粒）——在深色主题上就是一层灰噪。清理规则：取 alpha>200 的实心像素当\"主体\"掩码、膨胀 24px 保住贴身柔边，**膨胀区之外 alpha<200 的像素一律清透明**。伞面白蕾丝与白裙都在主体掩码内，原样保留。只影响该主题自己那份素材（生成器里是可开关的步骤）。";
const DECOR = [
  ['doodle', 'doodle'], ['star', 'star'], ['candy-wrapped', 'candyWrapped'], ['candy-lollipop', 'candyLollipop'],
  ['acao-heart', 'acaoHeart'], ['acao-cheer', 'acaoCheer'], ['corner', 'corner'], ['upper', 'upper'],
];

/* ---------- 颜色小工具 ---------- */
const rgb2hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hueOf = (c) => {
  const mx = Math.max(...c), mn = Math.min(...c);
  if (mx === mn) return 0;
  let h; if (mx === c[0]) h = ((c[1] - c[2]) / (mx - mn)) % 6; else if (mx === c[1]) h = (c[2] - c[0]) / (mx - mn) + 2; else h = (c[0] - c[1]) / (mx - mn) + 4;
  return Math.round(((h * 60) + 360) % 360);
};
const rgb2hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  const l = (mx + mn) / 2;
  return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
};
const hsl2hex = ([h, s, l]) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1));
  const t = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return rgb2hex(t.map((v) => (v + m) * 255));
};
/** 把某个颜色换到指定色相（保留 S/L） */
const shiftHue = (hex, hue, satScale = 1) => { const [, s, l] = rgb2hsl(hex2rgb(hex)); return hsl2hex([hue, Math.min(1, s * satScale), l]); };
const contrast = (a, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const L = (h) => { const [r, g, b] = hex2rgb(h); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return ((x + 0.05) / (y + 0.05)); };

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(`✗ ${label} 失败：` + String(r.stderr || r.error).slice(-400));
    process.exitCode = 1;
    return { ok: false, log: '' };
  }
  return { ok: true, log: String(r.stdout || '') + String(r.stderr || '') };
}

/* ---------- ① 量：并集内容框 + 配色锚点 ---------- */
/* colors-only：锚点与裁剪窗口都从**已有产物**里读（CSS 头部注释写了锚点、theme.json 的 notes 写了窗口），
 * 不去解码帧序列 —— 目的就是只换颜色。 */
let EXISTING = null;
let CROP0_ONLY = null;                  // colors-only 时解析出的裁剪窗口（② 段不再重复解析）
if (COLORS_ONLY) {
  EXISTING = JSON.parse(fs.readFileSync(path.join(OUT, 'theme.json'), 'utf-8'));
  const css0 = fs.readFileSync(path.join(OUT, 'skin', 'theme.css'), 'utf-8');
  const m0 = /主色 (#[0-9a-f]{6})（\d+°）· 辉光 (#[0-9a-f]{6})（\d+°）· 近白 (#[0-9a-f]{6}) · 近黑 (#[0-9a-f]{6})/i.exec(css0);
  const cm = /裁剪窗口 (\d+)×(\d+) @\((\d+),(\d+)\)/.exec(JSON.stringify(EXISTING.notes));
  /* 老一点的产物（build-theme-shorekeeper.js 生成的那批）头部没有锚点注释 —— 回退成读 CSS 里
   * 现有的 accent / line-berry 当锚点：锚点只用于注释与"未显式给 accent 时的兜底"，
   * 显式传了 --accent 时不影响配色结果。 */
  let anchors = m0 ? { main: m0[1], glow: m0[2], white: m0[3], dark: m0[4] } : null;
  if (!anchors) {
    const acc = /--diana-zcode-accent:\s*(#[0-9a-f]{6})/i.exec(css0);
    const berry = /--diana-zcode-line-berry:\s*(#[0-9a-f]{6})/i.exec(css0);
    if (acc && berry) {
      anchors = { main: berry[1], glow: acc[1], white: '#f3eef0', dark: '#111111' };
      console.log('   （CSS 头部没有锚点注释，回退用现有 accent/line-berry 当锚点）');
    }
  }
  if (!anchors || !cm) { console.error('colors-only：现有产物里读不到锚点/裁剪窗口'); process.exit(1); }
  var A = anchors;
  CROP0_ONLY = { w: Number(cm[1]), h: Number(cm[2]), x: Number(cm[3]), y: Number(cm[4]) };
  if (!NAME) NAME = EXISTING.name || ID;
  console.log(`① colors-only：沿用已有锚点（主色 ${A.main} / 辉光 ${A.glow}）与裁剪窗口 ${CROP0_ONLY.w}×${CROP0_ONLY.h} @(${CROP0_ONLY.x},${CROP0_ONLY.y})｜显示名「${NAME}」`);
}
if (!NAME) NAME = ID;
const frames = COLORS_ONLY ? [] : fs.readdirSync(SRC).filter((f) => /^\d+\.png$/i.test(f)).sort();
if (!COLORS_ONLY && !frames.length) { console.error('帧目录里没有 PNG 序列：' + SRC); process.exit(1); }
if (!COLORS_ONLY) console.log(`① 量 ${frames.length} 帧（${ID}）`);
const STRIDE = 4;                       // 抽点步长：边界精度 ±4px，后面的 8px 余量覆盖得住
let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
/* 锚点只取均值（没有分位数/中位数），所以**累加和 + 计数**就够，不必把每个采样点存下来。
 * 300 帧 ×45 万采样点存成小数组会到上亿个对象：实测内存 2.4GB、CPU 空转 245s 还卡在第一步
 * （改成累加和后同样结果、内存降到常数级）。 */
const acc = { main: [0, 0, 0, 0], glow: [0, 0, 0, 0], whites: [0, 0, 0, 0], darks: [0, 0, 0, 0] };  // r,g,b,count
const addTo = (a, c) => { a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3]++; };
let FRAME_W = 0, FRAME_H = 0;          // 画面尺寸（裁剪窗口要夹在画面内，见 ② 处）
for (const f of (COLORS_ONLY ? [] : frames)) {
  const img = decode(fs.readFileSync(path.join(SRC, f)));
  const { width, height, channels, data } = img;
  FRAME_W = width; FRAME_H = height;
  for (let y = 0; y < height; y += STRIDE) {
    for (let x = 0; x < width; x += STRIDE) {
      const i = (y * width + x) * channels;
      if (data[i + 3] < 8) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (data[i + 3] < 200) continue;
      const c = [data[i], data[i + 1], data[i + 2]];
      if (sat(c) > 0.45) addTo(acc.main, c);
      if (sat(c) > 0.3 && lum(c) > 140) addTo(acc.glow, c);
      if (lum(c) > 225) addTo(acc.whites, c);
      if (lum(c) < 25) addTo(acc.darks, c);
    }
  }
}
const mean = (a, fallback = '#888888') => (a[3] ? rgb2hex([0, 1, 2].map((k) => a[k] / a[3])) : fallback);
if (!COLORS_ONLY) A = { main: mean(acc.main), glow: mean(acc.glow), white: mean(acc.whites), dark: mean(acc.darks) };
/* 族中心色相 = 主色与辉光的**圆均值**（不是算术平均）：351° 与 2° 的算术平均是 176.5°，看着像青色，
 * 而它们实际只差 11°、圆均值 356.5°。实测踩过：柚叶那套的锚点正好跨 0/360，
 * 按算术平均算出来整套涂鸦/装饰都变成了青色。 */
const hueMean = (h1, h2) => {
  const r = (d) => (d * Math.PI) / 180;
  const s = Math.sin(r(h1)) + Math.sin(r(h2)), c = Math.cos(r(h1)) + Math.cos(r(h2));
  return Math.round(((Math.atan2(s, c) * 180) / Math.PI + 360) % 360);
};
const HUE = HUE_OVERRIDE !== null ? HUE_OVERRIDE : hueMean(hueOf(hex2rgb(A.main)), hueOf(hex2rgb(A.glow)));
/* colors-only 不扫帧，minX/maxX 还是 ±Infinity —— 别把那行"并集内容框 NaN"打出来当噪声 */
if (!COLORS_ONLY) console.log(`   并集内容框 ${maxX - minX + 1}×${maxY - minY + 1} @(${minX},${minY}) 纵横比 ${((maxX - minX + 1) / (maxY - minY + 1)).toFixed(3)}`);
console.log(`   锚点：主色 ${A.main}(${hueOf(hex2rgb(A.main))}°) 辉光 ${A.glow}(${hueOf(hex2rgb(A.glow))}°) 近白 ${A.white} 近黑 ${A.dark} → 族中心 hue ${HUE}°`);
const ensureContrast = (hex, bg, min) => {     // 白底上要放小字与导轨刻度：对比度不够就往下压明度
  let [h, s, l] = rgb2hsl(hex2rgb(hex));
  while (l > 0.06 && contrast(hsl2hex([h, s, l]), bg) < min) l = Math.round((l - 0.02) * 100) / 100;
  return hsl2hex([h, s, l]);
};
const P = {
  accentDark: ACCENT_OVERRIDE || A.glow,
  accentLight: ensureContrast(hsl2hex([hueOf(hex2rgb(ACCENT_OVERRIDE || A.glow)), 0.72, 0.33]), '#ffffff', 4.5),
  decoOuter: hsl2hex([HUE, 0.25, 0.93]),
  decoInner: hsl2hex([HUE, 0.78, 0.45]),
};
console.log(`   配色：accent 暗夜 ${P.accentDark} / 日间 ${P.accentLight}（对白底 ${contrast(P.accentLight, '#ffffff').toFixed(2)}:1）｜涂鸦外层 ${P.decoOuter} 内层 ${P.decoInner}`);

/* ---------- ①-b 可选：清掉官方外发光 ---------- */
let ENCODE_SRC = SRC;
if (CLEAN_GLOW) {
  const cleaned = path.join(WORK, 'cleaned');
  fs.mkdirSync(cleaned, { recursive: true });
  console.log(`
①-b 去雾噪（膨胀区外 alpha<${GLOW_ALPHA} 清透明，主体掩码膨胀 ${GLOW_KEEP}px）`);
  let removedTotal = 0;
  for (const f of frames) {
    const img = decode(fs.readFileSync(path.join(SRC, f)));
    const { width: w, height: h, channels: ch, data } = img;
    const solid = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) if (data[k * ch + 3] > 200) solid[k] = 1;   // 主体 = 实心像素（不分颜色）
    /* 方形膨胀：先横向滑窗取最大，再纵向 —— O(n)，比逐像素卷积快几个数量级 */
    const tmp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let run = 0;
      for (let x = 0; x < w; x++) {
        if (solid[y * w + x]) run = GLOW_KEEP;
        else if (run > 0) run--;
        tmp[y * w + x] = run > 0 ? 1 : 0;
      }
      run = 0;
      for (let x = w - 1; x >= 0; x--) {
        if (solid[y * w + x]) run = GLOW_KEEP;
        else if (run > 0) run--;
        if (run > 0) tmp[y * w + x] = 1;
      }
    }
    const keep = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      let run = 0;
      for (let y = 0; y < h; y++) {
        if (tmp[y * w + x]) run = GLOW_KEEP;
        else if (run > 0) run--;
        keep[y * w + x] = run > 0 ? 1 : 0;
      }
      run = 0;
      for (let y = h - 1; y >= 0; y--) {
        if (tmp[y * w + x]) run = GLOW_KEEP;
        else if (run > 0) run--;
        if (run > 0) keep[y * w + x] = 1;
      }
    }
    /* 写回：膨胀区之外、alpha 低于阈值的像素 → alpha 0（雾噪与颗粒） */
    const out = Buffer.from(data);
    for (let k = 0; k < w * h; k++) {
      if (keep[k]) continue;
      const a = data[k * ch + 3];
      if (a < 8 || a >= GLOW_ALPHA) continue;
      out[k * ch + 3] = 0;
      removedTotal++;
    }
    const { encode } = require('./png');
    const canvas = { width: w, height: h, data: new Float32Array(w * h * 4) };
    for (let k = 0; k < w * h; k++) {
      canvas.data[k * 4] = out[k * ch] / 255;
      canvas.data[k * 4 + 1] = out[k * ch + 1] / 255;
      canvas.data[k * 4 + 2] = out[k * ch + 2] / 255;
      canvas.data[k * 4 + 3] = out[k * ch + 3] / 255;
    }
    fs.writeFileSync(path.join(cleaned, f), encode(canvas));
  }
  console.log(`   清了 ${(removedTotal / 1000).toFixed(0)}k 个雾噪像素（${frames.length} 帧累计），干净帧写 ${path.relative(ROOT, cleaned)}/`);
  ENCODE_SRC = cleaned;
}

/* ---------- ② 立绘：VP9+alpha 视频 + 静止帧 ---------- */
let CROP;                               // ④ 段要用（纵横比），所以声明在跳过块之外
let enc = null;                         // --skip-motion 时保持 null（⑤ 段的 alpha 自检要看它的输出）
if (COLORS_ONLY) {
  console.log('\n② 立绘：colors-only 跳过（保留现有 assets/character-motion.webm）');
  CROP = CROP0_ONLY;                    // 直接用 ① 段从 notes 里解析出来的窗口
} else {
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'skin'), { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
if (CROP_OVERRIDE) {
  const [cx, cy, cw, ch] = CROP_OVERRIDE.split(',').map(Number);
  CROP = { x: cx, y: cy, w: cw, h: ch };
  console.log(`   人工指定裁剪窗口 ${cw}×${ch} @(${cx},${cy})（纵横比 ${(cw / ch).toFixed(3)}）`);
} else {
  CROP = { x: Math.max(0, minX - 8), y: Math.max(0, minY - 8), w: maxX - minX + 17, h: maxY - minY + 17 };
}
CROP.w -= CROP.w % 2; CROP.h -= CROP.h % 2;   // 编码器要偶数
/* 必须夹回画面内：内容贴到画面某条边时，"四周留 8px 余量"会把窗口推到画面外，
 * ffmpeg 的 crop 遇到越界直接 `Invalid argument`（实测尤诺：窗口底边 8+2164 > 源高 2160）——
 * 而且它不会说"越界了"，只报 exit -22，很容易看错方向。 */
if (FRAME_W && FRAME_H) {
  const cx = Math.min(CROP.x, Math.max(0, FRAME_W - 2)), cy = Math.min(CROP.y, Math.max(0, FRAME_H - 2));
  const cw = Math.min(CROP.w, FRAME_W - cx), ch = Math.min(CROP.h, FRAME_H - cy);
  if (cx !== CROP.x || cy !== CROP.y || cw !== CROP.w || ch !== CROP.h) {
    console.log(`   裁剪窗口越界，已夹回画面：${CROP.w}×${CROP.h} @(${CROP.x},${CROP.y}) → ${cw}×${ch} @(${cx},${cy})（源 ${FRAME_W}×${FRAME_H}）`);
  }
  CROP = { x: cx, y: cy, w: cw - (cw % 2), h: ch - (ch % 2) };
}
const motion = path.join(OUT, 'assets', 'character-motion.webm');
if (SKIP_MOTION) {
  console.log(`\n② 动态立绘：--skip-motion 跳过原生编码（裁剪窗口 ${CROP.w}×${CROP.h} 仍按实测写进清单与 CSS）`);
  console.log('   assets/character-motion.webm 交给 tools/optimize-motion.js 按该主题实测显示宽重编（×1，见 README §⑫ 的交付口径）');
} else {
  console.log(`\n② 动态立绘：VP9+alpha、原生 ${CROP.w}×${CROP.h}、CRF ${CRF}`);
  enc = run('ffmpeg', ['-y', '-v', 'info', '-framerate', String(FPS), '-start_number', 0,
    '-i', path.join(ENCODE_SRC, '%03d.png'), '-vf', `crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y},format=yuva420p`,
    '-c:v', 'libvpx-vp9', ...(LOSSLESS ? ['-lossless', '1', '-deadline', 'good', '-cpu-used', '4'] : ['-b:v', '0', '-crf', String(CRF)]),
    '-auto-alt-ref', '0', '-row-mt', '1', '-pix_fmt', 'yuva420p', motion], '动态立绘编码');
}
/* 静止帧用**带 alpha 的有损 WebP**：它要内联成 data URI（面板立绘 + 视频兜底），PNG 在竖构图立绘上
   会到 1MB（base64 1.4MB）撞上单条声明长度上限，而有损 WebP 只有它的几分之一。 */
const still = path.join(OUT, 'assets', 'character-still.webp');
run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(ENCODE_SRC, frames[0]),
  '-vf', `crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y},scale=${STILL_W}:-1:flags=lanczos`,
  '-c:v', 'libwebp', '-lossless', '0', '-quality', '85', '-pix_fmt', 'yuva420p', still], '静止帧');

/* ---------- ③ 涂鸦：复用 Diana 的形状、换成主题线色 ---------- */
console.log('\n③ 涂鸦（Diana 形状 + 本主题线色）');
/* diana 的素材文件名带版本后缀（diana-doodle-v2.png 之类），而换色工具按"角色名"找文件，
   所以先照 diana 清单把 8 个角色铺成角色名副本再换色（diana 改了命名也会自动跟着走）。 */
const dianaManifest = JSON.parse(fs.readFileSync(path.join(DIANA, 'theme.json'), 'utf-8'));
const staging = path.join(WORK, 'recolor-src');
fs.mkdirSync(staging, { recursive: true });
const staged = [];
for (const [name, role] of DECOR) {
  const file = dianaManifest.assets[role];
  if (!file) { console.error('   跳过（diana 清单里没有该角色）：' + role); continue; }
  fs.copyFileSync(path.join(DIANA, file), path.join(staging, name + '.png'));   // 清单里的值已带 assets/ 前缀
  staged.push(name);        // 暂存目录里按文件名（连字符）命名，换色工具按它找源
}
/* **直接照搬 Diana 的原文件**（与源文件逐字节一致），颜色交给主题 CSS：
 * 主题里那几条 rules 已改成"形状取自素材 alpha 蒙版、颜色取自 token"，所以源文件的 RGB 不参与显示，
 * 不需要再按主题重映射一版。好处：素材与源文件一致、可直接核对哈希，少一层加工。 */
let copied = 0, verified = 0;
/* 按**实机显示尺寸**缩放（2026-09-23 改）：装饰是用 mask 画的，元素盒子由主题 CSS 的 clamp 上限
 * 决定（涂鸦 340 CSS px、星形 34–46…），而素材本身 1267/256/512 px 宽 —— 原样交付等于让浏览器
 * 每帧缩小 3–7 倍再画，细线条必然碎成锯齿。改成"素材宽 = 显示宽（CSS 上限 × dpr）"后几乎不重采样，
 * 抗锯齿交给 lanczos。**这也打破了"与 Diana 原文件逐字节一致"那条老规则**（那条是为可核对哈希），
 * 换来细线条不再锯齿；源文件仍留在 themes/diana/assets，缩放表见 tools/scale-decor.js。 */
const DECOR_PX = { doodle: 340, corner: 820, upper: 350, star: 46, 'candy-wrapped': 74,
  'candy-lollipop': 80, 'acao-heart': 118, 'acao-cheer': 112 };
const DPR = 1.1363636;
for (const name of staged) {
  const from = path.join(staging, name + '.png');
  const to = path.join(OUT, 'assets', name + '.png');   // 落点必须是 OUT/assets/（见旧注释）
  const outW = Math.round((DECOR_PX[name] || 256) * DPR);
  const r = run('ffmpeg', ['-y', '-v', 'error', '-i', from, '-vf', `scale=${outW}:-2:flags=lanczos`, '-pix_fmt', 'rgba', to], '装饰缩放 ' + name);
  if (!r.ok) continue;
  copied++;
  /* 自检：尺寸必须等于显示宽、且文件非空（老规则是哈希对比，现在形状会重采样，改看尺寸） */
  const st = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width', '-of', 'csv=p=0', to], { encoding: 'utf8' });
  if (Number(String(st.stdout).trim()) === outW && fs.statSync(to).size > 0) verified++;
}
console.log(`   ${copied} 个槽位按显示尺寸缩放（源 = Diana 原文件），尺寸核对 ${verified}/${copied}` + (verified === copied ? ' ✅' : ' ✗ 有文件没写成'));

}   // ← 结束 ②/③ 的 colors-only 跳过块
const alphaOK = COLORS_ONLY || SKIP_MOTION ? true : /Video: vp9, yuva420p/.test(enc.log);

/* ---------- ④ 主题：以 diana 为基准重写主题色 ---------- */
console.log('\n④ 主题文件');
const dianaCss = fs.readFileSync(path.join(DIANA, 'skin', 'theme.css'), 'utf-8');
/* 中性阶梯：照搬 diana 的 S/L，只换色相 */
const NEUTRAL_DARK = { surface: '#0d0c0f', panel: '#171419', 'panel-strong': '#1d191f', sidebar: '#19161a', ink: '#f3eef0', muted: '#a9a1a7', 'accent-soft': '#38242d', border: '#2b262d', 'rail-normal': '#643548', 'rail-major': '#754057' };
const NEUTRAL_LIGHT = { surface: '#fbf8f6', 'panel-strong': '#fff8fa', sidebar: '#f8f3f5', ink: '#2c2529', muted: '#7e7178', 'accent-soft': '#f2dce3', border: '#e8dfe2' };
const darkTokens = { ...Object.fromEntries(Object.entries(NEUTRAL_DARK).map(([k, v]) => [k, shiftHue(v, HUE)])),
  accent: P.accentDark, 'line-berry': P.decoInner, 'line-coral': P.accentDark, 'line-gold': P.decoOuter,
  'rail-hover': P.accentDark, 'rail-current': hsl2hex([HUE, 0.62, 0.71]) };
const lightTokens = { ...Object.fromEntries(Object.entries(NEUTRAL_LIGHT).map(([k, v]) => [k, shiftHue(v, HUE)])),
  accent: P.accentLight, 'line-berry': hsl2hex([HUE, 0.72, 0.33]), 'line-coral': P.decoInner, 'line-gold': hsl2hex([HUE, 0.45, 0.62]) };

/** 在一个极性块里按 token 重写值 */
const rewriteBlock = (css, polarity, tokens) => {
  const sel = `html.diana-zcode-host.theme-zai-${polarity}`;
  const start = css.indexOf(sel);
  if (start < 0) return css;
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  let block = css.slice(open + 1, close);
  let hits = 0;
  for (const [key, value] of Object.entries(tokens)) {
    const re = new RegExp(`(--diana-zcode-${key}\\s*:\\s*)[^;]+;`);
    if (re.test(block)) { block = block.replace(re, `$1${value};`); hits++; }
  }
  /* 半透明染色三元组统一用本极性的 accent RGB（diana 的写法就是这样） */
  const accentRgb = hex2rgb(tokens.accent).join(' ');
  block = block.replace(/rgb\((?:216 110 145|184 73 112|24 89 145|204 17 166|168 0 134)\s*\//g, `rgb(${accentRgb} /`);
  block = block.replace(/rgb\((?:170 161 167|180 162 177|161 165 169)\s*\/\s*58%\)/g, `rgb(${hex2rgb(shiftHue('#a9a1a7', HUE)).join(' ')} / 58%)`);
  block = block.replace(/rgb\((?:116 104 111|113 120 126|127 106 123)\s*\/\s*56%\)/g, `rgb(${hex2rgb(shiftHue('#7e7178', HUE)).join(' ')} / 56%)`);
  block = block.replace(/--color-background-alt:\s*rgb\([^)]*\);/g, `--color-background-alt: rgb(${hex2rgb(darkTokens['panel-strong']).join(' ')} / 68%);`);
  return { css: css.slice(0, open + 1) + block + css.slice(close), hits };
};
const rewrittenDark = rewriteBlock(dianaCss, 'dark', darkTokens);
const rewrittenBoth = rewriteBlock(rewrittenDark.css, 'light', lightTokens);

let themeCss = rewrittenBoth.css;

/* 暗色装饰改成"蒙版取形状 + token 取颜色"（与日间同构）。
 * 原来是 Diana 那套"直接铺素材 + brightness/saturate 压暗"—— 素材自带颜色就是显示色，
 * 于是每个主题都得单独重映射一版素材；换成蒙版后素材可以用 Diana 原文件，颜色全由 token 给。 */
const DARK_DECOR_REPLACE = [
  [/html\.diana-zcode-host\.theme-zai-dark #diana-zcode-chrome > \.diana-zcode-doodle \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark #diana-zcode-chrome > .diana-zcode-doodle {
  background: var(--diana-zcode-line-berry);
  -webkit-mask: var(--diana-zcode-image-doodle) center / contain no-repeat;
  mask: var(--diana-zcode-image-doodle) center / contain no-repeat;
  filter: drop-shadow(0 0 9px color-mix(in srgb, var(--diana-zcode-accent) 30%, transparent));
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-star \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-star {
  background: var(--diana-zcode-line-gold);
  -webkit-mask: var(--diana-zcode-image-star) center / contain no-repeat;
  mask: var(--diana-zcode-image-star) center / contain no-repeat;
  opacity: .7;
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--diana-zcode-accent) 26%, transparent));
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-candy \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-candy {
  background: var(--diana-zcode-line-coral);
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
  opacity: .78;
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--diana-zcode-accent) 26%, transparent));
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-candy-wrapped \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-candy-wrapped {
  -webkit-mask-image: var(--diana-zcode-image-candy-wrapped);
  mask-image: var(--diana-zcode-image-candy-wrapped);
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-candy-lollipop \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-candy-lollipop {
  -webkit-mask-image: var(--diana-zcode-image-candy-lollipop);
  mask-image: var(--diana-zcode-image-candy-lollipop);
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-acao \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-acao {
  background: var(--diana-zcode-line-berry);
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
  opacity: .6;
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--diana-zcode-accent) 22%, transparent));
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-acao-heart \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-acao-heart {
  -webkit-mask-image: var(--diana-zcode-image-acao-heart);
  mask-image: var(--diana-zcode-image-acao-heart);
}`],
  [/html\.diana-zcode-host\.theme-zai-dark \.diana-zcode-acao-cheer \{[^}]*\}/,
   `html.diana-zcode-host.theme-zai-dark .diana-zcode-acao-cheer {
  -webkit-mask-image: var(--diana-zcode-image-acao-cheer);
  mask-image: var(--diana-zcode-image-acao-cheer);
}`],
];
let ruleHits = 0;
for (const [re, to] of DARK_DECOR_REPLACE) {
  if (re.test(themeCss)) { themeCss = themeCss.replace(re, to); ruleHits++; }
}
console.log(`   暗色装饰规则改写 ${ruleHits}/${DARK_DECOR_REPLACE.length} 条（蒙版画法）`);
/* 立绘盒按素材纵横比**取向**：横构图立绘"定宽推高"、竖构图立绘"定高推宽" —— 否则 contain
   之后立绘会缩得比盒子小一大截（今汐那张是 0.648 的竖构图，照横构图的算法盒子会偏宽）。 */
const aspect = CROP.w / CROP.h;   // 盒子按**实际裁剪窗口**的比例定，不是原始并集框
/* 立绘框尺寸：**宽高上限要一起放**。只放大 MAX_W 会被 `height: min(85vh, boxH)` 卡住 ——
 * 盒子变宽但没变高，object-fit:contain 就会按高度缩回去，等于没放大（实测：宽 778 / 高 785 时
 * 视频只渲染到 657 宽）。用户要求显示尺寸 ×1.5：720/620 → 1080/930，高度上限 62vh → 85vh。 */
const MAX_W = 1080, MAX_H = 930;
const boxW = aspect >= 1 ? MAX_W : Math.round(MAX_H * aspect);
const boxH = aspect >= 1 ? Math.round(MAX_W / aspect) : MAX_H;
themeCss = themeCss.replace(
  /html\.diana-zcode-host \.diana-zcode-character-cluster \{[^}]*\}/,
  `html.diana-zcode-host .diana-zcode-character-cluster {\n  right: -12px;\n  bottom: -6px;\n  width: clamp(${Math.round(boxW * 0.6)}px, 60cqw, ${boxW}px);\n  height: min(85vh, ${boxH}px);\n}`,
);
/* 日间立绘：素材偏亮时在近白画布上会糊，加压暗与更实的投影 */
const lightFilterRe = /--diana-zcode-character-filter:\s*saturate\(\.96\)[^;]+;/;
if (lightFilterRe.test(themeCss)) {
  themeCss = themeCss.replace(lightFilterRe, `--diana-zcode-character-filter: saturate(.98) brightness(.97) contrast(1.04) drop-shadow(0 22px 40px rgb(${hex2rgb(A.dark).join(' ')} / 26%));`);
}
/* 头部注释：写清本主题的实测来源 */
const FRAME_DESC = COLORS_ONLY ? '帧序列' : `的 ${frames.length} 帧`;
const SOURCE_OF = SOURCE_LABEL || (SRC ? `${path.basename(path.dirname(SRC))} 动态序列` : '未知来源');
const header = `/* ${NAME} —— ZCode 皮肤样式层。\n *\n * **实现基准 = themes/diana/skin/theme.css**（明度阶梯、组件钩子、美术层几何、消息导轨全部照搬）；\n * 页面端运行时用全项目共享的 runtime/runtime-template.js。\n *\n * 配色由 tools/build-theme-motion.js 从立绘${FRAME_DESC}里**实测得出**（可重跑）：\n *   主色 ${A.main}（${hueOf(hex2rgb(A.main))}°）· 辉光 ${A.glow}（${hueOf(hex2rgb(A.glow))}°）· 近白 ${A.white} · 近黑 ${A.dark}\n *   → 族中心色相 ${HUE}°，强调色取辉光实测值（暗夜 ${P.accentDark} / 日间 ${P.accentLight}），\n *     涂鸦直接用 Diana 原文件，颜色由 CSS token（line-berry/coral/gold）给。\n * 中性角色的明度阶梯照搬 diana、只换色相 —— 直接改 S/L 会把 UI 层级搞坏。\n *\n * 素材来源：${SOURCE_OF}。\n * 立绘是**动态立绘**：清单里声明 assets.characterMotion（VP9+alpha 的 WebM），运行时挂成 <video> 从\n * file:// 播；下面 .diana-zcode-character-cluster 的盒子按素材纵横比 ${aspect.toFixed(3)} 定。 */\n`;
themeCss = header + themeCss;
fs.writeFileSync(path.join(OUT, 'skin', 'theme.css'), themeCss, 'utf-8');

/* tokens 表：把 diana 那份里出现过的键按本主题的值同步（两张表描述同一套映射） */
const dianaTokens = fs.readFileSync(path.join(DIANA, 'skin', 'zcode-tokens.css'), 'utf-8');
const syncTokens = (css, polarity, tokens) => {
  const sel = `html.diana-zcode-host.theme-zai-${polarity}`;
  const start = css.indexOf(sel);
  if (start < 0) return css;
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  let block = css.slice(open + 1, close);
  for (const [key, value] of Object.entries(tokens)) block = block.replace(new RegExp(`(--diana-zcode-${key}\\s*:\\s*)[^;]+;`), `$1${value};`);
  block = block.replace(/rgb\(\d+ \d+ \d+ \//g, `rgb(${hex2rgb(tokens.accent).join(' ')} /`);
  return css.slice(0, open + 1) + block + css.slice(close);
};
fs.writeFileSync(path.join(OUT, 'skin', 'zcode-tokens.css'), syncTokens(syncTokens(dianaTokens, 'dark', darkTokens), 'light', lightTokens), 'utf-8');
fs.copyFileSync(path.join(DIANA, 'skin', 'zcode-artwork-contract.css'), path.join(OUT, 'skin', 'zcode-artwork-contract.css'));

/* theme.json */
const assets = {
  characterMotion: 'assets/character-motion.webm',
  characterDark: 'assets/character-still.webp',
  characterLight: 'assets/character-still.webp',
  doodle: 'assets/doodle.png', upper: 'assets/upper.png', corner: 'assets/corner.png', star: 'assets/star.png',
  candyWrapped: 'assets/candy-wrapped.png', candyLollipop: 'assets/candy-lollipop.png',
  acaoHeart: 'assets/acao-heart.png', acaoCheer: 'assets/acao-cheer.png',
};
const manifest = {
  schemaVersion: 1,
  id: ID,
  name: NAME,
  author: COLORS_ONLY && !SOURCE_LABEL ? (EXISTING.author || `立绘：${SOURCE_OF} · 涂鸦：Diana 线稿换色 · 实现基准：themes/diana`)
    : `立绘：${SOURCE_OF} · 涂鸦：Diana 线稿换色 · 实现基准：themes/diana`,
  adapterVersion: `painting-skin-${ID}-v1`,
  app: { id: 'zcode', processName: 'ZCode.exe', debugPort: 9344, targetUrlHint: 'renderer/index.html', rendererHostClass: 'diana-zcode-host' },
  skin: { css: 'skin/theme.css', tokens: 'skin/zcode-tokens.css', artworkContract: 'skin/zcode-artwork-contract.css' },
  assets,
  modes: ['auto', 'dark', 'light'],
  /* colors-only：**沿用原有 notes**（那些描述的是已经优化过的视频：循环帧数、交付尺寸、CRF），
   * 只把"配色实测"那一行换掉 —— 否则会被重写成源帧数（400 帧）与实际交付（100 帧）不符。 */
  notes: COLORS_ONLY ? EXISTING.notes.map((line, i) => (
    i === EXISTING.notes.findIndex((l) => l.includes('**配色实测**'))
      ? `**配色实测**（暗夜 accent ${P.accentDark}、日间 ${P.accentLight}、族中心 ${HUE}°）：主色 ${A.main} / 辉光 ${A.glow} / 近白 ${A.white} / 近黑 ${A.dark}；中性角色明度阶梯照搬 diana、只换色相。`
      : line)) : [
    '**由 tools/build-theme-motion.js 生成**（可重跑）：量帧序列的并集内容框与配色锚点 → 编码动态立绘 → 换 Diana 的涂鸦线色 → 以 diana 为基准重写主题色。手改样式前先看那个脚本，别让下次重跑把它们冲掉。',
    `**动态立绘**：${SKIP_MOTION
      ? `源是 ${frames.length} 帧 30fps 的带 alpha 序列（裁剪窗口 ${CROP.w}×${CROP.h} @(${CROP.x},${CROP.y})，只切掉四周全透明空白；并集保证每帧的飘带都在框内）。交付视频由 tools/optimize-motion.js 按**该主题实测显示宽（×1）**重编（最小无缝循环 + 视觉无损 CRF 档），**实际循环帧数 / 交付尺寸 / CRF 记在同目录的 assets/character-motion.webm.json**`
      : `assets/character-motion.webm 是 ${frames.length} 帧 VP9 + alpha（裁剪窗口 ${CROP.w}×${CROP.h} @(${CROP.x},${CROP.y})，只切掉四周全透明空白；并集保证每帧的飘带都在框内）`}，运行时挂成 <video> 从 file:// 播，**不受 data URI 长度限制**（内联大图/视频会撑爆单条 CSS 声明并被静默丢弃）。assets/character-still.webp 是同构图静止帧：面板中央立绘用它，页面里视频加载失败时作 CSS 背景兜底。`,
    `**涂鸦直接使用 Diana 的原文件**（与源文件逐字节一致）：两种极性都走「形状取自素材 alpha 蒙版、颜色取自 token」，所以源文件的 RGB 不参与显示，换主题只改 token、不需要重映射一版素材。`,
    ...(CLEAN_GLOW ? [CLEAN_NOTE] : []),
    `**配色实测**（暗夜 accent ${P.accentDark}、日间 ${P.accentLight}、族中心 ${HUE}°）：主色 ${A.main} / 辉光 ${A.glow} / 近白 ${A.white} / 近黑 ${A.dark}；中性角色明度阶梯照搬 diana、只换色相。`,
  ],
};
fs.writeFileSync(path.join(OUT, 'theme.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

/* ---------- ⑤ 报告 ---------- */
const sizes = (dir) => fs.readdirSync(dir).filter((f) => /\.(png|webp|webm)$/.test(f)).map((f) => ({ f, kb: Math.round(fs.statSync(path.join(dir, f)).size / 1024) }));
const list = sizes(path.join(OUT, 'assets'));
const total = list.reduce((s, r) => s + r.kb, 0);
console.log('\nrole                    体积');
for (const r of list.sort((a, b) => b.kb - a.kb)) console.log(`  ${r.f.padEnd(24)}${r.kb} KB`);
console.log(`  合计 ${total} KB`);
console.log(`  alpha 结构自检：${COLORS_ONLY ? '— colors-only 未重新编码（沿用现有视频）' : SKIP_MOTION ? '— skip-motion 未编码（交付视频由 optimize-motion.js 写，alpha 在那边自证）' : alphaOK ? '✅ ffmpeg 输出 yuva420p' : '❌ 没报 yuva420p，alpha 可能丢了'}`);
const pink = /#(d86e91|b84970|cc758a|a95f7a|b99a6a)/i.test(themeCss);
console.log(`  旧配色残留自检：${pink ? '❌ 还有 diana 粉色 token' : '✅ 无 diana 旧色'}`);
console.log(`  写入 themes/${ID}/（theme.json + skin/ 三份 + assets/ ${list.length} 个）`);
