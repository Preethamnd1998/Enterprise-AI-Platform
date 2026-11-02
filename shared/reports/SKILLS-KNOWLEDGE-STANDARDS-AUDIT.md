# Skills / Knowledge / Standards — Audit Report

**Date:** 2026-10-13
**Scope:** `shared/skills/`, `shared/knowledge/`, `shared/standards/` (64 files before this
pass; 2 removed as redundant, 5 relocated, several corrected in place).
**Method:** every real file read in full (except the 188 vendored third-party
`modern-web-guidance/guides/**` files, out of scope — upstream content, already correctly
classified as a skill asset). Two factual conflicts found between documents were resolved by
**tracing real source code**, not by preferring one document over another — see §4.

---

## 1. Classification model used

- **Skill** = how-to / procedure an agent follows (`SKILL.md`, discovered natively by Claude
  Code and OpenCode — see `shared/skills/README.md`).
- **Knowledge** = descriptive fact about the system or business domain — what IS, not what to
  do. Indexed by `shared/company-profile.md`'s topic table.
- **Standard** = a mandatory rule the agent MUST follow when writing code. Loaded lazily by
  stack/layer, per `shared/contract.md` §5.

## 2. Misclassified / misplaced resources — fixed

| File | Was | Now | Why |
|---|---|---|---|
| `shared/knowledge/architecture/running-locally.md` | Knowledge | `shared/skills/running-locally-skill/SKILL.md` | Pure procedure ("how to run the app locally"), not a fact about the system. |
| `shared/knowledge/custom-flows/abdm/abdm-integration-backend.md` | Knowledge | `shared/skills/abdm-integration-backend/SKILL.md` | Already had `SKILL.md`-shaped frontmatter (`metadata.type: skill`) but wasn't named `SKILL.md` or under `shared/skills/` — **invisible to both Claude Code's and OpenCode's actual skill scanner**, the whole time. |
| `shared/knowledge/custom-flows/abdm/abdm-integration-frontend.md` | Knowledge | `shared/skills/abdm-integration-frontend/SKILL.md` | Same issue as above. |

`shared/knowledge/custom-flows/abdm/` is now empty and was removed. `shared/company-profile.md`'s
knowledge topic table was updated (ABDM row removed; a new line points procedural content to
`shared/skills/` instead).

### Hash-pinned exception — NOT moved, left in place with a note

`shared/knowledge/architecture/saga-tracing.md` is equally procedure-shaped (how to use the
`saga` MCP tool) but its exact path is referenced **inside `shared/contract.md`'s KERNEL
section** (between the `enterprise-ai-platform:kernel:start`/`:end` markers), which is
hash-pinned (`shared/contract.md.sha256`) and verified by `adapters/claude/hooks/hash-check.js`
on every tool call in every repo that has this platform installed. Moving it would require
editing the kernel text, recomputing the hash, and a fleet-wide reinstall before hash-check would
stop failing everywhere. Left in place with an explanatory `<!-- CLASSIFICATION NOTE -->` instead
of a physical move — see the file itself.

### Inert fake-skill frontmatter — removed (4 files)

`shared/standards/backend/spring.md`, `shared/standards/frontend/angular.md`,
`shared/standards/mobile/flutter.md`, `shared/standards/migration/semantic-git.md` each carried
`name: <x>-skill` / `description:` YAML frontmatter mimicking a `SKILL.md` — but they are
STANDARDS (mandatory rules), are not under `shared/skills/`, and are not named `SKILL.md`, so the
frontmatter was never functional, just misleading decoration. Removed, replaced with a plain
Markdown header + an explanatory comment. These are also the most likely origin of the dangling
ABDM `loads-after` references below (names are close but don't even match: `spring-skill` vs.
`spring-enterprise-backend`; `angular-skill` vs. `angular-enterprise-ui` — whoever wrote the ABDM
skills anticipated a different, never-built set of "base" skills).

### Dangling metadata — removed

Both ABDM skills' frontmatter had `loads-after: spring-enterprise-backend` /
`loads-after: angular-enterprise-ui`. Neither name resolves to anything in this platform, and
`loads-after` is not a field either Claude Code's or OpenCode's skill loader reads — it was
inert either way. Removed; replaced with a plain-prose pointer to the real standards files
(`shared/standards/backend/spring.md`, `shared/standards/frontend/angular.md`) that actually
carry the baseline conventions these skills build on.

### Redundant placeholder — removed

`shared/knowledge/.gitkeep` — the directory has had 15 real files since well before this audit;
the placeholder was redundant. Removed. (`.DS_Store` junk — 4 stray files under `shared/` —
removed separately; already `.gitignore`d, so this has no git impact.)

## 3. Resources audited and found correctly placed (no change)

- `shared/knowledge/architecture/architecture.md`, `dependencies.md`, `environments.md`,
  `projects.md`, `redmine.md` — pure reference data, correctly KNOWLEDGE.
- `shared/knowledge/custom-flows/bom/` (all 5 files) — a genuinely well-run reverse-engineering
  knowledge base: explicit `CONFIRMED`/`PENDING`/`UNKNOWN` tagging throughout, correct
  cross-linking, and its one procedural-sounding section (§21 "AI Agent Modification Guide")
  stays descriptive rather than a numbered procedure. **Use this group as the template** for how
  a multi-file knowledge base should be written.
- `shared/standards/testing.md` vs. `shared/standards/testing/*` — the platform's own
  documentation claims an intentional two-tier design (`testing/*` "supplements, never
  overrides" `testing.md`). **Verified: the claim holds.** `testing/coverage-and-regression.md`
  explicitly quotes `testing.md`'s section numbers rather than restating them, scopes its one
  real extension claim narrowly (JaCoCo confirmed only in `inventory-service`'s `pom.xml`, not
  claimed platform-wide), and ends with a section literally titled "Do not contradict
  `testing.md` §7." The other 12 topic files each open with a "Verified stack" callout scoped to
  the specific service where that tooling was actually confirmed present. **Use this pairing as
  the template** for how a standard + its supplementary knowledge-base should coexist.
- `shared/standards/backend/db-migration.md` correctly disambiguates itself from the unrelated
  `shared/standards/migration/` (git branch/cherry-pick) directory in its own opening line.

## 4. Factual conflicts between documents — verified against live source, then fixed

Two pairs of documents made contradictory factual claims about the same real code. Per this
task's own instruction not to merely trust one document over another, both were **resolved by
tracing the actual, current source code**, not by preferring the more detailed-sounding
document.

### 4a. Pagination: 0-based vs. 1-based `pageNo` — standards file was wrong

- `shared/standards/frontend/pagination.md`'s canonical example sent `pageNo: event.page + 1`
  (1-based) with field name `noOfRecord`.
- `shared/knowledge/custom-flows/pagination-global-filter/Pagination-Architecture.md` asserted
  the whole stack is 0-based throughout and that sending 1-based is "a bug, not a stylistic
  choice."
- **Verified by tracing a real, live call chain:**
  `in-patient-q.component.ts: paginate(event) → search(true, event.page) → onSearchIpDashboard(page)`
  → `InPatientService.getAllDashboardInPatient(..., pageNo=page, pageSize, ...)` → `HttpParams`
  sets `"pageNo"` directly from the raw, un-incremented `event.page`, and the actual param name
  is `"pageSize"`, not `"noOfRecord"`.
- **The knowledge file was correct; the standards file's canonical example was wrong and has
  been fixed** (`shared/standards/frontend/pagination.md`) — an agent following the old
  "standard" today would have introduced a real off-by-one bug in any new paginated screen.

### 4b. `AccessRightsCacheService` storage mechanism — settings skill was wrong

- `shared/standards/frontend/app-shell-menu-config-cache.md` claimed `AccessRightsCacheService`
  uses the `idb` wrapper library.
- `shared/skills/settings-redic-index-db-cache-skill/SKILL.md` cited the same class as supporting
  evidence that this codebase's convention is "raw `window.indexedDB`, no wrapper library."
- **Verified by reading the actual source:** `access-rights-cache.service.ts:2` —
  `import { openDB, IDBPDatabase } from 'idb';` — confirms the standards file's claim.
  `settings-cache-db.ts` and `config-menu.service.ts` (the other two cited examples) both use
  raw `window.indexedDB.open(...)`, confirming the general "no wrapper" convention does hold —
  **except** for `AccessRightsCacheService`, which the skill wrongly cited as an example of it.
- **Fixed:** the settings skill no longer cites `AccessRightsCacheService` as supporting
  evidence; it's now noted as the one real exception, with a pointer to the standards file that
  covers that separate (older, parallel) caching subsystem correctly.

## 5. Coverage gap (not a conflict, a completeness problem) — fixed with a cross-reference

`shared/standards/frontend/global-filter-search.md` documents exactly one of (at least) three
distinct search/filter subsystems — the FDM filter-panel pattern. The knowledge file's own
"HEADLINE FINDING" warns that `app-searchbar-all-appointment` is **not** a global patient search,
and separately documents the real Core-owned, cross-module patient-identity search API
(`core-service GET /core/patient/list`). The standard never mentioned that API exists, so a
developer who read only the standard and needed "find a patient anywhere" had no way to discover
the reusable endpoint and was likely to reimplement a weaker module-local search — exactly the
bug pattern the knowledge file's own `BUG_PATTERN` section warns against. **Fixed:** added a
scope note to the standard pointing at the knowledge file's three-subsystem breakdown.

## 6. Large documents with embedded skill/standard content — flagged, not split

`shared/knowledge/custom-flows/upload/CORE_UPLOAD_FRAMEWORK_ARCHITECTURE.md` (2065 lines),
`RCM-New-Upload-Knowledge.md` (1370 lines), `Pagination-Architecture.md`, and
`Global-Filter-Search-Architecture.md` each mix KNOWLEDGE (the bulk of the document) with an
embedded SKILL section (a numbered "how to add/debug a new one of these") and, in the upload
docs, a short STANDARD section ("Clean Code Standards"). **Decision: left as single files**, with
a short classification note added at the top of each marking the section boundaries, rather than
physically extracted into 3 separate files per document. Rationale: these are large, actively
used, internally disciplined documents (the same `CONFIRMED`/`INFERRED`/`NOT FOUND` tagging
discipline as the BOM group); a hasty structural split under this task's effort budget risked
losing cross-section context or introducing errors for a classification-only concern, and the
task's own instruction (§7: "preserve existing work, avoid destructive changes") weighs against
it. **Recommended follow-up** (not done here): extract each embedded "AI_IMPLEMENTATION_GUIDE" /
"AI_REBUILD_SPECIFICATION"-shaped section into its own skill once there's room to review the
split carefully, one document at a time.

## 7. A pre-existing, larger installer gap — partially fixed, partially flagged

Discovered while verifying "how does `shared/knowledge/` actually reach a consuming repo":
**`shared/rules/`, `shared/company-profile.md`, and `shared/knowledge/` are all referenced by
name inside `shared/contract.md`'s hash-pinned KERNEL section, but none of the three was
actually installed anywhere by the real, working installer** (`adapters/claude/install.sh` /
`install.ps1` — the only adapter with a install script this session could execute and verify;
`adapters/opencode|copilot|antigravity/install.ps1` were not tested, no `pwsh` available in this
shell). `shared/company-profile.md` and `shared/knowledge/` *were* mapped in several **stub**
adapters' `file-map.yml` (cline, cursor, roo-code, windsurf, vscode-agent, continue — all
explicitly inactive per `PROJECT-STRUCTURE.md`), but never in the real ones.

- **Fixed** (in scope — `knowledge` is one of this task's 3 named directories, and
  `company-profile.md` is its index, without which `knowledge/` is undiscoverable): added global
  install targets for `shared/knowledge/` → `~/.claude/knowledge/` and
  `shared/company-profile.md` → `~/.claude/company-profile.md` to `adapters/claude/install.sh`,
  `install.ps1`, and `file-map.yml`. Verified end-to-end — see the Validation Report.
- **Flagged, not fixed** (out of this task's explicit 3-directory scope): `shared/rules/`'s
  per-repo install section in `adapters/claude/file-map.yml` is commented out
  ("Phase D — not yet available"), and there's no global install for it either, despite the
  kernel's own "Lazy rules (Phase D+)" line instructing agents to read
  `~/.claude/rules/coding-style.md` etc. This is a real, separate gap worth a dedicated follow-up
  — not acted on here since `rules/` wasn't one of the three directories this task named, and
  fixing it responsibly means deciding the global-vs-per-repo install semantics for `rules/`,
  which deserves its own review rather than a rushed addition alongside this task.
- **Also flagged:** `install/.github/ai-platform/` and `install/.opencode/ai-platform/` are
  documented ("reference snapshots," not canonical) copies of what the installers produce. They
  still contain the pre-fix `spring-skill`/`angular-skill`/etc. frontmatter from §2. Not hand-
  edited here — they should be regenerated via the normal install flow rather than patched
  directly, and the normal flow was not run against them in this pass.

## 8. Requirement 6 — "follow custom coding workflow, reuse implementations, follow standards,
test changes, report real verification" — already structurally satisfied, verified in place

This is already enforced by existing, correctly-classified resources, not something this audit
needed to build new:
- **Reuse:** `shared/rules/coding-style.md` CS-01 ("follow established patterns first") and
  CS-10 (a 5-rung decision ladder that stops at reuse before new code) already mandate this.
- **Standards:** the lazy-loading contract in `shared/contract.md` §5 (kernel-level) already
  requires reading the matching `shared/standards/` file(s) for any code-touching task.
- **Testing / real verification:** `shared/rules/testing.md` TR-02 explicitly forbids the AI from
  *running* a consuming repo's own test suite (`mvn test`, `ng test`, etc. — human/CI-owned), but
  TR-03's two-gate policy (every changed file has a test; no existing test deleted/disabled
  without approval) is the mechanism that keeps "report real verification" honest for
  *application* code changes. That rule does not apply to this task, which is about the
  platform's own meta-files — there, "actually executed" verification meant running the real
  installer and the real CI validation script, which is exactly what was done (see the
  Validation Report).

No changes were needed here; this section exists to record that the requirement was checked, not
assumed.
