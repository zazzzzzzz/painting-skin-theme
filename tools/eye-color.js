/* 从立绘里量出"眼睛的颜色"（给"整族配色"定基准）。
 *
 *   node tools/eye-color.js [图片路径] [--box x0,y0,x1,y1] [--band 0.26] [--all-hues]
 *
 * 默认图片是 themes/butterfly-line/assets/character.png；默认只在**上 26%**（头部）里统计，
 * 并且只保留「蓝 > 绿」的品红/紫色系像素 —— 皮肤是 R>G>B、头发多为低饱和，用这一条就能把虹膜
 * 单独摘出来（实测：眼睛框内 1978 个暖色像素 vs 363 个品红像素，后者全是虹膜）。
 * `--all-hues` 关掉这个过滤（给非品红眼睛的角色用，例如金瞳 / 青瞳）。
 *
 * 报出：
 *   ① 头部裁剪放大 2× 存到 tools/work/face-crop.png（肉眼看眼睛在哪、什么色）
 *   ② 头部粗网格的"最饱和色"（每格一个 hex），定位虹膜所在格子
 *   ③ 全图 / 头部的"高频饱和色簇"（量化到 5bit/通道计频）
 *   ④ 品红家族像素的四个代表档：均值 / 最饱和 15% / 最暗 25% / 最亮 10%，
 *      以及建议的 palette 锚点（强调色取最饱和 15% 的均值，日间用同色相压到 L33%）
 *
 * 只读素材，中间产物写 tools/work/。本项目当前配色即由它得出（见 themes/butterfly-line/theme.json）。 */

const fs = require('fs');
const path = require('path');
const { decode, encode } = require('./png');

const ROOT = path.resolve(__dirname, '..');
const WORK = path.join(ROOT, 'tools', 'work');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const FILE = argv.find((a) => !a.startsWith('--') && /\.png$/i.test(a)) || path.join(ROOT, 'themes', 'butterfly-line', 'assets', 'character.png');
const BAND = Number(flag('band', '0.26'));
const BOX = (flag('box', '') || '').split(',').map(Number);
const ALL_HUES = argv.includes('--all-hues');

const image = decode(fs.readFileSync(FILE));
const { width, height, channels, data } = image;
const at = (x, y) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2], channels === 4 ? data[i + 3] : 255]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const sat = (c) => { const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]); return mx ? (mx - mn) / mx : 0; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hue = (c) => {
  const mx = Math.max(...c), mn = Math.min(...c);
  if (mx === mn) return 0;
  let h;
  if (mx === c[0]) h = ((c[1] - c[2]) / (mx - mn)) % 6;
  else if (mx === c[1]) h = (c[2] - c[0]) / (mx - mn) + 2;
  else h = (c[0] - c[1]) / (mx - mn) + 4;
  return Math.round((h * 60 + 360) % 360);
};
const mean = (list) => [0, 1, 2].map((k) => list.reduce((s, p) => s + p[k], 0) / list.length);
const rgb2hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = (h * 60 + 360) % 360; }
  const l = (mx + mn) / 2;
  return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
};
const hsl2rgb = ([h, s, l]) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = h / 60, x = c * (1 - Math.abs(hp % 2 - 1));
  const t = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return t.map((v) => Math.round((v + m) * 255));
};
/* 眼睛像素：品红/紫系 = 蓝>绿（皮肤/头发多为绿>=蓝）；--all-hues 时不筛 */
const isEyeFamily = (p) => ALL_HUES || p[2] > p[1];

console.log(`图片 ${path.relative(ROOT, FILE)}  ${width}×${height} ch=${channels}`);
console.log(`统计区：${BOX.length === 4 ? `指定框 ${BOX.join(',')}` : `上 ${(BAND * 100).toFixed(0)}%（头部）`}｜色系过滤：${ALL_HUES ? '关（全部色相）' : '品红/紫系（蓝>绿）'}\n`);

/* ① 头部裁剪 + 2× 放大 */
const BAND_H = Math.round(height * BAND);
const SCALE = 2;
const crop = { width: width * SCALE, height: BAND_H * SCALE, data: new Float32Array(width * SCALE * BAND_H * SCALE * 4) };
for (let y = 0; y < BAND_H * SCALE; y++) {
  for (let x = 0; x < width * SCALE; x++) {
    const p = at(Math.floor(x / SCALE), Math.floor(y / SCALE));
    const i = (y * crop.width + x) * 4;
    crop.data[i] = p[0] / 255; crop.data[i + 1] = p[1] / 255; crop.data[i + 2] = p[2] / 255; crop.data[i + 3] = p[3] / 255;
  }
}
fs.mkdirSync(WORK, { recursive: true });
const cropFile = path.join(WORK, 'face-crop.png');
fs.writeFileSync(cropFile, encode(crop));
console.log(`① 头部裁剪 → ${path.relative(ROOT, cropFile)}（${crop.width}×${crop.height}）`);

/* ② 粗网格：每格取"最饱和且不太暗"的那个像素 */
const COLS = 16, ROWS = 12;
const cw = Math.floor(width / COLS), chh = Math.floor(BAND_H / ROWS);
console.log('\n② 头部网格（每格 = 该格内最饱和像素；透明记作 ··）');
for (let r = 0; r < ROWS; r++) {
  const row = [];
  for (let c = 0; c < COLS; c++) {
    let best = null, bestScore = -1;
    for (let y = r * chh; y < (r + 1) * chh; y++) {
      for (let x = c * cw; x < (c + 1) * cw; x++) {
        const p = at(x, y);
        if (p[3] < 100) continue;
        const score = sat(p) * 1.6 + lum(p) / 255;
        if (score > bestScore) { bestScore = score; best = p; }
      }
    }
    row.push(best ? hex(best).padEnd(8) : '··'.padEnd(8));
  }
  console.log(`  y${String(Math.round((r * chh / height) * 100)).padStart(2)}%  ${row.join('')}`);
}
console.log(`  （列按 x 每 ${(100 / COLS).toFixed(1)}% 一档）`);

/* ③ 高频饱和色簇 */
function clusters(label, y0, y1) {
  const map = new Map();
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y);
      if (p[3] < 200) continue;
      total++;
      if (sat(p) < 0.25 || lum(p) < 40) continue;
      const key = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
      const e = map.get(key);
      if (e) { e.n++; e.r += p[0]; e.g += p[1]; e.b += p[2]; } else map.set(key, { n: 1, r: p[0], g: p[1], b: p[2] });
    }
  }
  const list = [...map.values()].sort((a, b) => b.n - a.n).slice(0, 10)
    .map((e) => ({ hex: hex([e.r / e.n, e.g / e.n, e.b / e.n]), n: e.n, pct: (e.n / total) * 100 }));
  console.log(`\n③ ${label}（不透明像素 ${total}）`);
  for (const e of list) console.log(`   ${e.hex}  ${String(e.n).padStart(7)}  ${e.pct.toFixed(3)}%`);
}
clusters('头部区域', 0, BAND_H);
clusters('全身', 0, height);

/* ④ 眼睛像素的四个代表档 + palette 锚点 */
const [x0, y0, x1, y1] = BOX.length === 4 ? BOX : [0, 0, width, BAND_H];
const eyes = [];
for (let y = Math.max(0, y0); y < Math.min(height, y1); y++) {
  for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) {
    const p = at(x, y);
    if (p[3] < 200 || sat(p) < 0.45 || lum(p) < 60 || !isEyeFamily(p)) continue;
    eyes.push(p);
  }
}
if (!eyes.length) {
  console.log('\n④ 没找到眼睛像素：试试 --box 收紧到眼睛、或 --all-hues 放宽色系');
  process.exit(0);
}
const bySat = [...eyes].sort((a, b) => sat(b) - sat(a));
const byLum = [...eyes].sort((a, b) => lum(b) - lum(a));
const core = mean(bySat.slice(0, Math.max(1, Math.floor(bySat.length * 0.15))));
const mid = mean(eyes);
const dark25 = mean(byLum.slice(-Math.max(1, Math.floor(byLum.length * 0.25))));
const bright10 = mean(byLum.slice(0, Math.max(1, Math.floor(byLum.length * 0.1))));
const [h, s] = rgb2hsl(core);
console.log(`\n④ 眼睛像素 ${eyes.length} 个（饱和 ≥.45、亮度 ≥60${ALL_HUES ? '' : '、蓝>绿'}）`);
console.log(`   均值        ${hex(mid)}  hue ${hue(mid)}`);
console.log(`   最饱和 15%  ${hex(core)}  hue ${hue(core)}  sat ${sat(core).toFixed(2)}   ← 建议作强调色（暗夜）`);
console.log(`   最暗 25%    ${hex(dark25)}`);
console.log(`   最亮 10%    ${hex(bright10)}`);
console.log(`   palette 锚点：暗夜 accent ${hex(core)}｜日间 accent ${hex(hsl2rgb([h, 1, 0.33]))}（同色相压到 L33%）｜族中心建议 hue ${Math.round(h)}~${Math.round(hue(dark25))}`);
