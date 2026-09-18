/* 从线稿反算剪影蒙版：给纯线条的人形"填充体量"。
 *
 *   node tools/make-silhouette.js <线稿png> <输出png> [膨胀像素]
 *
 * 为什么需要：线稿的 alpha 只落在**线条**上，轮廓内部是透明的。
 * 深色底上只剩一堆等亮度的细线（发丝/裙褶/荷叶边同粗细同亮度），没有体量也没有主次，
 * 看起来就是一团白线网。给它垫一层剪影，形才立得住。
 *
 * 做法：先把线条膨胀 N 像素把可能存在的断口糊上 → 从画面四边洪水填充"外部" →
 *      不是外部也不是线条的区域就是"内部" → 剪影 = 内部 ∪ 线条 → 再腐蚀 N 像素把
 *      膨胀抵消掉，使剪影边缘回到原始轮廓上。
 * 断口太多时会漏（剪影几乎为空），脚本会报 filledRatio，调用方需核对。 */

const fs = require('fs');
const path = require('path');
const { decode, encode, pixelAt } = require('./png');

const [, , inputArg, outputArg, dilateArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('用法: node tools/make-silhouette.js <线稿png> <输出png> [膨胀像素]');
  process.exit(1);
}
const DILATE = Number(dilateArg ?? 3);

const image = decode(fs.readFileSync(inputArg));
const { width, height } = image;
const total = width * height;

const line = new Uint8Array(total);
for (let i = 0; i < total; i++) {
  const a = image.channels === 4 ? image.data[i * 4 + 3] : 255;
  if (a > 60) line[i] = 1;
}

/* 膨胀：把断口糊上，否则洪水填充会从缝隙漏进去 */
function dilate(mask, times) {
  let cur = mask;
  for (let step = 0; step < times; step++) {
    const next = new Uint8Array(total);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (cur[i]) { next[i] = 1; continue; }
        if ((x > 0 && cur[i - 1]) || (x < width - 1 && cur[i + 1])
          || (y > 0 && cur[i - width]) || (y < height - 1 && cur[i + width])) next[i] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

function erode(mask, times) {
  let cur = mask;
  for (let step = 0; step < times; step++) {
    const next = new Uint8Array(total);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!cur[i]) continue;
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) continue;
        if (cur[i - 1] && cur[i + 1] && cur[i - width] && cur[i + width]) next[i] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

const thick = dilate(line, DILATE);

/* 从四边洪水填充"外部"（只在非线条区域扩散） */
const outside = new Uint8Array(total);
const queue = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = y * width + x;
  if (outside[i] || thick[i]) return;
  outside[i] = 1;
  queue.push(i);
};
for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
for (let y = 0; y < height; y++) { push(0, y); push(width - 1, y); }
while (queue.length) {
  const i = queue.pop();
  const x = i % width, y = (i - x) / width;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

/* 剪影 = 非外部；再腐蚀掉膨胀量，使边缘回到原始轮廓 */
const filled = new Uint8Array(total);
let filledCount = 0;
for (let i = 0; i < total; i++) if (!outside[i]) { filled[i] = 1; filledCount++; }
const silhouette = erode(filled, DILATE);

const canvas = { width, height, data: new Float32Array(total * 4) };
let finalCount = 0;
for (let i = 0; i < total; i++) {
  canvas.data[i * 4] = 1;
  canvas.data[i * 4 + 1] = 1;
  canvas.data[i * 4 + 2] = 1;
  const on = silhouette[i] ? 1 : 0;
  canvas.data[i * 4 + 3] = on;
  finalCount += on;
}

fs.mkdirSync(path.dirname(outputArg), { recursive: true });
fs.writeFileSync(outputArg, encode(canvas));
console.log(JSON.stringify({
  file: path.basename(inputArg),
  size: `${width}x${height}`,
  dilate: DILATE,
  lineRatio: +(line.reduce((a, b) => a + b, 0) / total * 100).toFixed(2),
  filledRatio: +(filledCount / total * 100).toFixed(2),
  silhouetteRatio: +(finalCount / total * 100).toFixed(2),
  outputKB: Math.round(fs.statSync(outputArg).size / 1024),
  warn: finalCount / total < 0.02 ? '剪影几乎为空：轮廓断口太多，需加大膨胀像素' : null,
}));
