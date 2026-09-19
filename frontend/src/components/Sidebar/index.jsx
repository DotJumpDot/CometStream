import React, { useEffect, useRef, useState } from "react";
import { List, Plus, Plugs, PushPin } from "@phosphor-icons/react";
import NewWorkspaceModal, {
  useNewWorkspaceModal,
} from "../Modals/NewWorkspace";
import ActiveWorkspaces from "./ActiveWorkspaces";
import useLogo from "@/hooks/useLogo";
import useUser from "@/hooks/useUser";
import Footer from "../Footer";
import SettingsButton from "../SettingsButton";
import { Link } from "react-router-dom";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";
import { useSidebarToggle, ToggleSidebarButton } from "./SidebarToggle";
import SearchBox from "./SearchBox";
import { Tooltip } from "react-tooltip";
import { createPortal } from "react-dom";
import Workspace from "@/models/workspace";
import { relativeTime } from "@/utils/dates";
import { PINNED_THREADS_CHANGED_EVENT } from "@/utils/constants";

export const SIDEBAR_SEARCH_INPUT_ID = "sidebar-search-input";

export default function Sidebar() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { logo } = useLogo();
  const sidebarRef = useRef(null);
  const { showSidebar, setShowSidebar, canToggleSidebar } = useSidebarToggle();
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();

  // Ctrl+N opens a new workspace. (Ctrl+K is the command palette, which
  // listens for its own shortcut at the app root.)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        showNewWsModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showNewWsModal]);

  return (
    <>
      <div
        style={{
          width: showSidebar ? "292px" : "0px",
          paddingLeft: showSidebar ? "0px" : "16px",
        }}
        className="relative transition-all duration-500"
      >
        {canToggleSidebar && (
          <ToggleSidebarButton
            showSidebar={showSidebar}
            setShowSidebar={setShowSidebar}
          />
        )}
        <div className="overflow-hidden h-full">
          <div className="flex shrink-0 w-full justify-center my-[18px]">
            <div className="flex w-[250px] min-w-[250px]">
              <Link to={paths.home()} aria-label="Home">
                <img
                  src={logo}
                  alt="Logo"
                  className={`rounded max-h-[24px] object-contain transition-opacity duration-500 ${showSidebar ? "opacity-100" : "opacity-0"}`}
                />
              </Link>
            </div>
          </div>
          <div
            ref={sidebarRef}
            className="relative m-[16px] rounded-[16px] bg-theme-bg-sidebar light:bg-slate-200 border-[2px] border-theme-sidebar-border light:border-none min-w-[250px] p-[10px] h-[calc(100%-76px)]"
          >
            <div className="flex flex-col h-full overflow-hidden">
              <div className="flex-grow flex flex-col min-w-[235px] min-h-0">
                <div className="relative h-[calc(100%-60px)] flex flex-col w-full justify-between pt-[10px] overflow-y-scroll no-scroll">
                  <div className="flex flex-col gap-y-[14px]">
                    <SearchBox />
                    <SidebarQuickLinks
                      user={user}
                      showNewWsModal={showNewWsModal}
                    />
                    <PinnedThreads />
                    <div className="flex flex-col gap-y-[6px]">
                      <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-theme-text-secondary opacity-60 px-2">
                        {t("sidebar.projects")}
                      </p>
                      <ActiveWorkspaces />
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 pb-3 rounded-b-[16px] bg-theme-bg-sidebar light:bg-slate-200 bg-opacity-80 backdrop-filter backdrop-blur-md z-10">
                  <Footer />
                </div>
              </div>
            </div>
          </div>
        </div>
        {showingNewWsModal && <NewWorkspaceModal hideModal={hideNewWsModal} />}
      </div>
      <WorkspaceAndThreadTooltips />
    </>
  );
}

/**
 * Pinned threads across all workspaces (ZCode-style "Pinned" section).
 * Refetches whenever a thread is (un)pinned anywhere in the app.
 */
function PinnedThreads() {
  const { t } = useTranslation();
  const [threads, setThreads] = useState(null);

  useEffect(() => {
    const load = () =>
      Workspace.threads
        .pinned()
        .then(({ threads }) => setThreads(threads))
        .catch(() => setThreads([]));
    load();
    window.addEventListener(PINNED_THREADS_CHANGED_EVENT, load);
    return () => window.removeEventListener(PINNED_THREADS_CHANGED_EVENT, load);
  }, []);

  if (!threads || threads.length === 0) return null;

  const unpin = (thread) => {
    setThreads((prev) => prev.filter((t) => t.slug !== thread.slug));
    // Refetch notification fires after the persist, not before, so other
    // listeners never read stale pin state.
    Workspace.threads
      .setPinned(thread.workspace.slug, thread.slug, false)
      .finally(() =>
        window.dispatchEvent(new Event(PINNED_THREADS_CHANGED_EVENT))
      );
  };

  return (
    <div className="flex flex-col gap-y-[6px]">
      <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-theme-text-secondary opacity-60 px-2">
        {t("sidebar.pinned")}
      </p>
      <div className="flex flex-col gap-y-[2px]">
        {threads.map((thread) => (
          <div
            key={`${thread.workspace.slug}/${thread.slug}`}
            className="group/pinned flex items-center gap-x-2 h-[30px] px-2.5 rounded-[8px] text-[13px] leading-none hover:bg-theme-sidebar-subitem-hover transition-all duration-[200ms]"
          >
            <PushPin
              size={13}
              weight="fill"
              className="shrink-0 text-cta-button"
            />
            <Link
              to={paths.workspace.thread(thread.workspace.slug, thread.slug)}
              className="flex-1 min-w-0 flex items-baseline gap-x-1.5 overflow-hidden"
            >
              <span className="truncate text-white light:text-black">
                {thread.name}
              </span>
              <span className="shrink-0 text-[10px] text-theme-text-secondary opacity-70 truncate">
                {thread.workspace.name}
              </span>
            </Link>
            <span className="shrink-0 text-[10px] text-theme-text-secondary">
              {relativeTime(thread.lastUpdatedAt)}
            </span>
            <button
              type="button"
              onClick={() => unpin(thread)}
              aria-label={t("sidebar.unpin")}
              className="shrink-0 opacity-0 group-hover/pinned:opacity-100 transition-opacity duration-150 border-none cursor-pointer text-theme-text-secondary hover:text-red-400"
            >
              <PushPin size={12} weight="regular" className="rotate-45" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarQuickLinks({ user, showNewWsModal }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-y-[2px]">
      <button
        type="button"
        onClick={showNewWsModal}
        className="flex items-center gap-x-2.5 h-[34px] px-2.5 rounded-[8px] text-[13px] leading-none text-white light:text-black hover:bg-theme-sidebar-subitem-hover transition-all duration-[200ms] border-none cursor-pointer"
      >
        <Plus className="h-4 w-4 shrink-0 opacity-70" weight="bold" />
        <p className="whitespace-nowrap overflow-hidden">
          {t("sidebar.new-workspace")}
        </p>
      </button>
      {user?.role !== "default" && (
        <Link
          to={paths.settings.agentSkills()}
          className="flex items-center gap-x-2.5 h-[34px] px-2.5 rounded-[8px] text-[13px] leading-none text-white light:text-black hover:bg-theme-sidebar-subitem-hover transition-all duration-[200ms]"
        >
          <Plugs className="h-4 w-4 shrink-0 opacity-70" weight="regular" />
          <p className="whitespace-nowrap overflow-hidden">
            {t("sidebar.agents-mcp")}
          </p>
        </Link>
      )}
    </div>
  );
}

export function SidebarMobileHeader() {
  const { logo } = useLogo();
  const sidebarRef = useRef(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showBgOverlay, setShowBgOverlay] = useState(false);
  const {
    showing: showingNewWsModal,
    showModal: showNewWsModal,
    hideModal: hideNewWsModal,
  } = useNewWorkspaceModal();
  const { user } = useUser();

  useEffect(() => {
    // Darkens the rest of the screen
    // when sidebar is open.
    function handleBg() {
      if (showSidebar) {
        setTimeout(() => {
          setShowBgOverlay(true);
        }, 300);
      } else {
        setShowBgOverlay(false);
      }
    }
    handleBg();
  }, [showSidebar]);

  return (
    <>
      <div
        aria-label="Show sidebar"
        className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center px-4 py-2 bg-theme-bg-sidebar light:bg-white text-slate-200 shadow-lg h-16"
      >
        <button
          onClick={() => setShowSidebar(true)}
          className="rounded-md p-2 flex items-center justify-center text-theme-text-secondary"
        >
          <List className="h-6 w-6" />
        </button>
        <div className="flex items-center justify-center flex-grow">
          <img
            src={logo}
            alt="Logo"
            className="block mx-auto h-6 w-auto"
            style={{ maxHeight: "40px", objectFit: "contain" }}
          />
        </div>
        <div className="w-12"></div>
      </div>
      <div
        style={{
          transform: showSidebar ? `translateX(0vw)` : `translateX(-100vw)`,
        }}
        className={`z-99 fixed top-0 left-0 transition-all duration-500 w-[100vw] h-[100vh]`}
      >
        <div
          className={`${
            showBgOverlay
              ? "transition-all opacity-1"
              : "transition-none opacity-0"
          }  duration-500 fixed top-0 left-0 bg-theme-bg-secondary bg-opacity-75 w-screen h-screen`}
          onClick={() => setShowSidebar(false)}
        />
        <div
          ref={sidebarRef}
          className="relative h-[100vh] fixed top-0 left-0  rounded-r-[26px] bg-theme-bg-sidebar w-[80%] p-[18px] "
        >
          <div className="w-full h-full flex flex-col overflow-x-hidden items-between">
            {/* Header Information */}
            <div className="flex w-full items-center justify-between gap-x-4">
              <div className="flex shrink-1 w-fit items-center justify-start">
                <img
                  src={logo}
                  alt="Logo"
                  className="rounded w-full max-h-[40px]"
                  style={{ objectFit: "contain" }}
                />
              </div>
              {(!user || user?.role !== "default") && (
                <div className="flex gap-x-2 items-center text-slate-500 shink-0">
                  <SettingsButton />
                </div>
              )}
            </div>

            {/* Primary Body */}
            <div className="h-full flex flex-col w-full justify-between pt-4 ">
              <div className="h-auto md:sidebar-items">
                <div className=" flex flex-col gap-y-4 overflow-y-scroll no-scroll pb-[60px]">
                  <NewWorkspaceButton
                    user={user}
                    showNewWsModal={showNewWsModal}
                  />
                  <ActiveWorkspaces />
                </div>
              </div>
              <div className="z-99 absolute bottom-0 left-0 right-0 pt-2 pb-6 rounded-br-[26px] bg-theme-bg-sidebar bg-opacity-80 backdrop-filter backdrop-blur-md">
                <Footer />
              </div>
            </div>
          </div>
        </div>
        {showingNewWsModal && <NewWorkspaceModal hideModal={hideNewWsModal} />}
      </div>
    </>
  );
}

function NewWorkspaceButton({ user, showNewWsModal }) {
  const { t } = useTranslation();
  if (!!user && user?.role === "default") return null;

  return (
    <div className="flex gap-x-2 items-center justify-between">
      <button
        onClick={showNewWsModal}
        className="flex flex-grow w-[75%] h-[44px] gap-x-2 py-[5px] px-4 bg-white rounded-lg text-sidebar justify-center items-center hover:bg-opacity-80 transition-all duration-300"
      >
        <Plus className="h-5 w-5" />
        <p className="text-sidebar text-sm font-semibold">
          {t("new-workspace.title")}
        </p>
      </button>
    </div>
  );
}

function WorkspaceAndThreadTooltips() {
  return createPortal(
    <React.Fragment>
      <Tooltip
        id="workspace-name"
        place="right"
        delayShow={800}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="workspace-thread-name"
        place="right"
        delayShow={800}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="upload-workspace"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
      <Tooltip
        id="gear-workspace"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </React.Fragment>,
    document.body
  );
}
