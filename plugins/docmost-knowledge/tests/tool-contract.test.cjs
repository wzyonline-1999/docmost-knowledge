"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MUTATION_TOOLS,
  REQUIRED_TOOLS,
  analyzeToolCatalog,
  formatContractReport,
  isRetrySafe,
} = require("../scripts/tool-contract.cjs");

function createCompatibleCatalog() {
  return REQUIRED_TOOLS.map((name) => {
    const properties = {};
    const required = [];
    if (MUTATION_TOOLS.has(name)) {
      properties.idempotencyKey = { type: "string" };
      required.push("idempotencyKey");
    }
    if (name === "update_page" || name === "append_page") {
      properties.expectedUpdatedAt = {
        type: "string",
        format: "date-time",
      };
      required.push("expectedUpdatedAt");
    }
    if (name === "search_docs" || name === "semantic_search_docs") {
      properties.rootPageId = { type: "string", format: "uuid" };
    }
    return {
      name,
      inputSchema: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    };
  });
}

test("analyzeToolCatalog accepts the full v0.2 server contract", () => {
  const report = analyzeToolCatalog(createCompatibleCatalog());

  assert.equal(report.compatible, true);
  assert.equal(report.toolCount, REQUIRED_TOOLS.length);
  assert.deepEqual(report.missingTools, []);
  assert.deepEqual(report.issues, []);
});

test("analyzeToolCatalog identifies missing tools and hardened fields", () => {
  const catalog = createCompatibleCatalog().filter(
    (tool) => tool.name !== "cancel_index_job",
  );
  const updatePage = catalog.find((tool) => tool.name === "update_page");
  updatePage.inputSchema.required = [];
  const searchDocs = catalog.find((tool) => tool.name === "search_docs");
  delete searchDocs.inputSchema.properties.rootPageId;

  const report = analyzeToolCatalog(catalog);
  const summary = formatContractReport(report);

  assert.equal(report.compatible, false);
  assert.deepEqual(report.missingTools, ["cancel_index_job"]);
  assert.match(summary, /update_page must require idempotencyKey/);
  assert.match(summary, /update_page must require expectedUpdatedAt/);
  assert.match(summary, /search_docs must support rootPageId/);
});

test("isRetrySafe retries only known read operations", () => {
  assert.equal(isRetrySafe("tools/list"), true);
  assert.equal(
    isRetrySafe("tools/call", { name: "search_docs", arguments: {} }),
    true,
  );
  assert.equal(
    isRetrySafe("tools/call", { name: "update_page", arguments: {} }),
    false,
  );
  assert.equal(
    isRetrySafe("tools/call", { name: "future_unknown_tool", arguments: {} }),
    false,
  );
});
