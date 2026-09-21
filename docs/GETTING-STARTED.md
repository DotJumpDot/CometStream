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

Terminal commands also refuse a denylist of host-wrecking commands (shutdown, format, diskpart, `dd` to raw devices, fork bombs, recursive deletes of OS roots, …) and ride the normal per-tool approval flow.

## Troubleshooting

- **`yarn setup` fails on `prisma migrate`** — delete `server/storage/anythingllm.db` and rerun `yarn prisma:setup`.
- **Port already in use** — `SERVER_PORT` (server) and `COLLECTOR_PORT` (collector) env vars change them; update `frontend/.env`'s `VITE_API_BASE` if the server moves.
- **Collector crashed with "files is not iterable"** — fixed in this fork; if you see it, `collector/hotdir` or `collector/storage/tmp` handling was regressed. See AGENTS.md.
- **Windows/Git Bash** — export `MSYS_NO_PATHCONV=1` when running commands with `/flags` so MSYS doesn't rewrite them as paths.

Next: [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit together.
