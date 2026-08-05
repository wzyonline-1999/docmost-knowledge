"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CONFIRMATION_TOOLS,
  EXPECTED_UPDATED_AT_TOOLS,
  MUTATION_TOOLS,
  REQUIRED_TOOLS,
  TEMPLATE_MUTATION_TOOLS,
  TEMPLATE_READ_TOOLS,
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
    if (EXPECTED_UPDATED_AT_TOOLS.has(name)) {
      properties.expectedUpdatedAt = {
        type: "string",
        format: "date-time",
      };
      required.push("expectedUpdatedAt");
    }
    if (CONFIRMATION_TOOLS.has(name)) {
      properties.confirm = { type: "boolean" };
      required.push("confirm");
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

test("analyzeToolCatalog accepts the full v0.3 server contract", () => {
  const report = analyzeToolCatalog(createCompatibleCatalog());

  assert.equal(report.compatible, true);
  assert.equal(report.toolCount, REQUIRED_TOOLS.length);
  assert.deepEqual(report.missingTools, []);
  assert.deepEqual(report.issues, []);
});

test("analyzeToolCatalog identifies missing tools and hardened fields", () => {
  const catalog = createCompatibleCatalog().filter(
    (tool) => tool.name !== "delete_template",
  );
  const updatePage = catalog.find((tool) => tool.name === "update_page");
  updatePage.inputSchema.required = [];
  const searchDocs = catalog.find((tool) => tool.name === "search_docs");
  delete searchDocs.inputSchema.properties.rootPageId;
  const createTemplate = catalog.find(
    (tool) => tool.name === "create_template",
  );
  createTemplate.inputSchema.required =
    createTemplate.inputSchema.required.filter(
      (field) => field !== "idempotencyKey",
    );
  const updateTemplate = catalog.find(
    (tool) => tool.name === "update_template",
  );
  updateTemplate.inputSchema.required =
    updateTemplate.inputSchema.required.filter(
      (field) => field !== "expectedUpdatedAt",
    );
  const archiveTemplate = catalog.find(
    (tool) => tool.name === "archive_template",
  );
  archiveTemplate.inputSchema.required =
    archiveTemplate.inputSchema.required.filter(
      (field) => field !== "confirm",
    );

  const report = analyzeToolCatalog(catalog);
  const summary = formatContractReport(report);

  assert.equal(report.compatible, false);
  assert.deepEqual(report.missingTools, ["delete_template"]);
  assert.match(summary, /update_page must require idempotencyKey/);
  assert.match(summary, /update_page must require expectedUpdatedAt/);
  assert.match(summary, /search_docs must support rootPageId/);
  assert.match(summary, /create_template must require idempotencyKey/);
  assert.match(summary, /update_template must require expectedUpdatedAt/);
  assert.match(summary, /archive_template must require confirm/);
});

test("isRetrySafe retries only known read operations", () => {
  assert.equal(isRetrySafe("tools/list"), true);
  assert.equal(
    isRetrySafe("tools/call", { name: "search_docs", arguments: {} }),
    true,
  );
  assert.equal(
    isRetrySafe("tools/call", { name: "render_template", arguments: {} }),
    true,
  );
  for (const name of TEMPLATE_READ_TOOLS) {
    assert.equal(isRetrySafe("tools/call", { name, arguments: {} }), true);
  }
  assert.equal(
    isRetrySafe("tools/call", { name: "update_page", arguments: {} }),
    false,
  );
  assert.equal(
    isRetrySafe("tools/call", {
      name: "instantiate_template",
      arguments: {},
    }),
    false,
  );
  for (const name of TEMPLATE_MUTATION_TOOLS) {
    assert.equal(isRetrySafe("tools/call", { name, arguments: {} }), false);
  }
  assert.equal(
    isRetrySafe("tools/call", { name: "future_unknown_tool", arguments: {} }),
    false,
  );
});
