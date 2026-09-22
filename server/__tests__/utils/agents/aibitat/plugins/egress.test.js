/**
 * Tests for the agent-side egress guard: localhost/private/reserved targets
 * blocked, public hosts and the loopback dev carve-out allowed.
 */
const {
  checkEgress,
  assertPublicEgress,
  ALLOWED_LOOPBACK,
} = require("../../../../../utils/agents/aibitat/plugins/egress");

describe("egress guard", () => {
  it.each([
    ["https://example.com/docs"],
    ["http://example.com"],
    ["https://sub.domain.co.uk/path?q=1"],
    ["https://8.8.8.8/dns"],
    ["http://1.1.1.1"],
    ["http://172.15.0.1"],
    ["http://172.32.0.1"],
    ["http://[2606:4700:4700::1111]/"],
    // Ordinary hostnames pass with no DNS preflight by design (slow
    // networks, TOCTOU) - even ones that look tricky.
    ["http://0.0.0.0.evil.com/"],
  ])("allows %p", (url) => {
    expect(checkEgress(url)).toEqual({ ok: true });
  });

  it.each([
    ["http://127.0.0.1:4599/api/health"],
    ["http://0.0.0.0:3000/"],
  ])("allows the loopback dev carve-out %p", (url) => {
    expect(ALLOWED_LOOPBACK.has("127.0.0.1")).toBe(true);
    expect(checkEgress(url).ok).toBe(true);
  });

  it.each([
    ["http://localhost:3001/api"],
    ["http://LOCALHOST/"],
    ["http://localhost./trailing-dot"],
    ["http://foo.localhost/"],
    ["http://192.168.1.1/"],
    ["http://10.0.0.5/"],
    ["http://172.16.0.1/"],
    ["http://172.31.255.255/"],
    ["http://169.254.169.254/latest/meta-data/"],
    ["http://127.0.0.2/"],
    ["http://[::1]/"],
    ["http://[::]/"],
    ["http://[fe80::1]/"],
    ["http://[fc00::1]/"],
    ["http://[fd00::1]/"],
    ["http://[ff02::1]/"],
    ["http://[2001:db8::1]/"],
    ["http://[::ffff:192.168.1.1]/"],
    ["http://[::ffff:127.0.0.2]/"],
    ["ftp://example.com/file"],
    ["file:///etc/passwd"],
    ["not a url"],
    [""],
  ])("blocks %p", (url) => {
    const verdict = checkEgress(url);
    expect(verdict.ok).toBe(false);
    expect(typeof verdict.reason).toBe("string");
  });

  it("assertPublicEgress throws a model-actionable error", () => {
    expect(() => assertPublicEgress("http://169.254.169.254/")).toThrow(
      /egress guard/
    );
    expect(() => assertPublicEgress("https://example.com")).not.toThrow();
  });
});
