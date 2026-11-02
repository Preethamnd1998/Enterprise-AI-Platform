// Spawns index.js over stdio exactly as Claude Code would, calls one tool, prints its JSON.
//   node test/run-tool.mjs saga '{"target":"https://host/api-gateway/ipd-clinical/settings/6a4b..."}'
// `render` (saga) is printed as text; everything else as JSON. Exit 1 on a tool error.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export async function callTool(name, args) {
  const transport = new StdioClientTransport({
    command: "node",
    args: [join(dirname(fileURLToPath(import.meta.url)), "..", "index.js")],
    stderr: "ignore",
    // forward the Code Cortex cache override so tests can target a platform-local index
    env: Object.fromEntries(
      ["CBM_CACHE_DIR", "KG_SOURCE", "UT_KG_DB_PATH", "UT_KG_PYTHON", "UT_KG_SCRIPT", "UT_CODE_CORTEX_BIN", "UT_SAGA_UI_NARROW_BUDGET_MS"]
        .filter((k) => process.env[k]).map((k) => [k, process.env[k]])
    ),
  });
  const client = new Client({ name: "unified-trace-test", version: "1.0.0" });
  await client.connect(transport);
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 300000 });
    const text = res.content?.find((c) => c.type === "text")?.text ?? "";
    if (res.isError) throw new Error(text);
    return JSON.parse(text);
  } finally {
    await client.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , tool, json] = process.argv;
  try {
    const out = await callTool(tool, json ? JSON.parse(json) : {});
    if (out.render) {
      console.log(out.render);
      console.log("\nSUMMARY", JSON.stringify(out.summary));
      console.log("GAPS", JSON.stringify(out.gaps, null, 1));
      console.log("META", JSON.stringify(out.metadata));
    } else {
      console.log(JSON.stringify(out, null, 1));
    }
  } catch (e) {
    console.error("TOOL ERROR:", e.message);
    process.exit(1);
  }
}
