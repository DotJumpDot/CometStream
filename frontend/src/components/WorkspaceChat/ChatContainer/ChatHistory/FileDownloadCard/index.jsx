import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { saveAs } from "file-saver";
import {
  CaretDown,
  CircleNotch,
  DownloadSimple,
  FilePlus,
} from "@phosphor-icons/react";
import { humanFileSize } from "@/utils/numbers";
import StorageFiles from "@/models/files";

/**
 * Hard cap on rendered preview rows - the server already caps the payload,
 * this keeps a pathological file from producing an unbounded DOM.
 */
const MAX_PREVIEW_ROWS = 400;
const PREVIEW_FETCH_CHARS = 8_000;

// Extensions worth previewing as text. Anything else stays download-only
// (binary formats have no meaningful line preview).
const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "html",
  "htm",
  "xml",
  "yaml",
  "yml",
  "log",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "scss",
  "py",
  "sh",
  "sql",
  "env",
]);

/**
 * Whether a filename looks like previewable text. Used for rows created
 * before the server started sending `contentPreview` - those fetch the
 * file on expand instead of staying download-only.
 * @param {string} filename
 * @returns {boolean}
 */
function isTextPreviewable(filename) {
  const ext = (filename || "").split(".").pop()?.toLowerCase() ?? "";
  return TEXT_PREVIEW_EXTENSIONS.has(ext);
}

/**
 * Single-line file row for agent-created files, styled after the
 * filesystem `FileChangeCard`: icon + verb + filename + size on the left,
 * `+N` line count and download action on the right. Text files expand
 * inline to a green added-lines preview; binary formats stay
 * download-only.
 * @param {{content: {filename: string, storageFilename?: string, fileSize?: number, added?: number, contentPreview?: string, previewTruncated?: boolean}}} props
 */
function FileDownloadCard({ props }) {
  const { t } = useTranslation();
  const {
    filename,
    storageFilename,
    fileSize,
    added = 0,
    contentPreview = "",
    previewTruncated = false,
  } = props.content || {};
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Lazy preview for rows created before the server sent `contentPreview`:
  // fetched once on first expand, then cached for the session.
  const [fetchedText, setFetchedText] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);

  const basename = (filename || "Unknown file").split("/").pop();
  const serverPreview =
    typeof contentPreview === "string" && !!contentPreview
      ? contentPreview
      : "";
  // Rows created before the preview payload existed fetch text on expand.
  const canFetchPreview =
    !serverPreview &&
    isTextPreviewable(filename) &&
    !!storageFilename &&
    !fetchFailed;
  const effectivePreview = serverPreview || fetchedText || "";
  const hasPreview = !!effectivePreview || canFetchPreview;
  const previewTruncatedEffective =
    !!previewTruncated ||
    (fetchedText != null && fetchedText.length >= PREVIEW_FETCH_CHARS);
  const lineCount =
    added > 0
      ? added
      : effectivePreview
        ? effectivePreview.split("\n").length
        : 0;

  const previewRows = useMemo(() => {
    if (!effectivePreview) return [];
    return effectivePreview.split("\n").slice(0, MAX_PREVIEW_ROWS);
  }, [effectivePreview]);
  const hitRenderCap =
    !!effectivePreview && previewRows.length >= MAX_PREVIEW_ROWS;

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    // Lazy-fetch text for old rows on first expand.
    if (
      next &&
      !serverPreview &&
      fetchedText == null &&
      !fetching &&
      !fetchFailed &&
      isTextPreviewable(filename) &&
      storageFilename
    ) {
      setFetching(true);
      StorageFiles.download(storageFilename)
        .then((blob) =>
          blob ? blob.text() : Promise.reject(new Error("empty"))
        )
        .then((text) =>
          setFetchedText((text || "").slice(0, PREVIEW_FETCH_CHARS))
        )
        .catch(() => setFetchFailed(true))
        .finally(() => setFetching(false));
    }
  }

  const handleDownload = async (event) => {
    event?.stopPropagation();
    if (downloading) return;
    if (!storageFilename) return;

    setDownloading(true);
    try {
      const blob = await StorageFiles.download(storageFilename);
      if (!blob) throw new Error("Failed to download file");
      saveAs(blob, filename || storageFilename);
    } catch {
      console.error("Failed to download file");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="not-prose w-full mt-2 mb-2">
      <div
        className={`flex items-center gap-x-1 w-full max-w-[640px] rounded-lg px-2 py-1 text-left text-sm transition-colors duration-150 ${
          hasPreview ? "hover:bg-white/[0.05] light:hover:bg-black/[0.05]" : ""
        }`}
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={hasPreview ? expanded : undefined}
          aria-label={t("chat_window.file_change.created_file", {
            path: filename || "",
          })}
          title={filename || ""}
          disabled={!hasPreview}
          className={`flex items-center gap-x-2.5 flex-1 min-w-0 border-none bg-transparent p-0 text-left ${
            hasPreview ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md shrink-0 bg-emerald-500/15 text-emerald-400 light:text-emerald-500">
            <FilePlus className="w-3.5 h-3.5" />
          </span>
          <span className="min-w-0 flex-1 flex items-baseline gap-x-1.5">
            <span className="text-[12px] text-zinc-400 light:text-zinc-500 shrink-0">
              {t("chat_window.file_change.verb_create")}
            </span>
            <span className="font-mono text-[13px] text-zinc-100 light:text-zinc-900 truncate">
              {basename}
            </span>
            {fileSize != null && (
              <span className="font-mono text-[11px] text-zinc-500 light:text-zinc-400 shrink-0">
                {humanFileSize(fileSize, true, 1)}
              </span>
            )}
          </span>
          <span className="ml-auto flex items-center gap-x-2 flex-shrink-0 pl-2">
            {lineCount > 0 && (
              <span className="font-mono text-xs text-emerald-500 light:text-emerald-600">
                +{lineCount}
              </span>
            )}
            {hasPreview && (
              <CaretDown
                className={`w-3 h-3 text-zinc-500 light:text-zinc-400 transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading || !storageFilename}
          title={t("chat_window.file.download")}
          aria-label={t("chat_window.file.download")}
          className="border-none cursor-pointer flex items-center justify-center h-6 w-6 rounded-full text-zinc-400 light:text-slate-500 hover:text-white light:hover:text-slate-900 hover:bg-zinc-700 light:hover:bg-slate-200 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloading ? (
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          ) : (
            <DownloadSimple size={14} weight="bold" />
          )}
        </button>
      </div>
      {hasPreview && (
        <div
          className={`grid max-w-[640px] transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
            expanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-1 rounded-lg border border-white/10 light:border-black/10 overflow-hidden text-[12px] font-mono w-full">
              <div className="max-h-[420px] overflow-y-auto py-1">
                {fetching && !effectivePreview && (
                  <p className="px-3 py-2 text-[11px] text-zinc-500 light:text-zinc-400">
                    Loading preview…
                  </p>
                )}
                {fetchFailed && !effectivePreview && (
                  <p className="px-3 py-2 text-[11px] text-zinc-500 light:text-zinc-400">
                    Preview unavailable — download the file to view it.
                  </p>
                )}
                {previewRows.map((line, i) => (
                  <div
                    key={i}
                    className="flex bg-emerald-500/10 py-1 leading-[1.7]"
                  >
                    <span className="w-9 flex-shrink-0 pr-1 text-right text-zinc-500 light:text-zinc-400 select-none tabular-nums">
                      {""}
                    </span>
                    <span className="w-9 flex-shrink-0 pr-1 text-right text-zinc-500 light:text-zinc-400 select-none border-r border-white/5 light:border-black/10 mr-3 tabular-nums">
                      {i + 1}
                    </span>
                    <span className="flex-1 pr-3 whitespace-pre-wrap break-words text-emerald-300 light:text-emerald-700">
                      {`+${line || ""}`}
                    </span>
                  </div>
                ))}
              </div>
              {(previewTruncatedEffective || hitRenderCap) && (
                <div className="px-3 py-1 text-[11px] text-zinc-500 light:text-zinc-400 border-t border-white/10 light:border-black/10">
                  {t("chat_window.file_change.diff_capped")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(FileDownloadCard);
