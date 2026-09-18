/* 线稿生成器：把矢量路径栅格化成带 alpha 的 PNG，零第三方依赖。
 *
 * 为什么自己写：本机没有 sharp/canvas 之类的库，但 Diana 那套美术（星星、糖果、猫、
 * 装饰线）本质是"细描边 + 透明底"的线稿 —— 这类图用距离场直接栅格化即可得到干净的
 * 抗锯齿边缘，比截图抠图可靠得多（抠图会带 UI 残渣、且拿不到真 alpha）。
 *
 * 提供：
 *   stroke()      沿路径画圆头描边，可用"外宽内窄"两层叠出 Diana 那种双色描边
 *   catmullRom()  用 Catmull-Rom 样条把少量控制点变成平滑曲线（画有机形状靠它）
 *   wobble()      给路径加低频扰动，模拟手绘的不规则感
 *   encodePng()   自己编码 RGBA PNG（含 CRC32），配 pixel-proof.js 那份解码器正好互验
 *
 * 运行：node tools/line-art.js [输出目录]
 */

const fs = require('fs');
const path = require('path');
const { encode: encodePng } = require('./png');

/* ---------- 画布 ---------- */

function createCanvas(width, height) {
  return { width, height, data: new Float32Array(width * height * 4) };
}

/** source-over 合成一个像素（颜色 0..1，alpha 为覆盖率） */
function blend(canvas, x, y, color, coverage) {
  if (coverage <= 0) return;
  const i = (y * canvas.width + x) * 4;
  const a = Math.min(1, coverage);
  const dstA = canvas.data[i + 3];
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c++) {
    canvas.data[i + c] = (color[c] * a + canvas.data[i + c] * dstA * (1 - a)) / outA;
  }
  canvas.data[i + 3] = outA;
}

/* ---------- 路径工具 ---------- */

/** Catmull-Rom 样条：少量控制点 → 平滑密集采样点 */
function catmullRom(points, samplesPerSegment = 24, closed = false) {
  const pts = closed ? [...points, points[0], points[1]] : points;
  const out = [];
  const get = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (closed) out.push(out[0]);
  return out;
}

/** 低频扰动：沿法线方向做正弦位移，模拟手绘的不规则 */
function wobble(points, amplitude = 1.2, wavelength = 60, seed = 1) {
  return points.map((point, index) => {
    const prev = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next[0] - prev[0], dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const offset = Math.sin((index / wavelength) * Math.PI * 2 + seed)
      * amplitude * (1 + 0.35 * Math.sin(index / (wavelength * 0.37) + seed * 2));
    return [point[0] + (-dy / len) * offset, point[1] + (dx / len) * offset];
  });
}

/** 多边形顶点 → 顶点处倒角（画圆角星用） */
function roundedPolygon(vertices, radius, samplesPerCorner = 18) {
  const out = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n], cur = vertices[i], next = vertices[(i + 1) % n];
    const toPrev = [prev[0] - cur[0], prev[1] - cur[1]];
    const toNext = [next[0] - cur[0], next[1] - cur[1]];
    const lenPrev = Math.hypot(...toPrev) || 1, lenNext = Math.hypot(...toNext) || 1;
    const r = Math.min(radius, lenPrev * 0.45, lenNext * 0.45);
    const start = [cur[0] + (toPrev[0] / lenPrev) * r, cur[1] + (toPrev[1] / lenPrev) * r];
    const end = [cur[0] + (toNext[0] / lenNext) * r, cur[1] + (toNext[1] / lenNext) * r];
    for (let s = 0; s <= samplesPerCorner; s++) {
      const t = s / samplesPerCorner;
      const mt = 1 - t;
      out.push([
        mt * mt * start[0] + 2 * mt * t * cur[0] + t * t * end[0],
        mt * mt * start[1] + 2 * mt * t * cur[1] + t * t * end[1],
      ]);
    }
  }
  out.push(out[0]);
  return out;
}

/* ---------- 描边栅格化 ---------- */

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** 把线段按网格分桶：1000+ 段的路径逐像素全量测距太慢（1600×485 那种尺寸要算几亿次） */
function buildSegmentGrid(points, cell) {
  const grid = new Map();
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay] = points[i], [bx, by] = points[i + 1];
    const minCx = Math.floor(Math.min(ax, bx) / cell), maxCx = Math.floor(Math.max(ax, bx) / cell);
    const minCy = Math.floor(Math.min(ay, by) / cell), maxCy = Math.floor(Math.max(ay, by) / cell);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = cx + ':' + cy;
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(i);
      }
    }
  }
  return grid;
}

/** 沿路径描边；coverage 由"到路径的距离"解析求得，得到干净的抗锯齿边缘 */
function stroke(canvas, points, { color, width, alpha = 1 }) {
  const half = width / 2;
  const [r, g, b] = color;
  const cell = Math.max(6, Math.ceil(half) + 3);
  const grid = buildSegmentGrid(points, cell);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const pad = half + 2;
  const x0 = Math.max(0, Math.floor(minX - pad)), x1 = Math.min(canvas.width - 1, Math.ceil(maxX + pad));
  const y0 = Math.max(0, Math.floor(minY - pad)), y1 = Math.min(canvas.height - 1, Math.ceil(maxY + pad));

  for (let y = y0; y <= y1; y++) {
    const cy = Math.floor(y / cell);
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const cx = Math.floor(x / cell);
      let best = Infinity;
      for (let gx = cx - 1; gx <= cx + 1 && best > half; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          const list = grid.get(gx + ':' + gy);
          if (!list) continue;
          for (const i of list) {
            const d = distanceToSegment(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
            if (d < best) best = d;
          }
        }
      }
      const coverage = half + 0.5 - best;
      if (coverage <= 0) continue;
      blend(canvas, x, y, [r, g, b], Math.min(1, coverage) * alpha);
    }
  }
}

/** 填充闭合路径（扫描线 + 4× 纵向超采样） */
function fill(canvas, points, { color, alpha = 1 }) {
  const [r, g, b] = color;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of points) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(canvas.height - 1, Math.ceil(maxY));
  const subsamples = 4;
  for (let y = y0; y <= y1; y++) {
    const hits = new Array(canvas.width + 2).fill(0);
    for (let s = 0; s < subsamples; s++) {
      const py = y + (s + 0.5) / subsamples;
      const xs = [];
      for (let i = 0; i < points.length - 1; i++) {
        const [ax, ay] = points[i], [bx, by] = points[i + 1];
        if ((ay <= py && by > py) || (by <= py && ay > py)) {
          xs.push(ax + ((py - ay) / (by - ay)) * (bx - ax));
        }
      }
      xs.sort((a, b2) => a - b2);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const from = Math.max(0, Math.ceil(xs[i] - 0.5)), to = Math.min(canvas.width - 1, Math.floor(xs[i + 1] - 0.5));
        for (let x = from; x <= to; x++) hits[x] += 1 / subsamples;
      }
    }
    for (let x = 0; x <= canvas.width - 1; x++) {
      if (hits[x] > 0) blend(canvas, x, y, [r, g, b], Math.min(1, hits[x]) * alpha);
    }
  }
}

module.exports = { createCanvas, encodePng, stroke, fill, catmullRom, wobble, roundedPolygon };
