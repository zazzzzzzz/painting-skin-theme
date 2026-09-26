/* 引擎层 · 交给**目标页面**去读的本地文件 URL（艺术素材走这条路，不走 data URI）。
 *
 * 为什么需要它：皮肤素材有两种投递方式。
 *   ① data URI（injector 的 readAssetDataUrl）—— 适合小图，随样式表一起内联进 payload。
 *      缺点是有硬上限：**单条 CSS 声明过长会被静默丢弃**（实测 base64 2.5MB 时那条变量算成空字符串、
 *      元素完全不绘制且不报错），所以大图（尤其动态立绘）走不了这条路。
 *   ② file:// URL（本模块）—— 不给 payload 增重，大小只受磁盘限制。ZCode 页面本身就是 file:// 源，
 *      Chromium 能直接读本地文件（<img> / <video> 都是媒体加载，不受同源策略限制；宠物素材、
 *      动态立绘都用它）。
 *
 * 打包后的坑：asar 是虚拟文件系统，**只有 Electron 进程读得了**，页面读不了 —— 所以凡是给页面读的
 * 素材都必须解包（package.json 的 asarUnpack：assets 目录整体，以及各主题 assets 下的 webm）。这里的
 * unpackedIfNeeded 就是在运行时把 asar 内的路径改写到 app.asar.unpacked 下的同名文件。 */

import * as fs from 'fs';
import * as path from 'path';

/** asar 内的路径改写到 app.asar.unpacked（解包后不存在同名文件时保持原路径） */
export function unpackedIfNeeded(filePath: string): string {
  const marker = 'app.asar' + path.sep;
  const index = filePath.indexOf(marker);
  if (index < 0) return filePath;
  const candidate = filePath.slice(0, index) + 'app.asar.unpacked' + path.sep + filePath.slice(index + marker.length);
  return fs.existsSync(candidate) ? candidate : filePath;
}

/** file URL 构造：转义 # 与 ?，避免被当成片段/查询（与宠物素材同一套写法） */
export function fileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  return 'file:///' + encodeURI(normalized).replace(/#/g, '%23').replace(/\?/g, '%3F');
}

/** 主题目录里的某个素材 → 可直接交给页面的 file:/// URL */
export function assetFileUrl(themeDir: string, relative: string): string {
  return fileUrl(unpackedIfNeeded(path.join(themeDir, relative)));
}
