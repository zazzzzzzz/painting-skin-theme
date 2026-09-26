/* 从鸣潮 4K 立绘库的 36 帧序列生成 shorekeeper-line 的立绘素材（**动态立绘**）。
 *
 *   node tools/build-theme-shorekeeper.js
 *
 * 产物（两道）：
 *   ① assets/character-motion.webm —— 动态立绘本体。**VP9 + alpha 的 WebM**，原生分辨率
 *      （2876×2270，与源帧 1:1，不重采样），页面用 <video> 从 file:// 播。
 *      为什么是 WebM + 视频而不是动画图：视频能带 alpha、体积小、且**不受 data URI 长度限制**
 *      （CSS 背景内联 data URI 的老路在 4K 上必然失败：单条声明过长会被静默丢弃）。
 *   ② assets/character-still.png —— 同构图的静止帧（800 宽，带 alpha）：面板中央立绘用它，
 *      同时作为页面里视频未就绪/加载失败时的 CSS 背景兜底。
 *
 * 裁剪：**只裁掉四周全透明的空白**，不裁任何内容 —— 取全部 36 帧的并集内容框
 * （2876×2270 @(1174,835)，四边留 8px）。并集保证每一帧的飘带与光蝶都在框内，逐帧自适应会让动画抖动。
 * 纵横比 1.267 用于主题里立绘盒的尺寸（见 themes/shorekeeper-line/skin/theme.css 的 character-cluster）。
 *
 * 源帧目录可用 SHOREKEEPER_FRAMES 覆盖（默认本机 4K 库），中间产物写 tools/work/shorekeeper/。 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FRAMES = process.env.SHOREKEEPER_FRAMES || 'D:/BigModel/鸣潮立绘4K/C_ShouAnRen_01/frames';
const SRC = path.join(ROOT, '素材');
const OUT = path.join(ROOT, 'themes', 'shorekeeper-line', 'assets');
const WORK = path.join(ROOT, 'tools', 'work', 'shorekeeper');

/* 并集内容框（见文件头说明） */
const CROP = { w: 2876, h: 2270, x: 1174, y: 835 };
/* 动态立绘：原生分辨率、12fps、CRF 20（视觉无损档；实测 36 帧约 3.9MB） */
const MOTION = { fps: 12, crf: 20, scale: null };   // scale 例 '1440:1136' 可换小体积版本
/* 静止帧宽度（面板立绘 + 页面兜底底图；带 alpha 的 PNG，别太大，它走 data URI 内联） */
const STILL_W = 800;

const DECOR = ['doodle', 'star', 'candy-wrapped', 'candy-lollipop', 'acao-heart', 'acao-cheer', 'corner', 'upper'];

/** 跑一条命令，返回 { ok, stderr }（ffmpeg 的 pix_fmt 会打在 stderr 上，要用它做结构自检） */
function run(cmd, args, label) {
  try {
    execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stderr: '' };
  } catch (error) {
    console.error(`✗ ${label} 失败：` + String(error.stderr || error.message).slice(0, 400));
    process.exitCode = 1;
    return { ok: false, stderr: '' };
  }
}

/** 需要看 ffmpeg 日志时用它（vp9 的编码参数只打在 **stderr** 的 Stream 行里 —— execFileSync 只返回
 *  stdout，拿不到日志，会让"结构自检"永远失败；所以这里用 spawnSync 把两路都取回来）。 */
function runVerbose(cmd, args, label) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    console.error(`✗ ${label} 失败：` + String(r.stderr || r.error).slice(-400));
    process.exitCode = 1;
    return { ok: false, log: String(r.stderr || '') };
  }
  return { ok: true, log: String(r.stdout || '') + String(r.stderr || '') };
}

const frames = fs.readdirSync(FRAMES).filter((f) => /^\d+\.png$/i.test(f)).sort();
if (!frames.length) {
  console.error('源帧目录里没有 PNG 序列：' + FRAMES);
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

/* ① 动态立绘：VP9 + alpha */
const motion = path.join(OUT, 'character-motion.webm');
const filters = [`crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y}`];
if (MOTION.scale) filters.push(`scale=${MOTION.scale}:flags=lanczos`);
filters.push('format=yuva420p');
console.log(`① 编码动态立绘（VP9 + alpha，${MOTION.scale ? MOTION.scale : '原生 ' + CROP.w + '×' + CROP.h}，CRF ${MOTION.crf}）`);
const enc = runVerbose('ffmpeg', ['-y', '-v', 'info', '-framerate', String(MOTION.fps), '-start_number', 0,
  '-i', path.join(FRAMES, '%03d.png'), '-vf', filters.join(','),
  '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(MOTION.crf), '-auto-alt-ref', '0', '-row-mt', '1',
  '-pix_fmt', 'yuva420p', motion], '动态立绘编码');
const motionKB = fs.existsSync(motion) ? Math.round(fs.statSync(motion).size / 1024) : 0;
/* 结构自检：只看 ffmpeg 自己报的输出格式里有没有 yuva420p。
 * 别用"回解成 PNG 再量 alpha"来判断 —— ffmpeg 解码 VP9 的 alpha 侧数据要额外开关，会误报"丢了 alpha"（踩过）。 */
const alphaOK = /Video: vp9, yuva420p/.test(enc.log);

/* ② 静止帧（带 alpha） */
const still = path.join(OUT, 'character-still.png');
console.log(`\n② 静止帧 ${STILL_W} 宽（面板立绘 + 页面兜底）`);
run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(FRAMES, frames[0]),
  '-vf', `crop=${CROP.w}:${CROP.h}:${CROP.x}:${CROP.y},scale=${STILL_W}:-1:flags=lanczos`,
  '-pix_fmt', 'rgba', still], '静止帧');
const stillKB = fs.existsSync(still) ? Math.round(fs.statSync(still).size / 1024) : 0;

/* ③ 装饰照搬 */
console.log('\n③ 装饰素材（照搬 素材/）');
const decor = [];
for (const role of DECOR) {
  const from = path.join(SRC, role + '.png');
  if (!fs.existsSync(from)) { console.error(`   跳过（素材里没有）：${role}.png`); continue; }
  fs.copyFileSync(from, path.join(OUT, role + '.png'));
  decor.push({ role, kb: Math.round(fs.statSync(from).size / 1024) });
}

/* ④ 报告 */
const decorKB = decor.reduce((s, r) => s + r.kb, 0);
console.log('\nrole                     来源                        体积');
console.log(`${'character-motion.webm'.padEnd(25)}${frames.length} 帧 VP9+alpha ${MOTION.scale ? MOTION.scale : CROP.w + '×' + CROP.h}`.padEnd(52) + `${motionKB} KB`);
console.log(`${'character-still.png'.padEnd(25)}第 1 帧 ${STILL_W} 宽（面板/兜底）`.padEnd(52) + `${stillKB} KB`);
for (const r of decor) console.log(`${(r.role + '.png').padEnd(25)}素材/`.padEnd(52) + `${r.kb} KB`);
console.log(`alpha 结构自检：${alphaOK ? '✅ ffmpeg 输出格式为 yuva420p（带 alpha）' : '❌ 输出里没有 yuva420p，alpha 可能丢了'}`);
console.log(`合计 ${motionKB + stillKB + decorKB} KB —— 视频走 file:// 不受 data URI 限制；只有静止帧会内联（${Math.round(stillKB * 1.37)} KB base64）`);
if (stillKB * 1.37 > 1000) console.log('⚠ 静止帧偏大：调小 STILL_W');
