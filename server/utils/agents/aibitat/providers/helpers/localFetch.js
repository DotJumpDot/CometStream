/**
 * Fetch wrapper for OpenAI-compatible providers.
 *
 * WHY THIS EXISTS: local inference servers (llama.cpp/llama-server, LM Studio,
 * koboldcpp…) close idle keep-alive connections aggressively between turns.
 * Agent runs interleave long streams with short tool-call round-trips, which is
 * exactly the race window where node-fetch v2 (the OpenAI SDK's Node shim)
 * dispatches the next request onto a socket the server has already FIN'd -
 * surfacing as `ECONNRESET / socket hang up` and killing the whole agent turn
 * with "The agent model failed to respond: Connection error."
 *
 * For local/private endpoints we therefore disable keep-alive entirely: a fresh
 * loopback TCP connection costs effectively nothing, and it removes the race.
 * Public cloud endpoints keep the default fetch (connection pooling matters
 * there), detected from the base URL's hostname.
 */
const nodeFetch = require("node-fetch");
const http = require("http");
const https = require("https");

const NO_KEEP_ALIVE_HTTP = new http.Agent({ keepAlive: false });
const NO_KEEP_ALIVE_HTTPS = new https.Agent({ keepAlive: false });

/**
 * Fetch that opens a brand-new connection per request (no socket pooling).
 * @param {string} url - Request URL.
 * @param {object} [init] - node-fetch request init.
 * @returns {Promise<import("node-fetch").Response>}
 */
function fetchNoKeepAlive(url, init = {}) {
  const agent = String(url).startsWith("https:")
    ? NO_KEEP_ALIVE_HTTPS
    : NO_KEEP_ALIVE_HTTP;
  return nodeFetch(url, { ...init, agent });
}

/**
 * True when the host points at the machine itself or a LAN address - the
 * endpoints served by local inference servers with short keep-alive timeouts.
 * @param {string} baseURL - Provider base URL.
 * @returns {boolean}
 */
function isLocalishBaseURL(baseURL) {
  let hostname = "";
  try {
    hostname = new URL(baseURL).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]")
    return true;
  if (hostname === "127.0.0.1" || hostname === "0.0.0.0") return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length === 4 && parts.every((p) => Number.isInteger(p))) {
    const [a, b] = parts;
    if (a === 10 || a === 192) return true; // 10.0.0.0/8, 192.0.0.0/8 (incl. 192.168)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 169 && b === 254) return true; // link-local
  }
  return false;
}

/**
 * Returns the fetch implementation a provider should use for a base URL:
 * no-keep-alive for local/private hosts, the global default otherwise.
 * @param {string} baseURL - Provider base URL.
 * @returns {typeof fetch}
 */
function fetchForBaseURL(baseURL) {
  return isLocalishBaseURL(baseURL) ? fetchNoKeepAlive : nodeFetch;
}

module.exports = {
  fetchNoKeepAlive,
  fetchForBaseURL,
  isLocalishBaseURL,
};
