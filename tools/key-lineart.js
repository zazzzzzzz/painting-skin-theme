/* 线稿抠底：把"白/浅色底 + 深色线"的线稿转成带 alpha 的 PNG。
 *
 *   node tools/key-lineart.js <输入png> <输出png> [t0] [t1]
 *
 * 与 tools/extract-art.js 的区别（为什么不能复用）：
 *   extract-art 用"边缘连通洪水填充"删背景，它会把每条闭合轮廓**内部**的白色留下 ——
 *   对渲染图没问题（内部本来就是实体），对线稿则是灾难（每个轮廓里都留一块白底）。
 *   线稿该做的是**全局按"与背景色的距离"取 alpha**：线是深色、离背景远 → alpha 高；
 *   底色离背景近 → alpha 0；抗锯齿边缘自然得到中间值。
 *
 * 线色保留原像素（不改成纯黑），这样暗色模式下若想直接用也能用；
 * 本主题实际会在 CSS 里把它当蒙版重新上色，所以线色是否中性并不重要。 */

const fs = require('fs');
const path = require('path');
const { decode, encode, pixelAt } = require('./png');

const [, , inputArg, outputArg, t0Arg, t1Arg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('用法: node tools/key-lineart.js <输入png> <输出png> [t0] [t1]');
  process.exit(1);
}
// 色距低于 t0 判为纯背景（alpha 0），高于 t1 判为纯线条（alpha 1），中间线性过渡
const T0 = Number(t0Arg ?? 10);
const T1 = Number(t1Arg ?? 46);

const image = decode(fs.readFileSync(inputArg));
const { width, height } = image;

/* 背景色：四边各取一圈的中位数（线稿底可能是纯白，也可能是米白） */
const border = [];
for (let x = 0; x < width; x++) { border.push(pixelAt(image, x, 0), pixelAt(image, x, height - 1)); }
for (let y = 0; y < height; y++) { border.push(pixelAt(image, 0, y), pixelAt(image, width - 1, y)); }
const med = (ch) => border.map((p) => p[ch]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
const background = [med(0), med(1), med(2)];

const canvas = { width, height, data: new Float32Array(width * height * 4) };
let inkPixels = 0, partial = 0;
let minX = width, minY = height, maxX = -1, maxY = -1;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = pixelAt(image, x, y);
    const d = Math.hypot(r - background[0], g - background[1], b - background[2]);
    let alpha = (d - T0) / (T1 - T0);
    alpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const i = (y * width + x) * 4;
    canvas.data[i] = r / 255;
    canvas.data[i + 1] = g / 255;
    canvas.data[i + 2] = b / 255;
    canvas.data[i + 3] = alpha;
    if (alpha > 0.02 && alpha < 0.98) partial++;
    if (alpha > 0.5) {
      inkPixels++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}

fs.mkdirSync(path.dirname(outputArg), { recursive: true });
fs.writeFileSync(outputArg, encode(canvas));

const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
console.log(JSON.stringify({
  file: path.basename(inputArg),
  size: `${width}x${height}`,
  background: hex(background),
  inkRatio: +(inkPixels / (width * height) * 100).toFixed(2),
  softEdgePixels: partial,
  contentBox: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  output: path.basename(outputArg),
  outputKB: Math.round(fs.statSync(outputArg).size / 1024),
}));
