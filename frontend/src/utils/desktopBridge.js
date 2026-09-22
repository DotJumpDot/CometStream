/**
 * Desktop-shell bridge helpers.
 *
 * The Electron shell exposes a tiny API as `window.cometstreamDesktop`
 * (window controls + native folder dialog). Plain browsers have no such
 * object - every helper here degrades to null/false there so callers fall
 * back to the in-app (jailed) flows.
 */

/**
 * Whether the page runs inside the CometStream desktop shell.
 * @returns {boolean} True when the preload bridge is present.
 */
export function isDesktopApp() {
  return (
    typeof window !== "undefined" && !!window.cometstreamDesktop?.selectFolder
  );
}

/**
 * Opens the native OS folder dialog (desktop app only) and resolves to the
 * chosen absolute path, or null when cancelled/unavailable. The path is
 * validated inside the terminal jail server-side before anything uses it.
 * @returns {Promise<string|null>} Selected folder or null.
 */
export async function selectNativeFolder() {
  try {
    const picked = await window.cometstreamDesktop?.selectFolder?.();
    return typeof picked === "string" && picked.trim() ? picked : null;
  } catch {
    return null;
  }
}
