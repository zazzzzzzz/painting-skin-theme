/* 守岸人 · 8 个装饰槽位的线稿素材（母题取自 C_ShouAnRen_01 立绘）
 *
 *   node tools/draw-shorekeeper.js [--palette diana|abyss] [--out 目录]
 *
 * 画法、配色、三层描边与批量出图都在 tools/draw-kit.js；这里只写母题。
 * 画布与线宽基准来自 themes/diana/assets/ 的实测（node tools/ink-metrics.js）：
 *   doodle 1267x1241 着墨 7.98% 线宽中位 8px ｜ star 256 12.16% 12px ｜ corner 1600x485 0.72% 5px
 */

const fs = require('fs');
const path = require('path');
const { kit, render } = require('./draw-kit');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PALETTE = argOf('palette', 'diana');
const OUT = argOf('out', path.join(__dirname, 'work', 'shorekeeper', PALETTE));

const K = kit(PALETTE);
const { createCanvas, catmullRom, wobble, ink, taper, dashPath, circlePts, petalPts, wingPts, sparkle, dot, beads, makeRng, TAU } = K;
const P = K.P;
const CORE_GLOW = K.GLOW;                       // 发光类母题的芯色

/* ---------- 槽位 1：doodle 蝶形光灵 + 发端星空 + 薄纱尖角 ---------- */

function drawDoodle(width = 1267, height = 1241) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(20260921);
  const W0 = 7.2;                                 // 外层线宽（对齐 Diana 的 8px 中位）

  /* 中央：侧视四翼蝶形光灵 */
  const bx = 412, by = 498, sc = 1.18;
  ink(canvas, circlePts(bx, by, 26 * sc, 0, TAU, 40), { width: W0 * 0.85 });      // 身体
  ink(canvas, catmullRom([[bx - 6, by - 18], [bx - 2, by - 4], [bx + 3, by + 14]], 10), { width: W0 * 0.7 });
  const wings = [
    [300, -0.62, 1.0], [300, 0.62, 1.0],          // 上翼
    [190, -1.05, 0.86], [190, 1.05, 0.86],        // 下翼
  ];
  for (const [len, ang, w] of wings) {
    const pts = wingPts(bx, by, len * sc, 118 * sc * w, ang, 0.55);
    ink(canvas, pts, { width: W0 * 0.95 });
    // 翅内沿翅缘的中线 + 翅脉排线
    const mid = wingPts(bx, by, len * sc * 0.78, 62 * sc * w, ang, 0.5);
    ink(canvas, dashPath(mid, 0.94), { width: W0 * 0.55, alpha: 0.85, skirt: 0 });
    for (let i = 1; i <= 3; i++) {
      const vein = wingPts(bx, by, len * sc * (0.22 + i * 0.18), 118 * sc * w, ang, 0.55);
      ink(canvas, dashPath(vein, 0.5, 0.1), { width: W0 * 0.4, alpha: 0.6, skirt: 0 });
    }
  }
  // 触须与尾丝
  ink(canvas, catmullRom([[bx + 20, by - 16], [bx + 62, by - 46], [bx + 96, by - 40]], 12), { width: W0 * 0.55, alpha: 0.9 });
  ink(canvas, catmullRom([[bx + 22, by + 10], [bx + 70, by + 34], [bx + 118, by + 30]], 12), { width: W0 * 0.55, alpha: 0.9 });
  const tail = catmullRom([[bx - 24, by + 6], [bx - 90, by + 62], [bx - 150, by + 96], [bx - 196, by + 92]], 14);
  taper(canvas, tail, { width: W0 * 0.6, endScale: 0.12, alpha: 0.9 });
  // 飘出的两条飘带卷
  for (const [a0, sweep, len] of [[0.35, 1.5, 210], [0.62, 1.1, 168]]) {
    const curl = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const a = a0 + sweep * t * 0.8;
      curl.push([bx + 40 + Math.cos(a) * len * t, by - 60 + Math.sin(a) * len * t * 0.55]);
    }
    taper(canvas, curl, { width: W0 * 0.55, endScale: 0.1, alpha: 0.85 });
  }

  /* 右上的小蝶（正面），把团块往右上延伸 */
  const bx2 = 812, by2 = 706;
  ink(canvas, catmullRom([[bx2, by2 - 34], [bx2 - 4, by2], [bx2, by2 + 34]], 12), { width: W0 * 0.6 });
  for (const side of [-1, 1]) {
    ink(canvas, wingPts(bx2, by2 - 12, 112, 88, side > 0 ? -0.4 : Math.PI + 0.4, 0.6), { width: W0 * 0.7 });
    ink(canvas, wingPts(bx2, by2 + 16, 78, 58, side > 0 ? 0.34 : Math.PI - 0.34, 0.5), { width: W0 * 0.6 });
    ink(canvas, catmullRom([[bx2 + side * 3, by2 - 38], [bx2 + side * 20, by2 - 64], [bx2 + side * 34, by2 - 70]], 10), { width: W0 * 0.35, alpha: 0.85, skirt: 0 });
  }

  /* 左下发端星空：一条沿弧线走的宽带 + 星点 */
  const band = catmullRom([[-40, 1150], [180, 1075], [430, 1040], [660, 1085], [830, 1180]], 16);
  for (const side of [-1, 1]) {
    taper(canvas, band.map(([x, y]) => [x, y + side * 34]), { width: W0 * 0.62, endScale: 0.14, alpha: 0.92 });
  }
  for (let i = 0; i < 46; i++) {
    const t = rng();
    const idx = Math.min(band.length - 1, Math.floor(t * band.length));
    const [x, y] = band[idx];
    const off = (rng() - 0.5) * 58;
    dot(canvas, x + off * 0.4, y + off, 2.2 + rng() * 3.4, 0.75 + rng() * 0.25);
  }
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor((0.12 + i * 0.25) * (band.length - 1));
    const [x, y] = band[idx];
    sparkle(canvas, x + (i - 1.5) * 16, y - 30 + i * 14, 15 + i * 3, 0.85);
  }

  /* 四芒星 */
  sparkle(canvas, 858, 296, 46, 0.95);
  sparkle(canvas, 250, 262, 27, 0.8);
  sparkle(canvas, 1002, 906, 33, 0.85);
  sparkle(canvas, 636, 286, 19, 0.7);

  /* 外缘七片尖角薄纱，片内带排线 */
  const sheers = [
    [700, 470, 268, 0.2], [560, 690, 196, 0.9], [862, 336, 158, -0.28],
    [1048, 706, 242, -0.06], [1092, 1010, 186, 0.86], [214, 452, 172, 1.35],
  ];
  for (const [x, y, len, ang] of sheers) {
    const pts = petalPts(x, y, len, len * 0.3, ang, len * 0.1);
    ink(canvas, pts, { width: W0 * 0.8 });
    ink(canvas, petalPts(x, y, len * 0.72, len * 0.16, ang, len * 0.08), { width: W0 * 0.5, alpha: 0.85, skirt: 0 });
    for (let i = 1; i <= 3; i++) {
      const hatch = petalPts(x, y, len * (0.3 + i * 0.16), len * 0.26, ang, len * 0.1);
      ink(canvas, dashPath(hatch, 0.42, 0.05 * i), { width: W0 * 0.34, alpha: 0.55, skirt: 0 });
    }
  }

  /* 五簇涂鸦排线（Diana 那张的内部纹理感） */
  const clusters = [[300, 660, 0.4], [560, 430, 2.2], [150, 800, 3.6], [430, 830, 1.2], [700, 570, 5.0], [260, 300, 2.9]];
  for (const [cx, cy, a0] of clusters) {
    for (let i = 0; i < 7; i++) {
      const a = a0 + i * 0.22;
      const len = 44 + rng() * 40;
      const x = cx + Math.cos(a) * (18 + i * 5), y = cy + Math.sin(a) * (14 + i * 4);
      const wig = catmullRom([[x, y], [x + Math.cos(a) * len * 0.5 + 4, y + Math.sin(a) * len * 0.5], [x + Math.cos(a) * len, y + Math.sin(a) * len + 3]], 10);
      taper(canvas, wig, { width: W0 * 0.38, endScale: 0.2, alpha: 0.6, chunks: 6 });
    }
  }
  // 第三只小蝶（左下，压住星空带的一端）
  const bx3 = 268, by3 = 940;
  ink(canvas, catmullRom([[bx3, by3 - 24], [bx3 - 3, by3], [bx3, by3 + 24]], 12), { width: W0 * 0.55 });
  for (const side of [-1, 1]) {
    ink(canvas, wingPts(bx3, by3 - 8, 96, 74, side > 0 ? -0.44 : Math.PI + 0.44, 0.6), { width: W0 * 0.62 });
    ink(canvas, wingPts(bx3, by3 + 12, 66, 48, side > 0 ? 0.3 : Math.PI - 0.3, 0.5), { width: W0 * 0.55 });
  }
  return canvas;
}

/* ---------- 槽位 2：star 四芒星 + 涟漪环 ---------- */

function drawStar(width = 256, height = 256) {
  const canvas = createCanvas(width, height);
  const W0 = 15;                                   // 小画布的线相对更粗（实测 12px 中位）
  sparkle(canvas, 128, 128, 86, 1, W0);
  ink(canvas, circlePts(128, 128, 13, 0, TAU, 40), { width: W0 * 0.5 });
  // 四角外侧的涟漪弧
  ink(canvas, circlePts(128, 128, 104, -0.5, 0.42, 40), { width: W0 * 0.42, alpha: 0.8, skirt: 0 });
  ink(canvas, circlePts(128, 128, 118, 1.06, 1.9, 40), { width: W0 * 0.42, alpha: 0.75, skirt: 0 });
  ink(canvas, circlePts(128, 128, 96, 2.5, 3.3, 40), { width: W0 * 0.42, alpha: 0.7, skirt: 0 });
  ink(canvas, circlePts(128, 128, 112, 3.9, 4.75, 40), { width: W0 * 0.42, alpha: 0.65, skirt: 0 });
  const dots = [[40, 46, 4], [216, 52, 3.2], [52, 210, 3.6], [206, 206, 4.4], [128, 24, 3], [30, 128, 2.8], [228, 132, 3.4]];
  for (const [x, y, r] of dots) dot(canvas, x, y, r, 0.8);
  return canvas;
}

/* ---------- 槽位 3：candy-wrapped 花瓣光冠 ---------- */

function drawCandyWrapped(width = 256, height = 256) {
  const canvas = createCanvas(width, height);
  const W0 = 2.8;
  const rootX = 128, rootY = 208;
  const petals = [[-1.15, 118], [-0.62, 168], [0, 196], [0.62, 168], [1.15, 118]];
  for (const [ang, len] of petals) {
    const cx = rootX + Math.sin(ang) * 6, cy = rootY;
    const a = ang - Math.PI / 2;
    const pts = petalPts(cx, cy, len, len * 0.32, a, len * 0.05);
    ink(canvas, pts, { width: W0 });
    ink(canvas, petalPts(cx, cy, len * 0.5, len * 0.1, a, len * 0.04), { width: W0 * 0.62, alpha: 0.8, skirt: 0, coreColor: CORE_GLOW });
  }
  ink(canvas, circlePts(rootX, rootY + 6, 26, 0.15, Math.PI - 0.15, 40), { width: W0 * 0.9 });
  ink(canvas, catmullRom([[rootX - 34, rootY + 22], [rootX, rootY + 30], [rootX + 34, rootY + 22]], 12), { width: W0 * 0.6, alpha: 0.8, skirt: 0 });
  const motes = [[78, 120, 3], [176, 112, 2.6], [58, 168, 2.4], [196, 160, 3.2], [128, 52, 2.8], [104, 78, 2.2], [156, 82, 2.2]];
  for (const [x, y, r] of motes) dot(canvas, x, y, r, 0.75);
  return canvas;
}

/* ---------- 槽位 4：candy-lollipop 足尖水花 ---------- */

function drawCandyLollipop(width = 256, height = 256) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(97021);
  const W0 = 3.0;
  const baseX = 128, baseY = 214;

  // 七到九条水舌
  const tongues = [[-1.3, 112, 0.9], [-0.95, 138, 1], [-0.6, 152, 0.85], [-0.18, 128, 0.8], [0.28, 156, 1], [0.72, 140, 0.85], [1.18, 118, 0.9]];
  for (const [ang, len, w] of tongues) {
    const a = -Math.PI / 2 + ang * 0.62;
    const pts = petalPts(baseX, baseY, len, len * 0.32 * w, a, len * 0.12);
    ink(canvas, pts, { width: W0 * 0.8, glow: true });
  }
  // 三到五条断丝（只剩尖端）
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.4;
    const len = 86 + rng() * 54;
    const pts = petalPts(baseX, baseY, len, len * 0.2, a, len * 0.16);
    ink(canvas, dashPath(pts, 0.34), { width: W0 * 0.6, alpha: 0.85, glow: true, skirt: 0 });
  }
  // 底部窄口 + 两侧涟漪
  ink(canvas, circlePts(baseX, baseY, 30, Math.PI + 0.5, TAU - 0.5, 40), { width: W0 });
  ink(canvas, circlePts(baseX - 6, baseY + 6, 70, Math.PI + 0.8, TAU - 0.8, 50), { width: W0 * 0.4, alpha: 0.6, skirt: 0 });
  // 飞沫
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (rng() - 0.5) * 2.9;
    const r = 62 + rng() * 96;
    const x = baseX + Math.cos(a) * r * 0.9, y = baseY + Math.sin(a) * r * 0.75;
    if (rng() < 0.55) dot(canvas, x, y, 2 + rng() * 3, 0.7 + rng() * 0.3);
    else {
      const arc = circlePts(x, y, 5 + rng() * 6, rng() * 2, rng() * 2 + 2.4, 22);
      ink(canvas, arc, { width: W0 * 0.3, alpha: 0.6, skirt: 0 });
    }
  }
  return canvas;
}

/* ---------- 槽位 5：acao-heart 金丝环扣 ---------- */

function drawAcaoHeart(width = 512, height = 512) {
  const canvas = createCanvas(width, height);
  const W0 = 5.6;
  const gold = { outer: P.gold, coreColor: P.goldCore, skirt: 0 };
  const cx = 246, cy = 252, R = 118;

  ink(canvas, circlePts(cx, cy, R, 0, TAU, 80), { width: W0, ...gold });          // 主环
  ink(canvas, circlePts(cx, cy, R - 9, 0, TAU, 80), { width: W0 * 0.45, alpha: 0.8, ...gold }); // 双股
  // 相扣的三枚小环
  const r2 = 34, ax = cx + R * Math.cos(-0.62), ay = cy + R * Math.sin(-0.62);
  ink(canvas, circlePts(ax, ay, r2, 0, TAU, 44), { width: W0 * 0.8, ...gold });
  ink(canvas, circlePts(ax + 30, ay - 26, r2 * 0.86, 0, TAU, 44), { width: W0 * 0.8, ...gold });
  ink(canvas, circlePts(ax + 62, ay - 6, r2 * 0.7, 0, TAU, 40), { width: W0 * 0.72, ...gold });
  // 波浪细链（左上长链 + 右下短链）
  const chain = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    chain.push([cx - R - 12 - t * 118, cy + 26 + Math.sin(t * 15.5) * 11 - t * 40]);
  }
  ink(canvas, chain, { width: W0 * 0.55, alpha: 0.92, ...gold });
  const chain2 = [];
  for (let i = 0; i <= 42; i++) {
    const t = i / 42;
    chain2.push([cx + 30 + t * 128, cy + R + 14 + Math.sin(t * 12) * 9 + t * 26]);
  }
  ink(canvas, chain2, { width: W0 * 0.5, alpha: 0.88, ...gold });
  // 两条平行直线 + 末端圆点
  for (const off of [0, 12]) {
    const line = catmullRom([[cx - R - 4, cy + 96 + off], [cx - R - 70, cy + 120 + off], [cx - R - 132, cy + 116 + off]], 12);
    ink(canvas, line, { width: W0 * 0.5, alpha: 0.9, ...gold });
  }
  dot(canvas, cx - R - 136, cy + 106, 3.2, 0.9);
  dot(canvas, cx - R - 136, cy + 128, 3.2, 0.9);
  // 四瓣小花 + 流苏
  const fx = cx + 96, fy = cy + 208;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU - 0.5;
    ink(canvas, circlePts(fx + Math.cos(a) * 17, fy + Math.sin(a) * 17, 15, 0, TAU, 30), { width: W0 * 0.6, ...gold });
  }
  dot(canvas, fx, fy, 3.4, 0.9);
  for (let i = 0; i < 3; i++) {
    ink(canvas, catmullRom([[fx - 12 + i * 12, fy + 30], [fx - 14 + i * 12, fy + 46], [fx - 10 + i * 12, fy + 62]], 10), { width: W0 * 0.35, alpha: 0.85, ...gold });
  }
  // 环内小点
  for (const [dx, dy] of [[-46, -52], [38, -58], [-58, 30], [56, 34], [4, 84], [-14, -8], [26, 10], [-32, 52], [16, -34]]) dot(canvas, cx + dx, cy + dy, 3.2, 0.8);
  return canvas;
}

/* ---------- 槽位 6：acao-cheer 正面展翅蝶 ---------- */

function drawAcaoCheer(width = 512, height = 512) {
  const canvas = createCanvas(width, height);
  const W0 = 6.8;
  const cx = 256, cy = 268;

  // 身体
  ink(canvas, catmullRom([[cx, cy - 96], [cx - 7, cy - 20], [cx, cy + 62], [cx + 3, cy + 96]], 16), { width: W0 * 0.8 });
  ink(canvas, circlePts(cx, cy - 96, 12, 0, TAU, 30), { width: W0 * 0.6 });
  for (const dy of [-40, 0, 40]) dot(canvas, cx + 1, cy + dy, 3.4, 0.8);
  // 上翼（大、尖、外缘内凹）
  for (const side of [-1, 1]) {
    const up = wingPts(cx + side * 12, cy - 34, 214, 168, side > 0 ? -0.42 : Math.PI + 0.42, 0.62);
    ink(canvas, up, { width: W0, glow: true });
    ink(canvas, wingPts(cx + side * 12, cy - 34, 168, 96, side > 0 ? -0.36 : Math.PI + 0.36, 0.55), { width: W0 * 0.5, alpha: 0.85, skirt: 0, coreColor: CORE_GLOW });
    const low = wingPts(cx + side * 12, cy + 46, 150, 112, side > 0 ? 0.38 : Math.PI - 0.38, 0.5);
    ink(canvas, low, { width: W0 * 0.92, glow: true });
    ink(canvas, wingPts(cx + side * 12, cy + 46, 112, 62, side > 0 ? 0.3 : Math.PI - 0.3, 0.45), { width: W0 * 0.45, alpha: 0.8, skirt: 0, coreColor: CORE_GLOW });
    // 翅根放射短线
    for (let i = 0; i < 3; i++) {
      const a = (side > 0 ? -0.5 : Math.PI + 0.5) - side * 0.3 + i * 0.26 * side;
      ink(canvas, [[cx + side * 16, cy - 30], [cx + side * 16 + Math.cos(a) * 46, cy - 30 + Math.sin(a) * 46]], { width: W0 * 0.4, alpha: 0.85, skirt: 0 });
    }
    // 触须
    const ant = catmullRom([[cx + side * 6, cy - 104], [cx + side * 34, cy - 148], [cx + side * 58, cy - 160]], 12);
    taper(canvas, ant, { width: W0 * 0.45, endScale: 0.16, alpha: 0.95 });
    sparkle(canvas, cx + side * 92, cy + 118, 22, 0.8);
  }
  // 下翼外缘浅波浪
  for (const side of [-1, 1]) {
    const wave = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = (side > 0 ? 0.9 : Math.PI - 0.9) + side * t * 0.9;
      wave.push([cx + Math.cos(a) * (150 + Math.sin(t * 9) * 5), cy + 60 + Math.sin(a) * 104]);
    }
    ink(canvas, wave, { width: W0 * 0.45, alpha: 0.75, skirt: 0 });
  }
  return canvas;
}

/* ---------- 槽位 7：corner 飘带长弧 ---------- */

function drawCorner(width = 1600, height = 485) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(77021);
  const W0 = 1.5;

  const spine = catmullRom([[-40, 372], [220, 300], [520, 330], [820, 236], [1120, 262], [1420, 150], [1660, 96]], 18);
  taper(canvas, wobble(spine, 2.4, 180, 1.3), { width: W0, endScale: 0.1, alpha: 0.95 });
  // 中段分叉
  const fork = catmullRom([[820, 236], [960, 214], [1100, 232], [1260, 206]], 16);
  taper(canvas, wobble(fork, 1.8, 120, 4.1), { width: W0 * 0.62, endScale: 0.12, alpha: 0.9 });
  // 外侧两三条平行细弧
  for (const [off, len, alpha] of [[-26, 0.36, 0.75], [-44, 0.24, 0.55]]) {
    const seg = spine.slice(Math.floor(spine.length * 0.3), Math.floor(spine.length * 0.3 + spine.length * len));
    if (seg.length < 4) continue;
    taper(canvas, seg.map(([x, y]) => [x, y + off]), { width: W0 * 0.42, endScale: 0.1, alpha, skirt: 0 });
  }
  // 一小簇：四芒星 + 小圆点
  sparkle(canvas, 706, 296, 30, 0.85);
  for (let i = 0; i < 3; i++) dot(canvas, 662 + rng() * 120, 272 + rng() * 60, 2.4 + rng() * 3, 0.65);
  return canvas;
}

/* ---------- 槽位 8：upper 蕾丝波浪 + 珠链 ---------- */

function drawUpper(width = 490, height = 315) {
  const canvas = createCanvas(width, height);
  const W0 = 1.7;
  const scallops = 11, x0 = 14, x1 = width - 14, y = 188;
  const span = (x1 - x0) / scallops;

  // 扇贝波浪：从左到右齿高渐收，到两端渐隐
  for (let i = 0; i < scallops; i++) {
    const cx = x0 + span * (i + 0.5);
    const t = i / (scallops - 1);
    const h = 40 * (1 - 0.42 * t) * Math.min(1, Math.min(i, scallops - 1 - i) / 1.6 + 0.25);
    const a = i === 0 ? 0.28 : 0.06;
    const wave = circlePts(cx, y, span * 0.52, Math.PI + a, TAU - a, 26);
    taper(canvas, wave.map(([px, py]) => [px, y - (y - py) * (h / 42)]), { width: W0 * 0.72, endScale: 0.16, alpha: 0.9 - 0.35 * Math.abs(t - 0.5) * 2 * 0.6 });
  }
  // 谷底珠链
  const beadPts = [];
  for (let i = 0; i <= scallops; i++) beadPts.push([x0 + span * i, y + 6]);
  beads(canvas, beadPts, 3.4, 0.85);
  // 上方更细的短弧（只覆盖中间三分之二）
  for (const [off, scale] of [[-42, 0.55], [-64, 0.42]]) {
    const arc = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      arc.push([x0 + span * 3.2 + (span * (scallops - 6.4)) * t, y + off - Math.sin(t * Math.PI) * 7 - t * 8]);
    }
    taper(canvas, arc, { width: W0 * 0.36, endScale: 0.1, alpha: scale, skirt: 0 });
  }
  // 每两齿之间垂一枚短线
  for (let i = 2; i < scallops; i += 4) {
    const x = x0 + span * i;
    ink(canvas, catmullRom([[x, y + 18], [x - 5, y + 34], [x - 2, y + 50]], 10), { width: W0 * 0.38, alpha: 0.6, skirt: 0 });
  }
  return canvas;
}

const SLOTS = [
  ['doodle', drawDoodle, 1267, 1241],
  ['star', drawStar, 256, 256],
  ['candy-wrapped', drawCandyWrapped, 256, 256],
  ['candy-lollipop', drawCandyLollipop, 256, 256],
  ['acao-heart', drawAcaoHeart, 512, 512],
  ['acao-cheer', drawAcaoCheer, 512, 512],
  ['corner', drawCorner, 1600, 485],
  ['upper', drawUpper, 490, 315],
];

render(SLOTS, { out: OUT, palette: PALETTE, fs, path });
