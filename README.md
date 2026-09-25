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

- **Chat with anything** — workspaces, documents, embeddings, and all the LLM providers AnythingLLM supports (OpenAI, Anthropic, Ollama, LM Studio, Z AI, and many more). Local OpenAI-compatible servers (llama-server and friends) plug in through the Manage models UI — no ENV editing: base URL, context window, max tokens, and reasoning levels per model, picked per workspace with a reasoning toggle.
- **MCP client, manageable from the UI** — add and edit stdio/SSE/streamable-http MCP servers (Chrome DevTools, Playwright, Filesystem, Memory…) from Admin → Agents → MCP Servers, with one-click presets. No config-file editing required.
- **SKILL.md skills** — point CometStream at any folder of Claude/ZCode-style skills (a subfolder with a `SKILL.md`) and they become agent tools with progressive disclosure: the model sees the name/description, loads the full instructions on invoke, and reads support files on demand.
- **Folder-bound projects** — each workspace can pin to one folder on the machine (created if missing, picked from a click-through folder browser — or the real OS folder dialog in the desktop app — editable in workspace settings). The agent's terminal commands run inside that folder, the file tools treat it as home, and generated files (docx/pdf/xlsx…) are mirrored into it, so every project's chats stay separated by folder — ZCode-style. The binding is jailed to the terminal root and re-validated on every call; it can never escape. A project switcher in the composer jumps between projects (searchable) or back to a project-less home chat.
- **A real agent harness** — batched tool calls (the model can create 10 files in one reasoned turn, desktop-coding-agent style), a mandatory plan-first todo protocol (3+-step tasks open with a full todo list before any tool runs, updating per step in the panel's Plan tab), an opt-in terminal skill so agents can build, serve, and self-test with shell commands (jailed to a working root, timeout + output caps, host-wrecking command denylist; provably read-only commands auto-approve), background terminal tasks (`terminal-task-start`/`task-output`/`task-stop`) that run without blocking the turn, subagents via `delegate-task`, a per-response tool budget, malformed tool arguments repaired instead of executed, and prompts sent mid-run queue up and dispatch in order when the run settles.
- **Runs that survive reload** — reopening a thread restores the whole agent run: reasoning blocks, narration notes, file changes with diffs, terminal sessions, and plans, replayed in order above the reply — and the side panel's Plan/Changes/Sessions repopulate from the same replayed trace, so the panel matches the live run even after a reload. Failed runs save their failure instead of a blank turn, and empty threads stay out of the sidebar.
- **Agent-grade chat UX** — ZCode/Trae-style: live activity chains and run summaries, terminal rows with command-class chips (Search/Run/Install/Write/Fetch…) that expand inline — same-verb runs fold into "N similar runs" groups — file cards for shell-made changes plus live pending rows that tick up `+N` lines while a file write streams in, a left-edge jump rail that scrolls long threads turn-by-turn, and an agent side panel with Plan (the live todo list), Changes, Sessions (terminal + subagent output), Trajectory (per-turn model requests for debugging local models, repeated iterations folded into ranges), Sources, and a VSCode-style file reader. File names in replies render as chips that open that file in the reader, and API routes in prose render as method badges. Per-chat tool permission modes (ask / auto-approve) round it out, and the context-usage ring's popover gains a live-run section while the agent works: rounds with real ↑in/↓out tokens, prefix-cache hit %, last/avg/max tok/s (server-measured when the backend reports them), and a tool-traffic split by kind (terminal / files / MCP / subagent).
- **Context hygiene on long runs** — every chatty tool result (terminal output, MCP results, oversized scraped pages) is projected to a bounded inline window with the full text spilled to a file the model can page back in; MCP tool calls race a configurable timeout (default 120s) with one restart-and-retry on transport failures; and model-supplied fetch URLs pass an egress guard (no localhost/private/reserved targets).
- **Context compaction** — `/compact` on demand (live or on an idle thread — no run needed), or automatically when a thread nears the model's context window (per-workspace toggle + threshold in Chat Settings). Folded history collapses into an expandable summary divider at the line where the fold happened, and the live view and context ring update immediately.
- **Monokai themes** — Monokai Night and Monokai Dark Soda shipped alongside the default, light, and system themes (Settings → Customization).
- **Runs anywhere** — one Docker command, a fully self-contained portable Windows build, or plain Node.js.

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
