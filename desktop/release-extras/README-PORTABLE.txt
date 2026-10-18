CometStream - Portable Windows build
====================================

A fully self-contained build of CometStream. No Node.js, no installer,
no build steps needed on the target machine - just unpack and run.

Requirements
------------
- Windows 10/11 x64
- Nothing else. Node.js is bundled in runtime\node.exe.

Start
-----
Double-click  CometStream.exe

That is the desktop app: it starts the backend inside itself and opens the
UI in its own window - no browser, no batch files, no Node.js needed.
Windows Firewall may ask for permission on first launch (the app runs a
local server); allow it for private networks if you only use it locally.

Prefer a console?  Start-CometStream.bat does the same with visible logs
(it also applies pending database migrations after a bundle update).

It will:
  1. Prepare the SQLite database (runs Prisma migrations on first boot)
  2. Start the document collector  (http://localhost:8888, internal)
  3. Start the CometStream server (http://localhost:3001)
  4. Open http://localhost:3001 in your default browser

On the very first boot you will be asked to create your admin account
and pick your LLM provider - everything else is standard CometStream.

Stop
----
Close the CometStream window (everything stops with it), or run
Stop-CometStream.bat.

Where is my data?
-----------------
Everything lives inside this folder:
  server\storage\        database, documents, settings, MCP config, etc.
  collector\hotdir\      temporary document staging

That means:
  - Back up this whole folder  = back up the app + all data.
  - Move/rename this folder    = the app and its data move with it.
  - Delete this folder         = everything is gone (there is no other copy).

Optional: website scraping
--------------------------
Scraping websites into workspaces uses a headless browser which is NOT
bundled (it is ~300 MB). If you need that feature while offline, run
  Install-Scrape-Browser.bat  once. Online machines do not need this.

Ports
-----
  3001  web UI + API (SERVER_PORT env var to change)
  8888  internal document collector (COLLECTOR_PORT env var to change)
Windows Firewall may ask for permission on first boot - allow it for
private networks if you only use it locally.

Notes
-----
- Keep the folder path free of the percent (%) character (batch launcher limitation).
- Built from the CometStream master branch. Server + collector production
  dependencies are pre-installed; the UI is pre-built into server\public.
