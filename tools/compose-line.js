/* 用素材库里的真实碎片合成装饰长条（Diana 的 corner-line / upper-line 槽位原本缺）。
 *
 *   node tools/compose-line.js
 *
 * 做法：从涂鸦主图里自动识别"碎片"（alpha 连通块），按面积/长宽比筛出候选，
 * 再沿一条对角（或水平）轨迹重新排布 —— 缩放、旋转、错落，最后叠加用 line-art
 * 画的极细光丝与四芒星。碎片本身是素材库的原像素，风格必然一致。
 *
 * 为什么不做纯手绘：手绘的碎片是线框感，和素材库里渲染过的水晶接不上（试过，肉眼可见的违和）。 */

const fs = require('fs');
const path = require('path');
const { decode, encode } = require('./png');
const { createCanvas, stroke, catmullRom } = require('./line-art');

const WORK = path.join(__dirname, 'work', 'cosmic');
const SOURCE = path.join(WORK, 'doodle-t5.png');

/* ---------- 连通块识别 ---------- */

/** 腐蚀 alpha 掩码：涂鸦里的碎片被 1–2px 的细光丝连成一体，不先断开就只能识别出整张图 */
function erodeMask(mask, width, height, iterations) {
  let current = mask;
  for (let step = 0; step < iterations; step++) {
    const next = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (current[i] && current[i - 1] && current[i + 1] && current[i - width] && current[i + width]) next[i] = 1;
      }
    }
    current = next;
  }
  return current;
}

function findComponents(image, alphaThreshold = 40, minArea = 260, erodeIterations = 3) {
  const { width, height, channels } = image;
  const alphaAt = (x, y) => image.data[(y * width + x) * channels + 3];

  let mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) >= alphaThreshold) mask[y * width + x] = 1;
    }
  }
  if (erodeIterations > 0) mask = erodeMask(mask, width, height, erodeIterations);

  const seen = new Uint8Array(width * height);
  const components = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (seen[start] || !mask[start]) continue;
      const stack = [start];
      seen[start] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0;
      while (stack.length) {
        const index = stack.pop();
        const cx = index % width, cy = (index - cx) / width;
        area++;
        if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (seen[n] || !mask[n]) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      if (area >= minArea) {
        // 腐蚀后尺寸偏小，向外扩回一点，让裁切包含完整的碎片边缘
        const pad = erodeIterations + 3;
        components.push({
          minX: Math.max(0, minX - pad), minY: Math.max(0, minY - pad),
          maxX: Math.min(width - 1, maxX + pad), maxY: Math.min(height - 1, maxY + pad),
          area, w: Math.min(width - 1, maxX + pad) - Math.max(0, minX - pad) + 1,
          h: Math.min(height - 1, maxY + pad) - Math.max(0, minY - pad) + 1,
        });
      }
    }
  }
  return components;
}

/** 选出互不重叠的碎片候选，按面积从大到小 */
function pickDonors(components, count) {
  const overlap = (a, b) => !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
  const ranked = [...components].sort((a, b) => b.area - a.area);
  const picked = [];
  for (const candidate of ranked) {
    const aspect = candidate.w / candidate.h;
    if (aspect > 3.2 || aspect < 0.31) continue;          // 太细长的多半是光丝
    if (candidate.w < 14 || candidate.h < 14) continue;
    if (picked.some((p) => overlap(p, candidate))) continue;
    picked.push(candidate);
    if (picked.length >= count) break;
  }
  return picked;
}

/* ---------- 预乘 alpha 的双线性采样与合成 ---------- */

/** 从源图取一块，缩放到目标尺寸并旋转 angle，写进目标画布 */
function placeShard(canvas, image, box, centerX, centerY, targetW, angle, opacity) {
  const { channels, width } = image;
  const scale = targetW / box.w;
  const targetH = box.h * scale;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const radius = Math.hypot(targetW, targetH) / 2 + 2;
  const x0 = Math.max(0, Math.floor(centerX - radius)), x1 = Math.min(canvas.width - 1, Math.ceil(centerX + radius));
  const y0 = Math.max(0, Math.floor(centerY - radius)), y1 = Math.min(canvas.height - 1, Math.ceil(centerY + radius));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // 目标像素 → 旋转回未旋转的局部坐标
      const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY;
      const lx = dx * cos + dy * sin;
      const ly = -dx * sin + dy * cos;
      // 局部坐标 → 源图像素坐标
      const sx = box.minX + (lx + targetW / 2) / scale;
      const sy = box.minY + (ly + targetH / 2) / scale;
      if (sx < box.minX - 1 || sy < box.minY - 1 || sx > box.maxX + 1 || sy > box.maxY + 1) continue;

      // 预乘空间双线性，避免半透明边缘渗出黑边
      let r = 0, g = 0, b = 0, a = 0;
      const ix = Math.floor(sx), iy = Math.floor(sy);
      for (const [ox, oy, weight] of [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]]) {
        const px = Math.min(image.width - 1, Math.max(0, ix + ox));
        const py = Math.min(image.height - 1, Math.max(0, iy + oy));
        const w = (ox === 0 ? 1 - (sx - ix) : sx - ix) * (oy === 0 ? 1 - (sy - iy) : sy - iy);
        if (w <= 0) continue;
        const i = (py * width + px) * channels;
        const sa = image.data[i + 3] / 255;
        r += image.data[i] * sa * w;
        g += image.data[i + 1] * sa * w;
        b += image.data[i + 2] * sa * w;
        a += sa * w;
      }
      if (a <= 0.004) continue;
      // 预乘 → 直通
      r /= a; g /= a; b /= a;
      const coverage = Math.min(1, a) * opacity;
      const i = (y * canvas.width + x) * 4;
      const dstA = canvas.data[i + 3];
      const outA = coverage + dstA * (1 - coverage);
      if (outA <= 0) continue;
      canvas.data[i] = (r * coverage + canvas.data[i] * dstA * (1 - coverage)) / outA / 255;
      canvas.data[i + 1] = (g * coverage + canvas.data[i + 1] * dstA * (1 - coverage)) / outA / 255;
      canvas.data[i + 2] = (b * coverage + canvas.data[i + 2] * dstA * (1 - coverage)) / outA / 255;
      canvas.data[i + 3] = outA;
    }
  }
}

/* ---------- 光丝与星点（这两样用矢量画是对的，素材库里也是细线） ---------- */

const COOL_WHITE = [0.93, 0.95, 0.97];

function filament(canvas, x0, y0, x1, y1, amplitude, seed, alpha) {
  const points = [];
  for (let i = 0; i <= 34; i++) {
    const t = i / 34;
    points.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI * 2.3 + seed) * amplitude]);
  }
  stroke(canvas, catmullRom(points, 10), { color: COOL_WHITE, width: 1.15, alpha });
}

function sparkle(canvas, cx, cy, size, alpha) {
  const points = [];
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const r = i % 2 === 0 ? size : size * 0.16;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  // 四芒星用两个细长三角更接近素材库的观感
  stroke(canvas, [points[0], points[4]], { color: COOL_WHITE, width: size * 0.16, alpha });
  stroke(canvas, [points[2], points[6]], { color: COOL_WHITE, width: size * 0.16, alpha });
  stroke(canvas, [points[0], points[4]], { color: COOL_WHITE, width: size * 0.05, alpha: Math.min(1, alpha + 0.3) });
  stroke(canvas, [points[2], points[6]], { color: COOL_WHITE, width: size * 0.05, alpha: Math.min(1, alpha + 0.3) });
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ---------- 两条长条 ---------- */

function buildCorner(image, donors) {
  const W = 1600, H = 460;
  const canvas = createCanvas(W, H);
  const rng = makeRng(77003);
  const count = 22;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const donor = donors[Math.floor(rng() * Math.min(donors.length, 8))];
    const x = W * (0.05 + t * 0.9) + (rng() - 0.5) * 40;
    const y = H * (0.8 - t * 0.58) + Math.sin(t * Math.PI * 2) * H * 0.07 + (rng() - 0.5) * 26;
    const targetW = Math.max(10, (78 - t * 56) * (0.5 + rng() * 1.0));
    placeShard(canvas, image, donor, x, y, targetW, (rng() - 0.5) * 1.6, 0.5 + rng() * 0.45);
  }
  for (let i = 0; i < 4; i++) {
    filament(canvas, 20, H * (0.88 - i * 0.04), W - 20, H * (0.16 + i * 0.05), 30 + i * 11, i * 1.7, 0.3 - i * 0.05);
  }
  for (let i = 0; i < 16; i++) {
    const t = rng();
    sparkle(canvas, W * (0.05 + t * 0.9), H * (0.82 - t * 0.6) + (rng() - 0.5) * H * 0.22, 3 + rng() * 6, 0.5 + rng() * 0.4);
  }
  return { canvas, W, H };
}

function buildUpper(image, donors) {
  const W = 1600, H = 300;
  const canvas = createCanvas(W, H);
  const rng = makeRng(20260919);
  for (let i = 0; i < 13; i++) {
    const donor = donors[Math.floor(rng() * Math.min(donors.length, 6))];
    const x = W * (0.04 + rng() * 0.92);
    const y = H * (0.18 + rng() * 0.62);
    placeShard(canvas, image, donor, x, y, 12 + rng() * 34, (rng() - 0.5) * 2.2, 0.32 + rng() * 0.4);
  }
  for (let i = 0; i < 3; i++) {
    filament(canvas, 20, H * (0.34 + i * 0.17), W - 20, H * (0.3 + i * 0.17), 20 + i * 9, i * 2.1, 0.26 - i * 0.05);
  }
  for (let i = 0; i < 10; i++) {
    sparkle(canvas, rng() * W, H * (0.15 + rng() * 0.7), 2.5 + rng() * 5, 0.42 + rng() * 0.4);
  }
  return { canvas, W, H };
}

/* ---------- 跑 ---------- */

if (!fs.existsSync(SOURCE)) throw new Error('缺少 ' + SOURCE + '，请先对涂鸦主图抠底');
const image = decode(fs.readFileSync(SOURCE));
const components = findComponents(image);
const donors = pickDonors(components, 14);
console.log('识别到连通块', components.length, '个，选中碎片候选', donors.length, '个');
console.log('候选尺寸(宽x高/面积):', donors.slice(0, 8).map((d) => `${d.w}x${d.h}/${d.area}`).join('  '));

for (const [name, build] of [['corner.png', buildCorner], ['upper.png', buildUpper]]) {
  const { canvas, W, H } = build(image, donors);
  const file = path.join(WORK, name);
  fs.writeFileSync(file, encode(canvas));
  console.log(name.padEnd(12), `${W}x${H}`, (fs.statSync(file).size / 1024).toFixed(0) + 'KB');
}
