import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  createContext, loadSettings, kgDir, resolveVenvPython, resolveCodeCortex, resolveKgDb,
} from "../../core/path-resolver/index.js";

const execFileAsync = promisify(execFile);

// All OS-specific resolution (venv layout, Code Cortex binary, KG location)
// lives in shared/core/path-resolver — never hardcode a path here. Explicit
// UT_* env vars still win (the resolver honours them first).
const RESOLVE_CTX = createContext({ repoRoot: join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..") });
const SETTINGS = loadSettings(RESOLVE_CTX);
const KG_REPO = kgDir(RESOLVE_CTX, SETTINGS);
const _cc = resolveCodeCortex(RESOLVE_CTX, SETTINGS);
const _py = resolveVenvPython(RESOLVE_CTX, SETTINGS);

const CODE_CORTEX_BIN = _cc.path;
const KG_PYTHON = process.env.UT_KG_PYTHON || _py.path;
const KG_SCRIPT = process.env.UT_KG_SCRIPT || join(KG_REPO, "mcp_server_main.py");
const KG_DB_PATH = process.env.UT_KG_DB_PATH || resolveKgDb(RESOLVE_CTX, SETTINGS).tried[0];

// Which Code Cortex projects to search. Default: ask Code Cortex itself
// via list_projects on every call — new/removed projects need no config
// change here, ever (this is the fix for "can't always enter repo/project
// names"). UT_CODE_CORTEX_PROJECTS is an escape hatch to force a fixed
// list (e.g. to scope a call to one repo for speed) — set it only when you
// deliberately want to override auto-discovery, not as routine maintenance.
async function getCCProjects() {
  const explicit = (process.env.UT_CODE_CORTEX_PROJECTS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (explicit.length) return explicit;
  const listed = await ccCall("list_projects", {});
  if (listed.ok && listed.data?.projects?.length) {
    return listed.data.projects.map((p) => p.name);
  }
  return [];
}

const MAX_NODES = 400;
const MAX_EDGES = 800;

let ccClient = null;
let kgClient = null;

async function getCodeCortexClient() {
  if (ccClient) return ccClient;
  if (!CODE_CORTEX_BIN) {
    throw new Error(`Code Cortex binary not found (tried ${_cc.tried.join(", ")}). ${_cc.hint}`);
  }
  // CBM_CACHE_DIR (Code Cortex's index store) is forwarded when set, so a platform-local
  // cache can be used/validated without touching the per-user default one.
  const transport = new StdioClientTransport({
    command: CODE_CORTEX_BIN,
    args: [],
    env: process.env.CBM_CACHE_DIR ? { CBM_CACHE_DIR: process.env.CBM_CACHE_DIR } : undefined,
  });
  const client = new Client({ name: "unified-trace/code-cortex", version: "1.0.0" });
  await client.connect(transport);
  ccClient = client;
  return client;
}

async function getKnowledgeGraphClient() {
  if (kgClient) return kgClient;
  if (!KG_PYTHON) {
    throw new Error(`Knowledge Graph venv python not found (tried ${_py.tried.join(", ")}). ${_py.hint}`);
  }
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
  for (const project of await getCCProjects()) {
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
  for (const project of await getCCProjects()) {
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
    const projects = project ? [project] : await getCCProjects();
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

// ===========================================================================
// saga — one composed trace: UI trigger -> endpoint -> backend methods ->
// cross-service hops (Feign / WebClient / Kafka) -> DB reads/writes.
//
// Why a separate tool: KG has the edge facts (endpoints, Kafka, Feign, DB,
// UI events) but no method-to-method CALLS; Code Cortex has the calls but
// stops at interfaces (a call to `service.foo()` lands on a per-file stub,
// the implementing method is linked only by an OVERRIDE edge) and knows
// nothing about Kafka/Feign/DB. Neither answers "what happens end to end".
// This walks Code Cortex calls, follows stub -> interface -> impl via
// OVERRIDE, attaches KG effects to every visited method, follows cross-
// service hops recursively, and prunes to branches that reach an effect.
// Everything unresolvable is reported in `gaps` with its reason — never
// filled in by guessing.
// ===========================================================================
// Accessor-looking names (getPatient, isActive, ...) are NOT filtered by name:
// Feign proxies and service methods are routinely named getX. Data-class
// accessors are dropped by package (SAGA_NOISE_PKG_RE) instead.
const SAGA_NOISE_NAME_RE = /^(toString|equals|hashCode|builder|build|split|of|valueOf|name|ordinal)$/;
const SAGA_NOISE_PKG_RE = /\.(dto|dtos|model|models|entity|entities|collection|vo|constants?|enums?|exceptions?|mappers?|config|configuration)\./;
const SAGA_GENERIC_UI_NAMES = new Set(["onResult", "onError", "ngOnInit", "subscribe", "toggle", "search", "filter", "refresh", "submit", "delete", "update", "remove", "reset", "clear", "close", "open", "handle", "process", "onSave", "onCancel", "onClose", "onSubmit", "constructor"]);
const cy = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const short = (p) => (p ? p.split("/").pop() : "?");

async function ccRows(project, query) {
  const r = await ccCall("query_graph", { project, query });
  return r.ok && Array.isArray(r.data?.rows) ? r.data.rows : [];
}

function ccSplit(qn, project) {
  const rest = qn.startsWith(project + ".") ? qn.slice(project.length + 1) : qn;
  const m = /^src\.main\.java\.(.+)$/.exec(rest);
  const parts = (m ? m[1] : rest).split(".");
  const method = parts.pop();
  const cls = parts.pop();
  return { cls, method, fqn: [...parts, cls].join("."), hasSrcRoot: !!m };
}

// Code Cortex qualified name -> KG method spec ("pkg.Class#method").
const kgSpecFromCC = (qn, project) => {
  const s = ccSplit(qn, project);
  return s.hasSrcRoot ? `${s.fqn}#${s.method}` : `${s.cls}#${s.method}`;
};

async function ccProjectByService(ctx, kgService) {
  if (!ctx.projects) {
    const r = await ccCall("list_projects", { include_details: true });
    ctx.projects = r.ok ? (r.data?.projects || []) : [];
  }
  const base = kgService.split("/").pop();
  return ctx.projects.find((p) => p.root_path && p.root_path.split("/").pop() === base)?.name || null;
}

function serviceOfProject(ctx, project) {
  const p = (ctx.projects || []).find((x) => x.name === project);
  return p?.root_path ? `${/\/UI\//.test(p.root_path) ? "UI" : "BE"}/${p.root_path.split("/").pop()}` : project;
}

// Stub / interface method -> the implementing method(s). Code Cortex's CALLS
// edge lands on a per-file `Function` stub; its declaring interface `Method`
// shares name + file; impls point at that interface method with OVERRIDE.
// One query per project, cached for the whole saga: every OVERRIDE edge as
// (interface method, its file) -> implementing methods. Per-callee queries made
// a 60-method walk take minutes; this is one ~0.2s round trip.
async function ccOverrideMap(ctx, project) {
  ctx.overrides = ctx.overrides || new Map();
  if (ctx.overrides.has(project)) return ctx.overrides.get(project);
  const implsByIface = new Map();
  const ifaceByNameFile = new Map();
  const implInfo = new Map();
  for (const [ifaceQn, ifaceName, ifaceFile, implQn, implFile, implLine] of await ccRows(
    project, "MATCH (a)-[e:OVERRIDE]->(b) RETURN b.qualified_name, b.name, b.file_path, a.qualified_name, a.file_path, a.start_line")) {
    (implsByIface.get(ifaceQn) || implsByIface.set(ifaceQn, []).get(ifaceQn)).push(implQn);
    const key = `${ifaceName}|${ifaceFile}`;
    const list = ifaceByNameFile.get(key) || ifaceByNameFile.set(key, new Set()).get(key);
    list.add(ifaceQn);
    implInfo.set(implQn, { file: implFile, line: implLine });
  }
  const map = { implsByIface, ifaceByNameFile, implInfo };
  ctx.overrides.set(project, map);
  return map;
}

// Stub / interface method -> the implementing method(s), using the cached map.
// `file` is the callee's own declaring file (from trace_path), which is how a
// per-file `Function` stub is tied back to its interface `Method`.
async function ccDispatchTargets(ctx, project, qn, name, file, callerQn) {
  const { implsByIface, ifaceByNameFile } = await ccOverrideMap(ctx, project);
  let ifaces = [];
  let via = null;
  if (implsByIface.has(qn)) { ifaces = [qn]; via = "interface→impl"; }
  else {
    const stub = ifaceByNameFile.get(`${name}|${file}`);
    if (stub) { ifaces = [...stub]; via = "stub→interface→impl"; }
  }
  const impls = new Set();
  for (const i of ifaces) for (const impl of implsByIface.get(i) || []) impls.add(impl);
  const all = [...impls];
  if (all.length <= 1) return all.length ? { targets: all, dispatch: via } : { targets: [qn], dispatch: null };
  // Several implementations (e.g. a DataImportHandler.save with 10 impls): the
  // call graph can't say which one this call site reaches. Follow it only when
  // the caller is itself one of them (a self-call); otherwise report the
  // ambiguity — expanding an arbitrary subset would invent hops.
  const callerClass = callerQn ? ccSplit(callerQn, project).fqn : null;
  const own = all.filter((i) => ccSplit(i, project).fqn === callerClass);
  if (own.length) return { targets: own.slice(0, 1), dispatch: `${via}, self-call` };
  return {
    targets: [], dispatch: null,
    ambiguous: { iface: `${ccSplit(ifaces[0], project).cls}.${name}`, count: all.length, sample: all.slice(0, 3).map((i) => ccSplit(i, project).cls) },
  };
}

async function ccResolveFromKg(project, kgQn) {
  const [clsFqn, rest] = kgQn.split("#");
  const method = (rest || "").split("(")[0];
  const guess = `${project}.src.main.java.${clsFqn}.${method}`;
  const rows = await ccRows(project, `MATCH (m {qualified_name: "${cy(guess)}"}) RETURN m.label, m.file_path, m.start_line`);
  if (rows.length) return { qn: guess, file: rows[0][1], line: rows[0][2] };
  const s = await ccCall("search_graph", { project, name_pattern: `^${method}$`, qn_pattern: `.*${clsFqn.replace(/\./g, "\\.")}\\.${method}$`, limit: 3 });
  const hit = s.ok ? s.data?.results?.[0] : null;
  return hit ? { qn: hit.qualified_name, file: hit.file_path, line: hit.start_line } : null;
}

async function kgEffects(specs, service) {
  const out = new Map();
  for (let i = 0; i < specs.length; i += 40) {
    const chunk = specs.slice(i, i + 40);
    const r = await kgCall("saga_method_effects", { methods: chunk, ...(service ? { service } : {}) });
    for (const res of r.ok ? (r.data?.results || []) : []) out.set(res.spec, res);
  }
  return out;
}

const hasEffects = (e) => !!e && (e.db.length || e.kafka_publishes.length || e.kafka_consumes.length || e.service_calls.length || e.async.length);

// --- Cross-checking Code Cortex call edges against the Knowledge Generator ---
// Code Cortex resolves many calls by NAME (strategy "suffix_match", confidence
// 0.01-0.55): `repo.findById(..)` on a Spring Data interface gets bound to any
// project method called findById. The KG doesn't have method calls, but it does
// know each class's wiring (@Autowired AND constructor-injected dependencies,
// supertypes, bean-ness). A Spring bean can only be reached through an injected
// dependency, so a call into a bean the caller doesn't depend on is rejected.
async function sagaClassFacts(ctx, service, names) {
  ctx.classFacts = ctx.classFacts || new Map();
  const need = [...new Set(names.filter(Boolean))].filter((n) => !ctx.classFacts.has(`${service}|${n}`));
  for (let i = 0; i < need.length; i += 80) {
    const chunk = need.slice(i, i + 80);
    const r = await kgCall("saga_class_facts", { classes: chunk, service });
    const res = r.ok ? (r.data?.classes || {}) : {};
    for (const n of chunk) ctx.classFacts.set(`${service}|${n}`, res[n] || { found: false, is_bean: false, depends_on: [], supertypes: [] });
  }
}

// Typed calls on injected dependencies, from the Knowledge Generator: the callee
// class comes from the field's declared type, so these are exact where Code
// Cortex misses the call or binds it by name. Merged into the walk with Code
// Cortex's edges (and, being type-resolved, exempt from the plausibility check).
async function kgDepCalls(specs, service) {
  const out = new Map();
  for (let i = 0; i < specs.length; i += 40) {
    const chunk = specs.slice(i, i + 40);
    const r = await kgCall("saga_method_calls", { methods: chunk, ...(service ? { service } : {}) });
    for (const res of r.ok ? (r.data?.results || []) : []) out.set(res.spec, res.calls || []);
  }
  return out;
}

function sagaCalleeClass(c, project) {
  const s = ccSplit(c.qualified_name, project);
  if (/^[A-Z]/.test(s.cls || "")) return s.cls;
  const base = (c.file || "").split("/").pop();   // per-file `Function` stub: the declaring file names the class
  return base.endsWith(".java") ? base.slice(0, -5) : null;
}

function sagaCallPlausible(ctx, service, callerCls, calleeCls, conf) {
  if (!calleeCls) return true;
  const callee = ctx.classFacts.get(`${service}|${calleeCls}`);
  const caller = ctx.classFacts.get(`${service}|${callerCls}`);
  // A self-call — including a call to the caller's own interface/superclass, which is
  // how an impl's own methods appear — still needs strong evidence: `dto.getX()` is
  // bound by name to this class's own getX(), and because Code Cortex's edge list is
  // keyed by bare method name that match can inherit the confidence of a genuine
  // sibling edge (up to 0.75, "unique_name"). Genuine self-calls resolve by type
  // dispatch at 0.9+.
  if (calleeCls === callerCls || (caller?.supertypes || []).includes(calleeCls)) return (conf ?? 1) >= 0.9;
  const c = conf ?? 0.5;
  if (!callee?.found) return c >= 0.75;                       // KG doesn't know the class
  if (!callee.is_bean) return c >= 0.5;                       // utility / static holder: no DI to check
  if (!caller?.found || !caller.depends_on.length) return c >= 0.75;   // no wiring info for the caller
  const deps = new Set(caller.depends_on);
  return deps.has(calleeCls) || callee.supertypes.some((s) => deps.has(s)) || caller.supertypes.includes(calleeCls);
}

// BFS over Code Cortex calls from one method, inside one service.
async function sagaWalkService(ctx, { service, project, startQn, maxDepth, maxMethods, viaLabel }) {
  const walk = { service, project, nodes: new Map(), order: [], hopsByNode: new Map(), noiseSkipped: 0, truncated: false, viaLabel };
  const start = await ccRows(project, `MATCH (m {qualified_name: "${cy(startQn)}"}) RETURN m.file_path, m.start_line`);
  const root = { id: startQn, depth: 0, parent: null, dispatch: null, file: start[0]?.[0], line: start[0]?.[1] };
  walk.nodes.set(root.id, root);
  walk.order.push(root.id);
  let frontier = [root];
  for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
    const specs = frontier.map((n) => kgSpecFromCC(n.id, project));
    const effects = await kgEffects([...new Set(specs)], service);
    frontier.forEach((n, i) => { n.effects = effects.get(specs[i]) || null; });
    if (depth === maxDepth) break;
    const depCalls = await kgDepCalls([...new Set(specs)], service);
    const next = [];
    for (const node of frontier) {
      const t = await ccCall("trace_path", { function_name: node.id, project, mode: "calls", direction: "outbound", depth: 1 });
      const callees = (t.ok ? (t.data?.callees || []) : []).slice(0, 40);
      const have = new Set(callees.map((c) => c.qualified_name));
      for (const dc of depCalls.get(kgSpecFromCC(node.id, project)) || []) {
        if (!dc.class_fqn) continue;
        const qn = `${project}.src.main.java.${dc.class_fqn}.${dc.method}`;
        if (!have.has(qn)) { have.add(qn); callees.push({ qualified_name: qn, name: dc.method, file: null, start_line: null, _kg: true }); }
      }
      const edgeConf = new Map();   // callee edges are keyed by bare name; keep the best confidence per name
      for (const e of t.ok ? (t.data?.callee_edges || []) : []) edgeConf.set(e.to, Math.max(edgeConf.get(e.to) ?? 0, e.confidence ?? 0));
      const callerCls = ccSplit(node.id, project).cls;
      await sagaClassFacts(ctx, service, [callerCls, ...callees.map((c) => sagaCalleeClass(c, project))]);
      for (const c of callees) {
        if (!c.qualified_name.startsWith(project + ".")) continue;
        if (!c._kg && (SAGA_NOISE_NAME_RE.test(c.name) || SAGA_NOISE_PKG_RE.test(c.qualified_name))) { walk.noiseSkipped++; continue; }
        if (!c._kg && !sagaCallPlausible(ctx, service, callerCls, sagaCalleeClass(c, project), edgeConf.get(c.name))) {
          ctx.kgRejected = (ctx.kgRejected || 0) + 1;
          continue;
        }
        const d = await ccDispatchTargets(ctx, project, c.qualified_name, c.name, c.file, node.id);
        if (d.ambiguous) {
          ctx.gaps?.push(`Dispatch not followed from ${ccSplit(node.id, project).cls}.${ccSplit(node.id, project).method}: ${d.ambiguous.iface} has ${d.ambiguous.count} implementations (${d.ambiguous.sample.join(", ")}, …) and the call graph can't tell which this call site reaches`);
          continue;
        }
        const { implInfo } = await ccOverrideMap(ctx, project);
        for (const target of d.targets) {
          if (walk.nodes.has(target)) continue;
          if (walk.nodes.size >= maxMethods) { walk.truncated = true; continue; }
          const info = implInfo.get(target);
          let file = info?.file || c.file;
          let line = info?.line || c.start_line;
          if (!file) {   // callee came from the KG: look up where Code Cortex has it
            const r = await ccRows(project, `MATCH (m {qualified_name: "${cy(target)}"}) RETURN m.file_path, m.start_line`);
            file = r[0]?.[0]; line = r[0]?.[1];
          }
          const child = { id: target, depth: depth + 1, parent: node.id, dispatch: d.dispatch || (c._kg ? "DI-typed call, KG" : null), file, line };
          walk.nodes.set(target, child);
          walk.order.push(target);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return walk;
}

// Every effect-bearing method in a walk, plus its cross-service hop targets.
function collectHops(ctx, walk, gaps) {
  const hops = [];
  for (const node of walk.nodes.values()) {
    const e = node.effects;
    if (!e) continue;
    for (const c of e.service_calls) {
      if (c.resolved && c.handler_qualified_name) {
        hops.push({ node, type: c.kind.replace("_CALL", ""), label: `${c.http_method || ""} ${c.path || ""}`.trim(), service: c.service, kgQn: c.handler_qualified_name, confidence: c.confidence });
      } else {
        gaps.push(`${c.kind} ${c.http_method || ""} ${c.path || ""} from ${ccSplit(node.id, walk.project).cls}.${ccSplit(node.id, walk.project).method}: not followed — ${c.reason || "target not indexed"}${c.target ? ` (${c.target})` : ""}`);
      }
    }
    for (const p of e.kafka_publishes) {
      if (!p.topic || !/^[A-Za-z0-9_.\-]+$/.test(p.topic)) {
        gaps.push(`KAFKA publish from ${ccSplit(node.id, walk.project).cls}.${ccSplit(node.id, walk.project).method}: topic is a runtime expression (${p.topic || "?"}) — consumers can't be linked`);
      } else {
        hops.push({ node, type: "KAFKA", topic: p.topic, label: `topic ${p.topic}`, confidence: p.confidence });
      }
    }
  }
  return hops;
}

async function sagaFollowHops(ctx, walk, hopList, gaps, depthLeft) {
  for (const hop of hopList) {
    let targets = [];
    if (hop.type === "KAFKA") {
      if (!ctx.topicCache.has(hop.topic)) {
        const r = await kgCall("saga_topic_flow", { topic: hop.topic });
        ctx.topicCache.set(hop.topic, r.ok ? (r.data?.topics || []).find((t) => t.topic === hop.topic) || null : null);
      }
      const flow = ctx.topicCache.get(hop.topic);
      const consumers = flow?.consumers || [];
      if (!consumers.length) {
        gaps.push(`KAFKA topic ${hop.topic}: no consumer indexed (consuming service may not be checked out/indexed)`);
        continue;
      }
      targets = consumers.slice(0, 6).map((c) => ({ service: c.service, kgQn: c.method_qualified_name, confidence: c.confidence }));
    } else {
      targets = [{ service: hop.service, kgQn: hop.kgQn, confidence: hop.confidence }];
    }
    for (const t of targets) {
      const key = `${t.service}|${t.kgQn}`;
      const record = { type: hop.type, label: hop.label, service: t.service, confidence: hop.confidence, walk: null, note: null };
      if (hop.type === "KAFKA" && targets.length > 1) {
        // A shared/multiplexed topic: each consumer typically branches on the payload
        // (e.g. requestType), and the graph can't tell which branch this event takes.
        record.note = `${targets.length} consumers on this topic; each may branch on the event payload — only the matching branch applies, read the consumer to see which`;
      }
      (walk.hopsByNode.get(hop.node.id) || walk.hopsByNode.set(hop.node.id, []).get(hop.node.id)).push(record);
      if (ctx.visitedHops.has(key)) { record.note = "already traced above"; continue; }
      ctx.visitedHops.add(key);
      if (depthLeft <= 0) { record.note = "service-hop limit reached — raise max_service_hops to follow"; continue; }
      const project = await ccProjectByService(ctx, t.service);
      if (!project) { record.note = "service not indexed in Code Cortex"; gaps.push(`${hop.type} hop into ${t.service}: service not indexed in Code Cortex`); continue; }
      const found = await ccResolveFromKg(project, t.kgQn);
      if (!found) { record.note = "handler not found in Code Cortex"; gaps.push(`${hop.type} hop into ${t.service}: ${t.kgQn} not found in Code Cortex`); continue; }
      // Cross-service walks get a smaller budget than the entry service's: they are context, not the subject.
      const child = await sagaWalkService(ctx, { service: t.service, project, startQn: found.qn, maxDepth: ctx.maxDepth, maxMethods: Math.min(ctx.maxMethods, 60) });
      record.walk = child;
      await sagaFollowHops(ctx, child, collectHops(ctx, child, gaps), gaps, depthLeft - 1);
    }
  }
}

// Keep only methods that have effects/hops, plus their ancestors.
function sagaKeep(walk) {
  const keep = new Set([walk.order[0]]);
  for (const id of walk.order) {
    const n = walk.nodes.get(id);
    if (hasEffects(n.effects) || walk.hopsByNode.has(id)) {
      for (let cur = id; cur; cur = walk.nodes.get(cur)?.parent) keep.add(cur);
    }
  }
  return keep;
}

function sagaRender(walk, lines, indent, summary) {
  const keep = sagaKeep(walk);
  const kids = new Map();
  for (const id of walk.order) {
    const p = walk.nodes.get(id).parent;
    if (p) (kids.get(p) || kids.set(p, []).get(p)).push(id);
  }
  const pad = (n) => "  ".repeat(n);
  const visit = (id, level) => {
    const n = walk.nodes.get(id);
    const s = ccSplit(id, walk.project);
    lines.push(`${pad(indent + level)}${level ? "└ " : ""}${s.cls}.${s.method}  [${short(n.file)}:${n.line ?? "?"}]${n.dispatch ? `  (${n.dispatch})` : ""}`);
    const e = n.effects;
    for (const d of e?.db || []) {
      if (!d.table) {
        // The access is real (a template call) but its collection/table couldn't be resolved:
        // say so, and keep it out of the table lists rather than reporting a table called "null".
        const via = d.via || "unknown call";
        summary.unresolvedDb.add(`${d.access} via ${via}`);
        lines.push(`${pad(indent + level + 2)}DB ${d.access} <collection not resolved> via ${via} [${d.confidence || "unknown"}]`);
        continue;
      }
      const key = `${d.table} (${d.engine})`;
      (d.access === "write" ? summary.writes : summary.reads).add(key);
      lines.push(`${pad(indent + level + 2)}DB ${d.access} ${key} ${d.operation || ""} via ${d.via || "SQL"}${d.unresolved ? ` [collection unresolved: ${d.unresolved}]` : ""} [${d.confidence || "?"}]`);
    }
    for (const p of e?.kafka_publishes || []) { summary.topics.add(p.topic); }
    for (const a of e?.async || []) lines.push(`${pad(indent + level + 2)}ASYNC hand-off (${a.kind === "RUNS" ? "batch job" : "CompletableFuture/@Async"}): ${(a.target || "").replace(/#async\d+$/, "")}`);
    for (const h of walk.hopsByNode.get(id) || []) {
      lines.push(`${pad(indent + level + 2)}⇒ ${h.type} ${h.label} → ${h.service}  [${h.confidence || "?"}]${h.note ? `  (${h.note})` : ""}`);
      if (h.walk) {
        summary.services.add(h.service);
        const childRoot = h.walk.order[0];
        lines.push(`${pad(indent + level + 3)}— ${h.service} —`);
        sagaRender(h.walk, lines, indent + level + 3, summary);
        void childRoot;
      }
    }
    for (const k of kids.get(id) || []) if (keep.has(k)) visit(k, level + 1);
  };
  visit(walk.order[0], 0);
  if (walk.truncated) lines.push(`${pad(indent)}(walk truncated at ${walk.nodes.size} methods — raise depth/limits or narrow the target)`);
}

// The KG links a UI *file* to the constant it uses, not which method — so its
// per-component template events are only candidates. Narrow them with Code
// Cortex's TypeScript call graph: methods whose text contains the constant
// (search_code returns the containing methods) are the seeds; their callers,
// walked upward, are the handlers that can really trigger the call.
// narrowing = many Code Cortex text searches; never let it dominate a saga. Wall-clock, so slow
// machines/loaded Code Cortex see partial results at the default — raise it via
// UT_SAGA_UI_NARROW_BUDGET_MS (tests use a generous value). Hitting it is always reported: a gap
// line plus metadata.ui_narrowing.timed_out.
const SAGA_UI_NARROW_BUDGET_MS = (() => {
  const n = Number(process.env.UT_SAGA_UI_NARROW_BUDGET_MS);
  return Number.isFinite(n) && n >= 1000 ? n : 60000;
})();
const SAGA_UI_CHAINS_SHOWN = 3;
const SAGA_UI_EVENTS_SHOWN = (() => {
  const n = Number(process.env.UT_SAGA_UI_EVENTS_SHOWN);
  return Number.isInteger(n) && n >= 1 ? n : 12;
})();
const SAGA_UI_CHAINS_NARROWED = 4;

async function sagaNarrowUi(ctx, chains, gaps) {
  await ccProjectByService(ctx, "x/x");
  const t0 = Date.now();
  const deadline = t0 + SAGA_UI_NARROW_BUDGET_MS;
  ctx.uiNarrowing = { budget_ms: SAGA_UI_NARROW_BUDGET_MS, elapsed_ms: 0, timed_out: false, chains_skipped: 0 };
  try { await sagaNarrowUiInner(ctx, chains, gaps, deadline); }
  finally { ctx.uiNarrowing.elapsed_ms = Date.now() - t0; }
}

async function sagaNarrowUiInner(ctx, chains, gaps, deadline) {
  for (const ch of chains) {
    if (Date.now() > deadline) {
      ctx.uiNarrowing.timed_out = true; ctx.uiNarrowing.chains_skipped++;
      gaps.push(`UI narrowing for ${ch.constant}: skipped (${SAGA_UI_NARROW_BUDGET_MS / 1000}s narrowing budget) — component-level candidates only`);
      continue;
    }
    const labels = new Set([...ch.used_in.map((u) => u.ui_project), ...(ch.defined_in || [])]);
    // A KG UI label is `UI/<repoDir>-root-app` (split repos), `<repoDir>/<sub>` or a bare
    // sub-project name (monolith library). Map it to the Code Cortex UI project by repo dir.
    const uiRepoDirs = ctx.projects.filter((p) => p.root_path && /\/UI\//.test(p.root_path)).map((p) => p.root_path.split("/").pop());
    const repoDirOf = (label) => {
      const l = label.replace(/^UI\//, "");
      const hit = uiRepoDirs.filter((d) => l === d || l.startsWith(`${d}-`) || l.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0];
      if (hit) return hit;
      return label.includes("/") && !label.startsWith("UI/") ? label.split("/")[0] : "lifetrenz-core";
    };
    const rootDirs = new Set([...labels].map(repoDirOf));
    const uiProjects = ctx.projects.filter((p) => p.root_path && /\/UI\//.test(p.root_path) && rootDirs.has(p.root_path.split("/").pop()));
    // Code Cortex's TS call graph has no inbound CALLS for Angular DI calls
    // (`this.service.method()`) or callbacks passed by reference, so callers are
    // found by TEXT call sites instead: search_code(".name(") returns the
    // methods containing that call. Name-matched, therefore "inferred" — and
    // deliberately skipped for generic names (save/get/...) that would match
    // half the codebase.
    const closure = new Set();
    let seedCount = 0;
    const tail = (q) => q.split(".").slice(-2).join(".");
    const isMethod = (x) => x.label === "Method" || x.label === "Function";
    // A derived constant ("Base.FIELD + /unread-count") never appears verbatim in source
    // (`${Base.FIELD}/unread-count`), so its call sites are found by the literal suffix.
    let seedPattern = ch.constant;
    const derived = /^(\S+) \+ \/(.+)$/.exec(ch.constant);
    if (derived) {
      const literal = derived[2].split("/").filter((seg) => seg && seg !== "{v}").sort((a, b) => b.length - a.length)[0];
      seedPattern = literal ? `/${literal}` : derived[1];
    }
    let timedOut = false;
    for (const p of uiProjects) {
      if (Date.now() > deadline) { timedOut = true; break; }
      const s = await ccCall("search_code", { project: p.name, pattern: seedPattern, limit: 15 });
      let frontier = (s.ok ? (s.data?.results || []) : []).filter(isMethod).slice(0, 8);
      seedCount += frontier.length;
      frontier.forEach((r) => closure.add(tail(r.qualified_name)));
      for (let hop = 0; hop < 3 && frontier.length; hop++) {
        if (Date.now() > deadline) { timedOut = true; break; }
        const next = [];
        for (const m of frontier.filter((r) => r.node.length >= 5 && !SAGA_GENERIC_UI_NAMES.has(r.node)).slice(0, 6)) {
          const cs = await ccCall("search_code", { project: p.name, pattern: `.${m.node}(`, limit: 15 });
          for (const r of (cs.ok ? (cs.data?.results || []) : []).filter(isMethod)) {
            if (!closure.has(tail(r.qualified_name))) { closure.add(tail(r.qualified_name)); next.push(r); }
          }
        }
        frontier = next;
      }
    }
    ch.exact = false;
    if (timedOut) ctx.uiNarrowing.timed_out = true;
    if (timedOut) gaps.push(`UI narrowing for ${ch.constant}: stopped at the ${SAGA_UI_NARROW_BUDGET_MS / 1000}s narrowing budget — call-site search is partial`);
    if (!closure.size) {
      gaps.push(`UI narrowing for ${ch.constant}: Code Cortex has no method referencing it in the UI project(s) [${[...rootDirs].join(", ")}] — showing component-level events only (re-index the UI repo in Code Cortex if it changed)`);
      continue;
    }
    let matched = 0;
    for (const c of ch.components) {
      const hit = c.template_events.filter((e) => e.method && closure.has(`${c.component}.${e.method}`));
      c.matched_events = hit;
      matched += hit.length;
    }
    ch.exact = matched > 0;
    if (!ch.exact) {
      // No click/event handler reaches the call, but the call may still sit in a component's
      // own method (ngOnInit, a load callback, ...): name that component and method instead
      // of listing every component that merely injects the service.
      const byClass = new Map();
      for (const k of closure) {
        const [cls, m] = k.split(".");
        if (!byClass.has(cls)) byClass.set(cls, []);
        byClass.get(cls).push(m);
      }
      const direct = ch.components.filter((c) => byClass.has(c.component));
      if (direct.length) {
        for (const c of direct) c.caller_methods = byClass.get(c.component).slice(0, 4);
        ch.direct = direct;
        gaps.push(`UI trigger for ${ch.constant}: the call sits in component method(s), not behind a template event handler (lifecycle / callback / message handler) — shown as "calls it in"; name-matched call sites, inferred`);
      } else {
        gaps.push(`UI narrowing for ${ch.constant}: ${seedCount} referencing method(s) found but no template event's handler reaches them in the call graph — events shown are component-level candidates`);
      }
    }
  }
}

async function sagaEntries(ctx, target, method, service, gaps) {
  const isApi = /^(GET|POST|PUT|DELETE|PATCH)\s+\//i.test(target) || /^https?:\/\//i.test(target) || target.startsWith("/") ||
    (/\//.test(target) && !/[#(]/.test(target) && !/\s/.test(target));
  const entries = [];
  const fromEndpoint = async (t, m, s) => {
    const r = await kgCall("saga_entry", { target: t, ...(m ? { method: m } : {}), ...(s ? { service: s } : {}) });
    if (!r.ok || !r.data?.candidates) { gaps.push(`Entry: ${r.error || r.data?.error?.message || "no endpoint matched"} (${t})`); return; }
    for (const c of r.data.candidates.slice(0, 3)) entries.push({ kind: "api", ...c });
  };
  if (isApi) {
    await fromEndpoint(target, method, service);
  } else if (/ApiConstant\.[A-Z0-9_]+$/.test(target)) {
    const r = await kgCall("resolve_ui_api", { query: target, limit: 1 });
    const best = r.ok ? r.data?.results?.[0] : null;
    if (best?.endpoints?.length) {
      for (const ep of best.endpoints.slice(0, 2)) await fromEndpoint(`${ep.http_method} ${ep.path}`, null, ep.service);
    } else {
      gaps.push(`UI constant ${target}: ${best?.resolution || "not found"} — cannot reach a backend endpoint`);
    }
  } else {
    if (/^[A-Z][A-Z0-9_]{4,}$/.test(target) || /^[A-Za-z0-9_.\-]+$/.test(target) && !/[#.]/.test(target)) {
      const r = await kgCall("saga_topic_flow", { topic: target });
      const flow = r.ok ? (r.data?.topics || []).find((t) => t.topic === target) : null;
      if (flow) {
        for (const c of flow.consumers.slice(0, 5)) entries.push({ kind: "kafka", topic: target, service: c.service, handler_qualified_name: c.method_qualified_name, publishers: flow.publishers });
        if (!flow.consumers.length) gaps.push(`KAFKA topic ${target}: published but no consumer indexed`);
        return entries;
      }
    }
    const found = await ccFindQualifiedName(target);
    if (found) entries.push({ kind: "symbol", project: found.project, ccQn: found.qualified_name });
    else gaps.push(`Entry: '${target}' not found as an endpoint, UI constant, Kafka topic, or symbol`);
  }
  return entries;
}

server.registerTool(
  "saga",
  {
    description:
      "End-to-end saga of ONE action: UI trigger (route/component/event) -> backend endpoint -> service/repository methods " +
      "-> cross-service hops (Feign/WebClient/Kafka publish->consumer) -> DB reads/writes (SQL and Mongo). " +
      "Give ANY of: a gateway URL ('https://host/api-gateway/ipd-clinical/settings/<id>'), 'PUT /settings/{id}', a UI API " +
      "constant ('MRDApiConstant.X'), a Kafka topic, or a backend 'Class.method'. Same path with different HTTP methods " +
      "returns every handler. Interface->implementation dispatch is followed. Output is a compact rendered chain plus " +
      "`gaps` (every link that could not be followed, with the reason) — it never invents a hop. UI part is component-level. " +
      "Graph-derived: verify any hop that matters by reading the cited file:line.",
    inputSchema: {
      target: z.string(),
      method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional(),
      service: z.string().optional(),
      depth: z.number().int().min(1).max(10).default(6),
      max_service_hops: z.number().int().min(0).max(5).default(3),
      max_methods: z.number().int().min(10).max(400).default(150),
      max_lines: z.number().int().min(40).max(2000).default(250),
      include_ui: z.boolean().default(true),
    },
  },
  async ({ target, method, service, depth, max_service_hops, max_methods, max_lines, include_ui }) => {
    const start = Date.now();
    const ctx = { projects: null, topicCache: new Map(), visitedHops: new Set(), maxDepth: depth, maxMethods: max_methods };
    const printedTopics = new Set();
    const gaps = [];
    ctx.gaps = gaps;
    const lines = [];
    const summary = { writes: new Set(), reads: new Set(), topics: new Set(), services: new Set(), unresolvedDb: new Set() };
    let methodsVisited = 0;

    const entries = await sagaEntries(ctx, target.trim(), method, service, gaps);
    for (const entry of entries) {
      let startProject, startQn, svc;
      if (entry.kind === "symbol") {
        startProject = entry.project; startQn = entry.ccQn;
        // ccFindQualifiedName may hand back the caller's short input ("Class.method");
        // resolve the canonical qualified name so file/line and de-duplication work.
        const [cls, meth] = target.includes("#") ? target.split("#") : [target.split(".").slice(-2)[0], target.split(".").pop()];
        const canon = await ccCall("search_graph", { project: startProject, name_pattern: `^${meth.split("(")[0]}$`, qn_pattern: `.*\\.${cls}\\.${meth.split("(")[0]}$`, label: "Method", limit: 3 });
        const hit = canon.ok ? canon.data?.results?.[0] : null;
        if (hit) startQn = hit.qualified_name;
      } else {
        svc = entry.service;
        startProject = await ccProjectByService(ctx, svc);
        const found = startProject && entry.handler_qualified_name ? await ccResolveFromKg(startProject, entry.handler_qualified_name) : null;
        if (!found) { gaps.push(`Entry ${entry.http_method || ""} ${entry.path || ""} (${svc}): handler not found in Code Cortex`); continue; }
        startQn = found.qn;
      }
      await ccProjectByService(ctx, "x/x"); // ensures ctx.projects is loaded for serviceOfProject
      svc = svc || serviceOfProject(ctx, startProject);
      summary.services.add(svc);

      if (entry.kind === "api") {
        lines.push(`■ ${entry.http_method} ${entry.path}  →  ${entry.controller}.${entry.handler}  [${short(entry.file)}:${entry.line}]  (${svc})`);
        if (include_ui) {
          const ui = await kgCall("saga_ui_trigger", { endpoint_id: entry.endpoint_id });
          const chains = ui.ok ? (ui.data?.chains || []) : [];
          if (!ui.ok || ui.data?.error) {
            // A failed KG call is NOT "no UI calls this endpoint" — say so, and mark the result incomplete.
            ctx.uiLookupFailed = true;
            gaps.push(`UI trigger lookup FAILED for ${entry.http_method} ${entry.path} (Knowledge Graph saga_ui_trigger): ${ui.error || JSON.stringify(ui.data?.error ?? ui.data).slice(0, 300)} — UI stage is MISSING from this result, not empty`);
          } else if (!chains.length) {
            gaps.push(`UI trigger for ${entry.http_method} ${entry.path}: no indexed UI project calls this endpoint (UI library may not be checked out or the URL is built dynamically)`);
          }
          if (chains.length) await sagaNarrowUi(ctx, chains.slice(0, SAGA_UI_CHAINS_NARROWED), gaps);
          // Narrowed chains first (exact click handlers, then component call sites), then the rest.
          const uiRank = (ch) => (ch.exact ? 0 : ch.direct ? 1 : 2);
          const shownChains = chains.slice(0, SAGA_UI_CHAINS_NARROWED).sort((a, b) => uiRank(a) - uiRank(b)).slice(0, SAGA_UI_CHAINS_SHOWN);
          const hiddenChains = chains.filter((c) => !shownChains.includes(c));
          if (hiddenChains.length) {
            const names = hiddenChains.slice(0, 6).map((c) => c.constant).join(", ");
            gaps.push(`UI: ${hiddenChains.length} more UI constant(s) resolve to this endpoint and are not expanded (${names}${hiddenChains.length > 6 ? ", …" : ""}) — saga again with the constant as target to expand one`);
          }
          for (const ch of shownChains) {
            lines.push(`  UI  ${ch.constant}  (used in ${ch.used_in.length} file${ch.used_in.length === 1 ? "" : "s"}; ${ch.exact ? "handlers narrowed by call-site match, inferred" : ch.direct ? "component call sites, inferred" : "component-level candidates, not narrowed"})`);
            const comps = ch.exact ? ch.components.filter((c) => c.matched_events?.length) : (ch.direct || ch.components);
            for (const c of comps.slice(0, 4)) {
              lines.push(`      • ${c.component} [${c.ui_project}]${c.via_service ? ` via ${c.via_service}` : ""}${c.routes.length ? `  route: /${c.routes[0]}` : ""}`);
              if (ch.direct && !ch.exact) { lines.push(`          calls it in: ${c.caller_methods.join(", ")}`); continue; }
              // Every matched handler is listed up to the cap, and anything beyond it is COUNTED, never silently
              // dropped (the real "Save Assignment" button was once hidden behind four list/paging handlers).
              const evs = ch.exact ? c.matched_events : c.template_events;
              for (const ev of evs.slice(0, SAGA_UI_EVENTS_SHOWN)) {
                lines.push(`          (${ev.event}) → ${ev.method || ev.handler}  [${short(ev.template)}:${ev.line}]`);
              }
              if (evs.length > SAGA_UI_EVENTS_SHOWN) lines.push(`          … +${evs.length - SAGA_UI_EVENTS_SHOWN} more handler(s) not shown (raise UT_SAGA_UI_EVENTS_SHOWN)`);
            }
          }
        }
      } else if (entry.kind === "kafka") {
        lines.push(`■ KAFKA ${entry.topic}  consumer → ${entry.service}`);
        if (!printedTopics.has(entry.topic)) {
          printedTopics.add(entry.topic);
          for (const p of entry.publishers.slice(0, 6)) lines.push(`  published by ${p.service}: ${p.method_qualified_name.split(".").pop().split("(")[0]} [${p.confidence || "?"}]`);
        }
      } else {
        lines.push(`■ ${ccSplit(startQn, startProject).cls}.${ccSplit(startQn, startProject).method}  (${svc})`);
      }

      const walk = await sagaWalkService(ctx, { service: svc, project: startProject, startQn, maxDepth: depth, maxMethods: ctx.maxMethods });
      await sagaFollowHops(ctx, walk, collectHops(ctx, walk, gaps), gaps, max_service_hops);
      if (![...walk.nodes.values()].some((n) => hasEffects(n.effects)) && !walk.hopsByNode.size) {
        const s0 = ccSplit(startQn, startProject);
        gaps.push(`No DB/Kafka/service effect reached from ${s0.cls}.${s0.method} (${walk.nodes.size} method(s) walked) — the chain likely continues through something the graphs can't resolve (custom repository/query method, reflection, AOP, dynamic dispatch); read the source`);
      }
      sagaRender(walk, lines, 1, summary);
      const countNodes = (w) => w.nodes.size + [...w.hopsByNode.values()].flat().reduce((a, h) => a + (h.walk ? countNodes(h.walk) : 0), 0);
      methodsVisited += countNodes(walk);
      lines.push("");
    }

    if (entries.length && !summary.writes.size && !summary.reads.size && !summary.topics.size) {
      gaps.push("No DB/Kafka/service effect was reached — the chain may be pure read/compute, or a call went through something the graphs can't resolve (reflection, lambdas, dynamic dispatch, a service that isn't indexed).");
    }
    const totalLines = lines.length;
    if (totalLines > max_lines) {
      lines.length = max_lines;
      lines.push(`… ${totalLines - max_lines} more line(s) not shown (summary above/below is complete). Narrow with max_service_hops / depth / include_ui, trace one consumer or handler directly, or raise max_lines.`);
    }
    const payload = {
      query: target,
      render: lines.join("\n").trimEnd(),
      summary: {
        db_writes: [...summary.writes], db_reads: [...summary.reads], kafka_topics_published: [...summary.topics],
        services_touched: [...summary.services],
        ...(summary.unresolvedDb.size ? { db_unresolved: [...summary.unresolvedDb] } : {}),
      },
      gaps: [...new Set([...gaps, ...(summary.unresolvedDb.size ? [`DB access whose collection/table could not be resolved (${[...summary.unresolvedDb].join("; ")}) — the entity class is not a known @Document/@Entity/repository type; read the call site`] : [])])],
      metadata: { entries: entries.length, methods_visited: methodsVisited, durationMs: Date.now() - start,
        call_edges_rejected_by_kg: ctx.kgRejected || 0,
        ...(ctx.uiNarrowing ? { ui_narrowing: ctx.uiNarrowing } : {}),
        ...(ctx.uiLookupFailed ? { ui_lookup_failed: true } : {}),
        note: "Graph-derived (Code Cortex AST + Knowledge Generator). Verify critical hops at the cited file:line." },
    };
    return { content: [{ type: "text", text: JSON.stringify(payload) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
