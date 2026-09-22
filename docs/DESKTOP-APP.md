# Desktop app (Electron shell)

`desktop/` contains the CometStream desktop shell: a native-feeling Windows
app window around the local backend. Double-click `CometStream.exe` in the
portable bundle and you get the full app in its own window — no browser tab,
no batch files, no prerequisites.

## How it works

```
CometStream.exe (Electron)
├── main process (desktop/src/main.js)
│   ├── prepares env (production, STORAGE_DIR inside the bundle)
│   ├── loads collector + server IN-PROCESS (dynamic import of their index.js)
│   ├── waits for http://localhost:3001 to answer
│   └── opens a frameless BrowserWindow on it (in-page title bar)
└── renderer = the normal web UI, fully sandboxed (no node)
    + preload.js: the only bridge — window controls + native folder picker
```

Design notes:

- **In-process backend.** The server and collector are loaded into the
  Electron main process with `await import()` instead of being spawned. No
  child processes, no shells — and one process tree to rule them all. This
  works because every native dependency (lancedb, sharp, onnxruntime-node,
  prisma) is N-API based and ABI-stable across Node and Electron; run
  `node_modules/.bin/electron scripts/probe-natives.cjs` from `desktop/` to
  re-verify after dependency changes.
- **Sandboxed renderer with a fixed bridge.** `contextIsolation` +
  `sandbox` on, `nodeIntegration` off. `preload.js` exposes exactly one
  object, `window.cometstreamDesktop`: window controls (minimize /
  toggle-maximize / close / is-maximized) for the in-page title bar, plus a
  no-argument `selectFolder()` that opens the real OS directory dialog for
  project-folder picking. IPC actions are fixed strings — the page supplies
  no paths, options, or commands — and every picked path is still
  jail-validated server-side before use. Browsers have no such object, so
  the web UI falls back to the jailed click-to-select folder picker (see
  `frontend/src/utils/desktopBridge.js`).
- **Frameless window.** The OS caption is replaced by the themed in-page
  title bar (`frontend/src/components/DesktopTitleBar`), so the desktop app
  looks like the rest of the UI. A packaged exe needs a `desktop/` rebuild
  (`yarn dist`) to carry the bridge. External links (docs, OAuth) open in
  the OS browser via `setWindowOpenHandler`.
- **Env hardening.** `NODE_OPTIONS`/`NODE_PATH`/`ELECTRON_*` are stripped from
  the inherited environment before the backend loads so nothing can preload
  code into the app's Node context.
- **Single instance.** A second launch focuses the existing window.
- **Database.** The bundle ships pre-migrated; after replacing/updating a
  bundle run `Start-CometStream.bat` once to apply pending migrations (the
  shell itself never mutates schema, it errors clearly instead).
- **Window title** stays "CometStream" (`page-title-updated` is prevented);
  the page's own `<title>` branding comes from `meta_page_title`.

## Bundle layout it expects

The exe must live in the portable bundle root (see
[PORTABLE-BUILD.md](./PORTABLE-BUILD.md)):

```
CometStream.exe   resources/   server/   collector/   runtime/   (bats, README)
```

`runtime/node.exe` is not used by the exe (the backend runs in-process) — it
is there for the batch launchers.

## Development

```bash
cd desktop
yarn install
yarn start        # runs the shell against the REPO's server/ + collector/
```

Dev mode (`yarn start`) respects your `NODE_ENV` (defaulting it to
`development`) and uses the repo's default dev storage. Have the usual dev
stack stopped first, or ports 3001/8888 will collide.

## Building

```bash
cd desktop
yarn icon         # regenerate build/icon.ico from the inline SVG (optional)
yarn dist         # electron-builder --win --dir  ->  dist/win-unpacked/
```

Copy the contents of `dist/win-unpacked/` into the portable bundle root
(merge — do not purge the bundle-only files: `server/`, `collector/`,
`runtime/`, the `.bat` launchers, `README-PORTABLE.txt`, `LICENSE`).

The build is unsigned (no code-signing certificate), so Windows SmartScreen
may warn on machines that have never seen the exe — that is expected for a
personal build.

## First-launch notes for end users

- **Windows Firewall prompt** appears on first launch (the backend binds a
  local port). "Allow" on private networks is fine for personal use.
- The app's **anonymous telemetry** (inherited from upstream AnythingLLM) is
  on by default — disable it in the admin UI if you prefer.
