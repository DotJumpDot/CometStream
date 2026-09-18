const path = require("path");
const fs = require("fs");
const os = require("os");

jest.mock("../../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: jest.fn(),
    updateSettings: jest.fn(),
  },
}));

const { SystemSettings } = require("../../../models/systemSettings");
const SkillFiles = require("../../../utils/agents/skillFiles");

function writeSkill(root, folder, frontmatter, body = "Instructions here.") {
  // Test helper: folder is always a hardcoded literal; keep it a single
  // plain path segment so the helper itself cannot traverse.
  if (
    typeof folder !== "string" ||
    folder.includes("/") ||
    folder.includes("\\") ||
    folder.includes("..")
  )
    throw new Error("writeSkill: folder must be a plain name");

  const skillPath = path.join(root, folder);
  if (!skillPath.startsWith(root + path.sep))
    throw new Error("writeSkill: resolved path escaped root");
  fs.mkdirSync(skillPath, { recursive: true });
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter))
    lines.push(`${key}: ${value}`);
  lines.push("---", "", body);
  fs.writeFileSync(path.join(skillPath, "SKILL.md"), lines.join("\n"));
  return skillPath;
}

/** Capture the aibitat function config a plugin registers via setup(). */
function captureRegisteredFunction(pluginResult) {
  let captured = null;
  const fakeAibitat = {
    function: (config) => (captured = config),
    introspect: () => {},
  };
  pluginResult.plugin().setup(fakeAibitat);
  return captured;
}

describe("SkillFiles.parseFrontmatter", () => {
  it("parses flat name/description frontmatter and the body", () => {
    const parsed = SkillFiles.parseFrontmatter(
      `---\nname: animate\ndescription: Build animations that feel right.\n---\n\n# Building Animations\n\nSteps below.`
    );
    expect(parsed.name).toBe("animate");
    expect(parsed.description).toBe("Build animations that feel right.");
    expect(parsed.body).toBe("# Building Animations\n\nSteps below.");
  });

  it("handles CRLF line endings", () => {
    const parsed = SkillFiles.parseFrontmatter(
      "---\r\nname: crlf-skill\r\ndescription: works on windows\r\n---\r\n\r\nBody."
    );
    expect(parsed.name).toBe("crlf-skill");
    expect(parsed.description).toBe("works on windows");
    expect(parsed.body).toBe("Body.");
  });

  it("strips surrounding quotes from values", () => {
    const parsed = SkillFiles.parseFrontmatter(
      `---\nname: "quoted"\ndescription: 'single'\n---\nBody`
    );
    expect(parsed.name).toBe("quoted");
    expect(parsed.description).toBe("single");
  });

  it("returns the raw content as body when frontmatter is missing or unterminated", () => {
    const noFm = "# Just markdown";
    expect(SkillFiles.parseFrontmatter(noFm).body).toBe(noFm);
    expect(SkillFiles.parseFrontmatter(noFm).name).toBeNull();

    const unterminated = "---\nname: dangling\n# no closing fence";
    const parsed = SkillFiles.parseFrontmatter(unterminated);
    expect(parsed.name).toBeNull();
    expect(parsed.body).toBe(unterminated);
  });
});

describe("SkillFiles with a configured directory", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "skill-files-"));
    SystemSettings.getValueOrFallback.mockReset();
    SystemSettings.updateSettings.mockReset();
    SystemSettings.getValueOrFallback.mockImplementation(({ label }) => {
      if (label === "agent_skill_files_directory") return root;
      return null; // active set unset -> default all-on
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("lists every subfolder containing a SKILL.md with metadata", async () => {
    writeSkill(root, "animate", {
      name: "animate",
      description: "Build an animation.",
    });
    const animatePath = path.join(root, "animate");
    fs.writeFileSync(path.join(animatePath, "RECIPES.md"), "recipes");
    fs.mkdirSync(path.join(root, "not-a-skill"), { recursive: true });
    fs.writeFileSync(path.join(root, "loose-file.md"), "stray");

    const { directory, skills } = await SkillFiles.listSkillFiles();
    expect(directory).toBe(root);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      folder: "animate",
      toolName: "skill_animate",
      name: "animate",
      description: "Build an animation.",
      active: true,
      files: ["RECIPES.md"],
    });
  });

  it("respects the persisted active set (default-on when unset)", async () => {
    writeSkill(root, "alpha", { name: "alpha", description: "a" });
    writeSkill(root, "beta", { name: "beta", description: "b" });

    SystemSettings.getValueOrFallback.mockImplementation(({ label }) => {
      if (label === "agent_skill_files_directory") return root;
      if (label === "active_skill_files") return JSON.stringify(["beta"]);
      return null;
    });

    const { skills } = await SkillFiles.listSkillFiles();
    expect(skills.find((s) => s.folder === "alpha").active).toBe(false);
    expect(skills.find((s) => s.folder === "beta").active).toBe(true);
  });

  it("toggleSkillFile persists the updated active set", async () => {
    writeSkill(root, "alpha", { name: "alpha", description: "a" });
    writeSkill(root, "beta", { name: "beta", description: "b" });

    const result = await SkillFiles.toggleSkillFile("alpha", false);
    expect(result.success).toBe(true);
    expect(result.active).toEqual(["beta"]);
    expect(SystemSettings.updateSettings).toHaveBeenCalledWith({
      active_skill_files: JSON.stringify(["beta"]),
    });
  });

  it("activeSkillFilePlugins returns loadable ids plus the shared reader", async () => {
    writeSkill(root, "animate", { name: "animate", description: "a" });
    writeSkill(root, "prototype", { name: "prototype", description: "p" });

    const ids = await SkillFiles.activeSkillFilePlugins();
    expect(ids).toEqual([
      "@@skill_animate",
      "@@skill_prototype",
      "@@skill_file_read",
    ]);
  });

  it("builds a skill plugin whose handler returns the body and support-file manifest", async () => {
    const skillPath = writeSkill(root, "animate", {
      name: "animate",
      description: "Build an animation.",
    });
    fs.writeFileSync(path.join(skillPath, "RECIPES.md"), "recipes");

    const plugin = await SkillFiles.loadSkillFilePlugin("@@skill_animate");
    expect(plugin.name).toBe("skill_animate");

    const fn = captureRegisteredFunction(plugin);
    expect(fn.name).toBe("skill_animate");
    expect(fn.description).toContain("animate");

    const result = await fn.handler();
    expect(result).toContain("--- SKILL.md: animate ---");
    expect(result).toContain("Instructions here.");
    expect(result).toContain("RECIPES.md");
    expect(result).toContain('skill="animate"');
  });

  it("rejects skill folder ids that try to escape the skills root", async () => {
    writeSkill(root, "animate", { name: "animate", description: "a" });

    // A traversal id must not resolve to anything outside the skills root.
    const plugin = await SkillFiles.loadSkillFilePlugin(
      "@@skill_" + ["..", "outside-skill", "evil"].join("/")
    );
    expect(plugin).toBeNull();
  });

  it("reader tool refuses traversal and reads valid support files", async () => {
    const skillPath = writeSkill(root, "animate", {
      name: "animate",
      description: "a",
    });
    fs.writeFileSync(path.join(skillPath, "RECIPES.md"), "recipe content");

    const reader = await SkillFiles.loadSkillFilePlugin("@@skill_file_read");
    expect(reader.name).toBe("skill-file-read");
    const fn = captureRegisteredFunction(reader);

    const good = await fn.handler({ skill: "animate", file: "RECIPES.md" });
    expect(good).toBe("recipe content");

    const traversal = await fn.handler({
      skill: ["..", "..", ".."].join("/"),
      file: "anything",
    });
    expect(traversal).toMatch(/Invalid skill or file name/);

    const missing = await fn.handler({
      skill: "animate",
      file: "nope.md",
    });
    expect(missing).toMatch(/not found/);
  });
});
