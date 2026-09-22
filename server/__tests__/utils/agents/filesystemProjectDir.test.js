/**
 * Tests for project-aware file access: a folder-bound workspace's file tools
 * (read/write/edit/list/...) work inside the project folder where the
 * terminal already works, while the jail still holds everywhere else.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const filesystem = require("../../../utils/agents/aibitat/plugins/filesystem/lib.js");

describe("filesystem project directories", () => {
  let jail;
  let projectDir;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jail = fs.mkdtempSync(path.join(os.tmpdir(), "cs-fs-jail-"));
    projectDir = path.join(jail, "site");
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.AGENT_TERMINAL_ROOT = jail;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const boundProps = (projectPath) => ({
    invocation: { workspace: { projectPath } },
  });

  describe("projectExtraDir", () => {
    it("returns null for unbound (legacy) workspaces", async () => {
      expect(await filesystem.projectExtraDir({})).toBeNull();
      expect(
        await filesystem.projectExtraDir(boundProps(null))
      ).toBeNull();
    });

    it("resolves the bound folder inside the jail", async () => {
      expect(await filesystem.projectExtraDir(boundProps(projectDir))).toBe(
        projectDir
      );
      // Relative bindings resolve against the current jail too.
      expect(await filesystem.projectExtraDir(boundProps("site"))).toBe(
        projectDir
      );
    });

    it("fails closed when the binding escapes the jail", async () => {
      const outside = path.join(os.tmpdir(), "cs-fs-evil");
      expect(await filesystem.projectExtraDir(boundProps(outside))).toBeNull();
      expect(
        await filesystem.projectExtraDir(boundProps("../escape"))
      ).toBeNull();
      expect(fs.existsSync(outside)).toBe(false);
    });
  });

  describe("validatePath with project extras", () => {
    it("accepts absolute project paths", async () => {
      const target = path.join(projectDir, "notes.md");
      fs.writeFileSync(target, "# hi\n");
      const valid = await filesystem.validatePath(target, [projectDir]);
      expect(valid).toBe(path.resolve(target));
    });

    it("resolves relative paths project-first", async () => {
      fs.writeFileSync(path.join(projectDir, "app.json"), '{"a":1}');
      const valid = await filesystem.validatePath("app.json", [projectDir]);
      expect(valid).toBe(path.join(projectDir, "app.json"));
    });

    it("still rejects paths outside both sandbox and project", async () => {
      const outside = path.join(os.tmpdir(), "cs-fs-nope.txt");
      await expect(
        filesystem.validatePath(outside, [projectDir])
      ).rejects.toThrow(/Access denied/);
    });

    it("still rejects traversal out of the project folder", async () => {
      await expect(
        filesystem.validatePath(path.join(projectDir, "..", "evil.txt"), [
          projectDir,
        ])
      ).rejects.toThrow(/Access denied/);
    });
  });

  describe("allowedDirsFor", () => {
    it("adds the bound project folder to the effective dirs", async () => {
      const dirs = await filesystem.allowedDirsFor(boundProps(projectDir));
      expect(dirs).toContain(projectDir);
    });

    it("leaves unbound chats on the global dirs", async () => {
      const dirs = await filesystem.allowedDirsFor({});
      expect(dirs).not.toContain(projectDir);
      expect(dirs.length).toBeGreaterThan(0);
    });
  });

  describe("relativeDisplayPath with project extras", () => {
    it("shortens project paths to project-relative form", () => {
      expect(
        filesystem.relativeDisplayPath(path.join(projectDir, "a.md"), [
          projectDir,
        ])
      ).toBe("a.md");
    });
  });
});
