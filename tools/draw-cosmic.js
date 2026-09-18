/* 按素材库的造型语言补齐长条装饰线（Diana 的 corner-line / upper-line 槽位原本缺）。
 *
 *   node tools/draw-cosmic.js [输出目录]
 *
 * 只画**极细光丝 + 四芒星**，不画碎片：参考图顶部区域本来就只有光丝与星点，
 * 碎片由涂鸦主图和四个图层素材去表达。手绘碎片试过，线框感和素材库里渲染过的
 * 水晶接不上；而光丝这类纯细线用矢量画是贴合的。
 * 冷白/青蓝 + 透明底 —— 这样日间模式下当 alpha 蒙版也能用。 */

const fs = require('fs');
const path = require('path');
const { createCanvas, encodePng, stroke, fill, catmullRom } = require('./line-art');

const OUT = process.argv[2] || path.join(__dirname, 'work', 'cosmic');

/* 取自素材库实测的冷色调 */
const COOL_WHITE = [0.93, 0.95, 0.97];
const ICE = [0.72, 0.85, 0.94];

/** 四芒星：两根交叉的细长三角，比实心多边形更接近素材库里那种锐利观感 */
function sparkle(canvas, cx, cy, size, alpha = 0.9) {
  const arms = [[[cx, cy - size], [cx, cy + size]], [[cx - size, cy], [cx + size, cy]]];
  for (const arm of arms) {
    stroke(canvas, arm, { color: ICE, width: size * 0.22, alpha: alpha * 0.45 });
    stroke(canvas, arm, { color: COOL_WHITE, width: size * 0.06, alpha });
  }
}

/** 极细光丝：一条低频摆动的长曲线 */
function filament(canvas, x0, y0, x1, y1, amplitude, seed, alpha = 0.4) {
  const points = [];
  const steps = 34;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([
      x0 + (x1 - x0) * t,
      y0 + (y1 - y0) * t + Math.sin(t * Math.PI * 2.3 + seed) * amplitude,
    ]);
  }
  stroke(canvas, catmullRom(points, 10), { color: COOL_WHITE, width: 1.05, alpha });
}

/* 固定种子的伪随机，保证每次生成的图一致 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- upper-line：横向细长，用于右上缘 ---------- */
function drawUpper(width = 1600, height = 300) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(20260919);
  for (let i = 0; i < 4; i++) {
    const y = height * (0.3 + i * 0.16);
    filament(canvas, -20, y, width + 20, y - 24 + i * 16, 20 + i * 9, i * 2.1, 0.36 - i * 0.06);
  }
  for (let i = 0; i < 12; i++) {
    sparkle(canvas, rng() * width, height * (0.15 + rng() * 0.7), 2.5 + rng() * 5, 0.45 + rng() * 0.4);
  }
  return { canvas, expect: { width, height } };
}

/* ---------- corner-line：斜向光丝轨迹 ---------- */
function drawCorner(width = 1600, height = 485) {
  const canvas = createCanvas(width, height);
  const rng = makeRng(77003);
  // 主轨迹：几条近乎平行、缓慢发散的光丝
  for (let i = 0; i < 5; i++) {
    filament(canvas, width * 0.01, height * (0.88 - i * 0.035), width * 0.99, height * (0.14 + i * 0.05),
      26 + i * 13, i * 1.7, 0.34 - i * 0.045);
  }
  // 分叉的短线，模拟参考图里那些从主丝上散出去的小卷须
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + rng() * 0.76;
    const x = width * t, y = height * (0.8 - t * 0.6) + (rng() - 0.5) * height * 0.16;
    const len = 40 + rng() * 110;
    const angle = -0.4 + (rng() - 0.5) * 1.5;
    filament(canvas, x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len, 8 + rng() * 12, rng() * 6, 0.16 + rng() * 0.14);
  }
  for (let i = 0; i < 16; i++) {
    const t = rng();
    sparkle(canvas, width * (0.05 + t * 0.9), height * (0.85 - t * 0.62) + (rng() - 0.5) * height * 0.22, 2.5 + rng() * 5.5, 0.4 + rng() * 0.45);
  }
  return { canvas, expect: { width, height } };
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, job] of [['upper.png', drawUpper()], ['corner.png', drawCorner()]]) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, encodePng(job.canvas));
  console.log(name.padEnd(12), job.expect.width + 'x' + job.expect.height, (fs.statSync(file).size / 1024).toFixed(0) + 'KB');
}
