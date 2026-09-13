#!/usr/bin/env bash
# ============================================================================
# Enterprise AI Platform — machine bootstrap (POSIX: macOS + Linux)
#
# Idempotent, non-destructive, non-interactive by default. Safe to re-run
# any time — every step checks current state before acting and skips work
# that's already done. Never reinstalls something already valid, never
# destroys uncommitted work in a sibling repo, never overwrites unrelated
# user configuration.
#
# Sets up: prerequisites -> sibling tool repos (knowledge-graph-generator,
# code-cortex-mcp) -> Claude Code CLI -> Enterprise AI Platform global
# install -> Knowledge Generator (venv + MCP registration, index left
# EXPLICIT/manual) -> Code Cortex MCP -> Unified Trace MCP -> OpenCode
# (independent, optional) -> OpenCode subagent bridge (Claude-only,
# optional) -> autonomous-runner build/test -> health check + manifest.
#
# GraphRAG: evaluated, not adopted. Knowledge Generator (cross-stack,
# confidence-tagged) + Code Cortex (exact AST/call graph), merged through
# Unified Trace, cover the same query surface deterministically. Nothing
# here clones or configures GraphRAG.
#
# Indexing safety: this script NEVER triggers a repository reindex to
# "validate" tracing works. A missing knowledge_graph.db is reported as
# NOT INDEXED / READY TO INDEX, not fixed automatically — pass --reindex
# if you explicitly want one built as part of this run.
#
# Windows: not covered by this script. The platform's repo-contract
# installers have PowerShell equivalents (adapters/*/install.ps1,
# install/*.ps1) for injecting the contract into a consuming repo; a
# from-scratch machine bootstrap (prerequisites, Claude/OpenCode CLI
# install, MCP registration) for Windows does not exist yet — documented
# as a known gap, not silently pretended to work via Git Bash/WSL.
#
# Usage:
#   ./install/bootstrap.sh                    full bootstrap
#   ./install/bootstrap.sh --dry-run           show what would happen; no writes
#   ./install/bootstrap.sh --doctor            detection/health-check only; no writes
#   ./install/bootstrap.sh --non-interactive   never prompt (this script never
#                                               prompts anyway; accepted for
#                                               CI/automation clarity)
#   ./install/bootstrap.sh --reindex           force a Knowledge Generator
#                                               reindex as part of this run
#   ./install/bootstrap.sh --skip-runner-tests skip autonomous-runner `npm test`
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DRY_RUN=0
DOCTOR=0
NON_INTERACTIVE=0
REINDEX=0
SKIP_RUNNER_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --doctor) DOCTOR=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
    --reindex) REINDEX=1 ;;
    --skip-runner-tests) SKIP_RUNNER_TESTS=1 ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done
# --doctor implies read-only, same as --dry-run, but still reports live
# connectivity (MCP `claude mcp get ... | grep Connected`) rather than just
# "would register" — that's the difference between the two modes.
[[ $DOCTOR -eq 1 ]] && DRY_RUN=1

log()  { echo "[bootstrap] $*"; }
warn() { echo "[bootstrap] WARN: $*" >&2; }
err()  { echo "[bootstrap] ERROR: $*" >&2; }
dry()  { [[ $DRY_RUN -eq 1 ]] && log "[DRY-RUN] $*" && return 0; return 1; }

# ── Locate platform root (same idiom as adapters/claude/install.sh) ────────
find_platform_root() {
  local d="$SCRIPT_DIR"
  while [[ "$d" != "/" ]]; do
    [[ -f "$d/shared/contract.md" ]] && echo "$d" && return
    d="$(dirname "$d")"
  done
  echo "ERROR: cannot find platform root (no shared/contract.md)" >&2
  exit 1
}
PLATFORM_REPO="$(find_platform_root)"
PLATFORM_URL="https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git"
ENTERPRISE_AI_VERSION="$(tr -d '[:space:]' < "$PLATFORM_REPO/VERSION" 2>/dev/null || echo "unknown")"

# ── paths.env: TOOLS_DIR / PROJECTS_DIR (blank = default) ──────────────────
read_paths_env_key() {
  local key="$1"
  [[ -f "$PLATFORM_REPO/paths.env" ]] || return 0
  sed -n "s/^[ \\t]*${key}[ \\t]*=[ \\t]*//p" "$PLATFORM_REPO/paths.env" | tail -1 | sed 's/[ \t]*$//'
}
TOOLS_DIR="$(read_paths_env_key TOOLS_DIR)"
[[ -z "$TOOLS_DIR" ]] && TOOLS_DIR="$(dirname "$PLATFORM_REPO")"
PROJECTS_DIR="$(read_paths_env_key PROJECTS_DIR)"
[[ -z "$PROJECTS_DIR" ]] && PROJECTS_DIR="$(dirname "$TOOLS_DIR")"

KG_REPO="$TOOLS_DIR/knowledge-graph-generator"
KG_URL="https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator.git"
CORTEX_REPO="$TOOLS_DIR/code-cortex-mcp"
CORTEX_URL="https://github.com/tigercosmos/code-cortex-mcp.git"
BE_ROOT="$PROJECTS_DIR/BE"
UI_ROOT="$PROJECTS_DIR/UI"

log "Platform root : $PLATFORM_REPO (v$ENTERPRISE_AI_VERSION)"
log "Tools dir     : $TOOLS_DIR (knowledge-graph-generator, code-cortex-mcp siblings)"
log "Projects dir  : $PROJECTS_DIR (informational — BE/UI presence check only)"
[[ $DOCTOR -eq 1 ]] && log "Mode: --doctor (detection/health-check only, no writes, no indexing)"
[[ $DRY_RUN -eq 1 && $DOCTOR -eq 0 ]] && log "Mode: --dry-run (no writes)"

STATUS_PREREQS="UNKNOWN"
STATUS_REPOS="UNKNOWN"
STATUS_CLAUDE_CLI="UNKNOWN"
STATUS_PLATFORM="UNKNOWN"
STATUS_KG="UNKNOWN"
STATUS_CORTEX="UNKNOWN"
STATUS_UNIFIED_TRACE="UNKNOWN"
STATUS_OPENCODE_BRIDGE="SKIPPED (Claude-only capability; not installed for other adapters)"
STATUS_OPENCODE="NOT ATTEMPTED (opencode binary not found)"
STATUS_RUNNER="UNKNOWN"
BLOCKERS=()

# ============================================================================
# 1. Prerequisites (with basic version classification: OK / OUTDATED / MISSING)
# ============================================================================
log "=== 1. Prerequisites ==="
need() { command -v "$1" >/dev/null 2>&1; }

ver_ge() {  # ver_ge "18.4.0" 18  -> true if major >= 18
  local have="$1" want="$2"
  local major="${have%%.*}"
  major="${major#v}"
  [[ "$major" =~ ^[0-9]+$ ]] || return 1
  [[ "$major" -ge "$want" ]]
}

check_tool() {
  local tool="$1" min_major="${2:-}"
  if ! need "$tool"; then
    err "missing required tool: $tool"
    BLOCKERS+=("Install $tool")
    return
  fi
  local v
  v="$("$tool" --version 2>&1 | head -1)"
  if [[ -n "$min_major" ]]; then
    local vnum
    vnum="$(echo "$v" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
    if [[ -n "$vnum" ]] && ! ver_ge "$vnum" "$min_major"; then
      warn "$tool: $v (OUTDATED — need major >= $min_major)"
      return
    fi
  fi
  log "OK: $tool -> $v"
}

check_tool git
check_tool node 18
check_tool npm
check_tool python3
check_tool java
check_tool curl

if [[ ${#BLOCKERS[@]} -eq 0 ]]; then STATUS_PREREQS="PASS"; else STATUS_PREREQS="FAIL"; fi

if [[ $DOCTOR -eq 1 ]]; then
  # Doctor mode: report tool + repo + MCP connectivity, skip every mutation.
  log "=== Doctor: repositories ==="
  for pair in "enterprise-ai-platform:$PLATFORM_REPO" "knowledge-graph-generator:$KG_REPO" "code-cortex-mcp:$CORTEX_REPO"; do
    name="${pair%%:*}"; path="${pair#*:}"
    if [[ -d "$path/.git" ]]; then log "OK: $name present at $path"; else warn "$name not found at $path"; fi
  done
  log "=== Doctor: MCP connectivity ==="
  if need claude; then
    for server in knowledge-graph code-cortex-mcp unified-trace opencode-bridge; do
      if claude mcp get "$server" 2>&1 | grep -q "Connected"; then
        echo "[PASS] $server"
      elif claude mcp get "$server" >/dev/null 2>&1; then
        echo "[FAIL] $server (registered, not connected)"
      else
        echo "[MISSING] $server (not registered)"
      fi
    done
  else
    warn "claude CLI not found — cannot check MCP connectivity"
  fi
  log "=== Doctor: OpenCode ==="
  if need opencode; then
    OC_CONFIG="$HOME/.config/opencode/opencode.jsonc"
    if [[ -f "$OC_CONFIG" ]] && grep -q '"unified-trace"' "$OC_CONFIG" 2>/dev/null; then
      echo "[PASS] opencode (unified-trace configured)"
    else
      echo "[OPTIONAL] opencode (binary present, unified-trace not yet configured — see docs/opencode-setup.md)"
    fi
  else
    echo "[OPTIONAL] opencode (not installed — this is fine, it's optional)"
  fi
  log "=== Doctor: Knowledge Graph index status (read-only — never indexes) ==="
  DB_PATH="$KG_REPO/output/knowledge_graph.db"
  if [[ -f "$DB_PATH" ]]; then
    echo "[PASS] Knowledge Graph: indexed ($DB_PATH exists)"
  else
    echo "[INFO] Knowledge Graph: NOT INDEXED — READY TO INDEX. Run 'python3 indexer.py' inside knowledge-graph-generator/ explicitly when ready. Doctor never does this automatically."
  fi
  log "Doctor complete. No files were written, no indexing was performed."
  exit 0
fi

# ============================================================================
# 2. Sibling tool repos (never destroy local work)
# ============================================================================
log "=== 2. Repositories ==="
mkdir -p "$TOOLS_DIR"

clone_or_verify() {
  local path="$1" url="$2" name="$3"
  if [[ -d "$path/.git" ]]; then
    local remote
    remote="$(git -C "$path" remote get-url origin 2>/dev/null || echo "")"
    if [[ "$remote" != "$url" ]]; then
      warn "$name: origin is '$remote', expected '$url' — leaving as-is (not touching)"
    else
      log "$name: present, origin OK ($remote)"
    fi
    if [[ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]]; then
      warn "$name: has uncommitted changes — leaving untouched"
    fi
    dry "Would fetch --all for $name" || git -C "$path" fetch --all --prune --quiet 2>/dev/null || warn "$name: fetch failed (offline?)"
  else
    if dry "Would clone $name from $url to $path"; then return; fi
    log "$name: not found, cloning..."
    if git clone --quiet "$url" "$path"; then
      log "$name: cloned"
    else
      err "$name: clone failed"
      BLOCKERS+=("Clone $name manually: git clone $url \"$path\"")
    fi
  fi
}

clone_or_verify "$KG_REPO" "$KG_URL" "knowledge-graph-generator"
clone_or_verify "$CORTEX_REPO" "$CORTEX_URL" "code-cortex-mcp"

for root in "$BE_ROOT" "$UI_ROOT"; do
  if [[ -d "$root" ]]; then
    log "Product repo present: $root"
  else
    warn "Product repo not found: $root (informational only — set PROJECTS_DIR in paths.env if this is wrong; indexing stays config-driven via kg-config.env regardless)"
  fi
done

if [[ ${#BLOCKERS[@]} -eq 0 ]]; then STATUS_REPOS="PASS"; else STATUS_REPOS="PARTIAL"; fi

# ============================================================================
# 3. Claude Code CLI (npm, user-owned prefix — no sudo)
# ============================================================================
log "=== 3. Claude Code CLI ==="
if need claude && claude --version >/dev/null 2>&1; then
  log "claude CLI already installed: $(claude --version 2>&1)"
  STATUS_CLAUDE_CLI="PASS"
elif dry "Would install @anthropic-ai/claude-code (user npm prefix)"; then
  STATUS_CLAUDE_CLI="DRY_RUN"
else
  log "Installing @anthropic-ai/claude-code (user npm prefix, no sudo)..."
  mkdir -p "$HOME/.npm-global"
  npm config set prefix "$HOME/.npm-global" >/dev/null
  npm install -g @anthropic-ai/claude-code --allow-scripts=@anthropic-ai/claude-code >/dev/null 2>&1
  export PATH="$HOME/.npm-global/bin:$PATH"
  # Idempotent PATH entry: pick the shell's real profile file, never append twice.
  case "${SHELL:-}" in
    */zsh) PROFILE="$HOME/.zprofile" ;;
    */bash) PROFILE="$HOME/.bash_profile"; [[ -f "$HOME/.bashrc" ]] && PROFILE="$HOME/.bashrc" ;;
    *) PROFILE="$HOME/.profile" ;;
  esac
  if ! grep -q 'npm-global/bin' "$PROFILE" 2>/dev/null; then
    printf '\n# npm global bin (Claude Code CLI) — added by enterprise-ai-platform bootstrap\nexport PATH="$HOME/.npm-global/bin:$PATH"\n' >> "$PROFILE"
    log "Added npm-global/bin to PATH in $PROFILE"
  else
    log "PATH entry for npm-global/bin already present in $PROFILE"
  fi
  if claude --version >/dev/null 2>&1; then
    log "claude CLI installed: $(claude --version 2>&1)"
    STATUS_CLAUDE_CLI="PASS"
  else
    err "claude CLI install failed"
    STATUS_CLAUDE_CLI="FAIL"
    BLOCKERS+=("Install Claude Code CLI manually: npm install -g @anthropic-ai/claude-code")
  fi
fi
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"

# ============================================================================
# 4. Enterprise AI Platform — global Claude Code install (contract/commands/standards)
# ============================================================================
log "=== 4. Enterprise AI Platform (global) ==="
if [[ -f "$PLATFORM_REPO/adapters/claude/install.sh" ]]; then
  if dry "Would run adapters/claude/install.sh"; then
    STATUS_PLATFORM="DRY_RUN"
  elif (cd "$PLATFORM_REPO" && bash adapters/claude/install.sh >/tmp/platform-install.log 2>&1); then
    log "Global Claude platform install OK ($(wc -l < "$HOME/.claude/CLAUDE.md" 2>/dev/null || echo 0) lines in ~/.claude/CLAUDE.md)"
    STATUS_PLATFORM="PASS"
  else
    err "Platform install.sh failed — see /tmp/platform-install.log"
    STATUS_PLATFORM="FAIL"
    BLOCKERS+=("Inspect /tmp/platform-install.log and re-run adapters/claude/install.sh")
  fi
else
  err "adapters/claude/install.sh not found in $PLATFORM_REPO"
  STATUS_PLATFORM="FAIL"
fi

# ============================================================================
# 5. Knowledge Graph Generator — venv + MCP registration (index stays EXPLICIT)
# ============================================================================
log "=== 5. Knowledge Graph Generator ==="
if [[ -d "$KG_REPO" ]]; then
  if [[ ! -x "$KG_REPO/.venv-mcp/bin/python" ]]; then
    if dry "Would create $KG_REPO/.venv-mcp and install requirements-mcp.txt"; then
      :
    else
      log "Creating .venv-mcp and installing MCP server deps..."
      (cd "$KG_REPO" && python3 -m venv .venv-mcp && .venv-mcp/bin/pip install -q --upgrade pip && .venv-mcp/bin/pip install -q -r requirements-mcp.txt)
    fi
  else
    log ".venv-mcp already present"
  fi

  DB_PATH="$KG_REPO/output/knowledge_graph.db"
  if [[ ! -f "$DB_PATH" ]]; then
    log "Knowledge Graph: NOT INDEXED — this is expected and correct for a new setup. Run 'python3 indexer.py' inside $KG_REPO explicitly when kg-config.env is pointed at your real project paths. Bootstrap never indexes automatically."
  elif [[ $REINDEX -eq 1 ]]; then
    if dry "Would run: python3 indexer.py (explicit --reindex requested)"; then
      :
    else
      log "Running indexer (--reindex explicitly requested)..."
      if (cd "$KG_REPO" && python3 indexer.py > /tmp/kg-index.log 2>&1); then
        log "Indexer OK — $(tail -5 /tmp/kg-index.log | tr '\n' ' ')"
      else
        err "Indexer failed — see /tmp/kg-index.log"
        BLOCKERS+=("Check kg-config.env ROOT_PATH/BACKEND_SERVICES/ANGULAR_PROJECT, re-run: python3 indexer.py")
      fi
    fi
  else
    log "Database already exists at $DB_PATH (pass --reindex to force a rebuild — never automatic)"
  fi

  if [[ -f "$DB_PATH" ]]; then
    NODE_COUNT=$(python3 - "$DB_PATH" <<'PYEOF' 2>/dev/null
import sqlite3, sys
try:
    c = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
    print(c.execute("SELECT COUNT(*) FROM nodes").fetchone()[0])
except Exception:
    print(-1)
PYEOF
)
    log "Database nodes: $NODE_COUNT"
    if [[ "$NODE_COUNT" -gt 0 ]]; then STATUS_KG="PASS"; else STATUS_KG="FAIL"; fi
  else
    STATUS_KG="NOT_INDEXED (not a failure — explicit indexing required)"
  fi

  if need claude; then
    if claude mcp get knowledge-graph >/dev/null 2>&1; then
      log "knowledge-graph MCP server already registered (user scope)"
    elif dry "Would register knowledge-graph MCP server"; then
      :
    else
      log "Registering knowledge-graph MCP server (user scope)..."
      claude mcp add knowledge-graph -s user \
        -e KG_DB_PATH="$DB_PATH" \
        -- "$KG_REPO/.venv-mcp/bin/python" "$KG_REPO/mcp_server_main.py" >/dev/null 2>&1
    fi
    if [[ $DRY_RUN -eq 0 ]]; then
      if claude mcp get knowledge-graph 2>&1 | grep -q "Connected"; then
        log "knowledge-graph MCP: Connected"
      else
        warn "knowledge-graph MCP: not connected — check 'claude mcp get knowledge-graph'"
        [[ "$STATUS_KG" == "PASS" ]] && STATUS_KG="FAIL"
      fi
    fi
  fi
else
  err "knowledge-graph-generator repo missing — skipping"
  STATUS_KG="FAIL"
fi

# ============================================================================
# 6. Code Cortex MCP — prebuilt binary + self-configuration (global)
# ============================================================================
log "=== 6. Code Cortex MCP ==="
if need code-cortex-mcp; then
  log "code-cortex-mcp already installed: $(code-cortex-mcp --version 2>&1)"
elif [[ -f "$CORTEX_REPO/install.sh" ]]; then
  if dry "Would run $CORTEX_REPO/install.sh --skip-config"; then
    :
  else
    log "Installing code-cortex-mcp prebuilt binary..."
    bash "$CORTEX_REPO/install.sh" --skip-config >/tmp/cortex-install.log 2>&1
    export PATH="$HOME/.local/bin:$PATH"
  fi
fi
if need code-cortex-mcp; then
  if claude mcp get code-cortex-mcp >/dev/null 2>&1; then
    log "code-cortex-mcp MCP server already registered"
  elif dry "Would run: code-cortex-mcp install -y"; then
    :
  else
    log "Running code-cortex-mcp self-configuration (writes to ~/.claude.json, global)..."
    code-cortex-mcp install -y >/tmp/cortex-configure.log 2>&1
  fi
  if [[ $DRY_RUN -eq 0 ]]; then
    if claude mcp get code-cortex-mcp 2>&1 | grep -q "Connected"; then
      log "code-cortex-mcp MCP: Connected"
      STATUS_CORTEX="PASS"
    else
      warn "code-cortex-mcp MCP: not connected"
      STATUS_CORTEX="FAIL"
    fi
  else
    STATUS_CORTEX="DRY_RUN"
  fi
else
  err "code-cortex-mcp binary not found/runnable"
  STATUS_CORTEX="FAIL"
fi

# ============================================================================
# 6b. Unified Trace MCP — merges Knowledge Generator + Code Cortex
# ============================================================================
log "=== 6b. Unified Trace MCP ==="
UNIFIED_TRACE_DIR="$PLATFORM_REPO/shared/mcp-tools/unified-trace-mcp"
if [[ -d "$UNIFIED_TRACE_DIR" ]] && need node; then
  if [[ ! -d "$UNIFIED_TRACE_DIR/node_modules" ]]; then
    if dry "Would run: npm install in $UNIFIED_TRACE_DIR"; then
      :
    else
      (cd "$UNIFIED_TRACE_DIR" && npm install --silent) >/tmp/unified-trace-install.log 2>&1
    fi
  fi
  if [[ -d "$UNIFIED_TRACE_DIR/node_modules" ]] || [[ $DRY_RUN -eq 1 ]]; then
    if claude mcp get unified-trace >/dev/null 2>&1; then
      log "unified-trace MCP server already registered"
    elif dry "Would register unified-trace MCP server"; then
      :
    else
      log "Registering unified-trace MCP server (Claude Code, user scope)..."
      claude mcp add unified-trace -s user -- node "$UNIFIED_TRACE_DIR/index.js" >/tmp/unified-trace-register.log 2>&1
    fi
    if [[ $DRY_RUN -eq 0 ]]; then
      if claude mcp get unified-trace 2>&1 | grep -q "Connected"; then
        STATUS_UNIFIED_TRACE="PASS"
      else
        warn "unified-trace MCP: not connected"
        STATUS_UNIFIED_TRACE="FAIL"
      fi
    else
      STATUS_UNIFIED_TRACE="DRY_RUN"
    fi
  else
    err "unified-trace-mcp: npm install failed — see /tmp/unified-trace-install.log"
    STATUS_UNIFIED_TRACE="FAIL"
  fi
else
  warn "unified-trace-mcp: source not found under platform repo, or node missing"
  STATUS_UNIFIED_TRACE="FAIL"
fi

# ============================================================================
# 6c. OpenCode — independent, optional setup path (never blocks the rest)
# ============================================================================
log "=== 6c. OpenCode (independent, optional) ==="
if need opencode; then
  OC_CONFIG="$HOME/.config/opencode/opencode.jsonc"
  if dry "Would ensure $OC_CONFIG exists and check for unified-trace wiring"; then
    :
  else
    mkdir -p "$(dirname "$OC_CONFIG")"
    if [[ ! -f "$OC_CONFIG" ]]; then
      echo '{"$schema": "https://opencode.ai/config.json"}' > "$OC_CONFIG"
    fi
    if grep -q '"unified-trace"' "$OC_CONFIG" 2>/dev/null; then
      log "OpenCode already has unified-trace/knowledge-graph/code-cortex-mcp configured"
      STATUS_OPENCODE="PASS"
    else
      warn "OpenCode found but shared MCP tools not yet wired into $OC_CONFIG — see docs/opencode-setup.md for the block to add."
      STATUS_OPENCODE="MANUAL_STEP_REQUIRED"
    fi
  fi
else
  log "opencode binary not found — skipping (optional, does not block the rest of setup)"
  STATUS_OPENCODE="NOT ATTEMPTED (opencode binary not found)"
fi

# ============================================================================
# 6d. OpenCode subagent bridge — Claude Code -> OpenCode delegation (optional)
# ============================================================================
log "=== 6d. OpenCode subagent bridge (Claude Code only, optional) ==="
BRIDGE_DIR="$PLATFORM_REPO/shared/mcp-tools/opencode-mcp-bridge"
if [[ -d "$BRIDGE_DIR" ]] && need node && need opencode; then
  if [[ ! -d "$BRIDGE_DIR/node_modules" ]]; then
    if dry "Would run: npm install in $BRIDGE_DIR"; then
      :
    else
      (cd "$BRIDGE_DIR" && npm install --silent) >/tmp/opencode-bridge-install.log 2>&1
    fi
  fi
  if [[ -d "$BRIDGE_DIR/node_modules" ]] || [[ $DRY_RUN -eq 1 ]]; then
    if claude mcp get opencode-bridge >/dev/null 2>&1; then
      log "opencode-bridge MCP server already registered"
    elif dry "Would register opencode-bridge MCP server"; then
      :
    else
      log "Registering opencode-bridge MCP server (Claude Code, user scope)..."
      claude mcp add opencode-bridge -s user \
        -e "OPENCODE_BRIDGE_ALLOWED_ROOTS=$PROJECTS_DIR" \
        -e "OPENCODE_BRIDGE_AGENT=code-implementer" \
        -- node "$BRIDGE_DIR/index.js" >/tmp/opencode-bridge-register.log 2>&1
    fi
    if [[ $DRY_RUN -eq 0 ]]; then
      if claude mcp get opencode-bridge 2>&1 | grep -q "Connected"; then
        STATUS_OPENCODE_BRIDGE="PASS"
      else
        warn "opencode-bridge MCP: not connected"
        STATUS_OPENCODE_BRIDGE="FAIL"
      fi
    else
      STATUS_OPENCODE_BRIDGE="DRY_RUN"
    fi
  else
    STATUS_OPENCODE_BRIDGE="FAIL (npm install failed)"
  fi
else
  log "opencode-bridge: skipped (needs both node and opencode present, plus bridge source)"
  STATUS_OPENCODE_BRIDGE="SKIPPED (opencode not installed, or bridge source missing)"
fi

# ============================================================================
# 7. Autonomous Runner — build + test (optional component)
# ============================================================================
log "=== 7. Autonomous Runner ==="
RUNNER="$PLATFORM_REPO/autonomous-runner"
if [[ -d "$RUNNER" ]]; then
  if dry "Would run: npm ci && npm run build (and npm test unless --skip-runner-tests) in $RUNNER"; then
    STATUS_RUNNER="DRY_RUN"
  else
    (
      cd "$RUNNER"
      if [[ ! -d node_modules ]]; then
        npm ci --silent 2>&1 | tail -5
      fi
      npm run build --silent
    ) > /tmp/runner-build.log 2>&1
    if [[ -f "$RUNNER/dist/cli.js" ]]; then
      log "Build OK: $RUNNER/dist/cli.js"
      if [[ $SKIP_RUNNER_TESTS -eq 0 ]]; then
        if (cd "$RUNNER" && npm test --silent > /tmp/runner-test.log 2>&1); then
          log "Tests OK — $(tail -3 /tmp/runner-test.log | tr '\n' ' ')"
          STATUS_RUNNER="PASS"
        else
          err "Tests failed — see /tmp/runner-test.log"
          STATUS_RUNNER="FAIL"
        fi
      else
        log "Skipping tests (--skip-runner-tests)"
        STATUS_RUNNER="BUILD_ONLY"
      fi
    else
      err "Build failed — see /tmp/runner-build.log"
      STATUS_RUNNER="FAIL"
    fi
  fi
else
  warn "autonomous-runner not found at $RUNNER (optional component)"
  STATUS_RUNNER="OPTIONAL (not present)"
fi

# ============================================================================
# 8. Health check summary
# ============================================================================
log "=== 8. Health check ==="
echo ""
echo "Enterprise AI Platform : v$ENTERPRISE_AI_VERSION"
echo "Prerequisites           : $STATUS_PREREQS"
echo "Repositories            : $STATUS_REPOS"
echo "Claude Code CLI         : $STATUS_CLAUDE_CLI"
echo "Platform (global)       : $STATUS_PLATFORM"
echo "Knowledge Graph MCP     : $STATUS_KG"
echo "Code Cortex MCP         : $STATUS_CORTEX"
echo "Unified Trace MCP       : $STATUS_UNIFIED_TRACE"
echo "OpenCode (optional)     : $STATUS_OPENCODE"
echo "OpenCode bridge (opt.)  : $STATUS_OPENCODE_BRIDGE"
echo "Autonomous Runner       : $STATUS_RUNNER"
echo ""
if [[ ${#BLOCKERS[@]} -gt 0 ]]; then
  echo "BLOCKERS:"
  for b in "${BLOCKERS[@]}"; do echo "  - $b"; done
else
  echo "No blockers."
fi
if [[ $DRY_RUN -eq 1 ]]; then
  echo ""
  echo "[DRY-RUN] No files were written, nothing was installed, no indexing was performed."
fi

# ============================================================================
# 9. Manifest (safe to share — no secrets, no API keys, no tokens)
# ============================================================================
if [[ $DRY_RUN -eq 0 ]]; then
  MANIFEST="$SCRIPT_DIR/environment-manifest.md"
  gen_repo_block() {
    local path="$1"
    if [[ -d "$path/.git" ]]; then
      echo "  Path: $path"
      echo "  Remote: $(git -C "$path" remote get-url origin 2>/dev/null)"
      echo "  Branch: $(git -C "$path" branch --show-current 2>/dev/null)"
      echo "  Commit: $(git -C "$path" log -1 --oneline 2>/dev/null)"
      echo "  Status: $([[ -z "$(git -C "$path" status --porcelain 2>/dev/null)" ]] && echo clean || echo dirty)"
    else
      echo "  Path: $path"
      echo "  Status: NOT PRESENT"
    fi
  }

  {
    echo "========================================"
    echo "ENTERPRISE AI PLATFORM — ENVIRONMENT MANIFEST"
    echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "Enterprise AI Platform version: $ENTERPRISE_AI_VERSION"
    echo "========================================"
    echo ""
    echo "Enterprise AI Platform"
    gen_repo_block "$PLATFORM_REPO"
    echo ""
    echo "Knowledge Graph Generator"
    gen_repo_block "$KG_REPO"
    echo ""
    echo "Code Cortex MCP"
    gen_repo_block "$CORTEX_REPO"
    echo ""
    echo "GraphRAG"
    echo "  Status: NOT ADOPTED — superseded by Knowledge Generator + Code Cortex + Unified Trace."
    echo ""
    echo "Unified Trace MCP"
    echo "  Merges Knowledge Generator (cross-stack/confidence) + Code Cortex (exact AST calls)."
    echo "  Status: $STATUS_UNIFIED_TRACE"
    echo ""
    echo "Claude Code"
    echo "  Version: $(claude --version 2>&1)"
    echo "  Status: $STATUS_CLAUDE_CLI"
    echo ""
    echo "Node    : $(node --version 2>&1)"
    echo "Python  : $(python3 --version 2>&1)"
    echo "Java    : $(java --version 2>&1 | head -1)"
    echo ""
    echo "Knowledge Graph"
    echo "  Database: $KG_REPO/output/knowledge_graph.db"
    echo "  Status: $STATUS_KG"
    echo ""
    echo "MCP (registered at Claude Code USER scope — global, no per-project .mcp.json)"
    echo "  knowledge-graph: $STATUS_KG"
    echo "  code-cortex-mcp: $STATUS_CORTEX"
    echo "  unified-trace: $STATUS_UNIFIED_TRACE"
    echo "  opencode-bridge (optional, Claude -> OpenCode delegation): $STATUS_OPENCODE_BRIDGE"
    echo ""
    echo "OpenCode (optional — independent install)"
    echo "  Status: $STATUS_OPENCODE"
    echo ""
    echo "Autonomous Runner (optional component)"
    echo "  Status: $STATUS_RUNNER"
    echo ""
    echo "Product repos (informational only)"
    echo "  $BE_ROOT ($([[ -d "$BE_ROOT" ]] && echo present || echo "not found — set PROJECTS_DIR in paths.env if needed"))"
    echo "  $UI_ROOT ($([[ -d "$UI_ROOT" ]] && echo present || echo "not found — set PROJECTS_DIR in paths.env if needed"))"
    echo ""
    if [[ ${#BLOCKERS[@]} -eq 0 && "$STATUS_PREREQS" == "PASS" && "$STATUS_PLATFORM" == "PASS" && "$STATUS_CORTEX" == "PASS" && "$STATUS_UNIFIED_TRACE" == "PASS" ]]; then
      echo "Overall Status: READY"
    else
      echo "Overall Status: PARTIAL"
    fi
  } > "$MANIFEST"

  log "Manifest written: $MANIFEST"
fi
log "Done."
