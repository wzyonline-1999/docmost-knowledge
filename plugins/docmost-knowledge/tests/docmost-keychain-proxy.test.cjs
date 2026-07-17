"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ErrorCode,
  callRemote,
  dispatchRequest,
  getConfig,
  handleLine,
  readConfigFile,
  readTokenFromKeychain,
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
    remoteUrl: "https://docs.example.com/mcp",
    keychainService: "Docmost MCP",
    keychainAccount: "user@example.com",
  });
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
  assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
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

  await assert.rejects(
    callRemote(
      { remoteUrl: "https://docs.example.com/mcp" },
      "secret-token-value-for-tests",
      "tools/list",
      {},
      async () => ({ ok: false, status: 401 }),
    ),
    (error) =>
      error.message === "Docmost MCP authentication or authorization failed" &&
      !error.message.includes("secret-token-value-for-tests"),
  );
});
