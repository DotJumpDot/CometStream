import React, { useRef, useState } from "react";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FolderOpen } from "@phosphor-icons/react";
import { REFETCH_WORKSPACES_EVENT } from "@/components/Sidebar/ActiveWorkspaces";
import Modal, {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalPrimaryButton,
  ModalInput,
} from "@/components/lib/Modal";
import FolderPicker from "./FolderPicker";

/**
 * Folder-first project creation (ZCode-style): the folder is the project.
 * The name is derived from the folder's basename as you type and can still
 * be overridden - you never have to invent a name before the folder exists.
 * The server creates the folder inside the terminal root and binds the
 * workspace to it, so the project's first chat is already separated by
 * folder. Threads then nest inside the project like ZCode tasks.
 */
function basenameOf(input = "") {
  const cleaned = String(input)
    .trim()
    .replace(/[/\\]+$/, "");
  if (!cleaned) return "";
  const parts = cleaned.split(/[/\\]+/);
  return parts[parts.length - 1] || "";
}

const noop = () => false;
export default function NewWorkspaceModal({ hideModal = noop }) {
  const navigate = useNavigate();
  const formEl = useRef(null);
  const [error, setError] = useState(null);
  const [folder, setFolder] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [picking, setPicking] = useState(false);
  const { t } = useTranslation();

  const handleFolderChange = (e) => {
    applyFolder(e.target.value);
  };

  const applyFolder = (value) => {
    setFolder(value);
    // Auto-label the project from the folder like a ZCode tab until the
    // user overrides the name by hand.
    if (!nameTouched) setName(basenameOf(value));
  };

  const handleCreate = async (e) => {
    setError(null);
    e.preventDefault();
    const trimmedFolder = folder.trim();
    if (!trimmedFolder) {
      setError(t("new-workspace.folder-required"));
      return;
    }
    const { workspace, message } = await Workspace.new({
      name: name.trim() || basenameOf(trimmedFolder),
      projectPath: trimmedFolder,
    });
    if (!!workspace) {
      // Refresh the sidebar list and navigate via the router so
      // ActiveGenerationGuard can intercept if a response is generating.
      // If the user cancels the navigation, the workspace still exists and
      // shows in the sidebar - so close this modal either way.
      window.dispatchEvent(new CustomEvent(REFETCH_WORKSPACES_EVENT));
      hideModal();
      navigate(paths.workspace.chat(workspace.slug));
      return;
    }
    setError(message);
  };

  return (
    <Modal isOpen={true} onClose={hideModal} size="md">
      <form
        ref={formEl}
        onSubmit={handleCreate}
        className="flex flex-col gap-y-5"
      >
        <ModalHeader title={t("new-workspace.title")} onClose={hideModal} />
        <ModalBody>
          <div className="flex flex-col gap-y-1.5 w-full">
            <ModalInput
              label={t("new-workspace.folder-label")}
              name="projectPath"
              type="text"
              id="projectPath"
              placeholder={t("new-workspace.folder-placeholder")}
              hint={t("new-workspace.folder-hint")}
              required={true}
              autoComplete="off"
              autoFocus={true}
              value={folder}
              onChange={handleFolderChange}
            />
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="border border-zinc-700 light:border-slate-300 cursor-pointer rounded-lg px-3 h-[34px] text-[13px] font-medium flex items-center justify-center gap-x-2 text-white light:text-slate-900 hover:bg-zinc-800 light:hover:bg-slate-100 self-start"
            >
              <FolderOpen size={15} />
              {t("new-workspace.browse")}
            </button>
          </div>
          <ModalInput
            label={t("common.workspaces-name")}
            name="name"
            type="text"
            id="name"
            placeholder={t("new-workspace.placeholder")}
            required={false}
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
          />
          {error && <p className="text-red-400 text-sm">Error: {error}</p>}
        </ModalBody>
        <ModalFooter className="justify-end">
          <ModalPrimaryButton type="submit">Save</ModalPrimaryButton>
        </ModalFooter>
      </form>
      {picking && (
        <FolderPicker
          initialRel={folder}
          onClose={() => setPicking(false)}
          onSelect={(rel) => {
            setPicking(false);
            if (rel) applyFolder(rel);
          }}
        />
      )}
    </Modal>
  );
}

export function useNewWorkspaceModal() {
  const [showing, setShowing] = useState(false);
  const showModal = () => {
    setShowing(true);
  };
  const hideModal = () => {
    setShowing(false);
  };

  return { showing, showModal, hideModal };
}
