# Design System — `painting-skin-theme` (ZCode 皮肤注入器)

## 1. Product context

**What it is.** A Windows Electron desktop utility that injects a *skin* (stylesheet + page runtime + artwork)
into an **already-running ZCode instance** over CDP (`--remote-debugging-port`, default 9344).
It never touches the install directory, never rewrites launch arguments, never edits user config files —
apply and remove are entirely runtime operations and fully revertible.

**Why it exists.** ZCode ships 33 hand-built skins in this repo but has no skin switch of its own, and its
Chromium shell can only be reached over a debug port that **must be present at launch**. A user who
double-clicked ZCode has no debug port, so every injection fails with no in-app remedy. This app closes
that gap: it finds ZCode, and can relaunch it *with* a debug port and then inject.

**Who uses it.** The author and power users who run ZCode all day with a specific character skin, and who
care whether the injection actually took — the app's stated contract is
**"全绿才算成功"** (all checks green = success), explicitly *not* "no error was thrown".

**Jobs to be done, in priority order**

1. **换皮肤** — swap to another skin, hot, without restarting ZCode. *(most frequent; today: a ‹ › stepper over 33 items)*
2. **知道到底成没成** — see *which* of the 13 post-injection checks passed. *(today: a 3-second text flash on one button)*
3. **修好"没有调试口"** — detect the missing-debug-port failure and recover by relaunching ZCode. *(today: the primary button silently changes identity)*
4. **决定注入什么内容** — pick the pet, toggle the 7 usage-bar items, choose polarity. *(today: pet only; usage toggles live inside ZCode's page)*
5. **看用量** — read token usage/tps/sub-agent spend. *(today: inside ZCode's page, never in this app)*

## 2. Architecture & surfaces

```
src/main.ts        Electron shell: 620×745 transparent frameless window, tray, IPC, relaunch progress
src/panel.html     THE ENTIRE UI — markup + inline CSS + inline JS (496 lines, no framework, no bundler)
src/cli.ts         13 headless commands with full parity; `cli.js panel` prints exactly what the panel renders
src/target-app.ts  locate ZCode → detect running state → taskkill → relaunch with --remote-debugging-port
src/injector.ts    build the CDP payload; run the 13 review checks
src/pet.ts         6 pets × 11 state GIFs, 120 ms hop loop along the input box
src/usage-*.ts     SQLite aggregation + a resident pump that pushes stats into ZCode's page
themes/<id>/       33 skins: theme.json + skin/*.css + assets/*.png|webp|webm
```

**Shell facts that constrain any design**

- Window is `transparent: true, frame: false, hasShadow: false, resizable: false`, `620 × 745`.
  The board and cards draw their own shapes; **everything outside them shows the user's desktop wallpaper**.
  Consequence: *you cannot rely on a page background.* Every new surface must carry its own sufficiently
  opaque fill — 13px light text over an arbitrary wallpaper is the failure mode to avoid.
- There are **no scrollbars** (`body { overflow: hidden }`).
- `×` **hides to tray** (injection and the usage pump keep running); `−` minimises. Quit is tray-only.
- The board area is one big drag handle; controls opt out with `-webkit-app-region: no-drag`.
- A redesign needing more room must state the new `BrowserWindow` size — the board is measured against it.
- UI copy is **Simplified Chinese**, terse and technical. Preserve it.
- Skin names are Chinese, 2–12 chars, often `色名 · 代号` (e.g. `霜蓝 · c581`, `蝶舞华章 · 伊内丝`).
  The 33 skins group by source: NIKKE 24 · 明日方舟 5 · 鸣潮/绝区零 2 · 静态 1 · baseline `diana` 1.
  32 are motion skins (VP9+alpha `.webm`); only `diana` and `butterfly-line` are still-only.
- A skin's manifest carries an `author` field that is really a **provenance string** (source, pipeline,
  benchmark) and a `notes[]` of long technical remarks. They belong in a detail view, never on a card face.
- The panel shows each skin's **still frame** (`assets/character-still.webp`); it does not play the motion art.

## 3. Branding — the material systems

### 3.1 Material system A — "手裁板 / Hand-cut Vanity" (brand default, in production)

Lineage is deliberate and documented in the source: the chrome models **Diana Multi-App Launcher**'s packer UI.

- **The board is an irregular hand-cut polygon** (38 points, asymmetric: bulges upper-right, staircase down
  the right edge, tucks in lower-left). Never a rounded rectangle.
- **The portrait is its own unclipped layer**, drawn *larger than the board* so hair and arms overflow the edge.
- **The control deck is a horizontal bar that overflows the board** by 14px on each side.
- **Angular notches everywhere, radii almost never** — hexagons, half-hexagons and octagons via `clip-path`.
  Only two `3px` radii exist in the whole app.
- Surfaces are **gradients, never flat fills**; borders are `1px` brand-alpha tints (16% → 22% → 42%).
- Six tiny star specks float inside the board at 55% opacity.

### 3.2 Material system B — "毛玻璃 / Frosted Glass" (sanctioned alternative)

Sanctioned for exploratory directions only; it is **not** the production chrome.
Graphite/neutral base, translucent panels with `backdrop-filter: blur()`, hairline 1px light borders,
soft large-radius corners, generous padding, one saturated accent. No hand-cut polygon, no star specks.
Under B the board silhouette may relax to a rounded rectangle **but the transparent-window rule still holds**:
frosted panels must stay opaque enough to keep 13px text legible over an arbitrary wallpaper.

### 3.3 Adaptive accent (applies to both systems)

Every skin ships `skin/zcode-tokens.css` documenting its own palette (e.g. `ines-line`: 暗夜 accent `#3c8edd`,
日间 accent `#185691`, family centre hue 209°). **The app chrome may tint its accent from the active skin's
documented accent**, so the injector visibly belongs to the skin it is currently applying.
The base tokens below remain the structural palette; an adaptive accent replaces only the accent pair.

### 3.4 Material system C — 「情报页 · 抽屉」(reference-derived, direction C only)

**Style source, not a blend.** Extracted from a user-named reference: a 鸣潮-themed front-end piece
(B站 `BV15AsLeWEBo`, 3:08) whose layout is built around an expanding-panel **drawer strip**.
Per the one-style-source rule, a direction C generation adopts this DNA **instead of** Material A or B —
it does not combine with them. The six key frames are attached to the canvas as temporary visual references.

Palette sampled from the real frames (quantised, browser chrome cropped):

| Role | Value | Notes |
|---|---|---|
| Page base | `#171718` · `#1b1c1d` · `#242426` | neutral near-black charcoal — **85–90 % of every frame**; no colour cast |
| Raised panel | `#22201c` (warm) · `#1c1e21` (cool) | panels/overlays, barely lifted off the base |
| Accent — bright gold | `#f4cc6d` | active tab underline, hot gold, small areas only |
| Accent — mid gold | `#d8a166` · `#c9a227` | hairlines, active panel outline, key headings |
| Accent — deep gold | `#96714f` · `#684d30` | dimmed gold, secondary rules, inactive ornament |
| Text — warm white | `#f6e9dc` | headings and body on dark, *not* pure white |
| Text — secondary | `#a3a2a2` · `#9ea29d` | labels, captions, dates |
| Text — dim | `#5a5858` | disabled/inactive, collapsed drawers |
| Hairline | `rgb(255 255 255 / 8–14 %)` or gold at low alpha | 1px, everywhere; structure is drawn by hairlines, not by fills |

Status colours stay identical to A/B (`#57b98a` / `#d9a24a` / `#d96a6a`) — never re-tint these to gold.

**Layout grammar taken from the reference**

1. **Top bar**: wordmark left (large + tiny secondary line), six tracked tabs right; the active tab gets a
   **gold underline plus a small bracket ornament**; one or two round icon buttons at the far edge.
2. **Section heading**: very large Latin word (e.g. `NEWS`) or a stacked **English line above a Chinese line**
   at display size, with generous letter-spacing. Gold or warm white.
3. **Sub-tab row**: small text tabs, active one underlined in gold.
4. **Hairline row list**: each row = a small pill badge + a single-line truncated title + a right-aligned date;
   rows separated by hairlines; the hovered row lifts very slightly. No card fills.
5. **THE DRAWER STRIP (the signature — this is what "抽屉式" means)**: a row of equal-height, tall narrow
   slats — roughly 1:3 to 1:4 width-to-height. **One slat is open**: it expands to full art width and full
   brightness with a **1px gold outline**. The others collapse narrow, dim (`#5a5858`-level), and desaturate.
   Round `‹` `›` arrow buttons flank the strip; a **thin gold progress line** along the bottom tracks position.
   Expansion animates width *and* brightness together — that paired change is what reads as a drawer opening.
6. **Left info column**: a large, very faint emblem/line-art watermark, a horizontal hairline, then the
   English title and the Chinese title stacked at display size, then a short body paragraph.
7. **Dense grid**: equal-width cards, ~6 columns, each a tall image with a small pill caption at its
   bottom-left, 1px hairline border, minimal gap.
8. **Large preview**: one rounded (8–12px) bordered preview panel.
9. **Footer affordance**: a small outlined button with a trailing arrow (`MORE →`).
10. A thin gold progress line sits at the bottom-left of the section.

**Motion**: the drawer opening is the protagonist (width + brightness + saturation together, ~320–420ms,
calm ease-out — no bounce). Paging slides neighbouring slats. Hairlines and the active underline travel
to the newly active item. Artwork is the only source of colour in the frame; chrome stays monochrome + gold.

## 4. Design tokens

### Color — brand default (Material A)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#f6eef2` | primary text |
| `--muted` | `#b9a6b0` | secondary text, labels |
| `--pink` | `#e2557a` | brand primary |
| `--pink-bright` | `#ff7ba3` | hover / active fill top / lit star |
| `--coral` | `#d86e91` | glyphs, tertiary accent |
| `--board` | `#191320` | board interior top |
| `--board-2` | `#120e18` | board interior bottom |
| `--line` | `rgb(226 85 122 / 42%)` | active border |
| `--ok` | `#57b98a` | debug port live · check passed |
| `--warn` | `#d9a24a` | warning · degraded |
| `--bad` | `#d96a6a` | port missing · not running · check failed |

Brand-hue alpha ladder in use: `10%` hover wash · `16%` · `22%` · `24%` · `26%` · `42%` active border.
Neutrals for raised control fills: `#241d2f → #1b1624`, `#221b2c → #191420`, `#1d1726 → #171220`.

### Color — Material B (frosted glass)

| Role | Value |
|---|---|
| Shell base | `#15171c` @ ~72% + `backdrop-filter: blur(18px) saturate(140%)` |
| Panel | `#1c1f26` @ ~66% |
| Raised | `#24282f` @ ~78% |
| Hairline border | `rgb(255 255 255 / 9%)`, hover `rgb(255 255 255 / 16%)` |
| Text primary / secondary | `#eef1f5` / `#9aa3b0` |
| Accent | active skin's documented accent (fallback `#4f9dd8`) |
| ok / warn / bad | same semantics as A: `#57b98a` / `#d9a24a` / `#d96a6a` |

### Typography

One family, two systems: `"Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif`.
Base `13px / 1.6`, `-webkit-font-smoothing: antialiased`, `user-select: none`.

| Role | Size / weight / tracking |
|---|---|
| Hero skin name | 18px / 700 / `.05em` |
| Primary action | 17px / 700 / `.1em` |
| Control + body | 13px |
| Micro (path, badges) | 11px |
| Tracked micro-label (`皮肤`, `桌宠`, `ZCode`) | 10px / `.12em` |

Latin technical strings (`c581-line`, `adapterVersion`, file paths) sit beside Chinese text constantly —
use tabular/monospace only for numbers and paths if alignment genuinely helps; never as the UI font.

### Spacing & sizing

4-6-7-8px rhythm inside the deck; `12px 20px 14px` deck padding; control heights
36 (cycler) · 40 (mode) · 54 (primary actions) · 30 (status row) · 22 (row buttons) · 6px status dot · 10px stars.

### Radii & elevation

Radii effectively absent in A (clip-path shapes; only two `3px`). Elevation is brand-tinted, not grey:

| Element | Shadow |
|---|---|
| board ring | `drop-shadow(0 0 22px rgb(226 85 122 / 30%))` |
| deck | `0 10px 26px rgb(0 0 0 / 45%)` |
| primary | `0 6px 20px rgb(226 85 122 / 32%)` |
| pressed mode | `0 0 16px rgb(226 85 122 / 42%)` |
| portrait | `drop-shadow(0 14px 30px rgb(0 0 0 / 62%))` |

### Motion

- Portrait swap: `swap-in 340ms cubic-bezier(.2,.78,.24,1)` — opacity 0→1, `translateY(14px)→0`, `scale(.97)→1`.
- Control transitions: 160ms ease on color/background/border-color. Primary `:active` sinks 1px.
- Failure tint: whole primary button `hue-rotate(-40deg) saturate(1.2)`.
- State changes must be **legible while they happen**: relaunch is a 15 s+ operation that reports
  `关闭中 / 启动中 / 注入中…`, so any redesign needs a live-progress surface that is not a button label.
- `prefers-reduced-motion` is not handled today; new motion should handle it.

## 5. Hard requirements for this redesign

1. **Surface the skin library.** 33 skins with names, source group and motion/still badge; searchable or
   filterable; selecting one is a single action. A 1-step stepper over 33 items is the defect being fixed.
2. **Surface the 13 review checks.** Individual pass/fail lines with the real check names, and a plain
   summary (`全绿` vs `N 项未通过`). Failed items must be readable, not truncated onto a button.
3. **Separate the feedback channels.** Live progress, review verdict, and the "重启 ZCode 并注入" recovery
   identity must be distinct surfaces. The primary button keeps exactly one label.
4. **Keep the target/debug-port health row** and its two recovery actions (默认路径 / 选择…).
5. **Give the 7 usage-bar items a home** (context · current turn · session total · tools · today ·
   sub-agents · tps) plus pump status (`fs.watch` → debounce 120ms → throttle 400ms → CDP push, 30s heartbeat).
6. **Keep pet selection**, and show which of the 11 states the pet is in.
7. **Preserve the identity of Material A** unless a direction deliberately opts into Material B.
8. **Chinese, terse, technical copy.** No marketing tone.
9. Stay **legible over an arbitrary desktop wallpaper** — every new surface needs its own opaque-ish fill.
10. Any layout needing more than 620×745 must state the new window size and keep it non-scrolling
    or introduce scrolling deliberately.

## 6. Fidelity constraint (applies to every generation)

Use ONLY the fonts, colors, spacing and component styles defined in this design system.
Do not introduce any font family, color, or visual style that is not defined here.
Material A is the default chrome; Material B is permitted only when a prompt explicitly requests it;
Material C (§3.4) likewise, and when C is requested it **replaces** A and B for that direction rather than
blending with them. Accent tinting must come from the active skin's documented accent, never an invented color —
except under Material C, where the fixed gold family above is the accent system and skin-derived accent
tinting does not apply.
