# components.md — UI primitives of the injector app

There is no component library and no framework: every "component" is a CSS class block plus a small
piece of markup inside `src/panel.html`. Full source for each follows.

---

## Cyclers (`.cycler`) — skin selector and pet selector

Two instances: `#skin-cycle` (33 skins) and `#pet-cycle` (6 pets). A `‹ LABEL value ›` row.
The value is the only place the current skin/pet name appears; it ellipsises.
**This is the component the redesign most needs to replace** — 33 items behind a 1-step stepper.

```css
.cycler {
  display: grid; grid-template-columns: 32px 1fr 32px; align-items: center;
  height: 36px; margin-bottom: 6px;
  background: linear-gradient(180deg, #241d2f, #1b1624);
  border: 1px solid var(--line);
  clip-path: polygon(2% 0, 98% 0, 100% 26%, 100% 74%, 98% 100%, 2% 100%, 0 74%, 0 26%);
}
.cycler .label { font-size: 10px; color: var(--muted); letter-spacing: .12em; margin-right: 8px; }
.cycler .value { font-size: 13px; font-weight: 600; }
.cycler button { height: 100%; border: 0; background: none; cursor: pointer; color: var(--coral); font-size: 17px; line-height: 1; }
.cycler button:hover { color: var(--pink-bright); background: rgb(226 85 122 / 10%); }
.cycler .center { display: flex; align-items: baseline; justify-content: center; min-width: 0; }
.cycler .center .value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

```html
<div class="cycler">
  <button id="skin-prev" title="上一个皮肤">‹</button>
  <div class="center"><span class="label">皮肤</span><span class="value" id="skin-cycle">—</span></div>
  <button id="skin-next" title="下一个皮肤">›</button>
</div>
```

---

## Mode switch (`.modes`) — `auto | light | dark`

Three equal hexagon buttons; the pressed one fills with the brand gradient and glows.
State is carried by `aria-pressed`, **not** a class.

```css
.modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 7px; }
.modes button {
  height: 40px; cursor: pointer; font: inherit; font-size: 13px; color: var(--muted);
  background: linear-gradient(180deg, #221b2c, #191420);
  border: 1px solid rgb(226 85 122 / 22%);
  clip-path: polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%);
  transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
}
.modes button:hover { color: var(--ink); border-color: var(--line); }
.modes button[aria-pressed="true"] {
  color: #fff; font-weight: 600;
  background: linear-gradient(180deg, var(--pink-bright), var(--pink));
  border-color: var(--pink-bright);
  box-shadow: 0 0 16px rgb(226 85 122 / 42%);
}
```

```html
<div class="modes" id="modes">
  <button data-mode="dark">☾ 暗夜</button>
  <button data-mode="light">☀ 日间</button>
  <button data-mode="auto">⚙ 跟随系统</button>
</div>
```

---

## Action row (`.actions` / `.primary` / `.secondary`)

The primary button is **the app's only feedback channel**: it doubles as a progress display during
relaunch (关闭中 / 启动中 / 注入中…), as the review result (`复核全绿` / `未通过：<checks>`),
and it changes identity to `重启 ZCode 并注入` when injection failed for lack of a debug port.
Failures tint the whole button via `hue-rotate(-40deg) saturate(1.2)`.
That overloading is a **diagnosed design defect** — a multi-word check list has to fit on a 54px button.

```css
.actions { display: grid; grid-template-columns: 1fr 92px; gap: 8px; }
.primary {
  height: 54px; cursor: pointer; font: inherit; font-size: 17px; font-weight: 700; letter-spacing: .1em;
  color: #fff;
  background: linear-gradient(180deg, var(--pink-bright), var(--pink) 55%, #b83f63);
  border: 1px solid var(--pink-bright);
  clip-path: polygon(3% 0, 97% 0, 100% 28%, 100% 72%, 97% 100%, 3% 100%, 0 72%, 0 28%);
  box-shadow: 0 6px 20px rgb(226 85 122 / 32%);
}
.primary:hover { filter: brightness(1.08); }
.primary:active { transform: translateY(1px); }
.secondary {
  height: 54px; cursor: pointer; font: inherit; font-size: 12px; color: var(--muted);
  background: linear-gradient(180deg, #221b2c, #191420);
  border: 1px solid rgb(226 85 122 / 22%);
  border-radius: 3px;
}
.secondary:hover { color: var(--ink); border-color: var(--line); }
```

```html
<div class="actions">
  <button class="primary" id="apply">注入并挂载</button>
  <button class="secondary" id="remove">撤下皮肤</button>
</div>
```

---

## Target / health row (`.target`)

`● ZCode  <path>（运行中 · 无调试口）  [默认路径] [选择…]`
Green dot = debug port live (injectable). Red dot = not running, or running without a debug port —
the single most common failure, which is why it gets its own row and its own recovery buttons.

```css
.target {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 6px;
  height: 30px; margin-top: 7px; padding: 0 8px 0 10px;
  background: linear-gradient(180deg, #1d1726, #171220);
  border: 1px solid rgb(226 85 122 / 16%);
  clip-path: polygon(1.5% 0, 98.5% 0, 100% 50%, 98.5% 100%, 1.5% 100%, 0 50%);
  font-size: 11px; color: var(--muted);
}
.target .center { display: flex; align-items: center; min-width: 0; }
.target .label { letter-spacing: .12em; margin-right: 8px; flex: none; }
.target .value { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.target .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bad); margin-right: 7px; flex: none; }
.target .dot.ok { background: var(--ok); }
.target button {
  height: 22px; padding: 0 9px; cursor: pointer; font: inherit; font-size: 11px; color: var(--coral);
  background: rgb(226 85 122 / 10%); border: 1px solid rgb(226 85 122 / 26%); border-radius: 3px;
}
.target button:hover { color: var(--pink-bright); border-color: var(--line); }
```

```html
<div class="target" id="target">
  <div class="center">
    <span class="dot" id="target-dot"></span>
    <span class="label">ZCode</span>
    <span class="value" id="target-path">探测中…</span>
  </div>
  <button id="target-default" title="回到默认路径（丢掉手动指定的路径）">默认路径</button>
  <button id="target-pick" title="手动选择 ZCode 的可执行文件">选择…</button>
</div>
```

---

## Star rating (`.stars`) — decorative position indicator

Five four-point stars; the current skin's index in the sorted list lights up the leading ones.
Purely ornamental — it encodes list position, nothing else.

```css
.stars { display: flex; gap: 4px; margin-top: 5px; }
.stars i {
  width: 10px; height: 10px; display: block; background: var(--pink-bright);
  clip-path: polygon(50% 0, 62% 36%, 100% 50%, 62% 64%, 50% 100%, 38% 64%, 0 50%, 38% 36%);
}
.stars i.dim { background: rgb(226 85 122 / 26%); }
```

---

## Window controls (`.win`)

Frameless window: `−` minimises, `×` **hides to tray** (does not quit).

```css
.win { display: flex; gap: 10px; -webkit-app-region: no-drag; }
.win button {
  width: 26px; height: 24px; border: 0; background: none; cursor: pointer;
  color: var(--coral); font-size: 16px; line-height: 1;
}
.win button:hover { color: var(--pink-bright); }
```

---

## Not in this panel (present in the product, absent from the UI)

These features exist and are currently **invisible or handled inside ZCode's page instead of the app**:
review checks (13), usage-bar toggles (6 + tps), usage pump status, pet state machine,
injection history, relaunch log (`~/.painting-skin-theme/relaunch.log`).
A redesign is expected to surface some of them.
