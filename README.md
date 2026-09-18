# painting-skin-theme

**ZCode 皮肤注入器。** 把主题（样式层 + 页面运行时 + 美术素材）注入到**正在运行**的 ZCode 实例里，
不改安装目录、不改启动参数、不写用户配置；注入与撤下都是运行时的、可完整回退的。

注入通道是 CDP：目标应用需带 `--remote-debugging-port` 启动（默认探测 9344）。
皮肤样式层取自 Diana Multi-App Launcher，注入机制取自 Dream-Work-Theme。

---

## 功能

### ① 主题注入（皮肤）

- **多主题**：`themes/<id>/` 一个目录一套皮肤。当前有 `cosmic-line`（深空线稿）与 `diana`。
  一套皮肤包含：清单 `theme.json`、样式层 `skin/theme.css`、页面运行时 `skin/runtime-template.js`、美术素材 `assets/`。
- **明暗三种模式**：`auto`（跟随应用自身极性，撤下时恢复原值）/ `dark` / `light`（由皮肤强制切换极性）。
  两套极性各有独立的 token 与美术。
- **热切换**：注入作用于运行中的实例，切换皮肤不需要重启 ZCode。
- **美术层**：工作区内挂 11 个节点（角线 / 上缘线 / 涂鸦主图 / 立绘 / 星星 ×2 / 糖果 ×2 / 小动物 ×2），
  按工作区矩形固定、`pointer-events:none` 不接管命中；组件级钩子覆盖侧栏、任务项、tabs、workspace 项与消息导轨。

### ② 注入后复核（不是"没报错就算成功"）

`apply` 会逐项检查并在面板上标红未通过项，**全绿才对外报成功**：

host 类、适配器版本、样式表 1 份、chrome 1 份、前景恰好 1 个且 `z-index:1`、美术节点 11 个、
**美术确实解析出图像**、**导轨刻度确实着色**、工作区 `isolation:isolate`、`pointer-events:none`、
美术层不接管命中、无横向溢出、键盘焦点可达。

### ③ 撤下回退

`remove` 走页面端运行时的 `disable()`：移除样式表、chrome、美术、host 类、工作区与前景上的内联改动，
恢复注入前的明暗类与内联 `isolation`；同时收掉用量条与桌宠的宿主/计时器。

### ④ 用量条（token 用量）

贴在输入框卡片下方、窗口最底部，六项可开关（齿轮面板，选择存 localStorage）：生成速度 tps、
上下文占用、本回合、本会话、工具、今日、子代理。鼠标悬停显示明细。

数据源是 **ZCode CLI 自己的 SQLite 库**（`~/.zcode/cli/db/db.sqlite`，只读）中的
`model_usage` / `turn_usage` / `tool_usage` / `session` 四张表；聚合口径：只统计 `status='completed'`、
`turns` 取 distinct `turn_id`、`today` 从本地零点起、`ctx` 取最后一次完成请求的 `input_tokens`、
子代理按 `session.parent_id` 单独归集。

### ⑤ 用量泵

页面端**没有任何自取数据的路径**（页面不该有读本地库的能力），数据只由泵推送。
泵的行为：`fs.watch` 库目录 → 去抖 120ms → 限频 400ms → 读各窗口"想看哪个会话" → 聚合 →
经 CDP 推给每个渲染页；另有 30s 心跳、2s 的会话切换轮询、3/8/15s 启动斜坡。

**泵必须常驻**：由面板驱动（开窗启动、关窗停止），无面板时用 `cli.js pump` 前台常驻。

### ⑥ 桌宠

`assets/pet/` 下 6 只（各 11 个状态 GIF）：`pet.json` 给 id/name/order/scale，
**文件名（去扩展名）就是状态键**（idle / look-left-side / look-right-side / running /
running-left / running-right / review / jumping / failed / waiting / waving）。

贴着输入框上沿活动，120ms 一跳：工具执行时沿上沿跑动（随机落点、到达后停 0.5–1.5s），
空闲时在三个姿态间轮换、每 6 次挥一次手。状态输入有两路：三个 DOM 探针
（"等待确认" / 输入框区的"停止生成" / "正在执行"）加回合结束的边沿计时，
以及用量条广播的实时状态事件（加速器，不是依赖）。

### ⑦ 面板（Electron 图形界面）

启动：`npm start`。界面为不规则手裁板 + 板中央当前皮肤的立绘（随皮肤切换而换）：

- 皮肤 / 桌宠各一个 **‹ › 循环切换**（按现有顺序轮换，就地生效，不重启 ZCode）
- 明暗三态（暗夜 / 日间 / 跟随系统）
- 主按钮：注入并挂载 / 重新注入；副按钮：撤下皮肤
- 窗口为**透明无边框**，板子区域整块可拖动，右上 − × 自绘
- **关闭 = 收进系统托盘**（注入与用量泵继续跑），托盘菜单提供"显示面板 / 退出"
- 应用图标为自绘四芒星（非 Electron 默认图标）

### ⑧ 命令行

```bash
npm run build
node dist/cli.js list                    # 列出主题
node dist/cli.js pets                    # 列出可用桌宠
node dist/cli.js status  [--skin diana]  # 目标应用与注入状态
node dist/cli.js apply   [--skin diana] [--mode auto|dark|light] [--pet choten-chan|none]
node dist/cli.js pet <id|none>           # 只切换桌宠
node dist/cli.js remove  [--skin diana]  # 撤下
node dist/cli.js payload [--skin diana] [--mode auto]   # 只打印将执行的表达式，供外部转发
node dist/cli.js pump    [--skin diana]  # 前台常驻用量泵
node dist/cli.js panel                   # 输出面板所需的全部状态（面板通过它取数）
```

### ⑨ 打包

```bash
npm run pack:win        # → release/PaintingSkinTheme-Setup-<version>.exe（NSIS 安装器）
```

安装器为**非一键（assisted）**形态，第一步即「选定安装位置」，可自选目录。

### ⑩ 素材工具链

`tools/` 下是零依赖的素材处理脚本（抠底、取色、矢量栅格化、剪影反算、水印清除、碎片合成），
用于把参考图/生成图加工成主题素材：抠底、降采样、alpha 量化、按素材风格补画装饰线。

---

## 项目结构

```
src/                        引擎与应用层
  main.ts                   Electron 主进程：窗口 / 托盘 / IPC；只做进程调度，不碰 CDP 与本地库
  panel.html                面板界面（不依赖框架）
  cli.ts                    命令行入口
  injector.ts               payload 组装 · 注入 · 复核 · 撤下 · 状态；用量条与桌宠的注入
  cdp.ts                    CDP 会话与目标发现（零依赖，用 Node 自带 fetch / WebSocket）
  theme-store.ts            主题清单校验（路径只收安全相对路径、逐段防越界）与素材读取
  usage-db.ts               读 ZCode 的用量库（node:sqlite，只读）并聚合出快照
  usage-pump.ts             fs.watch + 限频 + 心跳，经 CDP 把快照推给页面
  usage-bar.ts              用量条的页面端脚本
  pet.ts                    桌宠注册表与页面端运行时
  types.ts                  共享类型
themes/                     主题（每目录一套皮肤）
  diana/                    清单 + skin/{theme.css, runtime-template.js} + assets/（10 美术 + 2 壁纸）
  cosmic-line/              同上；素材为纯 alpha 蒙版，两种极性都用 mask + 主题色
assets/                     运行时资源
  icon.png                  应用图标（窗口 / 托盘，打包时转 .ico 作安装器图标）
  pet/<id>/                 6 只桌宠 × 11 个状态 GIF + pet.json
tools/                      素材工具链（零依赖）
  png.js                    PNG 编解码
  line-art.js               矢量→RGBA 栅格化（距离场抗锯齿 + 样条 + 手绘扰动）
  key-lineart.js            线稿抠底（按与背景色的距离取 alpha，保住闭合轮廓内部）
  extract-art.js            渲染图抠底（边缘连通 + 厚度检测）与主色聚类
  palette.js                分区域取色（Lab 空间 k-means）
  make-silhouette.js        从线稿反算剪影（给纯线条的人形填体量）
  remove-watermark.js       清除生成器水印（按实测比例框定点清 alpha）
  draw-cosmic.js            按素材风格绘制长条装饰线
  compose-line.js           按连通块从素材里取碎片再排布
  samples.js                渲染器样张
  prompts/                  图生图提示词（角色线稿 / 装饰涂鸦，中英双版）
.verify/                    验证脚本与夹具（实机归因、A/B、像素取证、夹具回归）
素材/ · 线稿/                原始参考图（不参与构建，用于重新加工主题素材）
README.md · package.json · tsconfig.json
```

构建产物与依赖不进版本控制，见 `.gitignore`：`dist/`（tsc）、`release/`（electron-builder）、
`node_modules/`、`tools/work/` 与 `tools/out/`（素材中间产物）、`.verify/shots/` 与
生成的夹具（截图与 `fixture.html`）。

---

## 环境前提

- **Node 24**（本机实测 24.16）—— 开发与 CLI 需要 `node:sqlite` 与全局 `WebSocket`：
  前者要求 22.5+ 且旧版本需加 `--experimental-sqlite`，后者要求 22+。
  打包后的应用不受此限，它用自身的 Electron 43 作 Node（内置 24.18）。
- 目标应用需带 `--remote-debugging-port` 启动（默认 9344，可在 `theme.json` 的 `app.debugPort` 改）
  —— 这个参数只在启动时给，普通重启会丢，表现为 `status` 一直"未找到调试端点"
- 面板与泵在打包形态下由应用自身的 exe 充当 Node（`ELECTRON_RUN_AS_NODE=1`），不依赖用户装 Node
