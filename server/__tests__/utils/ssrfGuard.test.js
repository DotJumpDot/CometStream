const dns = require("dns");
const {
  assertSafeRemoteUrl,
} = require("../../utils/ssrfGuard");

// Offline-safe: the guard DNS-resolves hostnames, so resolution is mocked
// (default: a public address; individual tests point it elsewhere).
const lookupSpy = jest
  .spyOn(dns.promises, "lookup")
  .mockImplementation(async () => [{ address: "93.184.216.34", family: 4 }]);

describe("ssrfGuard.assertSafeRemoteUrl", () => {
  it("accepts public http/https URLs", async () => {
    await expect(
      assertSafeRemoteUrl("https://api.example.com/v1")
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertSafeRemoteUrl("http://api.openai.com/v1")
    ).resolves.toBeInstanceOf(URL);
  });

  it("rejects non-http schemes", async () => {
    await expect(assertSafeRemoteUrl("file:///etc/passwd")).rejects.toThrow(
      "Only http and https"
    );
    await expect(assertSafeRemoteUrl("ftp://example.com")).rejects.toThrow(
      "Only http and https"
    );
  });

  it("rejects invalid URLs", async () => {
    await expect(assertSafeRemoteUrl("not-a-url")).rejects.toThrow(
      "Invalid URL."
    );
  });

  it("rejects a public hostname that resolves into a private network", async () => {
    lookupSpy.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    await expect(
      assertSafeRemoteUrl("https://evil-rebind.example.com/v1")
    ).rejects.toThrow("private, or reserved");
  });

  it("rejects localhost and internal hostnames", async () => {
    await expect(assertSafeRemoteUrl("http://localhost:8080/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(
      assertSafeRemoteUrl("http://api.internal.company.com/v1")
    ).rejects.toThrow("private, or reserved");
    await expect(assertSafeRemoteUrl("http://my-service.local/v1")).rejects.toThrow(
      "private, or reserved"
    );
  });

  it("rejects literal loopback, private, link-local, and reserved IPv4/IPv6", async () => {
    await expect(assertSafeRemoteUrl("http://127.0.0.1:1234/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(assertSafeRemoteUrl("http://10.1.2.3/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(assertSafeRemoteUrl("http://172.16.0.1/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(assertSafeRemoteUrl("http://192.168.1.10/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(assertSafeRemoteUrl("http://169.254.169.254/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(assertSafeRemoteUrl("http://[::1]/v1")).rejects.toThrow(
      "private, or reserved"
    );
    await expect(
      assertSafeRemoteUrl("http://[fd12:3456:789a:1::1]/v1")
    ).rejects.toThrow("private, or reserved");
  });
});
