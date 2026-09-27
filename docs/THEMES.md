# Themes

CometStream supports multiple UI themes beyond the classic light/dark toggle. Current roster:

| Key | Name | Vibe |
| --- | --- | --- |
| `system` | System | Follows OS preference |
| `light` | Light | Default light |
| `dark` | Dark | Default dark (`:root` variables) |
| `monokai-night` | Monokai Night | Dark grays, pink `#f92672` accents (fabiospampinato/vscode-monokai-night) |
| `monokai-dark-soda` | Monokai Dark Soda | Warm dark, orange `#fd971f` accents (AdamCaviness/vscode-monokai-dark-soda) |
| `sakura` | Sakura | Light pastel Hanami palette: background `#FFF7F9`, sakura pink `#FFB7C5`, deep plum `#D4637D`, text `#4A3B40`, cards `#FFFFFF` with `#FFD9E1` borders, success `#7FB069` |

Pick one in **Settings → Customization → Interface → Theme** (or the account modal). The choice persists in `localStorage` and survives reloads. The Interface page also shows a **Theme palette** card — full-width color rectangles for the *active* theme beside a dense mini workspace mock (folder tree with one open project, natural user prompt, transcript, composer, agent rail with plan/session/change rows). Both update live with no navigation.

## Method color palette (independent of theme)

HTTP method badge colors live in their own system: `frontend/src/hooks/useMethodPalette.js` (presets + persistence + `--mp-*` document variables) and `frontend/src/components/EndpointLine/` (tokenizer + renderer). Three presets ship: `sakura` (default), `classic` (Swagger-convention colors), `mono` (plum grayscale). Picked in **Settings → Interface → Method color palette**, with a **Restore default** button back to Sakura. Every preset carries the full token set — methods, endpoint path, timing, quote, link, quoted chip, code cmd/path/val, all 14 session categories — so switching presets recolors everything, nothing stays stuck in another preset's colors.

Separation is deliberate both ways and stored separately (`localStorage` keys `theme` vs `method-palette`):
- Switching the UI theme never changes method colors.
- Switching the method preset never changes the UI theme.

The palette also drives the agent chat, not just the settings preview:
- Chat method pills (`.md-method-*` in `index.css`), quoted spans (`.md-quote`), links (`.markdown a`, `.md-url`), and code-chip kinds (`.md-code-cmd/path/val`) read the `--mp-*` variables with the legacy values as fallbacks.
- Bare `#hex` codes in prose and code chips render as self-colored `.md-hex` chips; the foreground flips white/black by luminance (`hexChipText` in `markdown.js`), so `#FFF7F9` gets dark text and `#4A3B40` gets white. Inline styles survive DOMPurify (style attributes are allowed by default).
- `SessionCard` category chips and durations read `--mp-cat-*` / `--mp-timing` the same way.
- The `classic` preset sets NO variables, so the long-standing chat look (pink timings, per-kind chips) rules untouched. Non-classic presets override globally, including on light themes — single-value tradeoff, accepted (the old per-theme `light:` variants only apply to the classic path now).

Implementation note: the hook uses `useSyncExternalStore` backed by `localStorage` + a `method-palette-changed` window event (plus the `storage` event for cross-tab sync). A plain `useState`-per-component was the original bug — the picker updated but previews never re-rendered. Hex chips stay self-colored in every preset by design.

## How theming works

Two files, one pattern:

1. **`frontend/src/index.css`** — one CSS-variable block per theme. `:root` holds the default dark palette; each `[data-theme="<key>"]` block overrides the same ~90 variables (surfaces, sidebar, chat, inputs, buttons, checklists, attachments, hovers).
2. **`frontend/src/hooks/useTheme.js`** — the registry (`availableThemes`), persistence, and application: sets `data-theme` on `<html>` and toggles the `light` class on `<body>`.

Everything else follows automatically because components reference `var(--theme-*)` via Tailwind arbitrary values (e.g. `bg-theme-bg-sidebar`) mapped in `tailwind.config.js`.

**Light-surface handling** is centralized in `isLightThemeKey()` (`frontend/src/hooks/useTheme.js`): `light` and `sakura` get the `body.light` class, the light logo, and the `github` code-block theme. Every other branching point (toasts, embed snippet modal, tooltip arrows, builder dot-grid) keys off the same helper — when adding a future light theme, extend that one function instead of hunting comparisons.

**Sakura vs hardcoded `light:` utilities:** enabling `body.light` for Sakura also activates every hardcoded `light:bg-slate-*` / `light:border-slate-*` / `light:bg-blue-*` surface in the chat/sidebar, which would paint Sakura light-blue. The `[data-theme]` remap block in `index.css` re-tints those utilities onto Sakura variables. Two selector rules learned the hard way:
- The `data-theme` attribute lives on `<html>`, so scope as `html[data-theme="sakura"] body.light ...` — putting the attribute on `body` never matches.
- In a compound selector the type selector must come FIRST: `[data-theme="sakura"]body.light` is invalid CSS and silently drops the whole rule (this exact mistake shipped once).

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
