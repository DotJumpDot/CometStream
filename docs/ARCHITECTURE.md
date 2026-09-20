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
- `src/hooks/useTheme.js` — theme registry; pairs with CSS variable blocks in `src/index.css` ([THEMES.md](./THEMES.md)).
- `src/models/` — thin fetch wrappers over the API.
- `src/locales/` — i18next translations; `en/common.js` is the source of truth.

## Server — `server/`

The brain: REST API, agent runtime, persistence.

- **API**: `endpoints/*.js` each mount routes under `/api` (see `index.js` for the full mount list). Middleware: `validatedRequest` (session) + `flexUserRoleValid` (roles).
- **Persistence**: Prisma + SQLite (`prisma/schema.prisma`). Models in `models/`. Settings rows are whitelisted in `models/systemSettings.js` `supportedFields` — unknown labels are silently dropped.
- **Agent runtime**: `utils/agents/` wraps the AIbitat framework. `AgentHandler` (persisted workspace agents) and `EphemeralAgentHandler` (temporary flows) both resolve "loadable" function ids like `@@flow_<uuid>`, `@@mcp_<server>`, `@@skill_<folder>`, `@@<hubId>` into plugins in `#attachPluginByName`.
- **Plugins**: `utils/agents/aibitat/plugins/` — built-in skills (web-browsing, SQL, file ops…). Hub-imported plugins live under `storage/plugins/agent-skills`.
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
