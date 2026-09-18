import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MCPServers from "@/models/mcpServers";
import showToast from "@/utils/toast";
import Modal, {
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalPrimaryButton,
  ModalSecondaryButton,
  ModalInput,
  ModalTextarea,
  ModalLabel,
  ModalHint,
} from "@/components/lib/Modal";

const PRESETS = [
  {
    label: "Chrome DevTools",
    name: "chrome-devtools",
    command: "npx",
    args: "-y chrome-devtools-mcp@latest",
  },
  {
    label: "Playwright",
    name: "playwright",
    command: "npx",
    args: "-y @playwright/mcp@latest",
  },
  {
    label: "Filesystem",
    name: "filesystem",
    command: "npx",
    args: "-y @modelcontextprotocol/server-filesystem .",
  },
  {
    label: "Memory",
    name: "memory",
    command: "npx",
    args: "-y @modelcontextprotocol/server-memory",
  },
];

/**
 * Modal to create or edit an MCP server entry in the config file.
 * Pass `server` (a list entry: {name, config}) to edit, or omit it to create.
 * The server normalizes loose shapes - args as a string, env as KEY=VALUE lines,
 * headers as "KEY: VALUE" lines - so the form sends plain strings.
 * @param {object} props
 * @param {{name: string, config: object}|null} [props.server] - Existing server to edit
 * @param {function} props.onSaved - Called after a successful save (parent refreshes)
 * @param {function} props.onClose - Closes the modal
 */
export default function AddServerModal({ server = null, onSaved, onClose }) {
  const { t } = useTranslation();
  const isEdit = !!server;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const existing = server?.config || {};
  const existingTransport = existing.url
    ? existing.type === "streamable" || existing.type === "http"
      ? "streamable"
      : "sse"
    : "stdio";

  const [name, setName] = useState(server?.name || "");
  const [transport, setTransport] = useState(existingTransport);
  const [command, setCommand] = useState(existing.command || "");
  const [args, setArgs] = useState(
    Array.isArray(existing.args) ? existing.args.join(" ") : existing.args || ""
  );
  const [env, setEnv] = useState(
    existing.env && typeof existing.env === "object"
      ? Object.entries(existing.env)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n")
      : existing.env || ""
  );
  const [url, setUrl] = useState(existing.url || "");
  const [headers, setHeaders] = useState(
    existing.headers && typeof existing.headers === "object"
      ? Object.entries(existing.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n")
      : existing.headers || ""
  );

  const isStdio = transport === "stdio";
  const valid = useMemo(() => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) return false;
    return isStdio ? !!command.trim() : !!url.trim();
  }, [name, isStdio, command, url]);

  function applyPreset(preset) {
    setName(preset.name);
    setTransport("stdio");
    setCommand(preset.command);
    setArgs(preset.args);
    setError(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!valid || saving) return;

    const definition = isStdio
      ? { command: command.trim(), args: args.trim(), env: env.trim() }
      : { url: url.trim(), type: transport, headers: headers.trim() };

    setSaving(true);
    setError(null);
    const result = isEdit
      ? await MCPServers.updateServer(server.name, definition)
      : await MCPServers.createServer(name.trim(), definition);

    if (!result.success) {
      setError(result.error || t("agent.mcp.save-failed"));
      setSaving(false);
      return;
    }

    showToast(
      isEdit
        ? t("agent.mcp.update-success", { name })
        : t("agent.mcp.create-success", { name }),
      "success",
      { clear: true }
    );
    setSaving(false);
    onSaved?.();
  }

  return (
    <Modal isOpen={true} onClose={onClose} size="md">
      <form onSubmit={handleSave} className="flex flex-col gap-y-4">
        <ModalHeader
          title={
            isEdit ? t("agent.mcp.edit-server") : t("agent.mcp.add-server")
          }
          subtitle={t("agent.mcp.add-server-subtitle")}
          onClose={onClose}
        />
        <ModalBody>
          {!isEdit && (
            <>
              <ModalLabel>{t("agent.mcp.presets")}</ModalLabel>
              <div className="flex flex-wrap gap-2 -mt-1 mb-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="border border-zinc-700 light:border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-50 light:text-slate-700 hover:bg-zinc-800 light:hover:bg-slate-100 transition-colors duration-200"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col gap-y-4">
            <ModalInput
              label={t("agent.mcp.server-name")}
              name="name"
              type="text"
              placeholder="my-mcp-server"
              required={true}
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEdit}
            />
            {isEdit && (
              <ModalHint>{t("agent.mcp.name-locked-when-editing")}</ModalHint>
            )}

            <div className="flex flex-col gap-y-1.5">
              <ModalLabel>{t("agent.mcp.transport-type")}</ModalLabel>
              <div className="flex gap-2">
                {["stdio", "sse", "streamable"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTransport(type)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 ${
                      transport === type
                        ? "bg-zinc-50 light:bg-slate-900 text-zinc-950 light:text-white"
                        : "border border-zinc-700 light:border-slate-600 text-slate-50 light:text-slate-700 hover:bg-zinc-800 light:hover:bg-slate-100"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {isStdio ? (
              <>
                <ModalInput
                  label={t("agent.mcp.command")}
                  name="command"
                  type="text"
                  placeholder="npx"
                  required={true}
                  autoComplete="off"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
                <ModalTextarea
                  label={t("agent.mcp.arguments")}
                  name="args"
                  rows={2}
                  placeholder="-y chrome-devtools-mcp@latest"
                  hint={t("agent.mcp.args-hint")}
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
                <ModalTextarea
                  label={t("agent.mcp.env-vars")}
                  name="env"
                  rows={2}
                  optional={true}
                  placeholder={"API_KEY=abc123\nDEBUG=true"}
                  value={env}
                  onChange={(e) => setEnv(e.target.value)}
                />
              </>
            ) : (
              <>
                <ModalInput
                  label={t("agent.mcp.server-url")}
                  name="url"
                  type="text"
                  placeholder="http://localhost:3000/mcp"
                  required={true}
                  autoComplete="off"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <ModalTextarea
                  label={t("agent.mcp.headers")}
                  name="headers"
                  rows={2}
                  optional={true}
                  placeholder="Authorization: Bearer token"
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                />
              </>
            )}
          </div>

          {error && <p className="text-red-400 text-sm break-words">{error}</p>}
        </ModalBody>
        <ModalFooter className="justify-end">
          <ModalSecondaryButton type="button" onClick={onClose}>
            {t("agent.mcp.cancel")}
          </ModalSecondaryButton>
          <ModalPrimaryButton type="submit" disabled={!valid || saving}>
            {saving
              ? t("common.saving")
              : isEdit
                ? t("agent.mcp.save-changes")
                : t("agent.mcp.create-server")}
          </ModalPrimaryButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
