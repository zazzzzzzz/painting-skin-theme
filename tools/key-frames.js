/* 批量抠底：对一整个帧目录跑 tools/extract-art.js，带并发与进度。
 *
 *   node tools/key-frames.js --src <帧目录> --out <输出目录> [--jobs 10] [--k 10] [--thickness 3]
 *
 * 为什么要并发：extract-art.js 在 4K 帧上约 4.3 s/帧（纯 JS 解码 + 边缘连通 + 厚度检测 + 聚类），
 * 一个角色 200–400 帧就要 15–30 分钟。本机 20 核，10 路并行把 1000 帧压到 ~10 分钟。
 * extract-art.js 的 stdout 是配色聚类报告（每帧一大坨），这里丢弃；失败时把它的 stderr 带出来。
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const SRC = argOf('src', '');
const OUT = argOf('out', '');
const JOBS = Number(argOf('jobs', '10'));
const K = argOf('k', '10');
const THICK = argOf('thickness', '3');
if (!SRC || !OUT) {
  console.error('用法: node tools/key-frames.js --src <帧目录> --out <输出目录> [--jobs 10] [--k 10] [--thickness 3]');
  process.exit(1);
}
const TOOL = path.join(__dirname, 'extract-art.js');
const frames = fs.readdirSync(SRC).filter((f) => /^\d+\.png$/i.test(f)).sort();
if (!frames.length) { console.error('源目录里没有 PNG 序列：' + SRC); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
let done = 0, failed = 0, next = 0;
console.log(`抠底 ${frames.length} 帧｜并发 ${JOBS}｜${path.relative(path.join(__dirname, '..'), SRC)} → ${path.relative(path.join(__dirname, '..'), OUT)}`);

new Promise((resolve) => {
  /* 收尾必须等**所有** worker 退出：只判"某个 worker 发现没活儿了"会在其它 worker 还在写文件时
   * 就 resolve，父进程一 exit，剩下几帧就成了孤儿（实测 200 帧里少了 3–9 帧的记账）。 */
  let idle = 0;
  const worker = () => {
    if (next >= frames.length) { idle++; if (idle >= active) resolve(); return; }
    const f = frames[next++];
    const child = spawn(process.execPath, [TOOL, path.join(SRC, f), path.join(OUT, f), K, THICK], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      done++;
      if (code !== 0) { failed++; console.error(`\n✗ ${f}: ${err.slice(-300)}`); }
      if (done % 25 === 0 || done === frames.length) {
        const secs = (Date.now() - t0) / 1000;
        process.stdout.write(`\r  ${done}/${frames.length} 帧｜${secs.toFixed(0)}s｜预计剩余 ${(((secs / done) * (frames.length - done))).toFixed(0)}s   `);
      }
      worker();
    });
  };
  const active = Math.min(JOBS, frames.length);
  for (let i = 0; i < active; i++) worker();
}).then(() => {
  console.log(`\n完成 ${done - failed}/${frames.length} 帧，用时 ${((Date.now() - t0) / 1000).toFixed(0)}s，失败 ${failed}`);
  process.exit(failed ? 1 : 0);
});
