# `shared/skills/` — Shared Skills Layer

The single canonical location for every platform **skill**. Like `shared/commands/` and
`shared/standards/`, nothing in this directory is platform-specific — it is copied/installed
into each supported tool by the existing adapters, never duplicated by hand.

A "skill" here is the standard `SKILL.md` package format (YAML frontmatter `name` +
`description`, followed by Markdown instructions, optionally with supporting files such as a
`guides/` or `scripts/` subdirectory next to it) used by the open agent-skills ecosystem.
This is the same format Claude Code and OpenCode already discover natively — this directory
adds **no new file format and no new discovery mechanism**.

## Why lazy loading needs nothing new here

Both Claude Code and OpenCode already implement the lazy-loading contract this platform
requires (§ kernel: "never bulk-load"):

- At session start, each tool scans its known skill directories and reads only the YAML
  **frontmatter** (`name` + `description`) of every `SKILL.md` it finds — a few lines each.
- The full body of a skill (its instructions, and anything under its own subfolders) is only
  read when the tool actually decides the skill is relevant to the current task.
- Nothing in `shared/skills/` is ever embedded into a command, the contract, or any other
  always-loaded file. It is discovered, not preloaded.

So "integrating lazy loading" for this platform means exactly one thing: **put skills where
the tools already look**, and let their built-in discovery do the rest.

## Where this gets installed

| Tool | Discovery path used | How it gets there |
|---|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` (global) | `adapters/claude/install.sh` / `install.ps1` — global install section, same idempotent copy helper already used for `shared/commands/` and `shared/standards/` |
| Claude CLI | same as Claude Code | same binary/config — no separate step |
| OpenCode | `~/.claude/skills/<name>/SKILL.md` (OpenCode's v2 skill scanner already reads this path by default, verified via `opencode debug skill`), in addition to its own `~/.agents/skills/` and any `skills.paths` in `opencode.jsonc` | no adapter change needed — covered by the Claude install target above |

No `shared/skills/` entry is copied into `adapters/`. Per `PROJECT-STRUCTURE.md`'s
`no-dup-shared` rule, adapters stay thin glue — the skill content itself lives only here.

## How to manually add a new skill

1. Create `shared/skills/<your-skill-name>/SKILL.md` with frontmatter:
   ```markdown
   ---
   name: your-skill-name
   description: One or two sentences a tool can use to decide when this skill is relevant.
   ---

   # Your Skill Name

   Instructions the agent should follow once it has decided to use this skill.
   ```
2. `name` must exactly match the directory name — this is checked by `ci/validate.sh`.
3. Add any supporting files (guides, scripts, templates) as subfiles/subdirectories next to
   `SKILL.md` — reference them by relative path from the skill's own instructions.
4. Run the installer to make it live locally: `adapters/claude/install.sh` (no `--repo`
   needed — skills install globally, same as commands/standards). Claude Code and OpenCode
   will pick it up on their next session start (config/skills are read at startup, not
   hot-reloaded).
5. Nothing else to register — there is no registry.yml for skills (unlike `shared/commands/`).
   Dropping the folder in is the whole contract, by design: discovery is directory-based.

## Currently installed skills

Vendored from an external/upstream source (update by re-copying if the upstream skill changes):

- `find-skills/` — helps discover and install skills from the open agent-skills ecosystem
  (`npx skills` / skills.sh). Source: `~/.agents/skills/find-skills/SKILL.md`.
- `modern-web-guidance/` — Google Chrome's web-platform best-practices lookup skill (search +
  retrieve guides via `npx modern-web-guidance`). Source:
  `~/.agents/skills/modern-web-guidance/` (vendored verbatim, including its `guides/`
  subdirectory — that subdirectory is a local cache the skill's own `SKILL.md` does not read
  from; it fetches guides over the network by id, so the vendored copy here is only
  for provenance/offline reference, not something the skill's instructions use directly).

Custom, user-authored (institutional knowledge captured from real debugging/build sessions on
this codebase — maintain these directly in `shared/skills/`, there is no external upstream):

- `settings-redic-index-db-cache-skill/` — the two-tier Redis (dirty-check accelerator) +
  IndexedDB (client cache) architecture for settings-driven data (mandatory fields,
  component/speciality/role/user access). Load when onboarding a new settings domain onto the
  cache, migrating a screen onto it, or debugging a stale/wrong cached settings value.
- `print-header-footer-browserprint-skill/` — root-cause-and-fix pattern for the shared
  browser-print technique (iframe + `<table>`) used across multiple Angular casesheet/report
  print flows for a repeating header + pinned footer (blank/unstyled iframe output, clipped
  content, page-break box fragmentation, PrimeFlex specificity losses, flex blocks split across
  pages, one-page-fit sizing). Converted from a detailed RCA doc (Redmine #49419) and updated
  with fixes found in a third, independent implementation (`PrintOrderComponent`). Load when
  fixing a print-layout bug or porting this browser-print technique to a new component — treat
  it as shared functionality to reuse, not a fresh design problem.
- `abdm-integration-backend/`, `abdm-integration-frontend/` — ABDM (Ayushman Bharat Digital
  Mission) backend and Angular frontend integration skills, covering M1-M4 milestones. Moved
  here 2026-10-13 from `shared/knowledge/custom-flows/abdm/` during the skills/knowledge/
  standards reorg — they already had skill-shaped frontmatter but weren't named `SKILL.md` or
  under `shared/skills/`, so neither Claude Code nor OpenCode could ever discover them. Load
  before touching anything under `abdm-integration-service/` or any ABDM-emitting component.
- `running-locally-skill/` — how to run `lifetrenz-core` and its backend services locally
  (fully local, hybrid, or canary-dev), including the dev-proxy port table and Feign's
  explicit-URL requirement with Consul discovery disabled. Moved here 2026-10-13 from
  `shared/knowledge/architecture/running-locally.md` (procedural content, not architecture
  fact). Load when starting/debugging a local dev environment.
- `contextual-help-skill/` — the "?" Contextual Help button + dialog (About / How to use / Field
  descriptions / Business rules / Examples / Important notes / FAQs) cloned from
  `lib-ccc-help` in Clinical Component Configuration (settings UI library): exact icons,
  colours, gradient header, header-strip placement, typed content model, copy-writing guide,
  templates and QA checklist. Load when adding or porting contextual help to any Angular screen.
- `global-filter-pagination-skill/` (master) with sub-skills `global-filter-skill/` and
  `pagination-skill/` — the filterable, paginated list screen: top-bar global filter (time chips,
  custom dates, saved/default filters, Today default), `<lifetrenz-lt-pagination>` footer,
  independent paginators for multi-list pages, and the backend (Postgres string-built `SQL`
  CTE pagination per `sql-query.md`, Mongo equivalent, `{data, page: PageDTO}` contract). Built
  from the All Appointments reference screen; records where standards/knowledge docs disagree
  with source. Load for any searchable/filterable/paginated list, saved filter or paged API.
- `audit-skill/` — auditing across Lifetrenz: Postgres `@Audited` (core-service, ipd-service),
  Mongo `@Auditable` (ipd-clinical-service), Kafka event audit trail, old/new data capture and
  parsing (`previousValue` pattern, per-event history), UTC storage and India/Dubai time-zone
  display, UI timeline/history patterns, templates and review checklist. Load when adding,
  reviewing or debugging audit / history / activity logs.
- `notification-link-skill/` — how to add a new notification end to end: trigger on Kafka
  `lt.notification.events` -> notification-service (request type, consumer case, EMAIL / SMS /
  WHATSAPP / INBOX templates, default channels, Settings seed) -> tiny-URL generation (10-char
  code, `url_mapping`, `lt.mobility.notification-url`) -> Mobility link state (expiry, login type,
  one decision per link, `/complete`) -> public-gateway allowlist (`user-token-required`,
  `required-params`) -> NotiShell screen. Rules (no data in URL, expiry, PHI in SMS), a worked
  discount/refund example and a verification matrix. Load for any new notification, approval-by-link
  or view-by-link flow, or "link not valid" debugging.
