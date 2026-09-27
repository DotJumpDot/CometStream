import EndpointLine from "@/components/EndpointLine";
import { contrastText } from "@/components/ThemePalette";

const OPEN_THREADS = [
  "Build a complete mini…",
  "Favorite toggle fix",
  "CORS probe",
  "Write API docs",
  "Gallery polish",
];

/**
 * Theme preview: full-width color rectangles (name + hex on top of the
 * color itself) beside a dense mini workspace mock - folder tree with one
 * open project, a natural user prompt, transcript lines, a composer, and an
 * agent rail with plan, session and change rows. Every surface references
 * theme variables or palette variables, never fixed colors, so the mock
 * follows both the UI theme and the method palette.
 * @param {{ items: Array<{ hex: string, label: string }> }} props
 */
export default function ThemePreview({ items = [] }) {
  return (
    <div className="flex flex-col md:flex-row gap-3 py-4">
      <div className="flex flex-col gap-1.5 md:w-[30%] shrink-0">
        {items.map(({ hex, label }) => {
          const fg = contrastText(hex);
          return (
            <div
              key={hex}
              className="rounded-lg overflow-hidden border border-theme-modal-border"
              style={{ backgroundColor: hex }}
            >
              <div className="px-2 py-1.5 flex flex-col justify-center gap-px">
                <span
                  className="text-[11px] font-semibold leading-4"
                  style={{ color: fg }}
                >
                  {label}
                </span>
                <span
                  className="text-[10px] font-mono leading-4 opacity-80"
                  style={{ color: fg }}
                >
                  {hex}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="md:flex-1 rounded-lg border border-theme-modal-border bg-theme-bg-primary overflow-hidden flex min-h-[260px] text-left">
        <div className="w-[26%] bg-theme-bg-sidebar px-1.5 py-2 flex flex-col gap-0.5">
          <div className="h-4 rounded-md bg-theme-bg-chat-input mb-1" />
          <div className="flex items-center gap-1 rounded-md bg-theme-sidebar-item-selected px-1 py-1">
            <span className="w-0.5 self-stretch rounded-full bg-theme-button-primary" />
            <span className="text-[8px] font-medium text-theme-text-primary truncate">
              Hanami Hub
            </span>
          </div>
          <div className="flex flex-col gap-px pl-2">
            {OPEN_THREADS.map((thread, i) => (
              <div
                key={thread}
                className={`rounded px-1 py-0.5 text-[8px] truncate ${
                  i === 0
                    ? "bg-theme-sidebar-thread-selected font-medium text-theme-text-primary"
                    : "text-theme-text-secondary"
                }`}
              >
                {thread}
              </div>
            ))}
          </div>
          {["Comet Docs", "Site Redesign"].map((name) => (
            <div
              key={name}
              className="rounded-md px-1 py-1 text-[8px] text-theme-text-secondary truncate"
            >
              {name}
            </div>
          ))}
          <div className="mt-auto rounded-md border border-theme-modal-border px-1 py-0.5 text-[8px] text-theme-text-secondary truncate">
            + New thread
          </div>
        </div>
        <div className="flex-1 bg-theme-bg-chat px-2 py-1.5 flex flex-col gap-1 min-w-0">
          <p className="text-[9px] font-semibold text-theme-text-primary truncate">
            Hanami Hub{" "}
            <span className="font-normal">/ Build a complete mini…</span>
          </p>
          <div className="self-end max-w-[95%] rounded-lg bg-theme-bg-chat-input px-1.5 py-0.5">
            <p className="text-[10px] text-theme-text-primary">
              give me info of this api
            </p>
            <EndpointLine line="GET /api/blossoms" />
          </div>
          <p className="text-[10px] leading-4 text-theme-text-primary">
            Found <b>7</b> blossoms for{" "}
            <span className="md-quote">&ldquo;gallery&rdquo;</span>{" "}
            <span
              className="md-hex"
              style={{ backgroundColor: "#FFB7C5", color: "#4A3B40" }}
            >
              #FFB7C5
            </span>
          </p>
          <p className="text-[10px] leading-4 text-theme-text-secondary">
            Gallery renders them with favorite toggles and the{" "}
            <span className="md-quote">&ldquo;sakura&rdquo;</span> theme.
          </p>
          <p className="flex items-center gap-x-1 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span
              className="font-semibold"
              style={{ color: "var(--mp-cat-run, #10B981)" }}
            >
              Run
            </span>
            <span className="truncate text-theme-text-secondary">
              $ ls hanami.db
            </span>
            <span
              className="tabular-nums"
              style={{ color: "var(--mp-timing, #f472b6)" }}
            >
              135ms
            </span>
          </p>
          <div className="mt-auto flex items-center gap-1 rounded-lg border border-theme-modal-border bg-theme-bg-secondary px-1.5 py-1">
            <span className="text-[9px] text-theme-text-secondary flex-1 truncate">
              Send a message
            </span>
            <span className="w-4 h-4 rounded-full bg-theme-button-primary shrink-0" />
          </div>
        </div>
        <div className="w-[24%] border-l border-theme-modal-border bg-theme-bg-secondary px-1.5 py-2 hidden sm:flex flex-col gap-1">
          <p className="text-[8px] font-semibold text-theme-text-primary">
            Agent
          </p>
          <div className="h-1 rounded-full bg-theme-sidebar-item-hover overflow-hidden">
            <div
              className="h-full w-1/3 rounded-full"
              style={{ backgroundColor: "var(--mp-timing, #f472b6)" }}
            />
          </div>
          {["Build backend", "Gallery UI"].map((todo, i) => (
            <div key={todo} className="flex items-start gap-1">
              <span
                className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor:
                    i === 0 ? "#7FB069" : "var(--theme-sidebar-border)",
                }}
              />
              <span className="text-[8px] leading-3 text-theme-text-secondary">
                {todo}
              </span>
            </div>
          ))}
          <p className="mt-1 text-[8px] font-semibold text-theme-text-primary">
            Sessions
          </p>
          <p className="flex items-center gap-1 text-[8px] font-mono">
            <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
            <span
              className="font-semibold"
              style={{ color: "var(--mp-cat-cat, #FB923C)" }}
            >
              Cat
            </span>
            <span className="truncate text-theme-text-secondary">
              $ cat .md
            </span>
          </p>
          <p className="flex items-center gap-1 text-[8px] font-mono">
            <FileDot />
            <span className="truncate text-theme-text-secondary">app.py</span>
            <span className="tabular-nums text-theme-text-primary">+228</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function FileDot() {
  return (
    <span className="w-1.5 h-1.5 rounded-[3px] bg-theme-button-primary shrink-0" />
  );
}
