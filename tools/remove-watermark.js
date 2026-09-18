/* 清除生成器水印（"豆包AI生成"）。
 *
 *   node tools/remove-watermark.js <输入png> <输出png> [xFraction] [yFraction]
 *
 * 为什么用"固定比例框"而不是自动检测：
 *   试过两条自动路线都不成立 ——
 *   ① 连通块+字形筛选：水印笔画是**连成一块**的，按连通块找不到独立的"字"；
 *      放宽筛选又会把线稿的短笔画算进来，框会撑到 40% 宽（会删掉画）。
 *   ② 按 alpha 阈值区分：水印里同样有全不透明的像素，和画线分不开。
 *   实测结论：水印的位置与尺寸**按图像尺寸等比缩放**（2048×2048 的三张图，
 *   同一比例框内着墨数完全相同 = 7829），所以用比例框是可靠的。
 *
 * 默认框 x≥81.45%w、y≥93.65%h 取自 2048×2048 那张的实测水印边界。
 * 个别素材的画延伸进这个框（如 (5) 的翅膀到 85% 宽），需要传更窄的框 —— 调用方负责核对。
 * 擦除只把 alpha 清零，RGB 不动。 */

const fs = require('fs');
const path = require('path');
const { decode, encode, pixelAt } = require('./png');

const [, , inputArg, outputArg, xArg, yArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error('用法: node tools/remove-watermark.js <输入png> <输出png> [xFraction] [yFraction]');
  process.exit(1);
}
const X_FRACTION = Number(xArg ?? 0.8145);
const Y_FRACTION = Number(yArg ?? 0.9365);

const image = decode(fs.readFileSync(inputArg));
const { width, height } = image;
const x0 = Math.round(width * X_FRACTION);
const y0 = Math.round(height * Y_FRACTION);

const canvas = { width, height, data: new Float32Array(width * height * 4) };
let cleared = 0;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b, a] = pixelAt(image, x, y);
    const i = (y * width + x) * 4;
    canvas.data[i] = r / 255;
    canvas.data[i + 1] = g / 255;
    canvas.data[i + 2] = b / 255;
    const inBox = x >= x0 && y >= y0;
    if (inBox && a > 0) cleared++;
    canvas.data[i + 3] = inBox ? 0 : a / 255;
  }
}

fs.mkdirSync(path.dirname(outputArg), { recursive: true });
fs.writeFileSync(outputArg, encode(canvas));
console.log(JSON.stringify({
  file: path.basename(inputArg),
  size: `${width}x${height}`,
  boxFraction: { x: X_FRACTION, y: Y_FRACTION },
  boxPixels: `${width - x0}x${height - y0}`,
  alphaCleared: cleared,
}));
