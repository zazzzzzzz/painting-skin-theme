/* 线稿素材自检：量着墨比例、线宽、线色、实心块 —— 出图后逐张比对基准值。
 *
 *   node tools/ink-metrics.js <png> [png ...]
 *
 * 为什么需要它：提示词里写着"无填充、线条纤细均匀"，但出图经常不听话 ——
 * 着墨比例肉眼分不出 8% 还是 20%，线宽也会随生成分辨率漂。这里把"看着像不像"
 * 换成四个可以逐张打印的数。
 *
 * 阈值固定为 alpha>32（能看见的着墨）。基准值（Diana 那套实测，见 tools/prompts/*-img2img.md）：
 *   doodle 1267x1241 → 着墨 7.98%，线宽中位 8px = 0.63% 画布宽
 *   star   256x256    → 着墨 12.16%
 *   corner 1600x485   → 着墨 0.72%（细弱的长线）
 *   upper  490x315    → 着墨 1.76%
 *
 * 实心块（纵横双向都 >= SOLID 像素）是"填充"的判据：线稿里这类像素应接近 0，
 * 出现成片的实心块说明模型给线条上了填充色。
 */

const fs = require('fs');
const { decode } = require('./png');

const SOLID = 8;

function metrics(file) {
  const img = decode(fs.readFileSync(file));
  const { width: W, height: H, data: d } = img;
  const ch = img.channels;
  const n = W * H;
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) alpha[i] = d[i * ch + 3];

  let ink = 0;                                   // 着墨像素
  const hruns = [];                              // 横向连续段（只收 >3px 的，滤掉抗锯齿碎点）
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) {
      if (alpha[y * W + x] > 32) { ink++; run++; }
      else { if (run > 3) hruns.push(run); run = 0; }
    }
    if (run > 3) hruns.push(run);
  }
  hruns.sort((a, b) => a - b);

  // 实心块：纵横双向都够厚的像素（线稿里≈0，填充/色块会成片出现）
  const hlen = new Uint16Array(n), vlen = new Uint16Array(n);
  for (let y = 0; y < H; y++) {
    let run = 0;
    for (let x = 0; x < W; x++) { const i = y * W + x; if (alpha[i] > 128) { run++; hlen[i] = run; } else run = 0; }
    for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (hlen[i]) hlen[i] = Math.max(hlen[i], hlen[i + 1] || 0); }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) { const i = y * W + x; if (alpha[i] > 128) { run++; vlen[i] = run; } else run = 0; }
    for (let y = H - 1; y >= 0; y--) { const i = y * W + x; if (vlen[i]) vlen[i] = Math.max(vlen[i], vlen[i + W] || 0); }
  }
  let solid = 0;
  for (let i = 0; i < n; i++) if (hlen[i] >= SOLID && vlen[i] >= SOLID) solid++;

  let r = 0, g = 0, b = 0, core = 0;             // 线芯色（alpha>200）
  for (let i = 0; i < n; i++) if (alpha[i] > 200) { r += d[i * ch]; g += d[i * ch + 1]; b += d[i * ch + 2]; core++; }
  const hex = (v) => v.toString(16).padStart(2, '0');
  const med = hruns.length ? hruns[hruns.length >> 1] : 0;
  const max = hruns.length ? hruns[hruns.length - 1] : 0;

  return {
    文件: file.replace(/\\/g, '/').split('/').pop(),
    画布: `${W}x${H}`,
    比例: (W / H).toFixed(2),
    着墨: (ink / n * 100).toFixed(2) + '%',
    线宽中位: med + 'px',
    占画布宽: (med / W * 100).toFixed(2) + '%',
    最长横段: max + 'px',
    实心块: (solid / n * 100).toFixed(2) + '%',
    线芯色: core ? '#' + hex(Math.round(r / core)) + hex(Math.round(g / core)) + hex(Math.round(b / core)) : '—',
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('用法: node tools/ink-metrics.js <png> [png ...]');
  process.exit(1);
}
const rows = files.map(metrics);
const cols = Object.keys(rows[0]);
const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c]).length)));
console.log(cols.map((c, i) => c.padEnd(w[i])).join('  '));
console.log(w.map((x) => '-'.repeat(x)).join('  '));
for (const r of rows) console.log(cols.map((c, i) => String(r[c]).padEnd(w[i])).join('  '));
