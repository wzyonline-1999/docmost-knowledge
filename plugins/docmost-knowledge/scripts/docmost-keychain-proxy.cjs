#!/usr/bin/env node
"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const DEFAULT_CONFIG_PATH = path.join(
  os.homedir(),
  ".config",
  "docmost-knowledge",
  "config.json",
);
const REQUEST_TIMEOUT_MS = 30_000;
const SERVER_VERSION = "0.1.0";

const ErrorCode = Object.freeze({
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
});

let remoteRequestId = 0;

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readConfigFile(
  configPath,
  readFile = fs.readFileSync,
) {
  let source;
  try {
    source = readFile(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw new Error("Unable to read the Docmost Knowledge config file");
  }

  let config;
  try {
    config = JSON.parse(source);
  } catch {
    throw new Error("Docmost Knowledge config file is not valid JSON");
  }
  if (!isObject(config)) {
    throw new Error("Docmost Knowledge config file must contain an object");
  }
  return config;
}

function getConfig(env = process.env, readFile = fs.readFileSync) {
  const configPath = env.DOCMOST_CONFIG_FILE || DEFAULT_CONFIG_PATH;
  const fileConfig = readConfigFile(configPath, readFile);
  const remoteUrlValue = env.DOCMOST_MCP_URL || fileConfig.mcpUrl;
  if (typeof remoteUrlValue !== "string" || !remoteUrlValue.trim()) {
    throw new Error(
      "Set DOCMOST_MCP_URL or mcpUrl in the Docmost Knowledge config file",
    );
  }

  let remoteUrl;
  try {
    remoteUrl = new URL(remoteUrlValue);
  } catch {
    throw new Error("Docmost MCP URL is invalid");
  }
  if (
    remoteUrl.protocol !== "https:" ||
    remoteUrl.username ||
    remoteUrl.password ||
    remoteUrl.hash
  ) {
    throw new Error("Docmost MCP URL must be a credential-free HTTPS URL");
  }

  return {
    remoteUrl: remoteUrl.toString(),
    keychainService: env.DOCMOST_KEYCHAIN_SERVICE || fileConfig.keychainService,
    keychainAccount: env.DOCMOST_KEYCHAIN_ACCOUNT || fileConfig.keychainAccount,
  };
}

function readTokenFromKeychain(config, exec = execFileSync) {
  let token;
  try {
    token = exec(
      "/usr/bin/security",
      [
        "find-generic-password",
        "-w",
        "-s",
        config.keychainService,
        "-a",
        config.keychainAccount,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    throw new Error("Docmost MCP token is unavailable in macOS Keychain");
  }

  if (token.length < 20) {
    throw new Error("Docmost MCP token in macOS Keychain is invalid");
  }
  return token;
}

function resolveToken(
  config,
  env = process.env,
  exec = execFileSync,
) {
  const environmentToken = env.DOCMOST_MCP_TOKEN?.trim();
  if (environmentToken) {
    if (environmentToken.length < 20) {
      throw new Error("DOCMOST_MCP_TOKEN is invalid");
    }
    return environmentToken;
  }

  if (!config.keychainService || !config.keychainAccount) {
    throw new Error(
      "Set DOCMOST_MCP_TOKEN or configure keychainService and keychainAccount",
    );
  }
  return readTokenFromKeychain(config, exec);
}

async function callRemote(
  config,
  token,
  method,
  params,
  fetchImpl = globalThis.fetch,
) {
  let response;
  try {
    response = await fetchImpl(config.remoteUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": `docmost-knowledge-codex-plugin/${SERVER_VERSION}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `docmost-plugin-${process.pid}-${++remoteRequestId}`,
        method,
        ...(params === undefined ? {} : { params }),
      }),
    });
  } catch {
    throw new RpcError(
      ErrorCode.InternalError,
      "Docmost MCP transport request failed",
    );
  }

  if (!response.ok) {
    const message =
      response.status === 401 || response.status === 403
        ? "Docmost MCP authentication or authorization failed"
        : `Docmost MCP returned HTTP ${response.status}`;
    throw new RpcError(ErrorCode.InternalError, message);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new RpcError(
      ErrorCode.InternalError,
      "Docmost MCP returned an invalid JSON response",
    );
  }

  if (isObject(payload.error)) {
    const code = Number.isInteger(payload.error.code)
      ? payload.error.code
      : ErrorCode.InternalError;
    const message =
      typeof payload.error.message === "string"
        ? payload.error.message.slice(0, 500)
        : "Docmost MCP request failed";
    throw new RpcError(code, message);
  }
  if (!isObject(payload.result)) {
    throw new RpcError(
      ErrorCode.InternalError,
      "Docmost MCP response is missing a result",
    );
  }
  return payload.result;
}

async function dispatchRequest(message, forward) {
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    throw new RpcError(ErrorCode.InvalidRequest, "Invalid JSON-RPC request");
  }

  if (typeof message.method !== "string" || !message.method) {
    throw new RpcError(ErrorCode.InvalidRequest, "Request method is required");
  }

  if (!Object.prototype.hasOwnProperty.call(message, "id")) {
    return null;
  }

  switch (message.method) {
    case "initialize": {
      const requestedVersion = message.params?.protocolVersion;
      return {
        protocolVersion:
          typeof requestedVersion === "string"
            ? requestedVersion
            : "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "docmost-knowledge",
          version: SERVER_VERSION,
        },
        instructions:
          "Use Docmost tools according to the docmost-knowledge skill and server-side space permissions.",
      };
    }
    case "ping":
      return {};
    case "tools/list": {
      const result = await forward("tools/list", message.params);
      if (!Array.isArray(result.tools)) {
        throw new RpcError(
          ErrorCode.InternalError,
          "Docmost MCP tools/list returned no tools",
        );
      }
      return result;
    }
    case "tools/call": {
      if (
        !isObject(message.params) ||
        typeof message.params.name !== "string" ||
        !message.params.name ||
        (message.params.arguments !== undefined &&
          !isObject(message.params.arguments))
      ) {
        throw new RpcError(ErrorCode.InvalidParams, "Invalid tool call");
      }
      return forward("tools/call", message.params);
    }
    default:
      throw new RpcError(
        ErrorCode.MethodNotFound,
        `Unsupported MCP method: ${message.method}`,
      );
  }
}

function serializeSuccess(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function serializeError(id, error) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: error instanceof RpcError ? error.code : ErrorCode.InternalError,
      message:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Docmost MCP request failed",
    },
  };
}

async function handleLine(line, forward) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return serializeError(
      null,
      new RpcError(ErrorCode.ParseError, "Invalid JSON"),
    );
  }

  const id = isObject(message) && "id" in message ? message.id : null;
  try {
    const result = await dispatchRequest(message, forward);
    return result === null ? null : serializeSuccess(id, result);
  } catch (error) {
    return serializeError(id, error);
  }
}

async function main() {
  const config = getConfig();
  const token = resolveToken(config);
  const forward = (method, params) =>
    callRemote(config, token, method, params);
  const input = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  for await (const line of input) {
    if (!line.trim()) continue;
    const response = await handleLine(line, forward);
    if (response !== null) {
      process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    const name = error instanceof Error ? error.name : "Error";
    process.stderr.write(`Docmost MCP proxy failed (${name})\n`);
    process.exitCode = 1;
  });
} else {
  module.exports = {
    ErrorCode,
    RpcError,
    callRemote,
    dispatchRequest,
    getConfig,
    handleLine,
    readConfigFile,
    readTokenFromKeychain,
    resolveToken,
    serializeError,
    serializeSuccess,
  };
}
