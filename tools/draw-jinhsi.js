/* 今汐 · 8 个装饰槽位的线稿素材（母题取自 C_JinXi_1 立绘，画法见 tools/draw-kit.js）
 *
 *   node tools/draw-jinhsi.js [--palette jade|diana|abyss] [--out 目录]
 *
 * 母题全部来自那张环绕的青龙与她的服饰（实测配色：青玉 #547369、银白 #cbd0d2、
 * 青光 #4cc8de、金 #c4c285），逐槽位对应：
 *   doodle        枝状龙角 + 云纹卷须 + 圆鳞簇 + 刃状小鳍（大团块）
 *   star          发光环纹（同心双环 + 缝线刻度 + 中心菱鳞）
 *   candy-wrapped 刃状背鳍（锯齿边 + 晶尖 + 根部鳞座）
 *   candy-lollipop 云纹卷须簇（三条书法式 S 卷）
 *   acao-heart    金饰（发簪 + 丝带结 + 流苏，唯一走金的槽位）
 *   acao-cheer    板甲鳞片组（三排交错 + 顶部圆鳞簇）
 *   corner        龙身长弧（板甲鳞沿弧排列 + 背鳍小齿 + 金线 + 点划缝线）
 *   upper         羽状鳍须排（一排白色羽状鳍须 + 光尘）
 *
 * 画布与线宽基准同守岸人那套（themes/diana/assets/ 实测）：
 *   doodle 1267x1241 着墨 7.98% 线宽中位 8px ｜ star 256 12.16% ｜ corner 1600x485 0.72%
 */

const fs = require('fs');
const path = require('path');
const { kit, render } = require('./draw-kit');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const PALETTE = argOf('palette', 'jade');
const OUT = argOf('out', path.join(__dirname, 'work', 'jinhsi', PALETTE));

const K = kit(PALETTE);
const { createCanvas, catmullRom, wobble, ink, taper, dashPath, circlePts, petalPts, wingPts, sparkle, dot, beads, makeRng, TAU } = K;
const P = K.P;
const CORE_GLOW = K.GLOW;
const GOLD = { outer: P.gold, coreColor: P.goldCore, skirt: 0 };

/* ---------- 今汐专用图元 ---------- */

/** 圆角矩形：板甲鳞片的基本形状（用四段弧 + 四条直线拼） */
function platePts(cx, cy, w, h, r, angle = 0) {
  const hw = w / 2, hh = h / 2;
  const corners = [
    [hw - r, -hh, -Math.PI / 2, 0],
    [hw, -hh + r, 0, Math.PI / 2],
    [hw - r, hh, Math.PI / 2, Math.PI],
    [-hw, hh - r, Math.PI, Math.PI * 1.5],
    [-hw + r, -hh, Math.PI * 1.5, TAU],
  ].map((c) => c);
  const out = [];
  const arc = (ox, oy, a0, a1) => {
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (a1 - a0) * (i / 8);
      out.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  };
  out.push([-hw + r, -hh]); arc(hw - r, -hh + r, -Math.PI / 2, 0);
  out.push([hw, hh - r]);   arc(hw - r, hh - r, 0, Math.PI / 2);
  out.push([-hw + r, hh]);  arc(-hw + r, hh - r, Math.PI / 2, Math.PI);
  out.push([-hw, -hh + r]); arc(-hw + r, -hh + r, Math.PI, Math.PI * 1.5);
  out.push(out[0]);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  return out.map(([x, y]) => [cx + (x - 0) * ca - (y - 0) * sa, cy + x * sa + y * ca]);
}

/** 圆鳞：小圆片（三到四层同心弧叠出鳞的层感） */
function roundScale(canvas, cx, cy, r, opts = {}) {
  ink(canvas, circlePts(cx, cy, r, 0.5, Math.PI + 0.1, 26), { width: Math.max(1.2, r * 0.42), ...opts });
  ink(canvas, circlePts(cx, cy, r * 0.6, 0.6, Math.PI + 0.2, 20), { width: Math.max(1, r * 0.3), alpha: 0.8, skirt: 0, ...opts });
}

/** 刃状背鳍/龙角支：主体是一条两端收细的长刃，一侧带锯齿缺口 */
function bladePts(cx, cy, len, wid, angle, notches = 5, serr = 0.16) {
  const local = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {                     // 光滑的一侧
    const t = i / steps;
    local.push([t * len, -wid * Math.sin(Math.PI * t) * 0.5]);
  }
  const side = [];
  for (let i = steps; i >= 0; i--) {                     // 带缺口的一侧
    const t = i / steps;
    const base = wid * Math.sin(Math.PI * t) * 0.5;
    const saw = Math.sin(t * Math.PI * notches) > 0 ? 0 : serr * wid * (1 - t * 0.4);
    side.push([t * len, base - saw]);
  }
  const ca = Math.cos(angle), sa = Math.sin(angle);
  return catmullRom([...local, ...side].map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]), 3, true);
}

/** 云纹卷须：一条从外向内收卷的螺线（书法式 S 卷） */
function curlPts(x0, y0, r0, r1, a0, sweep, steps = 40) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + sweep * t;
    const r = r0 + (r1 - r0) * t;
    out.push([x0 + Math.cos(a) * r, y0 + Math.sin(a) * r * 0.92]);
  }
  return out;
}

/** 枝状龙角的一条臂：主干 + 末端方折（参考图上那处"阶梯状断口"） */
function branchArm(x0, y0, pts, steps = []) {
  return { main: catmullRom([[x0, y0], ...pts], 14), tip: steps };
}

/* ---------- 槽位 1：doodle 枝状龙角 + 云纹卷须 + 圆鳞簇 + 刃状小鳍 ---------- */

function drawDoodle(width = 1267, height = 1241) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(20260921);
  const W0 = 8.0;

  /* 主龙角：一根主干 + 四条臂，主干自左下向右上生长 */
  const trunk = catmullRom([[300, 1000], [372, 800], [430, 620], [498, 452], [560, 330]], 18);
  taper(canvas, wobble(trunk, 4.5, 150, 1.1), { width: W0 * 2.3, endScale: 0.22, alpha: 1 });
  taper(canvas, wobble(trunk.map(([x, y]) => [x + 12, y + 5]), 3.8, 150, 1.1), { width: W0 * 0.9, endScale: 0.24, alpha: 0.85 });
  // 主干上的金线（描边内侧的一条细线）
  taper(canvas, wobble(trunk.map(([x, y]) => [x + 7, y + 3]), 3.4, 150, 1.1), { width: W0 * 0.34, endScale: 0.2, alpha: 0.75, coreColor: P.gold, skirt: 0 });

  const arms = [
    { start: [0.16, 0], path: [[286, 880], [200, 812], [176, 726], [188, 660]], tip: [[188, 660], [172, 646], [176, 622]] },
    { start: [0.4, 0], path: [[404, 690], [318, 606], [300, 512], [330, 452]], tip: [[330, 452], [308, 442], [312, 416]] },
    { start: [0.62, 0], path: [[470, 520], [596, 470], [660, 386], [628, 316]], tip: [[628, 316], [650, 306], [642, 278]] },
    { start: [0.84, 0], path: [[540, 372], [614, 300], [700, 258], [774, 268]], tip: [[774, 268], [796, 262], [800, 236]] },
    { start: [0.28, 0], path: [[336, 764], [424, 700], [470, 620], [452, 556]], tip: [[452, 556], [472, 548], [468, 520]] },
    { start: [0.72, 0], path: [[524, 396], [452, 452], [420, 540], [436, 604]], tip: [[436, 604], [418, 612], [422, 640]] },
    { start: [0.52, 0], path: [[446, 566], [352, 552], [286, 588], [252, 650]], tip: [[252, 650], [232, 646], [224, 672]] },
    { start: [0.9, 0], path: [[556, 344], [512, 268], [536, 196], [600, 168]], tip: [[600, 168], [618, 158], [614, 132]] },
    { start: [0.2, 0], path: [[316, 876], [248, 916], [216, 984], [232, 1050]], tip: [[232, 1050], [214, 1058], [218, 1084]] },
  ];
  for (const arm of arms) {
    taper(canvas, wobble(catmullRom(arm.path, 16), 3.2, 110, 2.3), { width: W0 * 1.35, endScale: 0.24, alpha: 0.98 });
    ink(canvas, catmullRom(arm.tip, 10), { width: W0 * 0.95, alpha: 0.95 });   // 末端方折
    const [hx, hy] = arm.tip[arm.tip.length - 1];
    dot(canvas, hx + 8, hy - 6, 3, 0.7);
  }

  /* 云纹卷须：三条，卷在主龙角右侧 */
  const curls = [
    [900, 470, 150, 24, -0.4, 3.5],
    [1010, 760, 122, 20, 1.2, 3.1],
    [742, 322, 104, 18, 2.4, 2.8],
    [1080, 520, 96, 16, 3.4, 3.0],
    [836, 900, 118, 20, 0.6, 3.3],
    [604, 1088, 132, 22, 1.8, 3.2],
    [1180, 880, 108, 18, 4.4, 2.9],
  ];
  for (const [cx, cy, r0, r1, a0, sweep] of curls) {
    taper(canvas, curlPts(cx, cy, r0, r1, a0, sweep), { width: W0 * 0.62, endScale: 0.16, alpha: 0.95 });
  }
  ink(canvas, curlPts(900, 470, 150, 24, -0.4, 3.5).slice(0, 6), { width: W0 * 0.4, alpha: 0.6, coreColor: P.gold, skirt: 0 });

  /* 圆鳞簇：右下三排交错的小圆鳞 */
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 5 - row; i++) {
      const x = 800 + i * 60 + row * 30, y = 968 + row * 52;
      roundScale(canvas, x, y, 26 - row * 2);
    }
  }
  /* 刃状小鳍：两片 */
  for (const [x, y, len, ang, notches] of [[168, 1030, 300, -0.5, 5], [620, 1130, 250, -0.3, 4], [1104, 980, 272, 0.24, 4], [1244, 620, 210, 0.9, 4]]) {
    const pts = bladePts(x, y, len, len * 0.3, ang, notches);
    ink(canvas, pts, { width: W0 * 0.8 });
    ink(canvas, bladePts(x, y, len * 0.66, len * 0.14, ang, notches - 1), { width: W0 * 0.45, alpha: 0.8, skirt: 0, coreColor: CORE_GLOW });
  }
  /* 四芒星与光尘 */
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const x = 1042 + i * 58 + row * 29, y = 560 + row * 50;
      roundScale(canvas, x, y, 24 - row * 2);
    }
  }
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const x = 300 + i * 60 + row * 30, y = 700 + row * 52;
      roundScale(canvas, x, y, 25 - row * 2);
    }
  }
  sparkle(canvas, 1024, 300, 38, 0.9);
  sparkle(canvas, 700, 980, 30, 0.85);
  sparkle(canvas, 150, 300, 26, 0.75);
  sparkle(canvas, 268, 486, 24, 0.75);
  for (let i = 0; i < 100; i++) dot(canvas, 180 + rng() * 940, 220 + rng() * 960, 2 + rng() * 3, 0.6 + rng() * 0.3);
  return canvas;
}

/* ---------- 槽位 2：star 发光环纹 ---------- */

function drawStar(width = 256, height = 256) {
  const canvas = createCanvas(width, height);
  const W0 = 7.6;
  ink(canvas, circlePts(128, 128, 92, 0, TAU, 96), { width: W0 * 0.8, coreColor: CORE_GLOW });
  ink(canvas, circlePts(128, 128, 74, 0, TAU, 88), { width: W0 * 0.5, alpha: 0.9 });
  // 环上的缝线刻度（参考图上龙身那道点划线）
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    const x = 128 + Math.cos(a) * 83, y = 128 + Math.sin(a) * 83;
    dot(canvas, x, y, 2.4, 0.7);
  }
  // 中心菱鳞
  const dia = (s) => [[128, 128 - s], [128 + s * 0.62, 128], [128, 128 + s], [128 - s * 0.62, 128], [128, 128 - s]];
  ink(canvas, dia(30), { width: W0 * 0.5, coreColor: CORE_GLOW });
  ink(canvas, dia(17), { width: W0 * 0.3, alpha: 0.85, skirt: 0 });
  // 四向短刻线
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ink(canvas, [[128 + dx * 40, 128 + dy * 40], [128 + dx * 50, 128 + dy * 50]], { width: W0 * 0.35, alpha: 0.8, skirt: 0 });
  }
  for (const [x, y] of [[38, 46], [220, 52], [44, 212], [214, 206]]) dot(canvas, x, y, 3.4, 0.7);
  return canvas;
}

/* ---------- 槽位 3：candy-wrapped 刃状背鳍 ---------- */

function drawCandyWrapped(width = 256, height = 256) {
  const canvas = createCanvas(width, height);
  const W0 = 4.4;
  const pts = bladePts(30, 196, 208, 92, -1.16, 5, 0.2);
  ink(canvas, pts, { width: W0 * 1.5 });
  ink(canvas, bladePts(30, 196, 150, 46, -1.16, 4, 0.18), { width: W0 * 0.7, alpha: 0.85, skirt: 0, coreColor: CORE_GLOW });
  // 根部鳞座
  ink(canvas, platePts(52, 216, 74, 30, 12, -0.28), { width: W0 * 0.9 });
  ink(canvas, platePts(58, 214, 46, 16, 7, -0.28), { width: W0 * 0.5, alpha: 0.8, skirt: 0 });
  for (const [x, y, r] of [[176, 96, 4], [206, 132, 3.2], [150, 62, 3]]) dot(canvas, x, y, r, 0.75);
  return canvas;
}

/* ---------- 槽位 4：candy-lollipop 云纹卷须簇 ---------- */

function drawCandyLollipop(width = 256, height = 256) {
  const canvas = createCanvas(width, height);
  const W0 = 6.0;
  const base = [96, 208];
  // 三条 S 卷：外卷最大、内卷收细
  const curls = [
    [base[0] + 12, base[1] - 46, 104, 16, -0.5, 2.9, 1.0],
    [base[0] + 40, base[1] - 74, 74, 12, 1.2, 2.5, 0.8],
    [base[0] + 58, base[1] - 26, 92, 14, 2.6, 2.2, 0.66],
    [base[0] - 14, base[1] - 84, 62, 12, 0.9, 2.6, 0.72],
  ];
  for (const [cx, cy, r0, r1, a0, sweep, w] of curls) {
    taper(canvas, curlPts(cx, cy, r0, r1, a0, sweep), { width: W0 * w, endScale: 0.14, alpha: 0.95 });
  }
  // 根部一小段主干 + 金线
  const stem = catmullRom([[base[0] - 34, base[1] + 30], [base[0] - 10, base[1] + 6], [base[0] + 6, base[1] - 18]], 12);
  ink(canvas, stem, { width: W0 * 0.8 });
  ink(canvas, stem.map(([x, y]) => [x + 4, y + 2]), { width: W0 * 0.3, alpha: 0.7, coreColor: P.gold, skirt: 0 });
  roundScale(canvas, 176, 206, 26);
  roundScale(canvas, 214, 182, 20);
  for (let i = 0; i < 10; i++) dot(canvas, 40 + ((i * 37) % 190), 40 + ((i * 53) % 170), 2.4 + (i % 3) * 0.6, 0.7);
  return canvas;
}

/* ---------- 槽位 5：acao-heart 金饰（发簪 + 丝带结 + 流苏） ---------- */

function drawAcaoHeart(width = 512, height = 512) {
  const canvas = createCanvas(width, height);
  const W0 = 6.8;
  const g = GOLD;

  // 发簪：一根两端收细的长针 + 月牙钩头
  const pin = catmullRom([[96, 424], [176, 330], [252, 246], [320, 178]], 14);
  taper(canvas, pin, { width: W0 * 0.8, endScale: 0.12, alpha: 1, ...g });
  ink(canvas, curlPts(336, 176, 40, 16, -0.6, 3.0), { width: W0 * 0.7, ...g });          // 月牙钩
  ink(canvas, circlePts(348, 150, 13, 0, TAU, 30), { width: W0 * 0.55, ...g });          // 钩上的小环
  // 丝带结
  const kx = 300, ky = 316;
  for (const side of [-1, 1]) {
    ink(canvas, petalPts(kx, ky, 74, 52, side > 0 ? -0.32 : Math.PI + 0.32, 0), { width: W0 * 0.75, ...g });
  }
  ink(canvas, catmullRom([[kx - 22, ky + 30], [kx - 62, ky + 118], [kx - 84, ky + 186]], 14), { width: W0 * 0.6, ...g });
  ink(canvas, catmullRom([[kx + 22, ky + 30], [kx + 66, ky + 112], [kx + 92, ky + 176]], 14), { width: W0 * 0.6, ...g });
  dot(canvas, kx, ky, 7, 0.95);
  // 流苏：三条细线 + 末端小弧
  for (let i = 0; i < 3; i++) {
    const x = kx - 74 + i * 8, y0 = ky + 150;
    const t = catmullRom([[x, y0], [x - 6 + i * 4, y0 + 34], [x - 2 + i * 5, y0 + 66]], 12);
    taper(canvas, t, { width: W0 * 0.3, endScale: 0.5, alpha: 0.85, ...g });
  }
  // 鳞片一枚（金饰上的圆鳞）
  roundScale(canvas, 190, 400, 30, g);
  roundScale(canvas, 124, 452, 22, g);
  ink(canvas, platePts(410, 420, 84, 34, 12, 0.3), { width: W0 * 0.7, ...g });
  const chain = [];
  for (let i = 0; i <= 34; i++) { const t = i / 34; chain.push([96 + t * 108, 150 + Math.sin(t * 13) * 10 + t * 42]); }
  ink(canvas, chain, { width: W0 * 0.42, alpha: 0.9, ...g });
  for (let i = 0; i < 2; i++) {
    const x = kx - 62 + i * 10, y0 = ky + 158;
    taper(canvas, catmullRom([[x, y0], [x + 4 - i * 3, y0 + 30], [x + 1 - i * 4, y0 + 58]], 12), { width: W0 * 0.3, endScale: 0.5, alpha: 0.85, ...g });
  }
  for (const [x, y, r] of [[128, 210, 4], [230, 392, 3.4], [392, 258, 3.6], [86, 330, 3.2]]) dot(canvas, x, y, r, 0.75);
  return canvas;
}

/* ---------- 槽位 6：acao-cheer 板甲鳞片组 ---------- */

function drawAcaoCheer(width = 512, height = 512) {
  const canvas = createCanvas(width, height);
  const W0 = 4.2;
  // 三排交错的板甲鳞，整体呈扇形展开
  const rows = [
    { y: 214, n: 5, w: 104, h: 56, r: 16, spread: 0.42, drop: 40 },
    { y: 294, n: 6, w: 98, h: 54, r: 15, spread: 0.34, drop: 30 },
    { y: 372, n: 4, w: 106, h: 54, r: 15, spread: 0.2, drop: 16 },
  ];
  for (const [ri, row] of rows.entries()) {
    for (let i = 0; i < row.n; i++) {
      const t = row.n === 1 ? 0.5 : i / (row.n - 1) - 0.5;
      const x = 256 + t * (row.n - 1) * 100;
      const y = row.y + Math.abs(t) * row.drop;
      const ang = t * row.spread;
      ink(canvas, platePts(x, y, row.w, row.h, row.r, ang), { width: W0 * 0.85 });
      ink(canvas, platePts(x, y, row.w * 0.6, row.h * 0.44, row.r * 0.7, ang), { width: W0 * 0.42, alpha: 0.8, skirt: 0, coreColor: ri === 1 ? CORE_GLOW : null });
      // 顶部一枚小圆鳞
      if ((ri + i) % 3 === 0) roundScale(canvas, x, y - 6, 13);
    }
  }
  // 顶端圆鳞簇
  for (let i = 0; i < 3; i++) roundScale(canvas, 196 + i * 60, 138, 24 - i * 2);
  // 两侧光尘
  for (const [x, y, r] of [[92, 300, 4], [420, 300, 4], [140, 420, 3.4], [372, 424, 3.4], [256, 100, 3]]) dot(canvas, x, y, r, 0.7);
  return canvas;
}

/* ---------- 槽位 7：corner 龙身长弧 ---------- */

function drawCorner(width = 1600, height = 485) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(77021);
  const W0 = 1.0;

  const spine = catmullRom([[-60, 402], [260, 330], [560, 348], [880, 258], [1180, 272], [1480, 168], [1680, 124]], 18);
  const lower = spine.map(([x, y]) => [x, y + 58]);
  taper(canvas, wobble(spine, 2.6, 200, 1.4), { width: W0 * 1.15, endScale: 0.12, alpha: 0.95 });

  // 板甲鳞沿弧排列
  for (let i = 1; i <= 5; i++) {
    const idx = Math.floor((i / 6) * (spine.length - 1));
    const [x, y] = spine[idx];
    const [lx, ly] = lower[idx];
    ink(canvas, platePts((x + lx) / 2, (y + ly) / 2, 46, 30, 10, -0.16), { width: W0 * 0.7, alpha: 0.92 });
  }
  // 背鳍小齿（上缘）
  for (let i = 1; i <= 3; i++) {
    const idx = Math.floor((i / 5) * (spine.length - 1));
    const [x, y] = spine[idx];
    const fin = catmullRom([[x - 16, y + 4], [x - 6, y - 30], [x + 10, y - 52]], 12);
    taper(canvas, fin, { width: W0 * 0.62, endScale: 0.14, alpha: 0.9, coreColor: CORE_GLOW });
  }
  // 金线 + 点划缝线（下缘）
  taper(canvas, lower.map(([x, y]) => [x, y - 14]), { width: W0 * 0.34, endScale: 0.14, alpha: 0.7, coreColor: P.gold, skirt: 0 });
  for (let i = 0; i < 9; i++) {
    const idx = Math.floor((i / 9) * (lower.length - 1));
    const [x, y] = lower[idx];
    dot(canvas, x, y + 8, 2.2, 0.6);
  }
  sparkle(canvas, 1108, 210, 26, 0.8);
  for (let i = 0; i < 4; i++) dot(canvas, 1040 + rng() * 180, 180 + rng() * 70, 2 + rng() * 3, 0.6);
  return canvas;
}

/* ---------- 槽位 8：upper 羽状鳍须排 ---------- */

function drawUpper(width = 490, height = 315) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(51021);
  const W0 = 1.15;
  const y0 = 236;

  // 七条羽状鳍须：主干自左向右渐短，每条带两三支侧须
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = 26 + t * (width - 60);
    const len = 150 * (1 - 0.34 * Math.abs(t - 0.35) * 1.6);
    const lean = -0.35 - t * 0.22;
    const top = [x + Math.sin(lean) * len, y0 + Math.cos(lean) * len * -1];
    const frond = catmullRom([[x, y0], [x + 8 - t * 10, y0 - len * 0.55], [top[0], top[1]]], 14);
    taper(canvas, frond, { width: W0 * 1.05, endScale: 0.1, alpha: 0.95 - 0.1 * Math.abs(t - 0.5) * 2 });
    for (let k = 1; k <= 3; k++) {
      const f = k / 4;
      const bx = x + (top[0] - x) * f, by = y0 + (top[1] - y0) * f;
      const side = k % 2 ? 1 : -1;
      const barb = catmullRom([[bx, by], [bx + side * 13 - 4, by - 14], [bx + side * 20 - 8, by - 28]], 10);
      taper(canvas, barb, { width: W0 * 0.32, endScale: 0.25, alpha: 0.62, skirt: 0 });
    }
  }
  // 底缘一条细弧 + 光尘
  ink(canvas, catmullRom([[10, y0 + 20], [width * 0.5, y0 + 2], [width - 10, y0 + 22]], 18), { width: W0 * 0.4, alpha: 0.6, skirt: 0 });
  for (let i = 0; i < 10; i++) dot(canvas, 20 + rng() * (width - 40), 40 + rng() * 110, 2 + rng() * 2.6, 0.6);
  return canvas;
}

/* ---------- 主流程 ---------- */

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
