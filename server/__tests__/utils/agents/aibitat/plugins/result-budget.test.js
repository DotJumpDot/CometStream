/**
 * Tests for the shared result-budget helper: inline projection shape,
 * spill-to-disk, and retention sweeping.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  projectText,
  spillText,
  sweepSpills,
} = require("../../../../../utils/agents/aibitat/plugins/result-budget");

describe("result-budget", () => {
  describe("projectText", () => {
    it("returns short text unchanged", () => {
      const out = projectText("hello");
      expect(out).toEqual({ text: "hello", truncated: false, omittedChars: 0 });
    });

    it("keeps head and tail with a marker for long text", () => {
      const out = projectText("a".repeat(50_000), 8000, 2000);
      expect(out.truncated).toBe(true);
      expect(out.text.length).toBeLessThan(9000);
      expect(out.text).toContain("chars truncated]");
      expect(out.text.startsWith("a")).toBe(true);
      expect(out.text.endsWith("a")).toBe(true);
      expect(out.omittedChars).toBe(50_000 - 8000);
    });

    it("handles empty and non-string input", () => {
      expect(projectText("").truncated).toBe(false);
      expect(projectText(null).text).toBe("");
    });
  });

  describe("spillText", () => {
    let dir;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-spill-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("persists full content and returns the path", () => {
      const content = "x".repeat(100_000);
      const filePath = spillText(dir, "exit-0", content);
      expect(typeof filePath).toBe("string");
      expect(fs.readFileSync(filePath, "utf-8")).toBe(content);
    });

    it("returns null instead of throwing on failure", () => {
      expect(spillText(path.join(dir, "\0-impossible"), "x", "y")).toBeNull();
    });

    it("sweeps spills older than the retention window", () => {
      const fresh = spillText(dir, "fresh", "new");
      const old = spillText(dir, "old", "stale");
      const ancient = new Date(Date.now() - 48 * 60 * 60 * 1000);
      fs.utimesSync(old, ancient, ancient);
      sweepSpills(dir);
      expect(fs.existsSync(fresh)).toBe(true);
      expect(fs.existsSync(old)).toBe(false);
    });

    it("sweep is silent on missing directories", () => {
      expect(() =>
        sweepSpills(path.join(dir, "does-not-exist"))
      ).not.toThrow();
    });
  });
});
