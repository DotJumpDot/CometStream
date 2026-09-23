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
  - The agent narrates between tool batches (mandatory 1-2 sentence visible notes per tool-calling turn: what it is about to do, then what happened including errors/surprises - never an empty tool turn); tool-iteration text persists as `agentNote` trace events and renders as reply-styled prose on reload. A soft suggestion measurably yields one lead-in at best, hence the per-turn MUST protocol in `defaults.js`.
  - Reload regroups thought/status runs through the same `StatusResponse`, so a reopened thread reads like the working view.
  - Thread switches keep the old chat mounted until the new history arrives, then swap; the side panel keeps its open state instead of slamming shut. Failed runs fill the pre-registered prompt row with the failure; the thread list hides chat-less threads.
- `src/components/WorkspaceChat/AgentSidePanel/` — the agent side panel: Changes (aggregated file diffs), Plan (todo stepper), Sessions (terminal + subagent rows with expandable output, consecutive same-command runs folded into "N similar runs" groups), Trajectory (per-LLM-iteration debug records, session-only, consecutive same-model/same-tool iterations folded into "#a–#b" range groups with a show-all expander past 25), Sources, and the file reader. Chat trace rows (thoughts, tool calls, sessions, file cards) render full message-column width, not the old 640px cap. Session labels cap at 60% (`shortCommand` strips `cd`/narration preambles, middle-truncates); durations sit snug after the cut in pink, and file +N/−N counts sit snug after the filename.
- `src/components/Sidebar/ActiveWorkspaces/` — the project list: compact folder rows (path tooltips) per workspace, folder-first creation via `Modals/NewWorkspace.jsx` + `Modals/FolderPicker.jsx` (click-to-select browser over `GET /workspace/folders/browse`), and the per-project folder editor in `pages/WorkspaceSettings/GeneralAppearance/ProjectFolder/`.
- `src/utils/chat/` — agent websocket event handling (`agent.js`: cards/statuses/history updates, permission-mode store in `chat/permissions.js`) and `agentActivity.js` (session-scoped stores mirroring panel feeds). Markdown rendering (`markdown.js` `enhanceProse`/`accentCodeRemainder` + `.md-*` in `src/index.css`): prose breathing room for lists/paragraphs, per-verb method colors (pill in prose, flat in code chips), semantic code-chip colors (commands green, paths orange, values lemon), violet links/bare URLs, pink non-italic quotes — applied in both live and reload render paths.
- `src/hooks/useTheme.js` — theme registry; pairs with CSS variable blocks in `src/index.css` ([THEMES.md](./THEMES.md)).
- `src/models/` — thin fetch wrappers over the API.
- `src/locales/` — i18next translations; `en/common.js` is the source of truth.

## Server — `server/`

The brain: REST API, agent runtime, persistence.

- **API**: `endpoints/*.js` each mount routes under `/api` (see `index.js` for the full mount list). Middleware: `validatedRequest` (session) + `flexUserRoleValid` (roles).
- **Persistence**: Prisma + SQLite (`prisma/schema.prisma`). Models in `models/`. Settings rows are whitelisted in `models/systemSettings.js` `supportedFields` — unknown labels are silently dropped.
- **Agent runtime**: `utils/agents/` wraps the AIbitat framework. `AgentHandler` (persisted workspace agents) and `EphemeralAgentHandler` (temporary flows) both resolve "loadable" function ids like `@@flow_<uuid>`, `@@mcp_<server>`, `@@skill_<folder>`, `@@<hubId>` into plugins in `#attachPluginByName`.
- **Plugins**: `utils/agents/aibitat/plugins/` — built-in skills (web-browsing, SQL, file ops…). Hub-imported plugins live under `storage/plugins/agent-skills`.
- **Terminal skill**: `utils/agents/aibitat/plugins/terminal.js` — opt-in shell execution for agents, jailed to a working root, with a hard timeout, capped output, and the normal per-tool approval flow. Folder-bound projects (`workspaces.projectPath`, nullable): when the chat's workspace is bound, foreground and background commands run inside that folder via `workdirForInvocation` (stored path re-validated against the jail on every call, degrades to the global root on escape; unbound legacy workspaces use the root directly). File tools (`filesystem/*` via per-call `validatePath` extras + `allowedDirsFor`, relative paths resolve project-first) share the same jail, so read/write/edit/copy/move/search all work where the terminal works. Generated documents (`create-files/*`: md/json/txt/pdf/docx/xlsx/pptx) additionally mirror into the project folder under their display name (`mirrorToProjectDir`/`projectCopyNote`, best-effort - the download card stays primary). Path rules live in `utils/projectPath.js` (`isSafeSegment` per-segment checks + `resolved.startsWith(root + sep)` jail, shared by the `/workspace/new` endpoint which mkdirs the folder at creation, the `GET /workspace/folders/browse` picker endpoint which lists jail subfolders, and `listProjectFolders`). Two performance rules keep long runs cheap: provably read-only commands (`isReadOnlyCommand`: inspection binaries, read-only git subcommands, no redirects/heredocs/substitution) skip the approval prompt even in ask mode — the denylist + jail still apply at execution; and truncated stdout/stderr is spilled to `<root>/.terminal-outputs/` (snapshot-ignored, 24h retention) with a pointer in the result, so the model sees an 8k/4k inline window and pages in more only when needed. Inline budgets live in `plugins/result-budget.js` (`projectText`/`spillText`), shared by MCP results too. Session row chips come from `categorizeCommand` (14 classes: Search/Run/Install/Write/Fetch/Kill/Sleep/Git/Test/Files/Cat/List/Pwd/Bash, first match wins, chipless fallback); the chat mirrors it client-side (`categorizeLabel` in `utils/agentActivity.js`) so pre-change persisted rows render chips too — keep both tables in sync.
- **Background tasks**: same file — `terminal-task-start` runs a command without blocking the turn (spawned shell, ring-buffered output, same denylist/timeout), `task-output` polls status + tail, `task-stop` SIGKILLs and finalizes synchronously (never waits on `close`, which forked grandchildren can hold open via inherited stdio). Registry is in-memory but snapshotted to `storage/terminal-tasks.json` on every mutation, so a server restart degrades to last-known (stale-flagged) state instead of "unknown task"; capped at 20 entries. Registered under their own names but loaded as terminal-agent companions (`TERMINAL_COMPANION_TOOLS` in `defaults.js` expands both the session function list and toggle resolution). Session rows reuse `sessionCard`, so no frontend change was needed.
- **MCP hardening**: `utils/MCP/index.js` — every tool call races `mcp_tool_timeout_ms` (ENV `AGENT_MCP_TOOL_TIMEOUT_MS` wins, default 120s, clamped 5s–600s); transport failures trigger one server restart + one retry, timeouts fail fast with a narrow-your-query message (never retried blind); results project to 12k inline chars with full text spilled to the agent sandbox `.tool-outputs/`.
- **Agent tool budget**: per-response tool-call cap, `AGENT_MAX_TOOL_CALLS` ENV or the in-app `agent_max_tool_calls` setting (default 10, hard cap 1000). Long multi-step runs need this raised or the agent is cut off mid-task.
- **Batched (parallel) tool calls**: when a model requests several tools in one turn (`tool_calls[]`), every call executes sequentially in request order before the next completion — one reasoning block covers N file creates, like desktop coding agents. `tooled.js` returns the full batch as `functionCalls` (`functionCall` stays the first call for older providers); each executed call counts against the tool budget, per-tool approvals still gate each call, and abort stops mid-batch. Malformed streamed arguments are flagged (`argsParseError`), never coerced to `{}`.
- **Argument repair loop**: `utils/agents/aibitat/utils/toolArgRepair.js` — both execution loops validate every call before its handler runs (unparseable JSON, missing/invalid required fields). Failures become a repair turn naming exactly what was wrong plus the schema, bounded at 2 per turn before the call is skipped. Extra keys are ignored so repairs stay rare.
- **Model trajectory**: `utils/agents/aibitat/plugins/trajectory.js` — one bounded record per LLM iteration (message deltas, requested tools with arg previews, usage) streamed as `trajectoryEvent` to the panel Trajectory tab. Session-only and in-memory; the persisted run trace keeps thoughts/cards instead.
- **Egress guard**: `utils/agents/aibitat/plugins/egress.js` — model-supplied fetch URLs (web scraping) must be http/https with public-literal IPs (localhost/`*.localhost`, private/link-local/reserved blocked; `127.0.0.1`/`0.0.0.0` carved out for local-dev self-tests, mirroring the collector). No DNS preflight by design.
- **Scrape budget**: `web-scraping.js` returns pages verbatim only under 25k tokens (and the model window); larger pages take the existing summarize path instead of riding every subsequent turn.
- **Tool approval mode**: the chat-bar pill (`ask` / `auto` / `auto-remember`, persisted in localStorage) is pushed over the agent socket on open and on change (`endpoints/agentWebsocket.js` + `plugins/websocket.js`). The relay attaches synchronously and stashes early frames — `ws` drops messages received before any `message` listener exists, which used to silently lose the session-start push and force ask-every-time on auto-approve sessions.
- **Subagents**: `utils/agents/aibitat/plugins/delegate.js` (`delegate-task` skill) fans a bounded task out to a child agent (same provider/model, terminal + file read/write + todo tools, 15 tool calls, wall-clock timeout, max depth 1). Enable via `default_agent_skills`; no ENV needed.
- **Plan-first + todo-write**: `utils/agents/aibitat/plugins/agent-todo.js` (`todo-write` skill, always in the function list via the toolReranker exemption) replaces the whole checklist per call and emits `todoListCard` to the panel Plan tab (and persisted `TracePlan` rows in the run trace). The role suffix in `utils/agents/defaults.js` mandates it as the FIRST tool call for any 3+-step task (1-2 step tasks exempt) with per-step updates — a soft rule in the tool description alone was measured to yield no plan on long runs.
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
