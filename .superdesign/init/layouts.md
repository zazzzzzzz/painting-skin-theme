# layouts.md — Shared layout of the injector app

Single window, single view. There is no router, no app shell with nav/sidebar/footer, no page stack.
**The whole application UI is one file: `src/panel.html`.**

## View hierarchy (the only rendered layout)

`src/panel.html` — full source of the shell markup:

```html
<body>
  <div class="dragbar"></div>

  <div class="stage-wrap">
    <div class="board"></div>
    <div class="board-stars"></div>
    <div class="portrait-layer" id="portrait"></div>
    <div class="portrait-empty" id="portrait-empty" hidden>该皮肤没有立绘素材</div>

    <div class="head">
      <div class="brand">
        <span class="brand-name" id="skin-name">加载中…</span>
        <span class="stars" id="stars"><i></i><i class="dim"></i><i class="dim"></i><i class="dim"></i><i class="dim"></i><i class="dim"></i></span>
      </div>
      <div class="win">
        <button id="win-min" title="最小化">−</button>
        <button id="win-close" title="最小化到系统托盘">×</button>
      </div>
    </div>

    <div class="deck">
      <!-- .cycler (皮肤) · .cycler (桌宠) · .modes · .actions · .target -->
    </div>
  </div>
</body>
```

Layer stack (z-index, bottom → top):

| z | Layer | Role |
|---|---|---|
| 1 | `.board::before` + `::after` | the hand-cut board geometry: brand gradient ring + dark interior |
| 2 | `.board-stars` | 6 tiny brand radial-gradient star dots, `opacity .55` |
| 3 | `.portrait-layer` | the hero character art — **above the board, not clipped by it, larger than the board** |
| 5 | `.head` | brand name + 5-star row, window buttons |
| 6 | `.deck` | the control bar (overflows the board by `-14px` each side) |
| 9 | `.dragbar` | invisible full-width drag strip |

Constraining shell CSS:

```css
.stage-wrap {
  -webkit-app-region: drag;      /* whole board is a drag handle */
  position: relative;
  width: 560px;
  height: 700px;
  margin: 16px auto 0;
}

/* ---------- board frame: background layer only, never receives hits ---------- */
.board { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
.board::before,
.board::after { position: absolute; inset: 0; content: ""; }
.board::before {
  background: linear-gradient(155deg, var(--pink-bright) 0%, var(--pink) 38%, #7d3050 78%, #5e2440 100%);
  clip-path: var(--board-shape);
  filter: drop-shadow(0 0 22px rgb(226 85 122 / 30%));
}
.board::after {
  inset: 4px;
  background:
    radial-gradient(120% 70% at 78% 4%, rgb(255 123 163 / 8%), transparent 60%),
    radial-gradient(90% 60% at 12% 96%, rgb(216 110 145 / 7%), transparent 62%),
    linear-gradient(180deg, var(--board) 0%, var(--board-2) 100%);
  clip-path: var(--board-shape);
}
/* star specks inside the board */
.board-stars {
  position: absolute; inset: 0; z-index: 2; pointer-events: none; opacity: .55;
  background:
    radial-gradient(2px 2px at 16% 22%, var(--pink-bright), transparent 62%),
    radial-gradient(2px 2px at 84% 15%, var(--coral), transparent 62%),
    radial-gradient(1.6px 1.6px at 28% 62%, var(--coral), transparent 62%),
    radial-gradient(1.6px 1.6px at 74% 47%, var(--pink-bright), transparent 62%),
    radial-gradient(1.4px 1.4px at 44% 30%, var(--pink-bright), transparent 62%),
    radial-gradient(1.4px 1.4px at 88% 70%, var(--coral), transparent 62%);
}

/* ---------- portrait: own layer, unclipped, bigger than the board ---------- */
.portrait-layer {
  position: absolute;
  z-index: 3;                     /* above the board frame */
  left: -9%;
  bottom: 6%;
  width: 118%;                    /* wider than the board → overflows both sides */
  height: 96%;
  background-position: center bottom;
  background-repeat: no-repeat;
  background-size: contain;
  filter: drop-shadow(0 14px 30px rgb(0 0 0 / 62%));
  pointer-events: none;
}
.portrait-layer.swap { animation: swap-in 340ms cubic-bezier(.2,.78,.24,1); }
@keyframes swap-in { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
.portrait-empty {
  position: absolute; z-index: 3; left: 0; right: 0; bottom: 42%;
  text-align: center; color: var(--muted); font-size: 12px;
}

/* ---------- header ---------- */
.head {
  position: absolute; z-index: 5;
  top: 44px; left: 46px; right: 74px;
  display: flex; align-items: flex-start; justify-content: space-between;
}
.brand { display: flex; flex-direction: column; gap: 2px; }
.brand-name { font-size: 18px; font-weight: 700; letter-spacing: .05em; }

/* ---------- control deck: horizontal bar, slightly wider than the board ---------- */
.deck {
  -webkit-app-region: no-drag;   /* controls don't drag the window */
  position: absolute; z-index: 6;
  left: -14px; right: -14px; bottom: 26px;
  padding: 12px 20px 14px;
  background: linear-gradient(180deg, rgb(28 21 37 / 92%), rgb(17 13 24 / 96%));
  border-top: 1px solid rgb(226 85 122 / 24%);
  border-bottom: 1px solid rgb(226 85 122 / 16%);
  box-shadow: 0 10px 26px rgb(0 0 0 / 45%);
  clip-path: polygon(2.5% 4%, 97.5% 4%, 100% 26%, 99% 74%, 96.5% 96%, 3.5% 96%, 1% 74%, 0 26%);
}
```

## Electron shell (from `src/main.ts`)

```ts
const window = new BrowserWindow({
  title: 'Painting Skin Theme',
  icon: fs.existsSync(ICON) ? ICON : undefined,
  width: 620,
  height: 745,
  // transparent + frame:false → only the board and cards' own shapes are visible,
  // everything else shows the desktop through. A rectangular background would expose a square border.
  transparent: true,
  frame: false,
  hasShadow: false,
  resizable: false,
  autoHideMenuBar: true,
  webPreferences: { nodeIntegration: true, contextIsolation: false },
});
void window.loadFile(path.join(PROJECT_ROOT, 'src', 'panel.html'));

// tray
tray.setToolTip('Painting Skin Theme');
tray.setContextMenu(Menu.buildFromTemplate([
  { label: '显示面板', click: showPanel },
  { type: 'separator' },
  { label: '退出', click: () => { isQuitting = true; app.quit(); } },
]));
tray.on('click', showPanel);
```

`resizable: false` and the `620 × 745` size are **hard constraints of the current build** — a redesign
that needs more room must state the new window size explicitly, because the board (`560 × 700`)
is measured against it and the transparent window has no scrollbars (`body { overflow: hidden }`).
