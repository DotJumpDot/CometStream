# AGENTS.md

Working guide for AI coding agents (and humans in a hurry) contributing to CometStream.

## What this is

CometStream is a fork of AnythingLLM (Mintplex Labs, MIT) being reshaped into a personal, customizable agentic workspace. Base behavior comes from upstream; the fork's job is customization — UI, themes, agent tooling (MCP, skills), packaging. When changing things, prefer small extensions over rewrites so future upstream merges stay cheap.

## Project layout

| Path | Role |
| --- | --- |
| `frontend/` | React + Vite + Tailwind SPA. Talks to the server at `VITE_API_BASE` (`/api` in prod, `http://localhost:3001/api` in dev). |
| `server/` | Node/Express API + agent runtime (AIbitat). Prisma + SQLite in `server/storage`. Serves the built SPA from `server/public` in production. |
| `collector/` | Separate Node service (port 8888) that parses/OCR/scrapes documents. The server talks to it over HTTP (`server/utils/collectorApi`). |
| `docker/` | Image + compose files. The entrypoint runs `prisma generate` + `migrate deploy` then boots server and collector. |
| `docs/` | Project docs — update the relevant page when you change behavior documented there. |

Key internals:
- **Agents**: `server/utils/agents/` — `aibitat` plugins register functions via `setup(aibitat)`. Loadable ids: plain name, `parent#child`, `@@flow_<uuid>`, `@@mcp_<server>`, `@@skill_<folder>`, `@@<hubId>` (imported).
- **Batched tool calls**: `providers/helpers/tooled.js` returns every tool call of one LLM turn as `functionCalls` (with `functionCall` = first for older callers); the execution loop in `aibitat/index.js` runs the whole batch sequentially. Do not "simplify" this back to first-call-only — local models emit 3+ calls per turn and rely on it.
- **Argument repair**: both execution loops validate every call via `aibitat/utils/toolArgRepair.js` before the handler runs — unparseable/missing-field arguments become a repair turn (capped 2/turn), never execute with coerced `{}`. `tooled.js` flags unparseable streamed args as `argsParseError` instead of silently defaulting.
- **Result budgets**: `aibitat/plugins/result-budget.js` (`projectText` head+tail + `spillText` to a retention-swept file) is the shared truncation policy for terminal output and MCP results — keep new chatty tools on it.
- **MCP client**: `server/utils/MCP/` — hypervisor manages servers from `server/storage/plugins/anythingllm_mcp_servers.json`. Every tool call races `AGENT_MCP_TOOL_TIMEOUT_MS` / `mcp_tool_timeout_ms` (default 120s); transport errors get one restart+retry, timeouts do not.
- **SKILL.md loader**: `server/utils/agents/skillFiles.js`.
- **Terminal skill**: `aibitat/plugins/terminal.js` — opt-in (`AGENT_ENABLE_TERMINAL` or the `terminal_agent_enabled` setting); the handler re-checks availability on every call, keep that defense-in-depth. Read-only commands (`isReadOnlyCommand`) skip only the approval prompt — denylist + jail always apply. Background task tools (`TERMINAL_COMPANION_TOOLS` in `defaults.js`) ride the same opt-in and must be expanded wherever `terminal-agent` is toggled.
- **Egress guard**: `aibitat/plugins/egress.js` — model-supplied fetch URLs (web scraping) must be http/https on public targets; wired before the collector round-trip.
- **Sessions + trace**: `aibitat/plugins/sessions.js` (in-memory terminal/subagent registry → `sessionCard` events → Agent panel Sessions tab) and `aibitat/plugins/trace.js` (persists the run into `response.trace`). The trace's raw-socket wrapper is the single capture point — new card types must be added to its `RECORDED_TYPES` allowlist or they won't survive reload. `trajectoryEvent` (per-iteration debug records, `aibitat/plugins/trajectory.js` → panel Trajectory tab) is deliberately session-only — do not add it to the trace.
- **Themes**: CSS variable blocks in `frontend/src/index.css`, registry in `frontend/src/hooks/useTheme.js`.

## Dev commands

```bash
yarn setup       # first time: install all three packages + env files + DB
yarn dev         # server :3001, frontend :3000, collector :8888 (concurrently)
yarn lint        # eslint --fix on server, frontend, collector
yarn test        # jest (root config runs server/__tests__)
```

Frontend and server hot-reload in dev; collector restarts via nodemon.

## Conventions

- **Node**: CommonJS on the server (`require`), ESM in the frontend. JSDoc everything added on the server side — the codebase is consistently documented.
- **Frontend**: `@/` alias for `src/`. All user-facing strings go through i18next (`frontend/src/locales/*/common.js`); add keys to `en` first, other locales fall back. Run `yarn translations:verify` after adding keys.
- **Tests**: jest tests live in `server/__tests__/` mirroring `server/` paths. Add tests for new server logic.
- **Prisma**: never edit `schema.prisma` without a migration (`npx prisma migrate dev --name <change>` from `server/`).
- **Comments**: state constraints and why, not what. Security-relevant guards must keep their explanatory comment.

## Gotchas learned the hard way

- **`MCPCompatibilityLayer` singleton**: the parent constructor returns a cached instance. Subclass `#private` methods get installed twice on the same object → `TypeError`. Use plain methods on that class.
- **`SystemSettings.supportedFields`** silently filters unknown labels — a new setting that "won't persist" is usually missing from that whitelist (`server/models/systemSettings.js`).
- **Production requires `STORAGE_DIR`** as an absolute env var for *both* server and collector (they share `server/storage`). Dev mode falls back to repo-relative paths.
- **The SSR page title/meta** is built once at server boot (`server/utils/boot/MetaGenerator.js`), not per request — restart to see branding changes.
- **Windows/Git Bash**: `MSYS_NO_PATHCONV=1` for anything with `/flags` (robocopy) or `/like` values (`VITE_API_BASE=/api`); use forward slashes in JSON payloads with Windows paths.
- **dotenv does not override** existing process env — launchers can always force a value via environment.
- **Local OpenAI-compat LLMs** (llama-server & friends) close idle keep-alive sockets; the openai SDK's node-fetch then rides a dead socket on the tool-call round trip → `ECONNRESET "socket hang up"` kills the agent turn mid-run. `providers/helpers/localFetch.js` swaps in no-keep-alive agents for local/private base URLs — route any new provider's `fetch` through `fetchForBaseURL(baseUrl)`.

## Security rules (non-negotiable)

- Any path built from user/tool input must validate each segment (no `/`, `\`, `..`, NUL; `path.basename(seg) === seg`) AND check `resolved.startsWith(root + path.sep)` after resolve. See `isSafeSegment` in `server/utils/agents/skillFiles.js` for the pattern.
- Server-side URL requests: only http/https; validate the host before the request and reject localhost, loopback, private, and reserved addresses.
- The collector wipe-on-boot (`collector/utils/files/index.js`) must `return resolve()` on readdir errors — falling through iterates `undefined` and crashes the process.
- New endpoints: mount behind `validatedRequest` + role middleware (`flexUserRoleValid([ROLES.admin])` for admin routes).

## Definition of done

1. `yarn lint` clean (or auto-fixed) in the touched package.
2. `yarn test` passes; new logic has tests.
3. Docs under `docs/` updated if behavior changed.
4. i18n keys exist in `en` at minimum.
