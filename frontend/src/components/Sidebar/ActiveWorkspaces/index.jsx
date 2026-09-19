import React, { useState, useEffect } from "react";
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
  DotsSixVertical,
  Folder,
  FolderOpen,
  CaretDown,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import ThreadContainer from "./ThreadContainer";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import showToast from "@/utils/toast";
import { LAST_VISITED_WORKSPACE } from "@/utils/constants";
import { safeJsonParse } from "@/utils/request";

export const REFETCH_WORKSPACES_EVENT = "refetchWorkspaces";

export default function ActiveWorkspaces() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWs, setSelectedWs] = useState(null);
  const { showing, showModal, hideModal } = useManageWorkspaceModal();
  const { user } = useUser();
  const isInWorkspaceSettings = !!useMatch("/workspace/:slug/settings/:tab");
  const isHomePage = !!useMatch("/");

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

  return (
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
                      <Link
                        to={paths.workspace.chat(workspace.slug)}
                        aria-current={isActive ? "page" : ""}
                        className={`
                          flex items-center gap-x-2 w-full h-[34px] px-2.5 rounded-[8px]
                          text-[13px] leading-none transition-all duration-[200ms]
                          ${
                            isActive
                              ? "bg-theme-sidebar-item-selected light:bg-blue-200 font-semibold text-white light:text-blue-900"
                              : "text-white light:text-black hover:bg-theme-sidebar-subitem-hover"
                          }
                        `}
                      >
                        <div
                          {...provided.dragHandleProps}
                          className="cursor-grab opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150"
                          aria-label="Drag to reorder workspace"
                        >
                          <DotsSixVertical
                            size={14}
                            weight="bold"
                            className="text-theme-text-secondary"
                          />
                        </div>
                        {isActive ? (
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
                        <p
                          data-tooltip-id="workspace-name"
                          data-tooltip-content={workspace.name}
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
                            isActive
                              ? "rotate-0 opacity-80"
                              : "-rotate-90 opacity-0 group-hover:opacity-40"
                          }`}
                          aria-hidden="true"
                        />
                      </Link>
                      {isActive && (
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
  );
}
