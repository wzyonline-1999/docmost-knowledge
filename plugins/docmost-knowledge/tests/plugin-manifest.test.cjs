"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pluginRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(pluginRoot, "../..");

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(pluginRoot, relativePath), "utf8"),
  );
}

test("plugin and package versions stay aligned", () => {
  const manifest = readJson(".codex-plugin/plugin.json");
  const packageJson = readJson("package.json");

  assert.equal(manifest.name, "docmost-knowledge");
  assert.equal(manifest.version, "0.3.1");
  assert.equal(packageJson.version, manifest.version);
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.ok(manifest.interface.defaultPrompt.length <= 3);
});

test("mutation guidance distinguishes exact retries from changed requests", () => {
  const skill = fs.readFileSync(
    path.join(pluginRoot, "skills/docmost-knowledge/SKILL.md"),
    "utf8",
  );
  const operations = fs.readFileSync(
    path.join(
      pluginRoot,
      "skills/docmost-knowledge/references/operations.md",
    ),
    "utf8",
  );

  assert.match(skill, /unchanged\s+arguments/);
  assert.match(skill, /read the page back in Markdown/);
  assert.match(operations, /new `expectedUpdatedAt`/);
  assert.match(operations, /new idempotency key/);
  assert.match(operations, /do not silently create at the\s+space root/);
});

test("template guidance covers discovery, preview, and destructive safety", () => {
  const skill = fs.readFileSync(
    path.join(pluginRoot, "skills/docmost-knowledge/SKILL.md"),
    "utf8",
  );
  const operations = fs.readFileSync(
    path.join(
      pluginRoot,
      "skills/docmost-knowledge/references/operations.md",
    ),
    "utf8",
  );

  assert.match(skill, /`list_templates`/);
  assert.match(skill, /`render_template`/);
  assert.match(skill, /`instantiate_template`/);
  assert.match(operations, /immutable published version/);
  assert.match(operations, /`archive_template` or `delete_template`/);
  assert.match(operations, /must never be retried\s+automatically/);
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

test("WorkBuddy manifest uses a portable plugin-root MCP path", () => {
  const manifest = readJson(".codebuddy-plugin/plugin.json");
  const packageJson = readJson("package.json");
  const mcpManifest = readJson(".workbuddy-mcp.json");
  const marketplace = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, ".codebuddy-plugin/marketplace.json"),
      "utf8",
    ),
  );
  const server = mcpManifest.mcpServers["docmost-knowledge"];
  const marketplacePlugin = marketplace.plugins.find(
    (plugin) => plugin.name === "docmost-knowledge",
  );

  assert.equal(manifest.name, "docmost-knowledge");
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, "./.workbuddy-mcp.json");
  assert.equal(server.command, "node");
  assert.deepEqual(server.args, [
    "${CODEBUDDY_PLUGIN_ROOT}/scripts/docmost-keychain-proxy.cjs",
  ]);
  assert.equal(
    fs.existsSync(path.join(pluginRoot, "scripts/docmost-keychain-proxy.cjs")),
    true,
  );
  assert.equal(marketplace.name, "open-context");
  assert.equal(marketplacePlugin.source, "./plugins/docmost-knowledge");
  assert.equal(marketplacePlugin.version, manifest.version);
});

test("plugin source contains no unfinished placeholders", () => {
  const files = [
    ".codex-plugin/plugin.json",
    ".codebuddy-plugin/plugin.json",
    ".mcp.json",
    ".workbuddy-mcp.json",
    "package.json",
    "skills/docmost-knowledge/SKILL.md",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(pluginRoot, file), "utf8");
    assert.doesNotMatch(content, /\[TODO:|REPLACE_ME/);
  }
});
