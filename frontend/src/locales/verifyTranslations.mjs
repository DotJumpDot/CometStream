/* global process */
import { resources } from "./resources.js";
const languageNames = new Intl.DisplayNames(Object.keys(resources), {
  type: "language",
});

function langDisplayName(lang) {
  return languageNames.of(lang);
}

/**
 * Fork semantics (see AGENTS.md "Conventions"): `en` is the ground truth and
 * every other locale falls back to it at runtime, so keys missing from a
 * locale are EXPECTED - reported as a count, never a failure. What must
 * fail: orphan keys (present in a locale but not in `en` - they can never
 * render and usually mean `en` was forgotten) and type mismatches (e.g. a
 * string where `en` has a subtree). Upstream's strict key-parity check is
 * intentionally relaxed here; the fork adds new strings to `en` only.
 */
function compareStructures(lang, a, b, stats, subdir = null) {
  //if a and b aren't the same type, they can't be equal
  if (typeof a !== typeof b && a !== null && b !== null) {
    console.log("Invalid type comparison", [
      {
        lang,
        a: typeof a,
        b: typeof b,
        values: {
          a,
          b,
        },
        ...(!!subdir ? { subdir } : {}),
      },
    ]);
    return false;
  }

  // Need the truthy guard because
  // typeof null === 'object'
  if (a && typeof a === "object") {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();

    // Keys a locale has that `en` does not - orphans. i18next resolves them,
    // but nothing in the app can ever reference them, so they are drift.
    const orphans = keysA.filter((key) => !keysB.includes(key));
    if (orphans.length > 0) {
      console.log("Orphan keys not present in en!", {
        [lang]: orphans,
        ...(!!subdir ? { subdir } : {}),
      });
      return false;
    }

    // Missing keys fall back to `en` at runtime - counted for the summary,
    // not a failure.
    for (const key of keysB) if (!keysA.includes(key)) stats.missing += 1;

    //recurse on the values for each key both sides have
    return keysA.every(function (key) {
      //if we made it here, the locale key exists in `en`
      return compareStructures(lang, a[key], b[key], stats, key);
    });

    //for primitives just ignore since we don't check values.
  } else {
    return true;
  }
}

const failed = [];
const TRANSLATIONS = {};
for (const [lang, { common }] of Object.entries(resources))
  TRANSLATIONS[lang] = common;
const PRIMARY = { ...TRANSLATIONS["en"] };
delete TRANSLATIONS["en"];

console.log(
  `The following translation files will be verified: [${Object.keys(
    TRANSLATIONS
  ).join(",")}]`
);
for (const [lang, translations] of Object.entries(TRANSLATIONS)) {
  // Missing = keys that resolve through en-fallback at runtime (by design).
  const stats = { missing: 0 };
  const passed = compareStructures(lang, translations, PRIMARY, stats);
  const fallbackNote =
    stats.missing > 0 ? ` · ${stats.missing} keys fall back to en` : "";
  console.log(
    `${langDisplayName(lang)} (${lang}): ${passed ? "✅" : "❌"}${passed ? fallbackNote : ""}`
  );
  !passed && failed.push(lang);
}

if (failed.length !== 0)
  throw new Error(
    `The following translations files are INVALID and need fixing. Please see logs`,
    failed
  );
console.log(
  `👍 All translation files have no orphan keys or type mismatches (missing keys fall back to en)!`
);
process.exit(0);
