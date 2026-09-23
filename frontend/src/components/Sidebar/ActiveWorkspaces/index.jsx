import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import Workspace from "@/models/workspace";
import ManageWorkspace, {
  useManageWorkspaceModal,
} from "../../Modals/ManageWorkspace";
import paths from "@/utils/paths";
import { Link, useParams, useNavigate, useMatch } from "react-router-dom";
import {
  GearSix,
  UploadSimple,
  Folder,
  FolderOpen,
  CaretDown,
  PlusCircle,
  CircleNotch,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import ThreadContainer from "./ThreadContainer";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import showToast from "@/utils/toast";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { safeJsonParse } from "@/utils/request";

export const REFETCH_WORKSPACES_EVENT = "refetchWorkspaces";

export default function ActiveWorkspaces() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWs, setSelectedWs] = useState(null);
  const { showing, showModal, hideModal } = useManageWorkspaceModal();
  const { user } = useUser();
  const isInWorkspaceSettings = !!useMatch("/workspace/:slug/settings/:tab");
  const isHomePage = !!useMatch("/");

  // When on the home page, resolve which workspace should be virtually active
  const virtualActiveSlug = (() => {
    if (!isHomePage || workspaces.length === 0) return null;
    const lastVisited = safeJsonParse(
      localStorage.getItem(LAST_VISITED_WORKSPACE)
    );
    if (
      lastVisited?.slug &&
      workspaces.some((ws) => ws.slug === lastVisited.slug)
    )
      return lastVisited.slug;
    return workspaces[0]?.slug ?? null;
  })();

  // ZCode-style expand/collapse: clicking a project row toggles its thread
  // list instead of navigating away to a new Draft. The active project
  // starts expanded; every other row expands on first click and fetches its
  // threads lazily via ThreadContainer. These hooks sit above the loading
  // early-return on purpose (rules-of-hooks).
  const activeSlug = slug || virtualActiveSlug;
  const [expandedSlugs, setExpandedSlugs] = useState([]);
  useEffect(() => {
    if (!activeSlug) return;
    setExpandedSlugs((prev) =>
      prev.includes(activeSlug) ? prev : [...prev, activeSlug]
    );
  }, [activeSlug]);
  const toggleExpand = (wsSlug) =>
    setExpandedSlugs((prev) =>
      prev.includes(wsSlug)
        ? prev.filter((s) => s !== wsSlug)
        : [...prev, wsSlug]
    );

  useEffect(() => {
    async function getWorkspaces() {
      const workspaces = await Workspace.all();
      setLoading(false);
      setWorkspaces(Workspace.orderWorkspaces(workspaces));
    }
    getWorkspaces();

    // Refetch when a workspace is created elsewhere in the app (eg: the
    // NewWorkspace modal) since those flows navigate via the router and no
    // longer trigger a full page reload.
    window.addEventListener(REFETCH_WORKSPACES_EVENT, getWorkspaces);
    return () =>
      window.removeEventListener(REFETCH_WORKSPACES_EVENT, getWorkspaces);
  }, []);

  if (loading) {
    return (
      <Skeleton.default
        height={40}
        width="100%"
        count={5}
        baseColor="var(--theme-sidebar-item-default)"
        highlightColor="var(--theme-sidebar-item-hover)"
        enableAnimation={true}
        className="my-1"
      />
    );
  }

  /**
   * Reorders workspaces in the UI via localstorage on client side.
   * @param {number} startIndex - the index of the workspace to move
   * @param {number} endIndex - the index to move the workspace to
   */
  function reorderWorkspaces(startIndex, endIndex) {
    const reorderedWorkspaces = Array.from(workspaces);
    const [removed] = reorderedWorkspaces.splice(startIndex, 1);
    reorderedWorkspaces.splice(endIndex, 0, removed);
    setWorkspaces(reorderedWorkspaces);
    const success = Workspace.storeWorkspaceOrder(
      reorderedWorkspaces.map((w) => w.id)
    );
    if (!success) {
      showToast("Failed to reorder workspaces", "error");
      Workspace.all().then((workspaces) => setWorkspaces(workspaces));
    }
  }

  const onDragEnd = (result) => {
    if (!result.destination) return;
    reorderWorkspaces(result.source.index, result.destination.index);
  };

  return (
    <div className="flex flex-col gap-y-[6px]">
      {/* Header only renders when there is something to label - an empty
          workspace list should not show an orphaned "Projects" heading. */}
      {workspaces.length > 0 && (
        <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-theme-text-secondary opacity-60 px-2">
          {t("sidebar.projects")}
        </p>
      )}
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="workspaces">
          {(provided) => (
            <div
              role="list"
              aria-label="Workspaces"
              className="flex flex-col gap-y-[2px]"
              ref={provided.innerRef}
              {...provided.droppableProps}
            >
              {workspaces.map((workspace, index) => {
                const isVirtuallyActive = workspace.slug === virtualActiveSlug;
                const isActive = workspace.slug === slug || isVirtuallyActive;
                const isExpanded = expandedSlugs.includes(workspace.slug);
                return (
                  <Draggable
                    key={workspace.id}
                    draggableId={workspace.id.toString()}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`flex flex-col w-full group ${
                          snapshot.isDragging ? "opacity-50" : ""
                        }`}
                        role="listitem"
                      >
                        <div
                          {...provided.dragHandleProps}
                          role="button"
                          tabIndex={0}
                          aria-expanded={isExpanded}
                          aria-label={`${workspace.name} - ${
                            isExpanded ? "collapse" : "expand"
                          } threads`}
                          onClick={() => toggleExpand(workspace.slug)}
                          onKeyDown={(e) => {
                            // The row itself is the drag handle (click-hold
                            // anywhere reorders): let keyboard-drag claim
                            // keys first, plain Enter/Space still toggles.
                            provided.dragHandleProps.onKeyDown?.(e);
                            if (
                              !e.defaultPrevented &&
                              (e.key === "Enter" || e.key === " ")
                            ) {
                              e.preventDefault();
                              toggleExpand(workspace.slug);
                            }
                          }}
                          className={`
                          flex items-center gap-x-2 w-full h-8 px-2.5 rounded-lg
                          text-[13px] leading-none transition-all duration-[200ms]
                          cursor-pointer select-none
                          ${
                            isActive
                              ? "bg-theme-sidebar-item-selected light:bg-blue-200 font-semibold text-white light:text-blue-900"
                              : "text-white light:text-black hover:bg-theme-sidebar-subitem-hover"
                          }
                        `}
                        >
                          {/* Folder icon is the explicit "open project chat"
                              affordance - the row body itself only toggles
                              (and drag-reorders on click-hold). */}
                          <Link
                            to={paths.workspace.chat(workspace.slug)}
                            onClick={(e) => e.stopPropagation()}
                            data-tooltip-id="workspace-name"
                            data-tooltip-content={t(
                              "sidebar.open-project-chat"
                            )}
                            aria-label={t("sidebar.open-project-chat")}
                            className="shrink-0 flex items-center border-none"
                          >
                            {isExpanded ? (
                              <FolderOpen
                                size={16}
                                weight="fill"
                                className="shrink-0 text-cta-button"
                              />
                            ) : (
                              <Folder
                                size={16}
                                weight="regular"
                                className="shrink-0 opacity-60"
                              />
                            )}
                          </Link>
                          <p
                            data-tooltip-id="workspace-name"
                            data-tooltip-content={
                              workspace.projectPath
                                ? `${workspace.name} — ${workspace.projectPath}`
                                : workspace.name
                            }
                            className="flex-grow truncate whitespace-nowrap overflow-hidden"
                          >
                            {workspace.name}
                          </p>
                          {user?.role !== "default" && (
                            <div
                              className={`flex items-center gap-x-[2px] transition-opacity duration-200 shrink-0 ${
                                isActive
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setSelectedWs(workspace);
                                  showModal();
                                }}
                                data-tooltip-id="upload-workspace"
                                data-tooltip-content="Upload documents to this workspace for RAG indexing"
                                className={`group/upload border-none rounded-md flex items-center justify-center p-[2px] ${
                                  isActive
                                    ? "hover:bg-zinc-500 light:hover:bg-sky-800/30"
                                    : "hover:bg-zinc-500 light:hover:bg-slate-400"
                                }`}
                              >
                                <UploadSimple
                                  className={`h-[16px] w-[16px] ${
                                    isActive
                                      ? "text-zinc-400 hover:text-white light:text-blue-700 light:group-hover/upload:text-blue-900"
                                      : "text-zinc-400 hover:text-white light:text-slate-600 light:group-hover/upload:text-slate-950"
                                  }`}
                                />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  navigate(
                                    isInWorkspaceSettings
                                      ? paths.workspace.chat(workspace.slug)
                                      : paths.workspace.settings.generalAppearance(
                                          workspace.slug
                                        )
                                  );
                                }}
                                className={`group/gear rounded-md flex items-center justify-center p-[2px] ${
                                  isActive
                                    ? "hover:bg-zinc-500 light:hover:bg-sky-800/30"
                                    : "hover:bg-zinc-500 light:hover:bg-slate-400"
                                }`}
                                aria-label="General appearance settings"
                                data-tooltip-id="gear-workspace"
                                data-tooltip-content="General appearance settings"
                              >
                                <GearSix
                                  color={
                                    isInWorkspaceSettings &&
                                    workspace.slug === slug
                                      ? "#46C8FF"
                                      : undefined
                                  }
                                  className={`h-[16px] w-[16px] ${
                                    isActive
                                      ? "text-zinc-400 hover:text-white light:text-blue-700 light:group-hover/gear:text-blue-900"
                                      : "text-zinc-400 hover:text-white light:text-slate-600 light:group-hover/gear:text-slate-950"
                                  }`}
                                />
                              </button>
                            </div>
                          )}
                          <CaretDown
                            size={12}
                            weight="bold"
                            className={`shrink-0 text-theme-text-secondary transition-transform duration-[200ms] ${
                              isExpanded
                                ? "rotate-0 opacity-80"
                                : "-rotate-90 opacity-0 group-hover:opacity-40"
                            }`}
                            aria-hidden="true"
                          />
                        </div>
                        {isExpanded && (
                          <ThreadContainer
                            workspace={workspace}
                            isActive={isActive}
                            isVirtualThread={isVirtuallyActive}
                          />
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
              {showing && (
                <ManageWorkspace
                  hideModal={hideModal}
                  providedSlug={selectedWs ? selectedWs.slug : null}
                />
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

/**
 * ZCode-style New Task button: creates a fresh empty thread and lands on
 * its (empty) draft page in the target project. Router navigation lets
 * ActiveGenerationGuard intercept mid-generation runs. Lives with the
 * sidebar quick links (not inside the project list) so the action rhythm
 * stays uniform; targetSlug is optional and self-resolves via route slug,
 * last-visited, then first project.
 */
export function NewTaskButton({ targetSlug: propSlug }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [loading, setLoading] = useState(false);
  const [resolvedSlug, setResolvedSlug] = useState(propSlug ?? null);

  useEffect(() => {
    if (propSlug) {
      setResolvedSlug(propSlug);
      return;
    }
    Workspace.all()
      .then((workspaces) => {
        const list = Workspace.orderWorkspaces(workspaces);
        if (slug && list.some((w) => w.slug === slug)) {
          setResolvedSlug(slug);
          return;
        }
        const lastVisited = safeJsonParse(
          localStorage.getItem(LAST_VISITED_WORKSPACE)
        );
        if (
          lastVisited?.slug &&
          list.some((w) => w.slug === lastVisited.slug)
        ) {
          setResolvedSlug(lastVisited.slug);
          return;
        }
        setResolvedSlug(list[0]?.slug ?? null);
      })
      .catch(() => {});
  }, [propSlug, slug]);

  const targetSlug = propSlug ?? resolvedSlug;
  if (!targetSlug) return null;

  const onClick = async () => {
    setLoading(true);
    const { thread, error } = await Workspace.threads.new(targetSlug);
    if (!!error || !thread) {
      showToast(
        `Could not create task - ${error || "unknown error"}`,
        "error",
        {
          clear: true,
        }
      );
      setLoading(false);
      return;
    }
    window.dispatchEvent(new CustomEvent(REFETCH_WORKSPACES_EVENT));
    navigate(paths.workspace.thread(targetSlug, thread.slug));
    setLoading(false);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-x-2.5 w-full h-[34px] px-2.5 rounded-[8px] text-[13px] leading-none text-white light:text-black hover:bg-theme-sidebar-subitem-hover transition-all duration-[200ms] border-none cursor-pointer disabled:opacity-60"
    >
      {loading ? (
        <CircleNotch
          size={16}
          weight="bold"
          className="shrink-0 animate-spin opacity-70"
        />
      ) : (
        <PlusCircle size={16} className="shrink-0 opacity-70" />
      )}
      <p className="whitespace-nowrap overflow-hidden">
        {loading ? t("sidebar.starting_thread") : t("sidebar.new-task")}
      </p>
    </button>
  );
}
