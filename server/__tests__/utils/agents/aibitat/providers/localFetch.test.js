/**
 * Tests for the provider fetch wrapper: local-host detection and the
 * no-keep-alive fetch behavior that prevents ECONNRESET "socket hang up"
 * against local inference servers that close idle pooled connections.
 */
const http = require("http");
const {
  fetchNoKeepAlive,
  fetchForBaseURL,
  isLocalishBaseURL,
} = require("../../../../../utils/agents/aibitat/providers/helpers/localFetch");

describe("localFetch provider helper", () => {
  describe("isLocalishBaseURL", () => {
    it.each([
      ["http://127.0.0.1:8080/v1", true],
      ["http://localhost:3001/v1", true],
      ["http://10.0.0.5:8000/v1", true],
      ["http://172.16.4.20:11434/v1", true],
      ["http://192.168.1.10:1234/v1", true],
      ["http://169.254.1.2/v1", true],
      ["https://api.openai.com/v1", false],
      ["https://openrouter.ai/api/v1", false],
      ["not a url", false],
    ])("%s -> %s", (url, expected) => {
      expect(isLocalishBaseURL(url)).toBe(expected);
    });
  });

  describe("fetchForBaseURL", () => {
    it("returns the no-keep-alive fetch for local hosts and the default otherwise", () => {
      expect(fetchForBaseURL("http://127.0.0.1:8080/v1")).toBe(fetchNoKeepAlive);
      expect(fetchForBaseURL("https://api.openai.com/v1")).not.toBe(
        fetchNoKeepAlive
      );
    });
  });

  describe("fetchNoKeepAlive", () => {
    let server;
    const connections = new Set();

    beforeAll((done) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("pong");
      });
      // Simulate a local inference server that drops idle keep-alive sockets
      // almost immediately after a response completes.
      server.keepAliveTimeout = 30;
      server.on("connection", (socket) => {
        connections.add(socket);
        socket.on("close", () => connections.delete(socket));
      });
      server.listen(0, "127.0.0.1", done);
    });

    afterAll((done) => {
      server.close(done);
    });

    it("survives sequential requests separated by a delay that closes pooled sockets", async () => {
      const { port } = server.address();
      const url = `http://127.0.0.1:${port}/v1/ping`;
      for (let i = 0; i < 3; i++) {
        // Long enough for the server's 30ms keep-alive timeout to fire and
        // close the connection - a pooled agent would race on the dead socket.
        await new Promise((r) => setTimeout(r, 120));
        const res = await fetchNoKeepAlive(url, { method: "GET" });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("pong");
      }
    }, 15_000);
  });
});
