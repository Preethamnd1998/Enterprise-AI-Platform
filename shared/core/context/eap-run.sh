#!/usr/bin/env bash
# eap-run — run a noisy command (build / test / log tail / long git output) and
# print only what is load-bearing (contract §6a): exit code, error lines with a
# little context, failing tests, root-cause frames, and the last few lines.
# The FULL output is always kept in a log file whose path is printed, so nothing
# is lost — it just does not enter the model's context unless asked for.
#
#   eap-run [--lines N] [--context N] [--quiet-ok] -- <command ...>
#   eap-run mvn -q test                 (the "--" is optional when no options are used)
#
#   --lines N     max lines printed (default 80; EAP_RUN_LINES)
#   --context N   lines of context kept around each error match (default 2)
#   --quiet-ok    on exit 0 with no error matches print only the summary line
#   EAP_RUN_LOG_DIR  where full logs go (default ${TMPDIR:-/tmp}/eap-run)
set -u
LINES="${EAP_RUN_LINES:-80}"; CTX=2; QUIET_OK=0
while [ $# -gt 0 ]; do
  case "$1" in
    --lines) LINES="$2"; shift 2;;
    --context) CTX="$2"; shift 2;;
    --quiet-ok) QUIET_OK=1; shift;;
    --) shift; break;;
    -h|--help) sed -n '2,16p' "$0"; exit 0;;
    *) break;;
  esac
done
[ $# -gt 0 ] || { echo "eap-run: no command given" >&2; exit 2; }

LOG_DIR="${EAP_RUN_LOG_DIR:-${TMPDIR:-/tmp}/eap-run}"; mkdir -p "$LOG_DIR"
SLUG="$(printf '%s' "$1" | tr -c 'A-Za-z0-9' '_' | cut -c1-24)"
LOG="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-$SLUG-$$.log"

# Run with a pseudo-terminal-free pipe; keep the command's own exit code.
"$@" > "$LOG" 2>&1
RC=$?
TOTAL=$(wc -l < "$LOG" | tr -d ' ')

# Error / signal patterns — Maven, Gradle, npm, Angular CLI, Jest/Karma, JUnit,
# TypeScript, Python, Flutter, Spring Boot stack traces, git conflicts.
PAT='(\[ERROR\]|^ERROR|ERROR:| ERROR |FAIL(ED|URE)?\b|Exception\b|Caused by:|error TS[0-9]+|npm ERR!|✗|✘|AssertionError|Tests run:.*(Failures|Errors): [1-9]|BUILD (SUCCESS|FAILURE)|Compilation failure|cannot find symbol|Traceback|CONFLICT|fatal:|Segmentation fault|OutOfMemoryError|Test Suites:.*failed|Tests:.*failed|[0-9]+ failing|Expected .* but was)'

{
  echo "[eap-run] exit=$RC lines=$TOTAL log=$LOG"
  if [ "$RC" -eq 0 ] && ! grep -Eq "$PAT" "$LOG"; then
    if [ "$QUIET_OK" -eq 1 ]; then :; else echo "--- last 5 lines ---"; tail -n 5 "$LOG"; fi
  else
    # Error matches with context; collapse consecutive duplicate lines; skip
    # the repetitive middle of stack traces (keep frames that mention the
    # project's own packages, the first 3 frames and 'Caused by').
    grep -nE -B"$CTX" -A"$CTX" "$PAT" "$LOG" \
      | sed -E 's/^([0-9]+)[-:]/\1: /' \
      | awk '
          { line=$0; sub(/^[0-9]+: /,"",line) }
          line==prev { dup++; next }
          dup>0 { print "      … (repeated " dup " more times)"; dup=0 }
          { print; prev=line }
          END { if (dup>0) print "      … (repeated " dup " more times)" }' \
      | awk -v max=$((LINES-12)) '
          /^[0-9]+: +at / { frames++; if (frames>3 && $0 !~ /(com\.lifetrenz|lifetrenz|Caused by)/) { skipped++; next } }
          !/^[0-9]+: +at / { if (skipped>0) { print "      … " skipped " framework frames omitted"; skipped=0 } frames=0 }
          n<max { print; n++ ; next }
          { more++ }
          END { if (skipped>0) print "      … " skipped " framework frames omitted"; if (more>0) print "… +" more " more matching lines in log" }'
    echo "--- last 8 lines ---"; tail -n 8 "$LOG"
  fi
} | head -n "$LINES"
exit "$RC"
