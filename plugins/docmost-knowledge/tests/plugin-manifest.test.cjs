"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pluginRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(pluginRoot, relativePath), "utf8"),
  );
}

test("plugin and package versions stay aligned", () => {
  const manifest = readJson(".codex-plugin/plugin.json");
  const packageJson = readJson("package.json");

  assert.equal(manifest.name, "docmost-knowledge");
  assert.equal(manifest.version, "0.2.0");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.ok(manifest.interface.defaultPrompt.length <= 3);
});

test("MCP manifest points to existing scripts with sufficient timeout", () => {
  const mcpManifest = readJson(".mcp.json");
  const server = mcpManifest.mcpServers["docmost-knowledge"];

  assert.equal(server.command, "node");
  assert.ok(server.tool_timeout_sec >= 120);
  for (const script of server.args) {
    assert.equal(fs.existsSync(path.join(pluginRoot, script)), true);
  }
});

test("plugin source contains no unfinished placeholders", () => {
  const files = [
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "package.json",
    "skills/docmost-knowledge/SKILL.md",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(pluginRoot, file), "utf8");
    assert.doesNotMatch(content, /\[TODO:|REPLACE_ME/);
  }
});
