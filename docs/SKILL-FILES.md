# Skill files (SKILL.md loader)

CometStream can load Claude/ZCode-style **skills** from any folder on your machine and expose them to workspace agents as invocable tools. This is the same progressive-disclosure model Claude Code and ZCode use.

## Pointing the app at your skills

**Admin → Agents → Skill Files**

Set the directory to a folder that contains skill subfolders (e.g. `C:\Code\AiSKill`). Everything in it is discovered live — add, edit, or remove skills on disk and the next chat picks them up, no restart needed. Individual skills can be toggled off; by default **all** discovered skills are active. Per-chat, skills appear in the Tools menu alongside built-in agent skills.

## The SKILL.md format

A skill is a subfolder with a `SKILL.md` entry file using flat YAML frontmatter:

```
my-skill/
├── SKILL.md          ← required
├── RECIPES.md        ← optional support files
└── helper.js         ← optional support files
```

```markdown
---
name: My Skill
description: What this skill helps with, one or two sentences the model reads when deciding to use it.
---

Full instructions for the model. Anything goes here — checklists, code
conventions, workflows. This content is only loaded when the model invokes
the skill's tool.
---

Support files are listed in the tool result; the model fetches them with
skill-file-read when needed.
```

Only `name` and `description` are read from the frontmatter (single-line values). A skill missing either still loads — the folder name becomes the display name.

## How the model sees it

1. **Always visible:** every active skill's tool (`skill_<folder>`) with its name + description — cheap on context.
2. **On invoke:** the full SKILL.md body is read fresh from disk and returned to the model, plus a manifest of support files.
3. **On demand:** support files (up to 1 MB each) are fetched via the shared `skill-file-read` tool (`{ skill, file }`).

## Settings & persistence

| Setting | Meaning |
| --- | --- |
| `agent_skill_files_directory` | Absolute path to the skills root (empty = feature off) |
| `active_skill_files` | JSON array of active folder names; absent = all active |

Admin API (all admin-only, under `/api`):

- `GET /skill-files/list` — directory + discovered skills + active flags
- `POST /skill-files/directory` `{ directory }` — set/clear the root, returns the re-scan
- `POST /skill-files/toggle` `{ name, active }` — toggle by folder name

## Security model

Skills are code-adjacent instructions, and support files are user data — the loader treats both with care:

- The skills root must be an existing directory set by an **admin**.
- Tool parameters (`skill`, `file`) must each be a **single plain path segment** — no `/`, `\`, `.`, `..`, or NUL bytes — and every resolved path must remain under the configured root (`startsWith(root + path.sep)`), so `../` and absolute-path injection cannot escape it. See `isSafeSegment` in `server/utils/agents/skillFiles.js`.
- Support-file reads are capped at 1 MB.
- The directory is re-validated on every scan; an unset/removed directory simply disables the feature.

## Internals (for contributors)

Loadable ids follow the `@@` convention: each active skill contributes `@@skill_<folder>`, plus one shared `@@skill_file_read` for the reader. Resolution lives in `server/utils/agents/skillFiles.js`; wiring in `defaults.js` (`activeSkillFilePlugins`), `agents/index.js` and `ephemeral.js` (`#attachPluginByName` / attach loop). Tool names are sanitized to `[a-zA-Z0-9_-]` and capped at 58 characters.
