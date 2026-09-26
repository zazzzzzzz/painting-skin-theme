# painting-skin-theme

**ZCode 皮肤注入器。** 把主题（样式层 + 页面运行时 + 美术素材）注入到**正在运行**的 ZCode 实例里，
不改安装目录、不改启动参数、不写用户配置；注入与撤下都是运行时的、可完整回退的。

注入通道是 CDP：目标应用需带 `--remote-debugging-port` 启动（默认探测 9344）。
皮肤样式层取自 Diana Multi-App Launcher，注入机制取自 Dream-Work-Theme。

---

## 功能

### ① 主题注入（皮肤）

- **多主题**：`themes/<id>/` 一个目录一套皮肤 —— 当前 **32 套 + 基准 `diana`**，其中 31 套是**动态立绘**
  （VP9+alpha 的 `.webm`，运行时挂成 `<video>` 从 `file://` 播；几何 / 配色 / 素材都由
  `tools/build-theme-motion.js` + `tools/optimize-motion.js` 一条流水线生成，口径见 §⑫）：
  - **NIKKE 24 套**：`c581-line` / `c871-line` / `c162-line` / `c225-line` / `c262-line` / `c270-line` /
    `c270b-line` / `c971-line` / `c971b-line` / `c973-line` / `dorothy-line` / `dorothy2-line` /
    `moran-line` / `papillon-line` / `sakura-line` / `shenfa-line` / `sin-line` / `tia-line` / `tia2-line` /
    `tia3-line` / `tia4-line` / `viper-line` / `viper2-line` / `honglian-line`
    （源：`D:/BigModel/neeke`、`D:/BigModel/胜利女神`）
  - **明日方舟 5 套**：`ines-line` 蝶舞华章 · 伊内丝 / `wisadel-line` 超新星 · 维什戴尔 / `shuxin-line` 塑心 /
    `shuxin2-line` 无我唯识 · 塑心 / `guiming-line` 生而为一 · 归溟幽灵鲨（源：`D:/BigModel/明日方舟`）
  - **鸣潮 / 绝区零 2 套**：`daniya-line`、`yuye-line`
  - **静态 1 套**：`butterfly-line`（立绘原图直出 + Diana 装饰套，配色取自立绘眼睛的玫红，见 `tools/eye-color.js`）
  - 皮肤显示名**不带"线稿"字样**（2026-09-26 按用户要求去掉），形如「霜蓝 · c581」「蝶舞华章 · 伊内丝」。
  一套皮肤包含：清单 `theme.json`、样式层 `skin/theme.css`、美术素材 `assets/`。
  页面端运行时**全项目一份**（`runtime/runtime-template.js`，引擎级：挂美术层、几何定位、导轨适配），
  主题清单里不写 `skin.runtime` 就用它，需要自带一份时才在清单里覆盖。
- **明暗三种模式**：`auto`（跟随应用自身极性，撤下时恢复原值）/ `dark` / `light`（由皮肤强制切换极性）。
  两套极性各有独立的 token 与美术。
- **热切换**：注入作用于运行中的实例，切换皮肤不需要重启 ZCode。
- **立绘可以是动态立绘**：主题在清单里声明 `assets.characterMotion`（带 alpha 的 VP9 WebM），运行时
  把角色节点挂成 `<video muted loop autoplay>`，素材经 **`file://`** 交付（不内联 data URI —— 大图/视频内联
  会撑爆单条 CSS 声明并被静默丢弃）。同一构图另出一张静止帧给面板与兜底用。
- **美术层**：工作区内挂 11 个节点（角线 / 上缘线 / 涂鸦主图 / 立绘 / 星星 ×2 / 糖果 ×2 / 小动物 ×2），
  按工作区矩形固定、`pointer-events:none` 不接管命中；组件级钩子覆盖侧栏、任务项、tabs、workspace 项与消息导轨。
- **右侧面板展开时工作区会整体收窄**（实测 2253 → 1278，占窗宽 57%），美术层随之重挂并缩进收窄后的
  会话栏里（立绘落在面板左侧、仍在文字下方），不是消失 —— 工作区判据的宽度门槛因此从 `innerWidth*.58`
  放宽到 `.3` 并叠加可见性判断，见 `runtime/runtime-template.js` 的 `qualifies()`。

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
- **ZCode 路径行**：显示当前用的可执行文件与调试端口状态（绿点=可注入），右侧两个按钮
  ——「默认路径」回到按默认路径解析，「选择…」手动指定 exe
- 主按钮：注入并挂载 / 重新注入；副按钮：撤下皮肤
- 注入失败且原因是"目标应用没带调试端口启动"时，主按钮**变成「重启 ZCode 并注入」**，
  点一下即以 `--remote-debugging-port` 重启 ZCode 并接着注入（会结束当前 ZCode 进程，会话记录不受影响）
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
node dist/cli.js defaults [--reset]      # 按默认路径解析 ZCode 位置（--reset 丢掉手动指定的）
node dist/cli.js setexe <绝对路径>        # 手动指定 ZCode 可执行文件
node dist/cli.js relaunch [--apply]      # 以调试端口重启 ZCode；--apply 之后立刻注入
```

### ⑨ 打包

```bash
npm run pack:win        # → release/PaintingSkinTheme-Setup-<version>.exe（NSIS 安装器）
```

安装器为**非一键（assisted）**形态，第一步即「选定安装位置」，可自选目录。

### ⑩ 素材工具链

`tools/` 下是零依赖的素材处理脚本（抠底、取色、矢量栅格化、剪影反算、水印清除、碎片合成），
用于把参考图/生成图加工成主题素材：抠底、降采样、alpha 量化、按素材风格补画装饰线。

### ⑪ 调试端口与 ZCode 路径

注入通道是 CDP，而 `--remote-debugging-port` **只在应用启动时生效**——用户自己双击打开的
ZCode 没有调试口，这时任何注入都会失败，且在应用内部没有补救手段。本项目把这一步补上：

- **路径从哪来**（优先级从高到低）：本机配置 → 主题清单 `app.exePath` → 内置默认路径
  （`%LOCALAPPDATA%\Programs\ZCode`、`Program Files\ZCode` 等，以及本机实测的 `D:\Zcode\ZCode.exe`）。
  不做注册表/快捷方式/全盘扫描：默认路径 + 手动指认已经够用，行为也可预期。
- **本机配置**存在 `~/.painting-skin-theme/app.json`（`DIANA_SKIN_CONFIG` 可改路径），
  **不写进主题文件**——主题是仓库里的源文件，写机器相关的绝对路径会污染 git 工作树，
  打包后主题目录还在 `app.asar` 里、根本不可写。解析到默认路径时会顺手写进配置（自动配置）。
- **重启**（`relaunch`）：解析 exe → `taskkill /T /F` 结束实例（连同进程树）→ 等端口释放
  → 挑一个能绑上的端口（主端口被占用时 CDP 会**静默**绑定失败：应用照常起来、界面照常用，就是没有调试口，
  所以备选 9333/9345，注入侧也用同一份候选）→ 带 `--remote-debugging-port` 分离式拉起
  （`detached + unref`）→ 轮询 `/json/version` 直到 CDP 就绪（最长 45s，调试口已通则直接短路不杀进程）。
- **拉起的启动环境必须清洗**：面板与 CLI 之间约定用应用自身的 Electron 当 Node
  （`ELECTRON_RUN_AS_NODE=1`，见 `src/main.ts`），这个变量会被继承到被拉起的应用上——
  于是目标应用以**纯 Node** 启动：不开界面、不看命令行参数、报错秒退。
  实测（`.verify/env-inherit-ab.js`）继承时 Electron 应用的 `require('electron').ipcMain` 是 `undefined`，
  秒退；清掉后 GUI 正常。所以启动前要删 `ELECTRON_RUN_AS_NODE` / `ELECTRON_RENDERER_URL` /
  `VITE_DEV_SERVER_URL` / `MAIN_VITE_DEV_SERVER_URL` / `ELECTRON_NO_ATTACH_CONSOLE` / `NODE_OPTIONS`
  （Dream-Work-Theme 的启动器同样要清这几个）。
- **失败要快、要看得见**：应用若在启动后立刻退出（环境被污染、单实例锁未释放），
  最多 5s 就报"启动后立刻退出（退出码 N）"，而不是白等满超时；每一步都写进
  `~/.painting-skin-theme/relaunch.log`，面板按钮上实时显示当前进度（关闭中 / 启动中 / 注入中…）。

### ⑫ 动态立绘的编码口径与实测保真

**Chromium 能解的只有 VP9 profile 0（4:2:0）+ alpha。** 实测（`.verify/codec-ask.js`）：`yuva420p` 正常播、
`yuv444p`（profile 1、无 alpha）正常播，而 **`yuva444p`（4:4:4 + alpha）直接
`PipelineStatus::PIPELINE_ERROR_DECODE`** —— "换成 4:4:4 就能 RGB 也无损"这条路在实机走不通。
落地口径因此是：**alpha 走独立的 VP9 侧流（逐像素精确），RGB 走 4:2:0**（色度抽样本身有损，
`-lossless 1` 只保证不再多丢，找不回抽样丢掉的信息）。

**实机保真怎么量的**（`.verify/live-fidelity.js`）：借主题自己挂的那个 `<video>`（自建 media 元素常连
metadata 都加载不出来），暂停在指定帧、临时按原生尺寸 1:1 摆进视口（尺寸按 dpr 归一、覆盖应用里的
`max-width:100%`、挪到 `body` 直下免得被界面盖住），截图后与源帧做 source-over 合成、逐像素比。
取样窗前放一条已知色控制条，先自证坐标口径。实测口径是**全可见视频面**（不挑小块取样窗——挑窗会出假象：
珂莱塔按窗口量出"最大差 590"，全区域扫下来 99.993% 的像素都在 11/765 以内）。七套动态立绘实测：

| 主题 | 源 | 原生尺寸 | 帧率/帧数 | 视频体积 | 实机 vs 源（每通道平均差） |
| --- | --- | --- | --- | --- | --- |
| yinlin-line | 鸣潮立绘 4K 帧序列 | 2382×3170 | 12fps / 36 | 39 MB | 0.268/255 |
| yuye-line | `zzz-spine-demo` webm | 2004×3540 | 30fps / 300 | 282 MB | 0.417/255 |
| c223-line | `nikke-spine-demo` webm | 1716×2456 | 30fps / 80 | 78 MB | 0.402/255 |
| younuo-line | 鸣潮 4K webm（黑底） | 1808×2160 | 30fps / 400 | 264 MB | 0.386/255 |
| kelaita-line | 同上 | 2776×2144 | 30fps / 200 | 127 MB | 0.193/255 |
| katixiya-line | 同上 | 2068×1912 | 30fps / 200 | 186 MB | 0.411/255 |
| daniya-line | 同上 | 1912×2156 | 30fps / 200 | 122 MB | 0.169/255 |

这个量级就是 4:2:0 抽样地板（alpha 通道另测为逐像素一致，见 `.verify/webm-exact.js`），肉眼不可见。

**黑底 4K 源怎么处理**（尤诺/珂莱塔/卡提希娅/达妮娅这四套）：源是 3840×2160、**不带 alpha** 的黑底
视频，所以要自己抠底——`tools/extract-art.js` 的边缘连通 + 厚度检测正是为这种源写的（全局按黑色扣
会把黑丝/暗部一起吃掉；从四边向内扩散则被描边挡住，只吃背景）。1000 帧 4K 串行要 1 小时，
`tools/key-frames.js` 用 10 路并行压到 ~10 分钟：

```bash
ffmpeg -y -c:v libvpx-vp9 -i "../YouNuo_01_4K_clean.webm" -pix_fmt rgba -start_number 0 tools/work/src-younuo4k/%03d.png
node tools/key-frames.js --src tools/work/src-younuo4k --out tools/work/keyed-younuo --jobs 10
node tools/build-theme-motion.js --src tools/work/keyed-younuo --id younuo-line --name "霜蓝线稿 · 尤诺" --fps 30 --skip-motion
node dist/cli.js apply --skin younuo-line --mode dark && node .verify/display-width.js younuo-line   # 实测显示宽 884
node tools/optimize-motion.js --frames tools/work/keyed-younuo --crop 1016,0,1808,2160 --fps 30 \
     --target-w 1768 --display-w 884 --sweep 10,12,14 --no-lossless --out themes/younuo-line/assets/character-motion.webm
```

（生成器里那次"原生尺寸无损"编码由 `--skip-motion` 跳过 —— 交付视频随后要按显示宽 ×2 重编，
那一次纯属白烧时间。）

**交付口径：按"显示尺寸的整数倍 + 最小无缝循环 + 视觉无损档"重编**（`tools/optimize-motion.js`）。
起因是实机立绘出现锯齿：立绘框宽约 590 设备像素，而交付的是 1808–2776px 宽的素材 —— 浏览器每帧用
两抽头缩放器做 **3.11× 非整数**降采样，等于欠采样，边缘就起锯齿。四件事一起做：

1. **立绘显示尺寸 ×1.5**：盒子宽上限 519→778 CSS px（设备 884），**高度上限也一起放开**（62vh→85vh）——
   只放大宽度会被高度上限卡住，`object-fit:contain` 就按高度缩回去，等于没放大（实测：宽 778 / 高 785 时
   视频只渲染到 657 宽）。
2. **交付尺寸 = 该套**实测**显示宽（×1）**（每套不同：显示宽由素材纵横比决定，如柚叶 598、椿 368）。
   这一条 2026-09-23 晚**改过档**：原来的口径是"显示宽的整数 2 倍"，理由是"整 2 倍时浏览器做的就是
   2×2 盒式平均、锯齿从原理上消失"。但把实机截图在同一个坐标 **4× 放大对比**后发现，Chromium 的
   **两抽头**缩放器在 2:1 时每轴只合成两个样本（不是 2×2 平均），发丝这类细边缘仍是 **1px 阶梯**；
   改成 **×1**（浏览器几乎不重采样，缩放比 1.02×）后抗锯齿完全由我们自己的 lanczos 负责，
   边缘从"阶梯"变成"曲线"。代价是**编码噪声不再被浏览器的下采样平均掉** —— 于是把 CRF 扫描档
   一并收紧到 `4,6,8`（实测 c581 CRF4：显示尺度 RGB 0.59/255、最大 9，肉眼无差），
   体积顺带再降一档（c581 2×/CRF10 9.51MB → 1×/CRF4 5.01MB）。
   旧口径下"实机渲染 vs 理想缩放"的边缘误差比 3.11× **1.73** → 1.52× **3.90** → 2.03× **1.18**（1.0 = 理想）
   这组数还成立，但它量的是**缩放器差异**；2:1 时那点差异对细边缘就是肉眼可见的阶梯。
3. **最小无缝循环**：按"源能被整除 + 循环内误差最小 + 接缝差 ≤ 相邻帧典型差"选周期。尤诺 400→**100** 帧
   （循环内误差 0.04/255、接缝 0.47 ≈ 相邻帧典型 0.47）、柚叶 300→100、珂莱塔/达妮娅 200→100；
   卡提希娅 200、c223 80、吟霖/今汐/椿/坎特蕾拉/守岸人 36 本就是最小循环。
4. **视觉无损档**：在交付尺寸下扫 CRF，按**显示尺度**的误差选（浏览器最终缩小显示，误差会被平均）。
   尤诺实测：无损 36.3MB → CRF 16 **7.26MB**，显示尺度平均差 0.518/255，而浏览器缩放器自身的误差是
   2.05/255（是它的 4 倍）。

| 主题 | 显示宽(设备px) | 交付尺寸（×1） | 循环 | 来源 | 交付 |
| --- | --- | --- | --- | --- | --- |
| guiming-line | 1227 | 1228×1020 | 360 帧 / 12.00s | 明日方舟/归溟幽灵鲨-生而为一.webm（274 MB） | **39.60 MB** |
| shuxin-line | 1227 | 1228×872 | 210 帧 / 7.00s | 明日方舟/塑心.webm（94 MB） | **13.00 MB** |
| wisadel-line | 1227 | 1214×1064 | 160 帧 / 5.33s | 明日方舟/维什戴尔-超新星.webm（56 MB） | **26.32 MB** |
| ines-line | 1039 | 1038×1056 | 100 帧 / 3.33s | 明日方舟/伊内丝-蝶舞华章.webm（30 MB） | **7.50 MB** |
| shuxin2-line | 1016 | 1016×1058 | 120 帧 / 4.00s | 明日方舟/塑心-无我唯识.webm（96 MB） | **16.65 MB** |
| papillon-line | 1012 | 1012×1056 | 100 帧 / 3.33s | neeke/Papillon_c908.webm（149 MB） | **6.84 MB** |
| shenfa-line | 1003 | 1004×1058 | 80 帧 | neeke/神罚_c260_02.webm（143 MB） | **4.51 MB** |
| honglian-line | 940 | 940×1058 | 80 帧 | neeke/红莲_c222.webm（103 MB） | **4.73 MB** |
| daniya-line | 937 | 938×1058 | 100 帧 / 3.33s | DaNiYa_01_4K_clean.webm（鸣潮 4K 黑底→抠底） | **7.79 MB** |
| c270b-line | 853 | 854×1058 | 55 帧 | 胜利女神/成片/c270_02.webm（76 MB） | **3.08 MB** |
| dorothy2-line | 741 | 740×1056 | 80 帧 | neeke/Dorothy_c233_80.webm（99 MB） | **4.51 MB** |
| c971b-line | 728 | 728×1058 | 100 帧 / 3.33s | neeke/c971_c971_01.webm（198 MB） | **10.89 MB** |
| c262-line | 727 | 728×1058 | 100 帧 / 3.33s | 胜利女神/成片/c262.webm（316 MB） | **9.52 MB** |
| dorothy-line | 660 | 660×1056 | 80 帧 | neeke/Dorothy_c233_02.webm（100 MB） | **4.56 MB** |
| c971-line | 653 | 654×1058 | 100 帧 / 3.33s | neeke/c971_c971.webm（194 MB） | **8.65 MB** |
| yuye-line | 598 | 598×1056 | 100 帧 / 3.33s | zzz-spine-demo 柚叶帧序列（绝区零，2004×3540） | **2.94 MB** |
| c871-line | 573 | 572×1056 | 80 帧 | neeke/c871_c871_02.webm（128 MB） | **2.21 MB** |
| sakura-line | 544 | 544×1056 | 80 帧 | neeke/Sakura_c282.webm（152 MB） | **4.66 MB** |
| c225-line | 532 | 532×1058 | 100 帧 / 3.33s | 重渲染（去特效层后出帧） | **3.12 MB** |
| tia-line | 514 | 514×1058 | 80 帧 | neeke/Tia_c451.webm（112 MB） | **2.07 MB** |
| c162-line | 483 | 482×1054 | 80 帧 | neeke/c162_c162.webm（95 MB） | **4.93 MB** |
| sin-line | 460 | 460×1056 | 80 帧 | neeke/Sin_c401_01.webm（66 MB） | **2.11 MB** |
| tia4-line | 460 | 460×1056 | 80 帧 | neeke/Tia_c451_03.webm（157 MB） | **2.45 MB** |
| c973-line | 450 | 450×1058 | 80 帧 | neeke/c973_c973.webm（161 MB） | **2.26 MB** |
| c270-line | 440 | 440×1058 | 60 帧 | 胜利女神/成片/c270_01.webm（71 MB） | **2.58 MB** |
| c581-line | 435 | 436×1058 | 100 帧 / 3.33s | neeke/c581_c581.webm（79 MB） | **4.03 MB** |
| viper2-line | 430 | 430×1058 | 80 帧 | neeke/Viper_c112_03.webm（115 MB） | **1.74 MB** |
| moran-line | 419 | 420×1058 | 100 帧 / 3.33s | neeke/Moran_c281_01.webm（49 MB） | **1.97 MB** |
| viper-line | 406 | 406×1058 | 80 帧 | neeke/Viper_c112.webm（128 MB） | **4.40 MB** |
| tia2-line | 364 | 364×1056 | 80 帧 | neeke/Tia_c451_01.webm（133 MB） | **2.75 MB** |
| tia3-line | 326 | 326×1056 | 80 帧 | neeke/Tia_c451_02.webm（140 MB） | **1.38 MB** |
| 合计 | | | | **3514 MB** | **213.76 MB** |

**NIKKE 那 18 套（2026-09-23）**：源是 `D:/BigModel/neeke/` 下 19 个**本来就带 alpha** 的原生立绘 webm
（`nikke-spine-demo` 用无头 Chrome + spine-ts 渲染，`-lossless 1 -pix_fmt yuva420p` 编码，60fps 逐帧推进）。
所以**不需要抠底** —— 但**必须 `-c:v libvpx-vp9` 强制解码**：默认解码器只解主画面、把 alpha 侧流丢掉，
解出来就是"黑底不透明"，照它看会误判成"要抠底"。源 60fps、交付 30fps，用 **隔帧取**
（`select=not(mod(n,2))`，不是 `fps=30` 重采样 —— 后者按时间戳挑帧，语义不如按序号确定）：

```bash
bash tools/work/neeke-extract.sh    # 19 个 webm → tools/work/neeke-src/<主题id>/ 的 30fps 带 alpha 序列
bash tools/work/neeke-build.sh      # 每套一句生成器（--skip-motion）
bash tools/work/neeke-deliver.sh    # 实测显示宽 → 鲜艳色强调色 → 按 2× 转码
bash tools/work/neeke-verify.sh     # 实机复核（apply 13/13 + 锯齿 + 保真）
```

19 个 webm 里只新做了 18 套：`c223` 那套正是**已经交付**的 `themes/c223-line`（同一份素材 —— 源
1746×2505、80 帧 @30fps、裁剪窗口 1716×2456 完全对得上）。

这条流水线上新增的三个口径：

- **`--skip-motion`**（`build-theme-motion.js`）：生成器第 ② 步那次"原生尺寸"编码几分钟后就被
  `optimize-motion.js` 覆盖，纯属白烧时间（神罚那套 2308×2432×160 帧最贵）。加了这个开关，
  量/裁/配色/涂鸦/清单照做，只是不写 `character-motion.webm`。
- **`.verify/display-width.js`**：交付宽 = **实测**显示宽 × 2。盒子宽是 `clamp(boxW*0.6, 60cqw, boxW)`、
  高是 `min(85vh, boxH)` —— `cqw` 跟容器、`vh` 跟窗口走，而立绘是 `object-fit:contain`，
  真正被缩放的宽度是 `min(盒宽, 盒高×纵横比)`：这些都得实测，不能照 CSS 推算。
- **`.verify/focus-page.js`**：Chromium 对**不可见页面**会暂停媒体（`readyState=4` 但 `currentTime=0`、
  `paused=true`），此时截图只有 UI 没有立绘。抓图与动态校验前先 `Page.bringToFront` +
  `Emulation.setFocusEmulationEnabled`，否则会把"没显示"误判成"没生效"。

（逐套明细见上面那张表：`neeke/`、`胜利女神/成片/`、`明日方舟/` 的源文件与体积都写在"来源"列里。）

（粗体那 4 套是 2026-09-23 晚补的第二批：`c971` 与 `c971b` 是同一角色（银发黑裙 + 巨剑 + 血红光环，
后者多一副红眼罩），`c973` 白+薰衣草紫，`c162` 黑皮革 + 深紫发。一条命令跑完全流程：
`tools/work/neeke2-run.sh`。）

**强调色的一次显式覆盖**：`c973-line` 按常规口径（15° 色相分桶、取"饱和度×明度居中"最高且面积 ≥5%）
量出来是琥珀 `#ddad3c`（h42）—— 但它来自大面积**肤色/浅色**（鲜艳度 0.28），而该主题的「最鲜艳」
（前 2% 高饱和像素的均值）是**薰衣草紫** `#8687d5`（h239，0.24）。两者只差 0.04，且紫才是她自己的颜色
（白大衣 + 紫发的设计色）。所以这一套用 `--accent` 显式覆盖成 `#3c3fdd`（同一色相，按口径提 S 到 .70、
L 取 .55）—— 口径本来就留了 `--accent` 这个口子（yinlin-line 的「雷电紫」也是这么定的）。`c162-line`
同样是肤色带跑（h15 面积 22.5%），但它的画面里没有更强、更"设计"的色相，于是**保留实测值**并改名
`珊瑚线稿`。下次遇到"分桶胜出"与"最鲜艳"不在同一色族时，按这条先例判断。


**帧序与保真另有一条离线校验**（`tools/work/frame-map.js`）：把交付视频的第 15 帧缩到显示尺度，与源帧
12–18 逐帧做 source-over 合成后比 —— 18 套全都"最接近同序号帧"（平均 0.44–0.84/255、最大 7.7–11，
即 4:2:0 地板），说明帧序没移位、编码没走样。实机那两条（`alias-check` 的边缘误差比、`live-fidelity`
的平均差）对窗口/面板状态敏感：同期把**早已交付的** `younuo-line` 拿回来重测也是 **2.40**（当初记录
1.18），所以它们只作本批横向比对，不当绝对判据 —— 判据取 `apply` 复核 + 上面这条离线校验。

`live-fidelity` 还有一条与本批口径相冲的地方，看数字时要知道：它是**按裁剪窗口尺寸**把 `<video>` 摆成
1:1 再比，而本批交付尺寸是按"显示宽 ×2"定的 —— 竖构图那几套交付尺寸远小于裁剪窗口（如 tia3：裁剪
1030px 宽 → 交付 652px），于是它先把视频**放大 1.58×** 再比，误差里混进了放大模糊（实测这几套
1.5–2.6/255，而 papillon 这种交付尺寸≈裁剪窗口的只有 0.93/255）。要比绝对保真就用 `frame-map.js`
（两边都缩到显示尺度，与流水线自己的判据同尺）。


**探针也要跟着改**：立绘框变大后右半部分会被应用自己的右侧面板盖住，截图里那部分像素是面板而不是
立绘 —— `.verify/alias-check.js` 因此加了**遮挡掩码**（`elementFromPoint` 在框内打 160×160 网格，
只比真的能看到 `<video>` 的点）。没加掩码时整体误差 8.6/255 全是"面板 vs 立绘"，加了之后 1.22/255。

**配色口径：每套主题的强调色取"立绘上最鲜艳的颜色"**（`.verify/vivid-color.js`）。做法：不透明像素按
15° 色相分桶，取"饱和度 × 明度居中"最高、且**面积 ≥5%** 的那一桶（面积门槛用于排除眼睛/光效那种
一两像素的高饱和带跑，以及发白的浅色高光），饱和度提到 ≥0.7 作强调色，族中心色相跟着它走，中性明度
阶梯照搬 diana。改色用 `--colors-only`（复用第 ④ 步的 token 逻辑、跳过导出/编码/涂鸦）——**别直接重跑
生成器**：那会把优化好的视频覆盖回原生尺寸的大文件（实测 1.94MB → 38MB）。另外两条同源的坑：
`--colors-only` 不给 `--name` 不能拿 ID 兜底（会把已经起好的显示名冲成 id —— 面板显示的就是这个名字，
已修成"沿用清单里的原名"）；`author` 原本硬编码"鸣潮"，现在由 `--source "<素材来源>"` 给。

## 项目结构

```
src/                        引擎与应用层
  main.ts                   Electron 主进程：窗口 / 托盘 / IPC；只做进程调度，不碰 CDP 与本地库
  panel.html                面板界面（不依赖框架）
  cli.ts                    命令行入口
  injector.ts               payload 组装 · 注入 · 复核 · 撤下 · 状态；用量条与桌宠的注入
  cdp.ts                    CDP 会话与目标发现（零依赖，用 Node 自带 fetch / WebSocket）
  theme-store.ts            主题清单校验（路径只收安全相对路径、逐段防越界）与素材读取
  target-app.ts             目标应用定位：默认路径解析 / 本机配置 / 以调试端口重启
  usage-db.ts               读 ZCode 的用量库（node:sqlite，只读）并聚合出快照
  usage-pump.ts             fs.watch + 限频 + 心跳，经 CDP 把快照推给页面
  usage-bar.ts              用量条的页面端脚本
  pet.ts                    桌宠注册表与页面端运行时
  types.ts                  共享类型
runtime/
  runtime-template.js       页面端运行时（全项目一份的引擎文件：挂美术层 / 几何定位 / 导轨适配；
                            主题清单里的 skin.runtime 是可选覆盖）
themes/                     主题（每目录一套皮肤）
  diana/                    清单 + skin/{theme.css, zcode-tokens.css, zcode-artwork-contract.css} + assets/（10 美术 + 2 壁纸）
  cosmic-line/              同上；素材为纯 alpha 蒙版，两种极性都用 mask + 主题色
  butterfly-line/           实现基准为 diana（skin/ 三份样式表照搬）；素材由 tools/build-theme-butterfly.js
                            从 素材/ 生成：立绘原图直出（612×1440，523KB）+ Diana 那 8 张装饰（按 maxW 缩放）
  shorekeeper-line/         **动态立绘**：character-motion.webm（36 帧 VP9+alpha，原生分辨率，file:// 交付）
  jinxi-line/ kanteleila-line/ chun-line/ yinlin-line/ c223-line/ yuye-line/
                            同上，由 tools/build-theme-motion.js 生成（今汐 / 坎特蕾拉 / 椿 / 吟霖 /
                            c223 / 柚叶）；涂鸦**直接照搬 Diana 的原文件**（逐字节一致，颜色由 CSS token 给），
                            另出 character-still.webp（面板 + 视频兜底）
  younuo-line/ kelaita-line/ katixiya-line/ daniya-line/
                            同一条流水线，源是**黑底 4K 无 alpha** 的 webm（尤诺 / 珂莱塔 / 卡提希娅 /
                            达妮娅）：先用 tools/extract-art.js 边缘连通抠底（tools/key-frames.js 并行），
                            再按显示宽 ×2 交付（见 §⑫ 的交付口径）
  c581-line/ c871-line/ dorothy-line/ dorothy2-line/ isabel-line/ moran-line/ papillon-line/
  sakura-line/ sin-line/ tia-line/ tia2-line/ tia3-line/ tia4-line/ viper-line/ viper2-line/
  honglian-line/ honglian2-line/ shenfa-line/
                            NIKKE 原生立绘（2026-09-23）：源是 D:/BigModel/neeke 下 19 个**带 alpha 的**
                            60fps webm，隔帧取 30fps 后走同一条流水线（--skip-motion → 实测显示宽 →
                            optimize-motion 按 2× 重编，合计 1.96 GB → 115 MB；c223 那份即已有的 c223-line）
assets/                     运行时资源
  icon.png                  应用图标（窗口 / 托盘，打包时转 .ico 作安装器图标）
  pet/<id>/                 6 只桌宠 × 11 个状态 GIF + pet.json
tools/                      素材工具链（零依赖）
  png.js                    PNG 编解码
  build-theme-butterfly.js  从 素材/ 生成 butterfly-line 的素材集（立绘经 ffmpeg 原图直出，装饰按 maxW 缩放）
  eye-color.js              从立绘里量"眼睛的颜色"（默认只取蓝>绿的品红家族像素，排除皮肤/头发），
                            输出配色锚点（强调色 / 日间压暗值 / 族中心色相）—— butterfly-line 的配色即由它得出
  build-theme-motion.js     **通用生成器**：一个动态立绘帧序列 + 一句命令 → 一整套主题
                            （量并集内容框与配色锚点 → VP9+alpha 动态立绘 + 静止兜底帧 → 照搬 Diana 涂鸦
                            原文件 → 以 diana 为基准重写主题色并写 theme.json）。
                            两个已修的坑：**裁剪窗口要夹回画面内**（内容贴边时"四周留 8px"会越界，
                            ffmpeg 只报 `Invalid argument`）、**装饰必须落在 OUT/assets/**（清单写的是
                            assets/xxx.png，落到主题根目录会"存在但找不到"）。
                            三个开关：`--skip-motion`（跳过会被 optimize-motion 覆盖的原生编码）、
                            `--colors-only`（只换配色，**沿用清单里的显示名**）、`--source "<素材来源>"`
  optimize-motion.js        **交付转码器**：最小无缝循环 + 按显示宽 ×2 缩放 + CRF 扫描（判据落在
                            **显示尺度**的误差上）+ 写 sidecar `.webm.json`（循环帧数/尺寸/CRF）
  key-frames.js             批量抠底：对一整个帧目录并行跑 extract-art.js（4K 单帧 ~4.3s，10 路并行
                            把 1000 帧从 1 小时压到 ~10 分钟）
  build-theme-shorekeeper.js 同上但只针对 shorekeeper-line（保留：它那套带"静止帧也进主题"的旧口径）
  zcode-css.js              读 ZCode 打包在 app.asar 里的渲染层 CSS：列出应用定义的 --color-* token、
                            查某个 token 谁在用、并与某个主题的覆盖面对差集（做新皮肤时查漏项）
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
  work/neeke-*.sh            NIKKE 那批的脚本（提取 / 生成 / 交付 / 复核；第二批一步到位：work/neeke2-run.sh）
  work/frame-map.js          离线核验：交付视频第 N 帧 vs 源帧 N±3（帧序对不对、编码走没走样）
.verify/                    验证脚本与夹具（实机归因、A/B、像素取证、夹具回归）
  display-width.js          量实机立绘的**显示宽**（设备像素）—— 交付宽 = 它 ×2
  focus-page.js             把页面提到前台（不可见页面会被 Chromium 暂停媒体，立绘截不到）
  page-state.js             页面可见性 + 立绘 <video> 的播放状态（区分"没显示"与"没生效"）
  current-skin.js           当前挂的是哪套皮肤 / 立绘节点在不在（排查"立绘不见了"用）
  capture-gallery.js        给**所有**皮肤拍实机图（`--screen` 抓物理屏幕、`--only=a,b` 补抓；
                            屏幕抓图会被前台窗口决定，所以抓完自检标题栏亮度，被挡就重试）
  screen-shot.ps1           抓物理屏幕（SetProcessDPIAware 后才拿到真实分辨率）
  gallery-page.js           把抓好的图做成可滚动的本地画廊页（gallery.html）
素材/ · 线稿/                原始素材（不进 git）。素材/ 是 butterfly-line 的素材源（立绘 2.png + Diana 那 8 张
                            装饰），线稿/ 那 8 张 AI 生成立绘留给尚未启用的线稿流水线（tools 里的 PLAN 槽位）
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
- 面板与泵在打包形态下由应用自身的 exe 充当 Node（`ELECTRON_RUN_AS_NODE=1`），不依赖用户装 Node| 主题 | 显示宽(设备px) | 交付尺寸（×1） | 循环 | 来源 | 交付 |
| --- | --- | --- | --- | --- | --- |
| guiming-line | 1227 | 1228×1020 | 360 帧 / 12.00s | 明日方舟/归溟幽灵鲨-生而为一.webm（274 MB） | **39.60 MB** |
| shuxin-line | 1227 | 1228×872 | 210 帧 / 7.00s | 明日方舟/塑心.webm（94 MB） | **13.00 MB** |
| shuyan-line | 1227 | 1228×630 | 601 帧 / 20.03s | 明日方舟/谭舒雁-临江仙.webm（474 MB） | **54.36 MB** |
| wisadel-line | 1227 | 1214×1064 | 160 帧 / 5.33s | 明日方舟/维什戴尔-超新星.webm（56 MB） | **26.32 MB** |
| ines-line | 1039 | 1038×1056 | 100 帧 / 3.33s | 明日方舟/伊内丝-蝶舞华章.webm（30 MB） | **7.50 MB** |
| shuxin2-line | 1016 | 1016×1058 | 120 帧 / 4.00s | 明日方舟/塑心-无我唯识.webm（96 MB） | **16.65 MB** |
| papillon-line | 1012 | 1012×1056 | 100 帧 / 3.33s | neeke/Papillon_c908.webm（149 MB） | **6.84 MB** |
| shenfa-line | 1003 | 1004×1058 | 80 帧 | neeke/神罚_c260_02.webm（143 MB） | **4.51 MB** |
| honglian-line | 940 | 940×1058 | 80 帧 | neeke/红莲_c222.webm（103 MB） | **4.73 MB** |
| daniya-line | 937 | 938×1058 | 100 帧 / 3.33s | DaNiYa_01_4K_clean.webm（鸣潮 4K 黑底→抠底） | **7.79 MB** |
| c270b-line | 853 | 854×1058 | 55 帧 | 胜利女神/成片/c270_02.webm（76 MB） | **3.08 MB** |
| dorothy2-line | 741 | 740×1056 | 80 帧 | neeke/Dorothy_c233_80.webm（99 MB） | **4.51 MB** |
| c971b-line | 728 | 728×1058 | 100 帧 / 3.33s | neeke/c971_c971_01.webm（198 MB） | **10.89 MB** |
| c262-line | 727 | 728×1058 | 100 帧 / 3.33s | 胜利女神/成片/c262.webm（316 MB） | **9.52 MB** |
| dorothy-line | 660 | 660×1056 | 80 帧 | neeke/Dorothy_c233_02.webm（100 MB） | **4.56 MB** |
| c971-line | 653 | 654×1058 | 100 帧 / 3.33s | neeke/c971_c971.webm（194 MB） | **8.65 MB** |
| yuye-line | 598 | 598×1056 | 100 帧 / 3.33s | zzz-spine-demo 柚叶帧序列（绝区零，2004×3540） | **2.94 MB** |
| c871-line | 573 | 572×1056 | 80 帧 | neeke/c871_c871_02.webm（128 MB） | **2.21 MB** |
| sakura-line | 544 | 544×1056 | 80 帧 | neeke/Sakura_c282.webm（152 MB） | **4.66 MB** |
| c225-line | 532 | 532×1058 | 100 帧 / 3.33s | 重渲染（去特效层后出帧） | **3.12 MB** |
| tia-line | 514 | 514×1058 | 80 帧 | neeke/Tia_c451.webm（112 MB） | **2.07 MB** |
| c162-line | 483 | 482×1054 | 80 帧 | neeke/c162_c162.webm（95 MB） | **4.93 MB** |
| sin-line | 460 | 460×1056 | 80 帧 | neeke/Sin_c401_01.webm（66 MB） | **2.11 MB** |
| tia4-line | 460 | 460×1056 | 80 帧 | neeke/Tia_c451_03.webm（157 MB） | **2.45 MB** |
| c973-line | 450 | 450×1058 | 80 帧 | neeke/c973_c973.webm（161 MB） | **2.26 MB** |
| c270-line | 440 | 440×1058 | 60 帧 | 胜利女神/成片/c270_01.webm（71 MB） | **2.58 MB** |
| c581-line | 435 | 436×1058 | 100 帧 / 3.33s | neeke/c581_c581.webm（79 MB） | **4.03 MB** |
| viper2-line | 430 | 430×1058 | 80 帧 | neeke/Viper_c112_03.webm（115 MB） | **1.74 MB** |
| moran-line | 419 | 420×1058 | 100 帧 / 3.33s | neeke/Moran_c281_01.webm（49 MB） | **1.97 MB** |
| viper-line | 406 | 406×1058 | 80 帧 | neeke/Viper_c112.webm（128 MB） | **4.40 MB** |
| tia2-line | 364 | 364×1056 | 80 帧 | neeke/Tia_c451_01.webm（133 MB） | **2.75 MB** |
| tia3-line | 326 | 326×1056 | 80 帧 | neeke/Tia_c451_02.webm（140 MB） | **1.38 MB** |
| 合计 | | | | **3988 MB** | **268.11 MB** |

**NIKKE 那 18 套（2026-09-23）**：源是 `D:/BigModel/neeke/` 下 19 个**本来就带 alpha** 的原生立绘 webm
（`nikke-spine-demo` 用无头 Chrome + spine-ts 渲染，`-lossless 1 -pix_fmt yuva420p` 编码，60fps 逐帧推进）。
所以**不需要抠底** —— 但**必须 `-c:v libvpx-vp9` 强制解码**：默认解码器只解主画面、把 alpha 侧流丢掉，
解出来就是"黑底不透明"，照它看会误判成"要抠底"。源 60fps、交付 30fps，用 **隔帧取**
（`select=not(mod(n,2))`，不是 `fps=30` 重采样 —— 后者按时间戳挑帧，语义不如按序号确定）：

```bash
bash tools/work/neeke-extract.sh    # 19 个 webm → tools/work/neeke-src/<主题id>/ 的 30fps 带 alpha 序列
bash tools/work/neeke-build.sh      # 每套一句生成器（--skip-motion）
bash tools/work/neeke-deliver.sh    # 实测显示宽 → 鲜艳色强调色 → 按 2× 转码
bash tools/work/neeke-verify.sh     # 实机复核（apply 13/13 + 锯齿 + 保真）
```

19 个 webm 里只新做了 18 套：`c223` 那套正是**已经交付**的 `themes/c223-line`（同一份素材 —— 源
1746×2505、80 帧 @30fps、裁剪窗口 1716×2456 完全对得上）。

这条流水线上新增的三个口径：

- **`--skip-motion`**（`build-theme-motion.js`）：生成器第 ② 步那次"原生尺寸"编码几分钟后就被
  `optimize-motion.js` 覆盖，纯属白烧时间（神罚那套 2308×2432×160 帧最贵）。加了这个开关，
  量/裁/配色/涂鸦/清单照做，只是不写 `character-motion.webm`。
- **`.verify/display-width.js`**：交付宽 = **实测**显示宽 × 2。盒子宽是 `clamp(boxW*0.6, 60cqw, boxW)`、
  高是 `min(85vh, boxH)` —— `cqw` 跟容器、`vh` 跟窗口走，而立绘是 `object-fit:contain`，
  真正被缩放的宽度是 `min(盒宽, 盒高×纵横比)`：这些都得实测，不能照 CSS 推算。
- **`.verify/focus-page.js`**：Chromium 对**不可见页面**会暂停媒体（`readyState=4` 但 `currentTime=0`、
  `paused=true`），此时截图只有 UI 没有立绘。抓图与动态校验前先 `Page.bringToFront` +
  `Emulation.setFocusEmulationEnabled`，否则会把"没显示"误判成"没生效"。

（逐套明细见上面那张表：`neeke/`、`胜利女神/成片/`、`明日方舟/` 的源文件与体积都写在"来源"列里。）

（粗体那 4 套是 2026-09-23 晚补的第二批：`c971` 与 `c971b` 是同一角色（银发黑裙 + 巨剑 + 血红光环，
后者多一副红眼罩），`c973` 白+薰衣草紫，`c162` 黑皮革 + 深紫发。一条命令跑完全流程：
`tools/work/neeke2-run.sh`。）

**强调色的一次显式覆盖**：`c973-line` 按常规口径（15° 色相分桶、取"饱和度×明度居中"最高且面积 ≥5%）
量出来是琥珀 `#ddad3c`（h42）—— 但它来自大面积**肤色/浅色**（鲜艳度 0.28），而该主题的「最鲜艳」
（前 2% 高饱和像素的均值）是**薰衣草紫** `#8687d5`（h239，0.24）。两者只差 0.04，且紫才是她自己的颜色
（白大衣 + 紫发的设计色）。所以这一套用 `--accent` 显式覆盖成 `#3c3fdd`（同一色相，按口径提 S 到 .70、
L 取 .55）—— 口径本来就留了 `--accent` 这个口子（yinlin-line 的「雷电紫」也是这么定的）。`c162-line`
同样是肤色带跑（h15 面积 22.5%），但它的画面里没有更强、更"设计"的色相，于是**保留实测值**并改名
`珊瑚线稿`。下次遇到"分桶胜出"与"最鲜艳"不在同一色族时，按这条先例判断。


**帧序与保真另有一条离线校验**（`tools/work/frame-map.js`）：把交付视频的第 15 帧缩到显示尺度，与源帧
12–18 逐帧做 source-over 合成后比 —— 18 套全都"最接近同序号帧"（平均 0.44–0.84/255、最大 7.7–11，
即 4:2:0 地板），说明帧序没移位、编码没走样。实机那两条（`alias-check` 的边缘误差比、`live-fidelity`
的平均差）对窗口/面板状态敏感：同期把**早已交付的** `younuo-line` 拿回来重测也是 **2.40**（当初记录
1.18），所以它们只作本批横向比对，不当绝对判据 —— 判据取 `apply` 复核 + 上面这条离线校验。

`live-fidelity` 还有一条与本批口径相冲的地方，看数字时要知道：它是**按裁剪窗口尺寸**把 `<video>` 摆成
1:1 再比，而本批交付尺寸是按"显示宽 ×2"定的 —— 竖构图那几套交付尺寸远小于裁剪窗口（如 tia3：裁剪
1030px 宽 → 交付 652px），于是它先把视频**放大 1.58×** 再比，误差里混进了放大模糊（实测这几套
1.5–2.6/255，而 papillon 这种交付尺寸≈裁剪窗口的只有 0.93/255）。要比绝对保真就用 `frame-map.js`
（两边都缩到显示尺度，与流水线自己的判据同尺）。


**探针也要跟着改**：立绘框变大后右半部分会被应用自己的右侧面板盖住，截图里那部分像素是面板而不是
立绘 —— `.verify/alias-check.js` 因此加了**遮挡掩码**（`elementFromPoint` 在框内打 160×160 网格，
只比真的能看到 `<video>` 的点）。没加掩码时整体误差 8.6/255 全是"面板 vs 立绘"，加了之后 1.22/255。

**配色口径：每套主题的强调色取"立绘上最鲜艳的颜色"**（`.verify/vivid-color.js`）。做法：不透明像素按
15° 色相分桶，取"饱和度 × 明度居中"最高、且**面积 ≥5%** 的那一桶（面积门槛用于排除眼睛/光效那种
一两像素的高饱和带跑，以及发白的浅色高光），饱和度提到 ≥0.7 作强调色，族中心色相跟着它走，中性明度
阶梯照搬 diana。改色用 `--colors-only`（复用第 ④ 步的 token 逻辑、跳过导出/编码/涂鸦）——**别直接重跑
生成器**：那会把优化好的视频覆盖回原生尺寸的大文件（实测 1.94MB → 38MB）。另外两条同源的坑：
`--colors-only` 不给 `--name` 不能拿 ID 兜底（会把已经起好的显示名冲成 id —— 面板显示的就是这个名字，
已修成"沿用清单里的原名"）；`author` 原本硬编码"鸣潮"，现在由 `--source "<素材来源>"` 给。

## 项目结构

```
src/                        引擎与应用层
  main.ts                   Electron 主进程：窗口 / 托盘 / IPC；只做进程调度，不碰 CDP 与本地库
  panel.html                面板界面（不依赖框架）
  cli.ts                    命令行入口
  injector.ts               payload 组装 · 注入 · 复核 · 撤下 · 状态；用量条与桌宠的注入
  cdp.ts                    CDP 会话与目标发现（零依赖，用 Node 自带 fetch / WebSocket）
  theme-store.ts            主题清单校验（路径只收安全相对路径、逐段防越界）与素材读取
  target-app.ts             目标应用定位：默认路径解析 / 本机配置 / 以调试端口重启
  usage-db.ts               读 ZCode 的用量库（node:sqlite，只读）并聚合出快照
  usage-pump.ts             fs.watch + 限频 + 心跳，经 CDP 把快照推给页面
  usage-bar.ts              用量条的页面端脚本
  pet.ts                    桌宠注册表与页面端运行时
  types.ts                  共享类型
runtime/
  runtime-template.js       页面端运行时（全项目一份的引擎文件：挂美术层 / 几何定位 / 导轨适配；
                            主题清单里的 skin.runtime 是可选覆盖）
themes/                     主题（每目录一套皮肤）
  diana/                    清单 + skin/{theme.css, zcode-tokens.css, zcode-artwork-contract.css} + assets/（10 美术 + 2 壁纸）
  cosmic-line/              同上；素材为纯 alpha 蒙版，两种极性都用 mask + 主题色
  butterfly-line/           实现基准为 diana（skin/ 三份样式表照搬）；素材由 tools/build-theme-butterfly.js
                            从 素材/ 生成：立绘原图直出（612×1440，523KB）+ Diana 那 8 张装饰（按 maxW 缩放）
  shorekeeper-line/         **动态立绘**：character-motion.webm（36 帧 VP9+alpha，原生分辨率，file:// 交付）
  jinxi-line/ kanteleila-line/ chun-line/ yinlin-line/ c223-line/ yuye-line/
                            同上，由 tools/build-theme-motion.js 生成（今汐 / 坎特蕾拉 / 椿 / 吟霖 /
                            c223 / 柚叶）；涂鸦**直接照搬 Diana 的原文件**（逐字节一致，颜色由 CSS token 给），
                            另出 character-still.webp（面板 + 视频兜底）
  younuo-line/ kelaita-line/ katixiya-line/ daniya-line/
                            同一条流水线，源是**黑底 4K 无 alpha** 的 webm（尤诺 / 珂莱塔 / 卡提希娅 /
                            达妮娅）：先用 tools/extract-art.js 边缘连通抠底（tools/key-frames.js 并行），
                            再按显示宽 ×2 交付（见 §⑫ 的交付口径）
  c581-line/ c871-line/ dorothy-line/ dorothy2-line/ isabel-line/ moran-line/ papillon-line/
  sakura-line/ sin-line/ tia-line/ tia2-line/ tia3-line/ tia4-line/ viper-line/ viper2-line/
  honglian-line/ honglian2-line/ shenfa-line/
                            NIKKE 原生立绘（2026-09-23）：源是 D:/BigModel/neeke 下 19 个**带 alpha 的**
                            60fps webm，隔帧取 30fps 后走同一条流水线（--skip-motion → 实测显示宽 →
                            optimize-motion 按 2× 重编，合计 1.96 GB → 115 MB；c223 那份即已有的 c223-line）
assets/                     运行时资源
  icon.png                  应用图标（窗口 / 托盘，打包时转 .ico 作安装器图标）
  pet/<id>/                 6 只桌宠 × 11 个状态 GIF + pet.json
tools/                      素材工具链（零依赖）
  png.js                    PNG 编解码
  build-theme-butterfly.js  从 素材/ 生成 butterfly-line 的素材集（立绘经 ffmpeg 原图直出，装饰按 maxW 缩放）
  eye-color.js              从立绘里量"眼睛的颜色"（默认只取蓝>绿的品红家族像素，排除皮肤/头发），
                            输出配色锚点（强调色 / 日间压暗值 / 族中心色相）—— butterfly-line 的配色即由它得出
  build-theme-motion.js     **通用生成器**：一个动态立绘帧序列 + 一句命令 → 一整套主题
                            （量并集内容框与配色锚点 → VP9+alpha 动态立绘 + 静止兜底帧 → 照搬 Diana 涂鸦
                            原文件 → 以 diana 为基准重写主题色并写 theme.json）。
                            两个已修的坑：**裁剪窗口要夹回画面内**（内容贴边时"四周留 8px"会越界，
                            ffmpeg 只报 `Invalid argument`）、**装饰必须落在 OUT/assets/**（清单写的是
                            assets/xxx.png，落到主题根目录会"存在但找不到"）。
                            三个开关：`--skip-motion`（跳过会被 optimize-motion 覆盖的原生编码）、
                            `--colors-only`（只换配色，**沿用清单里的显示名**）、`--source "<素材来源>"`
  optimize-motion.js        **交付转码器**：最小无缝循环 + 按显示宽 ×2 缩放 + CRF 扫描（判据落在
                            **显示尺度**的误差上）+ 写 sidecar `.webm.json`（循环帧数/尺寸/CRF）
  key-frames.js             批量抠底：对一整个帧目录并行跑 extract-art.js（4K 单帧 ~4.3s，10 路并行
                            把 1000 帧从 1 小时压到 ~10 分钟）
  build-theme-shorekeeper.js 同上但只针对 shorekeeper-line（保留：它那套带"静止帧也进主题"的旧口径）
  zcode-css.js              读 ZCode 打包在 app.asar 里的渲染层 CSS：列出应用定义的 --color-* token、
                            查某个 token 谁在用、并与某个主题的覆盖面对差集（做新皮肤时查漏项）
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
  work/neeke-*.sh            NIKKE 那批的脚本（提取 / 生成 / 交付 / 复核；第二批一步到位：work/neeke2-run.sh）
  work/frame-map.js          离线核验：交付视频第 N 帧 vs 源帧 N±3（帧序对不对、编码走没走样）
.verify/                    验证脚本与夹具（实机归因、A/B、像素取证、夹具回归）
  display-width.js          量实机立绘的**显示宽**（设备像素）—— 交付宽 = 它 ×2
  focus-page.js             把页面提到前台（不可见页面会被 Chromium 暂停媒体，立绘截不到）
  page-state.js             页面可见性 + 立绘 <video> 的播放状态（区分"没显示"与"没生效"）
  current-skin.js           当前挂的是哪套皮肤 / 立绘节点在不在（排查"立绘不见了"用）
  capture-gallery.js        给**所有**皮肤拍实机图（`--screen` 抓物理屏幕、`--only=a,b` 补抓；
                            屏幕抓图会被前台窗口决定，所以抓完自检标题栏亮度，被挡就重试）
  screen-shot.ps1           抓物理屏幕（SetProcessDPIAware 后才拿到真实分辨率）
  gallery-page.js           把抓好的图做成可滚动的本地画廊页（gallery.html）
素材/ · 线稿/                原始素材（不进 git）。素材/ 是 butterfly-line 的素材源（立绘 2.png + Diana 那 8 张
                            装饰），线稿/ 那 8 张 AI 生成立绘留给尚未启用的线稿流水线（tools 里的 PLAN 槽位）
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
