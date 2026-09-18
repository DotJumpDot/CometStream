/**
 * Diagnostic: verify the backend's native addons load inside Electron.
 *
 * The desktop shell runs server + collector in-process (see src/main.js), so
 * native modules must be ABI-compatible with Electron's Node. All our
 * dependencies use N-API (ABI-stable across Node/Electron versions), and this
 * probe proves it for the installed tree before you package the app.
 *
 * Run from desktop/ after `yarn install`:
 *   node_modules/.bin/electron scripts/probe-natives.cjs
 * Exit code 0 = every module loaded; 1 = at least one failed.
 */
const path = require("node:path");
const { createRequire } = require("node:module");

const repoRoot = path.resolve(__dirname, "..", "..");

// createRequire anchored inside each package's node_modules parent so plain
// package names resolve exactly as the backend itself resolves them.
const requireFromServer = createRequire(
  path.join(repoRoot, "server", "package.json")
);
const requireFromCollector = createRequire(
  path.join(repoRoot, "collector", "package.json")
);

const CHECKS = [
  ["@lancedb/lancedb", requireFromServer],
  ["sharp", requireFromServer],
  ["onnxruntime-node", requireFromServer],
  ["@prisma/client", requireFromServer],
  ["puppeteer", requireFromCollector],
];

let failed = 0;
for (const [name, req] of CHECKS) {
  try {
    req(name);
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
