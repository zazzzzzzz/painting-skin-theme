# 樱色双姝 · 主题素材提示词（**手稿线稿版**，中英双版）

基准图：`Dream-Work-Theme/themes/sakura-codex/hero.jpg`（2560×1600，粉底花瓣 + 双人购物场景）
用途：给 painting-skin-theme 的 Diana 格式主题生成 ①角色线稿 ②装饰涂鸦线稿
风格基准：`themes/diana/assets/diana-doodle-v2.png`（Diana 的涂鸦素材，1267×1241）
配色基准：本图实测（见下）

> **为什么是线稿风**：Diana 那套浅色模式是「alpha 蒙版 + 纯色填充」画法，前提是**素材本身是线稿**
> ——取 alpha 得到干净的单色线条画。用渲染图当素材时，取 alpha 只剩外轮廓，浅色下会糊成实心色块。
> 基准图是渲染图，所以它的作用是**定角色设计 / 定配色 / 定涂鸦母题**，出图必须转成线稿。
>
> **涂鸦元素全部取自基准图**（不是凭空补的）：樱花瓣、麻花辫、纸袋提手、腰带扣、荷叶边、
> 蝴蝶结、麻叶纹、毛边裤脚。每个槽位下面都注明取自画面哪个部分。

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

基准图是高饱和小清新配色（樱粉 + 青柠绿 + 明黄），线稿只用**单色**，建议：

| 用途 | 色值 | 说明 |
|---|---|---|
| **主描边** | `#d94f86`（樱玫） | 从标题品红 `#e65cb2` 压暗而来，浅底上够清楚、又不刺眼 |
| **强调描边** | `#a0e64f`（发梢青柠绿） | 只用在星芒、花瓣缺口这类小构件上 |
| **重色构件** | `#8a5a4a`（暖褐） | 黑发、竹筒一类"重块"用，避免纯黑把画面压死 |
| 复刻 Diana 桃粉 | `#fcccbc` | 想完全贴 Diana 观感时，把上面三处换成这个值 |

> 生成器很难精确控制线色，**最终颜色建议交给主题 CSS**：线稿只要 alpha 干净，
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

## 二、配色基准（本图实测，640×400 采样，Lab 空间 k-means）

| 色值 | 画面来源 | 用途 |
|---|---|---|
| `#faf2f1` | 背景左上大面 | 主题画布近白底 |
| `#f8e3eb` / `#f4c3e8` | 飘落花瓣、背景渐变 | 花瓣槽位的主色 |
| `#e65cb2` | 标题字（品红） | 主题强调色（**不要写进提示词**：出图不许带文字） |
| `#a0e64f` / `#8fba40` | 主角发梢（青柠绿） | 强调线色、副强调 token |
| `#f27674` | 左侧购物袋（珊瑚红） | 暖色强调 |
| `#f8dd58` | 中间购物袋（明黄） | 点缀色 |
| `#f3c2be` / `#faebea` | 右侧角色和服（粉） | 和服粉参考 |
| `#2b2725` / `#352f2d` | 右侧角色黑发、竹筒阴影 | 最深值（线稿里用 `#8a5a4a` 代替纯黑） |
| `#c1a969` / `#dbc551` | 腰带、包扣（金） | 金属构件 |
| `#edc8bb` / `#bf8676` | 肤色、阴影侧 | 肤色参考 |

色相分布：高饱和像素集中在 **310–350°（樱粉→玫红）** 与 **70–90°（青柠绿）**，
金黄 44–50° 少量（购物袋与腰带）。**线稿阶段不必体现这些，交给主题 CSS token 上色。**

---

## 三、角色线稿

### 3.1 前提

基准图是 16:9 双人场景图，两人并排、有购物袋与背景。**先裁出单人**，否则图生图会把另一个人和背景一起保留：

| 目标 | 裁切范围（原图 2560×1600 坐标） | 说明 |
|---|---|---|
| **主立绘**（粉绿麻花辫少女） | `x 780–1820, y 0–1600` | 画面中央，辫子两侧溢出，裁切留一点余量 |
| 副角色（黑发和服少女） | `x 1930–2520, y 120–1600` | 右侧，逆光偏暗，需要提亮后再图生图 |

或改用平台的"参考图 / 垫图"功能而非纯图生图，并**在负面词里明确排除第二人与背景**。输出 **832×1216**（竖构图）。

### 3.2 中文 Positive（主立绘：粉绿麻花辫少女）

```
一名少女，独自一人，全身站姿，正面偏侧，全身线稿，垂直构图，约七头身修长比例，
手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
及腰长发，两侧各编一条粗三股麻花辫垂至膝下，辫身用成组平行长线与交错人字形短线表现编织纹路，
发梢收细并微微外翘，齐刘海，发丝分层，
绿色眼眸（只勾轮廓与瞳孔，不涂色），细眉，细长睫毛，
宽颈圈（勾外轮廓，中央一枚菱形宝石，两侧一排小圆点铆钉），
白色露肩短上衣（细肩带，胸前一圈连续波浪短弧线表现荷叶边，袖口同样荷叶边），
宽腰带（方形金属扣，扣面两侧各一排小圆点，一条带尾自然垂下并勾出末端切角），
牛仔短裤（裤脚用锯齿状短线表现毛边），腕上一只窄表带（勾矩形表盘与两条带线），身侧一只购物纸袋（只勾袋身矩形轮廓、袋口折线、
上方两条提手弧线，袋面不加任何图案与文字），
一只手食指竖在唇前做出"嘘"的手势，另一只手勾住纸袋提手，
身周四五片飘落的樱花瓣（每片为带一个小缺口的五瓣轮廓），
轻排线仅用于暗部边缘，纯白背景，居中，大量留白
```

### 3.3 中文 Negative（主立绘）

```
填充，涂色，明暗，阴影块，渐变，高光块，厚涂，赛璐璐上色，水彩，
彩色背景，粉色背景，樱花背景，复杂背景，场景，商场，地面投影，
第二个人，多人，同角色重复出现，多个视角，三视图，手持道具以外的杂物，
文字，标题字，logo，水印，签名，日文，中文，
粗线条，线宽不匀，断线，轮廓不闭合，模糊，低分辨率，
写实，照片，3D渲染，Q版，幼态，畸形手，多余手指，多余肢体
```

### 3.4 English Positive（主立绘）

```
1girl, solo, full body, standing, three-quarter view, full-length line art, vertical composition, 7 heads tall,
hand-drawn line art, single-color outline, no fill, no shading, no gradient,
thin uniform line weight, slight hand-drawn wobble, closed contours,
waist-length hair with one thick three-strand braid hanging down each side past the knees,
braid body rendered as grouped parallel long strokes crossed by short chevron strokes to show the weave,
hair tips taper and flick outward slightly, blunt bangs, layered hair strands,
green eyes (outline and pupil only, uncolored), thin eyebrows, long thin lashes,
wide choker (outer contour, one diamond-shaped gem at the center, a row of small rivet dots along each side),
white off-shoulder top (thin halter straps, a ring of continuous wave strokes as ruffles across the chest, matching ruffled cuffs),
wide belt (square metal buckle with a row of small dots on each side, one belt tail hanging down with a chamfered tip),
denim shorts (hem rendered with jagged short strokes as fraying),
a slim watch band on one wrist (rectangular dial outline plus two band lines),
one shopping paper bag beside her (bag body rectangle, top fold line, two handle arcs above, blank surface with no print or lettering),
one hand raising its index finger to the lips in a hush gesture, the other hand hooked on the bag handle,
four or five falling cherry-blossom petals around her (five-lobed outline with one small notch each),
light hatching on shadow sides only, plain white background, centered, lots of empty space
```

### 3.5 English Negative（主立绘）

```
fill, coloring, shading, shadow blocks, gradient, specular highlights, thick paint,
cel shading, watercolor, colored background, pink background, cherry blossom background,
complex background, scenery, shopping mall, ground shadow,
second person, multiple girls, same character repeated, multiple views, three views, clutter beyond the prop,
text, title lettering, logo, watermark, signature, kanji, chinese characters,
thick lines, uneven line weight, broken lines, open contours, blurry, lowres,
photorealistic, photo, 3d render, chibi, child-like, bad hands, extra fingers, extra limbs
```

### 3.6 副角色（可选第二张：黑发和服少女）

用 3.1 的右侧裁切范围，其余风格块同上。中文：

```
一名少女，独自一人，全身站姿，侧身回望，全身线稿，垂直构图，约六头半身长比例，
手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
黑色长直发垂至腰下（发丝用成组长线，发梢分叉），发尾微微外翘，
粉紫色眼眸（只勾轮廓与瞳孔），细眉，
口中横着一片吐司（只勾外轮廓、面包边与一条截面线，不画纹理），
粉色和服外套（衣身用连续的六角星形麻叶纹骨架表现纹样，纹样只勾线不涂色），
和服内搭浅色交领（领口两条平行斜线）与浅色腰带（勾一条水平长带与两道折线），
身后一条橙红色长丝带垂落并在末端打一个蝴蝶结（结瓣用两条闭合弧线，飘带用长曲线），
黑色百褶裙（褶线为等距的竖直短线，裙摆为一条平缓长弧），
黑色过膝袜（袜口一条水平线，腿部轮廓内不加明暗），手边一只小提箱
（勾箱体矩形、横向两道加固线与上方提手），
轻排线仅用于暗部边缘，纯白背景，居中，大量留白
```

English：

```
1girl, solo, full body, standing, looking back over her shoulder, full-length line art, vertical composition, 6.5 heads tall,
hand-drawn line art, single-color outline, no fill, no shading, no gradient, thin uniform line weight, slight hand-drawn wobble,
closed contours,
long straight black hair past the hips (grouped long strokes, forked tips), hair ends flick slightly outward,
pink-purple eyes (outline and pupil only), thin eyebrows,
a slice of toast held crosswise in her mouth (outer contour, crust line and one cross-section line only, no texture),
pink kimono jacket (asanoha hemp-leaf hexagonal star grid as the pattern skeleton, outline only, uncolored),
light-colored inner collar (two parallel diagonal lines) and a light sash (one long horizontal band with two fold lines),
a long orange-red ribbon falling behind her, ending in a bow (two closed arcs for the loops, long curves for the tails),
black pleated skirt (evenly spaced short vertical pleat lines, hem as one gentle long arc),
black thigh-high socks (one horizontal band at the top, no shading inside the leg contour),
a small suitcase beside her (rectangular body, two horizontal reinforcement lines, a handle on top),
light hatching on shadow sides only, plain white background, centered, lots of empty space
```

---

## 四、装饰涂鸦（按主题槽位，全部线稿风）

每个槽位都注明**取自画面的哪一部分**，保证"涂鸦元素从图片中提取"。

### 槽位 1：涂鸦主图（对应 `doodle`，侧边大面积）

取自：飘落花瓣 + 麻花辫曲线 + 纸袋提手弧线 + 和服麻叶纹碎片。

**中文**
```
一条自左下向右上的斜向装饰线稿轨迹，手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，
主体是两条并行缓慢发散的编织曲线（模拟三股麻花辫的交错人字纹，用小段斜线交叉表现辫纹），
沿轨迹散布七到九片樱花瓣（每片为带一个小缺口的五瓣轮廓，朝向各不相同），
花瓣之间穿插两个纸袋提手弧线（半圆弧加两侧下垂短线）与三枚麻叶纹碎片
（每枚由六角星形骨架中的三到四个菱形格构成），
轨迹两端各收一枚四芒星（两根细长交叉线构成），
轮廓闭合，纯白背景，大量留白，无人物，无文字
```
**English**
```
a diagonal decorative line-art trail from lower-left to upper-right,
hand-drawn line art, single-color outline, no fill, no shading, no gradient, thin uniform line weight,
main body is two near-parallel slowly diverging braided curves (three-strand weave suggested by short crossed chevron strokes),
seven to nine cherry-blossom petals scattered along the trail (five-lobed outline with one small notch each, varied orientations),
between the petals, two paper-bag handle arcs (semicircle with short hanging ends) and three asanoha fragments
(each made of three or four rhombus cells from a hexagonal star grid),
one four-pointed sparkle at each end of the trail (two thin crossed tapered strokes),
closed contours, plain white background, lots of empty space, no people, no text
```

### 槽位 2：四角星芒（对应 `star`）

**中文**
```
单个四角星芒，由两根细长尖端交叉的线段构成，中心交叉处加一小圈，
四角尖端附近各点一枚极小的花瓣轮廓，
手绘线稿，单色描边，无填充，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single four-pointed sparkle made of two thin tapered crossed strokes, with a small circle at the crossing,
a tiny petal outline near each of the four tips,
hand-drawn line art, single-color outline, no fill, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 3：购物纸袋（对应 `candy-wrapped`）

取自：主角手边的纸袋（珊瑚红 `#f27674` / 明黄 `#f8dd58` 那两个）。

**中文**
```
单只手提纸袋，正面略斜的矩形袋身，袋口一条水平折线，上方两条对称的提手弧线，
袋身侧面加一条竖折线表示厚度，袋面完全留空不加任何图案与文字，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single paper shopping bag, slightly tilted rectangular body, one horizontal fold line at the opening,
two symmetrical handle arcs above, one vertical crease line on the side to show depth,
blank surface with no print and no lettering,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 4：腰带扣（对应 `candy-lollipop`）

取自：主角的方形金属腰带扣与带尾。

**中文**
```
单个方形金属腰带扣，外框为带小切角的矩形，内部中空，
框内左右各一排三个小圆点，右侧一段带尾垂下并勾出末端切角与两个孔洞，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single square metal belt buckle, chamfered rectangular frame, hollow center,
three small dots in a row on each side inside the frame,
a belt tail hanging from the right with a chamfered tip and two holes,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 5：丝带蝴蝶结（对应 `acao-heart`）

取自：副角色身后垂落的橙红丝带与末端蝴蝶结。

**中文**
```
单个丝带蝴蝶结，左右两片结瓣各为一条闭合弧线，中央一个小结，
两侧各飘出一条长曲线丝带（末端剪成燕尾形），
轻排线仅用在结心处，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single ribbon bow, two closed arcs for the loops, a small knot at the center,
one long curved ribbon tail on each side (swallow-tail cut at the end),
light hatching only at the knot,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 6：麻叶纹圆章（对应 `acao-cheer`）

取自：副角色和服上的**麻叶纹（asanoha，六角星形骨架）**。

**中文**
```
单个圆形纹章，内部为麻叶纹：六角星形骨架向六个方向延伸，由等边菱形格拼成，
每个菱形只勾外轮廓，纹章外圈加一圈细线圆环，圆心一枚小菱形，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single circular emblem containing an asanoha (hemp-leaf) pattern: a hexagonal star skeleton extending in six directions,
built from equilateral rhombus cells, each rhombus outline only,
a thin circular ring around the emblem and a small rhombus at the center,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 7：角线 / 上缘线（对应 `corner` / `upper`，横长条）

取自：背景飘落花瓣的走向 + 主角辫子的弧线。

**中文**
```
横长构图装饰线稿，三到四条近乎平行、缓慢发散的长曲线贯穿画面，
其中一条为编织纹长带（用交错短斜线表现三股辫），其余为细长曲线，
沿线点缀五到七片樱花瓣与二三枚四芒星，两端渐隐收细，
手绘线稿，单色描边，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art, three or four near-parallel long curves slowly diverging across the frame,
one of them a braided band (short crossed diagonal strokes showing a three-strand weave), the rest thin long curves,
dotted with five to seven cherry-blossom petals and two or three four-pointed sparkles, tapering out at both ends,
hand-drawn line art, single-color outline, thin uniform line weight,
plain white background, lots of empty space, no text
```

---

## 五、参数（线稿与渲染图的取法不同）

| 参数 | 值 | 说明 |
|---|---|---|
| 输入预处理 | 按 3.1 的坐标裁出单人 | 16:9 双人图直接图生图会保留第二人与背景 |
| 输出尺寸 | 角色 **832×1216**；涂鸦 1024×1024；`corner`/`upper` 按长条比例（如 1536×512） | 别用正方形画立绘 |
| 重绘强度 | **0.6–0.8** | 线稿要"重画"才能去掉原图的填充与明暗；低于 0.5 会保留渲染质感 |
| CFG Scale | **4–6** | 线稿是低信息量输出，CFG 高了会硬塞细节、线变毛 |
| 采样器 | DPM++ 2M Karras / Euler a，24–32 步 | 线稿不需要太多步数 |
| 一致性 | 固定 checkpoint + seed，整套素材同一模型 | 否则线宽线色会飘 |

**平台写法**

| 平台 | 关键点 |
|---|---|
| NijiJourney / Midjourney | `--iw 1.2 --ar 2:3 --niji 6 --style raw`；线稿风可给 `line art` 加权 |
| NovelAI | `lineart` 作主 tag；img2img 强度 0.65–0.8；权重 `{{lineart}}` |
| WebUI / ComfyUI / Liblib | 配 ControlNet `lineart` / `softedge` 锁轮廓（本图线条清晰，效果很好），再由提示词定线宽线色 |
| 即梦 / 通义万相 / 可灵 | 中文提示词直接可用；可灵对"线稿"理解较好，但倾向补色，负面词务必写"无填充、不上色、不要背景" |

**线色怎么落**：本主题建议 `#d94f86`（樱玫）为主、`#a0e64f`（发梢绿）点缀、`#8a5a4a`（暖褐）用于重色构件。
但更稳的做法是**让线稿保持近乎单一深色，最终线色交给主题 CSS**（浅色模式 `mask + 纯色填充` 会重画一遍）。

**关于"角色相似度"**：基准图是对已有动画角色的同人演绎。要的是**设计特征**（粉色发顶→青柠发梢的粗麻花辫、
荷叶边白上衣、方形腰带扣、牛仔短裤毛边、黑长直 + 麻叶纹和服 + 百褶裙），
提示词里刻意不写角色名与作品名——写名字会把生成器引向官方立绘，反而偏离这套现代私服设定。

---

## 六、出图后自检（线稿版）

1. **无填充**：放大看线条内部必须是背景色，出现色块就是跑偏（最常见的失败）
2. **无明暗**：不能有阴影块、渐变、高光斑
3. **线宽一致**：同一张图里线的粗细不应有明显跳变
4. **轮廓闭合**：断线会让浅色模式的蒙版边缘发毛
5. **着墨比例**：目测接近基准图的 **8–10%**；超过 20% 说明模型加了排线或填充，重出
6. **背景干净**：纯白或透明；**不能带樱花渐变底、不能带标题字**（基准图左上角有作品标题，务必排除）
7. **无第二人**：主立绘里不能出现右侧那位角色或购物场景的其余部分
8. **长宽比**：按槽位出，长条槽位别出成方形（会被拉伸或留大片空白）
9. **麻叶纹**：菱形格必须是直线构成的正几何，出现曲线化/写实化的花纹就重出

**出图后不用做的事**：线稿在纯白底上是常态，不需要抠底；若底带轻微灰，
用 `tools/extract-art.js`（边缘连通 + 厚度检测）跑一遍即可。
需要剪影填充（暗色模式用）时用 `tools/make-silhouette.js` 从线稿反算。
