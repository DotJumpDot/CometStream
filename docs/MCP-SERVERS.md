# MCP servers

CometStream ships a full [Model Context Protocol](https://modelcontextprotocol.io) client. Any MCP server — local stdio processes or remote HTTP endpoints — can expose its tools to workspace agents.

## Managing servers (UI)

**Admin → Agents → MCP Servers → "Add MCP Server"**

The modal offers one-click presets:

| Preset | Command |
| --- | --- |
| Chrome DevTools | `npx -y chrome-devtools-mcp@latest` |
| Playwright | `npx -y @playwright/mcp@latest` |
| Filesystem | `npx -y @modelcontextprotocol/server-filesystem .` |
| Memory | `npx -y @modelcontextprotocol/server-memory` |

…or enter any custom server. Fields:

- **Name** — letters/numbers/dashes/underscores; locked when editing (delete + recreate to rename).
- **Transport** — `stdio` (command + args) or `sse` / `streamable` (url + optional headers).
- **Args** — a plain string; split quote-aware on save (`-y @playwright/mcp@latest --port 9000` works, so do quoted args).
- **Environment** — one `KEY=VALUE` per line.
- **Headers** (HTTP transports) — one `KEY: VALUE` per line.

Saving validates the definition, writes it to the config file, and starts the server immediately — its tools appear in the chat Tools menu as `<server>-<tool>` and can be toggled per chat. Editing an existing server keeps its per-server state (auto-start, suppressed tools).

> **Windows note:** stdio servers spawn via `npx` work out of the box (cross-spawn handles `.cmd` shims). Chrome DevTools MCP occasionally wedges after long sessions — restart it from the panel's gear menu.

## Managing servers (API)

All routes are admin-only, mounted under `/api`:

| Route | Body | Effect |
| --- | --- | --- |
| `GET /mcp-servers/list` | — | Servers + status |
| `POST /mcp-servers/create` | `{ name, server }` | Create + start (fails if name exists) |
| `POST /mcp-servers/update` | `{ name, server }` | Rewrite + restart (fails if missing) |
| `POST /mcp-servers/toggle` | `{ name, enabled }` | Start/stop a server |
| `POST /mcp-servers/restart` | `{ name }` | Restart a server |
| `POST /mcp-servers/delete` | `{ name }` | Remove from config + stop |

`server` accepts loose shapes (args as string, env/headers as line-separated text) — the hypervisor normalizes before validating (`server/utils/MCP/hypervisor/index.js` → `validateMCPServerDefinition`).

## Config file

Servers persist to `server/storage/plugins/anythingllm_mcp_servers.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": { "NODE_ENV": "production" }
    },
    "remote-example": {
      "url": "https://mcp.example.com/mcp",
      "type": "streamable",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

The per-server `anythingllm` block (auto-start, suppressed tools) is managed by the UI and survives edits:

```json
"playwright": { "command": "npx", "anythingllm": { "autoStart": true, "suppressedTools": ["browser_close"] } }
```

You can hand-edit this file while the app is stopped; it is read at boot.

## How it reaches agents

Running servers proxy their tools into the AIbitat agent as functions named `<server>-<tool>`. The hypervisor (`server/utils/MCP/`) is a **singleton** — `MCPCompatibilityLayer` returns a cached instance, so subclasses must not use `#private` methods (see AGENTS.md).

Every tool call is hardened so one misbehaving server cannot stall or bloat an agent run:

- **Per-call timeout** — each execution races a budget (ENV `AGENT_MCP_TOOL_TIMEOUT_MS` or the in-app `mcp_tool_timeout_ms` setting; default 120s, clamped 5s–600s). A timed-out call fails fast with a narrow-your-query message instead of being retried.
- **One restart + retry** — transport-level failures (`ECONNRESET`, `socket hang up`, closed server…) trigger a single server restart and a single retry before surfacing the error.
- **Result budget** — results are truncated to ~12k inline characters; the full text is spilled to `<storage>/anythingllm-fs/.tool-outputs/` with a pointer in the result, so the model can page the rest back in with the file tools instead of every verbose tool riding along on all subsequent turns.
