#!/usr/bin/env bash
# Enterprise AI Platform — Claude adapter installer (POSIX)
# POSIX parity with adapters/claude/install.ps1
# Tested on: Ubuntu 22.04+, macOS 13+ (Ventura)
# Requires: bash >= 4, node >= 18, git >= 2.40
# Usage:
#   ./adapters/claude/install.sh                   # global install only
#   ./adapters/claude/install.sh --repo /path/to/repo   # per-repo install
#   ./adapters/claude/install.sh --dry-run          # dry run (no writes)
#   ./adapters/claude/install.sh --force            # re-copy even if up to date

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORCE=0
DRY_RUN=0
REPO_PATH=""

# ── Argument parsing ───────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)     REPO_PATH="$2"; shift 2 ;;
    --force)    FORCE=1; shift ;;
    --dry-run)  DRY_RUN=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Locate platform root ───────────────────────────────────────────────────
find_platform_root() {
  local d="$SCRIPT_DIR"
  while [[ "$d" != "/" ]]; do
    [[ -f "$d/shared/contract.md" ]] && echo "$d" && return
    d="$(dirname "$d")"
  done
  echo "ERROR: cannot find platform root (no shared/contract.md)" >&2; exit 1
}

PLATFORM_ROOT="$(find_platform_root)"
VERSION="$(cat "$PLATFORM_ROOT/VERSION" | tr -d '[:space:]')"
CLAUDE_GLOBAL="$HOME/.claude"

log() { echo "[install.sh] $*"; }
dry() { [[ $DRY_RUN -eq 1 ]] && log "[DRY-RUN] $*" && return 0; return 1; }

# ── Hash-based idempotent copy ─────────────────────────────────────────────
hash_file() { sha256sum "$1" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$1" 2>/dev/null | cut -d' ' -f1; }

install_file() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [[ -f "$dst" && $FORCE -eq 0 ]]; then
    local src_hash dst_hash
    src_hash="$(hash_file "$src")"
    dst_hash="$(hash_file "$dst")"
    [[ "$src_hash" == "$dst_hash" ]] && log "Unchanged: $dst" && return 0
  fi
  dry "Would copy: $src → $dst" && return 0
  [[ -f "$dst" ]] && cp "$dst" "$dst.prev" && log "Backup: $dst.prev"
  cp "$src" "$dst"
  log "Copied: $dst"
}

install_dir() {
  local src="$1" dst="$2"
  [[ ! -d "$src" ]] && log "WARN: source dir not found: $src" && return 0
  find "$src" -type f | while read -r f; do
    local rel="${f#$src/}"
    install_file "$f" "$dst/$rel"
  done
}

inject_markers() {
  local src="$1" dst="$2" start_marker="$3" end_marker="$4"
  local content; content="$(cat "$src")"
  if [[ -f "$dst" ]]; then
    # Check if markers exist in target
    if grep -q "$start_marker" "$dst" && grep -q "$end_marker" "$dst"; then
      dry "Would inject markers in: $dst" && return 0
      cp "$dst" "$dst.prev"
      # Replace content between markers using awk
      awk -v new_content="$content" \
        -v start="$start_marker" -v end="$end_marker" \
        'BEGIN{inside=0}
         $0==start{print new_content; inside=1; next}
         $0==end{inside=0; next}
         !inside{print}' "$dst.prev" > "$dst"
      log "Marker-injected: $dst"
      return 0
    fi
  fi
  # No markers — create file
  dry "Would create: $dst" && return 0
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  log "Created: $dst"
}

# ═══════════════════════════════════════════════════════════════════════════
# GLOBAL INSTALL — standards, commands, skills, knowledge, contract kernel → ~/.claude/
# ═══════════════════════════════════════════════════════════════════════════
log "=== Global install (v$VERSION) ==="

install_dir "$PLATFORM_ROOT/shared/commands"   "$CLAUDE_GLOBAL/commands"
install_dir "$PLATFORM_ROOT/shared/standards"  "$CLAUDE_GLOBAL/standards"
install_dir "$PLATFORM_ROOT/shared/skills"     "$CLAUDE_GLOBAL/skills"

# Knowledge + its index (company-profile.md) — contract kernel §F10 instructs
# "Read only the matching file(s) under <root>/knowledge/ (index:
# company-profile.md's topic table)" but, until this fix (2026-10-13 reorg
# audit), nothing actually installed either one anywhere for this adapter.
install_dir "$PLATFORM_ROOT/shared/knowledge" "$CLAUDE_GLOBAL/knowledge"
install_file "$PLATFORM_ROOT/shared/company-profile.md" "$CLAUDE_GLOBAL/company-profile.md"

# Inject contract kernel into ~/.claude/CLAUDE.md
CLAUDE_MD="$CLAUDE_GLOBAL/CLAUDE.md"
CONTRACT_SRC="$PLATFORM_ROOT/shared/contract.md"

if [[ -f "$CONTRACT_SRC" ]]; then
  inject_markers "$CONTRACT_SRC" "$CLAUDE_MD" \
    "<!-- enterprise-ai-platform:contract:start -->" \
    "<!-- enterprise-ai-platform:contract:end -->"
fi

# ═══════════════════════════════════════════════════════════════════════════
# PER-REPO INSTALL — settings.json + hooks + .ai/ → $REPO_PATH/.claude/
# ═══════════════════════════════════════════════════════════════════════════
if [[ -n "$REPO_PATH" ]]; then
  log "=== Per-repo install → $REPO_PATH ==="

  CLAUDE_REPO="$REPO_PATH/.claude"
  AI_DIR="$REPO_PATH/.ai"

  mkdir -p "$CLAUDE_REPO/hooks" "$AI_DIR"

  # settings.json
  install_file \
    "$PLATFORM_ROOT/adapters/claude/config/settings.json" \
    "$CLAUDE_REPO/settings.json"

  # hooks
  install_file \
    "$PLATFORM_ROOT/adapters/claude/hooks/hash-check.js" \
    "$CLAUDE_REPO/hooks/hash-check.js"

  install_file \
    "$PLATFORM_ROOT/adapters/claude/hooks/audit.js" \
    "$CLAUDE_REPO/hooks/audit.js"

  # .ai/.contract-hash
  HASH_FILE="$PLATFORM_ROOT/shared/contract.md.sha256"
  if [[ -f "$HASH_FILE" ]]; then
    HASH_DST="$AI_DIR/.contract-hash"
    if [[ ! -f "$HASH_DST" ]] || [[ $FORCE -eq 1 ]]; then
      dry "Would write: $HASH_DST" || { cp "$HASH_FILE" "$HASH_DST"; log "Wrote: $HASH_DST"; }
    else
      log "Unchanged: $HASH_DST"
    fi
  fi

  # .gitignore entry for .ai/
  GITIGNORE="$REPO_PATH/.gitignore"
  if [[ -f "$GITIGNORE" ]] && ! grep -q "\.ai/\.session-verified" "$GITIGNORE"; then
    dry "Would update: $GITIGNORE" || {
      printf '\n# Enterprise AI Platform runtime\n.ai/.session-verified\n.ai/.contract-hash\n' >> "$GITIGNORE"
      log "Updated: $GITIGNORE"
    }
  fi

  # .platform-version.json
  PV_FILE="$AI_DIR/.platform-version.json"
  dry "Would write: $PV_FILE" || {
    cat > "$PV_FILE" <<EOF
{
  "version": "$VERSION",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "channel": "stable",
  "adapter": "claude",
  "features": {
    "mcp-allowlist": true,
    "hash-check": true,
    "contract-injection": true
  }
}
EOF
    log "Wrote: $PV_FILE"
  }
fi

log "=== Done ==="
