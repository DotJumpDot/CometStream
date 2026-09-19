/**
 * CometStream desktop preload.
 *
 * The renderer is the normal CometStream web app (sandboxed, no node). The
 * only bridge it gets is this tiny window-control API, exposed as
 * `window.cometstreamDesktop`, used by the in-page title bar to minimize,
 * maximize/restore, and close the frameless window. Nothing else - no IPC
 * channels, no file or shell access - is exposed to the page.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cometstreamDesktop", {
  minimize: () => ipcRenderer.send("cometstream:window-minimize"),
  toggleMaximize: () => ipcRenderer.send("cometstream:window-toggle-maximize"),
  close: () => ipcRenderer.send("cometstream:window-close"),
  isMaximized: () => ipcRenderer.invoke("cometstream:window-is-maximized"),
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
