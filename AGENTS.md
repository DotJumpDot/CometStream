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
- **MCP client**: `server/utils/MCP/` — hypervisor manages servers from `server/storage/plugins/anythingllm_mcp_servers.json`.
- **SKILL.md loader**: `server/utils/agents/skillFiles.js`.
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
