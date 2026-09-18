<a name="readme-top"></a>

<p align="center">
  <h1 align="center">☄️ CometStream</h1>
  <p align="center"><b>Your agents, your docs, your style.</b><br />
  An all-in-one local AI workspace: chat with your documents, run agents with MCP tools and skills, and make the app truly yours.</p>
</p>

<p align="center">
  <a href="./LICENSE">MIT License</a> ·
  <a href="./docs">Docs</a> ·
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

---

**CometStream** is a fork of [AnythingLLM](https://github.com/Mintplex-Labs/anythingllm) by Mintplex Labs, reshaped into a personal, style-first agentic workspace. The goal of the fork is simple: the closed-source agent apps we love (Trae, ZCode) can't be customized — CometStream can be. Every surface of the UI, every agent capability, every theme is yours to change.

## What's inside

- **Chat with anything** — workspaces, documents, embeddings, and all the LLM providers AnythingLLM supports (OpenAI, Anthropic, Ollama, LM Studio, Z AI, and many more).
- **MCP client, manageable from the UI** — add and edit stdio/SSE/streamable-http MCP servers (Chrome DevTools, Playwright, Filesystem, Memory…) from Admin → Agents → MCP Servers, with one-click presets. No config-file editing required.
- **SKILL.md skills** — point CometStream at any folder of Claude/ZCode-style skills (a subfolder with a `SKILL.md`) and they become agent tools with progressive disclosure: the model sees the name/description, loads the full instructions on invoke, and reads support files on demand.
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
locales/    README translations from upstream
extras/     Translation tooling
```

## Credits & license

CometStream is a fork of [AnythingLLM](https://github.com/Mintplex-Labs/anythingllm) — huge thanks to Mintplex Labs and its contributors for the outstanding base this project builds on.

MIT — see [LICENSE](./LICENSE).
