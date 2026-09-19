const dns = require("dns").promises;
const net = require("net");

/**
 * SSRF guard for server-side requests to user-supplied URLs (e.g. fetching
 * the model list from a custom OpenAI-compatible provider base URL).
 *
 * Policy (applies to every outbound request built from user input):
 * - Only http/https schemes are allowed.
 * - Before the request is sent the host is validated and localhost,
 *   loopback, private, and reserved addresses are rejected - both when the
 *   host is a literal IP and after DNS resolution, so a name that resolves
 *   into a private network is refused too.
 */

/** Hostname labels that mark the local machine or internal networks. */
const BLOCKED_HOSTNAME_LABELS = [
  "localhost",
  "local",
  "internal",
  "intranet",
  "ip6-localhost",
  "ip6-loopback",
];

/** @param {string} ip - IPv4 or IPv6 literal */
function isDisallowedIp(ip) {
  // IPv6: unique-local fc00::/7, link-local fe80::/10, loopback ::1,
  // unspecified ::, and IPv4-mapped/bridged forms of those.
  if (net.isIPv6(ip)) {
    const groups = ip.toLowerCase().replace(/^::ffff:/, ""); // v4-mapped
    if (net.isIPv4(groups)) return isDisallowedIp(groups);
    if (groups === "::1" || groups === "::") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(groups)) return true; // fc00::/7
    if (/^fe[89ab][0-9a-f]:/.test(groups)) return true; // fe80::/10
    if (/^ff[0-9a-f]{2}:/.test(groups)) return true; // multicast
    return false;
  }

  if (!net.isIPv4(ip)) return true; // not a parseable address - refuse
  const [a, b] = ip.split(".").map(Number);
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 0) return true; // reserved "this network"
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // reserved (192.0.0.0/24, 192.0.2.0/24)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** @param {string} hostname */
function isBlockedHostname(hostname) {
  // WHATWG URLs keep brackets on IPv6 literals - strip them for checking.
  const host = String(hostname)
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
  if (!host) return true;
  // Block when any dot-separated label is an internal marker (covers
  // "localhost", "api.internal.company.com", "db.local", ...).
  if (host.split(".").some((label) => BLOCKED_HOSTNAME_LABELS.includes(label)))
    return true;
  if (net.isIP(host)) return isDisallowedIp(host);
  return false;
}

/**
 * Validate a URL before the server requests it. Throws a descriptive Error
 * when the URL is not safe to fetch; resolves the checked URL otherwise.
 * @param {string} urlString - The URL to validate
 * @returns {Promise<URL>} the parsed, validated URL
 */
async function assertSafeRemoteUrl(urlString) {
  let url;
  try {
    url = new URL(String(urlString));
  } catch {
    throw new Error("Invalid URL.");
  }

  // Only plain web requests are allowed - no file:, ftp:, etc.
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only http and https URLs are allowed.");

  if (isBlockedHostname(url.hostname))
    throw new Error(
      "Requests to localhost, loopback, private, or reserved addresses are not allowed."
    );

  // Resolve and check every address the name points at so a public-looking
  // hostname cannot be used to reach an internal network. Skip literal IPs,
  // which isBlockedHostname already checked.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!net.isIP(hostname)) {
    try {
      const records = await dns.lookup(hostname, { all: true });
      if (records.length === 0)
        throw new Error("The URL host does not resolve to any address.");
      for (const { address } of records) {
        if (isDisallowedIp(address))
          throw new Error(
            "Requests to localhost, loopback, private, or reserved addresses are not allowed."
          );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Requests to"))
        throw error;
      throw new Error(`Could not resolve the URL host: ${hostname}`);
    }
  }

  return url;
}

module.exports = { assertSafeRemoteUrl };
