/* 装饰槽位线稿的共用绘制引擎：三层描边 + 手绘曲线 + 几何图元 + 定种子随机 + 批量出图。
 *
 *   const { kit } = require('./draw-kit');
 *   const { ink, taper, sparkle, render } = kit('jade');
 *   render([['doodle', drawDoodle, 1267, 1241], ...], { out: '...', palette: 'jade' });
 *
 * 为什么抽出来：每个角色（守岸人 / 今汐 / …）的差别只在**母题**，画法完全一样 ——
 * 外层一条宽而浅的色 + 内层一条细而深的芯线 + 一圈低 alpha 的柔光裙边，
 * 对齐的是 themes/diana/assets/ 那套的实测结构（线芯实、外缘软、着墨比例可控）。
 * 引擎一份、母题一份，新增角色就只写 drawXxx()。
 *
 * 调参口径见 tools/prompts/shorekeeper-doodle-img2img.md §一；量值用 tools/ink-metrics.js。
 */

const { createCanvas, encodePng, stroke, catmullRom, wobble } = require('./line-art');

/* ---------- 配色 ---------- */
/* diana / abyss = 守岸人主题的两套；jade = 今汐（实测：青玉 #547369、银白 #cbd0d2、
   青光 #4cc8de、金 #c4c285）。每个色都是 [r,g,b]（0..1），与 line-art.js 的 blend 一致。 */
const PALETTES = {
  diana: {
    skirt: [1.0, 0.94, 0.89],
    outer: [0.992, 0.859, 0.776],
    core: [0.937, 0.616, 0.612],
    gold: [0.855, 0.804, 0.706],
    goldCore: [0.72, 0.63, 0.35],
  },
  abyss: {
    skirt: [0.91, 0.97, 1.0],
    outer: [0.875, 0.957, 0.984],
    core: [0.184, 0.498, 0.769],
    glow: [0.09, 0.714, 0.878],
    gold: [0.753, 0.714, 0.416],
    goldCore: [0.616, 0.561, 0.247],
  },
  jade: {
    skirt: [0.94, 0.97, 0.97],
    outer: [0.875, 0.910, 0.912],
    core: [0.302, 0.420, 0.384],
    glow: [0.208, 0.737, 0.847],
    gold: [0.788, 0.773, 0.549],
    goldCore: [0.604, 0.561, 0.306],
  },
};

const TAU = Math.PI * 2;

function kit(paletteName) {
  const P = PALETTES[paletteName] || PALETTES.diana;
  const GLOW = P.glow || P.core;                 // 发光类母题（光灵/水花/星/环纹）的芯色

  /* ---------- 描边 ---------- */

  /** 三层描边：柔光裙边 → 外层宽浅 → 内层细深。width 指外层的宽度。
   *  裙边参数按 Diana 的实测 alpha 斜面定：素材在 a>32 的横向段中位 8px、a>208 时 5px，
   *  即"约 5px 的实线芯 + 两侧各 1.5px 的柔边"。所以裙边只比外层宽 25%、alpha 压到 0.13。 */
  function ink(canvas, pts, { width, alpha = 1, core = true, glow = false, skirt = 1.25, outer = null, coreColor = null }) {
    if (skirt > 0) stroke(canvas, pts, { color: P.skirt, width: width * skirt, alpha: 0.13 * alpha });
    stroke(canvas, pts, { color: outer || P.outer, width, alpha: 0.96 * alpha });
    if (core) stroke(canvas, pts, { color: coreColor || (glow ? GLOW : P.core), width: Math.max(0.9, width * 0.32), alpha });
  }

  /** 两端收细的描边（飘带、光丝、水舌、龙身、卷须）：分段递变线宽，段间重叠避免接缝 */
  function taper(canvas, pts, { width, endScale = 0.08, alpha = 1, glow = false, coreColor = null, chunks = 14, ease = (t) => Math.sin(Math.PI * Math.min(1, Math.max(0, t))) }) {
    const n = pts.length;
    for (let i = 0; i < chunks; i++) {
      const from = Math.floor((i / chunks) * (n - 1));
      const to = Math.min(n - 1, Math.ceil(((i + 1) / chunks) * (n - 1)) + 1);
      if (to - from < 2) continue;
      const t = (i + 0.5) / chunks;
      const w = width * (endScale + (1 - endScale) * ease(t));
      ink(canvas, pts.slice(from, to + 1), { width: Math.max(0.8, w), alpha, glow, coreColor });
    }
  }

  /** 断丝：只保留一部分点，用来做"断开的小弧" */
  function dashPath(pts, keep = 0.5, offset = 0) {
    const n = pts.length;
    return pts.filter((_, i) => ((i / n + offset) % 1) < keep);
  }

  /* ---------- 几何 ---------- */

  function circlePts(cx, cy, r, a0 = 0, a1 = TAU, steps = 72) {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  }

  /** 水滴/花瓣/水舌：根部窄、尖端收成一点 */
  function petalPts(cx, cy, len, wid, angle, bend = 0) {
    const side = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const w = wid * Math.sin(Math.PI * t) * (1 - 0.25 * t);
      const off = bend * Math.sin(Math.PI * t);
      side.push([t * len, off + w * 0.5]);
    }
    const back = [];
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const w = wid * Math.sin(Math.PI * t) * (1 - 0.25 * t);
      const off = bend * Math.sin(Math.PI * t);
      back.push([t * len, off - w * 0.5]);
    }
    const local = [...side, ...back];
    const ca = Math.cos(angle), sa = Math.sin(angle);
    return catmullRom(local.map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]), 3, true);
  }

  /** 翅膀：细长尖角 + 外缘一段内凹的弧 */
  function wingPts(cx, cy, len, wid, angle, concave = 0.5) {
    const local = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      local.push([t * len, -wid * Math.sin(Math.PI * t) * (1 - concave * 0.4 * t) * 0.5]);
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      local.push([t * len, -wid * concave * Math.sin(Math.PI * t) * 0.16 + wid * Math.sin(Math.PI * t) * 0.5]);
    }
    const ca = Math.cos(angle), sa = Math.sin(angle);
    return catmullRom(local.map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]), 3, true);
  }

  /** 四芒星：两根两端收尖的交叉线段 */
  function sparkle(canvas, cx, cy, size, alpha = 1, width = null) {
    const w = width || Math.max(2.6, size * 0.2);
    const arms = [
      [[cx, cy - size], [cx, cy + size]],
      [[cx - size, cy], [cx + size, cy]],
    ];
    for (const arm of arms) {
      taper(canvas, catmullRom([[arm[0][0], arm[0][1]], [cx, cy], [arm[1][0], arm[1][1]]], 10), {
        width: w, endScale: 0.12, alpha, glow: true, coreColor: GLOW,
      });
    }
  }

  /** 小圆点：用极短的描边近似，保持"线"的观感 */
  function dot(canvas, x, y, r, alpha = 1) {
    ink(canvas, circlePts(x, y, r, 0, TAU, 14), { width: Math.max(1.1, r * 0.85), alpha, skirt: 0 });
  }

  /** 珠链：一排小圆珠 */
  function beads(canvas, pts, r, alpha = 1) {
    for (const [x, y] of pts) dot(canvas, x, y, r, alpha);
  }

  /** 固定种子的伪随机：保证每次生成的图一致 */
  function makeRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  return { P, GLOW, TAU, wobble, ink, taper, dashPath, circlePts, petalPts, wingPts, sparkle, dot, beads, makeRng, createCanvas, encodePng, catmullRom, stroke, render };
}

/* ---------- 批量出图 ---------- */

/** slots = [[名字, 绘制函数(canvas 尺寸) → canvas, 宽, 高], ...]；绘制函数拿到 kit 里的工具即可 */
function render(slots, { out, palette, fs, path }) {
  fs.mkdirSync(out, { recursive: true });
  console.log(`配色 ${palette} → ${out}`);
  for (const [name, draw, w, h] of slots) {
    const canvas = draw(w, h);
    const { width, height, data } = canvas;
    // 先量再编码：encodePng 会消耗 canvas.data（会把 alpha 归零），量完再写文件
    let inkPx = 0, alphaSum = 0, solid = 0;
    for (let i = 0; i < width * height; i++) {
      const a = data[i * 4 + 3];
      if (a > 32 / 255) { inkPx++; alphaSum += a; }
      if (a > 208 / 255) solid++;
    }
    fs.writeFileSync(path.join(out, name + '.png'), encodePng(canvas));
    console.log(
      name.padEnd(15), `${width}x${height}`.padEnd(11),
      '着墨', (inkPx / (width * height) * 100).toFixed(2) + '%',
      ' 实芯占比', inkPx ? (solid / inkPx * 100).toFixed(0) + '%' : '—',
      ' 平均 alpha', inkPx ? (alphaSum / inkPx).toFixed(2) : '0'
    );
  }
}

module.exports = { PALETTES, kit, render };
