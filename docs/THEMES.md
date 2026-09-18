# Themes

CometStream supports multiple UI themes beyond the classic light/dark toggle. Current roster:

| Key | Name | Vibe |
| --- | --- | --- |
| `system` | System | Follows OS preference |
| `light` | Light | Default light |
| `dark` | Dark | Default dark (`:root` variables) |
| `monokai-night` | Monokai Night | Dark grays, pink `#f92672` accents (fabiospampinato/vscode-monokai-night) |
| `monokai-dark-soda` | Monokai Dark Soda | Warm dark, orange `#fd971f` accents (AdamCaviness/vscode-monokai-dark-soda) |

Pick one in **Settings → Customization → Interface → Theme** (or the account modal). The choice persists in `localStorage` and survives reloads.

## How theming works

Two files, one pattern:

1. **`frontend/src/index.css`** — one CSS-variable block per theme. `:root` holds the default dark palette; each `[data-theme="<key>"]` block overrides the same ~90 variables (surfaces, sidebar, chat, inputs, buttons, checklists, attachments, hovers).
2. **`frontend/src/hooks/useTheme.js`** — the registry (`availableThemes`), persistence, and application: sets `data-theme` on `<html>` and toggles the `light` class on `<body>`.

Everything else follows automatically because components reference `var(--theme-*)` via Tailwind arbitrary values (e.g. `bg-theme-bg-sidebar`) mapped in `tailwind.config.js`.

**Binary light/dark logic** (logo variant, code-block highlighting, `isLight`) treats every non-`light` theme as dark — correct for all current themes; keep it in mind if you add a *light* theme.

## Adding a new theme

1. **Pick a key** — kebab-case, stable forever (it's stored in users' `localStorage`).
2. **Add the CSS block** in `frontend/src/index.css` after the existing theme blocks. Copy the full variable set from an existing dark theme and adjust. Cover *every* variable — partial blocks fall through to `:root` values and look broken.
3. **Register it** in `availableThemes` (`frontend/src/hooks/useTheme.js`) and extend the `ThemeOption` typedef.
4. **Check contrast** on: sidebar, workspace chat bubbles, admin tables, modals, the file picker, and code blocks.

That's it — every dropdown in the app renders from the registry.

## Where each variable lands

Quick map for palette work (see the CSS blocks for the full list):

- **Chrome:** `--theme-bg-container` (main), `--theme-bg-sidebar`, `--theme-sidebar-*` (items/borders/footer icons).
- **Chat:** `--theme-bg-chat`, `--theme-bg-chat-input`, `--theme-chat-input-border`.
- **Controls:** `--theme-button-primary` / `-hover`, `--theme-button-cta`, plus hover states for code/delete/disable actions.
- **Overlays:** `--theme-popup-menu-bg`, `--theme-action-menu-*`, `--theme-modal-border`.
- **Tables/lists:** `--theme-file-row-*`, `--theme-settings-input-*`.
- **Home/onboarding:** `--theme-home-*`, `--theme-checklist-*`.
