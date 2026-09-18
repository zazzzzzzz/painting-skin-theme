# 深空玻璃 · 主题素材提示词（**手稿线稿版**，中英双版）

风格基准：`themes/diana/assets/diana-doodle-v2.png`（Diana 的涂鸦素材，1267×1241）
用途：给 painting-skin-theme 的 Diana 格式主题生成 ①角色线稿 ②装饰涂鸦线稿
配色基准：cosmic-glass 主题实测值（见下）

> **为什么改用线稿风**：Diana 那套浅色模式是「alpha 蒙版 + 纯色填充」画法，它成立的前提是
> **素材本身是线稿**——取 alpha 得到的是干净的单色线条画。之前用渲染图素材（水晶质感）时，
> 取 alpha 只剩外轮廓，浅色下会糊成实心色块，而填充色成片出现也偏离原图气质。
> 换成线稿后：浅色模式天然可用，暗色模式下也是淡淡的冷白线条，与深空底相配。

---

## 一、风格规范（从基准图实测）

| 特征 | 实测 | 生成时的对应写法 |
|---|---|---|
| **着墨比例** | 8.57%（极稀疏） | `sparse line art` / `outline only` / `no fill` |
| **线条颜色** | 暖色系均值 `#fcccbc`（淡桃粉，亮度 99%、饱和 25%） | 见下方"线色"说明 |
| **边缘** | 仅 58% 着墨像素完全不透明，42% 半透明 | `soft pencil edges` / `slightly feathered strokes` |
| **线宽** | 横向连续段均值 10.7px / 画布宽 1267 ≈ **0.85% 画布宽** | `thin uniform line weight` |
| **笔触** | 手绘抖动、有轻度排线（蝴蝶结处短排线） | `hand-drawn wobble` / `light hatching on shadow sides` |
| **填充** | 无填充、无明暗、无渐变 | 负面词里明确排除 |

### 线色怎么定

- **基准图（Diana）用的是淡桃粉 `#fcccbc`** —— 复刻它这套观感就写这个值。
- **本主题（cosmic-glass）建议换成冷色**，与深空底一致：`#cfe0ee`（冰白）为主，
  `#9ecbe4`（淡青）做少量强调。下面所有提示词**默认用冷色**，要复刻桃粉就把这三处色值换掉即可。

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

## 二、配色基准（cosmic-glass 主题实测）

| 色值 | 用途 |
|---|---|
| `#cfe0ee` | 线稿主色（冰白） |
| `#9ecbe4` | 强调线色（淡青） |
| `#eef0f6` | 高光线（近白） |
| `#0d1012` | 主题画布底色（深空，仅供参考，不写进线稿提示词） |
| `#fcccbc` | 基准图（Diana）的线色，仅在复刻桃粉风时使用 |

参考图的色相分布（上一轮实测）：高饱和像素 90% 落在 200–220°（青蓝→蓝紫），青绿 8%，
品红与暖金合计不到 0.2%。**线稿阶段不必体现这些，交给主题的 CSS token 去上色。**

---

## 三、角色线稿

### 3.1 前提

参考图是 16:9 场景图，同一位角色出现多次。**先裁出单人**（中央坐姿约 `x 900–1600, y 150–1200`），
或改用"参考图"功能而非纯图生图。输出 **832×1216**（竖构图）。

### 3.2 中文 Positive

```
一名少女，独自一人，全身站姿，正面偏侧，全身线稿，垂直构图，约七头身修长比例，
手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，笔触略有手绘抖动，轮廓闭合，
银白色及腰长发，发丝分层用成组的平行长线表现，
品红色眼眸（线稿中只勾轮廓与瞳孔，不涂色），上挑眼型，细长睫毛，
头顶细小枝状角饰，
耳罩式头饰（勾外轮廓与圆环结构，环上用小圆点表示指示灯），侧面几何贴片，
多层荷叶边领口（荷叶边用连续波浪短线表现），胸前镂空纹样（只勾几何骨架），
层叠纱裙（裙摆用几组外侧长弧线分层，褶皱用短排线暗示），露肩，
腰间几何构件（勾矩形与铆钉小圆点），
褶皱袖口，手腕缎带环，脚踝缠绕缎带，
身周散布棱角玻璃碎片（勾勒轮廓并加一两条内部分面线）与极细光丝（长曲线），
轻排线仅用于暗部边缘，纯白背景，居中，大量留白
```

### 3.3 中文 Negative

```
填充，涂色，明暗，阴影块，渐变，高光块，厚涂，赛璐璐上色，水彩，
彩色背景，复杂背景，场景，星空，星云，多人，同角色重复出现，多个视角，三视图，
被裁切，出画，地面投影，文字，水印，签名，
粗线条，线宽不匀，断线，轮廓不闭合，模糊，低分辨率，
写实，照片，3D渲染，Q版，幼态，畸形手，多余手指，多余肢体
```

### 3.4 English Positive

```
1girl, solo, full body, standing, three-quarter view, full-length line art, vertical composition, 7 heads tall,
hand-drawn line art, single-color outline, no fill, no shading, no gradient,
thin uniform line weight, slight hand-drawn wobble, closed contours,
silver-white waist-length hair, hair strands rendered as grouped parallel long strokes,
magenta eyes (outline and pupil only, uncolored), upturned eye shape, long thin lashes,
small branch-like horn ornaments on head,
ear-cup headpiece (outer contour plus ring structure, dot indicator lights along the ring), geometric plates on the side,
multi-layer ruffled collar (continuous wave strokes), openwork chest ornament (geometric skeleton only),
layered gauze dress (skirt hem as several long outer arcs, folds suggested by short hatching), bare shoulders,
geometric waist fittings (rectangles with small rivet dots),
ruffled cuffs, ribbon loops at wrists, ribbons wrapped around ankles,
angular glass shards scattered around (contour plus one or two internal facet lines) and ultra-thin light filaments (long curves),
light hatching on shadow sides only, plain white background, centered, lots of empty space
```

### 3.5 English Negative

```
fill, coloring, shading, shadow blocks, gradient, specular highlights, thick paint,
cel shading, watercolor, colored background, complex background, scenery, starfield, nebula,
multiple girls, same character repeated, multiple views, three views, cropped, out of frame,
ground shadow, text, watermark, signature,
thick lines, uneven line weight, broken lines, open contours, blurry, lowres,
photorealistic, photo, 3d render, chibi, child-like, bad hands, extra fingers, extra limbs
```

---

## 四、装饰涂鸦（按主题槽位，全部线稿风）

### 槽位 1：涂鸦主图（对应 `doodle`，侧边大面积）

元素取自素材库：棱角玻璃碎片 + 半透明蛾翼蝴蝶 + 裂纹珍珠球 + 极细光丝。

**中文**
```
一条自左下向右上的斜向装饰线稿轨迹，手绘线稿，单色描边，无填充无明暗无渐变，线条纤细均匀，
主体是数枚棱角玻璃碎片，只勾外轮廓并在每枚上加一到两条内部分面线，
碎片之间穿插两只蝴蝶，只勾翅膀外缘与两条主翅脉，不画翅面斑纹，
下方一枚球体，只勾圆形轮廓并用几段短弧线暗示表面裂纹，
画面中散布极细长曲线（光丝）与四五个四芒星（两根细长交叉线构成），
轮廓闭合，纯白背景，大量留白，无人物，无文字
```
**English**
```
a diagonal decorative line-art trail from lower-left to upper-right,
hand-drawn line art, single-color outline, no fill, no shading, no gradient, thin uniform line weight,
main body is several angular glass shards: outer contour only, plus one or two internal facet lines each,
two butterflies between the shards: wing outline and two main veins only, no wing pattern,
a sphere below: circular contour with a few short arcs suggesting surface cracks,
ultra-thin long curves (filaments) and four or five four-pointed sparkles (two thin crossed lines each) scattered along,
closed contours, plain white background, lots of empty space, no people, no text
```

### 槽位 2：四角星芒（对应 `star`）

**中文**
```
单个四角星芒，由两根细长尖端交叉的线段构成，中心交叉处加一小圈，
手绘线稿，单色描边，无填充，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single four-pointed sparkle made of two thin tapered crossed strokes, with a small circle at the crossing,
hand-drawn line art, single-color outline, no fill, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 3：玻璃碎片（对应 `candy-wrapped`）

**中文**
```
单枚棱角玻璃碎片，不规则多面体，只勾外轮廓并在内部加两到三条分面线，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single angular glass shard, irregular faceted polyhedron, outer contour only plus two or three internal facet lines,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 4：金属几何框（对应 `candy-lollipop`）

**中文**
```
单个矩形几何构件，内部中空，边框上加一排铆钉小圆点，四角有小切角，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single rectangular geometric fitting, hollow center, a row of small rivet dots along the frame, small chamfers at the corners,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 5：蛾翼蝴蝶（对应 `acao-heart`）

**中文**
```
单只蝴蝶，双翼张开左右对称，只勾翅膀外缘与两条主翅脉，触角为两根细长曲线，
轻排线仅用在翅根与身体连接处，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single butterfly, both wings open and symmetrical, wing outline and two main veins only, antennae as two thin curves,
light hatching only where the wings meet the body,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 6：星形机械纹章（对应 `acao-cheer`）

**中文**
```
单个八芒星形纹章，由两层角状构件旋转叠成，每层只勾外轮廓，
中心一个小圆作为核心，四个正方向尖端加小方框，
手绘线稿，单色描边，无填充无明暗，线条纤细均匀，纯白背景，居中，大量留白
```
**English**
```
single eight-pointed star emblem, two layers of pointed parts rotated and stacked, outer contour of each layer only,
a small circle as the core at the center, small square frames at the four cardinal points,
hand-drawn line art, single-color outline, no fill, no shading, thin uniform line weight,
plain white background, centered, lots of empty space
```

### 槽位 7：角线 / 上缘线（对应 `corner-line`、`upper-line`，横长条）

**中文**
```
横长构图装饰线稿，三到四条近乎平行、缓慢发散的长曲线贯穿画面，
沿线点缀少量四芒星与二三枚极小的碎片轮廓，两端渐隐，
手绘线稿，单色描边，线条纤细均匀，纯白背景，大量留白，无文字
```
**English**
```
wide horizontal decorative line art, three or four near-parallel long curves slowly diverging across the frame,
dotted with a few four-pointed sparkles and two or three tiny shard outlines, fading out at both ends,
hand-drawn line art, single-color outline, thin uniform line weight,
plain white background, lots of empty space, no text
```

---

## 五、参数（线稿与渲染图的取法不同）

| 参数 | 值 | 说明 |
|---|---|---|
| 输入预处理 | 裁出单人，或改用"参考图"功能 | 16:9 场景图直接图生图会保留场景 |
| 输出尺寸 | 角色 **832×1216**；涂鸦 1024×1024 或按槽位长宽比 | 别用正方形画立绘 |
| 重绘强度 | **0.6–0.8** | 线稿要"重画"才能去掉原图的填充与明暗，强度低于 0.5 会保留原渲染质感 |
| CFG Scale | **4–6**（比渲染图低） | 线稿是低信息量输出，CFG 高了会硬塞细节、线变毛 |
| 采样器 | DPM++ 2M Karras / Euler a，24–32 步 | 线稿不需要太多步数 |
| 一致性 | 固定 checkpoint + seed，整套素材同一个模型 | 否则线宽和线色会飘 |

**平台写法**

| 平台 | 关键点 |
|---|---|
| NijiJourney / Midjourney | `--iw 1.2 --ar 2:3 --niji 6 --style raw`；线稿风可试 `line art` 加权 |
| NovelAI | `lineart` 作为主 tag；img2img 强度 0.65–0.8；权重 `{{lineart}}` |
| WebUI / ComfyUI / Liblib | 建议配 ControlNet `lineart` / `softedge` 锁轮廓，再让提示词决定线宽线色 |
| 即梦 / 通义万相 / 可灵 | 中文提示词直接可用；可灵对"线稿"理解较好，但要注意它倾向补色，负面词里务必写"无填充、不上色" |

**线色怎么落**：想复刻基准图的淡桃粉，把提示词里的冷色描述换成
`pale peach-pink strokes #fcccbc`；想跟 cosmic-glass 主题一致，就用 `ice white #cfe0ee`。
另外生成器的"线色"很难精确控制，**最终线色建议交给主题 CSS**——线稿只要 alpha 干净，
浅色模式下 `mask + 纯色填充` 会用我们指定的主题色重画一遍，比让模型调准颜色可靠得多。

---

## 六、出图后自检（线稿版）

1. **无填充**：放大看线条内部必须是背景色，出现色块就是跑偏（这是最常见的失败）
2. **无明暗**：不能有阴影块、渐变、高光斑
3. **线宽一致**：同一张图里线的粗细不应有明显跳变
4. **轮廓闭合**：断线会让浅色模式的蒙版边缘发毛
5. **着墨比例**：目测应接近基准图的 **8–10%**；超过 20% 说明模型加了排线或填充，重出
6. **背景干净**：纯白或透明；有纹理、有场景就废了
7. **长宽比**：按槽位要求出，长条槽位别出成方形（会被拉伸或留大片空白）

**出图后不用做的事**：线稿生成在纯白底上是常态，不需要抠底工具；如果有轻微灰底，
用 `tools/extract-art.js`（边缘连通 + 厚度检测）跑一遍即可，实测对浅底深线的图很干净。
