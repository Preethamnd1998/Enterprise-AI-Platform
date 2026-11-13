// render-compact.js — pure, dependency-free compact renderer for unified-trace results.
// Kept separate from index.js so unit tests can import it without starting the MCP server.
// ---------------------------------------------------------------------------
// Compact rendering (default) for trace / trace_usages / trace_impact.
// The JSON graph (up to MAX_NODES/MAX_EDGES) can be 20k+ tokens; the compact
// form lists edges as "from —TYPE[conf]→ to" with short ids plus the nodes that
// have no edge, capped by max_nodes, and tells the caller how to get the full
// JSON. Pure function: unit-tested in test/render-compact.test.mjs.
export const COMPACT_MAX_NODES_DEFAULT = 60;
function shortId(id) {
  if (typeof id !== "string") return String(id);
  const noParams = id.replace(/\(.*\)$/, "");
  const parts = noParams.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : noParams;
}
export function renderCompact(tool, payload, maxNodes = COMPACT_MAX_NODES_DEFAULT) {
  const nodes = payload.nodes || [];
  const edges = payload.edges || [];
  const maxEdges = maxNodes * 2;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // Code Cortex call edges carry bare method names as endpoints while nodes are
  // fully qualified: resolve an endpoint to the unique node whose id ends with
  // ".<name>" (or whose name equals it) so the line reads Class.method.
  const byName = new Map();
  for (const n of nodes) {
    const nm = n.name || String(n.id).split(".").pop();
    const arr = byName.get(nm) || []; arr.push(n.id); byName.set(nm, arr);
  }
  const resolve = (ep) => {
    if (byId.has(ep)) return ep;
    const c = byName.get(ep);
    return c && c.length === 1 ? c[0] : ep;
  };
  const loc = (id) => {
    const n = byId.get(id);
    const l = n?.location;
    if (!l) return "";
    const file = typeof l === "string" ? l : l.file || l.path;
    if (!file) return "";
    const short = file.split(/[\\/]/).slice(-2).join("/");
    return ` [${short}${l.line ? ":" + l.line : ""}]`;
  };
  const lines = [`${tool} ${payload.query}${payload.resolved_qualified_name ? ` → ${payload.resolved_qualified_name}` : ""}`];
  if (payload.caller_count !== undefined) lines.push(`callers: ${payload.caller_count}  ui usages: ${payload.ui_usage_count ?? 0}`);
  const seenNode = new Set();
  const shown = edges.slice(0, maxEdges);
  for (const e of shown) {
    const from = resolve(e.from), to = resolve(e.to);
    seenNode.add(from); seenNode.add(to);
    lines.push(`${shortId(from)} —${e.type}[${(e.confidence || "?").toString().slice(0, 3)}]→ ${shortId(to)}${loc(to)}`);
  }
  const lone = nodes.filter((n) => !seenNode.has(n.id)).slice(0, Math.max(0, maxNodes - seenNode.size));
  if (lone.length) lines.push(`nodes: ${lone.map((n) => `${n.type || ""} ${shortId(n.id)}${loc(n.id)}`.trim()).join("; ")}`);
  if (payload.db_impact) {
    const d = payload.db_impact;
    const tables = d.tables || d.affected_tables || (Array.isArray(d) ? d : null);
    if (tables && tables.length) lines.push(`db: ${tables.slice(0, 15).map((x) => (typeof x === "string" ? x : x.table || x.name || JSON.stringify(x))).join(", ")}`);
  }
  if (payload.unresolved?.length) lines.push(`unresolved: ${payload.unresolved.slice(0, 5).map((u) => `${u.query || u.target || ""}${u.reason ? " (" + u.reason + ")" : ""}`).join("; ")}`);
  const hiddenEdges = edges.length - shown.length;
  const hiddenNodes = nodes.length - seenNode.size - lone.length;
  if (hiddenEdges > 0 || hiddenNodes > 0 || payload.metadata?.truncated) {
    lines.push(`… ${Math.max(0, hiddenEdges)} more edges / ${Math.max(0, hiddenNodes)} more nodes not shown — raise max_nodes or pass format:"json" for the full graph`);
  }
  lines.push(`sources: ${(payload.metadata?.sources || []).join("+")}  ${payload.metadata?.durationMs ?? "?"}ms`);
  return lines.join("\n");
}
