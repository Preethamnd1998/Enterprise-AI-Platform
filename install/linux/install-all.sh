#!/usr/bin/env bash
# Install the platform runtime, then (optionally) client integrations.
#   ./install/<os>/install-all.sh [--apply] [--with-cortex] [--clients all|claude-code,cursor,opencode]
# Dry-run unless --apply. Thin wrapper over `node shared/core/cli.js`.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
APPLY=(); CORTEX=(); CLIENTS=none
while [[ $# -gt 0 ]]; do case "$1" in
  --apply) APPLY=(--apply);; --with-cortex) CORTEX=(--with-cortex);; --clients) CLIENTS="${2:?}"; shift;;
  *) echo "unknown option: $1" >&2; exit 2;; esac; shift; done
for t in node python3; do command -v "$t" >/dev/null || { echo "$t not found on PATH" >&2; exit 1; }; done
[[ -f paths.local.env ]] || echo "warn: paths.local.env missing — copy paths.local.env.example and set PROJECTS_DIR" >&2
node shared/core/cli.js platform:install "${APPLY[@]}" "${CORTEX[@]}"
node shared/core/cli.js platform:doctor
[[ "$CLIENTS" == none ]] || node shared/core/cli.js plugin:install "$CLIENTS" "${APPLY[@]}"
