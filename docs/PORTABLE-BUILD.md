# Portable Windows build

The portable build is a **fully self-contained** CometStream: bundled Node.js runtime, pre-compiled UI, production dependencies, and a pre-migrated database — one folder (or zip) that runs on any Windows 10/11 x64 machine with nothing installed. Move the folder and your data moves with it.

## What's in the bundle

```
CometStream/
├── Start-CometStream.bat        ← double-click to run
├── Stop-CometStream.bat         ← stops both processes
├── Install-Scrape-Browser.bat   ← optional: Chromium for website scraping (~300 MB)
├── README-PORTABLE.txt
├── runtime/
│   └── node.exe                 ← the entire Node.js runtime (matched to build machine)
├── server/                      ← app + node_modules (prod) + public/ (compiled UI) + storage/ (your data)
└── collector/                   ← document processor + node_modules (prod)
```

First boot walks through the normal onboarding (admin account, LLM provider). All data lives in `server/storage` inside the folder — back up the folder, back up the instance.

## Building one

Run from a working repo checkout on Windows. Roughly 15–20 minutes, mostly dependency installs.

### 1. Stage a clean copy

Copy `server/` and `collector/` to a staging folder, excluding `node_modules`, `storage`, `public`, `.env*`, and `hotdir`. Keep the git-tracked storage scaffolds — the collector expects them:

- `server/storage/`: `assets/`, `documents/`, `models/`, `README.md`
- `collector/hotdir/__HOTDIR__.md`, `collector/storage/tmp/.placeholder`

### 2. Build the frontend into it

```bash
cd frontend
MSYS_NO_PATHCONV=1 VITE_API_BASE=/api yarn build
cp -R dist <staging>/server/public
```

⚠️ `MSYS_NO_PATHCONV=1` matters in Git Bash: without it `/api` is rewritten to `C:/Program Files/Git/api` and every API call 404s. Verify with `grep -o 'VITE_API_BASE:"[^"]*"' server/public/assets/index-*.js`.

### 3. Install production dependencies

```bash
cd <staging>/server    && yarn install --production
cd <staging>/collector && PUPPETEER_SKIP_DOWNLOAD=1 yarn install --production
```

`prisma` is a production dependency (the launcher needs its CLI for migrations). Puppeteer's Chromium is skipped to keep the bundle small — `Install-Scrape-Browser.bat` restores it into `runtime/chrome` when wanted.

### 4. Bundle the Node runtime

Download the **exact same Node version** used to install the native modules (`node --version`), extract `node.exe` from the win-x64 zip into `<staging>/runtime/`. Version-matching avoids native-module ABI surprises (lancedb, sharp, onnxruntime).

### 5. Prepare the shipped database

```bash
cd <staging>/server
runtime/node.exe node_modules/prisma/build/index.js migrate deploy --schema=./prisma/schema.prisma
```

Then (optionally) seed branding so the app presents as CometStream out of the box — upsert into `system_settings`: `meta_page_title` = "CometStream | Your personal AI workspace", `custom_app_name` = "CometStream`. The title is cached at server boot, so it only shows after a (real) restart — pre-seeding the DB is what makes it right on first boot.

**Do not ship** anything the app generates per-install: `server/.env` (contains an absolute `STORAGE_DIR` and generated `SIG_KEY`/`SIG_SALT`) or `server/storage/comkey/`. They regenerate on first boot; shipping them leaks your keys to every copy.

### 6. Add launchers + zip

- `Start-CometStream.bat` — sets `NODE_ENV=production`, `STORAGE_DIR` (absolute, recomputed from `%~dp0` each start so the folder stays movable), runs `prisma generate` + `migrate deploy`, starts collector and server minimized, polls port 3001, then opens the browser.
- `Stop-CometStream.bat` — kills node processes whose command line references the bundle folder. Match with a **substring** (`-like '*<root>*'`): command lines created via `start` begin with a quote, so prefix matches silently fail.
- Zip with Windows bsdtar (GNU tar in Git Bash cannot write zip): `C:/Windows/System32/tar.exe -a -c -f CometStream-portable-win64.zip CometStream`

## Operational notes

- **Ports**: 3001 (app, `SERVER_PORT`) and 8888 (collector, `COLLECTOR_PORT`). Windows Firewall may prompt on first boot.
- **Data**: everything under `server/storage`; the launcher recreates it if deleted.
- **The launcher re-runs migrations on every start** (a no-op when current), mirroring the Docker entrypoint.
- **Keep the folder path free of `%`** — batch-file limitation.
