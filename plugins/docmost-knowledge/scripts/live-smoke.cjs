#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

const proxyPath = path.join(__dirname, "docmost-keychain-proxy.cjs");
const child = spawn(process.execPath, [proxyPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
let completed = false;

function finish(error) {
  if (completed) return;
  completed = true;
  clearTimeout(timeout);
  child.kill();
  if (error) {
    process.stderr.write(
      `Docmost MCP live smoke failed${stderr.trim() ? `: ${stderr.trim()}` : ""}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const responses = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const initialized = responses.find((response) => response.id === 1);
  const listed = responses.find((response) => response.id === 2);
  if (
    initialized?.result?.serverInfo?.name !== "docmost-knowledge" ||
    !Array.isArray(listed?.result?.tools) ||
    listed.result.tools.length === 0
  ) {
    process.stderr.write("Docmost MCP live smoke returned invalid responses\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Docmost MCP live smoke passed: ${listed.result.tools.length} tools available.\n`,
  );
}

const timeout = setTimeout(
  () => finish(new Error("timeout")),
  45_000,
);

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
  if ((stdout.match(/\n/g) || []).length >= 2) {
    finish();
  }
});
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
child.on("error", finish);
child.on("exit", (code) => {
  if (!completed && code !== 0) {
    finish(new Error(`proxy exited with ${code}`));
  }
});

child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {} },
  })}\n`,
);
child.stdin.write(
  `${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  })}\n`,
);
