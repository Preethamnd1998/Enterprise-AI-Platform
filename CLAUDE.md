# Enterprise AI Platform v3

You operate under Enterprise AI Platform v3. This file is the single entrypoint.

> Design goals: 70–90% fewer tokens, planning < 5s, no repository-wide scanning,
> high migration accuracy — maintained by a 2–3 engineer team. Simplicity wins.

---

## 1. The one rule that matters

**Load nothing until you know the task.** Do NOT bulk-load `00-Enterprise-Knowledge`
or `01-Agent-OS`. Read only the slices the task needs, when it needs them. Eager
loading was the platform's single biggest token sink — it is now forbidden.

---

## 2. Always-loaded core (small, stable, cache it)

Only these are read at the start of every task:

1. `01-Agent-OS/agent-os.md` — the single, consolidated operating policy.
2. `04-MCP/tool-allowlists.md` — which MCP tools are visible per agent.

Everything else is lazy.

---

## 3. Classify the task → pick ONE agent

Determine the task type, then run the matching profile in `02-Main-Agents/agents.md`.
There is **one main agent per task**. No agent chains.

| Input signal | Agent profile |
|---|---|
| Bug, error log, stack trace, prod issue, Redmine defect | **Bug Fix** |
| Feature request, story, epic, business requirement | **Planning / Feature** |
| Screenshot, HTML, Angular component to modernize | **UI Redesign** |
| Redmine→MR, MR `!id`, commit SHA(s), branch, release range | **Migration / Cherry-Pick** |

---

## 4. Lazy standards loading (by language + task)

Load standards ON DEMAND, scoped to the languages actually in the change set:

| You are touching… | Load only |
|---|---|
| Java / Spring | `00-Enterprise-Knowledge/Backend/*` (controller, service, repository, entity, dto-mapper-enum) |
| Angular / UI | `00-Enterprise-Knowledge/Frontend/*` |
| SQL / Flyway | `00-Enterprise-Knowledge/Backend/spring BE.md` (DB sections) |
| Git / migration | `00-Enterprise-Knowledge/Migration/*` |
| Any code | `00-Enterprise-Knowledge/coding-standards/CODING STANDARDS.md` |

A Java-only bug fix must NOT load Angular standards, and vice versa.

---

## 5. Context discipline (all agents)

- **Discovery is deterministic, not exploratory.** Resolve the exact change set from
  Redmine/MR/commit/branch/release via MCP — never scan the repo to "find" it.
- **Send hunks, not files. Send signatures, not bodies** for unchanged neighbors.
- **Depth-1 dependency expansion by default.** Deeper expansion is an explicit,
  budgeted, logged decision — never automatic.
- **Never re-read** a file already summarized this session.
- The stack trace, the diff, and the screenshot ARE the context — start there.

---

## 6. Output

Provide: findings → plan → changes → validation. No essays, no re-analysis,
no full-file dumps. Stop when the objective is met and validation passes.

---

## 7. Audit

Every task appends a trace to `11-Audit/` (inputs, agent, tokens, files touched,
decisions). Traceability is mandatory; verbosity is not.
