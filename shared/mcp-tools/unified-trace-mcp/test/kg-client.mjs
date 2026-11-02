// Direct Knowledge Graph MCP client for tests that need facts saga does not render
// (template events). Uses the same resolution as the platform: KG_SOURCE / UT_KG_DB_PATH / .venv-mcp.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, loadSettings, kgDir, resolveVenvPython, resolveKgDb } from "../../../core/path-resolver/index.js";

export async function kgCall(name, args) {
  const ctx = createContext({ repoRoot: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..") });
  const settings = loadSettings(ctx);
  const kg = kgDir(ctx, settings);
  const py = process.env.UT_KG_PYTHON || resolveVenvPython(ctx, settings).path;
  const db = process.env.UT_KG_DB_PATH || resolveKgDb(ctx, settings).tried[0];
  const client = new Client({ name: "kg-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: py, args: [join(kg, "mcp_server_main.py")], env: { KG_DB_PATH: db }, stderr: "ignore" }));
  try {
    const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
    if (res.isError) throw new Error(res.content?.[0]?.text);
    return JSON.parse(res.content.find((c) => c.type === "text").text);
  } finally {
    await client.close();
  }
}
