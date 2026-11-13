// Unit test for the compact renderer (no KG/CC needed): node --test test/render-compact.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderCompact } from "../render-compact.js";

const payload = {
  query: "BedService.addSite",
  nodes: [
    { id: "com.lt.BedService.addSite", type: "METHOD", location: { file: "/x/BedService.java", line: 42 } },
    { id: "com.lt.BedRepo.save", type: "METHOD", location: { file: "/x/BedRepo.java", line: 7 } },
    { id: "com.lt.Lonely.node", type: "CLASS" },
  ],
  edges: [{ from: "com.lt.BedService.addSite", to: "com.lt.BedRepo.save", type: "CALLS", confidence: "VERIFIED" }],
  unresolved: [{ query: "foo", reason: "not_found_in_code_cortex" }],
  metadata: { sources: ["CODE_CORTEX"], durationMs: 12, truncated: false },
};

test("renders edges with short ids, locations and confidence", () => {
  const out = renderCompact("trace", payload);
  assert.match(out, /^trace BedService\.addSite/);
  assert.match(out, /BedService\.addSite —CALLS\[VER\]→ BedRepo\.save \[x\/BedRepo\.java:7\]/);
  assert.match(out, /nodes: CLASS Lonely\.node/);
  assert.match(out, /unresolved: foo \(not_found_in_code_cortex\)/);
  assert.match(out, /sources: CODE_CORTEX  12ms/);
});

test("caps output and points to format:json", () => {
  const big = { query: "q", nodes: [], edges: [], metadata: { sources: [] } };
  for (let i = 0; i < 500; i++) { big.nodes.push({ id: `a.b.n${i}` }); big.edges.push({ from: `a.b.n${i}`, to: `a.b.n${i + 1}`, type: "CALLS", confidence: "INFERRED" }); }
  const out = renderCompact("trace_impact", big, 20);
  const edgeLines = out.split("\n").filter((l) => l.includes("—CALLS")).length;
  assert.equal(edgeLines, 40);
  assert.match(out, /more edges .* format:"json"/);
  assert.ok(out.length < 4000, `compact output too large: ${out.length}`);
});

test("json size vs compact size on a mid-size graph", () => {
  const mid = { query: "q", nodes: [], edges: [], metadata: { sources: ["CODE_CORTEX"] } };
  for (let i = 0; i < 120; i++) { mid.nodes.push({ id: `com.lifetrenz.svc.Class${i}.method${i}`, type: "METHOD", location: { file: `/repo/src/Class${i}.java`, line: i } }); if (i) mid.edges.push({ from: `com.lifetrenz.svc.Class${i - 1}.method${i - 1}`, to: `com.lifetrenz.svc.Class${i}.method${i}`, type: "CALLS", confidence: "VERIFIED", source: "CODE_CORTEX" }); }
  const json = JSON.stringify(mid).length, compact = renderCompact("trace", mid).length;
  assert.ok(compact < json * 0.35, `compact ${compact} vs json ${json}`);
});
