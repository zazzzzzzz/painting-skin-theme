/* 从参考图提取：① 边缘连通抠底 + 封闭深色块清除  ② 主色聚类（排除背景）
 *
 *   node tools/extract-art.js <输入png> <输出png> [聚类数] [厚度阈值]
 *
 * 为什么用"边缘连通"而不是"全局按颜色扣白"：角色有白色靴子、白高光，全局扣白会一起扣掉。
 * 连通法从画面四条边向内扩散，被深色描边挡住，因此只吃背景。
 *
 * 为什么还要"厚度检测"：深色背景下，被人物发丝/薄纱/细光丝"围住"的背景区域洪水填充进不去，
 * 会留下硬边黑斑（实测在角色两侧和涂鸦主图上都很明显）。单纯放宽容差会把角色身上的
 * 黑色束带一起吃掉。这里用腐蚀存活来区分：厚的大块判为背景，细的深色结构予以保留。 */

const fs = require('fs');
const path = require('path');
const { decode, encode, pixelAt } = require('./png');

const [, , inputArg, outputArg, kArg, thicknessArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('用法: node tools/extract-art.js <输入png> <输出png> [聚类数] [厚度阈值]');
  process.exit(1);
}
const K = Number(kArg || 10);
const MIN_THICKNESS = Number(thicknessArg || 3);   // 0 = 关闭厚度检测，只做边缘连通

const image = decode(fs.readFileSync(inputArg));
const { width, height } = image;

/* ---------- 背景色采样：四边各取一圈，取中位数 ---------- */
const border = [];
for (let x = 0; x < width; x++) { border.push(pixelAt(image, x, 0), pixelAt(image, x, height - 1)); }
for (let y = 0; y < height; y++) { border.push(pixelAt(image, 0, y), pixelAt(image, width - 1, y)); }
const median = (channel) => {
  const values = border.map((p) => p[channel]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};
const background = [median(0), median(1), median(2)];

const distance = (r, g, b, ref) => Math.hypot(r - ref[0], g - ref[1], b - ref[2]);

/* ---------- ① 边缘连通抠底 ---------- */
const TOLERANCE = 34;          // 判定为"背景"的色距上限
const isBackground = new Uint8Array(width * height);
const queue = [];
const pushIfBackground = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = y * width + x;
  if (isBackground[index]) return;
  const [r, g, b] = pixelAt(image, x, y);
  if (distance(r, g, b, background) > TOLERANCE) return;
  isBackground[index] = 1;
  queue.push(index);
};
for (let x = 0; x < width; x++) { pushIfBackground(x, 0); pushIfBackground(x, height - 1); }
for (let y = 0; y < height; y++) { pushIfBackground(0, y); pushIfBackground(width - 1, y); }
while (queue.length) {
  const index = queue.pop();
  const x = index % width, y = (index - x) / width;
  pushIfBackground(x + 1, y); pushIfBackground(x - 1, y);
  pushIfBackground(x, y + 1); pushIfBackground(x, y - 1);
}

/* ---------- ①b 封闭深色块清除（厚度检测） ---------- */
let removedEnclosed = 0;
if (MIN_THICKNESS > 0) {
  // 剩下的"接近背景色但没连到边缘"的像素
  const enclosed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (isBackground[index]) continue;
      const [r, g, b] = pixelAt(image, x, y);
      if (distance(r, g, b, background) <= TOLERANCE) enclosed[index] = 1;
    }
  }
  // 迭代腐蚀：细结构（束带、描边）会被腐蚀掉，厚的块能存活
  let eroded = enclosed;
  for (let step = 0; step < MIN_THICKNESS; step++) {
    const next = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        if (!eroded[index]) continue;
        if (eroded[index - 1] && eroded[index + 1] && eroded[index - width] && eroded[index + width]) next[index] = 1;
      }
    }
    eroded = next;
  }
  // 从腐蚀后存活的"核心"反向恢复整块：4 邻域洪水，回到 enclosed 集合内
  const isBlob = new Uint8Array(width * height);
  const blobQueue = [];
  for (let index = 0; index < width * height; index++) {
    if (eroded[index] && !isBlob[index]) { isBlob[index] = 1; blobQueue.push(index); }
  }
  while (blobQueue.length) {
    const index = blobQueue.pop();
    const x = index % width, y = (index - x) / width;
    const neighbours = [index - 1, index + 1, index - width, index + width];
    for (const n of neighbours) {
      if (n < 0 || n >= width * height || isBlob[n]) continue;
      // 只横向/纵向跨过 1 像素，且不得越过非深色像素
      if (Math.abs((n % width) - x) > 1) continue;
      if (!enclosed[n]) continue;
      isBlob[n] = 1;
      blobQueue.push(n);
    }
  }
  for (let index = 0; index < width * height; index++) {
    if (isBlob[index]) { isBackground[index] = 1; removedEnclosed++; }
  }
}

/* ---------- 抗白边：贴着背景的像素按色距给部分 alpha ---------- */
const canvas = { width, height, data: new Float32Array(width * height * 4) };
let minX = width, minY = height, maxX = -1, maxY = -1;
let backgroundCount = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const [r, g, b] = pixelAt(image, x, y);
    const i = index * 4;
    if (isBackground[index]) { backgroundCount++; continue; }        // alpha 保持 0
    // 只有紧邻背景的像素才需要软化，避免把实心色块也削薄
    let touchesBackground = false;
    for (let dy = -1; dy <= 1 && !touchesBackground; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) { touchesBackground = true; break; }
        if (isBackground[ny * width + nx]) { touchesBackground = true; break; }
      }
    }
    let alpha = 1;
    if (touchesBackground) {
      const d = distance(r, g, b, background);
      alpha = Math.max(0, Math.min(1, (d - 10) / 40));
    }
    canvas.data[i] = r / 255;
    canvas.data[i + 1] = g / 255;
    canvas.data[i + 2] = b / 255;
    canvas.data[i + 3] = alpha;
    if (alpha > 0.5) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
fs.mkdirSync(path.dirname(outputArg), { recursive: true });
fs.writeFileSync(outputArg, encode(canvas));

/* ---------- ② 主色聚类（只在实心像素上做） ---------- */
const samples = [];
for (let index = 0; index < width * height; index++) {
  if (canvas.data[index * 4 + 3] < 0.95) continue;
  samples.push([canvas.data[index * 4] * 255, canvas.data[index * 4 + 1] * 255, canvas.data[index * 4 + 2] * 255]);
}
// k-means++ 初始化，避免退化到全挤在一个簇
const centroids = [samples[Math.floor(samples.length / 2)].slice()];
while (centroids.length < K) {
  const distSq = samples.map((s) => Math.min(...centroids.map((c) => (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2)));
  const total = distSq.reduce((a, b) => a + b, 0);
  let target = Math.random() * total;
  let picked = samples.length - 1;
  for (let i = 0; i < samples.length; i++) { target -= distSq[i]; if (target <= 0) { picked = i; break; } }
  centroids.push(samples[picked].slice());
}
let assignments = new Array(samples.length).fill(0);
for (let iteration = 0; iteration < 14; iteration++) {
  assignments = samples.map((s) => {
    let best = 0, bestD = Infinity;
    centroids.forEach((c, ci) => {
      const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
      if (d < bestD) { bestD = d; best = ci; }
    });
    return best;
  });
  for (let ci = 0; ci < centroids.length; ci++) {
    const members = samples.filter((_, i) => assignments[i] === ci);
    if (!members.length) continue;
    centroids[ci] = [0, 1, 2].map((ch) => members.reduce((a, s) => a + s[ch], 0) / members.length);
  }
}

const toHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const toHsl = (c) => {
  const [r, g, b] = c.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
};
const clusters = centroids.map((c, ci) => ({
  hex: toHex(c),
  rgb: c.map((v) => Math.round(v)),
  hsl: toHsl(c),
  share: +(samples.filter((_, i) => assignments[i] === ci).length / samples.length).toFixed(3),
})).sort((a, b) => b.share - a.share);

console.log(JSON.stringify({
  input: path.basename(inputArg),
  size: `${width}x${height}`,
  background: { rgb: background, hex: toHex(background) },
  backgroundPixels: backgroundCount,
  enclosedDarkRemoved: removedEnclosed,
  minThickness: MIN_THICKNESS,
  opaquePixels: samples.length,
  contentBox: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  output: outputArg,
  clusters,
}, null, 1));
