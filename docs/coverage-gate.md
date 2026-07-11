# Coverage Gate
**Status:** Phase C — warn mode active (v4.0)  
**Date:** 2026-07-07 (TK-081)  
**Features:** FT-044, FT-087, BUG-B7  

---

## Overview

The coverage gate is a CI + /test command integration that warns (Phase C) or blocks (Phase D+)
when changed files lack test coverage. It closes BUG-B7: coverage gate location/config undefined.

```
Phase C (v4.0): warn mode   — low coverage emits WARNING; pipeline continues
Phase D+ (future): enforce  — low coverage fails the pipeline
```

---

## Components

| Component | Location | Purpose |
|---|---|---|
| Config template | `shared/templates/coverage.yml` | Per-repo settings; install to `.ai-platform/coverage.yml` |
| CI job | `.gitlab-ci.yml` `coverage-gate` | Reads config, checks thresholds, emits warn/fail |
| /test command output | `shared/commands/test.md §4` | Gap report section (manual; no tooling required) |

---

## Per-repo setup

1. Copy the template:
   ```powershell
   Copy-Item shared/templates/coverage.yml .ai-platform/coverage.yml
   ```

2. Commit `.ai-platform/coverage.yml` to the repo.

3. The CI `coverage-gate` job reads this file. It runs on every MR.

---

## Phase C behavior (warn mode)

- **Threshold = 0** for all stacks: warns if a changed file has **zero** tests.
- Pipeline does **not** fail. The warning is visible in the MR pipeline output.
- The warning message:
  ```
  COVERAGE WARN: 2 changed file(s) have no detected test coverage.
    - src/main/java/com/example/OrderService.java
    - src/app/ward/ward.service.ts
  Coverage gate is in warn mode. No action required (upgrade to enforce when ready).
  ```

## Phase D+ behavior (enforce mode — not yet active)

When `gate_mode: enforce` in `.ai-platform/coverage.yml`:
- Pipeline fails if `thresholds.java.line > 0` and coverage is below threshold.
- Enforce mode should only be enabled after baseline coverage is established.

---

## How the CI job works

1. Reads `.ai-platform/coverage.yml` from the repo root.
2. If file absent: defaults to `gate_mode: warn`, thresholds 0 for all stacks.
3. Reads coverage reports from `report_paths.*` (JaCoCo XML or LCOV).
4. If report absent: emits `COVERAGE_TOOL_UNAVAILABLE` — warn only, never fail.
5. Compares changed files (from `git diff --name-only origin/main`) against coverage data.
6. In warn mode: always exits 0 (pipeline green), emits warning message.
7. In enforce mode: exits 1 if threshold breached.

---

## Allow-list

Files matching `allow_list` patterns are excluded from the coverage gate.
Defaults cover generated code, mappers, environment files, Spring config, and Flutter
generated Dart (`*.g.dart`, `*.freezed.dart`).

To add a path: edit `.ai-platform/coverage.yml` in the consuming repo.
Do NOT modify the template in `shared/templates/coverage.yml` for repo-specific exclusions.

---

## Rollback

The coverage gate is additive — it never blocks in Phase C (warn mode).
To disable entirely: remove or rename `.ai-platform/coverage.yml` in the consuming repo.
The CI job will default to warn mode with threshold 0, which is a no-op if no changed files
are completely uncovered.
