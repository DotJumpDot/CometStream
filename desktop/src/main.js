/**
 * CometStream desktop shell.
 *
 * A thin Electron window around the portable bundle: on launch it loads the
 * document collector (port 8888) and the CometStream server (port 3001)
 * IN-PROCESS (dynamic import of validated entry files - no child processes,
 * no shells, nothing to inject), waits for the server to accept connections,
 * then shows the UI in its own desktop window - no browser tab, no batch
 * files.
 *
 * Layout expectation (portable bundle root, i.e. the folder containing
 * CometStream.exe):
 *
 *   CometStream.exe      <- this app, process.execPath
 *   resources/           <- Electron + app code (created by electron-builder)
 *   server/              <- API, UI, database
 *   collector/           <- document processor
 *   runtime/node.exe     <- Node runtime used by Start-CometStream.bat
 *   runtime/chrome/      <- optional puppeteer Chromium (scraping)
 *
 * Database note: the bundle ships a pre-migrated database (see
 * docs/PORTABLE-BUILD.md). Pending migrations after a bundle update are
 * applied by running Start-CometStream.bat once; this shell surfaces a clear
 * error if the database is not compatible instead of touching it.
 *
 * All user data stays inside the bundle folder (server/storage), so the whole
 * folder remains portable: move it, and the app + data move with it.
 */
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

/** Bundle root: the folder holding the exe (dev mode falls back to the repo). */
const IS_PACKAGED = app.isPackaged;
const BUNDLE_ROOT = IS_PACKAGED
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, "..", "..");

const SERVER_PORT = Number(process.env.SERVER_PORT) || 3001;
const APP_URL = `http://localhost:${SERVER_PORT}`;

/** The only services this shell may load - fixed, never caller-supplied. */
const SERVICE_NAMES = Object.freeze(["collector", "server"]);
/** Entry script every service loads; fixed, not caller-supplied. */
const SERVICE_ENTRY = "index.js";

/**
 * Prepare process.env before the services load in-process: strip variables
 * that could hijack Node code (NODE_OPTIONS preloading arbitrary modules,
 * Electron's own vars) always, and pin production settings when packaged.
 * In dev (`yarn start`) the developer's own env/NODE_ENV is respected.
 */
function prepareEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (/^(NODE_OPTIONS|NODE_PATH|ELECTRON_)/i.test(key))
      delete process.env[key];
  }
  if (!IS_PACKAGED) {
    // Dev (`yarn start`): default to the same mode `yarn dev:server` uses so
    // the repo's server/ storage defaults apply; respect an explicit choice.
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "development";
    return;
  }

  process.env.NODE_ENV = "production";
  // Absolute storage path inside the bundle; recomputed every launch so the
  // folder stays movable. Both services share server/storage.
  process.env.STORAGE_DIR = path.join(BUNDLE_ROOT, "server", "storage");
  // Keep puppeteer's browser (when installed) inside the bundle.
  process.env.PUPPETEER_CACHE_DIR = path.join(BUNDLE_ROOT, "runtime", "chrome");
}

/**
 * Load the collector and the server into this process. Every entry file is
 * existence-checked on disk first and reached only through a file:// URL
 * built from that checked path - no shell, no command interpreter, no
 * caller-supplied module names.
 * @returns {Promise<Error|null>} The first load error, or null when both loaded.
 */
async function loadServices() {
  const entries = {};
  for (const name of SERVICE_NAMES) {
    const entry = path.join(BUNDLE_ROOT, name, SERVICE_ENTRY);
    if (!fs.existsSync(entry)) {
      return new Error(
        `Required bundle folder was not found: "${path.join(BUNDLE_ROOT, name)}".\n` +
          "The desktop app must ship inside the portable bundle next to " +
          "server/, collector/, and runtime/."
      );
    }
    entries[name] = pathToFileURL(entry).href;
  }

  try {
    // Collector first: the server pings it during document work, never at
    // boot, and each app only touches its own listeners/modules. import() of
    // a CommonJS entry runs its side effects exactly like require would.
    await import(entries.collector);
    await import(entries.server);
    return null;
  } catch (error) {
    return error;
  }
}

/**
 * Resolve once the server answers on its port. Retries for up to `timeoutMs`
 * because first boot also runs onboarding setup and can take a while.
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true when the server is reachable
 */
function waitForServer(timeoutMs = 60_000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const attempt = () => {
      const request = http
        .get(APP_URL, () => resolve(true))
        .on("error", () => {
          if (Date.now() - startedAt > timeoutMs) return resolve(false);
          setTimeout(attempt, 500);
        });
      request.setTimeout(2_000, () => {
        request.destroy();
        if (Date.now() - startedAt > timeoutMs) return resolve(false);
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

/** Create and show the desktop window. */
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: "CometStream",
    backgroundColor: "#0e0f0f",
    autoHideMenuBar: true,
    show: false,
    // Frameless: the app draws its own title bar (see
    // frontend/src/components/DesktopTitleBar) themed like the rest of the UI,
    // instead of the plain OS caption. The preload script is the only bridge -
    // it exposes window controls plus a native folder picker, nothing else.
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // The web app sets its own <title>; keep our window title on the chrome.
  win.on("page-title-updated", (event) => event.preventDefault());

  // Keep the in-page title bar's maximize/restore icon in sync.
  const sendMaximizeState = () =>
    win.webContents.send("cometstream:maximize-changed", win.isMaximized());
  win.on("maximize", sendMaximizeState);
  win.on("unmaximize", sendMaximizeState);

  // Everything the app opens in a new tab/window is external content -
  // docs links, OAuth providers - hand those to the OS browser instead of
  // creating uncontrolled Electron windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.once("ready-to-show", () => win.show());
  win.loadURL(APP_URL);
  return win;
}

/** Report a fatal startup problem and exit.
 * @param {string} title
 * @param {string|Error} detail
 */
function fatal(title, detail) {
  dialog.showErrorBox(title, String(detail?.message || detail));
  app.exit(1);
}

// ---- Window controls (used by the in-page title bar) ------------------------
// Actions are fixed strings from the preload script - the page cannot ask for
// anything else, and every action targets the window that sent the request.

ipcMain.on("cometstream:window-minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("cometstream:window-toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("cometstream:window-close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("cometstream:window-is-maximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});

// Native folder dialog for project creation. Fixed properties - the page
// passes no arguments, so there is nothing to inject; the returned path is
// still validated inside the terminal jail server-side before use.
ipcMain.handle("cometstream:select-folder", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Choose a project folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0] ?? null;
});

// ---- App lifecycle ---------------------------------------------------------

// One desktop instance at a time; a second launch just focuses the window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    prepareEnvironment();
    const loadError = await loadServices();
    if (loadError) {
      fatal(
        "CometStream - backend failed to start",
        loadError.message +
          "\n\nIf this happened after updating the bundle, run " +
          "Start-CometStream.bat once to apply database migrations and see the logs."
      );
      return;
    }

    const win = createWindow();
    const reachable = await waitForServer();
    if (!reachable) {
      fatal(
        "CometStream - server did not start",
        `The backend did not answer on ${APP_URL} within 60 seconds.\n` +
          "Run Start-CometStream.bat to see the server logs, then report the error."
      );
      return;
    }
    // loadURL already fired during the wait; if the server came up after the
    // first attempt the renderer may be showing an error page - reload.
    if (!win.webContents.getURL().startsWith(APP_URL)) win.reload();
  });

  app.on("window-all-closed", () => {
    // Services run in-process; app.exit skips lingering handles (open SQLite
    // files, express listeners) so quitting is always immediate.
    app.exit(0);
  });
}
