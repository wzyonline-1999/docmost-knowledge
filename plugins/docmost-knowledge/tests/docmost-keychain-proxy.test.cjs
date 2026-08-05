"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ErrorCode,
  callRemote,
  dispatchRequest,
  getConfig,
  handleLine,
  parseIntegerSetting,
  readConfigFile,
  readTokenFromKeychain,
  resolveProfile,
  resolveToken,
} = require("../scripts/docmost-keychain-proxy.cjs");

function missingConfigFile() {
  const error = new Error("missing");
  error.code = "ENOENT";
  throw error;
}

test("getConfig accepts only credential-free HTTPS URLs", () => {
  assert.equal(
    getConfig(
      { DOCMOST_MCP_URL: "https://docs.example.com/mcp" },
      missingConfigFile,
    ).remoteUrl,
    "https://docs.example.com/mcp",
  );
  assert.throws(
    () =>
      getConfig(
        { DOCMOST_MCP_URL: "http://docs.example.com/mcp" },
        missingConfigFile,
      ),
    /HTTPS/,
  );
  assert.throws(
    () =>
      getConfig(
        { DOCMOST_MCP_URL: "https://user@example.com/mcp" },
        missingConfigFile,
      ),
    /credential-free/,
  );
  assert.throws(
    () => getConfig({}, missingConfigFile),
    /DOCMOST_MCP_URL/,
  );
  assert.throws(
    () =>
      getConfig(
        { DOCMOST_MCP_URL: "https://docs.example.com/mcp?token=secret" },
        missingConfigFile,
      ),
    /without query or fragment/,
  );
});

test("getConfig reads non-secret settings from the config file", () => {
  const config = getConfig(
    { DOCMOST_CONFIG_FILE: "/tmp/docmost-config.json" },
    () =>
      JSON.stringify({
        mcpUrl: "https://docs.example.com/mcp",
        keychainService: "Docmost MCP",
        keychainAccount: "user@example.com",
      }),
  );

  assert.deepEqual(config, {
    profileName: "default",
    remoteUrl: "https://docs.example.com/mcp",
    keychainService: "Docmost MCP",
    keychainAccount: "user@example.com",
    requestTimeoutMs: 90_000,
    maxReadRetries: 1,
    retryDelayMs: 250,
  });
});

test("getConfig selects a profile and applies shared and environment settings", () => {
  const config = getConfig(
    {
      DOCMOST_CONFIG_FILE: "/tmp/docmost-config.json",
      DOCMOST_PROFILE: "company-test",
      DOCMOST_REQUEST_TIMEOUT_MS: "120000",
    },
    () =>
      JSON.stringify({
        defaultProfile: "personal",
        maxReadRetries: 2,
        profiles: {
          personal: {
            mcpUrl: "https://docs.example.com/mcp",
            keychainService: "Docmost Personal",
            keychainAccount: "user@example.com",
          },
          "company-test": {
            mcpUrl: "https://docs.test.example.com/mcp",
            keychainService: "Docmost Company Test",
            keychainAccount: "user@example.com",
          },
        },
      }),
  );

  assert.deepEqual(config, {
    profileName: "company-test",
    remoteUrl: "https://docs.test.example.com/mcp",
    keychainService: "Docmost Company Test",
    keychainAccount: "user@example.com",
    requestTimeoutMs: 120_000,
    maxReadRetries: 2,
    retryDelayMs: 250,
  });
});

test("resolveProfile requires an explicit selection for multiple profiles", () => {
  assert.throws(
    () =>
      resolveProfile(
        {
          profiles: {
            personal: { mcpUrl: "https://docs.example.com/mcp" },
            company: { mcpUrl: "https://docs.company.example.com/mcp" },
          },
        },
        {},
      ),
    /DOCMOST_PROFILE or defaultProfile/,
  );
});

test("getConfig rejects bearer tokens stored in JSON", () => {
  assert.throws(
    () =>
      getConfig(
        { DOCMOST_CONFIG_FILE: "/tmp/docmost-config.json" },
        () =>
          JSON.stringify({
            mcpUrl: "https://docs.example.com/mcp",
            token: "must-not-be-stored-here",
          }),
      ),
    /Do not store bearer tokens/,
  );
  assert.throws(
    () =>
      getConfig(
        {
          DOCMOST_CONFIG_FILE: "/tmp/docmost-config.json",
          DOCMOST_PROFILE: "personal",
        },
        () =>
          JSON.stringify({
            profiles: {
              personal: {
                mcpUrl: "https://docs.example.com/mcp",
              },
              company: {
                mcpUrl: "https://docs.company.example.com/mcp",
                bearerToken: "must-not-be-stored-in-another-profile",
              },
            },
          }),
      ),
    /Do not store bearer tokens/,
  );
});

test("parseIntegerSetting enforces operational limits", () => {
  assert.equal(parseIntegerSetting(undefined, "timeout", 10, 1, 20), 10);
  assert.equal(parseIntegerSetting("15", "timeout", 10, 1, 20), 15);
  assert.throws(
    () => parseIntegerSetting("21", "timeout", 10, 1, 20),
    /between 1 and 20/,
  );
  assert.throws(
    () => parseIntegerSetting("1.5", "timeout", 10, 1, 20),
    /integer/,
  );
});

test("readConfigFile rejects malformed configuration", () => {
  assert.throws(
    () => readConfigFile("/tmp/docmost-config.json", () => "not json"),
    /valid JSON/,
  );
  assert.throws(
    () => readConfigFile("/tmp/docmost-config.json", () => "[]"),
    /object/,
  );
});

test("readTokenFromKeychain uses configured service and account", () => {
  const calls = [];
  const token = readTokenFromKeychain(
    { keychainService: "service", keychainAccount: "account" },
    (...args) => {
      calls.push(args);
      return "a-secure-token-value-for-tests\n";
    },
  );

  assert.equal(token, "a-secure-token-value-for-tests");
  assert.deepEqual(calls[0][1], [
    "find-generic-password",
    "-w",
    "-s",
    "service",
    "-a",
    "account",
  ]);
});

test("resolveToken prefers the environment and falls back to Keychain", () => {
  assert.equal(
    resolveToken(
      {},
      { DOCMOST_MCP_TOKEN: "an-environment-token-for-tests" },
      () => assert.fail("Keychain should not be used"),
    ),
    "an-environment-token-for-tests",
  );

  assert.equal(
    resolveToken(
      { keychainService: "service", keychainAccount: "account" },
      {},
      () => "a-keychain-token-value-for-tests\n",
    ),
    "a-keychain-token-value-for-tests",
  );
});

test("initialize is handled locally", async () => {
  const result = await dispatchRequest(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    },
    () => assert.fail("initialize must not be forwarded"),
  );

  assert.equal(result.protocolVersion, "2025-11-25");
  assert.equal(result.serverInfo.name, "docmost-knowledge");
  assert.equal(result.serverInfo.version, "0.3.1");
  assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
});

test("initialize falls back to the proxy protocol for unknown versions", async () => {
  const result = await dispatchRequest(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-01-01" },
    },
    () => assert.fail("initialize must not be forwarded"),
  );

  assert.equal(result.protocolVersion, "2025-11-25");
});

test("notifications are ignored without forwarding", async () => {
  const result = await dispatchRequest(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    () => assert.fail("notifications must not be forwarded"),
  );
  assert.equal(result, null);
});

test("tools/list validates and returns the remote tool list", async () => {
  const calls = [];
  const result = await dispatchRequest(
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    async (...args) => {
      calls.push(args);
      return { tools: [{ name: "list_spaces" }] };
    },
  );

  assert.deepEqual(calls, [["tools/list", {}]]);
  assert.deepEqual(result.tools, [{ name: "list_spaces" }]);
});

test("tools/call rejects malformed arguments before forwarding", async () => {
  await assert.rejects(
    dispatchRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_page", arguments: [] },
      },
      () => assert.fail("invalid calls must not be forwarded"),
    ),
    (error) => error.code === ErrorCode.InvalidParams,
  );
});

test("handleLine returns a JSON-RPC parse error", async () => {
  const response = await handleLine("not json", () => undefined);
  assert.equal(response.id, null);
  assert.equal(response.error.code, ErrorCode.ParseError);
});

test("callRemote sends a bearer token without exposing it in errors", async () => {
  const requests = [];
  const result = await callRemote(
    { remoteUrl: "https://docs.example.com/mcp" },
    "secret-token-value-for-tests",
    "tools/list",
    {},
    async (...args) => {
      requests.push(args);
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { tools: [] } }),
      };
    },
  );

  assert.deepEqual(result, { tools: [] });
  assert.equal(requests[0][1].redirect, "error");
  assert.equal(
    requests[0][1].headers.Authorization,
    "Bearer secret-token-value-for-tests",
  );
  assert.equal(
    requests[0][1].headers["MCP-Protocol-Version"],
    "2025-06-18",
  );

  await assert.rejects(
    callRemote(
      { remoteUrl: "https://docs.example.com/mcp" },
      "secret-token-value-for-tests",
      "tools/list",
      {},
      async () => ({
        ok: false,
        status: 401,
        json: async () => {
          throw new Error("not json");
        },
      }),
    ),
    (error) =>
      error.message === "Docmost MCP authentication or authorization failed" &&
      !error.message.includes("secret-token-value-for-tests"),
  );
});

test("callRemote preserves safe JSON-RPC errors on non-2xx responses", async () => {
  await assert.rejects(
    callRemote(
      {
        remoteUrl: "https://docs.example.com/mcp",
        maxReadRetries: 0,
      },
      "secret-token-value-for-tests",
      "tools/list",
      {},
      async () => ({
        ok: false,
        status: 429,
        headers: { get: () => "8" },
        json: async () => ({
          error: {
            code: -32029,
            message: "MCP rate limit exceeded; retry after 8s",
          },
        }),
      }),
    ),
    (error) =>
      error.code === -32029 &&
      error.message === "MCP rate limit exceeded; retry after 8s",
  );
});

test("callRemote hides JSON error details for authentication failures", async () => {
  await assert.rejects(
    callRemote(
      {
        remoteUrl: "https://docs.example.com/mcp",
        maxReadRetries: 0,
      },
      "secret-token-value-for-tests",
      "tools/list",
      {},
      async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            code: -32001,
            message: "internal authentication detail",
          },
        }),
      }),
    ),
    (error) =>
      error.message === "Docmost MCP authentication or authorization failed",
  );
});

test("callRemote redacts credentials echoed by a remote error", async () => {
  const token = "secret-token-value-for-tests";
  await assert.rejects(
    callRemote(
      {
        remoteUrl: "https://docs.example.com/mcp",
        maxReadRetries: 0,
      },
      token,
      "tools/list",
      {},
      async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: -32602,
            message: `bad header Bearer ${token}`,
          },
        }),
      }),
    ),
    (error) =>
      error.message.includes("[redacted-token]") &&
      !error.message.includes(token),
  );

  await assert.rejects(
    callRemote(
      {
        remoteUrl: "https://docs.example.com/mcp",
        maxReadRetries: 0,
      },
      token,
      "tools/list",
      {},
      async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: -32602,
            message: `${"x".repeat(495)}${token}`,
          },
        }),
      }),
    ),
    (error) =>
      !error.message.includes(token) &&
      !error.message.endsWith(token.slice(0, 5)),
  );
});

test("callRemote retries a transient read failure once", async () => {
  const calls = [];
  const sleeps = [];
  const result = await callRemote(
    {
      remoteUrl: "https://docs.example.com/mcp",
      maxReadRetries: 1,
      retryDelayMs: 25,
    },
    "secret-token-value-for-tests",
    "tools/list",
    {},
    async () => {
      calls.push("fetch");
      if (calls.length === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => {
            throw new Error("not json");
          },
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ result: { tools: [] } }),
      };
    },
    async (delayMs) => sleeps.push(delayMs),
  );

  assert.deepEqual(result, { tools: [] });
  assert.equal(calls.length, 2);
  assert.deepEqual(sleeps, [25]);
});

test("callRemote never automatically retries a mutation", async () => {
  let calls = 0;
  await assert.rejects(
    callRemote(
      {
        remoteUrl: "https://docs.example.com/mcp",
        maxReadRetries: 3,
        retryDelayMs: 0,
      },
      "secret-token-value-for-tests",
      "tools/call",
      {
        name: "update_page",
        arguments: {
          pageId: "11111111-1111-4111-8111-111111111111",
          expectedUpdatedAt: "2026-07-28T00:00:00.000Z",
          idempotencyKey: "stable-key",
        },
      },
      async () => {
        calls += 1;
        return {
          ok: false,
          status: 503,
          json: async () => {
            throw new Error("not json");
          },
        };
      },
      async () => assert.fail("mutation retry delay must not run"),
    ),
    /HTTP 503/,
  );
  assert.equal(calls, 1);
});

test("callRemote does not retry after the request timeout is exhausted", async () => {
  let calls = 0;
  await assert.rejects(
    callRemote(
      {
        remoteUrl: "https://docs.example.com/mcp",
        requestTimeoutMs: 1,
        maxReadRetries: 3,
        retryDelayMs: 0,
      },
      "secret-token-value-for-tests",
      "tools/list",
      {},
      async (_url, options) => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        assert.equal(options.signal.aborted, true);
        throw new Error("timed out");
      },
      async () => assert.fail("timeout retry delay must not run"),
    ),
    /transport request failed/,
  );
  assert.equal(calls, 1);
});
