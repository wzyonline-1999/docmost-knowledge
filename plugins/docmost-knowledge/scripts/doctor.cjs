#!/usr/bin/env node
"use strict";

const {
  callRemote,
  getConfig,
  resolveToken,
} = require("./docmost-keychain-proxy.cjs");
const {
  analyzeToolCatalog,
  formatContractReport,
} = require("./tool-contract.cjs");

async function main() {
  const warnOnly = process.argv.includes("--warn");
  const config = getConfig();
  const token = resolveToken(config);
  const result = await callRemote(config, token, "tools/list", {});
  const report = analyzeToolCatalog(result.tools);

  process.stdout.write(
    `Profile: ${config.profileName}\nEndpoint: ${config.remoteUrl}\nTools: ${report.toolCount}\n`,
  );
  if (!report.compatible) {
    const details = formatContractReport(report);
    if (!warnOnly) {
      throw new Error(`Docmost MCP v0.2 contract check failed: ${details}`);
    }
    process.stdout.write(`Contract warnings: ${details}\n`);
    return;
  }
  process.stdout.write("Docmost MCP v0.2 contract: compatible\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : "Docmost Knowledge doctor failed";
  process.stderr.write(`${message.slice(0, 1000)}\n`);
  process.exitCode = 1;
});
