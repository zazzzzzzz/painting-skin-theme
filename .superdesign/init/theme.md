# theme.md — Design tokens of `painting-skin-theme` (the injector app's own chrome)

The app has **no Tailwind, no CSS framework, no component library**. The entire design system is
one inline `<style>` block in `src/panel.html`, based on CSS custom properties.

Style lineage (stated in the source as intentional, not accidental):
the board chrome is modelled on **Diana Multi-App Launcher**'s packer UI —
① the board frame is an **irregular hand-cut polygon** (asymmetric, multi-step notches), NOT a rounded rectangle;
② the **portrait is a separate layer that is not clipped by the board** and is drawn larger than the board
(hair/arms overflow the edges); ③ the button deck is a horizontal bar that slightly overflows the board width;
④ status cards sit outside the board, joined by two small hooks.

---

## Part 1 — Compact token summary

### Color tokens (`:root` in `src/panel.html`)

| Token | Value | Use |
|---|---|---|
| `--ink` | `#f6eef2` | primary text (near-white, faint pink cast) |
| `--muted` | `#b9a6b0` | secondary/label text |
| `--pink` | `#e2557a` | brand primary |
| `--pink-bright` | `#ff7ba3` | brand bright / hover / active fill top |
| `--coral` | `#d86e91` | button glyphs, tertiary accent |
| `--board` | `#191320` | board interior top |
| `--board-2` | `#120e18` | board interior bottom |
| `--line` | `rgb(226 85 122 / 42%)` | active border |
| `--ok` | `#57b98a` | success dot / passed check |
| `--warn` | `#d9a24a` | warning |
| `--bad` | `#d96a6a` | failure dot / failed check |

Recurring alpha values of the brand hue used inline (not tokenised):
`rgb(226 85 122 / 10%)` hover wash · `/16%` · `/22%` · `/24%` · `/26%` · `/42%` (active border).

### The signature geometry — `--board-shape`

A 38-point `clip-path: polygon()` that renders the "hand-cut" board. It is deliberately **asymmetric**:
bulges out on the upper-right, has a multi-step staircase down the right edge, and tucks in on the lower-left.

```css
--board-shape: polygon(
  7% 3.2%, 14% 1%, 40% 1.6%, 44% 0.4%, 63% 0.4%, 67% 1.8%,
  84% 1.6%, 92% 4.6%, 95.5% 10%, 91% 16%, 96% 21%, 92% 27%,
  96.5% 33%, 91.5% 40%, 97% 46%, 92% 53%, 96% 59%, 90.5% 65%,
  94% 72%, 88% 78%, 91% 84%, 83% 88%, 74% 91%, 60% 90%,
  52% 92.5%, 40% 91%, 26% 92.5%, 14% 90%, 6% 85%, 2.5% 76%,
  4% 66%, 1% 58%, 4.5% 47%, 1.5% 39%, 5% 30%, 2% 22%, 6% 15%, 3.5% 9%
);
```

Smaller angular notches (the "cut corner" family used on controls) — all are 6–8 point polygons, never `border-radius`:

| Element | clip-path |
|---|---|
| `.deck` | `polygon(2.5% 4%, 97.5% 4%, 100% 26%, 99% 74%, 96.5% 96%, 3.5% 96%, 1% 74%, 0 26%)` |
| `.cycler` | `polygon(2% 0, 98% 0, 100% 26%, 100% 74%, 98% 100%, 2% 100%, 0 74%, 0 26%)` |
| `.modes button` | `polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)` (a hexagon) |
| `.primary` | `polygon(3% 0, 97% 0, 100% 28%, 100% 72%, 97% 100%, 3% 100%, 0 72%, 0 28%)` |
| `.target` | `polygon(1.5% 0, 98.5% 0, 100% 50%, 98.5% 100%, 1.5% 100%, 0 50%)` |
| `.stars i` (four-point star) | `polygon(50% 0, 62% 36%, 100% 50%, 62% 64%, 50% 100%, 38% 64%, 0 50%, 38% 36%)` |

### Typography

- Single family everywhere: `"Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif`
- Base: `13px / 1.6`, `-webkit-font-smoothing: antialiased`
- Brand name `.brand-name`: `18px / 700 / letter-spacing .05em`
- Primary button `.primary`: `17px / 700 / letter-spacing .1em`
- Control text: `13px` (`.cycler .value`, `.modes button`)
- Micro labels: `11px` (`.target`), `10px` with `letter-spacing .12em` (`.cycler .label`, uppercase-ish tracked caps)
- `user-select: none` globally

### Spacing & sizing

| Thing | Value |
|---|---|
| Window | `620 × 745`, `resizable: false`, `transparent: true`, `frame: false`, `hasShadow: false` |
| `.stage-wrap` (board) | `560 × 700`, `margin: 16px auto 0` |
| Drag bar | full width, `34px`, `-webkit-app-region: drag` |
| Gaps | `6px` (mode grid gap, deck row gap), `7–8px` (vertical rhythm in deck) |
| Deck padding | `12px 20px 14px`, `left/-right: -14px` (overflows board) |
| Control heights | `.cycler` 36 · `.modes button` 40 · `.primary` / `.secondary` 54 · `.target` 30 |
| Window buttons | `26 × 24` |
| Stars | `10 × 10`, gap `4px` |
| Board inner inset | `4px` (`.board::after { inset: 4px }`) |

### Borders / radii policy

**Radii are almost absent by design** — shapes come from `clip-path`.
Only two exceptions: `.target button` and `.secondary` use `border-radius: 3px`.
Borders are always `1px solid` in a brand-alpha tint (`/16%` idle → `/22%` → `--line` on hover).

### Elevation

| Element | Shadow |
|---|---|
| `.board::before` | `filter: drop-shadow(0 0 22px rgb(226 85 122 / 30%))` |
| `.deck` | `box-shadow: 0 10px 26px rgb(0 0 0 / 45%)` |
| `.primary` | `box-shadow: 0 6px 20px rgb(226 85 122 / 32%)` |
| `.modes button[aria-pressed=true]` | `box-shadow: 0 0 16px rgb(226 85 122 / 42%)` |
| `.portrait-layer` | `filter: drop-shadow(0 14px 30px rgb(0 0 0 / 62%))` |

### Surfaces (gradients, not flat fills)

- Board border ring: `linear-gradient(155deg, var(--pink-bright) 0%, var(--pink) 38%, #7d3050 78%, #5e2440 100%)`
- Board interior: two radial brand washes at 8%/7% over `linear-gradient(180deg, var(--board), var(--board-2))`
- `.deck`: `linear-gradient(180deg, rgb(28 21 37 / 92%), rgb(17 13 24 / 96%))`
- Control idle: `linear-gradient(180deg, #241d2f, #1b1624)` / `#221b2c → #191420`
- Primary active: `linear-gradient(180deg, var(--pink-bright), var(--pink) 55%, #b83f63)`

### Motion

- `swap-in 340ms cubic-bezier(.2,.78,.24,1)` — portrait swap: `opacity 0→1`, `translateY(14px)→0`, `scale(.97)→1`
- Button transitions: `color/background/border-color 160ms ease`
- `:active` on primary: `transform: translateY(1px)`
- `prefers-reduced-motion` is **not** handled today.

### Semantic status colors (used by the dot + review checks)

`--ok #57b98a` (debug port live / check passed) · `--bad #d96a6a` (no debug port / not running / check failed) ·
`--warn #d9a24a`. The failed-injection state is additionally signalled by
`filter: hue-rotate(-40deg) saturate(1.2)` applied to the whole primary button (`.flashButton`).

### Window / shell facts that constrain the design

- Board area is entirely draggable (`-webkit-app-region: drag`); interactive controls opt out with `no-drag`.
- No system titlebar — `−` (minimise) and `×` (**minimise to tray**, not quit) are self-drawn.
- Closing hides to a **system tray** icon (self-drawn four-point star); tray menu = 显示面板 / 退出.
- Window is transparent: the board and cards draw their own shapes; everything else shows the desktop through.
  A rectangular background here would expose a square border.

---

## Part 2 — Raw source dumps

### `src/panel.html` — full token + geometry block (lines 12–50)

```css
:root {
  --ink: #f6eef2;
  --muted: #b9a6b0;
  --pink: #e2557a;
  --pink-bright: #ff7ba3;
  --coral: #d86e91;
  --board: #191320;
  --board-2: #120e18;
  --line: rgb(226 85 122 / 42%);
  --ok: #57b98a;
  --warn: #d9a24a;
  --bad: #d96a6a;
  --board-shape: polygon(
    7% 3.2%, 14% 1%, 40% 1.6%, 44% 0.4%, 63% 0.4%, 67% 1.8%,
    84% 1.6%, 92% 4.6%, 95.5% 10%, 91% 16%, 96% 21%, 92% 27%,
    96.5% 33%, 91.5% 40%, 97% 46%, 92% 53%, 96% 59%, 90.5% 65%,
    94% 72%, 88% 78%, 91% 84%, 83% 88%, 74% 91%, 60% 90%,
    52% 92.5%, 40% 91%, 26% 92.5%, 14% 90%, 6% 85%, 2.5% 76%,
    4% 66%, 1% 58%, 4.5% 47%, 1.5% 39%, 5% 30%, 2% 22%, 6% 15%, 3.5% 9%
  );
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: transparent;
  color: var(--ink);
  font: 13px/1.6 "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  overflow: hidden;
}
.dragbar { position: fixed; top: 0; left: 0; right: 0; height: 34px; -webkit-app-region: drag; z-index: 9; }
```

### Theme content tokens (NOT the app chrome)

The 33 injected skins carry their own token files inside `themes/<id>/skin/`
(`zcode-tokens.css` per theme; e.g. `ines-line` documents 暗夜 accent `#3c8edd`, 日间 accent `#185691`,
family centre hue 209°). These are **content shipped by the app**, not the chrome palette —
do not confuse them with the injector's own tokens above. A design direction may legitimately
*tint the app chrome from the active skin's accent*, but must not silently replace the brand tokens above.
