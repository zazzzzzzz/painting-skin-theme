/* 线稿换色：把素材的线色从一套锚点重映射到另一套，**alpha 与形状一像素不动**。
 *
 *   node tools/recolor-lineart.js <输入png> <输出png> --from "#fddbc6,#faafac" --to "#dff4fb,#2f7fc4"
 *   node tools/recolor-lineart.js --dir 源目录 --out 目标目录 --roles doodle,star,... --from ... --to ...
 *
 * 为什么要它：Diana 那套素材的形状与结构（外宽浅 + 内细深的双色描边）已经调好，
 * 换角色/换主题时不需要重画，只需要换线色 —— 而主题的暗色分支是"直接铺素材本身"的
 * （见 themes/shorekeeper-line/skin/theme.css 里那几条 theme-zai-dark 规则），
 * 素材自带什么颜色，界面里就显示什么颜色。浅色分支走 mask + token 上色，与素材线色无关。
 *
 * 换色口径：把每个像素投影到"源锚点连线"上得到 t，再输出 目标锚点 的 lerp(t)。
 * 这样浅色层（外描边）与深色层（芯线）的相对关系不变，层次不会塌。
 * 源锚点 = 从 themes/diana/assets 实测的外层/芯线色；目标锚点取主题的 --diana-zcode-line-* token。
 */

const fs = require('fs');
const path = require('path');
const { decode, encode } = require('./png');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const hex2rgb = (h) => {
  const m = h.replace('#', '').match(/../g);
  return m.map((v) => parseInt(v, 16) / 255);
};
const parseAnchors = (s, label) => {
  const parts = (s || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (parts.length !== 2) { console.error(`${label} 需要两个锚点，形如 "#aabbcc,#ddeeff"`); process.exit(1); }
  return parts.map(hex2rgb);
};

const FROM = parseAnchors(argOf('from', '#fddbc6,#faafac'), '--from');   // diana 实测：外层 / 芯线
const TO = parseAnchors(argOf('to', ''), '--to');
const DIR = argOf('dir', '');
const OUTDIR = argOf('out', '');
const ROLES = argOf('roles', '').split(',').filter(Boolean);

/* 源目录 → 目标目录：按 theme.json 的角色名逐个换色（文件名即角色名） */
const SRC_DIR = DIR || path.join(__dirname, 'work', 'recolor-src');
const OUT = OUTDIR || path.join(__dirname, 'work', 'recolor-out');
const roles = ROLES.length ? ROLES : fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''));

const [A, B] = FROM, [A2, B2] = TO;
const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
const abLen2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;

fs.mkdirSync(OUT, { recursive: true });
console.log(`锚点 ${argOf('from', '#fddbc6,#faafac')} → ${argOf('to', '')}`);
for (const role of roles) {
  const src = path.join(SRC_DIR, role + '.png');
  if (!fs.existsSync(src)) { console.error(`   跳过（没有）：${src}`); continue; }
  const img = decode(fs.readFileSync(src));
  const n = img.width * img.height;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4] / 255, g = img.data[i * 4 + 1] / 255, b = img.data[i * 4 + 2] / 255;
    const a = img.data[i * 4 + 3] / 255;
    // 投影到源锚点连线
    const t = Math.max(0, Math.min(1, ((r - A[0]) * ab[0] + (g - A[1]) * ab[1] + (b - A[2]) * ab[2]) / abLen2));
    out[i * 4] = A2[0] + (B2[0] - A2[0]) * t;
    out[i * 4 + 1] = A2[1] + (B2[1] - A2[1]) * t;
    out[i * 4 + 2] = A2[2] + (B2[2] - A2[2]) * t;
    out[i * 4 + 3] = a;
  }
  fs.writeFileSync(path.join(OUT, role + '.png'), encode({ width: img.width, height: img.height, data: out }));
  console.log('   ' + role.padEnd(15), `${img.width}x${img.height}`.padEnd(11), Math.round(out.length * 4 / 1024) + 'KB 写出');
}
