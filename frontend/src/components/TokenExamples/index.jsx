const SESSION_CATEGORIES = [
  "Search",
  "Run",
  "Install",
  "Write",
  "Fetch",
  "Kill",
  "Sleep",
  "Git",
  "Test",
  "Files",
  "Cat",
  "List",
  "Pwd",
  "Bash",
];
const SESSION_FALLBACKS = {
  Search: "#38BDF8",
  Run: "#10B981",
  Install: "#FBBF24",
  Write: "#A78BFA",
  Fetch: "#22D3EE",
  Kill: "#F87171",
  Sleep: "#FDE047",
  Git: "#60A5FA",
  Test: "#E879F9",
  Files: "#2DD4BF",
  Cat: "#FB923C",
  List: "#A3E635",
  Pwd: "#A8A29E",
  Bash: "#818CF8",
};
const HEX_SAMPLES = ["#FFB7C5", "#4A3B40"];

/**
 * Static gallery of every non-REST token kind the method palette drives in
 * the agent chat: terminal commands, file paths, bare values, quoted spans,
 * links, self-colored hex chips, session category chips and durations. Uses
 * the exact chat classes (md-code-*, md-quote, md-url, md-hex) plus the
 * --mp-* variables, so this preview and the chat can never drift apart.
 */
export default function TokenExamples() {
  return (
    <div className="py-2 grid gap-x-6 font-mono text-[13px]">
      <p className="py-1.5 flex flex-wrap items-center gap-x-2">
        {SESSION_CATEGORIES.map((category) => (
          <span
            key={category}
            className="text-[11px] font-semibold"
            style={{
              color: `var(--mp-cat-${category.toLowerCase()}, ${SESSION_FALLBACKS[category]})`,
            }}
          >
            {category}
          </span>
        ))}
        <span
          className="tabular-nums"
          style={{ color: "var(--mp-timing, #f472b6)" }}
        >
          135ms
        </span>
      </p>
      <p className="py-1.5">
        <span className="md-code-cmd">
          python -m http.server 5500 --directory frontend
        </span>
      </p>
      <p className="py-1.5">
        <span className="md-code-path">backend/app.py</span>
      </p>
      <p className="py-1.5 flex flex-wrap gap-x-2">
        <span className="md-code-val">CryptContext</span>
        <span className="md-code-val">Request</span>
        <span className="md-code-val">:5500</span>
      </p>
      <p className="py-1.5">
        <span className="md-quote">&ldquo;finaltest&rdquo;</span>
      </p>
      <p className="py-1.5">
        <span className="md-url">http://localhost:8000/api/health</span>
      </p>
    </div>
  );
}
