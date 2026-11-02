#!/usr/bin/env node
// Enterprise AI Platform — safe OpenCode config merge.
//
// Merges the shared knowledge-graph / code-cortex-mcp (filtered) /
// unified-trace MCP block into an existing opencode.jsonc, WITHOUT
// touching any other key the user already has. Refuses (non-zero exit,
// no write) rather than risk corrupting anything it can't safely
// round-trip through JSON.parse/stringify — most commonly because the
// file has JSONC comments, which plain JSON.parse can't preserve. See
// docs/opencode-setup.md for the manual block to add in that case.
//
// Usage: node merge-opencode-config.js <config_path> <kg_repo> <cortex_mcp_bin> <platform_repo>
"use strict";
const fs = require("fs");

const [, , configPath, kgRepo, cortexBin, platformRepo] = process.argv;
if (!configPath || !kgRepo || !cortexBin || !platformRepo) {
  console.error("usage: merge-opencode-config.js <config_path> <kg_repo> <cortex_mcp_bin> <platform_repo>");
  process.exit(1);
}

const raw = fs.readFileSync(configPath, "utf8");
let config;
try {
  config = JSON.parse(raw);
} catch (e) {
  console.error(`refusing to merge: ${configPath} is not plain JSON (likely has JSONC comments) — ${e.message}`);
  process.exit(1);
}
if (typeof config !== "object" || config === null || Array.isArray(config)) {
  console.error("refusing to merge: config root is not a JSON object");
  process.exit(1);
}

config.mcp = config.mcp || {};
config.mcp["knowledge-graph"] = {
  type: "local",
  command: [`${kgRepo}/.venv-mcp/bin/python`, `${kgRepo}/mcp_server_main.py`],
  environment: { KG_DB_PATH: `${kgRepo}/output/knowledge_graph.db` },
  enabled: true,
};
config.mcp["code-cortex-mcp"] = {
  type: "local",
  command: [cortexBin],
  enabled: true,
};
config.mcp["unified-trace"] = {
  type: "local",
  command: ["node", `${platformRepo}/shared/mcp-tools/unified-trace-mcp/index.js`],
  enabled: true,
};

config.tools = config.tools || {};
const READ_TOOLS = [
  "get_architecture", "get_code_snippet", "get_graph_schema", "index_status",
  "list_projects", "query_graph", "search_code", "search_graph", "trace_path",
];
config.tools["code-cortex-mcp_*"] = false;
for (const t of READ_TOOLS) config.tools[`code-cortex-mcp_${t}`] = true;

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
console.log(`merged shared MCP block into ${configPath}`);
