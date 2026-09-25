<a name="readme-top"></a>

<p align="center">
  <h1 align="center">☄️ CometStream</h1>
  <p align="center"><b>Your agents, your docs, your style.</b><br />
  An all-in-one local AI workspace: chat with your documents, run agents with MCP tools and skills, and make the app truly yours.</p>
</p>

<p align="center">
  <a href="./LICENSE">MIT License</a> ·
  <a href="./docs">Docs</a>
</p>

---

**CometStream** is a fork of [AnythingLLM](https://github.com/Mintplex-Labs/anythingllm) by Mintplex Labs, reshaped into a personal, style-first agentic workspace. The goal of the fork is simple: the closed-source agent apps we love (Trae, ZCode) can't be customized — CometStream can be. Every surface of the UI, every agent capability, every theme is yours to change.

## What's inside

Everything the AnythingLLM base offers — workspaces, documents, embeddings, multi-user, API — is still here. Below is what the fork adds and reshapes, grouped by theme.

### Models & providers

- **Every provider AnythingLLM supports** — OpenAI, Anthropic, Ollama, LM Studio, Z AI, and many more, picked per workspace.
- **Local OpenAI-compatible servers** (llama-server and friends) plug in through the Manage models UI — no ENV editing:
  - base URL, context window, max tokens, and reasoning levels per model
  - per-workspace choice, with a reasoning toggle

### Agent tools & skills

- **MCP client, manageable from the UI** — add and edit stdio / SSE / streamable-http servers from Admin → Agents → MCP Servers:
  - one-click presets: Chrome DevTools, Playwright, Filesystem, Memory…
  - no config-file editing required
- **SKILL.md skills** — any folder of Claude/ZCode-style skills (a subfolder with a `SKILL.md`) becomes agent tools, with progressive disclosure:
  - the model sees only the name/description up front
  - full instructions load on invoke
  - support files are read on demand

### Folder-bound projects

- **Each workspace pins to one folder on the machine** — ZCode-style:
  - folder created if missing; picked via a click-through browser or the real OS dialog in the desktop app, editable in workspace settings
  - terminal commands run inside it, file tools treat it as home, generated files (docx/pdf/xlsx…) mirror into it
  - jailed to the terminal root and re-validated on every call — it can never escape
  - a composer project switcher jumps between projects (searchable) or back to a project-less home chat

### The agent harness

- **Batched tool calls** — the model creates 10 files in one reasoned turn, desktop-coding-agent style.
- **Plan-first protocol** — 3+-step tasks open with a full todo list before any tool runs, updating per step in the panel's Plan tab.
- **Plan mode (design before code)** — big or unclear tasks (5+ steps, or the approach itself needs deciding) enter a read-only planning phase first:
  - exploration only: reads, search, web, read-only terminal — writes, mutations, subagents, and external actions are blocked
  - the design doc lands in the chat as a card you Approve or Reject; approval seeds the execution checklist and starts the build
  - plans auto-approve by default (toggle in Agent Skill Settings) so long runs don't park waiting on a click
- **Opt-in terminal skill** — agents build, serve, and self-test with shell commands:
  - jailed to a working root, with timeout + output caps
  - host-wrecking command denylist, whole-disk scans refused
  - provably read-only commands auto-approve
- **Background tasks** — `terminal-task-start` / `task-output` / `task-stop` run builds and dev servers without blocking the turn.
- **Subagents** — `delegate-task` fans work out to child agents.
- **Robust execution** — per-response tool budget; malformed tool arguments get repaired instead of executed; prompts sent mid-run queue up and dispatch in order when the run settles.
- **Runs survive reload** — reopening a thread replays the whole run (reasoning blocks, narration, file diffs, terminal sessions, plans) above the reply, and the side panel repopulates from the same trace. Failed runs save their failure instead of a blank turn; empty threads stay out of the sidebar.

### Chat experience (ZCode/Trae-style)

- **Live activity** — activity chains and end-of-run summaries, with:
  - terminal rows with command-class chips (Search/Run/Install/Write/Fetch…) that expand inline; same-verb runs fold into "N similar runs" groups
  - file cards for shell-made changes, plus pending rows that tick up `+N` lines while a write streams in
  - a left-edge jump rail that scrolls long threads turn-by-turn
- **Agent side panel** — Plan (the live todo list), Changes, Sessions (terminal + subagent output), Trajectory (per-turn model requests for debugging local models, repeats folded into ranges), Sources, and a VSCode-style file reader.
- **Rich replies** — file names render as chips that open the file in the reader; API routes in prose render as method badges.
- **Tool permission modes** — ask every time or auto-approve, per chat.
- **Live usage telemetry** — the context ring's popover, while the agent works:
  - rounds with real ↑in/↓out tokens and prefix-cache hit %
  - last/avg/max tok/s (server-measured when the backend reports them)
  - tool traffic split by kind: terminal / files / MCP / subagent

### Context care on long runs

- **Bounded tool output** — terminal output, MCP results, and oversized scraped pages project to a bounded inline window; the full text spills to a file the model can page back in.
- **MCP timeouts** — every tool call races a configurable timeout (default 120s); transport failures get one restart-and-retry.
- **Egress guard** — model-supplied fetch URLs must be public targets (localhost/private/reserved refused).
- **Context compaction** — `/compact` on demand (live or on an idle thread), or automatic near the model's context window:
  - per-workspace toggle + threshold in Chat Settings
  - folded history collapses into an expandable summary divider at the line where the fold happened
  - the live view and context ring update immediately

### Make it yours

- **Monokai themes** — Monokai Night and Monokai Dark Soda alongside the default, light, and system themes (Settings → Customization).
- **Runs anywhere** — one Docker command, a self-contained portable Windows build, or plain Node.js.

## Quickstart

### Docker (fastest)

```bash
cd docker
cp .env.example .env
docker compose up -d
```

App: `http://localhost:3001`.

### Portable Windows desktop app (no install, no Node needed)

A self-contained zip — desktop app window, bundled runtime, pre-built UI, pre-migrated database — that runs from any folder. Double-click `CometStream.exe` and you're in a native-style app window. See [docs/PORTABLE-BUILD.md](./docs/PORTABLE-BUILD.md) to build one yourself.

### Development

```bash
git clone https://github.com/DotJumpDot/CometStream.git
cd CometStream
yarn setup        # installs server+collector+frontend, prepares env files & DB
yarn dev          # server (3001) + frontend (3000) + collector (8888)
```

Requirements: Node 18+, Yarn 1.x. Full walkthrough in [docs/GETTING-STARTED.md](./docs/GETTING-STARTED.md).

## Documentation

| Doc | What it covers |
| --- | --- |
| [Getting started](./docs/GETTING-STARTED.md) | Dev environment setup, daily commands, project layout |
| [Architecture](./docs/ARCHITECTURE.md) | How frontend, server, and collector fit together |
| [MCP servers](./docs/MCP-SERVERS.md) | Managing MCP servers (UI + API), config file format |
| [Skill files](./docs/SKILL-FILES.md) | The SKILL.md loader: format, discovery, security model |
| [Themes](./docs/THEMES.md) | How theming works and how to add a new theme |
| [Desktop app](./docs/DESKTOP-APP.md) | The Electron shell: architecture, dev mode, building |
| [Portable build](./docs/PORTABLE-BUILD.md) | Building the self-contained Windows bundle |

## Repo layout

```
frontend/   React + Vite + Tailwind UI
server/     Node/Express API, agents, Prisma (SQLite), MCP client
collector/  Document processing service (parsing, OCR, scraping)
desktop/    Electron desktop shell (packaged into the portable build)
docker/     Docker image & compose files
docs/       Project documentation
extras/     Translation tooling (yarn translations:*)
```

## Credits & license

CometStream is a fork of [AnythingLLM](https://github.com/Mintplex-Labs/anythingllm) — huge thanks to Mintplex Labs and its contributors for the outstanding base this project builds on.

MIT — see [LICENSE](./LICENSE).
