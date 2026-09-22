import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CaretRight,
  Folder,
  FolderOpen,
  HouseLine,
  Plus,
} from "@phosphor-icons/react";
import Workspace from "@/models/workspace";
import { isDesktopApp, selectNativeFolder } from "@/utils/desktopBridge";

/**
 * Click-to-select folder picker (like an upload dialog): navigate the
 * terminal jail root, pick an existing folder or name a new one - never
 * type a full path. Selection returns a jail-relative path the create
 * endpoint resolves and mkdirs.
 */
export default function FolderPicker({ initialRel = "", onSelect, onClose }) {
  const { t } = useTranslation();
  const [rel, setRel] = useState(initialRel);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async (target) => {
    setLoading(true);
    setError(null);
    const result = await Workspace.browseFolders(target);
    setLoading(false);
    if (!result?.ok) {
      setError(result?.error || t("new-workspace.browse-error"));
      return;
    }
    setRel(result.rel);
    setFolders(result.folders || []);
  }, []);

  useEffect(() => {
    load(initialRel);
  }, [initialRel, load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const crumbs = rel ? rel.split("/") : [];
  const goCrumb = (index) =>
    load(index < 0 ? "" : crumbs.slice(0, index + 1).join("/"));
  const enter = (name) => load(rel ? `${rel}/${name}` : name);
  const choose = (value) => onSelect?.(value);

  const createNew = () => {
    const name = newName.trim().replace(/[/\\]+$/, "");
    if (!name) return;
    choose(rel ? `${rel}/${name}` : name);
  };

  return (
    <div className="w-screen h-screen fixed top-0 left-0 flex justify-center items-center z-[120]">
      <div
        className="backdrop h-full w-full absolute top-0 z-10"
        onClick={onClose}
      />
      <div className="relative z-20 w-[440px] max-w-[92vw] bg-zinc-900 light:bg-white rounded-[12px] shadow border-2 border-zinc-800 light:border-slate-300 p-5 flex flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <p className="text-white light:text-slate-900 font-semibold text-sm">
            {t("new-workspace.browse-title")}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="border-none bg-transparent text-zinc-400 hover:text-white light:hover:text-slate-900 text-lg leading-none cursor-pointer"
          >
            ×
          </button>
        </div>

        <div className="flex items-center gap-x-1 text-xs flex-wrap">
          <button
            type="button"
            onClick={() => goCrumb(-1)}
            className="border-none bg-transparent cursor-pointer flex items-center gap-x-1 text-sky-400 hover:text-sky-300 px-1 py-0.5"
          >
            <HouseLine size={14} />
            {t("new-workspace.browse-root")}
          </button>
          {crumbs.map((crumb, index) => (
            <React.Fragment key={index}>
              <CaretRight size={12} className="text-zinc-500" />
              <button
                type="button"
                onClick={() => goCrumb(index)}
                className="border-none bg-transparent cursor-pointer text-sky-400 hover:text-sky-300 px-1 py-0.5"
              >
                {crumb}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="max-h-[260px] overflow-y-auto flex flex-col gap-y-1 border border-zinc-800 light:border-slate-200 rounded-lg p-2">
          {loading && (
            <p className="text-zinc-500 text-xs px-2 py-3">
              {t("common.loading")}
            </p>
          )}
          {!loading && error && (
            <p className="text-red-400 text-xs px-2 py-3">Error: {error}</p>
          )}
          {!loading && !error && folders.length === 0 && (
            <p className="text-zinc-500 text-xs px-2 py-3">
              {t("new-workspace.browse-empty")}
            </p>
          )}
          {!loading &&
            !error &&
            folders.map((folder) => (
              <div
                key={folder.name}
                className="group flex items-center gap-x-2 rounded-md px-2 h-[32px] hover:bg-zinc-800 light:hover:bg-slate-100"
              >
                <button
                  type="button"
                  onClick={() => enter(folder.name)}
                  title={t("new-workspace.browse-open")}
                  className="border-none bg-transparent cursor-pointer flex flex-1 items-center gap-x-2 min-w-0 text-left"
                >
                  <Folder
                    size={16}
                    className="shrink-0 text-zinc-400 group-hover:text-sky-400"
                  />
                  <span className="truncate text-[13px] text-white light:text-slate-900">
                    {folder.name}
                  </span>
                  {folder.hasSubdirs && (
                    <CaretRight size={12} className="shrink-0 text-zinc-600" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    choose(rel ? `${rel}/${folder.name}` : folder.name)
                  }
                  className="border-none cursor-pointer shrink-0 text-[11px] font-semibold text-sky-400 hover:text-sky-300 opacity-0 group-hover:opacity-100 focus:opacity-100 px-1"
                >
                  {t("new-workspace.browse-select")}
                </button>
              </div>
            ))}
        </div>

        {showNew ? (
          <div className="flex items-center gap-x-2">
            <div className="flex items-center gap-x-2 flex-1 border border-zinc-700 light:border-slate-300 rounded-lg px-2.5 h-[34px]">
              <FolderOpen size={15} className="shrink-0 text-zinc-400" />
              <input
                type="text"
                value={newName}
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createNew()}
                placeholder={t("new-workspace.folder-placeholder")}
                autoComplete="off"
                className="border-none outline-none bg-transparent flex-1 min-w-0 text-[13px] text-white light:text-slate-900 placeholder:text-zinc-600 light:placeholder:text-slate-400"
              />
            </div>
            <button
              type="button"
              onClick={createNew}
              disabled={!newName.trim()}
              className="border-none cursor-pointer rounded-lg px-3 h-[34px] text-[13px] font-semibold bg-white text-black light:bg-slate-900 light:text-white disabled:opacity-40"
            >
              {t("new-workspace.browse-use")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-x-2">
            <button
              type="button"
              onClick={() => setShowNew(true)}
              className="border border-zinc-700 light:border-slate-300 cursor-pointer rounded-lg px-3 h-[34px] text-[13px] font-medium flex items-center gap-x-1.5 text-white light:text-slate-900 hover:bg-zinc-800 light:hover:bg-slate-100"
            >
              <Plus size={14} weight="bold" />
              {t("new-workspace.browse-new")}
            </button>
            <button
              type="button"
              onClick={() => choose(rel)}
              disabled={!rel}
              title={
                rel
                  ? t("new-workspace.browse-use-current")
                  : t("new-workspace.browse-pick-hint")
              }
              className="border-none cursor-pointer rounded-lg px-3 h-[34px] text-[13px] font-semibold bg-white text-black light:bg-slate-900 light:text-white disabled:opacity-40 flex-1"
            >
              {t("new-workspace.browse-use-current", { folder: rel || "…" })}
            </button>
          </div>
        )}
        {isDesktopApp() && (
          <button
            type="button"
            onClick={async () => {
              // Desktop shell: escape the jail listing into the real OS
              // folder dialog. The server still jail-checks the pick.
              const picked = await selectNativeFolder();
              if (picked) choose(picked);
            }}
            className="border border-zinc-700 light:border-slate-300 cursor-pointer rounded-lg px-3 h-[34px] text-[13px] font-medium flex items-center justify-center gap-x-2 text-white light:text-slate-900 hover:bg-zinc-800 light:hover:bg-slate-100"
          >
            <FolderOpen size={15} />
            {t("new-workspace.system-dialog")}
          </button>
        )}
      </div>
    </div>
  );
}
