import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  FileText,
  FileX,
  ImageSquare,
  X,
} from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import { splitPath } from "@/components/WorkspaceChat/ChatContainer/ChatHistory/FileChangeCard/shared.jsx";

// Rendering tens of thousands of line-number nodes makes the panel sluggish
// on huge (capped-at-512KB) files; past this many lines the reader shows a
// footer note instead.
const MAX_RENDERED_LINES = 5000;

/**
 * The file reader shown inside the agent side panel when a file reference
 * in a chat message is clicked: VSCode-style read-only view with a
 * line-number gutter, image preview, and friendly missing/binary states.
 * Content comes from the workspace file-content endpoint, which only
 * serves files inside the agent filesystem sandbox.
 *
 * @param {Object} props
 * @param {string} props.workspaceSlug - workspace the chat belongs to
 * @param {string} props.filePath - sandbox-relative path to display
 * @param {Function} props.onBack - return to the panel's normal sections
 * @param {Function} props.onClose - close the agent panel entirely
 */
export default function FileViewer({
  workspaceSlug,
  filePath,
  onBack,
  onClose,
}) {
  const { t } = useTranslation();
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true });
    Workspace.fileContent(workspaceSlug, filePath).then((result) => {
      if (cancelled) return;
      if (result.ok) setState({ loading: false, file: result });
      else
        setState({
          loading: false,
          error: result.error || t("agent_panel.file_viewer.open_failed"),
        });
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, filePath, t]);

  const { basename, dirname } = useMemo(
    () => splitPath(filePath.replace(/\\/g, "/")),
    [filePath]
  );

  const file = state.file;
  const lines = useMemo(
    () => (file?.kind === "text" ? (file.content || "").split("\n") : []),
    [file]
  );
  const capped = lines.length > MAX_RENDERED_LINES;
  const shownLines = capped ? lines.slice(0, MAX_RENDERED_LINES) : lines;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center gap-x-2 px-3 py-3 border-b border-white/10 light:border-black/10">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("agent_panel.file_viewer.back")}
          title={t("agent_panel.file_viewer.back")}
          className="shrink-0 text-white/60 light:text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors border-none bg-transparent cursor-pointer"
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <div className="min-w-0 flex-1 flex flex-col">
          <span className="font-mono text-[13px] text-white light:text-slate-900 truncate">
            {basename}
          </span>
          {dirname && (
            <span className="font-mono text-[10px] text-zinc-500 light:text-zinc-400 truncate">
              {dirname}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("agent_panel.close")}
          title={t("agent_panel.close")}
          className="shrink-0 text-white/60 light:text-slate-400 hover:text-white light:hover:text-slate-900 transition-colors border-none bg-transparent cursor-pointer"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {state.loading && (
          <Centered>
            <span className="inline-block w-4 h-4 rounded-full border-2 border-zinc-600 border-t-transparent animate-spin" />
          </Centered>
        )}

        {!state.loading && state.error && (
          <Centered>
            <FileX className="w-6 h-6 text-zinc-500 light:text-zinc-400 mb-2" />
            <p className="text-xs text-zinc-400 light:text-zinc-500">
              {state.error}
            </p>
          </Centered>
        )}

        {!state.loading && !state.error && file?.kind === "missing" && (
          <Centered>
            <FileX className="w-6 h-6 text-zinc-500 light:text-zinc-400 mb-2" />
            <p className="text-xs text-zinc-400 light:text-zinc-500">
              {t("agent_panel.file_viewer.not_found")}
            </p>
          </Centered>
        )}

        {!state.loading && !state.error && file?.kind === "binary" && (
          <Centered>
            <FileText className="w-6 h-6 text-zinc-500 light:text-zinc-400 mb-2" />
            <p className="text-xs text-zinc-400 light:text-zinc-500">
              {t("agent_panel.file_viewer.not_previewable")}
            </p>
          </Centered>
        )}

        {!state.loading && !state.error && file?.kind === "too-large" && (
          <Centered>
            <FileText className="w-6 h-6 text-zinc-500 light:text-zinc-400 mb-2" />
            <p className="text-xs text-zinc-400 light:text-zinc-500">
              {t("agent_panel.file_viewer.too_large")}
            </p>
          </Centered>
        )}

        {!state.loading && !state.error && file?.kind === "image" && (
          <div className="p-4 flex items-start justify-center">
            <img
              src={file.content}
              alt={file.basename}
              className="max-w-full rounded-md border border-white/10 light:border-black/10"
            />
          </div>
        )}

        {!state.loading && !state.error && file?.kind === "text" && (
          <div className="overflow-x-auto font-mono text-[11px] leading-5 text-zinc-200 light:text-zinc-800">
            <div className="flex min-h-full w-max">
              <div
                aria-hidden="true"
                className="sticky left-0 select-none text-right text-zinc-600 light:text-zinc-400 py-3 pl-3 pr-2 bg-zinc-900 light:bg-white border-r border-white/5 light:border-black/10 z-[1]"
              >
                {shownLines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <pre className="py-3 pl-3 pr-6 m-0 whitespace-pre">
                {shownLines.join("\n")}
              </pre>
            </div>
            {(capped || file.truncated) && (
              <p className="px-3 py-2 text-[10px] text-zinc-500 light:text-zinc-400 border-t border-white/5 light:border-black/10">
                {capped
                  ? t("agent_panel.file_viewer.lines_capped", {
                      count: MAX_RENDERED_LINES,
                    })
                  : t("agent_panel.file_viewer.truncated")}
              </p>
            )}
          </div>
        )}
      </div>

      {!state.loading && !state.error && file?.kind === "image" && (
        <div className="px-3 py-2 border-t border-white/10 light:border-black/10 flex items-center gap-x-1.5 text-[10px] text-zinc-500 light:text-zinc-400">
          <ImageSquare className="w-3.5 h-3.5" />
          <span>{file.basename}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Vertically centered state message container.
 * @param {Object} props
 * @param {import("react").ReactNode} props.children
 */
function Centered({ children }) {
  return (
    <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center px-6">
      {children}
    </div>
  );
}
