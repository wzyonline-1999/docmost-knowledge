"use strict";

const TEMPLATE_READ_TOOLS = Object.freeze([
  "list_templates",
  "get_template",
  "render_template",
]);

const TEMPLATE_MUTATION_TOOLS = Object.freeze([
  "instantiate_template",
  "create_template",
  "update_template",
  "publish_template",
  "archive_template",
  "delete_template",
]);

const REQUIRED_TOOLS = Object.freeze([
  "list_spaces",
  "list_pages",
  "get_page",
  "list_page_versions",
  "get_page_version",
  "diff_page_versions",
  "restore_page_version",
  "list_attachments",
  "get_attachment",
  "upload_attachment",
  "delete_attachment",
  "search_docs",
  "semantic_search_docs",
  "create_page",
  "update_page",
  "append_page",
  "delete_page",
  "restore_page",
  "reindex_page",
  "reindex_space",
  "reindex_workspace",
  "get_index_status",
  "list_index_jobs",
  "retry_index_job",
  "pause_index_job",
  "resume_index_job",
  "cancel_index_job",
  ...TEMPLATE_READ_TOOLS,
  ...TEMPLATE_MUTATION_TOOLS,
]);

const MUTATION_TOOLS = new Set([
  "restore_page_version",
  "upload_attachment",
  "delete_attachment",
  "create_page",
  "update_page",
  "append_page",
  "delete_page",
  "restore_page",
  "reindex_page",
  "reindex_space",
  "reindex_workspace",
  "retry_index_job",
  "pause_index_job",
  "resume_index_job",
  "cancel_index_job",
  ...TEMPLATE_MUTATION_TOOLS,
]);

const EXPECTED_UPDATED_AT_TOOLS = new Set([
  "update_page",
  "append_page",
  "update_template",
  "publish_template",
  "archive_template",
  "delete_template",
]);

const CONFIRMATION_TOOLS = new Set([
  "archive_template",
  "delete_template",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasProperty(tool, propertyName) {
  return isObject(tool?.inputSchema?.properties?.[propertyName]);
}

function requiresProperty(tool, propertyName) {
  return (
    Array.isArray(tool?.inputSchema?.required) &&
    tool.inputSchema.required.includes(propertyName)
  );
}

function analyzeToolCatalog(tools) {
  if (!Array.isArray(tools)) {
    return {
      compatible: false,
      toolCount: 0,
      missingTools: [...REQUIRED_TOOLS],
      issues: ["tools/list did not return an array"],
    };
  }

  const byName = new Map(
    tools
      .filter((tool) => isObject(tool) && typeof tool.name === "string")
      .map((tool) => [tool.name, tool]),
  );
  const missingTools = REQUIRED_TOOLS.filter((name) => !byName.has(name));
  const issues = [];

  for (const name of REQUIRED_TOOLS) {
    const tool = byName.get(name);
    if (!tool) continue;
    if (!isObject(tool.inputSchema)) {
      issues.push(`${name} has no inputSchema`);
    }
  }

  for (const name of MUTATION_TOOLS) {
    const tool = byName.get(name);
    if (tool && !requiresProperty(tool, "idempotencyKey")) {
      issues.push(`${name} must require idempotencyKey`);
    }
  }

  for (const name of EXPECTED_UPDATED_AT_TOOLS) {
    const tool = byName.get(name);
    if (tool && !requiresProperty(tool, "expectedUpdatedAt")) {
      issues.push(`${name} must require expectedUpdatedAt`);
    }
  }

  for (const name of CONFIRMATION_TOOLS) {
    const tool = byName.get(name);
    if (tool && !requiresProperty(tool, "confirm")) {
      issues.push(`${name} must require confirm`);
    }
  }

  for (const name of ["search_docs", "semantic_search_docs"]) {
    const tool = byName.get(name);
    if (tool && !hasProperty(tool, "rootPageId")) {
      issues.push(`${name} must support rootPageId`);
    }
  }

  return {
    compatible: missingTools.length === 0 && issues.length === 0,
    toolCount: tools.length,
    missingTools,
    issues,
  };
}

function formatContractReport(report) {
  const details = [];
  if (report.missingTools.length > 0) {
    details.push(`missing tools: ${report.missingTools.join(", ")}`);
  }
  details.push(...report.issues);
  return details.join("; ");
}

function isRetrySafe(method, params) {
  if (method === "tools/list") return true;
  if (method !== "tools/call") return false;
  const toolName = params?.name;
  return (
    typeof toolName === "string" &&
    REQUIRED_TOOLS.includes(toolName) &&
    !MUTATION_TOOLS.has(toolName)
  );
}

module.exports = {
  CONFIRMATION_TOOLS,
  EXPECTED_UPDATED_AT_TOOLS,
  MUTATION_TOOLS,
  REQUIRED_TOOLS,
  TEMPLATE_MUTATION_TOOLS,
  TEMPLATE_READ_TOOLS,
  analyzeToolCatalog,
  formatContractReport,
  isRetrySafe,
};
