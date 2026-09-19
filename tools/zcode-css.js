/* 读 ZCode 自己打包在 app.asar 里的渲染层 CSS —— 用来查清"应用定义了哪些 --color-* token、谁在用它"。
 *
 *   node tools/zcode-css.js                          # 列出应用定义的 --color-* token
 *   node tools/zcode-css.js --grep --color-menu      # 谁在用这个 token（选择器 + 声明）
 *   node tools/zcode-css.js --coverage themes/diana  # 与应用用到的"面/文字/边框"token 对差集（做新皮肤用）
 *
 * 为什么需要它：主题只覆盖 --color-* 的一部分，而**应用自己的浮层 token 定义在 .theme-zai-dark/light 里**
 * （比如 `.bg-menu` → `var(--color-menu)` = #2b2b2b）—— 不覆盖它们，弹窗、下拉菜单、提示气泡就会继续用
 * 应用的中性灰。这类漏项光看界面很难定位，直接读应用的 CSS 最快。
 *
 * asar 格式很简单：4+4+4+4 字节的头 + JSON 目录 + 各文件数据（拼接、4 字节对齐）。这里只读，不改安装目录；
 * 导出的 CSS 落在 tools/work/zcode-css/（该目录不进版本控制）。
 * 应用路径默认 D:/Zcode/resources/app.asar，可用 ZCODE_ASAR 覆盖。 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ASAR = process.env.ZCODE_ASAR || 'D:/Zcode/resources/app.asar';
const OUT = path.join(ROOT, 'tools', 'work', 'zcode-css');

function readAsarHeader(buffer) {
  const jsonSize = buffer.readUInt32LE(12);
  return { json: JSON.parse(buffer.toString('utf8', 16, 16 + jsonSize)), dataOffset: 16 + jsonSize };
}

function walk(node, prefix, filter, out) {
  for (const [name, entry] of Object.entries(node.files || {})) {
    const full = prefix ? prefix + '/' + name : name;
    if (entry.files) { walk(entry, full, filter, out); continue; }
    if (!filter(full, entry)) continue;
    out.push({ path: full, size: Number(entry.size) || 0, offset: Number(entry.offset) || 0 });
  }
  return out;
}

/** 取出应用自己的渲染层 CSS 文本（第三方 node_modules 样式不参与） */
function loadAppCss() {
  const buffer = fs.readFileSync(ASAR);
  const { json, dataOffset } = readAsarHeader(buffer);
  const files = walk(json, '', (p) => /\.css$/i.test(p) && /^out\/renderer\//.test(p) && !/node_modules/.test(p), []);
  if (!files.length) throw new Error('asar 里没找到 out/renderer/*.css');
  fs.mkdirSync(OUT, { recursive: true });
  return files.map((f) => {
    const data = buffer.subarray(dataOffset + f.offset, dataOffset + f.offset + f.size).toString('utf8');
    fs.writeFileSync(path.join(OUT, f.path.replace(/[\\/]/g, '__')), data);
    return { name: f.path, data, size: f.size };
  });
}

/** 应用定义的全部 --color-* token（首次出现的值） */
function tokenInventory(cssFiles) {
  const tokens = new Map();
  for (const f of cssFiles) {
    for (const m of f.data.matchAll(/(--color-[a-z0-9-]+)\s*:\s*([^;}]+)/g)) if (!tokens.has(m[1])) tokens.set(m[1], m[2].trim().slice(0, 48));
  }
  return tokens;
}

/** 统计应用把哪些 --color-* 用作背景 / 文字 / 边框，各用了多少次 */
function usage(cssFiles) {
  const buckets = { background: new Map(), color: new Map(), border: new Map() };
  for (const f of cssFiles) {
    for (const rule of f.data.matchAll(/([^{}]{1,90})\{([^{}]*)\}/g)) {
      for (const d of rule[2].matchAll(/(background(?:-color)?|border(?:-color|-top-color)?|(?:^|;)\s*color)\s*:\s*[^;]*?var\((--color-[a-z0-9-]+)/g)) {
        const kind = d[1].includes('background') ? 'background' : d[1].includes('border') ? 'border' : 'color';
        buckets[kind].set(d[2], (buckets[kind].get(d[2]) || 0) + 1);
      }
    }
  }
  return buckets;
}

function main() {
  const argv = process.argv.slice(2);
  const cssFiles = loadAppCss();
  console.log(`应用渲染层 CSS：${cssFiles.map((f) => f.name.split('/').pop() + ' ' + (f.size / 1024).toFixed(0) + 'KB').join('、')}`);
  console.log(`已导出到 ${path.relative(ROOT, OUT)}/\n`);

  const coverageIndex = argv.indexOf('--coverage');
  if (coverageIndex >= 0) {
    const themeDir = argv[coverageIndex + 1] || 'themes/diana';
    const themeCss = fs.readFileSync(path.join(ROOT, themeDir, 'skin', 'theme.css'), 'utf8');
    const covered = new Set([...themeCss.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => '--color-' + m[1]));
    const buckets = usage(cssFiles);
    console.log(`与应用用到的 token 对差集（主题 = ${themeDir}，共覆盖 ${covered.size} 个 --color-*）`);
    for (const [kind, label] of [['background', '背景'], ['color', '文字'], ['border', '边框']]) {
      const rows = [...buckets[kind].entries()].sort((a, b) => b[1] - a[1]).slice(0, 16);
      console.log(`\n  【${label}】`);
      for (const [token, n] of rows) {
        console.log(`    ${String(n).padStart(4)}  ${token.padEnd(34)} ${covered.has(token) ? '✅ 已覆盖' : '❌ 未覆盖'}`);
      }
    }
    console.log('\n提示：❌ 里属于 --color-{amber,blue,cyan,emerald,fuchsia,green,neutral,orange,purple,red,rose,sky,slate,teal,violet,yellow,zinc}-* 的')
    ;console.log('      是 Tailwind 调色板原色，以及 --color-{destructive,warning,success,diff-*,find-highlight*,interaction-confirmation-*}')
    ;console.log('      这类**语义色**，一般故意不覆盖；真正该补的是"面/浮层"级 token（menu / popover / tooltip / toast / secondary…）。')
    return;
  }

  const grepIndex = argv.indexOf('--grep');
  if (grepIndex >= 0 && argv[grepIndex + 1]) {
    const pattern = argv[grepIndex + 1];
    const hits = [];
    for (const f of cssFiles) {
      const re = new RegExp('[^}]*' + pattern.replace(/[-]/g, '\\-') + '[^}]*}', 'g');
      let m;
      while ((m = re.exec(f.data))) {
        const block = m[0];
        const sel = block.slice(0, block.indexOf('{')).replace(/\s+/g, ' ').trim().slice(0, 120);
        const decl = block.split('{')[1].split(';').filter((d) => d.includes(pattern)).join(';').trim().slice(0, 90);
        hits.push({ sel, decl });
      }
    }
    const seen = new Set();
    console.log(`用到 ${pattern} 的规则：`);
    for (const h of hits) {
      const key = h.sel + '|' + h.decl;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  ${h.sel}\n        ${h.decl}`);
    }
    return;
  }

  const tokens = tokenInventory(cssFiles);
  console.log(`应用定义的 --color-* token 共 ${tokens.size} 个：`);
  for (const [k, v] of [...tokens.entries()].sort((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${k.padEnd(36)} ${v}`);
}

main();
