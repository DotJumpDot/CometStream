import React, { useEffect, useRef, useState } from "react";
import paths from "@/utils/paths";
import useLogo from "@/hooks/useLogo";
import { List, House, Flask } from "@phosphor-icons/react";
import {
  Monitor,
  ImageSquare,
  ChatCircleDots,
  Brain,
  Stack,
  Database,
  Scissors,
  SpeakerHigh,
  Microphone,
  GitBranch,
  Robot,
  TrendUp,
  UserCircle,
  DownloadSimple,
  Users,
  SquaresFour,
  Chats,
  UserPlus,
  ChatText,
  Code,
  Scroll,
  Key,
  BracketsCurly,
  PuzzlePiece,
  Clock,
  PaperPlaneTilt,
  ShieldCheck,
} from "@phosphor-icons/react";
import useUser from "@/hooks/useUser";
import { isMobile } from "react-device-detect";
import Footer from "../Footer";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import showToast from "@/utils/toast";
import { isPathMatch } from "@/utils/paths";
import useScrollActiveItemIntoView from "@/hooks/useScrollActiveItemIntoView";
import { CanViewChatHistoryProvider } from "../CanViewChatHistory";
import useAppVersion from "@/hooks/useAppVersion";

/**
 * Flat, grouped navigation (Trae-style) for the settings area.
 * Each item keeps the upstream role/visibility contract:
 * - `roles` gates by user role (in multi-user mode)
 * - `flex` allows the item when no user exists (single-user mode)
 * - `hidden` unconditionally removes the item
 */
function NavItem({
  user,
  icon,
  text,
  href,
  flex = false,
  roles = [],
  hidden = false,
}) {
  const location = useLocation();
  const isActive = isPathMatch(href, location.pathname);
  const { ref } = useScrollActiveItemIntoView({
    isActive,
    behavior: "instant",
    block: "center",
  });

  if (hidden) return null;
  if (!flex && !roles.includes(user?.role)) return null;
  if (flex && !!user && !roles.includes(user?.role)) return null;

  return (
    <Link
      ref={ref}
      to={href}
      className={`
        flex items-center gap-x-2.5 h-[34px] px-3 mx-2 rounded-[8px]
        text-[13px] leading-none transition-all duration-[200ms]
        ${
          isActive
            ? "bg-theme-sidebar-item-selected font-semibold text-white light:text-black"
            : "text-white light:text-black hover:bg-theme-sidebar-subitem-hover"
        }
      `}
    >
      <span className={`shrink-0 ${isActive ? "opacity-100" : "opacity-60"}`}>
        {icon}
      </span>
      <p className="whitespace-nowrap overflow-hidden truncate">{text}</p>
    </Link>
  );
}

function NavGroup({ label, children }) {
  return (
    <div className="pt-[14px] first:pt-0">
      {label && (
        <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-theme-text-secondary opacity-60 px-5 pb-[6px]">
          {label}
        </p>
      )}
      <div className="flex flex-col gap-y-[2px]">{children}</div>
    </div>
  );
}

const SidebarOptions = ({ user = null, t }) => (
  <CanViewChatHistoryProvider>
    {({ viewable: canViewChatHistory }) => (
      <>
        <NavGroup label={t("settings.customization")}>
          <NavItem
            user={user}
            icon={<Monitor className="h-4 w-4" weight="regular" />}
            text={t("settings.interface")}
            href={paths.settings.interface()}
            flex={true}
            roles={["admin", "manager"]}
          />
          <NavItem
            user={user}
            icon={<ImageSquare className="h-4 w-4" weight="regular" />}
            text={t("settings.branding")}
            href={paths.settings.branding()}
            flex={true}
            roles={["admin", "manager"]}
          />
          <NavItem
            user={user}
            icon={<ChatCircleDots className="h-4 w-4" weight="regular" />}
            text={t("settings.chat")}
            href={paths.settings.chat()}
            flex={true}
            roles={["admin", "manager"]}
          />
        </NavGroup>

        <NavGroup label={t("settings.ai-providers")}>
          <NavItem
            user={user}
            icon={<Brain className="h-4 w-4" weight="regular" />}
            text={t("settings.llm")}
            href={paths.settings.llmPreference()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<Stack className="h-4 w-4" weight="regular" />}
            text={t("settings.embedder")}
            href={paths.settings.embedder.modelPreference()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<Database className="h-4 w-4" weight="regular" />}
            text={t("settings.vector-database")}
            href={paths.settings.vectorDatabase()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<Scissors className="h-4 w-4" weight="regular" />}
            text={t("settings.text-splitting")}
            href={paths.settings.embedder.chunkingPreference()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<ImageSquare className="h-4 w-4" weight="regular" />}
            text={t("settings.image-generation")}
            href={paths.settings.imageGenerationPreference()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<SpeakerHigh className="h-4 w-4" weight="regular" />}
            text={t("settings.voice-speech")}
            href={paths.settings.audioPreference()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<Microphone className="h-4 w-4" weight="regular" />}
            text={t("settings.transcription")}
            href={paths.settings.transcriptionPreference()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<GitBranch className="h-4 w-4" weight="regular" />}
            text={t("settings.model-router")}
            href={paths.settings.modelRouters()}
            flex={true}
            roles={["admin"]}
          />
        </NavGroup>

        <NavGroup label={t("settings.agent-skills")}>
          <NavItem
            user={user}
            icon={<Robot className="h-4 w-4" weight="regular" />}
            text={t("settings.agents-and-mcp")}
            href={paths.settings.agentSkills()}
            flex={true}
            roles={["admin"]}
          />
        </NavGroup>

        <NavGroup label={t("settings.tools")}>
          <NavItem
            user={user}
            icon={<Code className="h-4 w-4" weight="regular" />}
            text={t("settings.embeds")}
            href={paths.settings.embedChatWidgets()}
            flex={true}
            roles={["admin"]}
            hidden={!canViewChatHistory}
          />
          <NavItem
            user={user}
            icon={<Scroll className="h-4 w-4" weight="regular" />}
            text={t("settings.event-logs")}
            href={paths.settings.logs()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<Key className="h-4 w-4" weight="regular" />}
            text={t("settings.api-keys")}
            href={paths.settings.apiKeys()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<BracketsCurly className="h-4 w-4" weight="regular" />}
            text={t("settings.system-prompt-variables")}
            href={paths.settings.systemPromptVariables()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<PuzzlePiece className="h-4 w-4" weight="regular" />}
            text={t("settings.browser-extension")}
            href={paths.settings.browserExtension()}
            flex={true}
            roles={["admin", "manager"]}
          />
          <NavItem
            user={user}
            icon={<Clock className="h-4 w-4" weight="regular" />}
            text={t("settings.scheduled-jobs")}
            href={paths.settings.scheduledJobs()}
            flex={true}
            hidden={!!user}
          />
        </NavGroup>

        <NavGroup label={t("settings.admin")}>
          <NavItem
            user={user}
            icon={<Users className="h-4 w-4" weight="regular" />}
            text={t("settings.users")}
            href={paths.settings.users()}
            roles={["admin", "manager"]}
          />
          <NavItem
            user={user}
            icon={<SquaresFour className="h-4 w-4" weight="regular" />}
            text={t("settings.workspaces")}
            href={paths.settings.workspaces()}
            roles={["admin", "manager"]}
          />
          <NavItem
            user={user}
            icon={<Chats className="h-4 w-4" weight="regular" />}
            text={t("settings.workspace-chats")}
            href={paths.settings.chats()}
            flex={true}
            roles={["admin", "manager"]}
            hidden={!canViewChatHistory}
          />
          <NavItem
            user={user}
            icon={<UserPlus className="h-4 w-4" weight="regular" />}
            text={t("settings.invites")}
            href={paths.settings.invites()}
            roles={["admin", "manager"]}
          />
          <NavItem
            user={user}
            icon={<ChatText className="h-4 w-4" weight="regular" />}
            text={t("settings.default-system-prompt")}
            href={paths.settings.defaultSystemPrompt()}
            flex={true}
            roles={["admin"]}
          />
        </NavGroup>

        <NavGroup label={t("settings.community-hub.title")}>
          <NavItem
            user={user}
            icon={<TrendUp className="h-4 w-4" weight="regular" />}
            text={t("settings.community-hub.trending")}
            href={paths.communityHub.trending()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<UserCircle className="h-4 w-4" weight="regular" />}
            text={t("settings.community-hub.your-account")}
            href={paths.communityHub.authentication()}
            flex={true}
            roles={["admin"]}
          />
          <NavItem
            user={user}
            icon={<DownloadSimple className="h-4 w-4" weight="regular" />}
            text={t("settings.community-hub.import-item")}
            href={paths.communityHub.importItem()}
            flex={true}
            roles={["admin"]}
          />
        </NavGroup>

        <NavGroup label={t("settings.channels")}>
          <NavItem
            user={user}
            icon={<PaperPlaneTilt className="h-4 w-4" weight="regular" />}
            text={t("settings.available-channels.telegram")}
            href={paths.settings.telegram()}
            flex={true}
            hidden={!!user}
          />
        </NavGroup>

        <NavGroup>
          <NavItem
            user={user}
            icon={<ShieldCheck className="h-4 w-4" weight="regular" />}
            text={t("settings.security")}
            href={paths.settings.security()}
            flex={true}
            roles={["admin", "manager"]}
            hidden={user?.role}
          />
          <HoldToReveal key="exp_features">
            <NavItem
              user={user}
              icon={<Flask className="h-4 w-4" weight="regular" />}
              text={t("settings.experimental-features")}
              href={paths.settings.experimental()}
              flex={true}
              roles={["admin"]}
            />
          </HoldToReveal>
        </NavGroup>
      </>
    )}
  </CanViewChatHistoryProvider>
);

export default function SettingsSidebar() {
  const { t } = useTranslation();
  const { logo } = useLogo();
  const { user } = useUser();
  const sidebarRef = useRef(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showBgOverlay, setShowBgOverlay] = useState(false);

  useEffect(() => {
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

  if (isMobile) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-10 flex justify-between items-center px-4 py-2 bg-theme-bg-sidebar light:bg-white text-theme-text-secondary shadow-lg h-16">
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
            className="h-[100vh] fixed top-0 left-0 rounded-r-[26px] bg-theme-bg-sidebar w-[80%] p-[18px]"
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
                <div className="flex gap-x-2 items-center text-slate-500 shrink-0">
                  <a
                    href={paths.home()}
                    className="transition-all duration-300 p-2 rounded-full text-white bg-theme-action-menu-bg hover:bg-theme-action-menu-item-hover hover:border-slate-100 hover:border-opacity-50 border-transparent border"
                  >
                    <House className="h-4 w-4" />
                  </a>
                </div>
              </div>

              {/* Primary Body */}
              <div className="h-full flex flex-col w-full justify-between pt-4 overflow-y-scroll no-scroll">
                <div className="h-auto md:sidebar-items">
                  <div className="flex flex-col gap-y-4 pb-[60px] overflow-y-scroll no-scroll">
                    <SidebarOptions user={user} t={t} />
                    <div className="h-[1.5px] bg-[#3D4147] mx-3 mt-[14px]" />
                    <AppVersion />
                  </div>
                </div>
              </div>
              <div className="absolute bottom-2 left-0 right-0 pt-2 bg-theme-bg-sidebar bg-opacity-80 backdrop-filter backdrop-blur-md">
                <Footer />
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div>
        <Link
          to={paths.home()}
          className="flex shrink-0 items-center justify-start mx-[20.5px] my-[18px]"
        >
          <img
            src={logo}
            alt="Logo"
            className="rounded max-h-[24px]"
            style={{ objectFit: "contain" }}
          />
        </Link>
        <div
          ref={sidebarRef}
          className="transition-all duration-500 relative m-[16px] rounded-[16px] bg-theme-bg-sidebar border-[2px] border-theme-sidebar-border light:border-none min-w-[250px] p-[10px] h-[calc(100%-76px)]"
        >
          <div className="w-full h-full flex flex-col overflow-x-hidden items-between min-w-[235px]">
            <div className="text-theme-text-secondary text-sm font-medium uppercase mt-[4px] mb-0 ml-2">
              {t("settings.title")}
            </div>
            <div className="relative h-[calc(100%-60px)] flex flex-col w-full justify-between pt-[10px] overflow-y-scroll no-scroll">
              <div className="h-auto sidebar-items">
                <div className="flex flex-col gap-y-2 pb-[60px] overflow-y-scroll no-scroll">
                  <SidebarOptions user={user} t={t} />
                  <div className="h-[1.5px] bg-[#3D4147] mx-3 mt-[14px]" />
                  <AppVersion />
                </div>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 pt-4 pb-3 rounded-b-[16px] bg-theme-bg-sidebar bg-opacity-80 backdrop-filter backdrop-blur-md z-10">
              <Footer />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function HoldToReveal({ children, holdForMs = 3_000 }) {
  let timeout = null;
  const [showing, setShowing] = useState(
    window.localStorage.getItem(
      "anythingllm_experimental_feature_preview_unlocked"
    )
  );

  useEffect(() => {
    const onPress = (e) => {
      if (!["Control", "Meta"].includes(e.key) || timeout !== null) return;
      timeout = setTimeout(() => {
        setShowing(true);
        // Setting toastId prevents hook spam from holding control too many times or the event not detaching
        showToast("Experimental feature previews unlocked!");
        window.localStorage.setItem(
          "anythingllm_experimental_feature_preview_unlocked",
          "enabled"
        );
        window.removeEventListener("keypress", onPress);
        window.removeEventListener("keyup", onRelease);
        clearTimeout(timeout);
      }, holdForMs);
    };
    const onRelease = (e) => {
      if (!["Control", "Meta"].includes(e.key)) return;
      if (showing) {
        window.removeEventListener("keypress", onPress);
        window.removeEventListener("keyup", onRelease);
        clearTimeout(timeout);
        return;
      }
      clearTimeout(timeout);
    };

    if (!showing) {
      window.addEventListener("keydown", onPress);
      window.addEventListener("keyup", onRelease);
    }
    return () => {
      window.removeEventListener("keydown", onPress);
      window.removeEventListener("keyup", onRelease);
    };
  }, []);

  if (!showing) return null;
  return children;
}

function AppVersion() {
  const { version, isLoading } = useAppVersion();
  if (isLoading) return null;
  return (
    <div className="text-theme-text-secondary light:opacity-80 opacity-50 text-xs mx-3">
      v{version}
    </div>
  );
}
