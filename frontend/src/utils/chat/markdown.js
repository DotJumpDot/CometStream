import { encode as HTMLEncode } from "he";
import markdownIt from "markdown-it";
import markdownItKatexPlugin from "./plugins/markdown-katex";
import Appearance from "@/models/appearance";
import hljs from "highlight.js";
import "./themes/github-dark.css";
import "./themes/github.css";
import "./themes/monokai.css";
import { v4 } from "uuid";

// Register custom lanaguages
import hljsDefineSvelte from "./hljs-libraries/svelte";
hljs.registerLanguage("svelte", hljsDefineSvelte);

const markdown = markdownIt({
  html: Appearance.get("renderHTML") ?? false,
  typographer: true,
  highlight: function (code, lang) {
    const uuid = v4();
    const activeTheme = window.localStorage.getItem("theme");
    const theme =
      activeTheme === "light"
        ? "github"
        : activeTheme?.startsWith("monokai")
          ? "monokai"
          : "github-dark";

    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          `<div class="whitespace-pre-line w-full max-w-[65vw] hljs ${theme} light:border-solid light:border light:border-gray-700 rounded-lg relative font-mono font-normal text-sm text-slate-200">
            <div class="w-full flex items-center sticky top-0 text-slate-200 light:bg-sky-800 bg-stone-800 px-4 py-2 text-xs font-sans justify-between rounded-t-md -mt-5">
              <div class="flex gap-2">
                <code class="text-xs">${lang || ""}</code>
              </div>
              <button data-code-snippet data-code="code-${uuid}" class="flex items-center gap-x-1">
                <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                <p class="text-xs" style="margin: 0px;padding: 0px;">Copy block</p>
              </button>
            </div>
            <pre class="whitespace-pre-wrap px-4 pb-4">` +
          hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
          "</pre></div>"
        );
      } catch {}
    }

    return (
      `<div class="whitespace-pre-line w-full max-w-[65vw] hljs ${theme} light:border-solid light:border light:border-gray-700 rounded-lg relative font-mono font-normal text-sm text-slate-200">
        <div class="w-full flex items-center sticky top-0 text-slate-200 bg-stone-800 px-4 py-2 text-xs font-sans justify-between rounded-t-md -mt-5">
          <div class="flex gap-2"><code class="text-xs"></code></div>
          <button data-code-snippet data-code="code-${uuid}" class="flex items-center gap-x-1">
            <svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            <p class="text-xs" style="margin: 0px;padding: 0px;">Copy block</p>
          </button>
        </div>
        <pre class="whitespace-pre-wrap px-4 pb-4">` +
      HTMLEncode(code) +
      "</pre></div>"
    );
  },
});

// Add custom renderer for strong tags to handle theme colors
markdown.renderer.rules.strong_open = () => '<strong class="text-white">';
markdown.renderer.rules.strong_close = () => "</strong>";

/**
 * Active hljs theme class for the current app theme, shared by block and
 * inline code rendering.
 * @returns {"github"|"github-dark"|"monokai"}
 */
function activeCodeTheme() {
  const activeTheme = window.localStorage.getItem("theme");
  if (activeTheme === "light") return "github";
  if (activeTheme?.startsWith("monokai")) return "monokai";
  return "github-dark";
}

/**
 * Inline code renderer. Snippets that look like HTML/XML (models routinely
 * reference tags like <title>...</title> inside plain prose) get hljs
 * token colors from the same theme the code blocks use; everything else
 * renders as a plain mono chip.
 */
markdown.renderer.rules.code_inline = (tokens, idx) => {
  const content = tokens[idx].content;
  let body = HTMLEncode(content);
  if (/^\s*<\/?[a-zA-Z]/.test(content)) {
    try {
      body = hljs.highlight(content, {
        language: "xml",
        ignoreIllegals: true,
      }).value;
    } catch {}
  }
  // A chip that is nothing but a file path opens the file reader when
  // clicked; it keeps its chip styling and gains the ref behavior.
  if (isFilePathRef(content)) {
    const attr = body.replace(/"/g, "&quot;");
    return `<button type="button" class="inline-code cs-file-ref hljs ${activeCodeTheme()}" data-file-ref="${attr}">${body}</button>`;
  }
  return `<code class="inline-code hljs ${activeCodeTheme()}">${body}</code>`;
};
markdown.renderer.rules.link_open = (tokens, idx) => {
  const token = tokens[idx];
  const href = token.attrs.find((attr) => attr[0] === "href");
  return `<a href="${HTMLEncode(href[1])}" target="_blank" rel="noopener noreferrer">`;
};

// Wrap tables in a scrollable card container: the wrapper (styled by
// .markdown-table-wrapper in index.css) owns the border, radius and
// background, and lets wide tables scroll horizontally instead of
// stretching the chat column or getting clipped.
markdown.renderer.rules.table_open = () =>
  '<div class="markdown-table-wrapper"><table>';
markdown.renderer.rules.table_close = () => "</table></div>";

// ---------------------------------------------------------------------------
// Inline file references
//
// File-looking tokens in chat prose ("see hello.html") become clickable
// chips that open the agent panel's file reader. Detection is deliberately
// conservative: a known code/file extension is required, so version
// strings ("v1.2"), domains ("example.com") and prose never match. The
// boundary lookarounds reject matches inside URLs (the "/" before a path
// segment) and inside longer words/paths.
// ---------------------------------------------------------------------------

const FILE_REF_EXTENSIONS = [
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "json",
  "jsonc",
  "md",
  "mdx",
  "txt",
  "rtf",
  "csv",
  "tsv",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "py",
  "rb",
  "php",
  "java",
  "kt",
  "swift",
  "go",
  "rs",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "sql",
  "graphql",
  "prisma",
  "dockerfile",
  "lock",
  "log",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "ico",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "mov",
  "zip",
  "tar",
  "gz",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "eot",
];
// Longest-first so the alternation cannot stop early on a prefix ("cpp"
// before "c", "jpeg" before "jpg").
const EXT_ALTERNATION = [...FILE_REF_EXTENSIONS]
  .sort((a, b) => b.length - a.length)
  .join("|");
const FILE_REF_REGEX = new RegExp(
  `(?<![\\w@.\\-/])(?:[\\w@.\\-]+\\/)*[\\w@.\\-]+\\.(?:${EXT_ALTERNATION})(?!\\w)`,
  "gi"
);
// A backticked chip is treated as a path only when it is nothing but one.
const PURE_PATH_REGEX = new RegExp(
  `^[\\w@.\\-]+(?:\\/[\\w@.\\-]+)*\\.(?:${EXT_ALTERNATION})$`,
  "i"
);

/**
 * Whether a bare string is a file reference the viewer can open.
 * @param {string} text
 * @returns {boolean}
 */
function isFilePathRef(text) {
  return PURE_PATH_REGEX.test(text);
}

/**
 * Wraps file-path tokens in already-HTML-escaped prose with the clickable
 * chip markup. The click itself is delegated at the document level by the
 * agent side panel, so the markup only needs the data attribute.
 * @param {string} escapedText
 * @returns {string}
 */
function wrapFileRefs(escapedText) {
  return escapedText.replace(FILE_REF_REGEX, (match) => {
    const attr = match.replace(/"/g, "&quot;");
    return `<button type="button" class="cs-file-ref" data-file-ref="${attr}">${match}</button>`;
  });
}

// Plain text segments in prose get file-ref chips.
markdown.renderer.rules.text = (tokens, idx) =>
  wrapFileRefs(markdown.utils.escapeHtml(tokens[idx].content));

// Custom renderer for responsive images rendered in markdown
markdown.renderer.rules.image = function (tokens, idx) {
  const token = tokens[idx];
  const srcIndex = token.attrIndex("src");
  const src = token.attrs[srcIndex][1];
  const alt = token.content || "";

  return `<div class="w-full max-w-[800px]"><img src="${HTMLEncode(src)}" alt="${HTMLEncode(alt)}" class="w-full h-auto" /></div>`;
};

markdown.use(markdownItKatexPlugin);

// A complete HTML element in prose (<title>Hello World</title>) is one unit.
const HTML_ELEMENT =
  /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^<>\n]*)?)>([^<>\n]*)<\/\1\s*>/;
// Any single opening/closing/void tag (<h1>, </div>, <br/>).
const HTML_TAG = /<\/?[a-zA-Z][^<>\n]*\/?>/;

/**
 * Wrap raw HTML fragments in prose into markdown inline-code spans so they
 * render highlighted instead of as escaped, unstyled text (HTML rendering is
 * disabled in markdown-it). Fenced blocks are skipped - the block highlighter
 * owns those - and existing `code` spans are copied through verbatim so tags
 * the model already backticked are not double-wrapped.
 * @param {string} text
 * @returns {string}
 */
function wrapInlineHtml(text = "") {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      let out = "";
      let rest = line;
      while (rest) {
        const element = rest.match(HTML_ELEMENT);
        const tag = rest.match(HTML_TAG);
        const match =
          element && (!tag || element.index <= tag.index) ? element : tag;
        const nextTick = rest.indexOf("`");

        // Copy a complete `code` span through verbatim - when it starts here
        // or begins before the next tag match - so tags the model already
        // backticked are never double-wrapped.
        const spanFromStart = rest.match(/^`[^`]*`/);
        const spanBeforeMatch =
          nextTick >= 0 && (!match || nextTick < match.index)
            ? rest.slice(nextTick).match(/^`[^`]*`/)
            : null;
        const span = spanFromStart || spanBeforeMatch;
        if (span) {
          const start = spanFromStart ? 0 : nextTick;
          out += rest.slice(0, start) + span[0];
          rest = rest.slice(start + span[0].length);
          continue;
        }

        if (match) {
          out += rest.slice(0, match.index) + "`" + match[0] + "`";
          rest = rest.slice(match.index + match[0].length);
          continue;
        }
        out += rest;
        break;
      }
      return out;
    })
    .join("\n");
}

export default function renderMarkdown(text = "") {
  return markdown.render(wrapInlineHtml(text));
}

/**
 * Chain-of-thought is written loosely: models pad list markers with extra
 * spaces ("*   item") and indent even top-level lists by 4 spaces. Markdown
 * reads a 4-space indent as an indented code block, or lazily folds those
 * lines into the previous paragraph — either way the thought renders as a
 * jumble of literal asterisks. Halve deep indents (4 -> 2 per level) and
 * tighten marker padding so the content parses as the lists it was meant to
 * be. Lines inside fenced ``` blocks pass through untouched.
 * @param {string} text
 * @returns {string}
 */
function normalizeThoughtIndentation(text = "") {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("```")) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const width = line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
      const normWidth = width >= 4 ? Math.floor(width / 2) : width;
      const dedented = " ".repeat(normWidth) + line.trimStart();
      return dedented.replace(/^(\s*(?:[*+-]|\d+[.)]))\s{2,}/, "$1 ");
    })
    .join("\n");
}

/**
 * Render for model thoughts. Indented-code parsing is turned off so any
 * residual indentation can never render as literal monospace text; fenced
 * ``` blocks still work. The toggle is safe on the shared instance because
 * rendering is synchronous.
 * @param {string} text
 * @returns {string}
 */
export function renderThoughtMarkdown(text = "") {
  markdown.disable("code");
  try {
    return markdown.render(normalizeThoughtIndentation(text));
  } finally {
    markdown.enable("code");
  }
}
