const filesystem = require("../../../utils/agents/aibitat/plugins/filesystem/lib.js");

describe("filesystem diff helpers", () => {
  describe("countUnifiedDiffLines", () => {
    it("counts added and removed lines while ignoring file headers", () => {
      const diff = [
        "Index: settings.css",
        "===================================================================",
        "--- settings.css	original",
        "+++ settings.css	modified",
        "@@ -1,4 +1,5 @@",
        " body {",
        "-  color: black;",
        "+  color: white;",
        "+  margin: 0;",
        " }",
      ].join("\n");

      expect(filesystem.countUnifiedDiffLines(diff)).toEqual({
        added: 2,
        removed: 1,
      });
    });

    it("returns zeroes for an empty diff body", () => {
      expect(filesystem.countUnifiedDiffLines("")).toEqual({
        added: 0,
        removed: 0,
      });
    });

    it("does not count hunk headers as changes", () => {
      const diff = "@@ -10,3 +10,4 @@ context\n line\n+line";
      expect(filesystem.countUnifiedDiffLines(diff)).toEqual({
        added: 1,
        removed: 0,
      });
    });
  });

  describe("capUnifiedDiffLines", () => {
    it("leaves short diffs untouched", () => {
      const result = filesystem.capUnifiedDiffLines("a\nb\nc", 10);
      expect(result).toEqual({ diff: "a\nb\nc", truncated: false, totalLines: 3 });
    });

    it("truncates to the first maxLines lines and flags it", () => {
      const result = filesystem.capUnifiedDiffLines("1\n2\n3\n4\n5", 2);
      expect(result.diff).toBe("1\n2");
      expect(result.truncated).toBe(true);
      expect(result.totalLines).toBe(5);
    });
  });
});
