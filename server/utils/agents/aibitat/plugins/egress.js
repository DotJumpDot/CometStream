/**
 * Agent-side egress guard for server-side URL fetches that carry a
 * model-supplied URL (notably web scraping). The collector's own URL check
 * deliberately allows loopback for local-dev convenience and only inspects
 * IPv4 first octets - fine for user-pasted links, but the agent path lets a
 * prompt-injected model pick the URL, so the check here is stricter and runs
 * before any network round-trip with a model-actionable error.
 *
 * Policy (mirrors production harness practice):
 * - Only http/https.
 * - `localhost` and `*.localhost` hostnames are blocked.
 * - IP literals must be public unicast. IPv4-mapped IPv6 (`::ffff:1.2.3.4`)
 *   is unwrapped and judged as IPv4.
 * - Loopback carve-out: exactly `127.0.0.1` and `0.0.0.0` stay allowed so
 *   local harness self-tests (dev servers on 127.0.0.1) keep working - the
 *   same carve-out the collector already grants. Every other loopback,
 *   private, link-local, or reserved address is blocked.
 * - Hostnames that are not IP literals pass (no DNS preflight: slow on some
 *   networks and TOCTOU-prone).
 *
 * No new dependencies: Node's `net.isIP` classifies literals.
 */
const net = require("net");

const ALLOWED_LOOPBACK = new Set(["127.0.0.1", "0.0.0.0"]);

/**
 * Whether an IPv4 octet array is public unicast.
 * @param {number[]} bytes - 4 octets.
 * @returns {boolean}
 */
function isPublicIpv4(bytes) {
  const [a, b] = bytes;
  if (a === 10) return false; // 10/8 private
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12 private
  if (a === 192 && b === 168) return false; // 192.168/16 private
  if (a === 127) return false; // 127/8 loopback
  if (a === 169 && b === 254) return false; // 169.254/16 link-local
  if (a === 0) return false; // 0/8 "this network"
  if (a >= 224) return false; // 224+ multicast/reserved
  if (a === 192 && b === 88 && bytes[2] === 99) return false; // 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmark testing
  if (a === 192 && b === 0 && (bytes[2] === 0 || bytes[2] === 2)) return false; // IETF protocol assignments
  return true;
}

/**
 * Whether an IPv6 string (lowercased, unbracketed) is public unicast.
 * Handles ::1, unspecified, link-local, unique-local, mapped, and
 * documentation ranges without a dependency.
 * @param {string} host - Normalized hostname.
 * @returns {boolean}
 */
function isPublicIpv6(host) {
  if (host === "::" || host === "::1") return false;
  if (/^fe[89ab][0-9a-f]/i.test(host.split(":")[0] ?? "")) {
    // fe80::/10 link-local - first hextet fe80..febf.
    const first = parseInt(host.split(":")[0], 16);
    if (first >= 0xfe80 && first <= 0xfebf) return false;
  }
  const first = host.split(":")[0].toLowerCase();
  if (first.startsWith("fc") || first.startsWith("fd")) return false; // fc00::/7 unique-local
  if (first === "ff" || host.startsWith("ff")) return false; // ff00::/8 multicast
  if (host.startsWith("2001:db8") || host.startsWith("2001:0db8")) return false; // documentation
  if (host.startsWith("64:ff9b:")) return false; // NAT64 well-known prefix encodes IPv4 - refuse, don't unwrap.
  return true;
}

/**
 * Normalizes a URL hostname for comparison: lowercase, strip brackets and a
 * single trailing dot.
 * @param {string} hostname
 * @returns {string}
 */
function normalizeHostname(hostname) {
  let out = String(hostname ?? "")
    .trim()
    .toLowerCase();
  if (out.startsWith("[") && out.endsWith("]")) out = out.slice(1, -1);
  if (out.endsWith(".")) out = out.slice(0, -1);
  return out;
}

/**
 * Classifies a URL string without throwing.
 * @param {string} rawUrl
 * @returns {{ok: boolean, reason?: string}} ok with no reason when allowed.
 */
function checkEgress(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl ?? ""));
  } catch {
    return { ok: false, reason: `Not a valid URL: ${rawUrl}` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: `Only http/https URLs may be fetched (got ${url.protocol})`,
    };
  }
  const host = normalizeHostname(url.hostname);
  if (!host) return { ok: false, reason: "URL has no hostname" };
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: `Local hostnames may not be fetched: ${host}` };
  }
  if (ALLOWED_LOOPBACK.has(host)) return { ok: true };
  const family = net.isIP(host);
  if (family === 4) {
    const bytes = host.split(".").map(Number);
    if (!isPublicIpv4(bytes)) {
      return {
        ok: false,
        reason: `Private/reserved IP addresses may not be fetched: ${host}`,
      };
    }
    return { ok: true };
  }
  if (family === 6) {
    // IPv4-mapped IPv6 carries a literal IPv4 tail - judge it as IPv4. The
    // URL parser normalizes the dotted tail to hex (::ffff:c0a8:101), so
    // both spellings are recognized.
    const mappedDotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    const mappedHex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    const mappedBytes = mappedDotted
      ? mappedDotted[1].split(".").map(Number)
      : mappedHex
        ? (() => {
            const n =
              (parseInt(mappedHex[1], 16) << 16) | parseInt(mappedHex[2], 16);
            return [
              (n >>> 24) & 255,
              (n >>> 16) & 255,
              (n >>> 8) & 255,
              n & 255,
            ];
          })()
        : null;
    if (mappedBytes) {
      if (
        mappedBytes.join(".") === "127.0.0.1" ||
        mappedBytes.join(".") === "0.0.0.0"
      )
        return { ok: true };
      if (!isPublicIpv4(mappedBytes)) {
        return {
          ok: false,
          reason: `Private/reserved IP addresses may not be fetched: ${host}`,
        };
      }
      return { ok: true };
    }
    if (!isPublicIpv6(host)) {
      return {
        ok: false,
        reason: `Private/reserved IP addresses may not be fetched: ${host}`,
      };
    }
    return { ok: true };
  }
  return { ok: true }; // Ordinary hostname - no DNS preflight by design.
}

/**
 * Throws a model-actionable error when the URL must not be fetched.
 * @param {string} rawUrl
 * @throws {Error} When egress is blocked.
 */
function assertPublicEgress(rawUrl) {
  const verdict = checkEgress(rawUrl);
  if (!verdict.ok) {
    throw new Error(
      `URL blocked by the egress guard: ${verdict.reason}. Ask the user for a public URL if you need one.`
    );
  }
}

module.exports = {
  checkEgress,
  assertPublicEgress,
  normalizeHostname,
  ALLOWED_LOOPBACK,
};
