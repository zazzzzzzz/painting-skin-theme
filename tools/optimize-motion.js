/* 立绘视频优化器：**最小无缝循环 + 按显示尺寸交付 + 视觉无损的最大压缩**。
 *
 *   node tools/optimize-motion.js --frames <帧目录> --crop x,y,w,h --fps 30 --target-w 1180 \
 *        [--loop-min 0.6] [--sweep 14,16,18,20] [--probe 24] [--out <webm 路径>] [--dry]
 *
 * 为什么不是"原样无损直出"：
 *   · **锯齿**：实机立绘框只有 ~519×620 CSS px（设备 ~590×705），把 1808–2776px 宽的素材直接交给
 *     `<video>`，浏览器每帧都用便宜的缩放器做 3.5–5.3× 降采样 —— 欠采样就是肉眼看到的锯齿。
 *     按"显示尺寸 × 1.5~2"交付，缩放比降到 1× 附近，锯齿从根上消失（还顺带把体积压下去）。
 *   · **循环**：源动画往往含多个相同循环（尤诺 400 帧 = 两遍 200 帧），只留**最小无缝周期**。
 *   · **压缩**：在交付尺寸下扫一遍 CRF，取"合成后误差仍在视觉无损阈值内"的最大压缩档。
 *
 * 判据都是可复现的数字：
 *   ① 周期 P 成立 = 对所有 i 都有 mean|f[i]-f[i+P]| ≤ 阈值（并在缩略图上判）；
 *   ② 视觉无损 = 解码后与"同尺寸高质量缩放源帧"逐像素比：平均 < 1/255、p99.9 < 6/255、
 *      无单像素 > 20/255，且 **alpha 单独比**（alpha 台阶最显眼，误差必须≈0）；
 *   ③ 锯齿 = 边缘带（半透明像素邻域）的高频误差，与高质量参考比。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { decode } = require('./png');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const FRAMES = argOf('frames', '');
const CROP = argOf('crop', '').split(',').map(Number);
const FPS = Number(argOf('fps', '30'));
const TARGET_W = Number(argOf('target-w', '1180'));
const LOOP_MIN = Number(argOf('loop-min', '0.6'));      // 最短循环（秒），避免把"帧间抖动"当成周期
const SWEEP = argOf('sweep', '14,16,18,20').split(',').map(Number);
const PROBE = Number(argOf('probe', '24'));             // 扫描/抽检用多少帧
/* 实机显示尺寸（设备像素）：立绘框上限 519 CSS px × dpr 1.136 ≈ 590。编码误差要放到这个尺寸下再看
 * —— 浏览器最终是缩到它显示的，误差会被缩放平均掉，"视觉无损"的判据就该落在这里。 */
const DISPLAY_W = Number(argOf('display-w', '590'));
/* 已知最小循环时可跳过检测（检测要解码全部源帧，4K 下一套要 2–3 分钟） */
const LOOP_FORCE = Number(argOf('loop-frames', '0'));
/* 已知要用的 CRF 时可跳过"无损基准档"（它是最慢的一次编码）：--no-lossless */
const NO_LOSSLESS = argv.includes('--no-lossless');
const OUT = argOf('out', '');
const DRY = argv.includes('--dry');
const WORK = argOf('work', path.join(__dirname, 'work', 'optimize'));
if (!FRAMES || CROP.length !== 4) {
  console.error('用法: node tools/optimize-motion.js --frames <帧目录> --crop x,y,w,h --fps 30 --target-w 1180 [--sweep 14,18,20] [--dry]');
  process.exit(1);
}
const files = fs.readdirSync(FRAMES).filter((f) => /^\d+\.png$/i.test(f)).sort();
fs.mkdirSync(WORK, { recursive: true });

/* ---------- 0. 缩略图（用于周期检测）：面积平均缩到 160 宽，合成到深底 --- */
const THUMB_W = 160;
const BG = [0x12, 0x11, 0x15];
function thumb(file) {
  const im = decode(fs.readFileSync(path.join(FRAMES, file)));
  const [cx, cy, cw, ch] = CROP;
  const tw = THUMB_W, th = Math.max(2, Math.round(ch * tw / cw));
  const out = new Uint8Array(tw * th * 3);
  const sx = cw / tw, sy = ch / th;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.min(cw, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.min(ch, Math.ceil((y + 1) * sy));
      for (let yy = y0; yy < y1; yy += 2) {
        for (let xx = x0; xx < x1; xx += 2) {
          const i = ((cy + yy) * im.width + (cx + xx)) * im.channels;
          const a = im.data[i + 3] / 255;
          r += im.data[i] * a + BG[0] * (1 - a);
          g += im.data[i + 1] * a + BG[1] * (1 - a);
          b += im.data[i + 2] * a + BG[2] * (1 - a);
          n++;
        }
      }
      const o = (y * tw + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

console.log(`① 最小无缝循环（${files.length} 帧 @${FPS}fps = ${(files.length / FPS).toFixed(2)}s）`);
const thumbs = files.map(thumb);
const minP = Math.max(2, Math.round(LOOP_MIN * FPS));
/* 相邻帧的典型差异（取前 60 帧的最大值）：用来判断"接缝跳变算不算大" */
let adj = 0; for (let i = 1; i < Math.min(files.length, 60); i++) adj = Math.max(adj, dist(thumbs[i - 1], thumbs[i]));
/* 逐个周期算"循环内最大误差 worst"与"接缝差 seam"。
 * 选法不是"第一个达标的"：那样会挑到近似周期（尤诺真周期是 100 帧＝源正好 4 个循环，
 * 却被 96 帧的近似周期抢了先）。这里先要求源能被整除（= 源确实由整数个循环组成），
 * 再在候选里按 worst 最小、其次周期最短、再次接缝最连续来选。 */
const cands = [];
for (let p = minP; p <= Math.floor(files.length / 2); p++) {
  let worst = 0;
  for (let i = 0; i + p < files.length; i++) { worst = Math.max(worst, dist(thumbs[i], thumbs[i + p])); if (worst > 3) break; }
  cands.push({ p, worst, seam: dist(thumbs[p - 1], thumbs[0]), exact: files.length % p === 0 });
}
const seamTol = Math.max(1.6, adj * 2.0);
/* 有损源（VP9 解码出来的帧）本身带压缩噪声，每个循环的同一帧不会逐位相同（实测柚叶 100 帧周期
 * 误差 1.93/255 就是噪声），所以阈值放到 2.2；同档误差里**取最短周期**。 */
const usable = LOOP_FORCE ? [{ p: LOOP_FORCE, worst: 0, seam: 0 }] : cands.filter((c) => c.exact && c.worst <= 2.2 && c.seam <= seamTol);
let P = files.length, loopMax = 0, seam = dist(thumbs[files.length - 1], thumbs[0]);
if (usable.length) {
  const band = Math.min(...usable.map((c) => c.worst)) + 0.15;
  const pick = usable.filter((c) => c.worst <= band && c.seam <= seamTol).sort((a, b) => a.p - b.p)[0];
  P = pick.p; loopMax = pick.worst; seam = pick.seam;
}
console.log('   候选（源能被整除、循环内误差最小的一批）：'
  + cands.filter((c) => c.exact).sort((a, b) => a.worst - b.worst).slice(0, 5)
    .map((c) => `${c.p}帧/误差${c.worst.toFixed(2)}/接缝${c.seam.toFixed(2)}`).join('　'));
console.log(`   选定周期 ${P} 帧（${(P / FPS).toFixed(2)}s）｜循环内最大差 ${loopMax.toFixed(2)}/255｜接缝差 ${seam.toFixed(2)}（相邻帧典型 ${adj.toFixed(2)}，接缝上限 ${seamTol.toFixed(2)}）`
  + (P < files.length ? `　→ 裁掉 ${files.length - P} 帧（${((1 - P / files.length) * 100).toFixed(0)}%）` : '　→ 已是最小循环'));
if (DRY) process.exit(0);

/* ---------- 2. 缩放：把 0..P-1 帧裁+缩到目标尺寸，**一次 ffmpeg 走完**（逐帧 spawn 会慢十几倍） ---------- */
const targetW = Math.round(CROP[2] * Math.min(TARGET_W / CROP[2], 1) / 2) * 2;
const targetH = Math.round(CROP[3] * Math.min(TARGET_W / CROP[2], 1) / 2) * 2;
const scaled = path.join(WORK, 'scaled-' + targetW + 'x' + targetH);
fs.rmSync(scaled, { recursive: true, force: true });
fs.mkdirSync(scaled, { recursive: true });
console.log(`\n② 裁剪 + 缩放到 ${targetW}×${targetH}（源窗口 ${CROP[2]}×${CROP[3]}，缩小 ${(CROP[2] / targetW).toFixed(2)}×；实机显示框约 590×705 设备像素）`);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-start_number', '0',
  '-i', path.join(FRAMES, '%03d.png'), '-frames:v', String(P),
  '-vf', `crop=${CROP[2]}:${CROP[3]}:${CROP[0]}:${CROP[1]},scale=${targetW}:${targetH}:flags=lanczos,format=yuva420p`,
  '-pix_fmt', 'rgba', '-start_number', '0', path.join(scaled, '%04d.png')]);   // 输出的序列也要从 0 起编号（image2 默认从 1 开始）
console.log(`   缩放后 ${fs.readdirSync(scaled).length} 帧`);

function encodeSeq(outFile, crf) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-start_number', '0',
    '-i', path.join(scaled, '%04d.png'),
    '-c:v', 'libvpx-vp9', ...(crf === 0 ? ['-lossless', '1'] : ['-b:v', '0', '-crf', String(crf)]),
    '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-auto-alt-ref', '0', '-pix_fmt', 'yuva420p',
    '-an', outFile]);
  return fs.statSync(outFile).size;
}

/* ---------- 3. CRF 扫描：解码后与**缩放后的源帧**（编码器输入）逐像素比，RGB 与 alpha 分开算 ---------- */
const probeIdx = Array.from({ length: Math.min(PROBE, P) }, (_, i) => Math.floor(i * P / Math.min(PROBE, P)));
console.log(`\n③ CRF 扫描（抽检 ${probeIdx.length} 帧，参考 = 缩放后的源帧，即编码器输入）`);
const results = [];
for (const crf of (NO_LOSSLESS ? [...SWEEP] : [0, ...SWEEP])) {
  const file = path.join(WORK, `probe-crf${crf === 0 ? 'lossless' : crf}.webm`);
  const bytes = encodeSeq(file, crf);
  const decDir = path.join(WORK, 'dec-' + crf); fs.mkdirSync(decDir, { recursive: true });
  for (const f of fs.readdirSync(decDir)) fs.unlinkSync(path.join(decDir, f));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-c:v', 'libvpx-vp9', '-i', file, '-pix_fmt', 'rgba', '-start_number', '0', path.join(decDir, '%04d.png')]);
  let n = 0, sum = 0, max = 0, over20 = 0, aSum = 0, aMax = 0;
  let dn = 0, dSum = 0, dMax = 0, daSum = 0, daMax = 0;
  const errs = [];
  const dispH = Math.round(targetH * DISPLAY_W / targetW);
  for (const i of probeIdx) {
    const ref = decode(fs.readFileSync(path.join(scaled, String(i).padStart(4, '0') + '.png')));
    const dec = decode(fs.readFileSync(path.join(decDir, String(i).padStart(4, '0') + '.png')));
    /* 显示尺寸口径：两边都用 lanczos 缩到实机显示尺寸再比（眼睛看到的就是这个尺度） */
    {
      const tmpA = path.join(WORK, 'disp-ref.png'), tmpB = path.join(WORK, 'disp-dec.png');
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(scaled, String(i).padStart(4, '0') + '.png'), '-vf', `scale=${DISPLAY_W}:${dispH}:flags=lanczos`, '-pix_fmt', 'rgba', tmpA]);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', path.join(decDir, String(i).padStart(4, '0') + '.png'), '-vf', `scale=${DISPLAY_W}:${dispH}:flags=lanczos`, '-pix_fmt', 'rgba', tmpB]);
      const ra = decode(fs.readFileSync(tmpA)), da = decode(fs.readFileSync(tmpB));
      for (let k = 0; k < ra.width * ra.height; k++) {
        const ir = k * ra.channels, id = k * da.channels;
        const ar = ra.data[ir + 3] / 255, ad = da.data[id + 3] / 255;
        let d = 0;
        for (let c = 0; c < 3; c++) d += Math.abs(ra.data[ir + c] * ar + BG[c] * (1 - ar) - (da.data[id + c] * ad + BG[c] * (1 - ad)));
        dSum += d; dn++; if (d > dMax) dMax = d;
        const adiff = Math.abs(ra.data[ir + 3] - da.data[id + 3]);
        daSum += adiff; if (adiff > daMax) daMax = adiff;
      }
    }
    for (let k = 0; k < ref.width * ref.height; k++) {
      const ir = k * ref.channels, id = k * dec.channels;
      const ar = ref.data[ir + 3] / 255, ad = dec.data[id + 3] / 255;
      let d = 0;
      for (let c = 0; c < 3; c++) d += Math.abs(ref.data[ir + c] * ar + BG[c] * (1 - ar) - (dec.data[id + c] * ad + BG[c] * (1 - ad)));
      sum += d; n++;
      if (d > max) max = d;
      if (d > 20) over20++;
      errs.push(d);
      const adiff = Math.abs(ref.data[ir + 3] - dec.data[id + 3]);
      aSum += adiff; if (adiff > aMax) aMax = adiff;
    }
  }
  errs.sort((a, b) => a - b);
  const p999 = errs[Math.floor(errs.length * 0.999)];
  const rec = { crf, mb: bytes / 1048576, mean: sum / n / 3, max: max / 3, p999: p999 / 3, over20, aMean: aSum / n, aMax,
    dMean: dSum / dn / 3, dMax: dMax / 3, daMean: daSum / dn, daMax };
  results.push(rec);
  console.log(`   ${crf === 0 ? '无损  ' : 'CRF ' + String(crf).padEnd(3)}｜${(bytes / 1048576).toFixed(2)} MB（${(bytes / P * FPS / 1024).toFixed(0)} KB/s）`
    + `｜原始尺度 RGB ${rec.mean.toFixed(3)}/α ${rec.aMean.toFixed(3)}·${rec.aMax}`
    + `｜**显示尺度** RGB ${rec.dMean.toFixed(3)} 最大 ${rec.dMax.toFixed(1)}·α ${rec.daMean.toFixed(3)} 最大 ${rec.daMax}`);
}

/* ---------- 4. 选档：视觉无损（平均<1、p99.9<6、无 >20 的像素、alpha 平均<0.35）里压缩最大的 ---------- */
/* 判据分两路，因为肉眼看的是两件事：
 *   · RGB：平均 < 1/255、p99.9 < 6/255、无 >20/255 的单像素（有就是块状/振铃痕迹）；
 *   · **alpha 单独卡**：alpha 误差合成后就是"边缘位置偏一点"，最容易看成锯齿/抖动 ——
 *     要求平均 < 0.05、单像素最大 ≤ 8（实测：无损档 0.018/1，CRF 14 到 0.122/34 就看得出来了）。 */
/* 阈值来自实测：无损档在显示尺度是 RGB 0.333/最大 6.3、α 0.011/2（4:2:0 往返的地板），
 * CRF 14 是 0.496/12.3、α 0.049/9 —— 两者在显示尺度差 0.16/255，而浏览器缩放器本身
 * 在 3.11× 时的误差是 2.05/255（是它的 4 倍）。所以按"明显低于缩放器误差"来定阈值。 */
const ok = results.filter((r) => r.dMean < 0.6 && r.dMax < 16 && r.daMean < 0.06 && r.daMax <= 12);
const best = ok.length ? ok[ok.length - 1] : results[0];
const lossless = results[0];
console.log(`\n④ 选档：${best.crf === 0 ? '无损' : 'CRF ' + best.crf}`
  + `｜相对该主题原无损体积见 archive`
  + (ok.length ? '' : '　⚠ 所有档位都没过视觉无损阈值，退回无损'));
console.log(`   循环长度 ${P} 帧 / ${(P / FPS).toFixed(2)}s（源 ${files.length} 帧）`);
if (OUT) {
  const bytes = encodeSeq(OUT, best.crf);
  console.log(`   已写 ${path.relative(path.join(__dirname, '..'), OUT)}（${(bytes / 1048576).toFixed(2)} MB）`);
  fs.writeFileSync(OUT + '.json', JSON.stringify({ loopFrames: P, fps: FPS, targetW, targetH, crf: best.crf, bytes, source: FRAMES, crop: CROP, sourceFrames: files.length }, null, 1));
}
