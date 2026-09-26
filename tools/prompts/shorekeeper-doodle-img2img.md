# 守岸人 · 装饰涂鸦提示词（**线稿版**，中英双版）

基准图：`D:\BigModel\鸣潮立绘4K\C_ShouAnRen_01\C_ShouAnRen_01_4k.png`（2578×2162，透明底，spine 动态立绘单帧）
同目录还有 `frames/000–035.png`（36 帧 4K 透明帧）与 `C_ShouAnRen_01.webm`（4K VP9 + 真 alpha）——
这一张的姿态合适，若要换姿态从帧序列里挑，母题不变。

用途：给 painting-skin-theme 新增「守岸人」皮肤，生成 **8 个装饰槽位的线稿素材**
风格基准：`themes/diana/assets/diana-doodle-v2.png` 那一套（本次实测，见 §一）
配色基准：基准图实测（见 §二）

> **最终做法（2026-09-21 定）**：这 8 个槽位**复用 Diana 的原素材**，只按主题换色 ——
> `node tools/recolor-lineart.js --dir <源> --out <目标> --to "#d7f2fb,#a9dcf2"`
> （保明度、只换色相，alpha 与形状一像素不动；源锚点 `#fddbc6,#faafac` 是 Diana 素材实测的外层/芯线）。
> 已落到 `素材/<角色名>.png` 与 `themes/shorekeeper-line/assets/`；今汐的青玉版暂存 `素材/jinhsi/`。
>
> 背景：中途试过用矢量现画（`tools/draw-shorekeeper.js` / `draw-jinhsi.js` / 引擎 `draw-kit.js`），
> 结果被否（"丑到家了"）—— 程序化图元拼不出画师的手感，那批产物留在 `tools/work/shorekeeper|jinhsi/` 仅作参考。
> **下面这份提示词仍然是"出图路线"的完整说明**，需要跟 Diana 拉开造型差异时再用；
> 用它出图后同样可以走 `recolor-lineart.js` 对齐主题色。

> **为什么这些槽位必须是线稿**：`doodle / star / candy-* / acao-* / corner / upper` 在浅色模式下走
> `mask + 纯色填充`（取 alpha 当形状蒙版、颜色由主题 CSS 给，见 `themes/diana/skin/zcode-artwork-contract.css`）。
> 用渲染图当素材，取 alpha 只剩一层外轮廓，浅色下糊成实心色块。所以这 8 个槽位要的是"**线条即形状**"的线稿。
>
> **角色槽位相反**：它是 `background-image` 直接铺图（不取蒙版、不上色），
> 所以**不要**线稿化 —— 直接把 4K PNG 缩放落位即可，见 §五。

---

## 一、风格规范（线稿基准实测）

用 `node tools/ink-metrics.js themes/diana/assets/*.png` 复现（着墨阈值 alpha>32）：

| 槽位 | 画布 | 着墨比例 | 线宽中位 | 占画布宽 | 实心块 |
|---|---|---|---|---|---|
| `doodle` | 1267×1241 | 7.98% | 8px | **0.63%** | 0.91% |
| `star` | 256×256 | 12.16% | 12px | 4.69% | 10.65% |
| `candy-wrapped` | 256×256 | 10.54% | 5px | 1.95% | 0.05% |
| `candy-lollipop` | 256×256 | 10.05% | 6px | 2.34% | 1.35% |
| `acao-heart` | 512×512 | 5.42% | 5px | 0.98% | 0.04% |
| `acao-cheer` | 512×512 | 8.76% | 7px | 1.37% | 0.34% |
| `corner` | 1600×485 | 0.72% | 5px | 0.31% | 0.00% |
| `upper` | 490×315 | 1.76% | 5px | 1.02% | 0.00% |

### 三条容易写错的特征（逐张看基准图后确认）

1. **描边是"双色双层"，不是单线**。`diana-star-v2.png` 那张最清楚：一条宽而浅的奶白外描边，
   里面套一条细而深的玫红芯线，叠出"发光描边"的观感（`tools/line-art.js` 里就是照这个写的
   "外宽内窄两层描边"）。提示词里必须写出来，否则模型给的是普通单线，暗色下会发死。
2. **线的外缘是软的**。基准 `doodle` 画布 91.37% 完全透明；着墨像素里约 60% 的线芯是实的
   （alpha>208 的 4.80% ÷ alpha>32 的 7.98%）、其余是柔边过渡。所以"边缘略羽化"是特征，
   不是缺陷——别为了追求硬边加负词。
3. **线宽相对画布**：`doodle` 的中位线宽只占画布宽 0.63%，`star` 占 4.69%——
   小画布的槽位线相对更粗（图小、线不能细到看不见）。出图时按 §三 的目标值控制，别一套线宽画到底。

### 通用风格块（每条提示词都带上）

**中文**
```
手绘线稿，双色双层描边（外层一条较宽的浅冷色描边，内层套一条较细的深冷色芯线），
无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
线条外缘略带柔边，纯白背景，居中，大量留白
```
**English**
```
hand-drawn line art, two-layer outline (a wider pale cold-tone contour with a thinner deeper cold-tone core line running inside it),
no fill / no shading / no gradient, thin uniform line weight, slight hand-drawn wobble, closed contours,
slightly feathered stroke edges, plain white background, centered, lots of empty space
```

### 通用负面词（每条提示词都带上）

**中文**
```
填充，涂色，实心色块，明暗，阴影块，渐变，高光块，厚涂，赛璐璐上色，水彩，
彩色背景，灰色背景，黑色背景，夜景，星空背景，发光扩散，辉光，光晕，
场景，水面，海面，倒影，文字，字母，数字，水印，签名，logo，
多视角，三视图，被裁切，出画，地面投影，
粗线条，线宽不匀，断线，轮廓不闭合，糊成一片，模糊，低分辨率，
写实，照片，3D渲染，Q版
```
**English**
```
fill, coloring, solid color blocks, shading, shadow blocks, gradient, specular highlights,
thick paint, cel shading, watercolor, colored background, grey background, black background,
night scene, starfield background, glow diffusion, bloom, halo, scene, water surface, sea, reflection,
text, letters, numbers, watermark, signature, logo, multiple views, three views,
cropped, out of frame, ground shadow, thick lines, uneven line weight, broken lines, open contours,
mushy, blurry, lowres, photorealistic, photo, 3d render, chibi
```

> ⚠ **发光要"用线画"不要"用光画"**：基准图是重发光渲染（见 §二），直接叮嘱模型"发光"它会甩出
> 一团辉光，取 alpha 就是一片糊。所以负面词里压死了 `辉光/光晕/发光扩散`，
> 发光感靠 **双色双层描边 + 环绕的小圆点与短弧** 表示。

---

## 二、配色基准（基准图实测）

`node tools/palette.js <图> 14` + 只统计不透明像素的直方图，两组数都列在下面。

**第一组：底色结构**

| 项 | 实测 | 含义 |
|---|---|---|
| 完全透明 | 42.6% | 裁剪后画布，人物之外的留白 |
| 完全不透明 | 21.0% | 实体：面部、薄纱、飘带主干 |
| 半透明 | 36.4% | **发光边缘极软** —— 这就是"必须线稿化、不能取 alpha"的原因 |

**第二组：不透明像素的色相分布**（有彩度判定 `s·v > 0.12`）

| 色系 | 占比 |
|---|---|
| 青 | 35.4% |
| 蓝 | 34.9% |
| 紫 | 0.3% |
| 粉 | 0.3% |
| 金 / 琥珀 | 0.4% |
| 绿 | 1.3% |
| 无彩度（白/灰/黑） | 27.4% |

**结论：不透明像素里 72.6% 有彩度，且青+蓝占 70.3%** —— 这是一张"**发光主导的冷色图**"，
与 `cyrene-graffiti` 那份（只有 11.4% 像素有彩度、灰底双色对冲）是两个极端。
所以本主题的线稿**不能走深色描边**：底色是黑，深线会消失。线要往**浅冷色**走。

**第三组：关键色值（实测，直接用）**

| 色值 | 来源 | 用途 |
|---|---|---|
| `#fbfdfd` / `#e9f9fb` | 薄纱、芭蕾鞋、面纱的最亮部 | 双色描边的**外层浅色**（提亮值） |
| `#90f3fa` | 发光花瓣与光灵的亮芯 | 强调描边（高光段） |
| `#4ec9f5` | 青光段均值（n=54017） | 光灵/水花的**内层芯线** |
| `#88a9d6` / `#86b7da` / `#88a4ca` | 飘带与薄纱暗部 | 内层芯线主色 |
| `#3966bb` / `#5091d5` | 长发星空的亮部 | 星空母题专用 |
| `#152966` / `#132758` | 长发星空主体 | 最深的线（仅小面积，如星空团块的外缘） |
| `#050815` | 画面最深值 | 只作背景参考，线稿里不要用 |
| `#c8b9ca` / `#a897aa` | 薄纱阴影、肤色过渡 | 灰紫中间调（排线用） |
| `#b09fb6` | 眼与唇 | 极少量点缀 |
| `#c0b66a` | 金饰均值 | 金丝类母题的**外层**（内层用 `#9d8f3f`） |
| `#cbc44f` | 亮金（n=470，极少） | 金饰高光段 |

**双色描边的落值建议**

| 层 | 颜色 | 说明 |
|---|---|---|
| 外层（宽） | `#dff4fb` | 冷白青，比薄纱亮部略压暗，避免纯白在黑底上过曝 |
| 内层（细） | `#2f7fc4` | 中蓝压暗；发光类母题（光灵/水花/星）用 `#17b6e0` |
| 金饰槽位 | 外 `#c0b66a` / 内 `#9d8f3f` | 只用在 `acao-heart` 这一路 |
| 星空团块 | 外 `#88a9d6` / 内 `#152966` | 只用在 `doodle` 的星空部分 |

> **顺带量到的眼睛色**（给主题强调色用的，不是本次出图必需）：按 `tools/eye-color.js` 的口径
> 在双眼框（原图 `560,325–700,385`）里取「有色像素」，框内 49% 是青色头发、暖紫子集只有 **65 px**、
> 均值 `#a87b9b`（柔和紫调）。**样本很小，别直接当强调色用** —— 真要定主题色，
> 应当先用 `tools/eye-color.js` 在裁出的头部放大图上重跑（该工具的 `--box` 支持指定虹膜框），
> 再按 `themes/butterfly-line/theme.json` 记录的流程压出日间档（同色相压到 L33%）。

> **线色和主题 CSS 的关系**：两种画法在仓库里并存 ——
> 老主题 `diana` 是「浅色模式 `mask + 纯色填充`，暗色模式**直接铺素材本身**」
> （`themes/diana/skin/theme.css:406` 那一段），暗色下素材自带线色可见；
> 新主题 `butterfly-line` 已经统一成「**两种极性都走蒙版 + token 色**」
> （见 `themes/butterfly-line/theme.json` 的 notes：「两种极性对装饰的画法现在一致」）。
>
> 照哪种做都不影响出图要求：**alpha 干净是硬条件，线色是软条件**。
> 基准 `doodle` 的线芯实测 `#fdd3c4`（暖桃粉——亮色），说明 Diana 那套是按"暗色直接铺"选的亮线；
> 本主题按上表走**浅青蓝**，两种画法都不亏：直接铺时是黑底上发光的线，走蒙版时线色被盖掉但 alpha 照样干净。

---

## 三、槽位对照表（母题全部取自基准图）

| 槽位 | 本主题母题 | 取自基准图的哪一部分 | 出图尺寸 | 着墨目标 | 线宽占画布宽 |
|---|---|---|---|---|---|
| 1 `doodle` | 蝶形光灵 + 发端星空 + 薄纱尖角 | 长发末端的星空带、三只小青蝶、右侧大翅形飘带、裙摆的尖角薄纱层 | **1024×1024** | ~8% | ~0.6% |
| 2 `star` | 四芒星 + 涟漪环 | 胸前那枚大星光、面纱上的小星、足尖水花外的涟漪弧 | 512×512 | ~12% | 相对粗，别细到看不见 |
| 3 `candy-wrapped` | 花瓣光冠 | 头后 4–5 片水滴形发光花瓣 | 512×512 | ~10% | ~2% |
| 4 `candy-lollipop` | 足尖水花 | 足尖踩出的一朵皇冠状水花 + 飞沫 | 512×512 | ~10% | ~2.3% |
| 5 `acao-heart` | 金丝环扣 | 颈环、上臂环、腕上双股细金线、肩→胸的细链、手背四瓣小花饰 | 512×512 | ~5% | ~1% |
| 6 `acao-cheer` | 蝶形光灵（正面展翅） | 手上方那只正对镜头的小青蝶 | 512×512 | ~9% | ~1.4% |
| 7 `corner` | 飘带长弧 | 裙侧向右伸出的 S 形长飘带（末端分叉、渐隐） | **1536×512** | ~0.7%（细弱） | ~0.3% |
| 8 `upper` | 蕾丝波浪 + 珠链 | 头纱的扇贝状蕾丝边，与其上一串小圆珠 | **768×512** | ~1.8% | ~1% |

> 出图尺寸按"成品尺寸的 2~4 倍"给，落位时缩到成品（§五）。`corner`/`upper` 是长条，别出成方形。

---

## 四、逐槽位提示词

### 槽位 1：`doodle` —— 蝶形光灵 + 发端星空 + 薄纱尖角（正方形，侧边大面积）

取自：长发末端的星空带（发尾那一段深蓝 + 星点）+ 三只小青蝶 + 右侧大翅形飘带 + 裙摆尖角薄纱层。
构图要求：**母题从一个中心向外铺开但互相不重叠**，左下角最密、右上角渐稀——它在界面里落在左下角，
上方和右侧会被 UI 压住，所以留白要留在右上。

**中文**
```
一团由线勾勒的装饰团块：中央一只展开四翼的蝶形光灵，轮廓由四条水滴形翅膀组成
（上翼长而尖、下翼短而圆），翅内各加一条沿翅缘走的中线，翅根一个小圆（身体），
头前伸出两根细触须、尾后拖一条极细的尾丝（尾丝末端分叉成两段短弧），
蝶的四周环绕三枚四芒星（两根细长交叉的尖端线段，中心一个小空心圆），
其中一枚较大、另两枚极小，星周围各点三到五枚极小圆点；
蝶的左下方一团"星空"：一条沿弧线走的宽带，带内散布十八到二十四枚小圆点与四芒星
（点的疏密由内向外递减），带宽用两条平行弧线勾出，两端渐隐收细；
团块外缘再补四到六片尖角薄纱片（每片为一个细长的尖角闭合轮廓，内部一条沿边的平行细线），
尖端微微外翘，其中两片末端分叉；
整体带手绘线稿，双色双层描边（外层一条较宽的浅冷色描边，内层套一条较细的深冷色芯线），
无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，线条外缘略带柔边，
纯白背景，居中，大量留白，无人物
```
**English**
```
a decorative line-art cluster: at the center one floating four-winged light butterfly,
its outline made of four teardrop wings (upper pair long and pointed, lower pair short and round),
one midline running along each wing edge, a small circle for the body at the wing root,
two thin antennae in front and one very thin trailing filament behind that forks into two short arcs,
three four-pointed sparkles orbiting the butterfly (two thin crossed tapered strokes with a small hollow circle),
one larger and two tiny, each with three to five tiny dots around it;
to the lower left of the butterfly a "starfield" band: one wide band following a slow arc,
eighteen to twenty-four small dots and tiny sparkles scattered inside it (density falling outward),
the band drawn with two parallel arcs and tapering away at both ends;
four to six pointed sheer-fabric panels along the outer edge
(each a thin pointed closed contour with one parallel inner line along its edge),
tips curling slightly outward, two of them forking at the tip;
hand-drawn line art, two-layer outline (a wider pale cold-tone contour with a thinner deeper cold-tone core line inside it),
no fill, no shading, no gradient, thin uniform line weight, slight hand-drawn wobble, closed contours,
slightly feathered stroke edges, plain white background, centered, lots of empty space, no people
```
**额外负面词**：`人物，人脸，身体，手，头发本体，写实星空照片，银河照片，霓虹光带，part of a person, face, body, hands, actual hair, photo of a galaxy`

---

### 槽位 2：`star` —— 四芒星 + 涟漪环（正方形，标题附近）

取自：胸前那枚白色大星光 + 面纱上的小星 + 足尖水花外侧的涟漪弧。

**中文**
```
单个四芒星，由两根细长、两端收尖的线段交叉构成，交点上一个小空心圆，
四臂根部各加一段短弧（表现发光的余韵），
星的四角外侧各一段同心圆弧（共四段，长度不一，模拟水面涟漪的一段），
周围散点六到八枚极小圆点（近处大、远处小），
手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线），
无填充无明暗无渐变，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
a single four-pointed sparkle made of two thin tapered crossed strokes, a small hollow circle at the crossing,
a short arc at the base of each arm (the remnant of a glow),
one concentric ripple arc outside each of the four corners (four arcs of different lengths, like a fragment of water ripples),
six to eight tiny dots scattered around (larger near, smaller far),
hand-drawn line art, two-layer outline (wider pale cold contour plus a thinner deeper core line),
no fill, no shading, no gradient, thin uniform line weight,
plain white background, centered, lots of empty space
```

---

### 槽位 3：`candy-wrapped` —— 花瓣光冠（正方形）

取自：头后那 5 片水滴形发光花瓣组成的冠。它是一个"向上发散"的形状，正好当小图标。

**中文**
```
五片水滴形花瓣自一个共同的根部向上扇形散开（中间一片最长、两侧依次变短变外倾），
每片为一个闭合的水滴轮廓，内部沿中线加一条细线、并在瓣尖前收细，
根部一个小圆弧（冠座），座下两条极短的水平线，
花瓣间隙各点两到三枚极小圆点（模拟飘散的光尘），
整体带手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线，瓣尖处最亮），
无填充无明暗无渐变，线条纤细均匀，轮廓闭合，纯白背景，居中，大量留白
```
**English**
```
five teardrop petals fanning upward from a single root (the middle one longest, the outer ones shorter and tilted outward),
each petal a closed teardrop contour with one thin line along its midline tapering before the tip,
a small arc at the root (the crown seat) with two very short horizontal lines under it,
two or three tiny dots in each gap between petals (drifting motes of light),
hand-drawn line art, two-layer outline (wider pale cold contour plus a thinner deeper core line, brightest at the tips),
no fill, no shading, no gradient, thin uniform line weight, closed contours,
plain white background, centered, lots of empty space
```

---

### 槽位 4：`candy-lollipop` —— 足尖水花（正方形）

取自：足尖踩出的一朵皇冠状水花 + 四周飞沫。它的形状天生是"下窄上散"，和 `candy-lollipop` 的槽位形状合得上。

**中文**
```
一朵自下向上炸开的皇冠状水花：底部一个窄口（两条向内收的短弧），
向上散开成七到九条粗细不均的水舌（每条为一个细长的尖角闭合轮廓，尖端分叉成一两段短弧），
水舌之间补三到五条更短的、只剩尖端的水丝（断开的小弧，不连到底部），
底部两侧各一段同心圆弧（涟漪），
四周散布十四到十八枚大小不一的飞沫（空心小圆与短弧，近处大、远处小、越远越稀疏），
手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线），
无填充无明暗无渐变，线条纤细均匀，轮廓闭合，纯白背景，居中，大量留白
```
**English**
```
a crown-shaped splash bursting upward from a narrow base (two short arcs curving inward at the bottom),
spreading into seven to nine water tongues of uneven width
(each a thin pointed closed contour whose tip forks into one or two short arcs),
three to five shorter broken threads between them (isolated arcs not reaching the base),
one concentric ripple arc on each side of the base,
fourteen to eighteen droplets of varying size around it (hollow dots and short arcs, larger near, sparser far),
hand-drawn line art, two-layer outline (wider pale cold contour plus a thinner deeper core line),
no fill, no shading, no gradient, thin uniform line weight, closed contours,
plain white background, centered, lots of empty space
```

---

### 槽位 5：`acao-heart` —— 金丝环扣（正方形）

取自：颈环、上臂环、腕上那两股细金线、肩到胸的细链，以及手背上的四瓣小花饰。
这是唯一走**金色**双色描边的槽位（外 `#c0b66a` / 内 `#9d8f3f`）。

**中文**
```
一枚由细线构成的环扣饰物：中央一个大圆环（双股线并排画，表现细金线），
环上一点挂两枚小圆环（互相套住，用两段交叠的弧线表示相扣），
左侧引出两段线：一段是波浪状细链（连续十二到十六个小圆弧首尾相接），
一段是两条平行的直线、末端各收成一个极小的圆点，
右下方垂一枚四瓣小花（四片圆瓣轮廓、中央一个小圆），花下再垂三条极短的细线（流苏），
环的内侧点四到六枚极小圆点，
手绘线稿，双色双层描边（外层较宽浅金色 + 内层较细深金色芯线），
无填充无明暗无渐变，线条纤细均匀，轮廓闭合，纯白背景，居中，大量留白
```
**English**
```
a fine-wire ring ornament: one large circle at the center drawn as two parallel strands (thin gold wire),
two small rings hanging from one point of it, interlocking (two overlapping arcs),
two strands leaving on the left: one a wavy fine chain (twelve to sixteen small arcs linked end to end),
one a pair of parallel straight lines each ending in a tiny dot,
a four-petal blossom hanging at the lower right (four round petals with a small center circle)
with three very short threads below it (tassels), and four to six tiny dots inside the big ring,
hand-drawn line art, two-layer outline (wider pale gold contour plus a thinner deeper gold core line),
no fill, no shading, no gradient, thin uniform line weight, closed contours,
plain white background, centered, lots of empty space
```

---

### 槽位 6：`acao-cheer` —— 蝶形光灵 · 正面展翅（正方形）

取自：手上方那只正对镜头的小青蝶。这一槽位在界面里是"情绪位"，所以要**正面、对称、张开**。

**中文**
```
一只正面朝前、四翼完全张开的蝶形光灵，左右严格对称：
两对翅膀（上翼大而尖，外缘一段内凹的弧；下翼小而圆，边缘一条浅波浪），
每片翅内沿翅缘一条平行的细线、翅根一小段放射短线（三道），
中央一条细长的身体（上下端各收成一点，身体上点三枚小圆点），
头前两根细触须向外卷成小弧，两侧各一枚极小的四芒星，
翅的外缘外侧各点两到三枚极小圆点，
手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线，翅缘最亮），
无填充无明暗无渐变，线条纤细均匀，轮廓闭合，纯白背景，居中，大量留白
```
**English**
```
a light butterfly seen from the front with all four wings fully spread, strictly left-right symmetric:
two wing pairs (upper pair large and pointed with one concave arc on the outer edge,
lower pair small and round with a shallow wave along the edge),
one parallel line along the edge inside each wing and three short radiating strokes at the wing root,
a slender body in the middle (tapered to a point at both ends with three small dots on it),
two thin antennae curling outward in small arcs in front, one tiny four-pointed sparkle on each side,
two or three tiny dots outside each wing edge,
hand-drawn line art, two-layer outline (wider pale cold contour plus a thinner deeper core line, brightest along the wing edges),
no fill, no shading, no gradient, thin uniform line weight, closed contours,
plain white background, centered, lots of empty space
```

---

### 槽位 7：`corner` —— 飘带长弧（**横长条 3:1**）

取自：裙侧向右伸出的 S 形长飘带，末端分叉、渐隐。
这个槽位基准实测**着墨只有 0.72%、线宽只占画布宽 0.31%**——它是"几乎看不见的一条细痕"，别画满。

**中文**
```
横长构图装饰线稿：一条自左下向右上缓慢起伏的 S 形长弧（宽度基本恒定，两端渐隐收细到消失），
弧线的中段折出一处轻微的分叉（分成两条平行细线，走一小段后再合回），
弧线外侧贴两到三条更短的平行细弧（只走三分之一长度，两端收尖），
中段下方挑出一小簇：一枚四芒星与三到五枚小圆点（总占比极小），
其余八成画面留白，
手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线），
无填充无明暗无渐变，线条纤细，轮廓闭合，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art: one long S-curve drifting from lower-left to upper-right
(roughly constant width, tapering away to nothing at both ends),
one soft fork in its middle section (splitting into two parallel thin lines that rejoin after a short run),
two or three shorter parallel hairlines hugging its outside (running a third of its length, tapered at both ends),
a small cluster branching below the middle: one four-pointed sparkle with three to five small dots,
the remaining eighty percent of the canvas empty,
hand-drawn line art, two-layer outline (wider pale cold contour plus a thinner deeper core line),
no fill, no shading, no gradient, thin line weight, closed contours,
plain white background, lots of empty space, no text
```

---

### 槽位 8：`upper` —— 蕾丝波浪 + 珠链（横长条，1.5:1）

取自：头纱的扇贝状蕾丝边 + 边上那串小圆珠。它落在界面右上，是"顶边蕾丝"的角色，越往两端越淡。

**中文**
```
横长构图装饰线稿：一条连续重复的扇贝波浪（十到十二个半圆齿，齿峰间距均匀、
从左到右齿高渐收、到两端渐隐收细到消失），
波浪每个齿谷内侧点一枚小圆点（模拟珠链），
波浪上方隔一个小间距走一条更细的短弧线（只覆盖中间三分之二，两端渐隐），
波浪下方每两齿之间垂一枚极短的细线（三到四条即可），
其余留白，
手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线），
无填充无明暗无渐变，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art: one continuously repeated scalloped wave
(ten to twelve semicircular scallops with even crest spacing, crest height tapering from left to right,
fading out to nothing at both ends),
one small dot inside each valley of the wave (a bead chain),
a thinner short arc floating above the wave (covering the middle two thirds only, fading at both ends),
one very short thread hanging below every other scallop (three or four of them),
the rest of the canvas empty,
hand-drawn line art, two-layer outline (wider pale cold contour plus a thinner deeper core line),
no fill, no shading, no gradient, thin uniform line weight,
plain white background, lots of empty space, no text
```

---

### 附：母题拼版（可选，用来一次挑齐母题）

8 个槽位挨个出图很慢，可以先用一条"拼版"提示词把母题摆齐，挑中了再逐槽位重出（重出时才用上面的精细描述）。

**中文**
```
一张九宫格排布的线稿素材拼版，白底，每格一个独立的装饰母题，格与格之间留白清晰不重叠：
第一格：展开四翼的蝶形光灵（侧视，带尾丝）；第二格：正面展翅的蝶形光灵；
第三格：四芒星与涟漪弧；第四格：五片水滴形花瓣组成的光冠；
第五格：向上炸开的皇冠状水花与飞沫；第六格：细金线构成的环扣坠链与小四瓣花；
第七格：一条 S 形长飘带（两端渐隐）；第八格：一段扇贝蕾丝波浪与一串小圆珠；
所有线条为手绘线稿，双色双层描边（外层较宽浅冷色 + 内层较细深冷色芯线），
无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
纯白背景，大量留白，无文字，无人物
```
**English**
```
a nine-grid sheet of line-art motifs on white, one independent decorative motif per cell,
clear empty gaps between cells, no overlap:
cell 1 four-winged light butterfly in side view with a trailing filament; cell 2 the same butterfly from the front, wings spread;
cell 3 a four-pointed sparkle with ripple arcs; cell 4 a crown of five teardrop petals;
cell 5 a crown-shaped splash with droplets; cell 6 a fine-wire ring ornament with a chain and a small four-petal blossom;
cell 7 one long S-shaped ribbon tapering at both ends; cell 8 one scalloped lace wave with a bead chain;
all strokes hand-drawn line art with a two-layer outline
(wider pale cold contour plus a thinner deeper core line inside),
no fill, no shading, no gradient, thin uniform line weight, slight hand-drawn wobble, closed contours,
plain white background, lots of empty space, no text, no people
```
**额外负面词**：`格子线，分割线，边框，网格线，文字标注，grid lines, dividers, frames, labels`

---

## 五、参数与落位

| 参数 | 值 | 说明 |
|---|---|---|
| 输入预处理 | 从基准图裁出母题所在局部（如头纱、足尖水花、光灵）当 img2img 参考 | 参考图只用来"定母题形状"，出图必须是线稿 |
| 输出尺寸 | `doodle` 1024×1024；四个小图标 512×512；`corner` 1536×512；`upper` 768×512 | 长条槽位别出方形（会被拉伸） |
| 重绘强度 | **0.6–0.8** | 低于 0.5 会把渲染图的发光扩散、肤色渐变一起学走 |
| CFG Scale | **4–6** | 线稿是低信息量输出，CFG 高了会硬塞细节、线变毛 |
| 采样器 | DPM++ 2M Karras / Euler a，24–32 步 | 线稿不需要太多步数 |
| 一致性 | 固定 checkpoint + seed，8 个槽位同一模型同一 seed 区间 | 否则线宽线色会飘 |

**平台写法**

| 平台 | 关键点 |
|---|---|
| NijiJourney / Midjourney | `line art` 加权；`--ar 1:1`（图标）/ `--ar 3:1`（corner）/ `--ar 3:2`（upper）；`--style raw`；**不要加 `glow`/`neon`** |
| NovelAI | `lineart` 作主 tag，权重 `{{lineart}}`；img2img 强度 0.65–0.8 |
| WebUI / ComfyUI / Liblib | 用 ControlNet `lineart` / `softedge` 锁母题轮廓；`--no` 里务必压 `bloom, glow` |
| 即梦 / 通义万相 / 可灵 | 中文提示词直接可用；这类平台默认爱加辉光与描边填充，负面词里的"无填充、辉光、光晕、彩色背景"删不得 |

**从线稿到素材**

1. 出图是白底线稿 → `node tools/key-lineart.js <生成图> <输出.png>` 取 alpha（**不要**用
   `tools/extract-art.js`：它会保留每条闭合轮廓内部的白色，线稿会变成一片白色块）
2. 生成器若直接给透明底，跳过第 1 步
3. 缩到成品尺寸（§一 的"画布"列 → 对齐 `themes/diana/assets/` 那套：
   `doodle 1267×1241`、`star/candy-* 256×256`、`acao-* 512×512`、`corner 1600×485`、`upper 490×315`）
4. 落到 `themes/<新主题>/assets/`，命名沿用 `doodle.png` / `star.png` / `candy-wrapped.png` /
   `candy-lollipop.png` / `acao-heart.png` / `acao-cheer.png` / `corner.png` / `upper.png`
   （槽位名是 Diana 契约表的固定名，见 `themes/diana/skin/zcode-artwork-contract.css`；
   新主题若改名，这套素材要同步改 `--diana-zcode-image-*` 变量）
5. **角色槽位不用出图** —— 守岸人的立绘是**动态立绘**，直接由 4K 帧序列生成，见下方"动态立绘"一节。

**动态立绘（2026-09-21 定，取代原来的"缩到 1MB 内联"）**

原本的做法是把 4K PNG 缩到高度 1440 再内联成 data URI。实测下来这条路走不通：既要**不裁**
（飘带与光蝶在画布边缘）、又要**不缩**（用户要求画质保持 4K），内联就必然撑爆单条 CSS 声明、
被静默丢弃。所以立绘改成**文件交付 + `<video>` 播放**：

| 项 | 做法 |
|---|---|
| 素材 | `assets/character-motion.webm`：36 帧 → **VP9 + alpha**，**原生分辨率 2876×2270**（与源帧 1:1，不重采样），12fps，CRF 20，约 3.9MB |
| 裁剪 | **只裁掉四周全透明的空白**：全部 36 帧的**并集**内容框 `2876×2270 @(1174,835)`，四边留 8px。并集保证每帧的飘带都在框内；逐帧自适应会让动画抖 |
| 交付 | `theme.json` 的 `assets.characterMotion` 声明它，注入器给页面一个 **`file://` URL**（不内联），运行时把它挂成 `<video muted loop autoplay playsinline object-fit:contain>` |
| 兜底 | `characterDark` / `characterLight` 指向同构图的静止帧 `assets/character-still.png`（800 宽）：面板中央立绘用它，页面里视频加载失败时它作为 CSS 背景补上 |
| 打包 | `.webm` 必须解包：`package.json` 的 `asarUnpack` 里有 `themes/*/assets/*.webm`（页面读不了 asar 虚拟文件系统） |
| 生成 | `node tools/build-theme-shorekeeper.js` 一条命令重出（帧目录可用 `SHOREKEEPER_FRAMES` 覆盖）；换姿态、改分辨率、调 CRF 都在那个脚本的常量里 |

两个**踩过的判断陷阱**（它们都让人误以为"alpha 丢了"）：
- `ffprobe` 对带 alpha 的 VP9 报 `pix_fmt=yuv420p` —— alpha 存在**独立的第二条流**里，不是那个字段；
- 把 webm 用 ffmpeg 回解成 PNG 再量 alpha 也不准（要额外开关），**playwright/Chromium 才是准的**：
  在页面里把视频叠在品红底上抓一张图，底色透出来就说明 alpha 正常（`.verify/alpha-probe` 的做法）。

**清单与命名**：新主题复制 `themes/butterfly-line/` 的目录结构，在 `theme.json` 的 `assets` 里按角色名挂素材
（角色名是硬约定，运行时据此生成 `--diana-zcode-image-<role>`）：

| `theme.json` 角色名 | 文件名 | 来源 |
|---|---|---|
| `characterMotion` | `assets/character-motion.webm` | 36 帧 VP9+alpha（动态立绘本体，**file:// 交付**） |
| `characterDark` / `characterLight` | `assets/character-still.png` | 同构图静止帧（面板立绘 + 页面兜底） |
| `doodle` | `assets/doodle.png` | 槽位 1 线稿 |
| `star` | `assets/star.png` | 槽位 2 |
| `candyWrapped` | `assets/candy-wrapped.png` | 槽位 3 |
| `candyLollipop` | `assets/candy-lollipop.png` | 槽位 4 |
| `acaoHeart` | `assets/acao-heart.png` | 槽位 5 |
| `acaoCheer` | `assets/acao-cheer.png` | 槽位 6 |
| `corner` | `assets/corner.png` | 槽位 7 |
| `upper` | `assets/upper.png` | 槽位 8 |

**线色怎么落**：双层描边外层 `#dff4fb`、内层 `#2f7fc4`（发光类母题内层换 `#17b6e0`，金饰槽位换 `#c0b66a`/`#9d8f3f`）。
更省事的做法是**出图只求"浅色线、双线结构、alpha 干净"**，最终线色交给主题 CSS 的
`--diana-zcode-line-*`（暗色模式改这三个变量即可，不必重出图）。

---

## 六、出图后自检

逐张跑：

```bash
node tools/ink-metrics.js <出图目录>/*.png
```

对照 §一 / §三 的基准值，判据：

1. **着墨比例**落在目标值 ±30% 内（`doodle` 6–10%、小图标 8–14%、`corner` 0.5–1%、`upper` 1.2–2.5%）。
   超上限说明模型加了排线或填充；低于下限说明线太细、缩到成品会断。
2. **实心块**接近 0（基准 `doodle` 0.91%、`acao-heart` 0.04%）。`star` 那张 10.65% 是特例
   （四芒星的交叉处本来就实）。**小图标突然出现 >5% 的实心块就是被填充了，重出。**
3. **线宽中位**占画布宽的比例对得上（`doodle` ~0.6%、小图标 1–2.4%、长条 0.3–1%）。
   同一套里线宽跳变 >2 倍就重出。
4. **双色双层**：放大看每条线应是"外浅内深"两层，不是一根单线（单线在暗色模式下发死）。
5. **无明暗**：不能有阴影块、渐变、高光斑。**发光扩散最容易被带进来**——线外侧一圈模糊的亮边就是失败。
6. **无文字**：金饰与珠链容易被模型加上字母或数字，逐张放大看。
7. **轮廓闭合**：断线会让浅色模式的蒙版边缘发毛。
8. **背景干净**：纯白或透明；出现灰底、星云底、夜色底就重出（这是本角色最容易犯的，
   因为基准图是黑底发光——模型会连着背景一起学）。
9. **长宽比**：`corner` 3:1、`upper` 1.5:1，别出成方形。
