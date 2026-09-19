# 霓虹涂鸦 · 主题素材提示词（**手稿线稿版**，中英双版）

基准图：`Dream-Work-Theme/themes/cyrene-video/hero.jpg`（1920×1080，水泥墙 + 蓝粉涂鸦 + 粉发少女）
用途：给 painting-skin-theme 的 Diana 格式主题生成 ①角色线稿 ②装饰涂鸦线稿
风格基准：`themes/diana/assets/diana-doodle-v2.png`（Diana 的涂鸦素材，1267×1241）
配色基准：本图实测（见下）

> **为什么是线稿风**：Diana 那套浅色模式是「alpha 蒙版 + 纯色填充」画法，前提是**素材本身是线稿**
> ——取 alpha 得到干净的单色线条画。用渲染图当素材时，取 alpha 只剩外轮廓，浅色下会糊成实心色块。
> 基准图是渲染图，所以它的作用是**定角色设计 / 定配色 / 定涂鸦母题**，出图必须转成线稿。
>
> **涂鸦元素全部取自基准图**：涂鸦喷溅轮廓与其内部回旋线、四芒星闪光、颜料飞沫、
> 墙面蓝色晶簇、混凝土块缝与铆钉、心形（衣印与腿环）、抽绳蝴蝶结、短裤荷叶边。

> ⚠ **基准图没有拍到脚**（画面在大腿中部就裁掉了：小腿、脚、鞋都不可见）。
> 因此本文件的角色提示词按"**全身**"写，缺的那部分按设定补全并在 3.1 里单列，
> 生成时要么接受模型自行补腿，要么先用参考图 + 姿态骨架把下半身补出来再走线稿。

---

## 一、风格规范（线稿基准 = Diana 涂鸦素材，与 cosmic-glass 那份同一套）

| 特征 | 实测 | 生成时的对应写法 |
|---|---|---|
| **着墨比例** | 8.57%（极稀疏） | `sparse line art` / `outline only` / `no fill` |
| **边缘** | 仅 58% 着墨像素完全不透明，42% 半透明 | `soft pencil edges` / `slightly feathered strokes` |
| **线宽** | 横向连续段均值 10.7px / 画布宽 1267 ≈ **0.85% 画布宽** | `thin uniform line weight` |
| **笔触** | 手绘抖动、有轻度排线（蝴蝶结处短排线） | `hand-drawn wobble` / `light hatching on shadow sides` |
| **填充** | 无填充、无明暗、无渐变 | 负面词里明确排除 |

### 线色怎么定

| 用途 | 色值 | 说明 |
|---|---|---|
| **主描边** | `#c2437f`（玫粉） | 从头发/涂鸦粉的亮部 `#e08bb1` 压暗而来，浅底上清楚又不艳 |
| **强调描边** | `#3f7fd0`（涂鸦蓝） | 来自涂鸦与墙面晶簇的蓝 `#87c1eb` 压暗，只用在星芒、晶簇、飞沫上 |
| **重色构件** | `#6b5a70`（灰紫） | 水泥块缝、铆钉这类"重块"，避免纯黑压死画面 |
| 复刻 Diana 桃粉 | `#fcccbc` | 想贴 Diana 观感时把上面三处换成这个值 |

> 生成器很难精确控制线色，**最终颜色交给主题 CSS**：线稿只要 alpha 干净，
> 浅色模式下 `mask + 纯色填充` 会用主题色重画一遍，比让模型调准颜色可靠得多。

### 通用风格块（每条提示词都带上）

**中文**
```
手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，
轮廓闭合，轻排线仅用于暗部边缘，纯白背景，居中，大量留白
```
**English**
```
hand-drawn line art, single-color outline, no fill / no shading / no gradient,
thin uniform line weight, slight hand-drawn wobble, closed contours,
light hatching on shadow sides only, plain white background, centered, lots of empty space
```

---

## 二、配色基准（本图实测）

**先看一个总体结论**：全图**只有 11.4% 的像素有彩度**——大面积是低饱和的水泥灰与白衣。
有彩度像素里，蓝/青占 **49.2%**、粉/品红占 **41.4%**、紫占 **7.5%**、金琥珀不足 0.4%。
所以这套主题的观感是「**灰底 + 两色对冲（粉 / 蓝）**」，紫色和金色只是点缀。

| 色值 | 画面来源 | 用途 |
|---|---|---|
| `#e08bb1` | 头发亮部（粉的"本色"） | 主题主强调色 |
| `#c27399` | 粉/品红全段均值（含暗部） | 主色的暗调 |
| `#71061e` | 头发与涂鸦粉的最深暗部 | 主色的最深档（线稿里用 `#c2437f` 代替） |
| `#87c1eb` | 涂鸦与墙面晶簇亮部（蓝的本色） | 次强调色 |
| `#6d9bcc` | 蓝/青全段均值 | 次强调色的暗调 |
| `#00256f` | 涂鸦最深描边蓝 | 次强调的最深档（线稿里用 `#3f7fd0`） |
| `#b68dda` | 短裤亮部（薰衣草紫） | 第三色（少量） |
| `#8b66a3` | 短裤均值 | 第三色暗调 |
| `#f5f4f4` | 上衣白 | 画面最亮值（线稿背景用纯白，不用它） |
| `#d58eaa` | 上衣心形印花 | 印花色参考（**出图不要文字**） |
| `#a7acb3` / `#caced0` / `#8e929d` | 水泥墙面（中/亮/暗） | 主题画布色阶参考 |
| `#c7947e` | 金/琥珀段均值（心形腿环 + 肤色暖调） | 极少量点缀 |

---

## 三、角色线稿（**全身**）

### 3.1 前提：参考图缺下半身，先决定怎么补

| 项 | 情况 | 处理 |
|---|---|---|
| 画面裁切 | 图中人物从头顶到大腿中部，**小腿、脚、鞋不可见** | 见下方"补全设定"，或先用参考图 + 姿态骨架补出下半身 |
| 单人选裁切 | 人物约在 `x 420–1400, y 0–1080`（原图 1920×1080 坐标） | 左侧涂鸦与右侧墙面会一起进去，负面词里排除背景 |
| 输出 | **832×1216**（竖构图，七头身） | 别用正方形画立绘 |
| 补全设定（参考图未拍到，可改） | 白色帆布鞋 + 白色短袜，鞋面两条横向鞋带与鞋头包边；另一条腿保持裸腿 | 街头风与运动短裤最搭；想换成厚底凉鞋/黑短靴只需替换这句 |

### 3.2 中文 Positive（全身）

```
一名少女，独自一人，全身站姿，正面偏侧，全身线稿，垂直构图，约七头身修长比例，
手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
及膝超长粉色长发（发丝用成组平行长线分层，发梢自然散开并微微外卷），
额前碎发与两侧长刘海，头顶右侧两枚小翼状发夹（勾出两片尖角轮廓，
内部各加一条中线），
玫红色眼眸（只勾轮廓与瞳孔，不涂色），上挑眼型，细长睫毛，嘴角上扬的自信微笑，
白色露肩短袖T恤，细边圆领（领口一条平行细线），右肩自然露肩，
胸前一枚心形印花（只勾心形轮廓与内部一条弧线，**不画任何文字**），
衣摆在腰侧打一个结（结瓣用两条闭合弧线，两条衣角向下垂并勾出末端折角），
露出腰腹（肚脐用小短线表示），
一只手臂抬起撩发（手肘抬起，上臂一枚细环饰——勾一个窄矩形，腕上一圈宽护腕，
护腕用两条平行线表示缠绕），
另一只手臂自然下垂（手自然张开，五指各用两条短线勾出），
淡紫色运动短裤（腰部一条水平抽绳，中央打一个小蝴蝶结并垂下两条绳尾；
两侧各一道开衩，衩口用两条短斜线；裤脚一圈连续波浪短弧线表现荷叶边；
裤面点两三个极小的心形），
左腿大腿一圈心形金属腿环（勾一条环带与中央心形轮廓），
小腿与脚：白色短袜（袜口一条水平线）与白色帆布鞋（鞋面两条横向鞋带、鞋头一条包边弧线，
鞋底一条长横线），
轻排线仅用于暗部边缘，纯白背景，居中，大量留白
```

### 3.3 中文 Negative（全身）

```
填充，涂色，明暗，阴影块，渐变，高光块，厚涂，赛璐璐上色，水彩，
彩色背景，灰色背景，水泥墙，涂鸦墙，喷漆，复杂背景，场景，街景，
涂鸦文字，印花文字，字母，英文，数字，水印，签名，logo，
第二个人，多人，同角色重复出现，多个视角，三视图，
被裁切，出画，半身，只有上半身，脚被裁掉，地面投影，
粗线条，线宽不匀，断线，轮廓不闭合，模糊，低分辨率，
写实，照片，3D渲染，Q版，幼态，畸形手，多余手指，多余肢体
```

### 3.4 English Positive（full body）

```
1girl, solo, full body, standing, three-quarter view, full-length line art, vertical composition, 7 heads tall,
hand-drawn line art, single-color outline, no fill, no shading, no gradient,
thin uniform line weight, slight hand-drawn wobble, closed contours,
knee-length very long pink hair (strands rendered as grouped parallel long strokes,
tips spreading naturally with a slight outward curl), choppy bangs and long side locks,
two small wing-shaped hair clips on the right side of her head (two tapered shapes with a center line each),
rose-red eyes (outline and pupil only, uncolored), upturned eye shape, long thin lashes, confident smirk,
white off-shoulder short-sleeve t-shirt, thin-rimmed round collar (one parallel thin line), one shoulder slipped bare,
a heart-shaped print on the chest (heart outline plus one inner arc only, no lettering at all),
the hem knotted at the side of her waist (two closed arcs for the knot, two hem tails hanging with folded tips),
bare midriff (navel as a short stroke),
one arm raised to touch her hair (elbow up, a thin ring ornament on the upper arm as a narrow rectangle,
a wide wristband with two parallel wrap lines),
the other arm hanging naturally (hand relaxed and open, each finger as two short strokes),
lavender sport shorts (horizontal drawstring at the waist, a small bow at the center with two hanging cord tails,
a side slit on each leg with two short diagonal strokes, a continuous wave of short arcs as ruffle trim along the hem,
two or three tiny hearts printed on the shorts),
a heart-shaped metal garter band around one thigh (band plus a heart at the center),
lower legs and feet: white ankle socks (one horizontal band at the cuff) and white canvas sneakers
(two horizontal lace lines, one toe-cap arc, one long sole line),
light hatching on shadow sides only, plain white background, centered, lots of empty space
```

### 3.5 English Negative（full body）

```
fill, coloring, shading, shadow blocks, gradient, specular highlights, thick paint,
cel shading, watercolor, colored background, grey background, concrete wall, graffiti wall, spray paint,
complex background, scenery, street scene,
graffiti text, printed lettering, letters, words, numbers, watermark, signature, logo,
second person, multiple girls, same character repeated, multiple views, three views,
cropped, out of frame, half body, upper body only, feet cut off, ground shadow,
thick lines, uneven line weight, broken lines, open contours, blurry, lowres,
photorealistic, photo, 3d render, chibi, child-like, bad hands, extra fingers, extra limbs
```

---

## 四、装饰涂鸦（按主题槽位，全部线稿风）

每个槽位都注明**取自画面的哪一部分**，保证"涂鸦元素从图片中提取"。

### 槽位 1：涂鸦主图（对应 `doodle`，侧边大面积）

取自：墙上那团蓝粉涂鸦喷溅 —— 白色外轮廓 + 内部回旋线 + 中央四芒星 + 四周飞沫。

**中文**
```
一团自右下向左上蔓延的涂鸦喷溅线稿，手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，
外轮廓为一条连续起伏、带三四处尖角的闭合曲线（模拟喷漆边界的溢出感），
内部填充六到八条互不相交的回旋曲线（大圈套小圈，末端收细），
中央一枚四芒星（两根细长交叉线段，中心加小圈），
轮廓四周散布十到十四枚大小不一的飞沫圆点与短弧（近处大、远处小），
轮廓外侧再补一条断开的外描边（短弧分段，只在尖角处相连），
纯白背景，大量留白，无人物，无文字
```
**English**
```
a graffiti splash line-art mass spreading from lower-right to upper-left,
hand-drawn line art, single-color outline, no fill, no shading, no gradient, thin uniform line weight,
outer contour is one continuous undulating closed curve with three or four sharp points (spray-paint overflow),
inside, six to eight non-crossing swirling curves (large loops around small ones, tapering ends),
a four-pointed sparkle at the center (two thin crossed tapered strokes with a small circle),
ten to fourteen droplets and short arcs of varying size scattered around the contour (larger near, smaller far),
a broken outer outline outside the contour (short arc segments joining only at the sharp points),
plain white background, lots of empty space, no people, no text
```

### 槽位 2：四芒星闪光（对应 `star`）

取自：涂鸦中央那枚白色空心四芒星。

**中文**
```
单个四芒星，由两根细长尖端交叉的线段构成，中心一个小空心圆，
四臂根部各加一段短弧（表现"发光"的余韵），
周围点三枚极小圆点，
手绘线稿，单色描边，无填充，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single four-pointed sparkle made of two thin tapered crossed strokes, a small hollow circle at the crossing,
a short arc at the base of each arm (suggesting a glow remnant), three tiny dots around it,
hand-drawn line art, single-color outline, no fill, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 3：心形印（对应 `candy-wrapped`）

取自：上衣胸前的心形印花 + 大腿上的心形金属腿环。

**中文**
```
单个心形，外轮廓一条闭合曲线，内部一条短弧线（模拟印花的层次，不写任何文字），
心形右上角再叠一枚极小的实心心（只勾轮廓），
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single heart shape, one closed outer curve, one short inner arc (suggesting the print layers, no lettering at all),
a tiny second heart outlined at the upper right, overlapping slightly,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 4：抽绳蝴蝶结（对应 `candy-lollipop`）

取自：运动短裤腰前的抽绳蝴蝶结（两条绳尾垂下）。

**中文**
```
单个抽绳蝴蝶结，左右两片结瓣各为一条闭合弧线，中央一个小结，
两条绳尾向下垂落并交叉一次，末端各加一个小圆点（绳头结），
轻排线仅用在结心处，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single drawstring bow, two closed arcs for the loops, a small knot at the center,
two cord tails hanging down and crossing once, each ending in a tiny dot (aglet knot),
light hatching only at the knot,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 5：墙面晶簇（对应 `acao-heart`）

取自：右侧墙面那枚蓝色放射状晶簇（尖刺 + 圆点）。

**中文**
```
单个放射状晶簇，由十二到十四条长短交替的尖刺自中心向外放射（每条为细长菱形轮廓），
中心一个小圆，外侧散落五六枚极小圆点，
两三条尖刺末端各加一小段折线（表现棱面），
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single radiating crystal cluster, twelve to fourteen alternating long and short spikes radiating from the center
(each a thin elongated diamond outline), a small circle at the center, five or six tiny dots scattered outside,
two or three spikes tipped with a short fold line (showing a facet),
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 6：混凝土构件（对应 `acao-cheer`）

取自：水泥墙的砌块分缝与圆形铆钉。

**中文**
```
单个矩形混凝土块，外轮廓为带轻微缺角的矩形，
表面一条竖向分缝与一条横向分缝（分缝为两条平行的短线，表示缝宽），
右上与左下各一枚圆形铆钉（圆内加一个小圆表示凹陷），
右下角一条短弧（模拟边缘崩口），
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single rectangular concrete block, slightly chipped rectangular outline,
one vertical and one horizontal seam across the surface (two parallel short lines each to show seam width),
a round rivet at the upper right and another at the lower left (a circle with a small inner circle for the recess),
a short arc at the lower-right corner (chipped edge),
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 7：角线（对应 `corner`，横长条）

取自：涂鸦喷溅的边角 + 飞沫。

**中文**
```
横长构图装饰线稿，主体为一条连续起伏的喷溅轮廓（只取其中一段，两端渐隐收细），
沿轮廓内侧走两三条回旋短曲线，轮廓外侧散布六到八枚飞沫圆点与短弧，
轮廓的一处尖角折断成一小段独立短弧，
手绘线稿，单色描边，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art: one segment of a continuous undulating splash contour, tapering out at both ends,
two or three short swirling curves along its inner side, six to eight droplets and short arcs outside,
one sharp point broken into a separate short arc,
hand-drawn line art, single-color outline, thin uniform line weight,
plain white background, lots of empty space, no text
```

### 槽位 8：上缘线（对应 `upper`，横长条）

取自：短裤裤脚的荷叶边 + 腰带抽绳。

**中文**
```
横长构图装饰线稿，主体为两条近乎平行、缓慢发散的长弧线，
下侧一条为连续波浪短弧（模拟荷叶边，弧峰间距均匀、波幅渐收），
上侧一条为细长直线，其间点缀三四处小绳结（两条短线交叉）与极小圆点，
两端渐隐收细，
手绘线稿，单色描边，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art: two near-parallel slowly diverging long arcs,
the lower one a continuous wave of short arcs (ruffle trim, even crest spacing, amplitude tapering),
the upper one a thin straight line, with three or four small knots (two crossed short strokes) and tiny dots between them,
tapering out at both ends,
hand-drawn line art, single-color outline, thin uniform line weight,
plain white background, lots of empty space, no text
```

---

## 五、参数（线稿与渲染图的取法不同）

| 参数 | 值 | 说明 |
|---|---|---|
| 输入预处理 | 按 3.1 裁出单人；**下半身要先补全** | 参考图没拍到脚，直接图生图会连"裁切"一起学走 |
| 输出尺寸 | 角色 **832×1216**；涂鸦 1024×1024；`corner`/`upper` 用长条比例（如 1536×512） | 别用正方形画立绘 |
| 重绘强度 | **0.6–0.8** | 线稿要"重画"才能去掉渲染质感；低于 0.5 会保留水泥墙纹理 |
| CFG Scale | **4–6** | 线稿是低信息量输出，CFG 高了会硬塞细节、线变毛 |
| 采样器 | DPM++ 2M Karras / Euler a，24–32 步 | 线稿不需要太多步数 |
| 一致性 | 固定 checkpoint + seed，整套素材同一模型 | 否则线宽线色会飘 |

**平台写法**

| 平台 | 关键点 |
|---|---|
| NijiJourney / Midjourney | `--iw 1.2 --ar 2:3 --niji 6 --style raw`；线稿风可给 `line art` 加权。**注意 MJ 的 `--ar 2:3` 会自己补下半身，正好补掉裁切** |
| NovelAI | `lineart` 作主 tag；img2img 强度 0.65–0.8；权重 `{{lineart}}` |
| WebUI / ComfyUI / Liblib | 用 ControlNet `lineart` / `softedge` 锁轮廓 + `openpose` 约束全身姿态（补腿时尤其需要） |
| 即梦 / 通义万相 / 可灵 | 中文提示词直接可用；可灵倾向补色，负面词务必写"无填充、不上色、不要背景与墙面" |

**线色怎么落**：本主题建议 `#c2437f`（玫粉）为主、`#3f7fd0`（涂鸦蓝）点缀、`#6b5a70`（灰紫）用于墙面构件。
更稳的做法是**让线稿保持近乎单一深色，最终线色交给主题 CSS**。

**关于"文字"**：基准图上衣有一串英文字母。**出图必须排除**——线稿素材带文字会随主题缩放变得不可读，
而且主题的 CSS 无法覆盖它。负面词里已写 `印花文字, 字母, 英文, lettering, words`，生成后仍要逐张检查。

---

## 六、出图后自检（线稿版）

1. **无填充**：放大看线条内部必须是背景色，出现色块就是跑偏（最常见的失败）
2. **无明暗**：不能有阴影块、渐变、高光斑；**水泥墙的污渍纹理不能带进来**（这图最容易犯）
3. **无文字**：衣印、墙面、涂鸦里都不能出现字母（基准图三处都有字/涂鸦，务必逐张放大看）
4. **全身完整**：头顶到鞋底都在画面内，脚不能被裁；小腿与鞋按 3.1 的补全设定画
5. **线宽一致**：同一张图里线的粗细不应有明显跳变
6. **轮廓闭合**：断线会让浅色模式的蒙版边缘发毛
7. **着墨比例**：目测接近基准图的 **8–10%**；超过 20% 说明模型加了排线或填充，重出
8. **背景干净**：纯白或透明；有墙面、铆钉、涂鸦底色残留就重出
9. **长宽比**：按槽位出，长条槽位别出成方形（会被拉伸或留大片空白）

**出图后不用做的事**：线稿在纯白底上是常态，不需要抠底；若底带轻微灰，
用 `tools/extract-art.js`（边缘连通 + 厚度检测）跑一遍即可。
需要剪影填充（暗色模式用）时用 `tools/make-silhouette.js` 从线稿反算。
