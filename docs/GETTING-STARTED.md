# Getting started (development)

Everything you need to run and develop CometStream on your own machine.

## Requirements

- **Node.js 18+** (the repo is developed on Node 24)
- **Yarn 1.x** (`npm i -g yarn`)
- ~2 GB free disk (dependencies are heavy — vector DB and ML natives)

## First-time setup

```bash
git clone https://github.com/DotJumpDot/CometStream.git
cd CometStream
yarn setup
```

`yarn setup` does four things:

1. Installs dependencies for `server/`, `collector/`, and `frontend/`.
2. Copies `.env.example` → `.env` variants for each package.
3. Generates the Prisma client and applies migrations to `server/storage/anythingllm.db` (SQLite — no external DB needed).
4. Seeds the database.

## Daily development

```bash
yarn dev
```

Starts three processes with hot reload:

| Process | Port | What it is |
| --- | --- | --- |
| Frontend (Vite) | http://localhost:3000 | React dev server; proxies API calls to the server |
| Server (Express) | http://localhost:3001 | API + agent runtime + Prisma |
| Collector | http://localhost:8888 | Document parsing/OCR/scraping service |

Open http://localhost:3000 and create your admin account on first boot.

Individual processes when you only need one:

```bash
yarn dev:server
yarn dev:frontend
yarn dev:collector
```

## Common tasks

```bash
yarn lint                  # eslint --fix across server, frontend, collector
yarn test                  # jest tests (server/__tests__)
yarn prisma:setup          # regenerate client + migrate + seed from scratch
yarn prisma:reset          # wipe the dev DB and re-migrate
yarn translations:verify   # check locale key parity
```

## Where your data lives

All dev data (database, documents, vector caches, plugin configs like `anythingllm_mcp_servers.json`) lives under `server/storage/` — that folder is your instance. Delete it to start fresh.

## Agent harness settings

All optional; every one of these can also be set in-app (Admin settings) instead of via env, and env wins when both are set.

| Env var | In-app setting | What it does |
| --- | --- | --- |
| `AGENT_ENABLE_TERMINAL=1` | `terminal_agent_enabled` | Turns on the agent terminal skill (off by default). |
| `AGENT_TERMINAL_ROOT=<path>` | `terminal_agent_root` | Working directory every terminal command runs in (defaults to the agent filesystem sandbox). |
| `AGENT_TERMINAL_TIMEOUT_MS` | — | Per-command wall-clock limit (default 120000, clamped 5s–600s). |
| `AGENT_TERMINAL_SHELL` | — | Shell override (defaults to Git Bash on Windows, `/bin/bash` elsewhere). |
| `AGENT_MAX_TOOL_CALLS` | `agent_max_tool_calls` | Tool-call budget per agent response (default 10, hard cap 200) — raise it for long multi-step runs. |
| `AGENT_MCP_TOOL_TIMEOUT_MS` | `mcp_tool_timeout_ms` | Per-call timeout for MCP tool executions (default 120000, clamped 5s–600s). A hung MCP server can no longer wedge the agent turn. |

Terminal commands also refuse a denylist of host-wrecking commands (shutdown, format, diskpart, `dd` to raw devices, fork bombs, recursive deletes of OS roots, …) and ride the normal per-tool approval flow — except provably read-only commands (`ls`, `git status`, `cat`…), which auto-approve since they cannot mutate anything. Enabling the terminal skill also enables the background task tools (`terminal-task-start` / `task-output` / `task-stop`) so long builds and dev servers can run without blocking the turn.

Long tool results (terminal output, MCP results) are truncated to a bounded inline window; the full text is spilled to a file (24h retention) with a pointer in the result, so the model can read more on demand without bloating every subsequent turn.

## Using a local model (no ENV edits)

Any OpenAI-compatible server works as a chat model, configured entirely in the UI. With `llama-server` serving a model on `http://127.0.0.1:8080`:

1. **Add the provider** — open the model pill in the chat bar → Manage models → new provider: a name (e.g. `Apodex Local`), the base URL (e.g. `http://127.0.0.1:8080/v1`), optional API key. The "fetch from API" button lists the served model ids for you.
2. **Add the model** — the served model id (e.g. `Apodex-35B`), a display name, context window (e.g. `262144`), and max output tokens. Thinking models want a large max-output budget or reasoning eats the whole reply. Leave reasoning levels empty for a simple on/off toggle.
3. **Pick it per workspace** — the model pill pins provider + model to the workspace. The Reasoning toggle sends `reasoning_effort: "none"` when Off; anything else leaves the template default (thinking on).
4. **Give the agent tools** — Admin → Agents → skills: enable `terminal-agent`, `filesystem-agent`, `create-files-agent`, `delegate-task` (in `default_agent_skills`), set `terminal_agent_root` to the project folder, and raise `agent_max_tool_calls` for long runs.

## Troubleshooting

- **`yarn setup` fails on `prisma migrate`** — delete `server/storage/anythingllm.db` and rerun `yarn prisma:setup`.
- **Port already in use** — `SERVER_PORT` (server) and `COLLECTOR_PORT` (collector) env vars change them; update `frontend/.env`'s `VITE_API_BASE` if the server moves.
- **Collector crashed with "files is not iterable"** — fixed in this fork; if you see it, `collector/hotdir` or `collector/storage/tmp` handling was regressed. See AGENTS.md.
- **Windows/Git Bash** — export `MSYS_NO_PATHCONV=1` when running commands with `/flags` so MSYS doesn't rewrite them as paths.

Next: [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit together.
