const MCPHypervisor = require("./hypervisor");
const path = require("path");
const {
  projectText,
  spillText,
} = require("../agents/aibitat/plugins/result-budget");

// Default per-call timeout for MCP tool executions. A hung MCP server used
// to wedge the whole agent turn forever - every call now races this budget
// (ENV `AGENT_MCP_TOOL_TIMEOUT_MS` wins, then the in-app
// `mcp_tool_timeout_ms` setting). Bounds keep typos from wedging (min) or
// defeating (max) the guard.
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 120_000;
const MIN_MCP_TOOL_TIMEOUT_MS = 5_000;
const MAX_MCP_TOOL_TIMEOUT_MS = 600_000;
const MCP_TOOL_TIMEOUT_SETTING_KEY = "mcp_tool_timeout_ms";

// Inline budget for MCP tool results. MCP servers return arbitrary JSON -
// without a cap one verbose tool eats the model's context for the rest of
// the run. Truncated results spill to the agent sandbox (see below) with a
// pointer, mirroring the terminal output policy.
const MCP_RESULT_INLINE_CHARS = 12_000;
const MCP_RESULT_HEAD_CHARS = 2_000;

// Transport-level failures worth one restart + retry. Timeouts are NOT
// retried blindly: a timed-out call already consumed the full budget, so the
// model gets a narrow-your-query message instead of another long wait.
const MCP_TRANSPORT_ERROR_PATTERN =
  /fetch failed|ECONNRESET|ECONNREFUSED|socket hang up|terminated|closed|EPIPE|ETIMEDOUT|ENOTFOUND/i;

/**
 * Resolves the agent filesystem sandbox root (STORAGE_DIR-aware) so spilled
 * MCP outputs land where the file tools can read them back.
 * @returns {string} Absolute sandbox path.
 */
function agentSandboxRoot() {
  const base =
    process.env.NODE_ENV === "development"
      ? path.resolve(__dirname, "../storage")
      : path.resolve(
          process.env.STORAGE_DIR ?? path.resolve(__dirname, "../storage"),
          "."
        );
  return path.join(base, "anythingllm-fs");
}

/**
 * Directory for spilled MCP outputs, hidden inside the agent sandbox so the
 * model can page them back in with the file tools. Skipped by nothing
 * else - MCP spills are not workdir snapshots, so no ignore-list needed.
 * @returns {string} Absolute spill directory.
 */
function mcpSpillDir() {
  return path.join(agentSandboxRoot(), ".tool-outputs");
}

/**
 * Clamps a timeout value to sane bounds.
 * @param {unknown} raw - Candidate milliseconds.
 * @param {number} fallback - Used when raw is not a positive number.
 * @returns {number} Clamped timeout.
 */
function clampMcpTimeout(raw, fallback = DEFAULT_MCP_TOOL_TIMEOUT_MS) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(
    MAX_MCP_TOOL_TIMEOUT_MS,
    Math.max(MIN_MCP_TOOL_TIMEOUT_MS, parsed)
  );
}

/**
 * Resolves the per-call MCP tool timeout: ENV wins, then the in-app setting,
 * then the default. Async because the setting lives in the DB.
 * Lazy-requires the model (module top would risk a require cycle).
 * @returns {Promise<number>} Clamped timeout in milliseconds.
 */
async function mcpToolTimeoutMs() {
  if (process.env.AGENT_MCP_TOOL_TIMEOUT_MS?.trim())
    return clampMcpTimeout(process.env.AGENT_MCP_TOOL_TIMEOUT_MS);
  try {
    const { SystemSettings } = require("../../models/systemSettings");
    const raw = await SystemSettings.getValueOrFallback(
      { label: MCP_TOOL_TIMEOUT_SETTING_KEY },
      ""
    );
    if (String(raw ?? "").trim()) return clampMcpTimeout(raw);
  } catch {
    // Fail open to the default budget below.
  }
  return DEFAULT_MCP_TOOL_TIMEOUT_MS;
}

/**
 * Races a promise against a timeout. The underlying operation is NOT
 * cancelled (the MCP SDK client has no abort handle) - callers restart the
 * server when a hung call must be abandoned for good.
 * @param {Promise<any>} promise - The operation.
 * @param {number} ms - Timeout in milliseconds.
 * @param {string} message - Timeout error message.
 * @returns {Promise<any>}
 */
function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(message);
      error.code = "MCP_TOOL_TIMEOUT";
      reject(error);
    }, ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Whether an error is our own call timeout (vs a transport failure, which
 * is restart-eligible, or a tool logic error, which fails fast).
 * @param {unknown} error
 * @returns {boolean}
 */
function isTimeoutError(error) {
  return error?.code === "MCP_TOOL_TIMEOUT";
}

/**
 * Serializes an MCP tool result with the shared inline budget. Oversized
 * results spill to the agent sandbox with a pointer so the model can page
 * more in with the file tools; failures here must never mask the result.
 * @param {string} serverName - MCP server name (spill label).
 * @param {string} toolName - Tool name (spill label).
 * @param {unknown} result - Raw callTool result.
 * @returns {string} Model-facing result text.
 */
function projectMCPResult(serverName, toolName, result) {
  const text = MCPCompatibilityLayer.returnMCPResult(result);
  const projected = projectText(
    text,
    MCP_RESULT_INLINE_CHARS,
    MCP_RESULT_HEAD_CHARS
  );
  if (!projected.truncated) return projected.text;
  let pointer = "";
  try {
    const spilled = spillText(mcpSpillDir(), `${serverName}-${toolName}`, text);
    if (spilled) {
      pointer = `\n[Full result (${text.length} chars) spilled to ${spilled} - read it with the file tools if you need more than this window.]`;
    }
  } catch {
    // Spill is best-effort - the projected window stands either way.
  }
  return projected.text + pointer;
}

class MCPCompatibilityLayer extends MCPHypervisor {
  static _instance;

  constructor() {
    super();
    if (MCPCompatibilityLayer._instance) return MCPCompatibilityLayer._instance;
    MCPCompatibilityLayer._instance = this;
  }

  /**
   * Get all of the active MCP servers as plugins we can load into agents.
   * This will also boot all MCP servers if they have not been started yet.
   * @returns {Promise<string[]>} Array of flow names in @@mcp_{name} format
   */
  async activeMCPServers() {
    await this.bootMCPServers();
    return Object.keys(this.mcps).flatMap((name) => `@@mcp_${name}`);
  }

  /**
   * Convert an MCP server name to an AnythingLLM Agent plugin
   * @param {string} name - The base name of the MCP server to convert - not the tool name. eg: `docker-mcp` not `docker-mcp:list-containers`
   * @param {Object} aibitat - The aibitat object to pass to the plugin
   * @returns {Promise<{name: string, description: string, plugin: Function}[]|null>} Array of plugin configurations or null if not found
   */
  async convertServerToolsToPlugins(name, _aibitat = null) {
    const mcp = this.mcps[name];
    if (!mcp) return null;

    let tools;
    try {
      const response = await mcp.listTools();
      tools = response.tools;
    } catch (error) {
      this.log(`Failed to list tools for MCP server ${name}:`, error);
      return null;
    }
    if (!tools || !tools.length) return null;

    const suppressedTools = this.getSuppressedTools(name);
    const totalTools = tools.length;
    tools = tools.filter((tool) => !suppressedTools.includes(tool.name));
    const suppressedCount = totalTools - tools.length;

    if (suppressedCount > 0) {
      this.log(
        `MCP server ${name}: ${suppressedCount} tool(s) suppressed, ${tools.length} tool(s) enabled`
      );
    }

    if (!tools.length) {
      this.log(`MCP server ${name}: All tools are suppressed, skipping`);
      return null;
    }

    const plugins = [];
    for (const tool of tools) {
      plugins.push({
        name: `${name}-${tool.name}`,
        description: tool.description,
        plugin: function () {
          return {
            name: `${name}-${tool.name}`,
            setup: (aibitat) => {
              aibitat.function({
                super: aibitat,
                name: `${name}-${tool.name}`,
                controller: new AbortController(),
                description: tool.description,
                isMCPTool: true,
                examples: [],
                parameters: {
                  $schema: "http://json-schema.org/draft-07/schema#",
                  ...tool.inputSchema,
                },
                handler: async function (args = {}) {
                  try {
                    const mcpLayer = new MCPCompatibilityLayer();
                    aibitat.handlerProps.log(
                      `Executing MCP server: ${name}:${tool.name} with args:`,
                      args
                    );
                    aibitat.introspect(
                      `Executing MCP server: ${name} with ${JSON.stringify(args, null, 2)}`
                    );
                    // Timeout, one restart + retry on transport failure, and
                    // a bounded inline result all live in the resilience
                    // wrapper - the handler only reports the outcome.
                    const text = await mcpLayer.callMCPToolWithResilience(
                      name,
                      tool.name,
                      args,
                      {
                        log: aibitat.handlerProps.log,
                        introspect: (message) => aibitat.introspect(message),
                      }
                    );
                    aibitat.handlerProps.log(
                      `MCP server: ${name}:${tool.name} completed successfully`
                    );
                    aibitat.introspect(
                      `MCP server: ${name}:${tool.name} completed successfully`
                    );
                    return text;
                  } catch (error) {
                    aibitat.handlerProps.log(
                      `MCP server: ${name}:${tool.name} failed with error:`,
                      error
                    );
                    aibitat.introspect(
                      `MCP server: ${name}:${tool.name} failed with error:`,
                      error
                    );
                    return `The tool ${name}:${tool.name} failed with error: ${error?.message || "An unknown error occurred"}`;
                  }
                },
              });
            },
          };
        },
        toolName: `${name}:${tool.name}`,
      });
    }

    return plugins;
  }

  /**
   * Call an MCP tool with timeout, one restart + retry on transport failure,
   * and a bounded inline result (spilled to disk when truncated).
   *
   * Resilience policy:
   * - Every call races the configured timeout - a hung server can no longer
   *   wedge the agent turn. Timeouts are NOT retried (the budget is spent);
   *   the model gets a narrow-your-query message instead.
   * - Transport-level failures (dropped socket, refused connection, closed
   *   transport) trigger one server restart + one retry. Anything else fails
   *   fast with the error text.
   * - Oversized results are projected inline with the full text spilled to
   *   the agent sandbox, so the model can read more on demand.
   *
   * Kept as a plain method (not #private): this class implements the
   * singleton pattern by returning a cached instance from super(), and
   * private methods on the subclass would be re-installed and throw.
   * @param {string} name - MCP server name
   * @param {string} toolName - Tool name on that server
   * @param {object} [args={}] - Tool arguments
   * @param {object} [hooks={}] - Optional {log, introspect} for run updates
   * @returns {Promise<string>} Model-facing result text.
   */
  async callMCPToolWithResilience(name, toolName, args = {}, hooks = {}) {
    const timeoutMs = await mcpToolTimeoutMs();
    const log = hooks.log || (() => {});
    const introspect = hooks.introspect || (() => {});

    const runCall = async () => {
      const current = this.mcps[name];
      if (!current)
        throw new Error(`MCP server ${name} is not currently running`);
      return await withTimeout(
        current.callTool({ name: toolName, arguments: args }),
        timeoutMs,
        `MCP tool ${name}:${toolName} timed out after ${timeoutMs}ms`
      );
    };

    let result;
    try {
      result = await runCall();
    } catch (error) {
      if (isTimeoutError(error)) {
        log(`MCP tool ${name}:${toolName} timed out after ${timeoutMs}ms`);
        introspect(
          `MCP server: ${name}:${toolName} timed out after ${Math.round(timeoutMs / 1000)}s.`
        );
        return (
          `The tool ${name}:${toolName} timed out after ${Math.round(timeoutMs / 1000)}s without responding. ` +
          `It was NOT retried. Narrow the request (fewer items, tighter filters, smaller paths) and call it again, ` +
          `or check the MCP server status in Admin → Agents → MCP Servers.`
        );
      }
      if (!MCP_TRANSPORT_ERROR_PATTERN.test(error?.message || "")) throw error;
      // Transport failure: restart the server once and retry once.
      log(
        `MCP tool ${name}:${toolName} transport failure, restarting ${name}:`,
        error?.message
      );
      introspect(
        `MCP server: ${name} connection dropped - restarting it once and retrying.`
      );
      const restarted = await this.restartMCPServerForRetry(name);
      if (!restarted) throw error;
      try {
        result = await runCall();
      } catch (retryError) {
        if (isTimeoutError(retryError)) {
          return (
            `The tool ${name}:${toolName} timed out after restart too (${Math.round(timeoutMs / 1000)}s). ` +
            `Do not retry immediately - check the MCP server status in Admin → Agents → MCP Servers.`
          );
        }
        throw retryError;
      }
      introspect(`MCP server: ${name}:${toolName} recovered after restart.`);
    }

    return projectMCPResult(name, toolName, result);
  }

  /**
   * Restart one MCP server for the retry path: prune + start, returning
   * whether the server is back. Never throws - callers fall back to the
   * original error when restart fails.
   * @param {string} name - MCP server name
   * @returns {Promise<boolean>} True when the server restarted.
   */
  async restartMCPServerForRetry(name) {
    try {
      this.pruneMCPServer(name);
      const started = await this.startMCPServer(name);
      return started?.success === true && !!this.mcps[name];
    } catch (error) {
      this.log(`MCP auto-restart for ${name} failed:`, error?.message);
      return false;
    }
  }
  /**
   * Returns the MCP servers that were loaded or attempted to be loaded
   * so that we can display them in the frontend for review or error logging.
   * @returns {Promise<{
   *   name: string,
   *   running: boolean,
   *   tools: {name: string, description: string, inputSchema: Object}[],
   *   process: {pid: number, cmd: string}|null,
   *   error: string|null
   * }[]>} - The active MCP servers
   */
  async servers() {
    await this.bootMCPServers();
    const servers = [];
    for (const [name, result] of Object.entries(this.mcpLoadingResults)) {
      const config = this.mcpServerConfigs.find((s) => s.name === name);

      if (result.status === "failed") {
        servers.push({
          name,
          config: config?.server || null,
          running: false,
          tools: [],
          error: result.message,
          process: null,
        });
        continue;
      }

      const mcp = this.mcps[name];
      if (!mcp) {
        delete this.mcpLoadingResults[name];
        delete this.mcps[name];
        continue;
      }

      // ping() and listTools() can throw - e.g. when a tool's outputSchema
      // contains a $ref the MCP SDK cannot resolve. If we let that bubble up
      // it crashes the entire list, so a single bad server would hide every
      // other server. Keep the server visible with its error instead.
      try {
        const online = !!(await mcp.ping());
        const tools = (online ? (await mcp.listTools()).tools : []).filter(
          (tool) => !tool.name.startsWith("handle_mcp_connection_mcp_")
        );
        servers.push({
          name,
          config: config?.server || null,
          running: online,
          tools,
          error: null,
          process: {
            pid: mcp.transport?.process?.pid || null,
          },
        });
      } catch (error) {
        this.log(`Failed to list tools for MCP server ${name}:`, error);
        servers.push({
          name,
          config: config?.server || null,
          running: false,
          tools: [],
          error: error?.message || "Failed to load tools for this MCP server.",
          process: null,
        });
      }
    }
    return servers;
  }

  /**
   * Toggle the MCP server (start or stop)
   * @param {string} name - The name of the MCP server to toggle
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async toggleServerStatus(name) {
    const server = this.mcpServerConfigs.find((s) => s.name === name);
    if (!server)
      return {
        success: false,
        error: `MCP server ${name} not found in config file.`,
      };
    const mcp = this.mcps[name];
    const online = !!mcp ? !!(await mcp.ping()) : false; // If the server is not in the mcps object, it is not running

    if (online) {
      const killed = this.pruneMCPServer(name);
      return {
        success: killed,
        error: killed ? null : `Failed to kill MCP server: ${name}`,
      };
    } else {
      const startupResult = await this.startMCPServer(name);
      return { success: startupResult.success, error: startupResult.error };
    }
  }

  /**
   * Create a new MCP server definition and start it.
   * Fails when a server with the same name already exists.
   * @param {string} name - The name of the MCP server
   * @param {Object} definition - The raw server definition from the caller
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async createServer(name, definition) {
    if (this.mcps[name] || this.mcpServerConfigs.some((s) => s.name === name))
      return {
        success: false,
        error: `MCP server ${name} already exists.`,
      };
    return this.writeAndStartServer(name, definition);
  }

  /**
   * Update an existing MCP server definition and restart it so the new
   * definition takes effect immediately. Fails when the server does not exist.
   * @param {string} name - The name of the MCP server
   * @param {Object} definition - The raw server definition from the caller
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async updateServer(name, definition) {
    if (!this.mcpServerConfigs.some((s) => s.name === name))
      return {
        success: false,
        error: `MCP server ${name} not found in config file.`,
      };
    return this.writeAndStartServer(name, definition);
  }

  /**
   * Validate, persist, and (re)start a single MCP server.
   * Validation failures are returned, not thrown, so endpoints can surface them.
   * Kept as a plain method (not #private): this class implements the singleton
   * pattern by returning a cached instance from super(), and private methods
   * on the subclass would be re-installed on the same object and throw.
   * @param {string} name - The name of the MCP server
   * @param {Object} definition - The raw server definition from the caller
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async writeAndStartServer(name, definition) {
    let server;
    try {
      server = this.validateMCPServerDefinition(name, definition);
    } catch (error) {
      return { success: false, error: error.message };
    }

    if (this.mcps[name]) this.pruneMCPServer(name);
    this.upsertMCPServerToConfig(name, server);

    const startResult = await this.startMCPServer(name);
    return { success: startResult.success, error: startResult.error ?? null };
  }

  /**
   * Delete the MCP server - will also remove it from the config file
   * @param {string} name - The name of the MCP server to delete
   * @returns {Promise<{success: boolean, error: string | null}>}
   */
  async deleteServer(name) {
    const server = this.mcpServerConfigs.find((s) => s.name === name);
    if (!server)
      return {
        success: false,
        error: `MCP server ${name} not found in config file.`,
      };

    const mcp = this.mcps[name];
    const online = !!mcp ? !!(await mcp.ping()) : false; // If the server is not in the mcps object, it is not running
    if (online) this.pruneMCPServer(name);
    this.removeMCPServerFromConfig(name);

    delete this.mcps[name];
    delete this.mcpLoadingResults[name];
    this.log(`MCP server was killed and removed from config file: ${name}`);
    return { success: true, error: null };
  }

  /**
   * Return the result of an MCP server call as a string
   * This will handle circular references and bigints since an MCP server can return any type of data.
   * @param {Object} result - The result to return
   * @returns {string} The result as a string
   */
  static returnMCPResult(result) {
    if (typeof result !== "object" || result === null) return String(result);

    const seen = new WeakSet();
    try {
      return JSON.stringify(result, (key, value) => {
        if (typeof value === "bigint") return value.toString();
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      });
    } catch (e) {
      return `[Unserializable: ${e.message}]`;
    }
  }

  /**
   * Toggle tool suppression for an MCP server
   * @param {string} serverName - The name of the MCP server
   * @param {string} toolName - The name of the tool to toggle
   * @param {boolean} enabled - Whether the tool should be enabled (true) or suppressed (false)
   * @returns {Promise<{success: boolean, error: string | null, suppressedTools: string[]}>}
   */
  async toggleToolSuppression(serverName, toolName, enabled) {
    return this.updateSuppressedTools(serverName, toolName, enabled);
  }
}

// Test hooks (plain statics so the singleton shape is untouched).
MCPCompatibilityLayer.mcpToolTimeoutMs = mcpToolTimeoutMs;
MCPCompatibilityLayer.clampMcpTimeout = clampMcpTimeout;
MCPCompatibilityLayer.MCP_TOOL_TIMEOUT_SETTING_KEY =
  MCP_TOOL_TIMEOUT_SETTING_KEY;
MCPCompatibilityLayer.DEFAULT_MCP_TOOL_TIMEOUT_MS = DEFAULT_MCP_TOOL_TIMEOUT_MS;
MCPCompatibilityLayer.MCP_RESULT_INLINE_CHARS = MCP_RESULT_INLINE_CHARS;
module.exports = MCPCompatibilityLayer;
