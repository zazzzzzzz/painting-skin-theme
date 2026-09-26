# extractable-components.md — Components worth extracting as Superdesign DraftComponents

The project is one 496-line `panel.html`, so there are no React/Vue components to lift verbatim.
Listed below are the **UI blocks that recur or that a multi-pane redesign will need more than once**,
which makes them worth extracting so the chrome stays consistent across generated pages.

## BoardFrame
- Source: `src/panel.html` (`.board`, `.board::before/::after`, `.board-stars`)
- Category: layout
- Description: The signature irregular hand-cut board — brand gradient ring layer plus dark interior, star specks. Non-interactive background layer.
- Extractable props: `shapeVariant` (string, default: the 38-point `--board-shape`), `glow` (boolean, default: true)
- Hardcoded: the `155deg` ring gradient stops, the two interior radial washes, the 6 star positions, `inset: 4px`

## PortraitStage
- Source: `src/panel.html` (`.portrait-layer`, `.portrait-empty`, `@keyframes swap-in`)
- Category: layout
- Description: Hero artwork layer that deliberately overflows the board (`left: -9%`, `width: 118%`), unclipped, with a swap-in animation and a muted empty state.
- Extractable props: `portraitUrl` (string, default: ""), `showEmptyState` (boolean, default: false)
- Hardcoded: the overflow geometry, `drop-shadow(0 14px 30px rgb(0 0 0 / 62%))`, the 340ms `swap-in` timing, the text `该皮肤没有立绘素材`

## SkinCycler
- Source: `src/panel.html` (`.cycler` with `#skin-cycle`)
- Category: basic
- Description: Stepper for the active skin. **Candidate for replacement by a library grid** — 33 skins sit behind a one-step-at-a-time control.
- Extractable props: `value` (string, default: "—"), `canPrev` (boolean), `canNext` (boolean)
- Hardcoded: the `‹`/`›` glyphs, the `皮肤` label, hexagon clip-path, the 3-column `32px 1fr 32px` grid

## PetCycler
- Source: `src/panel.html` (`.cycler` with `#pet-cycle`)
- Category: basic
- Description: Identical component to SkinCycler, bound to the 6 pets (one entry is the `不显示` / none option), label `桌宠`.
- Extractable props: `value` (string, default: "—")
- Hardcoded: the `桌宠` label, everything else shared with SkinCycler

## ModeSwitch
- Source: `src/panel.html` (`.modes`, `.modes button[aria-pressed="true"]`)
- Category: basic
- Description: Three-state segmented control for polarity (`dark` / `light` / `auto`); pressed state is bright brand fill + glow.
- Extractable props: `mode` (string, default: "auto")
- Hardcoded: the ☾ / ☀ / ⚙ glyphs, the labels 暗夜 / 日间 / 跟随系统, hexagon clip-path

## ActionDeck
- Source: `src/panel.html` (`.actions`, `.primary`, `.secondary`)
- Category: basic
- Description: Primary + secondary action row. The primary button currently carries all feedback (progress, review verdict, and the relaunch recovery identity) — a redesign should split that load.
- Extractable props: `primaryLabel` (string, default: "注入并挂载"), `primaryState` (string: "idle" | "busy" | "ok" | "fail", default: "idle"), `showRecovery` (boolean, default: false)
- Hardcoded: the 54px height, the brand gradient fill, the octagon clip-path, `hue-rotate(-40deg) saturate(1.2)` failure tint

## TargetStatusRow
- Source: `src/panel.html` (`.target`, `.dot`, `.target button`)
- Category: basic
- Description: The ZCode target health row — status dot, exe path with a suffix describing run state, and two recovery buttons.
- Extractable props: `dotState` (string: "ok" | "bad", default: "bad"), `path` (string), `stateSuffix` (string, default: ""), `source` (string)
- Hardcoded: the `ZCode` label, the `默认路径` / `选择…` button labels, the 6px dot

## StarRating
- Source: `src/panel.html` (`.stars`)
- Category: basic
- Description: Five four-point stars lighting up to the active skin's index. Decorative only.
- Extractable props: `litCount` (number, default: 1, 0–5)
- Hardcoded: the four-point star clip-path, the `--pink-bright` / `rgb(226 85 122 / 26%)` pair

## WindowControls
- Source: `src/panel.html` (`.win`)
- Category: layout
- Description: Frameless-window `−` (minimise) and `×` (hide to tray) buttons.
- Extractable props: none
- Hardcoded: glyphs, `26 × 24`, and the tooltip text `最小化到系统托盘`

### Not extractable / skip

Button, dot, checkbox and label primitives are too small to warrant extraction — inline them.
The usage-bar gear panel and review checklist have **no current markup in the panel** (they live inside
ZCode's page or nowhere), so they must be designed fresh rather than extracted.
