# 鬼化粉蝶 · 主题素材提示词（**手稿线稿版**，中英双版）

基准图：`Dream-Work-Theme/themes/nezuko-demon-form/hero.jpg`（5000×2810，暗室障子窗 + 发光蝴蝶 + 粉眼少女）
用途：给 painting-skin-theme 的 Diana 格式主题生成 ①角色线稿 ②装饰涂鸦线稿
风格基准：`themes/diana/assets/diana-doodle-v2.png`（Diana 的涂鸦素材，1267×1241）
配色基准：本图实测（见二）

> **为什么是线稿风**：Diana 那套浅色模式是「alpha 蒙版 + 纯色填充」画法，前提是**素材本身是线稿**。
> 基准图是渲染图，它的作用是**定角色设计 / 定配色 / 定涂鸦母题**，出图必须转成线稿。
>
> **涂鸦元素全部取自基准图**：发光蝴蝶（含翅脉与翅斑）、蝴蝶发饰、上臂蝴蝶纹样、
> 樱花花瓣、和服内衬的麻叶纹、障子格子窗、缠绕腰布、虹彩光斑与闪光碎屑。

> ⚠ **基准图是卧姿且没有拍到脚**（画面到膝盖上下就裁掉了）。角色提示词按"**全身**"写，
> 缺失部分在 3.1 里单列补全设定。

---

## 一、风格规范（线稿基准 = Diana 涂鸦素材，与另两份提示词同一套）

| 特征 | 实测 | 生成时的对应写法 |
|---|---|---|
| **着墨比例** | 8.57%（极稀疏） | `sparse line art` / `outline only` / `no fill` |
| **边缘** | 仅 58% 着墨像素完全不透明 | `soft pencil edges` |
| **线宽** | ≈ **0.85% 画布宽** | `thin uniform line weight` |
| **笔触** | 手绘抖动、暗部轻排线 | `hand-drawn wobble` / `light hatching on shadow sides` |
| **填充** | 无填充、无明暗、无渐变 | 负面词里明确排除 |

### 线色怎么定

| 用途 | 色值 | 说明 |
|---|---|---|
| **主描边** | `#d94fb0`（发光粉蝶） | 从本图发光粉的亮部 `#ee78cc` 压暗，浅底清楚、贴主题气质 |
| **强调描边** | `#7d6fc8`（虹彩紫） | 来自虹彩冷档亮部 `#89a4e7` 与紫档 `#bb88e8` 之间，给光斑与闪光用 |
| **重色构件** | `#4a4356`（暗紫灰） | 和服、暗室这类"重块"，避免纯黑压死画面 |
| 复刻 Diana 桃粉 | `#fcccbc` | 想贴 Diana 观感时把上面三处换成这个值 |

> 最终线色交给主题 CSS（浅色模式 `mask + 纯色填充` 会重画一遍），比让模型调准颜色可靠。

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

**总体结论**：有彩度像素 **22.2%**（另两份基准图分别是 11.4% 与极低），近黑像素 **12.1%**
——这是「**暗室 + 高亮光斑**」的强对比图。有彩度像素里蓝/青占 **43.1%**（暗室与虹彩冷档）、
粉/品红占 **39.2%**（蝴蝶、花瓣、眼）、紫占 **14.8%**、金/琥珀仅 0.1%（虹彩暖档一闪）。

| 色值 | 画面来源 | 用途 |
|---|---|---|
| `#ee78cc` | 发光粉亮部（蝴蝶 / 眼睛 / 花瓣） | 主题主强调色 |
| `#eb58c0` | 左蝴蝶实测最饱和样本 | 主强调色的饱和档 |
| `#8b4b7a` | 粉/品红全段均值 | 主色的中间调 |
| `#4c2d46` | 粉/品红暗部 | 主色暗调 |
| `#89a4e7` | 虹彩冷档亮部 | 次强调色（光斑、闪光） |
| `#2f364a` | 蓝/青全段均值（暗室） | 主题暗底参考 |
| `#bb88e8` | 紫档亮部（虹彩过渡） | 第三色 |
| `#e7d8ef` / `#b68fae` | 和服内衬（粉白 / 藕紫） | 内衬与花纹参考 |
| `#dab2d5` | 缠绕腰布（浅粉白） | 腰带参考 |
| `#ece7f7` / `#f5b7f1` | 障子窗格亮部 / 粉色光晕 | 亮部参考 |
| `#272530` / `#2a2933` | 暗室与发色（近黑 12.1%） | 重色构件（线稿里用 `#4a4356`） |
| `#fdf9fe` | 地面强光斑 | 画面最亮值 |

---

## 三、角色线稿（**全身**）

### 3.1 前提：参考图是卧姿且缺下半身

| 项 | 情况 | 处理 |
|---|---|---|
| 姿态 | 图为**半卧撑地**、身体对角构图，看向镜头 | 提示词按"**全身站姿**"写（便于做立绘）；想保留卧姿就把站姿句换回"半卧撑地、身体对角" |
| 裁切 | 画面到膝盖上下，**小腿、脚、鞋不可见** | 见下方补全设定 |
| 单人选裁切 | 人物约在 `x 700–3200, y 0–2810`（原图 5000×2810 坐标） | 蝴蝶与花瓣会很自然地留在画面里，负面词里排除背景与暗室 |
| 输出 | **832×1216**（竖构图，七头身） | 别用正方形画立绘 |
| 补全设定（可改） | 深色和服**长下摆拖地**（下摆边缘露出内衬的粉色麻叶纹），白色足袋 + 深色木屐；想改赤足就替换这一句 | 与和服设定一致 |

### 3.2 中文 Positive（全身）

```
一名少女，独自一人，全身站姿，正面偏侧，全身线稿，垂直构图，约七头身修长比例，
手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
极长黑色直发垂至小腿（发丝用成组平行长线分层，表层加几组细密短线表示高光，发梢自然散开），
额前碎发与两侧长刘海，
头顶偏右侧一枚发光蝴蝶发饰（勾蝴蝶外轮廓、两条主翅脉与一根短簪杆），
粉红色眼眸（只勾轮廓、瞳孔与放射状睫毛，瞳孔为竖直细长形，不涂色），
细长眉毛，嘴角极浅的平静微笑，
深色和服自双肩滑落、露出双肩与上臂（衣领勾两条平行的斜长线，肩线处用两道短弧表现滑落的褶皱），
和服内衬为浅色交领（领口两条平行斜线），衣身铺满连续的六角星形麻叶纹骨架（只勾线不涂色），
胸前与腰际缠绕数道浅色布带（勾四五条近乎平行的长弧线，交叠处加短折线），
一侧上臂一枚蝴蝶纹样（勾蝴蝶外轮廓与两条翅脉，翅面点两三个小棱形斑），
一只手臂自然垂在身侧（手自然张开，五指各用两条短线勾出），另一只手臂微微抬起
（手肘抬起，手指轻触发梢），
深色和服长下摆拖地（下摆为一条平缓长弧，边缘露出内衬麻叶纹的一小段），
白色足袋（袜口一条水平线）与深色木屐（鞋面两条人字形系带、鞋底一条长横线），
身周散布六到八片樱花瓣（每片为带一个小缺口的五瓣轮廓，朝向各异），
纯白背景，居中，大量留白
```

### 3.3 中文 Negative（全身）

```
填充，涂色，明暗，阴影块，渐变，高光块，厚涂，赛璐璐上色，水彩，霓虹光晕，发光溢出，
彩色背景，暗室，障子，窗格，地板，光斑，复杂背景，场景，
文字，水印，签名，logo，
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
extremely long straight black hair reaching the calves (grouped parallel long strokes, a few dense short strokes on top for sheen, tips spreading),
choppy bangs and long side locks,
a glowing butterfly hair ornament on the right side of her head (butterfly outline, two main veins and a short hairpin stem),
pink eyes (outline, pupil and radiating lashes only, pupil a thin vertical slit, uncolored),
thin eyebrows, a very faint calm smile,
dark kimono slipped off both shoulders, bare shoulders and upper arms (collar as two parallel long diagonals,
two short arcs at the shoulder line for the slipping folds),
light-colored inner collar (two parallel diagonal lines), the garment body covered in a continuous
asanoha hemp-leaf hexagonal star grid (outline only, uncolored),
several light cloth bands wrapped across the chest and waist (four or five near-parallel long arcs with short fold lines where they overlap),
a butterfly marking on one upper arm (outline plus two wing veins, two or three small diamond spots on the wings),
one arm hanging naturally (hand relaxed and open, each finger as two short strokes),
the other arm slightly raised (elbow up, fingertips touching the hair tips),
dark kimono hem trailing on the ground (one gentle long arc, with a short segment of the asanoha lining showing at the edge),
white tabi socks (one horizontal band at the cuff) and dark wooden geta (two chevron straps, one long sole line),
six to eight cherry-blossom petals around her (five-lobed outline with one small notch each, varied orientations),
plain white background, centered, lots of empty space
```

### 3.5 English Negative（full body）

```
fill, coloring, shading, shadow blocks, gradient, specular highlights, thick paint,
cel shading, watercolor, neon glow, bloom, light bleed,
colored background, dark room, shoji screen, window lattice, floor, light patches, complex background, scenery,
text, watermark, signature, logo,
second person, multiple girls, same character repeated, multiple views, three views,
cropped, out of frame, half body, upper body only, feet cut off, ground shadow,
thick lines, uneven line weight, broken lines, open contours, blurry, lowres,
photorealistic, photo, 3d render, chibi, child-like, bad hands, extra fingers, extra limbs
```

---

## 四、装饰涂鸦（按主题槽位，全部线稿风）

### 槽位 1：涂鸦主图（对应 `doodle`，侧边大面积）

取自：图中成群发光蝴蝶 + 花瓣雨 + 虹彩光斑。

**中文**
```
一条自左下向右上的斜向装饰线稿轨迹，手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，
主体是两只大小不一的蝴蝶（大的一只双翼张开、小的一只侧身收翅），
每只只勾翅膀外缘与两条主翅脉，翅面各点两三个小棱形斑，触角为两根细长曲线，
蝴蝶之间穿插一条缓慢发散的长曲线（表现光迹），
沿轨迹散布九到十二片樱花瓣（每片为带一个小缺口的五瓣轮廓，朝向各异）与
七八枚大小不一的光斑（小圆圈加一圈放射短线，近处大、远处小），
轨迹两端各收一枚四芒星（两根细长交叉线，中心加小圈），
轮廓闭合，纯白背景，大量留白，无人物，无文字
```
**English**
```
a diagonal decorative line-art trail from lower-left to upper-right,
hand-drawn line art, single-color outline, no fill, no shading, no gradient, thin uniform line weight,
main body is two butterflies of different sizes (the larger with both wings open, the smaller with wings folded in profile),
each drawn with wing outline and two main veins only, two or three small diamond spots on the wings,
antennae as two thin long curves,
a slowly diverging long curve between them (a light trail),
nine to twelve cherry-blossom petals scattered along the trail (five-lobed outline with one small notch each, varied orientations)
and seven or eight glints of varying size (small circle with a ring of short radiating strokes, larger near, smaller far),
one four-pointed sparkle at each end of the trail (two thin crossed strokes with a small circle),
closed contours, plain white background, lots of empty space, no people, no text
```

### 槽位 2：闪光碎屑（对应 `star`）

取自：画面里悬浮的棱形闪光与虹彩碎屑。

**中文**
```
单个四芒星闪光，由两根细长尖端交叉的线段构成，中心一个小空心圆，
四臂根部各加一段短弧，四角外侧各点一枚极小圆点，
斜向再叠一根短棱形（两笔闭合的细长菱形），
手绘线稿，单色描边，无填充，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single four-pointed sparkle made of two thin tapered crossed strokes, a small hollow circle at the crossing,
a short arc at the base of each arm, a tiny dot beyond each of the four tips,
a short thin diamond overlapped diagonally (two strokes forming a closed elongated rhombus),
hand-drawn line art, single-color outline, no fill, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 3：发光蝴蝶（对应 `candy-wrapped`）

取自：图中最大那只发光蝴蝶（虹彩翅）。

**中文**
```
单只蝴蝶，双翼完全张开、左右对称，翅膀外缘为一条波浪状闭合曲线（前翅略尖、后翅带尾突），
内部只勾两条主翅脉与三条次级翅脉，翅面点三个小棱形斑与一排小圆点，
腹部为两段短弧，触角两根细长曲线各在末端加一个小圆，
轻排线仅用在翅根与身体连接处，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single butterfly, both wings fully open and symmetrical, outer wing edge a wavy closed curve
(forewing slightly pointed, hindwing with a tail extension),
inside, two main veins and three secondary veins only, three small diamond spots and a row of tiny dots on the wings,
abdomen as two short arcs, antennae as two thin long curves each ending in a small circle,
light hatching only where the wings meet the body,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 4：蝴蝶发饰（对应 `candy-lollipop`）

取自：她头顶那枚发光蝴蝶发饰。

**中文**
```
单个蝴蝶发饰，蝴蝶侧身收翅（两片翅并拢为一条闭合长叶形），翅面两条主翅脉与一个小棱形斑，
下方一根短直簪杆（两条平行短线，末端一个小圆），
翅根加两段短弧表示连接，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single butterfly hair ornament, butterfly in profile with wings folded (the two wings merge into one closed leaf shape),
two main veins and one small diamond spot on the wing,
a short straight pin below (two parallel short lines ending in a small circle),
two short arcs at the wing base,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 5：蝴蝶纹样（对应 `acao-heart`）

取自：她上臂那枚蝴蝶纹样。

**中文**
```
单个蝴蝶纹样，正面对称、翅膀外缘为圆钝的闭合曲线（比发饰那只更圆更小巧），
内部只勾两条翅脉，翅面留白，腹部为一条细长闭合曲线并在末端加一个小圆，
整体轮廓外加一圈极细的虚线环（短线分段，表示纹样边界），
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single butterfly marking, front-facing and symmetrical, wing edge a rounded blunt closed curve
(smaller and rounder than the hair-ornament butterfly),
two veins inside only, wings otherwise empty, abdomen a thin closed curve ending in a small circle,
a very fine dashed ring around the whole shape (short segments marking the pattern boundary),
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 6：麻叶纹圆章（对应 `acao-cheer`）

取自：和服内衬的麻叶纹（六角星形骨架）。

**中文**
```
单个圆形纹章，内部为麻叶纹：六角星形骨架向六个方向延伸，由等边菱形格拼成，
每个菱形只勾外轮廓，纹章外圈加一圈细线圆环，圆心一枚小菱形，
四角外侧各点一枚极小圆点（表示纹样结点），
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single circular emblem containing an asanoha (hemp-leaf) pattern: a hexagonal star skeleton extending in six directions,
built from equilateral rhombus cells, each rhombus outline only,
a thin circular ring around the emblem and a small rhombus at the center,
a tiny dot beyond each of the four corners (pattern nodes),
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 7：角线（对应 `corner`，横长条）

取自：障子格子窗的折角 + 地面光斑。

**中文**
```
横长构图装饰线稿，主体为两三段平直的长线构成的折角（模拟窗格木框的转角，
折角处两条线略微重叠，并加一小段短横线表示榫接），
折角内侧走一条断续的短弧链（表示透光的边缘），
外侧散布三到四枚光斑（小圆圈加放射短线）与五六片樱花瓣，
两端渐隐收细，
手绘线稿，单色描边，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art: two or three straight long lines forming corner joints
(shoji lattice frame corners, the two lines overlapping slightly at the joint with a short cross stroke for the tenon),
a broken chain of short arcs along the inner side of the joint (light leaking through),
three or four glints outside (small circles with radiating strokes) and five or six cherry-blossom petals,
tapering out at both ends,
hand-drawn line art, single-color outline, thin uniform line weight,
plain white background, lots of empty space, no text
```

### 槽位 8：上缘线（对应 `upper`，横长条）

取自：胸前缠绕的布带 + 花瓣雨走向。

**中文**
```
横长构图装饰线稿，主体为四条近乎平行、缓慢发散的长弧线（模拟缠绕的布带，
其中两条在中段相交一次并加短折线表示交叠），
沿线点缀七到九片樱花瓣与五六枚极小圆点，
上侧一条细长直线贯穿，两端渐隐收细，
手绘线稿，单色描边，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art: four near-parallel slowly diverging long arcs (wrapped cloth bands,
two of them crossing once in the middle with a short fold line at the overlap),
dotted with seven to nine cherry-blossom petals and five or six tiny dots,
a thin straight line running across the top, tapering out at both ends,
hand-drawn line art, single-color outline, thin uniform line weight,
plain white background, lots of empty space, no text
```

---

## 五、参数

| 参数 | 值 | 说明 |
|---|---|---|
| 输入预处理 | 按 3.1 裁出单人；**下半身要先补全** | 参考图是卧姿且没拍到脚 |
| 输出尺寸 | 角色 **832×1216**；涂鸦 1024×1024；`corner`/`upper` 长条比例（如 1536×512） | 别用正方形画立绘 |
| 重绘强度 | **0.6–0.8** | 线稿要"重画"才能去掉渲染质感；低于 0.5 会保留暗室光斑 |
| CFG Scale | **4–6** | 线稿是低信息量输出，CFG 高了线会毛 |
| 采样器 | DPM++ 2M Karras / Euler a，24–32 步 | 线稿不需要太多步数 |
| 一致性 | 固定 checkpoint + seed，整套素材同一模型 | 否则线宽线色会飘 |

**平台写法**

| 平台 | 关键点 |
|---|---|
| NijiJourney / Midjourney | `--iw 1.2 --ar 2:3 --niji 6 --style raw`；`--ar 2:3` 会自动补下半身 |
| NovelAI | `lineart` 作主 tag；img2img 强度 0.65–0.8 |
| WebUI / ComfyUI / Liblib | ControlNet `lineart` / `softedge` 锁轮廓 + `openpose` 约束全身姿态（补腿时必需） |
| 即梦 / 通义万相 / 可灵 | 中文提示词直接可用；**可灵会把"发光/霓虹"补成彩色光晕**，负面词务必写"无填充、不上色、不要发光" |

**这张图特有的坑**：基准图有强烈的发光与虹彩（bloom / 色差边缘），模型很容易在线稿里也补上
彩色光晕或渐变色。负面词里已写 `霓虹光晕, 发光溢出, neon glow, bloom`，出图后要放大确认
线条内部仍然是纯背景色。

---

## 六、出图后自检（线稿版）

1. **无填充**：线条内部必须是背景色；出现色块就是跑偏（最常见的失败）
2. **无发光**：不能有光晕、渐变色、虹彩描边（这张图最容易犯）
3. **无明暗**：不能有阴影块与高光斑
4. **全身完整**：头顶到鞋底都在画面内，脚不能被裁
5. **线宽一致**：同一张图里线的粗细不应有明显跳变
6. **轮廓闭合**：断线会让浅色模式的蒙版边缘发毛
7. **着墨比例**：目测接近基准图的 **8–10%**；超过 20% 说明模型加了排线或填充，重出
8. **背景干净**：纯白或透明；有暗室、窗格、光斑残留就重出
9. **麻叶纹**：菱形格必须是直线构成的正几何，出现曲线化花纹就重出
10. **长宽比**：按槽位出，长条槽位别出成方形

**出图后不用做的事**：线稿在纯白底上是常态，不需要抠底；若底带轻微灰，
用 `tools/extract-art.js` 跑一遍即可。需要剪影填充（暗色模式用）时用 `tools/make-silhouette.js` 从线稿反算。
