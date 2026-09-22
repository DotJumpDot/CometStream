/**
 * Tests for ZCode-style project-folder helpers: segment safety, name
 * derivation, jail resolution, and directory creation.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  isSafeSegment,
  projectNameFromPath,
  resolveProjectPath,
  ensureProjectDir,
  listProjectFolders,
} = require("../../utils/projectPath");

describe("projectPath helpers", () => {
  let jail;
  beforeEach(() => {
    jail = fs.mkdtempSync(path.join(os.tmpdir(), "cs-proj-"));
  });

  describe("isSafeSegment", () => {
    it("accepts plain folder names", () => {
      expect(isSafeSegment("my-app")).toBe(true);
      expect(isSafeSegment("Backend 2.0")).toBe(true);
    });

    it("rejects traversal, separators, and NUL", () => {
      expect(isSafeSegment("")).toBe(false);
      expect(isSafeSegment(".")).toBe(false);
      expect(isSafeSegment("..")).toBe(false);
      expect(isSafeSegment("a/b")).toBe(false);
      expect(isSafeSegment("a\\b")).toBe(false);
      expect(isSafeSegment("a\0b")).toBe(false);
      expect(isSafeSegment(123)).toBe(false);
    });
  });

  describe("projectNameFromPath", () => {
    it("derives the label from the folder basename like a ZCode tab", () => {
      expect(projectNameFromPath("my-app")).toBe("my-app");
      expect(projectNameFromPath("apps/my-app/")).toBe("my-app");
      expect(projectNameFromPath("C:\\work\\Backend")).toBe("Backend");
    });

    it("falls back for empty or non-string input", () => {
      expect(projectNameFromPath("")).toBe("My Project");
      expect(projectNameFromPath(null)).toBe("My Project");
      expect(projectNameFromPath(undefined)).toBe("My Project");
    });
  });

  describe("resolveProjectPath", () => {
    it("resolves a plain name inside the jail", () => {
      const r = resolveProjectPath("my-app", jail);
      expect(r.ok).toBe(true);
      expect(r.dir).toBe(path.join(jail, "my-app"));
    });

    it("resolves nested relative paths inside the jail", () => {
      const r = resolveProjectPath("apps/my-app", jail);
      expect(r.ok).toBe(true);
      expect(r.dir).toBe(path.join(jail, "apps", "my-app"));
    });

    it("accepts an absolute path already inside the jail", () => {
      const inside = path.join(jail, "existing");
      const r = resolveProjectPath(inside, jail);
      expect(r.ok).toBe(true);
      expect(r.dir).toBe(path.resolve(inside));
    });

    it("rejects parent traversal outside the jail", () => {
      expect(resolveProjectPath("../escape", jail).ok).toBe(false);
      expect(resolveProjectPath("a/../../escape", jail).ok).toBe(false);
    });

    it("rejects absolute paths outside the jail", () => {
      const outside = path.join(os.tmpdir(), "cs-proj-outside");
      expect(resolveProjectPath(outside, jail).ok).toBe(false);
    });

    it("rejects empty input", () => {
      expect(resolveProjectPath("", jail).ok).toBe(false);
      expect(resolveProjectPath("   ", jail).ok).toBe(false);
    });
  });

  describe("ensureProjectDir", () => {
    it("creates the folder so the first chat has a directory", () => {
      const r = ensureProjectDir("fresh-proj", jail);
      expect(r.ok).toBe(true);
      expect(fs.statSync(r.dir).isDirectory()).toBe(true);
    });

    it("refuses to create outside the jail", () => {
      const r = ensureProjectDir("../escape", jail);
      expect(r.ok).toBe(false);
      expect(fs.existsSync(path.join(path.dirname(jail), "escape"))).toBe(
        false
      );
    });
  });

  describe("listProjectFolders", () => {
    it("lists immediate subfolders of the jail root", () => {
      fs.mkdirSync(path.join(jail, "b-proj"));
      fs.mkdirSync(path.join(jail, "a-proj"));
      fs.writeFileSync(path.join(jail, "notes.txt"), "x");
      const r = listProjectFolders(jail, "");
      expect(r.ok).toBe(true);
      expect(r.rel).toBe("");
      expect(r.folders.map((f) => f.name)).toEqual(["a-proj", "b-proj"]);
    });

    it("navigates into a subfolder by rel", () => {
      fs.mkdirSync(path.join(jail, "outer", "inner"), { recursive: true });
      const r = listProjectFolders(jail, "outer");
      expect(r.ok).toBe(true);
      expect(r.rel).toBe("outer");
      expect(r.folders).toEqual([{ name: "inner", hasSubdirs: false }]);
    });

    it("reports hasSubdirs for the picker affordance", () => {
      fs.mkdirSync(path.join(jail, "p", "child"), { recursive: true });
      fs.mkdirSync(path.join(jail, "q"));
      const r = listProjectFolders(jail, "");
      const byName = Object.fromEntries(r.folders.map((f) => [f.name, f]));
      expect(byName.p.hasSubdirs).toBe(true);
      expect(byName.q.hasSubdirs).toBe(false);
    });

    it("rejects traversal outside the jail", () => {
      expect(listProjectFolders(jail, "../x").ok).toBe(false);
      expect(listProjectFolders(jail, "/etc").ok).toBe(false);
    });

    it("fails cleanly for a missing folder", () => {
      // The picker only navigates existing folders; a missing rel fails
      // the listing (creation mkdirs later through the create endpoint).
      expect(listProjectFolders(jail, "nope").ok).toBe(false);
    });
  });
});
