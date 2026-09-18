/* 样张生成：用 line-art.js 的渲染器画出 Diana 那几类元素，验证"我能画"到什么程度。
 *   node tools/samples.js
 * 输出到 tools/out/。这些只是样张（证明路子可行），不是最终主题素材。 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { createCanvas, encodePng, stroke, fill, catmullRom, wobble, roundedPolygon } = require('./line-art');

const OUT = path.join(__dirname, 'out');

/* 取自 Diana 现有素材的调色 */
const CORAL = [0.851, 0.545, 0.545];      // #d98b8b 主描边
const CORAL_DEEP = [0.878, 0.541, 0.478]; // #e08a7a
const CREAM = [0.969, 0.894, 0.831];      // #f7e4d4 外圈
const BLUSH = [0.949, 0.769, 0.769];      // #f2c4c4 腮红
const GREEN = [0.659, 0.769, 0.549];      // #a8c48c 蝴蝶结

/** 校验自己写出的 PNG：签名、IHDR、IDAT 解压长度、IEND */
function validatePng(file, expect) {
  const buffer = fs.readFileSync(file);
  const signature = buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a;
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const colorType = buffer[25], bitDepth = buffer[24];
  let offset = 8, idat = [], sawIend = false;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') sawIend = true;
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const expectedRaw = (width * 4 + 1) * height;
  return {
    file: path.basename(file),
    ok: signature && sawIend && colorType === 6 && bitDepth === 8 && raw.length === expectedRaw
      && width === expect.width && height === expect.height,
    size: `${width}x${height}`,
    format: colorType === 6 ? 'RGBA 8bit' : `colorType ${colorType}`,
    rawBytes: `${raw.length} / ${expectedRaw}`,
  };
}

/* ---------- 五角星（对齐 diana-star-v2 的圆角双描边） ---------- */
function makeStar(size = 256) {
  const canvas = createCanvas(size, size);
  const cx = size / 2, cy = size * 0.52;
  const outer = size * 0.44, inner = outer * 0.42;
  const vertices = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? outer : inner;
    vertices.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  // 在每个尖端两侧插入近邻点，让样条贴着顶点走 —— 否则 Catmull-Rom 会把尖端抹圆
  const sharpened = [];
  for (let i = 0; i < 10; i++) {
    const cur = vertices[i];
    if (i % 2 !== 0) { sharpened.push(cur); continue; }
    const prev = vertices[(i - 1 + 10) % 10], next = vertices[(i + 1) % 10];
    sharpened.push([cur[0] + (prev[0] - cur[0]) * 0.18, cur[1] + (prev[1] - cur[1]) * 0.18]);
    sharpened.push(cur);
    sharpened.push([cur[0] + (next[0] - cur[0]) * 0.18, cur[1] + (next[1] - cur[1]) * 0.18]);
  }
  const path = wobble(catmullRom(sharpened, 14, true), size * 0.005, size * 0.3, 1.7);
  stroke(canvas, path, { color: CREAM, width: size * 0.085 });
  stroke(canvas, path, { color: CORAL_DEEP, width: size * 0.024 });
  return { canvas, expect: { width: size, height: size } };
}

/* ---------- 猫（acao 那种简笔猫头：耳朵 + 闭眼 + 腮红 + 嘴） ---------- */
function makeCat(size = 512) {
  const canvas = createCanvas(size, size);
  const s = size / 512;
  const head = wobble(catmullRom([
    [150, 96], [196, 176], [256, 158], [316, 176], [362, 96],
    [410, 240], [400, 340], [256, 404], [112, 340], [102, 240],
  ], 22, true).map(([x, y]) => [x * s, y * s]), 2.2 * s, 90 * s, 0.6);
  stroke(canvas, head, { color: CORAL, width: 4.5 * s });

  /* 内部细节全部由轮廓本身推导 —— 手填坐标会和样条插值出来的实际轮廓对不上 */
  const centroid = head.reduce((acc, [x, y]) => [acc[0] + x / head.length, acc[1] + y / head.length], [0, 0]);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const leftHalf = head.filter(([x]) => x < centroid[0]);
  const rightHalf = head.filter(([x]) => x >= centroid[0]);
  const tipL = leftHalf.reduce((a, b) => (b[1] < a[1] ? b : a));
  const tipR = rightHalf.reduce((a, b) => (b[1] < a[1] ? b : a));
  const sideL = head.reduce((a, b) => (b[0] < a[0] ? b : a));
  const sideR = head.reduce((a, b) => (b[0] > a[0] ? b : a));

  // 耳内折线：先量出耳朵在那个高度上的实际内外边界，再在里面落笔
  // （耳朵是窄三角形，按固定尺寸画会穿出轮廓）
  for (const tip of [tipL, tipR]) {
    const yTop = tip[1] + 34 * s, yBottom = tip[1] + 84 * s;
    const band = head.filter(([x, y]) => y >= yTop && y <= yBottom
      && Math.abs(x - tip[0]) < 78 * s);
    if (band.length < 2) continue;
    const xMin = Math.min(...band.map(([x]) => x));
    const xMax = Math.max(...band.map(([x]) => x));
    const w = xMax - xMin;
    stroke(canvas, [
      [xMin + w * 0.22, yBottom],
      [xMin + w * 0.5, yTop + (yBottom - yTop) * 0.25],
      [xMax - w * 0.22, yBottom],
    ], { color: CORAL, width: 3.2 * s });
  }

  // 闭眼："大于/小于"两笔，再补两根睫毛
  for (const sign of [-1, 1]) {
    const ex = centroid[0] + sign * 62 * s;
    const ey = centroid[1] + 6 * s;
    stroke(canvas, [[ex - sign * 26 * s, ey - 18 * s], [ex + sign * 6 * s, ey + 2 * s], [ex - sign * 24 * s, ey + 18 * s]],
      { color: CORAL_DEEP, width: 3.6 * s });
    for (const dy of [-16, 0, 16]) {
      stroke(canvas, [[ex + sign * 14 * s, ey - 4 * s + dy * s], [ex + sign * 30 * s, ey - 6 * s + dy * s]],
        { color: CORAL_DEEP, width: 2.6 * s, alpha: 0.85 });
    }
  }

  // 嘴（ω 形）
  stroke(canvas, catmullRom([[236, 292], [248, 304], [256, 294], [264, 304], [276, 292]], 10)
    .map(([x, y]) => [x * s, y * s]), { color: CORAL_DEEP, width: 3.2 * s });

  // 腮红：从两侧最外点朝质心收 18%，保证落在轮廓内
  for (const side of [sideL, sideR]) {
    const dir = side[0] < centroid[0] ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const anchor = lerp(side, centroid, 0.16 + i * 0.055);
      const y = anchor[1] + (i - 1) * 13 * s;
      stroke(canvas, [[anchor[0], y], [anchor[0] + dir * 17 * s, y - 7 * s]],
        { color: BLUSH, width: 6.5 * s, alpha: 0.75 });
    }
  }
  return { canvas, expect: { width: size, height: size } };
}

/* ---------- 装饰线（corner-line 那种长流线 + 小爱心） ---------- */
function makeFlourish(width = 1600, height = 485) {
  const canvas = createCanvas(width, height);
  const wave = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    wave.push([-40 + t * (width + 80), height * 0.52 + Math.sin(t * Math.PI * 2.1) * height * 0.22 + Math.sin(t * Math.PI * 6.3) * height * 0.03]);
  }
  const main = wobble(catmullRom(wave, 14), 2.4, 160, 2.3);
  stroke(canvas, main, { color: CORAL, width: 4.5, alpha: 0.9 });
  stroke(canvas, main.map(([x, y]) => [x, y + 7]), { color: CORAL, width: 2, alpha: 0.45 });

  // 左段一颗小爱心
  const hx = width * 0.24, hy = height * 0.5, r = 34;
  const heart = catmullRom([
    [hx, hy + r * 0.9], [hx - r, hy - r * 0.15], [hx - r * 0.45, hy - r * 0.95],
    [hx, hy - r * 0.3], [hx + r * 0.45, hy - r * 0.95], [hx + r, hy - r * 0.15],
  ], 20, true);
  fill(canvas, heart, { color: BLUSH, alpha: 0.5 });
  stroke(canvas, heart, { color: CORAL_DEEP, width: 3.4 });

  // 几颗小星点
  for (const [sx, sy, sr] of [[width * 0.55, height * 0.26, 9], [width * 0.72, height * 0.74, 7], [width * 0.86, height * 0.34, 6]]) {
    const star = [];
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 4;
      const radius = i % 2 === 0 ? sr : sr * 0.34;
      star.push([sx + Math.cos(angle) * radius, sy + Math.sin(angle) * radius]);
    }
    fill(canvas, catmullRom(star, 12, true), { color: CORAL_DEEP, alpha: 0.85 });
  }
  return { canvas, expect: { width, height } };
}

/* ---------- 跑 ---------- */

fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['sample-star.png', makeStar(256)],
  ['sample-cat.png', makeCat(512)],
  ['sample-flourish.png', makeFlourish(1600, 485)],
];
const report = [];
for (const [name, { canvas, expect }] of jobs) {
  const started = Date.now();
  const file = path.join(OUT, name);
  fs.writeFileSync(file, encodePng(canvas));
  const check = validatePng(file, expect);
  report.push({ ...check, ms: Date.now() - started, kb: Math.round(fs.statSync(file).size / 1024) });
}
console.log(JSON.stringify(report, null, 1));
