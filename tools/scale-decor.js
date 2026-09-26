/* 把装饰素材按**实机显示尺寸**重做一遍，消掉它们自己的锯齿。
 *
 *   node tools/scale-decor.js [--dry]
 *
 * 为什么需要：装饰是用 `mask: var(--diana-zcode-image-xxx) center / contain` 画的，而元素盒子由
 * 主题 CSS 的 clamp 上限决定 —— 涂鸦 340 CSS px、星形 34–46、糖果 74/80、AoA 112/118、
 * 角线 820、上缘线 350；素材本身却是 1267/256/512/1600 px 宽。也就是浏览器每帧把它们
 * **缩小 3–7 倍**再画（星形 256 → 约 39 设备px），细线条必然碎成锯齿。
 * 交付口径与立绘一致：**素材宽 = 该元素显示宽（CSS 上限 × dpr）**，浏览器几乎不重采样，
 * 抗锯齿由我们的 lanczos 负责。源文件仍是 themes/diana/assets 里那 8 张原图（不动），
 * 只把缩放后的版本写进各主题 —— 生成器的第 ③ 步也改成走同一张表（见 build-theme-motion.js）。
 *
 * 注意：这会打破"装饰与 Diana 原文件逐字节一致"那条老规则（那条是为了"少一层加工、可核对哈希"），
 * 换来的是细线条不再锯齿；源文件与缩放比例的对应关系写在下面这张表里，可随时重跑。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');
/* [文件名, 元素显示宽（CSS px，取主题 CSS 里 clamp 的上限）, 别名] */
const TABLE = [
  ['doodle', 340, '涂鸦'],
  ['corner', 820, '角线'],
  ['upper', 350, '上缘线'],
  ['star', 46, '星形（star-a 34 / star-b 46，取大的）'],
  ['candy-wrapped', 74, '糖（缠）'],
  ['candy-lollipop', 80, '糖（棒）'],
  ['acao-heart', 118, 'AoA 心'],
  ['acao-cheer', 112, 'AoA 呼'],
];
const DPR = 1.1363636;   // 实机 dpr（2560 物理 / 2253 CSS）

/* 源文件在 Diana 的清单里（文件名带版本后缀，如 diana-doodle-v2.png）——别硬编码文件名 */
const dianaManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes', 'diana', 'theme.json'), 'utf-8'));
const ROLE = { doodle: 'doodle', corner: 'corner', upper: 'upper', star: 'star',
  'candy-wrapped': 'candyWrapped', 'candy-lollipop': 'candyLollipop', 'acao-heart': 'acaoHeart', 'acao-cheer': 'acaoCheer' };
const diana = path.join(ROOT, 'themes', 'diana');
const targets = fs.readdirSync(path.join(ROOT, 'themes')).filter((d) => d !== 'diana' && fs.existsSync(path.join(ROOT, 'themes', d, 'assets')));

console.log(`按显示尺寸重做装饰：${targets.length} 套主题`);
for (const [name, cssW, alias] of TABLE) {
  const src = path.join(diana, dianaManifest.assets[ROLE[name]]);
  if (!fs.existsSync(src)) { console.log(`  ⚠ 源文件不在：${src}`); continue; }
  const outW = Math.round(cssW * DPR);
  const kb = (f) => Math.round(fs.statSync(f).size / 1024);
  console.log(`  ${name.padEnd(15)} ${alias.padEnd(28)} 显示 ${cssW}CSS → ${outW}px　源 ${kb(src)}KB`);
  if (DRY) continue;
  for (const id of targets) {
    const dst = path.join(ROOT, 'themes', id, 'assets', name + '.png');
    if (!fs.existsSync(dst)) continue;
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf', `scale=${outW}:-2:flags=lanczos`, '-pix_fmt', 'rgba', dst]);
  }
}
if (!DRY) {
  console.log('\n抽样：');
  for (const id of ['c581-line', 'tia-line'].filter((x) => targets.includes(x))) {
    for (const [name] of TABLE) {
      const f = path.join(ROOT, 'themes', id, 'assets', name + '.png');
      const dim = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim();
      process.stdout.write(`${name}=${dim}(${Math.round(fs.statSync(f).size / 1024)}KB) `);
    }
    console.log(`  ← ${id}`);
  }
}
