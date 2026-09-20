// The filesystem manager resolves its sandbox root from STORAGE_DIR when
// first used - point it at this suite's temp dir before any call.
const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.STORAGE_DIR = fs.mkdtempSync(
  path.join(os.tmpdir(), "file-viewer-test-")
);

const {
  readFileForViewer,
  looksBinary,
  MAX_TEXT_BYTES,
} = require("../../../utils/files/fileViewer");

const SANDBOX = path.resolve(
  path.join(process.env.STORAGE_DIR, "anythingllm-fs")
);

/**
 * Writes a fixture file inside the sandbox. Fixture paths are static
 * strings, but the same boundary rules as production apply: every segment
 * must be a plain basename and the resolved target must stay under the
 * sandbox root.
 * @param {string} rel - sandbox-relative fixture path ("/" separated)
 * @param {string|Buffer} content
 * @returns {string} absolute fixture path
 */
function write(rel, content) {
  const parts = rel.split(/[\\/]/);
  for (const seg of parts) {
    if (!seg || seg === "." || seg === ".." || path.basename(seg) !== seg)
      throw new Error(`Unsafe fixture path: ${rel}`);
  }
  const target = path.resolve(SANDBOX, ...parts);
  if (target !== SANDBOX && !target.startsWith(SANDBOX + path.sep))
    throw new Error(`Fixture escapes sandbox: ${rel}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

describe("readFileForViewer", () => {
  test("reads a text file and reports a root-relative path", async () => {
    write("hello.html", "<html><body>hi</body></html>\n");
    const result = await readFileForViewer("hello.html");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("text");
    expect(result.path).toBe(path.join("hello.html"));
    expect(result.basename).toBe("hello.html");
    expect(result.content).toContain("<body>hi</body>");
    expect(result.truncated).toBe(false);
  });

  test("reads files nested under subdirectories", async () => {
    write("src/index.js", "console.log('x');\n");
    const result = await readFileForViewer("src/index.js");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("text");
    expect(result.path).toBe(path.join("src", "index.js"));
  });

  test("rejects traversal outside the sandbox root", async () => {
    write("inside.txt", "ok");
    const result = await readFileForViewer("../../server.pem");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Could not open/i);
  });

  test("reports a missing file as kind missing, not an error", async () => {
    const result = await readFileForViewer("nope-does-not-exist.txt");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("missing");
  });

  test("returns images as a data URL with mime type", async () => {
    // 1x1 transparent PNG
    write(
      "dot.png",
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64"
      )
    );
    const result = await readFileForViewer("dot.png");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("image");
    expect(result.mime).toBe("image/png");
    expect(result.content.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("flags binary files instead of decoding them", async () => {
    write("blob.bin", Buffer.from([0x00, 0x01, 0x02, 0x03, 0x00, 0xff]));
    const result = await readFileForViewer("blob.bin");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("binary");
    expect(result.content).toBeUndefined();
  });

  test("truncates oversized text files and marks them", async () => {
    write("big.log", "x".repeat(MAX_TEXT_BYTES + 2048));
    const result = await readFileForViewer("big.log");
    expect(result.ok).toBe(true);
    expect(result.kind).toBe("text");
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(MAX_TEXT_BYTES);
  });

  test("rejects directories and empty paths", async () => {
    fs.mkdirSync(path.join(SANDBOX, "folder"), { recursive: true });
    await expect(readFileForViewer("folder")).resolves.toMatchObject({
      ok: false,
    });
    await expect(readFileForViewer("  ")).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("looksBinary", () => {
  test("NUL bytes mean binary", () => {
    expect(looksBinary(Buffer.from("hello\x00world"))).toBe(true);
  });
  test("plain ASCII is not binary", () => {
    expect(looksBinary(Buffer.from("just some text\nwith lines"))).toBe(false);
  });
});
