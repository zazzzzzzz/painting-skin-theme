/* 取色：对整图或指定区域做主色聚类。
 *   node tools/palette.js <png> [k] [x,y,w,h]
 *
 * 为什么要能分区域：一张场景图的整体主色会被大面积的背景吃掉，
 * 想量"玻璃碎片的颜色"或"机械光环的颜色"必须限定区域单独统计。
 * 聚类在 Lab 空间做（RGB 欧氏距离在暗部和高饱和区都偏得不合理）。 */

const fs = require('fs');
const { decode, pixelAt } = require('./png');

const [, , file, kArg, regionArg] = process.argv;
if (!file) { console.error('用法: node tools/palette.js <png> [k] [x,y,w,h]'); process.exit(1); }
const K = Number(kArg || 10);

const image = decode(fs.readFileSync(file));
const [x0, y0, w, h] = regionArg
  ? regionArg.split(',').map(Number)
  : [0, 0, image.width, image.height];

/* sRGB → Lab（D65） */
function toLab(r, g, b) {
  const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g2 = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  x = g2(x); y = g2(y); z = g2(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const samples = [];
const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 60000)));   // 控制样本量
for (let y = y0; y < Math.min(y0 + h, image.height); y += step) {
  for (let x = x0; x < Math.min(x0 + w, image.width); x += step) {
    const [r, g, b] = pixelAt(image, x, y);
    samples.push({ rgb: [r, g, b], lab: toLab(r, g, b) });
  }
}

/* k-means++ */
const centroids = [samples[Math.floor(samples.length / 2)].lab.slice()];
while (centroids.length < K) {
  const distSq = samples.map((s) => Math.min(...centroids.map((c) => (s.lab[0] - c[0]) ** 2 + (s.lab[1] - c[1]) ** 2 + (s.lab[2] - c[2]) ** 2)));
  const total = distSq.reduce((a, b) => a + b, 0);
  let target = Math.random() * total, picked = samples.length - 1;
  for (let i = 0; i < samples.length; i++) { target -= distSq[i]; if (target <= 0) { picked = i; break; } }
  centroids.push(samples[picked].lab.slice());
}
let assignments = new Array(samples.length).fill(0);
for (let iteration = 0; iteration < 16; iteration++) {
  assignments = samples.map((s) => {
    let best = 0, bestD = Infinity;
    centroids.forEach((c, ci) => {
      const d = (s.lab[0] - c[0]) ** 2 + (s.lab[1] - c[1]) ** 2 + (s.lab[2] - c[2]) ** 2;
      if (d < bestD) { bestD = d; best = ci; }
    });
    return best;
  });
  for (let ci = 0; ci < centroids.length; ci++) {
    const members = samples.filter((_, i) => assignments[i] === ci);
    if (!members.length) continue;
    centroids[ci] = [0, 1, 2].map((ch) => members.reduce((a, s) => a + s.lab[ch], 0) / members.length);
  }
}

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const hsl = (c) => {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { h: Math.round(hue * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
};

const clusters = centroids.map((lab, ci) => {
  const members = samples.filter((_, i) => assignments[i] === ci);
  const mean = [0, 1, 2].map((ch) => members.reduce((a, s) => a + s.rgb[ch], 0) / (members.length || 1));
  return { hex: hex(mean), rgb: mean.map(Math.round), hsl: hsl(mean), share: +(members.length / samples.length).toFixed(3) };
}).sort((a, b) => b.share - a.share);

console.log(JSON.stringify({
  file: file.split(/[/\\]/).pop(),
  region: regionArg ? { x: x0, y: y0, w, h } : 'full',
  imageSize: `${image.width}x${image.height}`,
  samples: samples.length,
  clusters,
}, null, 1));
