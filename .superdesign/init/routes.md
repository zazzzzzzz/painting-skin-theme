# routes.md — Views of the injector app

**There is no router and no URL routing.** The app is a single-window Electron utility.
`src/main.ts` is the whole shell; `src/panel.html` is the only rendered document.

## Views / surfaces

| Surface | Entry | Sizes / behaviour |
|---|---|---|
| **Panel** (the app UI) | `src/panel.html`, loaded by `createWindow()` in `src/main.ts` | `620 × 745`, `transparent`, `frame: false`, `resizable: false`, `hasShadow: false`. No scrollbars (`body { overflow: hidden }`). |
| **Tray menu** | `createTray()` in `src/main.ts` | Icon = self-drawn four-point star (`assets/icon.png`, resized 16×16). Items: `显示面板` · separator · `退出`. Left-click the tray icon also shows the panel. |
| **Native file dialog** | `dialog` via IPC `panel:pick-exe` | Pick ZCode's executable manually, overriding auto-discovery. |
| **CLI** | `src/cli.ts` → `node dist/cli.js <cmd>` | 13 commands: `list pets status apply pet remove payload pump panel defaults setexe relaunch`. Headless equivalent of the panel; `panel` prints exactly the state the panel renders. |

## Panel states (not routes — state the UI must render)

The panel has no navigation, but it has materially different states driven by IPC:

| State | Trigger | UI today |
|---|---|---|
| Idle / not injected | startup | main button = `注入并挂载` |
| Injected | `status.injected` true | main button = `重新注入` |
| Injecting / relaunching | `panel:progress` events | main button text becomes live progress (`关闭中` / `启动中` / `注入中…`) |
| Review passed | `applied.ok === true` | button flashes `复核全绿` for 3.2 s |
| Review failed | `applied.ok === false` | button flashes `未通过：<failed check keys>` for 3.2 s |
| Recoverable failure | `applied.needsDebugPort` | after 1.4 s the button becomes `重启 ZCode 并注入` |
| No portrait | skin has no character asset | centred muted text `该皮肤没有立绘素材` |
| Target unresolved | no exe found | `未找到安装路径，点"默认路径"或"选择…"` |

## IPC surface (what the UI can ask for)

`panel:snapshot` (full state) · `panel:cycle-skin` · `panel:cycle-pet` · `panel:set-mode` ·
`panel:apply` · `panel:remove` · `panel:defaults` · `panel:pick-exe` · `panel:relaunch-apply` ·
`panel:window` (`minimize` / `close`) · `panel:progress` (main → renderer, live relaunch progress).

`panel:snapshot` returns: `skins[]`, `skinIndex`, `pets[]`, `petIndex`, `mode`, `portrait`,
`status { injected, port, rootTheme, target }`, `pump { running, port }`,
`app { exePath, source, processName, running, endpointReady, configPath }`, and the last `applied` / `removed` result.

## Design implication

A redesign may introduce panes, tabs or drawers — but they are **states of one window**, not routes.
Anything that needs more room than `620 × 745` must change the `BrowserWindow` dimensions in
`src/main.ts`, and must keep `transparent: true` + `frame: false` (the board's irregular silhouette
depends on it) or deliberately justify abandoning that.
