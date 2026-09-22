/**
 * Tool-argument validation + repair loop for the execution loop. Local
 * models frequently emit malformed tool calls: truncated JSON (stream cut),
 * missing required fields, or wrong-typed values. Before this module the
 * streaming path coerced unparseable arguments to `{}` and executed the
 * tool anyway - the model then debugged a phantom failure it never caused.
 *
 * Policy (checked BEFORE any handler runs, in both execution loops):
 * - Unparseable argument JSON (flagged by tooledStream, or a raw string that
 *   will not parse) never executes. The model gets the raw excerpt plus the
 *   schema and re-calls.
 * - Missing/invalid required fields never execute, with a field-level issue
 *   list. Extra keys are ignored (handlers destructure) so repair prompts
 *   stay rare and precise.
 * - Repairs are bounded per turn (MAX_ARG_REPAIRS_PER_TURN): past that the
 *   call is skipped with a note instead of burning the tool budget on a
 *   model that cannot shape the call.
 *
 * Repair messages are model-digestible by construction: what was wrong, the
 * exact expected shape, and an instruction to re-call without explaining.
 */

// Fingerprint tooledStream stamps on calls whose streamed argument JSON
// would not parse (stream cut mid-object, template glitch, ...).
const ARGS_PARSE_ERROR_KEY = "argsParseError";
const MAX_ARG_REPAIRS_PER_TURN = 2;
const RAW_EXCERPT_CHARS = 500;

/**
 * Normalizes a call's arguments to an object when possible.
 * @param {unknown} args - functionCall.arguments (object, string, other).
 * @returns {{value: object|null, rawExcerpt: string|null}} Parsed object, or
 *   the raw excerpt when parsing failed.
 */
function normalizeArgs(args) {
  if (args !== null && typeof args === "object" && !Array.isArray(args))
    return { value: args, rawExcerpt: null };
  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      )
        return { value: parsed, rawExcerpt: null };
      return {
        value: null,
        rawExcerpt: args.slice(0, RAW_EXCERPT_CHARS),
      };
    } catch {
      return { value: null, rawExcerpt: args.slice(0, RAW_EXCERPT_CHARS) };
    }
  }
  return { value: null, rawExcerpt: null };
}

/**
 * Loose JSON-schema type check for one value (local models stringify
 * numbers/booleans; only flag clear mismatches, never coerce).
 * @param {string|undefined} expected - Schema type.
 * @param {unknown} value
 * @returns {boolean} True when the value plausibly matches.
 */
function typeMatches(expected, value) {
  if (expected === undefined) return true;
  if (value === null || value === undefined) return false;
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Validates one tool call's arguments against the registered function schema.
 * Pure - safe to unit test without an agent instance.
 * @param {{name?: string, parameters?: object}|null} fnDef - Registered function (may be null).
 * @param {object} functionCall - The call ({name, arguments, [argsParseError]}).
 * @returns {string|null} Issue description, or null when the call may execute.
 */
function validateToolCallArgs(fnDef, functionCall = {}) {
  if (typeof functionCall?.[ARGS_PARSE_ERROR_KEY] === "string") {
    return (
      `arguments are not valid JSON and were not executed (stream cut or malformed). ` +
      `Raw excerpt: ${functionCall[ARGS_PARSE_ERROR_KEY].slice(0, RAW_EXCERPT_CHARS)}`
    );
  }
  const { value, rawExcerpt } = normalizeArgs(functionCall?.arguments);
  if (!value) {
    return rawExcerpt
      ? `arguments are not a JSON object and were not executed. Raw excerpt: ${rawExcerpt}`
      : `arguments are missing and were not executed (expected a JSON object).`;
  }
  const schema = fnDef?.parameters;
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const properties =
    schema?.properties && typeof schema.properties === "object"
      ? schema.properties
      : {};
  const issues = [];
  for (const field of required) {
    if (value[field] === undefined || value[field] === null) {
      issues.push(`missing required field "${field}"`);
      continue;
    }
    const expected = properties[field]?.type;
    if (!typeMatches(expected, value[field])) {
      issues.push(
        `field "${field}" should be ${expected || "present"} but got ${Array.isArray(value[field]) ? "array" : typeof value[field]}`
      );
    }
  }
  if (issues.length > 0)
    return `invalid arguments (call NOT executed): ${issues.join("; ")}. Received keys: ${Object.keys(value).join(", ") || "(none)"}`;
  return null;
}

/**
 * Formats the repair turn the model sees as the tool result: what was wrong,
 * the required shape, and a re-call instruction. No explanation requested -
 * every extra token here is a turn burned.
 * @param {string} toolName
 * @param {string} issue - validateToolCallArgs output.
 * @param {{parameters?: object}|null} fnDef
 * @returns {string}
 */
function formatArgRepair(toolName, issue, fnDef = null) {
  const schema = fnDef?.parameters;
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const shape = schema
    ? JSON.stringify(schema).slice(0, 2000)
    : "(no schema registered)";
  return [
    `Your call to "${toolName}" was NOT executed: ${issue}`,
    required.length > 0
      ? `Required fields: ${required.join(", ")}.`
      : `No required fields registered.`,
    `Expected schema: ${shape}`,
    `Fix ONLY the arguments and call "${toolName}" again with corrected JSON. Do not explain - just re-call.`,
  ].join("\n");
}

module.exports = {
  validateToolCallArgs,
  formatArgRepair,
  normalizeArgs,
  ARGS_PARSE_ERROR_KEY,
  MAX_ARG_REPAIRS_PER_TURN,
  RAW_EXCERPT_CHARS,
};
