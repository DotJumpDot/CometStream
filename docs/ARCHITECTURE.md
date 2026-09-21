# Architecture

CometStream is three Node processes plus a database. This page maps the territory so you know where to change things.

```
┌──────────────┐  /api (HTTP)   ┌──────────────┐   HTTP (localhost:8888)  ┌──────────────┐
│   frontend   │ ─────────────▶ │    server    │ ───────────────────────▶ │   collector  │
│  React/Vite  │                │Node/Express  │                          │ Node/Express │
└──────────────┘                └──────┬───────┘                          └──────────────┘
                                       │ Prisma
                                       ▼
                              SQLite (server/storage/anythingllm.db)
```

## Frontend — `frontend/`

React 18 + Vite + Tailwind. Not a separate app in production: `yarn build` compiles it into `server/public`, and the server serves it statically (with SSR-injected `<head>` meta from `MetaGenerator`). Dev mode runs Vite on :3000 proxying to :3001.

Notable areas:

- `src/pages/` — route-level screens (admin, settings, workspace chat).
- `src/components/` — shared components; `WorkspaceChat/` holds the chat UI and the agent-tools menu.
- `src/components/WorkspaceChat/ChatContainer/` — the live chat. `ChatHistory/index.jsx` compiles the stream into the activity chain; `StatusResponse` renders each chain; `HistoricalMessage/HistoricalTrace` replays a persisted run on reload; `MessageQueue/` holds follow-up prompts sent while a run is in flight (dispatched in order when it settles). Run-rendering rules:
  - A settled chain that is one bare tool call with no reasoning hides entirely (live and reload) — the file card after it is the signal.
  - Reads emit per-file read rows (`fileChangeCard` action `read`), not in-thought statuses. Files a shell command creates or edits are snapshotted before/after and reported as `create`/`edit` cards with real diffs.
  - Terminal/subagent sessions render as chat rows too (`SessionCard`, updated in place as `running` flips to done, colored Search/Run/Install/Write/Fetch chip, inline expand to full command + output). The side panel mirrors the same events at panel scale.
  - The agent narrates between tool batches (one lead-in/result sentence per batch); tool-iteration text persists as `agentNote` trace events and renders as reply-styled prose on reload.
  - Reload regroups thought/status runs through the same `StatusResponse`, so a reopened thread reads like the working view.
  - Thread switches keep the old chat mounted until the new history arrives, then swap; the side panel keeps its open state instead of slamming shut. Failed runs fill the pre-registered prompt row with the failure; the thread list hides chat-less threads.
- `src/components/WorkspaceChat/AgentSidePanel/` — the agent side panel: Changes (aggregated file diffs), Plan (todo stepper), Sessions (terminal + subagent rows with expandable output), Sources, and the file reader.
- `src/utils/chat/` — agent websocket event handling (`agent.js`: cards/statuses/history updates, permission-mode store in `chat/permissions.js`) and `agentActivity.js` (session-scoped stores mirroring panel feeds).
- `src/hooks/useTheme.js` — theme registry; pairs with CSS variable blocks in `src/index.css` ([THEMES.md](./THEMES.md)).
- `src/models/` — thin fetch wrappers over the API.
- `src/locales/` — i18next translations; `en/common.js` is the source of truth.

## Server — `server/`

The brain: REST API, agent runtime, persistence.

- **API**: `endpoints/*.js` each mount routes under `/api` (see `index.js` for the full mount list). Middleware: `validatedRequest` (session) + `flexUserRoleValid` (roles).
- **Persistence**: Prisma + SQLite (`prisma/schema.prisma`). Models in `models/`. Settings rows are whitelisted in `models/systemSettings.js` `supportedFields` — unknown labels are silently dropped.
- **Agent runtime**: `utils/agents/` wraps the AIbitat framework. `AgentHandler` (persisted workspace agents) and `EphemeralAgentHandler` (temporary flows) both resolve "loadable" function ids like `@@flow_<uuid>`, `@@mcp_<server>`, `@@skill_<folder>`, `@@<hubId>` into plugins in `#attachPluginByName`.
- **Plugins**: `utils/agents/aibitat/plugins/` — built-in skills (web-browsing, SQL, file ops…). Hub-imported plugins live under `storage/plugins/agent-skills`.
- **Terminal skill**: `utils/agents/aibitat/plugins/terminal.js` — opt-in shell execution for agents, jailed to a working root, with a hard timeout, capped output, and the normal per-tool approval flow. Enable it either with `AGENT_ENABLE_TERMINAL=1` (+ optional `AGENT_TERMINAL_ROOT`) or fully in-app via the `terminal_agent_enabled` / `terminal_agent_root` system settings (no ENV edit needed; ENV wins when set). The skill only loads when listed in `default_agent_skills`. Off unless the operator enables it.
- **Agent tool budget**: per-response tool-call cap, `AGENT_MAX_TOOL_CALLS` ENV or the in-app `agent_max_tool_calls` setting (default 10, hard cap 200). Long multi-step runs need this raised or the agent is cut off mid-task.
- **Batched (parallel) tool calls**: when a model requests several tools in one turn (`tool_calls[]`), every call executes sequentially in request order before the next completion — one reasoning block covers N file creates, like desktop coding agents. `tooled.js` returns the full batch as `functionCalls` (`functionCall` stays the first call for older providers); each executed call counts against the tool budget, per-tool approvals still gate each call, and abort stops mid-batch.
- **Tool approval mode**: the chat-bar pill (`ask` / `auto` / `auto-remember`, persisted in localStorage) is pushed over the agent socket on open and on change (`endpoints/agentWebsocket.js` + `plugins/websocket.js`). The relay attaches synchronously and stashes early frames — `ws` drops messages received before any `message` listener exists, which used to silently lose the session-start push and force ask-every-time on auto-approve sessions.
- **Subagents**: `utils/agents/aibitat/plugins/delegate.js` (`delegate-task` skill) fans a bounded task out to a child agent (same provider/model, terminal + file read/write + todo tools, 15 tool calls, wall-clock timeout, max depth 1). Enable via `default_agent_skills`; no ENV needed.
- **Session registry**: `utils/agents/aibitat/plugins/sessions.js` tracks terminal executions + subagent runs in-memory (capped) and mirrors them to the frontend via `sessionCard` socket events, rendered in the AgentSidePanel Sessions tab.
- **Run trace persistence**: `utils/agents/aibitat/plugins/trace.js` records the persistable slice of the live stream (per-iteration `<think>` blocks via the execution loop, statuses/cards/plans/sessions via a raw-socket wrapper in the websocket plugin) into `response.trace` at turn-save time; thoughts are stripped from the saved reply so they don't render twice. `convertToChatHistory` passes `trace` through and `HistoricalTrace` renders it chronologically above the reply, so reopening a thread restores the run. Caps: 200 events, 2k status/session-detail chars, 8k per thought.
- **Context compaction**: `utils/agents/contextCompaction.js` — summarizes older thread history into a single `type: "compact"` chat row when it nears the model's context window. Triggered manually via `/compact` (intercepted in the agent websocket like `/img`) or automatically at session start and between turns, per-workspace (`workspaces.autoCompact` / `compactThreshold`, editable in Chat Settings). Compacted rows are flipped to `include: false`; the summary row leads the loaded history.
- **MCP client**: `utils/MCP/` — hypervisor spawns stdio processes or dials SSE/streamable-http endpoints and proxies their tools into agents ([MCP-SERVERS.md](./MCP-SERVERS.md)).
- **SKILL.md loader**: `utils/agents/skillFiles.js` ([SKILL-FILES.md](./SKILL-FILES.md)).
- **Storage layout** (`storage/`): `anythingllm.db`, `documents/` (workspace docs), `lancedb/` (vectors), `plugins/` (MCP config, imported skills), `assets/` (logo), `models/` (downloaded LLM metadata).

⚠️ `MCPCompatibilityLayer` is a singleton: its parent constructor returns a cached instance, so the subclass must not define `#private` methods (they'd be installed twice on the same object).

## Collector — `collector/`

A standalone Express service that does the CPU-heavy document work: parsing (PDF/DOCX/XLSX/epub…), OCR (tesseract), audio conversion, and website scraping (puppeteer). The server POSTs documents to it via `utils/collectorApi`; results flow back into the server's embedding pipeline. It shares `server/storage` with the server (both need `STORAGE_DIR` in production).

## Boot sequence (server)

1. `index.js` loads env, boots Express, mounts middleware + `/api` routes.
2. Storage folders are ensured under `STORAGE_DIR` (production) or `server/storage` (dev).
3. MetaGenerator builds the SSR `<head>` (page title/favicon read from settings **once at boot**).
4. Databases/migrations: the Docker entrypoint (and the portable launcher) run `prisma generate` + `prisma migrate deploy` before `node index.js`.
5. Background jobs (Bree scheduler, document sync queues, telemetry) start last.

## Configuration

- Env files per package (`.env`), rewritten by the app when settings change in the UI (`utils/helpers/updateENV.js`). Process env always wins over `.env` (dotenv does not override).
- Runtime settings live in the `system_settings` table, surfaced via the admin UI.

Related docs: [MCP-SERVERS.md](./MCP-SERVERS.md) · [SKILL-FILES.md](./SKILL-FILES.md) · [PORTABLE-BUILD.md](./PORTABLE-BUILD.md)
