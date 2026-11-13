#!/usr/bin/env bash
# mcp-env — MCP server profiles for Claude Code. Keeps the always-on server list
# small by splitting a project's .mcp.json into named profiles that can be
# switched per task/environment. Profiles live OUTSIDE the repo (they hold
# connection strings): ${MCP_PROFILE_DIR:-~/.claude/mcp-profiles}/<name>.json
#
#   mcp-env init  [path/to/.mcp.json]   split an existing .mcp.json into profiles by name
#   mcp-env list                        show profiles and server counts
#   mcp-env show                        show what the target .mcp.json currently contains
#   mcp-env use <profile> [...]         write target .mcp.json = union of the named profiles
#   mcp-env add <profile> [...]         add profiles to what is already active
#
# Target file: $MCP_TARGET or ./.mcp.json. "core" is always included by `use`.
# Profile naming (init): core = unified-trace/opencode-bridge/gitlab/redmine;
# monitoring = grafana/signoz/lths/kafka; db-<env> = *-db servers by env prefix;
# mongo = *mongodb* servers; other = anything else.
set -eu
DIR="${MCP_PROFILE_DIR:-$HOME/.claude/mcp-profiles}"; mkdir -p "$DIR"
TARGET="${MCP_TARGET:-./.mcp.json}"
cmd="${1:-list}"; shift || true

py() { python3 - "$@"; }

case "$cmd" in
  init)
    SRC="${1:-$TARGET}"
    py "$SRC" "$DIR" <<'EOF'
import json,sys,re,os,collections
src,dirn=sys.argv[1],sys.argv[2]
d=json.load(open(src))["mcpServers"]
prof=collections.defaultdict(dict)
for name,cfg in d.items():
    n=name.lower()
    if n in ("unified-trace","opencode-bridge","knowledge-graph"): p="plugin-provided"   # the EAP / KG plugins register these; a project copy would start them twice
    elif n in ("gitlab-reader","redmine-reader"): p="core"
    elif re.search(r"grafana|signoz|lths|kafka",n): p="monitoring"
    elif "mongo" in n: p="mongo"
    elif n.endswith("-db") or "-db" in n:
        env=re.split(r"[-_]",n)[0]
        env={"aster":"aster","ajyal":"ajyal","smiles":"smiles","medvista":"medvista","v2qa":"v2qa","canary":"canary","local":"local","sit":"sit"}.get(env,env)
        p="db-"+env
    else: p="other"
    prof[p][name]=cfg
for p,servers in prof.items():
    out=os.path.join(dirn,p+".json")
    json.dump({"mcpServers":servers},open(out,"w"),indent=2)
    print(f"{p:14} {len(servers):3} servers -> {out}")
EOF
    ;;
  list)
    for f in "$DIR"/*.json; do [ -e "$f" ] || { echo "no profiles in $DIR (run: mcp-env init)"; exit 0; }
      printf '%-14s %3s servers\n' "$(basename "$f" .json)" "$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))['mcpServers']))" "$f")"; done ;;
  show)
    python3 -c "import json,sys;d=json.load(open(sys.argv[1]))['mcpServers'];print(len(d),'servers:');[print(' ',k) for k in d]" "$TARGET" ;;
  use|add)
    names=("$@"); [ "$cmd" = use ] && names=(core "${names[@]}")
    py "$TARGET" "$DIR" "$cmd" "${names[@]}" <<'EOF'
import json,sys,os
target,dirn,mode,*names=sys.argv[1:]
merged={}
if mode=="add" and os.path.exists(target): merged=json.load(open(target)).get("mcpServers",{})
for n in dict.fromkeys(names):
    f=os.path.join(dirn,n+".json")
    if not os.path.exists(f): sys.exit(f"unknown profile: {n} (see: mcp-env list)")
    merged.update(json.load(open(f))["mcpServers"])
if os.path.exists(target):
    os.replace(target,target+".prev")
json.dump({"mcpServers":merged},open(target,"w"),indent=2)
print(f"{target}: {len(merged)} servers active ({', '.join(dict.fromkeys(names))}); previous saved as {target}.prev — restart Claude Code to apply")
EOF
    ;;
  *) sed -n '2,16p' "$0"; exit 2;;
esac
