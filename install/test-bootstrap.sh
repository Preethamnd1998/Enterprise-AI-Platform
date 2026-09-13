#!/usr/bin/env bash
# ============================================================================
# Enterprise AI Platform — bootstrap.sh test matrix
#
# Exercises install/bootstrap.sh against ISOLATED fake $HOME directories and
# manipulated $PATH/paths.env overrides — never the real ~/.claude,
# ~/.config/opencode, or shell profile. Real installs (npm/pip/git clone)
# are slow and network-dependent, so most scenarios run in --dry-run/
# --doctor mode and assert on the script's own decisions (log output),
# which is what actually needs proving: that detection/reuse/reconcile
# logic makes the right call, not that npm install works (that's npm's
# own test suite's job).
#
# Usage: bash install/test-bootstrap.sh
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP="$SCRIPT_DIR/bootstrap.sh"
WORKDIR="$(mktemp -d /tmp/enterprise-ai-bootstrap-test.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

PASS=0
FAIL=0
FAILED_NAMES=()

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); }

assert_contains() {
  local haystack="$1" needle="$2" desc="$3"
  if echo "$haystack" | grep -qF "$needle"; then pass "$desc"; else fail "$desc (expected to find: $needle)"; fi
}
assert_not_contains() {
  local haystack="$1" needle="$2" desc="$3"
  if echo "$haystack" | grep -qF "$needle"; then fail "$desc (should NOT contain: $needle)"; else pass "$desc"; fi
}
assert_count() {
  local haystack="$1" needle="$2" expected="$3" desc="$4"
  local actual
  actual="$(echo "$haystack" | grep -cF "$needle")"
  if [[ "$actual" -eq "$expected" ]]; then pass "$desc"; else fail "$desc (expected $expected occurrences, got $actual)"; fi
}

fresh_home() {
  local h="$WORKDIR/$1"
  mkdir -p "$h"
  echo "$h"
}

# A neutral CWD with no ancestor .mcp.json (see bootstrap.sh's claude_mcp
# comment for why this matters — project-scope .mcp.json shadows user-scope
# resolution regardless of $HOME).
NEUTRAL_CWD="$WORKDIR/neutral-cwd"
mkdir -p "$NEUTRAL_CWD"

run_bootstrap() {
  local home="$1"; shift
  (cd "$NEUTRAL_CWD" && HOME="$home" bash "$BOOTSTRAP" "$@" 2>&1)
}

echo "============================================================"
echo "Test A — Empty/new environment (--dry-run, so no real installs)"
echo "============================================================"
HOME_A="$(fresh_home home-a)"
OUT_A="$(run_bootstrap "$HOME_A" --dry-run)"
assert_contains "$OUT_A" "Would register knowledge-graph MCP server" "reports it would register knowledge-graph"
assert_contains "$OUT_A" "Would register unified-trace MCP server" "reports it would register unified-trace"
assert_contains "$OUT_A" "No files were written, nothing was installed, no indexing was performed" "confirms zero side effects"
FILES_A="$(find "$HOME_A" -mindepth 1 -not -path '*/.claude*' 2>/dev/null)"
if [[ -z "$FILES_A" ]]; then pass "no non-claude-CLI files created under fake HOME"; else fail "unexpected files created: $FILES_A"; fi

echo ""
echo "============================================================"
echo "Test B — Claude already installed (reused, not reinstalled)"
echo "============================================================"
HOME_B="$(fresh_home home-b)"
OUT_B="$(run_bootstrap "$HOME_B" --dry-run)"
assert_contains "$OUT_B" "claude CLI already installed" "detects the real system-wide claude CLI and reuses it (never reinstalls under a fake HOME)"

echo ""
echo "============================================================"
echo "Test C — OpenCode config already correctly configured -> reused"
echo "============================================================"
HOME_C="$(fresh_home home-c)"
mkdir -p "$HOME_C/.config/opencode"
cat > "$HOME_C/.config/opencode/opencode.jsonc" << 'EOF'
{"$schema": "https://opencode.ai/config.json", "mcp": {"unified-trace": {"type": "local"}}}
EOF
OUT_C="$(run_bootstrap "$HOME_C" --dry-run)"
assert_contains "$OUT_C" "already has unified-trace/knowledge-graph/code-cortex-mcp configured" "recognizes existing OpenCode config, does not overwrite"

echo ""
echo "============================================================"
echo "Test D — Existing OpenCode config with unrelated user keys -> merge preserves them"
echo "============================================================"
HOME_D="$(fresh_home home-d)"
mkdir -p "$HOME_D/.config/opencode"
cat > "$HOME_D/.config/opencode/opencode.jsonc" << 'EOF'
{"$schema": "https://opencode.ai/config.json", "theme": "my-custom-theme", "keybinds": {"foo": "bar"}}
EOF
run_bootstrap "$HOME_D" >/dev/null 2>&1 || true   # real run (not dry-run) so the merge actually executes
MERGED_D="$(cat "$HOME_D/.config/opencode/opencode.jsonc" 2>/dev/null || echo "MISSING")"
assert_contains "$MERGED_D" '"my-custom-theme"' "unrelated user key 'theme' preserved after merge"
assert_contains "$MERGED_D" '"unified-trace"' "unified-trace block added by merge"
assert_contains "$MERGED_D" '"foo": "bar"' "unrelated nested user key preserved after merge"

echo ""
echo "============================================================"
echo "Test E — Bootstrap twice -> no duplicates, identical second-run decisions"
echo "============================================================"
HOME_E="$(fresh_home home-e)"
mkdir -p "$HOME_E/.config/opencode"
echo '{"$schema": "https://opencode.ai/config.json"}' > "$HOME_E/.config/opencode/opencode.jsonc"
OUT_E1="$(run_bootstrap "$HOME_E" --dry-run)"
OUT_E2="$(run_bootstrap "$HOME_E" --dry-run)"
if [[ "$OUT_E1" == "$OUT_E2" ]]; then
  pass "identical dry-run output on consecutive runs (deterministic, no drift)"
else
  fail "dry-run output differs between run 1 and run 2 (should be identical against unchanged state)"
fi

echo ""
echo "============================================================"
echo "Test F — Incomplete KG checkout (vendored code-cortex/ missing) -> warned, not silently skipped"
echo "============================================================"
echo "  (Code Cortex is now vendored INSIDE knowledge-graph-generator, not"
echo "   a separate clone -- the only way it can be 'missing' is a stale/"
echo "   incomplete KG checkout that hasn't pulled the consolidation commit)"
HOME_F="$(fresh_home home-f)"
FAKE_TOOLS="$WORKDIR/fake-tools-f"
FAKE_KG="$FAKE_TOOLS/knowledge-graph-generator"
mkdir -p "$FAKE_KG/.git"   # present-looking repo, but with no code-cortex/ at all
OUT_F="$(cd "$NEUTRAL_CWD" && HOME="$HOME_F" EAP_TOOLS_DIR="$FAKE_TOOLS" bash "$BOOTSTRAP" --dry-run 2>&1)"
assert_contains "$OUT_F" "code-cortex-mcp/CMakeLists.txt not found under" "warns about the incomplete checkout rather than silently proceeding"
assert_contains "$OUT_F" "=== 1. Prerequisites ===" "rest of bootstrap still proceeds despite the incomplete component"

echo ""
echo "============================================================"
echo "Test G — Broken MCP registration -> detected and repaired"
echo "============================================================"
echo "  (exercises verify_or_repair_mcp directly -- registers a deliberately"
echo "   wrong path, then verifies bootstrap detects and fixes it)"
HOME_G="$(fresh_home home-g)"
mkdir -p "$HOME_G/.claude"
# Register unified-trace pointing at a WRONG path, simulating a stale/moved
# registration, then run bootstrap for real (not dry-run) and confirm it
# notices and repairs it.
(cd "$NEUTRAL_CWD" && HOME="$HOME_G" claude mcp add unified-trace -s user -- node /this/path/is/wrong/index.js >/dev/null 2>&1) || true
OUT_G="$(run_bootstrap "$HOME_G" --skip-runner-tests 2>&1)"
assert_contains "$OUT_G" "registered but pointing somewhere unexpected — repairing" "detects the stale registration"
AFTER_G="$(cd "$NEUTRAL_CWD" && HOME="$HOME_G" claude mcp get unified-trace 2>&1)"
assert_not_contains "$AFTER_G" "/this/path/is/wrong" "stale path no longer registered after repair"
assert_contains "$AFTER_G" "shared/mcp-tools/unified-trace-mcp/index.js" "repaired registration points at the correct path"

echo ""
echo "============================================================"
echo "Test H — Missing optional OpenCode -> required setup still succeeds"
echo "============================================================"
HOME_H="$(fresh_home home-h)"
# Filter the REAL $PATH down to only directories that do NOT contain an
# opencode executable -- keeps every other tool (bash, coreutils, git,
# node, python, java...) working normally, unlike rebuilding a minimal
# PATH from scratch (which breaks basic shell operation and gives a false
# "missing" reading for tools that were never actually the target).
PATH_NO_OPENCODE=""
IFS=':' read -ra _dirs <<< "$PATH"
for d in "${_dirs[@]}"; do
  [[ -x "$d/opencode" ]] && continue
  PATH_NO_OPENCODE="${PATH_NO_OPENCODE:+$PATH_NO_OPENCODE:}$d"
done
OUT_H="$(cd "$NEUTRAL_CWD" && HOME="$HOME_H" PATH="$PATH_NO_OPENCODE" bash "$BOOTSTRAP" --dry-run 2>&1)"
assert_contains "$OUT_H" "NOT ATTEMPTED (opencode binary not found)" "OpenCode correctly reported as not attempted"
assert_not_contains "$OUT_H" "BLOCKERS:" "no blockers -- optional component absence never blocks the rest"

echo ""
echo "============================================================"
echo "Test I — Dry run -> zero modifications"
echo "============================================================"
HOME_I="$(fresh_home home-i)"
BEFORE_I="$(find "$HOME_I" -mindepth 1 2>/dev/null | sort)"
run_bootstrap "$HOME_I" --dry-run >/dev/null 2>&1
AFTER_I="$(find "$HOME_I" -mindepth 1 -not -path '*/.claude*' 2>/dev/null | sort)"
if [[ "$BEFORE_I" == "$AFTER_I" ]]; then
  pass "zero non-CLI-inherent filesystem modifications under --dry-run"
else
  fail "unexpected filesystem changes under --dry-run: $AFTER_I"
fi

echo ""
echo "============================================================"
echo "Test J — Doctor -> accurate health status, no indexing"
echo "============================================================"
HOME_J="$(fresh_home home-j)"
OUT_J="$(run_bootstrap "$HOME_J" --doctor)"
assert_contains "$OUT_J" "Doctor complete. No files were written, no indexing was performed." "doctor completes read-only"
assert_contains "$OUT_J" "[MISSING] knowledge-graph (not registered)" "doctor accurately reports unregistered server under fresh HOME"
assert_not_contains "$OUT_J" "Running indexer" "doctor never triggers indexing"

echo ""
echo "============================================================"
echo "RESULTS: $PASS passed, $FAIL failed"
echo "============================================================"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed:"
  for n in "${FAILED_NAMES[@]}"; do echo "  - $n"; done
  exit 1
fi
exit 0
