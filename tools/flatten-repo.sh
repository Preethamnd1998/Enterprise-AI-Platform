#!/usr/bin/env bash
# TK-024 — Flatten nested double-directory structure
# SUPERSEDED 2026-07-08: the flatten this script describes was executed manually
# (see MASTER-PROJECT-BOARD.md "Repo Flatten" entry and docs/file-migration-map.md
# execution note). Do not run this script — commands/, standards/ (lines below) and
# the $INNER directory no longer exist; it will fail on the dirty-tree precheck
# regardless. Kept for historical reference only.
# Run from git repo root: D:/enterprise-ai-platform/
# Requires: git, run in bash with clean working tree
# Effect: promotes enterprise-ai-platform/enterprise-ai-platform/* to repo root
# MUST be run as a standalone commit before Sprint 1 merge to main.
set -e

INNER="enterprise-ai-platform"

echo "=== Flatten: $INNER/ -> repo root ==="
echo "Pre-check: git status must be clean"
git status --porcelain | grep -q . && { echo "ABORT: working tree is dirty"; exit 1; }

# 1. Promote all inner files via git mv (preserves history)
git mv "$INNER/.claude-plugin" .claude-plugin 2>/dev/null || true
git mv "$INNER/.gitlab-ci.yml" .gitlab-ci.yml
git mv "$INNER/CHANGELOG.md" CHANGELOG.md 2>/dev/null || true
git mv "$INNER/VERSION" VERSION 2>/dev/null || true
git mv "$INNER/adapters" adapters
git mv "$INNER/ci" ci
git mv "$INNER/commands" commands
git mv "$INNER/docs" docs
git mv "$INNER/install" install
git mv "$INNER/repo-template" repo-template
git mv "$INNER/shared" shared
git mv "$INNER/standards" standards
git mv "$INNER/templates" templates
git mv "$INNER/tools" tools

# 2. Remove the now-empty inner directory
rmdir "$INNER" 2>/dev/null || rm -rf "$INNER"

# 3. Reconcile outer root files (keep the ones from inner, update outer README)
# The outer README.md and contributing.md stay at root as-is.
# context/ directory is deleted (tool artifacts)
rm -rf context/

# 4. Stage and commit
git add -A
git commit -m "chore: flatten nested double-directory structure

Move enterprise-ai-platform/enterprise-ai-platform/* to repo root.
This is TK-024 (US-008, Sprint 1, Phase A).
All platform code is now at the git root; no nested subdirectory.

Co-Authored-By: Platform Engineer <platform@enterprise-ai-platform>"

echo "=== Flatten complete ==="
echo "Verify: ls -la (no enterprise-ai-platform/ subdirectory)"
ls -la
