import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CODE_CORTEX_BIN = process.env.UT_CODE_CORTEX_BIN || "/Users/preetham/.local/bin/code-cortex-mcp";
const KG_PYTHON = process.env.UT_KG_PYTHON ||
  "/Users/preetham/Lifetrenz/Projects/Custom Git Repos/knowledge-graph-generator/.venv-mcp/bin/python";
const KG_SCRIPT = process.env.UT_KG_SCRIPT ||
  "/Users/preetham/Lifetrenz/Projects/Custom Git Repos/knowledge-graph-generator/mcp_server_main.py";
const KG_DB_PATH = process.env.UT_KG_DB_PATH ||
  "/Users/preetham/Lifetrenz/Projects/Custom Git Repos/knowledge-graph-generator/output/knowledge_graph.db";

const CC_PROJECTS = (process.env.UT_CODE_CORTEX_PROJECTS ||
  "Users-preetham-Lifetrenz-Projects-BE-core-service,Users-preetham-Lifetrenz-Projects-UI-lifetrenz-core"
).split(",").map((s) => s.trim());

const MAX_NODES = 400;
const MAX_EDGES = 800;

let ccClient = null;
let kgClient = null;

async function getCodeCortexClient() {
  if (ccClient) return ccClient;
  const transport = new StdioClientTransport({ command: CODE_CORTEX_BIN, args: [] });
  const client = new Client({ name: "unified-trace/code-cortex", version: "1.0.0" });
  await client.connect(transport);
  ccClient = client;
  return client;
}

async function getKnowledgeGraphClient() {
  if (kgClient) return kgClient;
  const transport = new StdioClientTransport({
    command: KG_PYTHON,
    args: [KG_SCRIPT],
    env: { ...process.env, KG_DB_PATH },
  });
  const client = new Client({ name: "unified-trace/knowledge-graph", version: "1.0.0" });
  await client.connect(transport);
  kgClient = client;
  return client;
}

function parseToolJSON(result) {
  const text = result?.content?.find((c) => c.type === "text")?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function ccCall(tool, args) {
  try {
    const client = await getCodeCortexClient();
    const result = await client.callTool({ name: tool, arguments: args });
    return { ok: !result.isError, data: parseToolJSON(result) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function kgCall(tool, args) {
  try {
    const client = await getKnowledgeGraphClient();
    const result = await client.callTool({ name: tool, arguments: args });
    return { ok: !result.isError, data: parseToolJSON(result) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function ccConfidence(score) {
  if (score === undefined || score === null) return "VERIFIED";
  if (score >= 0.9) return "VERIFIED";
  if (score >= 0.5) return "INFERRED";
  return "UNRESOLVED";
}

function nodeId(qualifiedName) {
  return qualifiedName;
}

function classifyQuery(query) {
  if (/^(GET|POST|PUT|DELETE|PATCH)\s+\//.test(query) || query.startsWith("/")) return "api";
  if (/ApiConstant\.[A-Z0-9_]+$/.test(query)) return "api_constant";
  return "symbol";
}

async function ccFindQualifiedName(query) {
  for (const project of CC_PROJECTS) {
    const direct = await ccCall("trace_path", { function_name: query, project, mode: "calls", direction: "outbound", depth: 1 });
    if (direct.ok && direct.data && !direct.data.status) {
      return { project, qualified_name: query };
    }
    if (direct.ok && direct.data?.status === "ambiguous" && direct.data.suggestions?.length) {
      return { project, qualified_name: direct.data.suggestions[0].qualified_name, alternatives: direct.data.suggestions };
    }
    const search = await ccCall("search_graph", { project, query, limit: 5 });
    if (search.ok && search.data?.results?.length) {
      const best = search.data.results[0];
      return { project, qualified_name: best.qualified_name, node_label: best.label };
    }
  }
  return null;
}

// Exact, parent_class-scoped Method lookup — replaces fuzzy ccFindQualifiedName
// for Angular self-call template-event handlers (Phase 4 fix). Two real,
// empirically-confirmed quirks of query_graph drive this shape:
//   1. A Cypher-style label PREFIX (`(m:Method {...})`) silently matches
//      nothing — the label must be a property inside the braces instead
//      (`(m {label: "Method", ...})`). Not documented; found by direct probe.
//   2. Method.parent_class holds the CONTAINING CLASS's full qualified_name
//      (e.g. "...home.component.HomeComponent"), never the bare class name —
//      so scoping by class name is a SUFFIX match, not equality.
// Ambiguity (>1 class with the same simple name, both containing a
// same-named method) is narrowed further by file_path: the template's own
// sibling .ts path is a second, independent real fact, not a guess. Still
// ambiguous after that -> INFERRED with candidates listed, never guessed
// into VERIFIED.
async function ccFindMethodOnClass(className, methodName, expectedTsRelPath) {
  const matches = [];
  for (const project of CC_PROJECTS) {
    const q = await ccCall("query_graph", {
      project,
      query: `MATCH (m {label: "Method", name: "${methodName}"}) RETURN m.name, m.parent_class, m.qualified_name, m.file_path`,
    });
    if (!q.ok || !q.data?.rows) continue;
    for (const row of q.data.rows) {
      const parentClass = row[1];
      if (parentClass && parentClass.endsWith(`.${className}`)) {
        matches.push({ project, qualified_name: row[2], parent_class: parentClass, file_path: row[3] });
      }
    }
  }
  if (matches.length > 1 && expectedTsRelPath) {
    const narrowed = matches.filter((m) => m.file_path && m.file_path.endsWith(expectedTsRelPath));
    if (narrowed.length >= 1) return narrowed;
  }
  return matches;
}

const PERSISTENCE_RELATIONS = ["MAPS_TO_TABLE", "MAPS_TO_MONGO_COLLECTION", "MAPS_TO_MONGO_FIELD", "REPOSITORY_FOR"];

/* Surfaces JPA/@Entity->Table and Mongo @Document/@Field/MongoRepository
 * edges for a resolved symbol, both directions. Uses query_graph (a direct
 * graph read) rather than trace_path, since these aren't CALLS edges —
 * trace_path's "calls" mode wouldn't follow them. Indexed-graph-only, no
 * source scanning: this is exactly the persistence data code-cortex's
 * pass_orm_nodes.cpp already computed at index time. */
async function ccPersistenceEdges(project, name) {
  const relTypes = PERSISTENCE_RELATIONS.join("|");
  const results = [];
  for (const [pattern, cols] of [
    [`(a {name: "${name}"})-[e:${relTypes}]->(b)`, ["a.name", "a.label", "b.name", "b.label"]],
    [`(a)-[e:${relTypes}]->(b {name: "${name}"})`, ["a.name", "a.label", "b.name", "b.label"]],
  ]) {
    const q = await ccCall("query_graph", {
      project,
      query: `MATCH ${pattern} RETURN ${cols.join(", ")}, type(e), e.confidence`,
    });
    if (q.ok && q.data?.rows) {
      for (const r of q.data.rows) {
        results.push({ from: r[0], from_label: r[1], to: r[2], to_label: r[3], relation: r[4], confidence: r[5] || "VERIFIED" });
      }
    }
  }
  return results;
}

// --- Angular semantic tracing (template events, routes) --------------------
//
// Knowledge Generator's angular_parser.py indexes TEMPLATE_EVENT/NG_ROUTE
// nodes with HANDLES_EVENT/DECLARED_IN/ROUTES_TO/GUARDED_BY/RESOLVED_BY/
// CONTAINS_ROUTE edges. A self-form event handler ((click)="savePatient()")
// is deliberately left UNRESOLVED by KG (it has no per-method registry —
// see angular_parser.py's HANDLES_EVENT docs), so its downstream CALLS
// chain must come from Code Cortex's real TS AST/CALLS graph, not guessed
// here. find_dependencies is KG's generic node-type-agnostic traversal
// (mcp_server/queries/common.py's DEPENDENCY_RELATIONS now includes the
// Angular relations too) — it only works from an anchor NODE that already
// resolved, so find_template_events/find_routes (name/metadata lookups)
// cover the cases nothing anchors yet (a bare handler method name, or a
// route path substring).
function stripEventAnnotation(query) {
  const m = /^\(([\w.]+)\)\s+(.+)$/.exec(query.trim());
  if (m) return { eventHint: m[1], rest: m[2].trim() };
  return { eventHint: null, rest: query.trim() };
}

async function ingestTemplateEvents(events, nodes, edges, seen) {
  for (const e of events || []) {
    const evId = `TEMPLATE_EVENT:${e.file}:${e.line}:${e.event_name}`;
    addNode(nodes, seen, evId, "TEMPLATE_EVENT", `(${e.event_name})`, { file: e.file, line: e.line },
      { source: "KNOWLEDGE_GRAPH", handler_kind: e.handler_kind, handler_expression: e.handler_expression });
    if (e.component_name) {
      addNode(nodes, seen, e.component_name, "NG_COMPONENT", e.component_name, null, { source: "KNOWLEDGE_GRAPH" });
      addEdge(edges, evId, e.component_name, "DECLARED_IN", "VERIFIED", "KNOWLEDGE_GRAPH");
    }
    if (e.handler_kind === "self_call" && e.method_name) {
      // Exact AST resolution scoped to the owning component (Phase 4 fix —
      // see ccFindMethodOnClass) instead of a global fuzzy name search.
      const expectedTsRelPath = e.file ? e.file.replace(/\.html$/, ".ts") : null;
      const matches = e.component_name
        ? await ccFindMethodOnClass(e.component_name, e.method_name, expectedTsRelPath)
        : [];
      if (matches.length === 1) {
        const m = matches[0];
        addNode(nodes, seen, m.qualified_name, "METHOD", e.method_name, { file: m.file_path },
          { source: "CODE_CORTEX", project: m.project });
        addEdge(edges, evId, m.qualified_name, "HANDLES_EVENT", "VERIFIED", "CODE_CORTEX",
          { method_name: e.method_name, resolution: "ast_exact_parent_class_match" });
      } else if (matches.length > 1) {
        for (const m of matches) {
          addNode(nodes, seen, m.qualified_name, "METHOD", e.method_name, { file: m.file_path },
            { source: "CODE_CORTEX", project: m.project });
        }
        addEdge(edges, evId, matches[0].qualified_name, "HANDLES_EVENT", "INFERRED", "CODE_CORTEX", {
          method_name: e.method_name,
          resolution: "ambiguous_multiple_ast_matches_same_class_name",
          candidates: matches.map((m) => m.qualified_name),
        });
      } else {
        const targetId = e.component_name ? `${e.component_name}.${e.method_name}` : e.method_name;
        addNode(nodes, seen, targetId, "METHOD", e.method_name, null,
          { source: "KNOWLEDGE_GRAPH", note: "no matching method found on this component in Code Cortex's AST" });
        addEdge(edges, evId, targetId, "HANDLES_EVENT", "UNRESOLVED", "KNOWLEDGE_GRAPH");
      }
    } else if (e.handler_kind === "member_call" && e.member_type) {
      addNode(nodes, seen, e.member_type, "NG_SERVICE", e.member_type, null, { source: "KNOWLEDGE_GRAPH" });
      addEdge(edges, evId, e.member_type, "HANDLES_EVENT", "VERIFIED", "KNOWLEDGE_GRAPH", { method_name: e.method_name });
    }
  }
}

function ingestLazyModules(routes, nodes, edges, seen) {
  for (const r of routes || []) {
    if (!r.lazy_module_path) continue;
    const routeId = `ROUTE:${r.file}:${r.line}:${r.path}`;
    const modId = `NG_LAZY_MODULE:${r.file}:${r.lazy_module_path}`;
    addNode(nodes, seen, modId, "NG_LAZY_MODULE", r.lazy_module_symbol || r.lazy_module_path,
      { file: r.file, line: r.line }, { source: "KNOWLEDGE_GRAPH", module_path: r.lazy_module_path });
    addEdge(edges, routeId, modId, "LOADS_MODULE", "VERIFIED", "KNOWLEDGE_GRAPH");
    // Deliberately no edge to the lazy module's own child routes/components —
    // resolving an import specifier (incl. TS path aliases like "@inpatient/...")
    // to a file on disk is module-compiler territory, out of scope (Phase 4 §8-10).
  }
}

function ingestRoutes(routes, nodes, edges, seen) {
  for (const r of routes || []) {
    const routeId = `ROUTE:${r.file}:${r.line}:${r.path}`;
    addNode(nodes, seen, routeId, "NG_ROUTE", r.path, { file: r.file, line: r.line },
      { source: "KNOWLEDGE_GRAPH", lazy: r.lazy });
    if (r.component) {
      addNode(nodes, seen, r.component, "NG_COMPONENT", r.component, null, { source: "KNOWLEDGE_GRAPH" });
      addEdge(edges, routeId, r.component, "ROUTES_TO", "VERIFIED", "KNOWLEDGE_GRAPH");
    }
    for (const [guardType, names] of Object.entries(r.guards || {})) {
      for (const g of names) {
        addNode(nodes, seen, g, "NG_SERVICE", g, null, { source: "KNOWLEDGE_GRAPH" });
        addEdge(edges, routeId, g, "GUARDED_BY", "VERIFIED", "KNOWLEDGE_GRAPH", { guard_type: guardType });
      }
    }
    for (const [key, resolverName] of Object.entries(r.resolvers || {})) {
      addNode(nodes, seen, resolverName, "NG_SERVICE", resolverName, null, { source: "KNOWLEDGE_GRAPH" });
      addEdge(edges, routeId, resolverName, "RESOLVED_BY", "VERIFIED", "KNOWLEDGE_GRAPH", { resolver_key: key });
    }
  }
}

// Generic KG dependency traversal (works for any already-resolvable node —
// component, guard, resolver, route-by-exact-name, service, class, ...).
function ingestKGDependencies(depResult, anchorName, nodes, edges, seen) {
  if (!depResult?.results) return;
  addNode(nodes, seen, anchorName, depResult.target_type || "NODE", anchorName, null, { source: "KNOWLEDGE_GRAPH" });
  for (const r of depResult.results) {
    addNode(nodes, seen, r.name, r.node_type || "NODE", r.name, null, { source: "KNOWLEDGE_GRAPH", service: r.service });
    const confidence = (r.confidence || "unknown").toUpperCase();
    if (r.direction === "outgoing") {
      addEdge(edges, anchorName, r.name, r.relation, confidence, "KNOWLEDGE_GRAPH");
    } else {
      addEdge(edges, r.name, anchorName, r.relation, confidence, "KNOWLEDGE_GRAPH");
    }
  }
}

async function angularEnrich(query, nodes, edges, seen, direction, depth) {
  const { eventHint, rest } = stripEventAnnotation(query);
  const te = await kgCall("find_template_events", eventHint ? { handler: rest, event: eventHint } : { handler: rest });
  if (te.ok && te.data?.results?.length) await ingestTemplateEvents(te.data.results, nodes, edges, seen);

  const routesByPath = await kgCall("find_routes", { path: rest });
  if (routesByPath.ok && routesByPath.data?.results?.length) {
    ingestRoutes(routesByPath.data.results, nodes, edges, seen);
    ingestLazyModules(routesByPath.data.results, nodes, edges, seen);
  }

  const dir = direction === "both" ? "both" : direction === "reverse" ? "incoming" : "outgoing";
  const dep = await kgCall("find_dependencies", { target: rest, direction: dir, depth });
  if (dep.ok && dep.data && !dep.data.error) ingestKGDependencies(dep.data, rest, nodes, edges, seen);
}

function addNode(nodes, seen, id, type, name, location, extra) {
  if (seen.has(id)) return;
  seen.add(id);
  nodes.push({ id, type, name, location: location || null, ...(extra || {}) });
}

function addEdge(edges, from, to, type, confidence, source, extra) {
  if (edges.length >= MAX_EDGES) return;
  edges.push({ from, to, type, confidence, source, ...(extra || {}) });
}

// addNode dedupes by id via `seen`, but addEdge doesn't (some legitimately
// distinct edges share every other field, e.g. two different guard types
// on the same route->guard pair) — the same (from,to,type,source) can still
// be produced twice when multiple ingestion paths touch the same real
// relationship (e.g. trace_impact's incoming+outgoing find_dependencies
// calls). Dedupe once here, right before building the response, keeping
// the first (highest-confidence-first callers should addEdge in that order).
function dedupeEdges(edges) {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    const key = `${e.from}|${e.to}|${e.type}|${e.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function ingestCCCalls(callData, nodes, edges, seen) {
  if (!callData) return;
  const root = callData.function;
  if (root) addNode(nodes, seen, root, "SYMBOL", root.split(".").pop(), null, { source: "CODE_CORTEX" });
  for (const callee of callData.callees || []) {
    addNode(nodes, seen, callee.qualified_name, "METHOD", callee.name, null, { source: "CODE_CORTEX" });
  }
  for (const callee of callData.callers || []) {
    addNode(nodes, seen, callee.qualified_name, "METHOD", callee.name, null, { source: "CODE_CORTEX" });
  }
  for (const e of callData.callee_edges || []) {
    addEdge(edges, e.from, e.to, e.type || "CALLS", ccConfidence(e.confidence), "CODE_CORTEX");
  }
  for (const e of callData.caller_edges || []) {
    addEdge(edges, e.from, e.to, e.type || "CALLS", ccConfidence(e.confidence), "CODE_CORTEX");
  }
}

function ingestKGBusinessFlow(flow, nodes, edges, seen) {
  if (!flow?.chain) return;
  let prev = null;
  for (const step of flow.chain) {
    addNode(nodes, seen, step.step, step.role?.toUpperCase() || "NODE", step.step, null, { source: "KNOWLEDGE_GRAPH" });
    if (prev) addEdge(edges, prev, step.step, "FLOW", "VERIFIED", "KNOWLEDGE_GRAPH");
    prev = step.step;
  }
  for (const c of flow.ui_callers || []) {
    addNode(nodes, seen, c.constant, "UI_API_CONSTANT", c.constant, { file: c.ui_project }, { source: "KNOWLEDGE_GRAPH" });
    if (flow.chain[0]) addEdge(edges, c.constant, flow.chain[0].step, "CALLS_API", "VERIFIED", "KNOWLEDGE_GRAPH");
  }
}

function unresolvedFrom(kgData) {
  const out = [];
  if (kgData?.resolution && kgData.resolution !== "resolved") {
    out.push({ query: kgData.constant || kgData.raw_value, reason: kgData.resolution });
  }
  return out;
}

const server = new McpServer({ name: "unified-trace", version: "1.0.0" });

server.registerTool(
  "trace",
  {
    description:
      "Unified cross-stack trace: merges Knowledge Generator (UI<->API<->architecture, confidence-tagged) " +
      "with Code Cortex (exact AST method-body CALLS/CALLERS/CALLEES) into one compact {nodes,edges,unresolved} result. " +
      "Accepts a UI API constant (e.g. 'CommonApiConstant.HIS_CS_BED_SITEMASTER'), an endpoint ('POST /bed/sitemaster'), " +
      "or a symbol/class/method name (e.g. 'BedCategorySiteAssignmentServiceImp.addsiteMaster'). " +
      "Never guesses an implementation name from convention - AST resolution always wins over naming heuristics.",
    inputSchema: {
      query: z.string(),
      direction: z.enum(["forward", "reverse", "both"]).default("both"),
      depth: z.number().int().min(1).max(5).default(3),
    },
  },
  async ({ query, direction, depth }) => {
    const start = Date.now();
    const nodes = [];
    const edges = [];
    const unresolved = [];
    const seen = new Set();
    const sources = [];
    const kind = classifyQuery(query);

    if (kind === "api" || kind === "api_constant") {
      sources.push("KNOWLEDGE_GRAPH");
      const isPath = kind === "api";
      const apiCall = isPath
        ? await kgCall("get_api_context", { query })
        : await kgCall("resolve_ui_api", { query, limit: 1 });

      let entryMethod = null;
      let flow = null;
      if (isPath && apiCall.ok && apiCall.data && !apiCall.data.error) {
        const ctx = apiCall.data;
        addNode(nodes, seen, query, "ENDPOINT", query, { file: ctx.file }, { source: "KNOWLEDGE_GRAPH" });
        if (ctx.controller && ctx.method) {
          entryMethod = `${ctx.controller}.${ctx.method}`;
          addNode(nodes, seen, entryMethod, "METHOD", ctx.method, { file: ctx.file }, { source: "KNOWLEDGE_GRAPH" });
          addEdge(edges, query, entryMethod, "EXPOSES", "VERIFIED", "KNOWLEDGE_GRAPH");
        }
        for (const c of ctx.ui_callers || []) {
          addNode(nodes, seen, c.constant, "UI_API_CONSTANT", c.constant, { file: c.ui_project }, { source: "KNOWLEDGE_GRAPH" });
          addEdge(edges, c.constant, query, "CALLS_API", "VERIFIED", "KNOWLEDGE_GRAPH");
        }
      } else if (!isPath && apiCall.ok && apiCall.data?.results?.length) {
        const best = apiCall.data.results[0];
        addNode(nodes, seen, best.constant, "UI_API_CONSTANT", best.constant, { file: best.file }, { source: "KNOWLEDGE_GRAPH" });
        if (best.resolution === "resolved" && best.endpoints?.length) {
          const ep = best.endpoints[0];
          const epId = `${ep.http_method} ${ep.path}`;
          addNode(nodes, seen, epId, "ENDPOINT", epId, null, { source: "KNOWLEDGE_GRAPH" });
          addEdge(edges, best.constant, epId, "CALLS_API", "VERIFIED", "KNOWLEDGE_GRAPH");
          const flowRes = await kgCall("get_business_flow", { service: ep.service, flow: ep.path.replace(/\//g, " ") });
          if (flowRes.ok) { flow = flowRes.data; ingestKGBusinessFlow(flow, nodes, edges, seen); }
          entryMethod = flow?.chain?.find((s) => s.role === "method")?.step
            ? `${flow.chain.find((s) => s.role === "controller")?.step}.${flow.chain.find((s) => s.role === "method")?.step}`
            : null;
        } else {
          unresolved.push({ query: best.constant, reason: best.resolution });
        }
      }

      if (entryMethod) {
        sources.push("CODE_CORTEX");
        const resolved = await ccFindQualifiedName(entryMethod.split(".").pop());
        if (resolved) {
          const cc = await ccCall("trace_path", {
            function_name: resolved.qualified_name,
            project: resolved.project,
            mode: "calls",
            direction: direction === "both" ? "outbound" : direction === "reverse" ? "inbound" : "outbound",
            depth,
            min_confidence: 0.8,
          });
          if (cc.ok) ingestCCCalls(cc.data, nodes, edges, seen);
          else unresolved.push({ query: entryMethod, reason: cc.error || "code_cortex_trace_failed" });
        } else {
          unresolved.push({ query: entryMethod, reason: "not_found_in_code_cortex" });
        }
      }
    } else {
      sources.push("CODE_CORTEX");
      const resolved = await ccFindQualifiedName(query);
      if (resolved) {
        const dirs = direction === "both" ? ["outbound", "inbound"] : [direction === "reverse" ? "inbound" : "outbound"];
        for (const d of dirs) {
          const cc = await ccCall("trace_path", {
            function_name: resolved.qualified_name,
            project: resolved.project,
            mode: "calls",
            direction: d,
            depth,
            min_confidence: 0.8,
          });
          if (cc.ok) ingestCCCalls(cc.data, nodes, edges, seen);
        }
        if (resolved.alternatives?.length > 1) {
          unresolved.push({
            query,
            reason: `ambiguous - ${resolved.alternatives.length} matches, used exact AST match "${resolved.qualified_name}" (not a naming-convention guess)`,
          });
        }
        const simpleName = resolved.qualified_name.split(/[.#]/).pop();
        for (const pe of await ccPersistenceEdges(resolved.project, simpleName)) {
          addNode(nodes, seen, pe.from, pe.from_label?.toUpperCase() || "NODE", pe.from, null, { source: "CODE_CORTEX" });
          addNode(nodes, seen, pe.to, pe.to_label?.toUpperCase() || "NODE", pe.to, null, { source: "CODE_CORTEX" });
          addEdge(edges, pe.from, pe.to, pe.relation, pe.confidence?.toUpperCase?.() || "VERIFIED", "CODE_CORTEX");
        }
      } else {
        unresolved.push({ query, reason: "not_found_in_code_cortex" });
      }

      sources.push("KNOWLEDGE_GRAPH");
      const kg = await kgCall("search_knowledge", { query, limit: 3 });
      if (kg.ok && kg.data?.results?.length) {
        for (const r of kg.data.results.slice(0, 3)) {
          addNode(nodes, seen, r.name, r.type.toUpperCase(), r.name, null, { source: "KNOWLEDGE_GRAPH", summary: r.summary });
        }
      }
      // Angular semantic layer: (click) savePatient / route paths / guards /
      // resolvers / components — see angularEnrich's doc comment for why
      // this is 3 calls rather than reusing the CC resolution above.
      await angularEnrich(query, nodes, edges, seen, direction, depth);
    }

    const payload = {
      query,
      nodes: nodes.slice(0, MAX_NODES),
      edges: dedupeEdges(edges).slice(0, MAX_EDGES),
      unresolved,
      metadata: {
        sources: [...new Set(sources)],
        durationMs: Date.now() - start,
        truncated: nodes.length > MAX_NODES || edges.length > MAX_EDGES,
      },
    };
    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
);

server.registerTool(
  "trace_usages",
  {
    description:
      "All known usages of a shared symbol (method/class/function): every caller from Code Cortex " +
      "(exact call-site level, never just the first match) plus any UI/API references from Knowledge Generator " +
      "if the symbol is API-facing.",
    inputSchema: { symbol: z.string(), depth: z.number().int().min(1).max(5).default(2) },
  },
  async ({ symbol, depth }) => {
    const start = Date.now();
    const nodes = [];
    const edges = [];
    const seen = new Set();
    const unresolved = [];
    const sources = [];

    // Not an early-return on CC miss: a symbol that's ONLY known to
    // Knowledge Generator (a route path, a guard/resolver class, a bare
    // template-event handler name) still has real usages worth surfacing.
    const resolved = await ccFindQualifiedName(symbol);
    let callerCount = 0;
    if (resolved) {
      sources.push("CODE_CORTEX");
      const cc = await ccCall("trace_path", {
        function_name: resolved.qualified_name,
        project: resolved.project,
        mode: "calls",
        direction: "inbound",
        depth,
        min_confidence: 0.8,
      });
      if (cc.ok) ingestCCCalls(cc.data, nodes, edges, seen);
      callerCount = (cc.data?.callers || []).length;
    } else {
      unresolved.push({ query: symbol, reason: "not_found_in_code_cortex" });
    }

    sources.push("KNOWLEDGE_GRAPH");
    const kg = await kgCall("resolve_ui_api", { query: symbol, limit: 20 });
    const uiUsages = kg.ok ? (kg.data?.results || []) : [];
    for (const u of uiUsages) {
      addNode(nodes, seen, u.constant, "UI_API_CONSTANT", u.constant, { file: u.file }, { source: "KNOWLEDGE_GRAPH", ui_project: u.ui_project });
    }

    // Reverse Angular tracing: handler -> template event, component/guard/
    // resolver -> route (see angularEnrich's doc comment).
    const te = await kgCall("find_template_events", { handler: symbol });
    if (te.ok && te.data?.results?.length) await ingestTemplateEvents(te.data.results, nodes, edges, seen);
    const dep = await kgCall("find_dependencies", { target: symbol, direction: "incoming", depth });
    if (dep.ok && dep.data && !dep.data.error) ingestKGDependencies(dep.data, symbol, nodes, edges, seen);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query: symbol,
            resolved_qualified_name: resolved?.qualified_name || null,
            caller_count: callerCount,
            ui_usage_count: uiUsages.length,
            nodes: nodes.slice(0, MAX_NODES),
            edges: dedupeEdges(edges).slice(0, MAX_EDGES),
            unresolved,
            metadata: { sources: [...new Set(sources)], durationMs: Date.now() - start },
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "trace_impact",
  {
    description:
      "Change-impact analysis for a symbol/API/table: direct+indirect callers, direct+indirect callees, " +
      "and (where resolvable) affected APIs/UI and inferred DB tables. Confidence-tagged; never silently " +
      "upgrades an inferred relationship to verified.",
    inputSchema: { target: z.string(), depth: z.number().int().min(1).max(5).default(3) },
  },
  async ({ target, depth }) => {
    const start = Date.now();
    const nodes = [];
    const edges = [];
    const seen = new Set();
    const unresolved = [];

    const resolved = await ccFindQualifiedName(target);
    if (resolved) {
      for (const d of ["inbound", "outbound"]) {
        const cc = await ccCall("trace_path", {
          function_name: resolved.qualified_name,
          project: resolved.project,
          mode: "calls",
          direction: d,
          depth,
          min_confidence: 0.8,
        });
        if (cc.ok) ingestCCCalls(cc.data, nodes, edges, seen);
      }
      const simpleName = resolved.qualified_name.split(/[.#]/).pop();
      for (const pe of await ccPersistenceEdges(resolved.project, simpleName)) {
        addNode(nodes, seen, pe.from, pe.from_label?.toUpperCase() || "NODE", pe.from, null, { source: "CODE_CORTEX" });
        addNode(nodes, seen, pe.to, pe.to_label?.toUpperCase() || "NODE", pe.to, null, { source: "CODE_CORTEX" });
        addEdge(edges, pe.from, pe.to, pe.relation, pe.confidence?.toUpperCase?.() || "VERIFIED", "CODE_CORTEX");
      }
    } else {
      unresolved.push({ query: target, reason: "not_found_in_code_cortex" });
    }

    const dbImpact = await kgCall("get_database_impact", { api: target });
    let dbImpactData = dbImpact.ok && !dbImpact.data?.error ? dbImpact.data : null;
    if (!dbImpactData) {
      const svcImpact = await kgCall("get_database_impact", { service: target });
      dbImpactData = svcImpact.ok && !svcImpact.data?.error ? svcImpact.data : null;
    }
    if (!dbImpactData) unresolved.push({ query: target, reason: "no_indexed_db_impact_relationship" });

    // Angular impact surface: template events that call this target,
    // routes/guards/resolvers that reach it, both directions (a changed
    // component can break the events that trigger it AND the routes that
    // reach it; a changed guard/resolver only matters via its routes).
    const te = await kgCall("find_template_events", { handler: target });
    if (te.ok && te.data?.results?.length) await ingestTemplateEvents(te.data.results, nodes, edges, seen);
    for (const dir of ["incoming", "outgoing"]) {
      const dep = await kgCall("find_dependencies", { target, direction: dir, depth });
      if (dep.ok && dep.data && !dep.data.error) ingestKGDependencies(dep.data, target, nodes, edges, seen);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            query: target,
            nodes: nodes.slice(0, MAX_NODES),
            edges: dedupeEdges(edges).slice(0, MAX_EDGES),
            db_impact: dbImpactData,
            unresolved,
            metadata: { sources: ["CODE_CORTEX", "KNOWLEDGE_GRAPH"], durationMs: Date.now() - start },
          }),
        },
      ],
    };
  }
);

server.registerTool(
  "index_status",
  {
    description:
      "Read-only index health check. Reports whether each configured project is indexed, its size, and " +
      "whether the working tree has uncommitted changes relative to the index (STALE) — never triggers " +
      "indexing, incremental or full, itself. Call this before relying on a trace result if data might be " +
      "stale; if it reports STALE or NOT_INDEXED, ask the user for permission before running an explicit " +
      "reindex (code-cortex-mcp's index_repository / knowledge-graph-generator's indexer.py) — do not just " +
      "run one.",
    inputSchema: { project: z.string().optional() },
  },
  async ({ project }) => {
    const projects = project ? [project] : CC_PROJECTS;
    const results = [];
    for (const proj of projects) {
      const status = await ccCall("index_status", { project: proj });
      if (!status.ok || !status.data || status.data.error) {
        results.push({ project: proj, indexExists: false, state: "NOT_INDEXED" });
        continue;
      }
      const d = status.data;
      let workingTreeChanged = null;
      let changedFilesSample = [];
      if (d.root_path) {
        try {
          const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: d.root_path });
          changedFilesSample = stdout.split("\n").filter(Boolean).slice(0, 20);
          workingTreeChanged = changedFilesSample.length > 0;
        } catch {
          /* not a git repo, or git unavailable — leave workingTreeChanged null rather than guess */
        }
      }
      results.push({
        project: proj,
        indexExists: true,
        state: workingTreeChanged ? "STALE" : "READY",
        nodes: d.nodes,
        edges: d.edges,
        indexedHeadSha: d.git?.head_sha || null,
        workingTreeChanged,
        changedFilesSample,
        rootPath: d.root_path || null,
      });
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            projects: results,
            note: "Read-only status check — no indexing was performed or triggered by this call.",
          }),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
