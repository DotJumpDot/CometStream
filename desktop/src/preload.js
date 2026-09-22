/**
 * CometStream desktop preload.
 *
 * The renderer is the normal CometStream web app (sandboxed, no node). The
 * only bridge it gets is this tiny API, exposed as `window.cometstreamDesktop`:
 * window controls for the frameless title bar, plus a folder picker that
 * opens the real OS directory dialog. IPC actions are fixed strings - the
 * page supplies no paths, options, or commands, and every action targets
 * the window that sent the request.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cometstreamDesktop", {
  minimize: () => ipcRenderer.send("cometstream:window-minimize"),
  toggleMaximize: () => ipcRenderer.send("cometstream:window-toggle-maximize"),
  close: () => ipcRenderer.send("cometstream:window-close"),
  isMaximized: () => ipcRenderer.invoke("cometstream:window-is-maximized"),
  /**
   * Opens the native OS folder dialog and resolves to the chosen absolute
   * path, or null when cancelled. The path is validated server-side inside
   * the terminal jail before anything uses it.
   * @returns {Promise<string|null>} Selected folder or null.
   */
  selectFolder: () => ipcRenderer.invoke("cometstream:select-folder"),
  /**
   * Subscribe to maximize/restore changes so the title bar can swap its
   * maximize/restore icon. Returns an unsubscribe function.
   * @param {(isMaximized: boolean) => void} callback
   */
  onMaximizeChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("cometstream:maximize-changed", listener);
    return () =>
      ipcRenderer.removeListener("cometstream:maximize-changed", listener);
  },
});
