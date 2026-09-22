/**
 * Tests for project-folder mirroring of generated documents: a file the
 * agent creates (md/json via text, pdf, xlsx, docx, pptx) also lands in the
 * bound project folder under its display name, while the download card flow
 * is untouched. Unbound chats and unsafe names skip the mirror silently.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const createFilesLib = require("../../../utils/agents/aibitat/plugins/create-files/lib.js");

describe("create-files project mirror", () => {
  let jail;
  let projectDir;
  let storageFile;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    jail = fs.mkdtempSync(path.join(os.tmpdir(), "cs-cf-jail-"));
    projectDir = path.join(jail, "site");
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.AGENT_TERMINAL_ROOT = jail;
    storageFile = path.join(os.tmpdir(), `cs-cf-src-${Date.now()}.md`);
    fs.writeFileSync(storageFile, "# hello\n");
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const boundProps = (projectPath) => ({
    invocation: { workspace: { projectPath } },
  });

  it("returns null for unbound (legacy) workspaces", async () => {
    expect(await createFilesLib.mirrorToProjectDir({}, storageFile, "a.md")).toBeNull();
    const note = await createFilesLib.projectCopyNote({}, { storagePath: storageFile, displayFilename: "a.md" });
    expect(note).toBe("");
  });

  it("copies into the bound project folder under the display name", async () => {
    const dest = await createFilesLib.mirrorToProjectDir(
      boundProps(projectDir),
      storageFile,
      "report.md"
    );
    expect(dest).toBe(path.join(projectDir, "report.md"));
    expect(fs.readFileSync(dest, "utf-8")).toBe("# hello\n");
    const note = await createFilesLib.projectCopyNote(
      boundProps(projectDir),
      { storagePath: storageFile, displayFilename: "report.md" }
    );
    expect(note).toContain("project folder");
    expect(note).toContain(dest);
  });

  it("normalizes display names to a single safe segment inside the project", async () => {
    // basename() strips any directory parts, and the jail re-check pins
    // the result - traversal input can only ever land inside the project.
    const dest = await createFilesLib.mirrorToProjectDir(
      boundProps(projectDir),
      storageFile,
      "../evil.md"
    );
    expect(dest).toBe(path.join(projectDir, "evil.md"));
    expect(fs.existsSync(path.join(path.dirname(jail), "evil.md"))).toBe(false);
  });

  it("skips empty display names", async () => {
    expect(
      await createFilesLib.mirrorToProjectDir(boundProps(projectDir), storageFile, "")
    ).toBeNull();
  });

  it("fails closed when the binding escapes the jail", async () => {
    const outside = path.join(os.tmpdir(), "cs-cf-evil");
    expect(
      await createFilesLib.mirrorToProjectDir(boundProps(outside), storageFile, "a.md")
    ).toBeNull();
  });
});
