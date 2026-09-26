# pages.md — Page dependency trees

## The only page

## `/` — Injector panel

Entry: `src/panel.html` (self-contained: markup + inline `<style>` + inline `<script>`)
Dependencies:

- *(none — no imports, no bundler, no external CSS/JS)*

Everything the page needs arrives three ways:

1. **Inline CSS** — the entire design system (tokens, board geometry, all component styles).
2. **Inline script** — panel logic. Talks to the main process only via `ipcRenderer.invoke`, never to CDP directly.
   Falls back to a built-in `demo` object when the file is opened directly in a browser
   (so the UI can be tuned without Electron, and the "swap skin → swap portrait" behaviour can be demoed).
3. **IPC payload** — one `panel:snapshot` object carrying `skins[]`, `pets[]`, `mode`, `portrait`,
   `status`, `pump`, `app`. Rendered by `paint(state)`.

### Portrait delivery (matters for any design that shows artwork)

The main process hands the panel an **absolute filesystem path**; the page converts it to a `file://` URL
and assigns it as a CSS `background-image`:

```js
return 'file:///' + state.portrait.replace(/\\/g, '/').replace(/#/g, '%23').replace(/\?/g, '%3F');
```

One still image per skin is available to the panel. The panel does **not** play the `.webm` motion art
(that is injected into ZCode's page instead); `assets/character-still.webp` is the panel's stand-in
for a motion skin. 32 of the 33 skins are motion; only `diana` and `butterfly-line` are still-only.

### What a design must not break

- `paint(state)` is written against stable ids: `skin-name`, `stars`, `skin-cycle`, `pet-cycle`,
  `portrait`, `portrait-empty`, `target-dot`, `target-path`, `apply`, `remove`, `win-min`, `win-close`,
  and `#modes button[data-mode]`. New markup should keep an equivalent binding point per control.
- `flashButton()` writes the review/progress text onto `#apply`. A redesign that gives feedback its own
  surface should keep `#apply` present (or name the new target explicitly).

## Supporting (main-process) modules a design may reference

| File | Why a designer cares |
|---|---|
| `src/main.ts` | window geometry, transparency, tray menu, IPC handlers, relaunch progress strings |
| `src/target-app.ts` | ZCode discovery (config → theme manifest → built-in default paths), process detection, `--remote-debugging-port` relaunch, `relaunch.log` |
| `src/injector.ts` | the 13 review checks and the artwork-layer contract |
| `src/usage-bar.ts` | the in-ZCode token bar: 6 toggles + tps, gear panel, hover detail sheets |
| `src/usage-pump.ts` / `src/usage-db.ts` | SQLite aggregation the bar displays |
| `src/pet.ts` | 6 pets × 11 state GIFs (`idle`, `look-left-side`, `look-right-side`, `running`, `running-left`, `running-right`, `review`, `jumping`, `failed`, `waiting`, `waving`) |
| `src/theme-store.ts` | the skin manifest schema: `id`, `name`, `author`, `adapterVersion`, `app{debugPort,processName,exePath}`, `skin{css,tokens,artworkContract}`, `assets{}`, `hero{}`, `modes[]` |
