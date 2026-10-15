/**
 * Tests for read-outside-workspace semantics (validateReadPath): read tools
 * accept explicit absolute paths anywhere on disk (parity with the
 * terminal's `cat <absolute>`), while relative paths stay jailed and writes
 * keep the full validatePath jail. Credential files (.env, private keys)
 * are refused outside the jail so the app's own secrets never land in model
 * context.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

// Sandbox root comes from STORAGE_DIR - set BEFORE the singleton loads so
// its lazy #initializeFilesystem pins to the temp dir, never the dev DB.
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-read-outside-"));
process.env.STORAGE_DIR = storageDir;
const filesystem = require("../../../../../../utils/agents/aibitat/plugins/filesystem/lib");

const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "fs-outside-"));
const outsideFile = path.join(outsideDir, "notes.md");
const outsideEnv = path.join(outsideDir, ".env");
const outsideKey = path.join(outsideDir, "id_rsa");
const outsidePem = path.join(outsideDir, "server.pem");
const outsideNested = path.join(outsideDir, "nested", "deep.txt");

beforeAll(() => {
  fs.writeFileSync(outsideFile, "outside content");
  fs.writeFileSync(outsideEnv, "SECRET=1");
  fs.writeFileSync(outsideKey, "-----BEGIN PRIVATE KEY-----");
  fs.writeFileSync(outsidePem, "-----BEGIN CERTIFICATE-----");
  fs.mkdirSync(path.dirname(outsideNested), { recursive: true });
  fs.writeFileSync(outsideNested, "nested");
});

afterAll(() => {
  fs.rmSync(storageDir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
  delete process.env.STORAGE_DIR;
});

describe("validateReadPath (read tools)", () => {
  test("reads an explicit absolute path outside the jail", async () => {
    const resolved = await filesystem.validateReadPath(outsideFile);
    expect(fs.readFileSync(resolved, "utf8")).toBe("outside content");
  });

  test("lists an outside directory and nested outside files", async () => {
    const dir = await filesystem.validateReadPath(outsideDir);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
    const nested = await filesystem.validateReadPath(outsideNested);
    expect(fs.readFileSync(nested, "utf8")).toBe("nested");
  });

  test("absolute inside the sandbox goes through the standard validation", async () => {
    const inside = path.join(storageDir, "anythingllm-fs", "inside.txt");
    fs.mkdirSync(path.dirname(inside), { recursive: true });
    fs.writeFileSync(inside, "inside");
    const resolved = await filesystem.validateReadPath(inside);
    expect(fs.readFileSync(resolved, "utf8")).toBe("inside");
  });

  test("relative paths stay jailed (resolve into the sandbox)", async () => {
    const sandbox = path.join(storageDir, "anythingllm-fs");
    fs.writeFileSync(path.join(sandbox, "relative.txt"), "relative");
    const resolved = await filesystem.validateReadPath("relative.txt");
    expect(resolved.startsWith(sandbox)).toBe(true);
    // Relative traversal out of the jail is still denied.
    await expect(
      filesystem.validateReadPath("../../relative.txt")
    ).rejects.toThrow(/outside allowed directories/i);
  });

  test("refuses credential files outside the jail", async () => {
    for (const denied of [outsideEnv, outsideKey, outsidePem]) {
      await expect(filesystem.validateReadPath(denied)).rejects.toThrow(
        /credential files/i
      );
    }
    // .env.<anything> is covered too.
    const envLocal = path.join(outsideDir, ".env.production");
    fs.writeFileSync(envLocal, "SECRET=2");
    await expect(filesystem.validateReadPath(envLocal)).rejects.toThrow(
      /credential files/i
    );
  });

  test("nonexistent outside paths fail as not found", async () => {
    await expect(
      filesystem.validateReadPath(path.join(outsideDir, "missing.txt"))
    ).rejects.toThrow(/not found/i);
  });

  test("symlink resolving to a credential file is denied (when symlinks work)", async () => {
    const link = path.join(outsideDir, "notes-link.txt");
    let linkCreated = false;
    try {
      fs.symlinkSync(outsideKey, link);
      linkCreated = true;
    } catch {
      // Windows without developer mode cannot create file symlinks; the
      // realpath re-check is exercised only where symlinks exist.
    }
    if (!linkCreated) return;
    await expect(filesystem.validateReadPath(link)).rejects.toThrow(
      /credential files/i
    );
  });
});

describe("validatePath (write path) is unchanged", () => {
  test("outside absolute paths are still denied for writes", async () => {
    await expect(filesystem.validatePath(outsideFile)).rejects.toThrow(
      /outside allowed directories/i
    );
  });

  test("outside directories are still denied for writes", async () => {
    await expect(filesystem.validatePath(outsideDir)).rejects.toThrow(
      /outside allowed directories/i
    );
  });
});
