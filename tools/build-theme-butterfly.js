/* 从 素材/ 生成 butterfly-line 主题的素材集。
 *
 *   node tools/build-theme-butterfly.js
 *
 * **本主题的素材全部来自 `素材/`**，分两条流水线：
 *   ① 立绘：原图直出，不抠底、不拍平 —— 素材/2.png 是带透明底的全彩插画，
 *      用 ffmpeg 缩放到 CHARACTER_OUT_HEIGHT 即可（保 RGBA）。自研通道在这张图上会丢颜色
 *      （只留下黑色 alpha 形状），而且立绘本来也不需要抠底。
 *   ② 装饰（涂鸦 / 星星 / 糖果 ×2 / 小动物 ×2 / 角线 / 上缘线）：原样使用，只按 maxW 缩放。
 *      关键教训：这些是暖桃粉色的线稿（均值 #fdd0c1 这类），Diana 的暗色模式是"直接铺图 +
 *      brightness/saturate 压暗"——素材自身的颜色就是显示色。一旦按线稿那套把 RGB 拍平成白，
 *      暗色模式下就只剩灰白线条。
 *
 * 另有一条**当前未使用**的线稿流水线（PLAN + analyze/resample）：抠底（按与背景色的距离取 alpha）
 * → 裁到内容框 → 降采样 → RGB 归一为白 + alpha 量化 16 级。留给以后做"线稿 + 纯色填充"的主题用
 * （`线稿/` 下那 8 张 AI 生成立绘就是给这条路准备的）：把条目加进 PLAN 即可。
 *
 * 输出写入 themes/butterfly-line/assets/，并打印每个槽位的尺寸与体积。 */

const fs = require('fs');
const path = require('path');
const { decode, encode } = require('./png');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '素材');
/* 装饰的源也取 `素材/`：那 8 张就是 Diana 的素材（与 themes/diana/assets/ 里的字节完全相同），
 * 这样"本主题的素材全部来自 素材/"这句话才是真的。 */
const DIANA = SRC;
const OUT = path.join(ROOT, 'themes', 'butterfly-line', 'assets');

/* 槽位 → 源文件 + 目标长边（像素）
 * 本主题的装饰直接照搬 Diana 的素材（见下方 DIANA_COPY），这里留空。
 * 若以后要用 素材/ 里的线稿，把条目加回来即可：{ role, file, max, kind: 'line' }。 */
const PLAN = [];

/* Diana 的装饰素材：**原样使用，只按需缩放**（源在 素材/，见 DIANA 的说明）。 */
const DIANA_COPY = [
  { role: 'doodle',        src: 'diana-doodle-v2.png',         maxW: 820 },
  { role: 'star',          src: 'diana-star-v2.png',           maxW: 420 },
  { role: 'candyWrapped',  src: 'diana-candy-wrapped-v1.png',  maxW: 420 },
  { role: 'candyLollipop', src: 'diana-candy-lollipop-v1.png', maxW: 420 },
  { role: 'acaoHeart',     src: 'diana-acao-heart-v3.png',     maxW: 520 },
  { role: 'acaoCheer',     src: 'diana-acao-cheer-v1.png',     maxW: 520 },
  { role: 'corner',        src: 'diana-corner-line-v7.png',    maxW: 1100 },
  { role: 'upper',         src: 'diana-upper-line.png',        maxW: 490 },
];

const T0 = 10, T1 = 46;          // 抠底阈值：色距 < T0 判纯背景，> T1 判纯线条
const LEVELS = 16;               // alpha 量化级数

function borderColor(image) {
  const { width, height, channels } = image;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [image.data[i], image.data[i + 1], image.data[i + 2]];
  };
  const samples = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 200))) { samples.push(at(x, 0), at(x, height - 1)); }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 200))) { samples.push(at(0, y), at(width - 1, y)); }
  const med = (k) => samples.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  return [med(0), med(1), med(2)];
}

/** 抠底 + 裁框：返回 { box, alpha(x,y) } */
function analyze(image, kind) {
  const { width, height, channels } = image;
  const bg = borderColor(image);
  const alpha = new Float32Array(width * height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      let a;
      if (kind === 'render' || kind === 'solid' || kind === 'alpha') {
        a = channels === 4 ? image.data[i + 3] / 255 : 1;
      } else {
        const d = Math.hypot(image.data[i] - bg[0], image.data[i + 1] - bg[1], image.data[i + 2] - bg[2]);
        a = Math.max(0, Math.min(1, (d - T0) / (T1 - T0)));
      }
      alpha[y * width + x] = a;
      if (a > 0.5) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { box: { x: 0, y: 0, width, height }, alpha };
  return { box: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, alpha };
}

/** 降采样（块平均）+ alpha 量化，RGB 拍平成白 */
function resample(image, alpha, box, maxEdge, kind) {
  const scale = Math.min(1, maxEdge / Math.max(box.width, box.height));
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const canvas = { width, height, data: Buffer.alloc(width * height * 4) };
  const sx = box.width / width, sy = box.height / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = box.x + Math.floor(x * sx), x1 = Math.max(x0 + 1, box.x + Math.floor((x + 1) * sx));
      const y0 = box.y + Math.floor(y * sy), y1 = Math.max(y0 + 1, box.y + Math.floor((y + 1) * sy));
      let sum = 0, n = 0, rSum = 0, gSum = 0, bSum = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const si = (yy * image.width + xx) * image.channels;
        const a0 = alpha[yy * image.width + xx];
        sum += a0; n++;
        // 预乘：颜色按 alpha 加权，避免透明区把颜色拖暗（边缘发黑）
        rSum += (image.data[si] / 255) * a0; gSum += (image.data[si + 1] / 255) * a0; bSum += (image.data[si + 2] / 255) * a0;
      }
      let a = n ? sum / n : 0;
      const i = (y * width + x) * 4;
      if (kind === 'render') {
        a = Math.round(a * 64) / 64;                     // 渲染图 alpha 只做轻量化，保住柔和边缘
        const w = sum > 0 ? sum : 1;
        canvas.data[i] = Math.min(1, rSum / w); canvas.data[i + 1] = Math.min(1, gSum / w); canvas.data[i + 2] = Math.min(1, bSum / w);
      } else {
        a = Math.round(a * LEVELS) / LEVELS;             // 线稿 / alpha 蒙版：alpha 量化到 16 级
        canvas.data[i] = 1; canvas.data[i + 1] = 1; canvas.data[i + 2] = 1;   // RGB 拍平为白（只留 alpha 有意义）
      }
      canvas.data[i + 3] = a;
    }
  }
  return canvas;
}

fs.mkdirSync(OUT, { recursive: true });
const report = [];

/* Diana 的 8 张装饰素材：原样使用（只按 maxW 缩放），**颜色与 alpha 都保留**。
 * 用 ffmpeg 缩放而不是自研通道：这条路径不碰像素格式，素材自带什么颜色就输出什么颜色。 */
for (const item of DIANA_COPY) {
  const src = path.join(DIANA, item.src);
  if (!fs.existsSync(src)) { console.error('跳过（Diana 素材不存在）：' + item.src); continue; }
  const name = item.role.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + '.png';
  const out = path.join(OUT, name);
  try {
    const { execFileSync } = require('child_process');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src,
      '-vf', `scale='min(iw,${item.maxW})':-1`, '-pix_fmt', 'rgba', out]);
    const img = decode(fs.readFileSync(out));
    report.push({ role: item.role, src: item.src, box: '—', out: `${img.width}×${img.height}`, kb: Math.round(fs.statSync(out).size / 1024) });
  } catch (error) {
    console.error(`${item.role} 处理失败：` + error.message);
  }
}

/* 立绘：**原图直出**，不参与上面那套抠底/拍平流程。
 * 它是带透明底的全彩插画，用 ffmpeg 缩放到指定高度即可（保 RGBA）——
 * 自研通道在这张图上会把颜色丢掉（只留下黑色 alpha 形状），而且立绘本来也不需要抠底。
 * 用 ffmpeg 而不是自己写缩放：它的 PNG RGBA 处理是久经考验的。
 *
 * 尺寸按**显示尺寸的 2 倍**定：显示盒是 width clamp(270px,46cqw,440px) × height min(78vh,720px)，
 * 所以 1440 高就够（diana 那两张是 1462 高，同一个比例）。不能贪大 —— 运行时把素材内联成
 * data URI，**单条 CSS 声明过长会静默失效**（实测 1.86MB 的立绘 → base64 2.5MB 时那条变量算成
 * 空字符串，元素完全不绘制、还不报错），复核项 `artworkResolved` 就是为这个坑加的。 */
const CHARACTER_OUT_HEIGHT = 1440;
try {
  const { execFileSync } = require('child_process');
  const out = path.join(OUT, 'character.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(SRC, '2.png'),
    '-vf', 'scale=-1:' + CHARACTER_OUT_HEIGHT, '-pix_fmt', 'rgba', out]);
  const img = decode(fs.readFileSync(out));
  report.push({ role: 'character', src: '2.png（原图直出）', box: '—', out: `${img.width}×${img.height}`, kb: Math.round(fs.statSync(out).size / 1024) });
} catch (error) {
  console.error('立绘缩放失败（需要 ffmpeg）：' + error.message);
}
for (const item of PLAN) {
  const src = item.dir === 'diana' ? path.join(DIANA, item.file) : path.join(SRC, item.file);
  if (!fs.existsSync(src)) { console.error(`跳过（源文件不存在）：${item.file}`); continue; }
  const image = decode(fs.readFileSync(src));
  const { box, alpha } = analyze(image, item.kind);
  const canvas = resample(image, alpha, box, item.max, item.kind);
  const name = item.role.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()) + '.png';
  const file = path.join(OUT, name);
  fs.writeFileSync(file, encode(canvas));
  const kb = Math.round(fs.statSync(file).size / 1024);
  report.push({ role: item.role, src: item.file, box: `${box.width}×${box.height}`, out: `${canvas.width}×${canvas.height}`, kb });
}
console.log('role             源图内容框        输出          体积');
for (const r of report) console.log(`${r.role.padEnd(16)} ${r.box.padEnd(16)} ${r.out.padEnd(12)} ${r.kb} KB`);
console.log(`合计 ${report.reduce((s, r) => s + r.kb, 0)} KB → base64 约 ${Math.round(report.reduce((s, r) => s + r.kb, 0) * 1.37)} KB`);
