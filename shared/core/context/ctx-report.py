#!/usr/bin/env python3
"""ctx-report — token / context report for Claude Code sessions (Optimization Dashboard).

Reads the session transcripts Claude Code already writes (~/.claude/projects/**/*.jsonl)
plus the ctx-meter Stop records (usage-logs/tokens-*.jsonl) and produces, with NO
third-party dependencies:

  * per-session and overall context statistics (first-turn = always-on context,
    median / p90 context per turn, share of turns above the budget)
  * tool-result volume by tool (approx chars/4), skill loads, MCP calls by server,
    graph-first ratio (unified-trace / knowledge-graph calls vs Grep/Glob/Read/Bash)
  * cache hit rate = cache_read / (input + cache_read + cache_creation)
  * model-wise tokens, and cost only if pricing.json has prices for that model
  * before/after comparison against a saved baseline snapshot

Usage:
  ctx-report.py [--days N] [--since YYYY-MM-DD] [--projects DIR] [--budget 150000]
                [--baseline FILE] [--save-baseline FILE] [--json OUT] [--html OUT] [--md]
Every number is measured from the transcripts; nothing is estimated except tool-result
size, which is labelled approx.
"""
import argparse, glob, json, os, statistics, sys, time, html
from collections import Counter, defaultdict

HOME = os.path.expanduser("~")
GRAPH_TOOLS = ("unified-trace", "knowledge-graph", "code-cortex-mcp", "plugin_enterprise-ai-platform_unified-trace", "plugin_knowledge-graph_knowledge-graph")
SCAN_TOOLS = ("Grep", "Glob", "Read", "Bash")


def text_of(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "".join(x.get("text", "") for x in c if isinstance(x, dict))
    return ""


def load_pricing(path):
    try:
        with open(path) as f:
            return json.load(f).get("models", {})
    except Exception:
        return {}


def analyse_session(path):
    s = {
        "file": path, "project": os.path.basename(os.path.dirname(path)), "turns": 0, "ctx": [],
        "first_ctx": None, "sum": Counter(), "tools": Counter(), "tool_tok": Counter(), "skills": Counter(),
        "mcp": Counter(), "models": defaultdict(Counter), "compactions": 0, "commands": Counter(),
        "started": None, "ended": None,
    }
    id2name = {}
    try:
        f = open(path, errors="ignore")
    except OSError:
        return None
    with f:
        for line in f:
            try:
                d = json.loads(line)
            except Exception:
                continue
            ts = d.get("timestamp")
            if ts:
                s["started"] = s["started"] or ts
                s["ended"] = ts
            if d.get("type") == "summary" or d.get("isCompactSummary"):
                s["compactions"] += 1
            m = d.get("message")
            if not isinstance(m, dict):
                continue
            if d.get("type") == "assistant":
                u = m.get("usage")
                if u:
                    ctx = (u.get("input_tokens", 0) + u.get("cache_read_input_tokens", 0) + u.get("cache_creation_input_tokens", 0))
                    s["turns"] += 1
                    s["ctx"].append(ctx)
                    if s["first_ctx"] is None:
                        s["first_ctx"] = ctx
                    for k_src, k_dst in (("input_tokens", "input"), ("cache_read_input_tokens", "cache_read"), ("cache_creation_input_tokens", "cache_creation"), ("output_tokens", "output")):
                        v = u.get(k_src, 0) or 0
                        s["sum"][k_dst] += v
                        s["models"][m.get("model") or "?"][k_dst] += v
                for b in m.get("content") or []:
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        name = b.get("name") or "?"
                        inp = b.get("input") or {}
                        if name == "Skill":
                            s["skills"][str(inp.get("skill"))] += 1
                        if name.startswith("mcp__"):
                            srv = name.split("__")[1]
                            s["mcp"][srv] += 1
                            name = "mcp:" + srv
                        s["tools"][name] += 1
                        id2name[b.get("id")] = name
            elif d.get("type") == "user":
                content = m.get("content")
                if isinstance(content, str) and content.startswith("/"):
                    s["commands"][content.split()[0]] += 1
                for b in content if isinstance(content, list) else []:
                    if not isinstance(b, dict):
                        continue
                    if b.get("type") == "text" and isinstance(b.get("text"), str) and b["text"].startswith("/"):
                        s["commands"][b["text"].split()[0]] += 1
                    if b.get("type") == "tool_result":
                        s["tool_tok"][id2name.get(b.get("tool_use_id"), "?")] += len(text_of(b.get("content"))) // 4
    return s if s["turns"] else None


def pct(xs, p):
    if not xs:
        return 0
    xs = sorted(xs)
    return xs[min(len(xs) - 1, max(0, int(len(xs) * p / 100) - 1))]


def aggregate(sessions, budget, pricing):
    all_ctx = [c for s in sessions for c in s["ctx"]]
    firsts = [s["first_ctx"] for s in sessions if s["first_ctx"] is not None]
    tot = Counter(); tools = Counter(); tool_tok = Counter(); skills = Counter(); mcp = Counter(); cmds = Counter()
    models = defaultdict(Counter)
    for s in sessions:
        tot.update(s["sum"]); tools.update(s["tools"]); tool_tok.update(s["tool_tok"]); skills.update(s["skills"]); mcp.update(s["mcp"]); cmds.update(s["commands"])
        for mdl, c in s["models"].items():
            models[mdl].update(c)
    denom = tot["input"] + tot["cache_read"] + tot["cache_creation"]
    graph_calls = sum(v for k, v in tools.items() if any(k == "mcp:" + g for g in GRAPH_TOOLS))
    scan_calls = sum(tools[t] for t in SCAN_TOOLS)
    model_rows = []
    for mdl, c in sorted(models.items(), key=lambda kv: -sum(kv[1].values())):
        price = pricing.get(mdl) or pricing.get(mdl.split("-20")[0]) or {}
        cost = None
        if all(k in price for k in ("input", "output", "cache_read", "cache_write")):
            cost = (c["input"] * price["input"] + c["output"] * price["output"] + c["cache_read"] * price["cache_read"] + c["cache_creation"] * price["cache_write"]) / 1e6
        model_rows.append({"model": mdl, **{k: c[k] for k in ("input", "cache_read", "cache_creation", "output")}, "cost_usd": None if cost is None else round(cost, 2)})
    return {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "budget": budget, "sessions": len(sessions), "turns": len(all_ctx),
        "context": {"median": pct(all_ctx, 50), "p75": pct(all_ctx, 75), "p90": pct(all_ctx, 90), "p95": pct(all_ctx, 95), "max": max(all_ctx) if all_ctx else 0,
                    "turns_over_budget_pct": round(100 * sum(1 for c in all_ctx if c > budget) / len(all_ctx), 1) if all_ctx else 0},
        "always_on": {"min": min(firsts) if firsts else 0, "median": int(statistics.median(firsts)) if firsts else 0, "max": max(firsts) if firsts else 0},
        "tokens": dict(tot), "cache_hit_rate": round(tot["cache_read"] / denom, 3) if denom else None,
        "tool_result_tokens_approx": dict(tool_tok.most_common(20)), "tool_calls": dict(tools.most_common(25)), "tool_calls_all": dict(tools),
        "skills_loaded": dict(skills.most_common(20)), "mcp_calls": dict(mcp.most_common(20)), "commands": dict(cmds.most_common(15)),
        "graph_first": {"graph_calls": graph_calls, "scan_calls": scan_calls, "ratio": round(graph_calls / scan_calls, 3) if scan_calls else None},
        "compactions": sum(s["compactions"] for s in sessions), "models": model_rows,
        "sessions_detail": [{"project": s["project"], "turns": s["turns"], "first_ctx": s["first_ctx"], "max_ctx": max(s["ctx"]), "median_ctx": pct(s["ctx"], 50),
                             "compactions": s["compactions"], "cache_read": s["sum"]["cache_read"], "output": s["sum"]["output"], "started": s["started"], "ended": s["ended"]}
                            for s in sorted(sessions, key=lambda x: x["started"] or "")[-30:]],
    }


def compare(now, base):
    def d(a, b):
        if a is None or b is None or b == 0:
            return None
        return round(100 * (a - b) / b, 1)
    return {
        "always_on_median": {"before": base["always_on"]["median"], "after": now["always_on"]["median"], "pct": d(now["always_on"]["median"], base["always_on"]["median"])},
        "context_median": {"before": base["context"]["median"], "after": now["context"]["median"], "pct": d(now["context"]["median"], base["context"]["median"])},
        "context_p90": {"before": base["context"]["p90"], "after": now["context"]["p90"], "pct": d(now["context"]["p90"], base["context"]["p90"])},
        "turns_over_budget_pct": {"before": base["context"]["turns_over_budget_pct"], "after": now["context"]["turns_over_budget_pct"]},
        "cache_read_per_turn": {"before": round(base["tokens"].get("cache_read", 0) / max(1, base["turns"])), "after": round(now["tokens"].get("cache_read", 0) / max(1, now["turns"]))},
        "bash_tokens_per_turn": {"before": round(base["tool_result_tokens_approx"].get("Bash", 0) / max(1, base["turns"])), "after": round(now["tool_result_tokens_approx"].get("Bash", 0) / max(1, now["turns"]))},
        "graph_first_ratio": {"before": base["graph_first"]["ratio"], "after": now["graph_first"]["ratio"]},
        "cache_hit_rate": {"before": base.get("cache_hit_rate"), "after": now.get("cache_hit_rate")},
    }


def k(n):
    return "-" if n is None else f"{round(n / 1000)}k" if isinstance(n, (int, float)) and abs(n) >= 1000 else str(n)


def render_md(r, cmp_):
    L = [f"# Context report — {r['generated']}", "", f"Sessions {r['sessions']} · turns {r['turns']} · budget {k(r['budget'])} · compactions {r['compactions']}", "",
         "| Metric | Value |", "|---|---|",
         f"| Always-on (first-turn) context min / median / max | {k(r['always_on']['min'])} / {k(r['always_on']['median'])} / {k(r['always_on']['max'])} |",
         f"| Context per turn median / p90 / p95 / max | {k(r['context']['median'])} / {k(r['context']['p90'])} / {k(r['context']['p95'])} / {k(r['context']['max'])} |",
         f"| Turns over budget | {r['context']['turns_over_budget_pct']}% |",
         f"| Cache hit rate | {r['cache_hit_rate']} |",
         f"| Graph-first ratio (graph calls / scan calls) | {r['graph_first']['graph_calls']} / {r['graph_first']['scan_calls']} = {r['graph_first']['ratio']} |", ""]
    L += ["## Tool-result tokens (approx)", "", "| Tool | Tokens | Calls |", "|---|---|---|"]
    L += [f"| {t} | {k(v)} | {r.get('tool_calls_all', r['tool_calls']).get(t, 0)} |" for t, v in r["tool_result_tokens_approx"].items()]
    L += ["", "## Skills loaded", "", ", ".join(f"{s} ({c})" for s, c in r["skills_loaded"].items()) or "none", "", "## MCP calls by server", "",
          ", ".join(f"{s} ({c})" for s, c in r["mcp_calls"].items()) or "none", "", "## Models", "", "| Model | Input | Cache read | Cache write | Output | Cost USD |", "|---|---|---|---|---|---|"]
    L += [f"| {m['model']} | {k(m['input'])} | {k(m['cache_read'])} | {k(m['cache_creation'])} | {k(m['output'])} | {m['cost_usd'] if m['cost_usd'] is not None else 'set pricing.json'} |" for m in r["models"]]
    if cmp_:
        L += ["", "## Before / after (vs baseline)", "", "| Metric | Before | After | Change |", "|---|---|---|---|"]
        for name, v in cmp_.items():
            L.append(f"| {name} | {k(v.get('before'))} | {k(v.get('after'))} | {str(v.get('pct')) + '%' if v.get('pct') is not None else ''} |")
    return "\n".join(L) + "\n"


def render_html(r, cmp_):
    def rows(items, hdr):
        return "<table><tr>" + "".join(f"<th>{h}</th>" for h in hdr) + "</tr>" + "".join("<tr>" + "".join(f"<td>{html.escape(str(c))}</td>" for c in row) + "</tr>" for row in items) + "</table>"
    def bar(items, total):
        return "".join(f'<div class="bar"><span style="width:{min(100, 100 * v / max(1, total)):.1f}%"></span><label>{html.escape(str(n))} · {k(v)}</label></div>' for n, v in items)
    tot_tool = sum(r["tool_result_tokens_approx"].values()) or 1
    cmp_html = ""
    if cmp_:
        cmp_html = "<h2>Before / after</h2>" + rows([(n, k(v.get("before")), k(v.get("after")), (str(v.get("pct")) + "%") if v.get("pct") is not None else "") for n, v in cmp_.items()], ["Metric", "Before", "After", "Change"])
    tiles = [("Sessions", r["sessions"]), ("Turns", r["turns"]), ("Always-on median", k(r["always_on"]["median"])), ("Context median", k(r["context"]["median"])),
             ("Context p90", k(r["context"]["p90"])), ("Turns > budget", f"{r['context']['turns_over_budget_pct']}%"), ("Cache hit rate", r["cache_hit_rate"]), ("Compactions", r["compactions"]),
             ("Graph-first ratio", r["graph_first"]["ratio"])]
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Context Report</title>
<style>:root{{--bg:#fff;--fg:#1a1a1a;--mut:#666;--card:#f5f6f8;--acc:#2f6fed;--bd:#e3e5ea}}
@media (prefers-color-scheme:dark){{:root:not([data-theme=light]){{--bg:#111318;--fg:#e8e8e8;--mut:#9aa0a8;--card:#1b1f27;--acc:#6ea0ff;--bd:#2a2f3a}}}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;max-width:1100px;margin-inline:auto}}
h1{{font-size:22px;margin:0 0 4px}}h2{{font-size:16px;margin:28px 0 8px}}.mut{{color:var(--mut)}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:16px 0}}.tile{{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px}}
.tile b{{display:block;font-size:20px}}.tile span{{color:var(--mut);font-size:12px}}
table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)}}th{{color:var(--mut);font-weight:600}}
.bar{{position:relative;height:22px;background:var(--card);border-radius:6px;margin:4px 0;overflow:hidden}}.bar span{{position:absolute;left:0;top:0;bottom:0;background:var(--acc);opacity:.35}}
.bar label{{position:absolute;left:8px;top:2px;font-size:12px}}</style></head><body>
<h1>Context &amp; token report</h1><div class="mut">Generated {r['generated']} · budget {k(r['budget'])} · all numbers measured from Claude Code transcripts (tool-result size approx)</div>
<div class="tiles">{''.join(f'<div class="tile"><b>{html.escape(str(v))}</b><span>{n}</span></div>' for n, v in tiles)}</div>
{cmp_html}
<h2>Tool-result tokens by tool (approx)</h2>{bar(list(r['tool_result_tokens_approx'].items())[:12], tot_tool)}
<h2>Skills loaded</h2>{rows(list(r['skills_loaded'].items()) or [('none', '')], ['Skill', 'Loads'])}
<h2>MCP calls by server</h2>{rows(list(r['mcp_calls'].items()) or [('none', '')], ['Server', 'Calls'])}
<h2>Models</h2>{rows([(m['model'], k(m['input']), k(m['cache_read']), k(m['cache_creation']), k(m['output']), m['cost_usd'] if m['cost_usd'] is not None else 'set pricing.json') for m in r['models']], ['Model', 'Input', 'Cache read', 'Cache write', 'Output', 'Cost USD'])}
<h2>Recent sessions</h2>{rows([(s['project'], s['turns'], k(s['first_ctx']), k(s['median_ctx']), k(s['max_ctx']), s['compactions'], k(s['cache_read']), (s['started'] or '')[:16]) for s in r['sessions_detail']], ['Project', 'Turns', 'First ctx', 'Median ctx', 'Max ctx', 'Compactions', 'Cache read', 'Started'])}
</body></html>"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--projects", default=os.path.join(HOME, ".claude", "projects"))
    ap.add_argument("--days", type=int, default=10)
    ap.add_argument("--since")
    ap.add_argument("--budget", type=int, default=int(os.environ.get("CTX_BUDGET", 150000)))
    ap.add_argument("--baseline"); ap.add_argument("--save-baseline"); ap.add_argument("--json"); ap.add_argument("--html"); ap.add_argument("--md", action="store_true")
    ap.add_argument("--pricing", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "pricing.json"))
    a = ap.parse_args()
    cutoff = time.mktime(time.strptime(a.since, "%Y-%m-%d")) if a.since else time.time() - a.days * 86400
    files = [f for f in glob.glob(os.path.join(a.projects, "*", "*.jsonl")) if os.path.getmtime(f) >= cutoff]
    sessions = [s for s in (analyse_session(f) for f in files) if s]
    if not sessions:
        print("no sessions found", file=sys.stderr); return 1
    r = aggregate(sessions, a.budget, load_pricing(a.pricing))
    cmp_ = None
    if a.baseline and os.path.exists(a.baseline):
        with open(a.baseline) as f:
            cmp_ = compare(r, json.load(f))
        r["comparison"] = cmp_
    if a.save_baseline:
        with open(a.save_baseline, "w") as f:
            json.dump(r, f, indent=1)
    if a.json:
        with open(a.json, "w") as f:
            json.dump(r, f, indent=1)
    if a.html:
        with open(a.html, "w") as f:
            f.write(render_html(r, cmp_))
    if a.md or not (a.json or a.html):
        sys.stdout.write(render_md(r, cmp_))
    return 0


if __name__ == "__main__":
    sys.exit(main())
