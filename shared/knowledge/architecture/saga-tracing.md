# Saga tracing — one action, end to end

<!-- CLASSIFICATION NOTE (2026-10-13 reorg audit, see shared/reports/):
     This file is procedural ("how to use the saga MCP tool"), i.e. SKILL-shaped,
     not descriptive architecture fact. It is intentionally NOT moved to
     shared/skills/: its exact path (shared/knowledge/architecture/saga-tracing.md)
     is referenced inside shared/contract.md's KERNEL section (between the
     enterprise-ai-platform:kernel:start/end markers), which is hash-pinned
     (shared/contract.md.sha256) and verified by adapters/claude/hooks/hash-check.js
     on every tool call in every installed repo. Moving this file would require
     editing the kernel text, recomputing the hash, and triggering a fleet-wide
     reinstall before hash-check.js would stop failing everywhere it's installed.
     Left in place as a documented, deliberate exception — see the audit report's
     "Hash-pinned exceptions" section before ever moving this file. -->


A **saga** is the complete path of one action: the UI trigger (route → component →
button/event), the backend endpoint, every service method it calls, every hop into
another service (Feign / WebClient / RestTemplate / Kafka publish → consumer), and
the DB reads/writes where it ends. Give the tool any one entry point and it returns
the whole chain — plus an explicit list of every link it could **not** follow.

Use it whenever the question is "what happens when…", "who calls this API", "where
does this Kafka topic end up", or "what does this button save". Do **not** rebuild a
saga by hand with grep/`get_business_flow` — that is what produced wrong sagas before
(see *Why not the old tools*).

## How to ask

Tool: `saga` on the `unified-trace` MCP (check it first — see the F-KG rule in the
contract). Any **one** of these as `target`:

| Entry | Example `target` |
|---|---|
| Gateway URL (id segments are fine) | `https://canary-dev.lifetrenz.com/api-gateway/ipd-clinical/settings/6a4baa3aef71725715121e7c` |
| Endpoint | `PUT /settings/{id}` (add `service: "BE/ipd-clinical-service"` if the path exists in several services) |
| UI API constant | `MastersApiConstant.ADD_ORGANIZATION_ITEM_EXCLUSION` |
| Kafka topic | `LT_CORE_CONFIG_EVENTS` (walks every consumer, in every service) |
| Backend method | `PatientEncounterChecklistServiceImpl.getAdmissionChecklist` |

Optional: `method` (GET/POST/PUT/DELETE/PATCH), `service`, `depth` (default 6 calls
deep), `max_service_hops` (default 3), `max_methods` (default 150 per service),
`include_ui` (default true; turn off for a faster backend-only saga).

No repo or project names are ever needed — indexed projects are auto-discovered.

**Same path, different HTTP method** (e.g. `PUT` vs `DELETE /settings/{id}`) returns
*every* handler as its own saga rather than silently picking one.

## Reading the output

A real, source-verified saga (`POST` and `GET https://…/api-gateway/core/auto-follow-up-rules`,
abridged; every hop below was checked against the Java):

```text
■ GET /auto-follow-up-rules  →  SystemSettingsController.getReceiverPayer  [SystemSettingsController.java:145]  (BE/core-service)
  SystemSettingsController.getReceiverPayer  [SystemSettingsController.java:145]
    └ SystemSettingsServiceImpl.getAutoFollowUpRule  [SystemSettingsServiceImpl.java:234]  (interface→impl)
      └ AutoFollowUpRuleRepository.getAutoFollowUpRule  [AutoFollowUpRuleRepository.java:36]  (DI-typed call, KG)
          DB read auto_follow_up_rule (jpa) select via SQL [inferred]
■ POST /auto-follow-up-rules  →  SystemSettingsController.saveAutoFollowUpRule  [SystemSettingsController.java:129]  (BE/core-service)
  UI  <constant>  (used in N files; handlers narrowed by call-site match, inferred)   ← when a UI project calls it
      • <Component> [<ui project>] via <UiService>  route: /a/b
          (click) → <handler>  [template.html:418]
  SystemSettingsController.saveAutoFollowUpRule  [file:line]
    └ SystemSettingsServiceImpl.saveAutoFollowUpRule  [file:line]  (interface→impl)
      └ AutoFollowUpRuleDaoService.saveData  [file:line]
          DB write auto_follow_up_rule (jpa) save via IAutoFollowUpRuleRepository.save [inferred]
      └ SystemSettingsServiceImpl.publishFollowUpRuleEvent  [file:line]
          ⇒ KAFKA topic LT_IPD_EVENTS → BE/clinical-common-service  [inferred]  (5 consumers on this topic; each may branch on …)
            — BE/clinical-common-service —
            IpdConsumerService.updateServiceOrderStatus  [file:line]
              …
SUMMARY  db_writes / db_reads / kafka_topics_published / services_touched
GAPS     every link that could not be followed, with the reason
```

- `└` = a call (Code Cortex AST). Only branches that reach a DB/Kafka/service effect
  are shown, so the tree stays readable; everything else is pruned.
- `(interface→impl)` / `(stub→interface→impl)` = the call went to an interface and was
  resolved to the implementing class through the `OVERRIDE` edge. Several impls are
  all shown.
- `⇒ FEIGN|WEBCLIENT|KAFKA … → <service>` = a cross-service hop; the walk continues
  inside that service.
- `file:line` on every node — use it to verify (below).
- **`GAPS` is part of the answer.** A saga with a named gap is correct; a saga that
  filled the gap with a guess would not be.

## Worked example — UI side of "Auto Follow-Up Rules" (current workflow)

Rule *creation* and rule *assignment* are different operations on different endpoints and services; saga keeps them apart:

```text
POST /auto-follow-up-rules  (BE/core-service)
  UI SystemSettingsConstant.AUTO_FOLLOW_UP_RULES_POST_GET
    • AutoFollowUpRulesComponent  route: /front-desk-management-settings/auto-follow-up-rules
        (buttonClickEvent) → save  [auto-follow-up-rules.component.html:900]   ← create dialog (opened by openAddRuleCard(), html:32)
        (buttonClickEvent) → save  [auto-follow-up-rules.component.html:519]   ← edit dialog
POST /followup-rule/assignment  (BE/ipd-service)
  UI SystemSettingsConstant.IPD_FOLLOW_UP_RULE_ASSIGNMENT
    • ApplyFollowupRulesComponent  route: /front-desk-management-settings/apply-follow-up-rules
        (click) → onAssignmentSaved  [apply-followup-rules.component.html:468]  ← "Save Assignment" (view opened by showAssignmentView())
```
`openAddRuleCard()` / `showAssignmentView()` only toggle a dialog/view, so they are not API-calling handlers; they are visible as KG template events (`find_template_events`). `AutoFollowUpRulesAddComponent` and `/auto-follow-up-rules/add` are legacy (route removed 2026-01-19) — do not use them as the creation path.

Known limits: narrowing is by *constant*, so every handler that reaches the constant is listed (list/paging handlers appear beside the save handler — the HTTP method is not distinguished); at most `UT_SAGA_UI_EVENTS_SHOWN` (default 12) handlers per component are printed, with an explicit `… +N more` line. The UI-narrowing wall-clock budget is `UT_SAGA_UI_NARROW_BUDGET_MS` (default 60000); reaching it is reported as a gap and in `metadata.ui_narrowing.timed_out`, never as a silent partial result.

## Where each stage's facts come from

| Stage | Source | Confidence |
|---|---|---|
| URL/endpoint → handler | Knowledge Graph `ENDPOINT` + `EXPOSES` | verified (annotation) |
| Method → method calls, on injected dependencies | Knowledge Generator `CALLS_DEP` — `field.method()` typed by the field's declared type (`@Autowired`, `@Inject`, and constructor-injected `private final`) | verified (exact for Spring wiring) |
| Method → method calls, everything else | Code Cortex AST `CALLS`, **cross-checked** against the KG (below) | verified only if it passes the check |
| Interface → implementation | Code Cortex `OVERRIDE` | verified; several implementations → not followed (named gap) unless the caller is one of them |
| DB — Mongo | `@Document` entity + `MongoRepository` / `MongoTemplate` call sites | inferred |
| DB — JPA | `@Entity`/`@Table` (default snake_case when absent) + repository call sites | inferred |
| DB — SQL strings | `INSERT INTO / UPDATE / DELETE FROM` and every `FROM`/`JOIN` table in a `SELECT`, in method bodies; `StringBuilder.append("…")` chains and `"a" + "b"` concatenations are stitched first; schema prefix ignored | inferred |
| Feign / WebClient / RestTemplate | declarative/builder-resolved target → endpoint in the target service | resolved, or a gap with the reason |
| Kafka publish | `publishToKafka(...)` / `send("literal")` | inferred (literal `send` = verified) |
| Kafka consume | `@KafkaListener` | verified |
| UI constant → endpoint | Knowledge Graph `CALLS_API`. Any `*Constant(s)` class counts, but only fields whose value is a gateway path (`core/auto-follow-up-rules`); the gateway prefix map is seeded from services already in the graph, so UI-only re-index runs still resolve | resolved |
| UI constant **+ suffix** → endpoint | `` `${Base.FIELD}/unread-count` `` and `Base.FIELD + '/x'` become a derived constant `Base.FIELD + /unread-count` (`${var}` segments = path variables) resolved as base value + suffix; the literal mapping wins over a `{var}` one, as in Spring. Narrowed by the literal suffix text | resolved (trigger narrowing inferred) |
| UI component/route/event | Knowledge Graph `NG_ROUTE`, `TEMPLATE_EVENT` | verified (template) |
| UI event → *this* call | text call sites via Code Cortex `search_code` | **inferred** (name-matched) |

"Inferred" means a naming/framework convention, not a compiler proof. Table names are
the ones the convention yields — confirm against the entity when a hop matters.

## Why two indexes, and how they check each other

Code Cortex has the method-level call graph but resolves many calls **by name**
(strategy `suffix_match`, confidence 0.01–0.55): `repo.findById(..)` gets bound to any
project method called `findById`, and `dto.getX()` to a same-named method on the
service. Left alone this produces confident-looking branches that don't exist (a service
"calling" a controller; writes to tables the method never touches). The Knowledge
Generator has no method-to-method calls, but it knows the **wiring**. So:

1. **KG supplies exact calls** where it can: a call on an injected field is typed by the
   field's declared type (`(DI-typed call, KG)` in the output) — this also fills calls
   Code Cortex misses entirely.
2. **KG vetoes Code Cortex's guesses:** a call into a Spring bean is kept only if the
   caller actually depends on it (directly, or via a supertype). Calls to non-beans
   (utilities, SQL holders) need Code Cortex confidence ≥ 0.5; unknown classes ≥ 0.75; a
   call to the class's own methods or its own interface needs ≥ 0.9. Rejections are
   counted in `metadata.call_edges_rejected_by_kg`.

Lesson from the field: the first version of this tool trusted Code Cortex alone and
reported a plausible `api_audit_log` write for `PUT /settings/{id}` that the Java never
performs. **A plausible-looking hop is not evidence** — that is why every claim you rely
on still gets a `file:line` read.

## Known limits (each shows up as a gap or is listed here)

- **DI-typed calls cover injected fields only** — not static calls, calls on local
  variables, or lambdas; those rely on Code Cortex (validated as above).
- **Shared / multiplexed Kafka topics** (e.g. `LT_IPD_EVENTS`: 22 publishers, 5 consumers
  branching on `requestType`): every consumer is walked, but only one branch applies to
  your event and the graph can't say which. The hop line says so; read the consumer.
  Output is capped by `max_lines` (default 250) and cross-service walks use a 60-method
  budget.

- **Service not checked out/indexed** (today: appointment, auth, gateway, file-store,
  rcm, notification, …) → `Feign … not followed — unknown_target_prefix`. Clone it and
  run `sync-projects.sh`.
- **Kafka topic built at runtime** (`getTopic()`, `toString()`) → reported as "runtime
  expression"; consumers can't be linked. A topic with a publisher but no indexed
  consumer is reported the same way.
- **Entry endpoints:** when a literal mapping and a `{var}` mapping both match the URL in the same service and verb (`/chat/message/unread-count` vs `/chat/message/{messageId}`), only the literal one is an entry, as Spring routes it.
- **UI:** the graph links a *file* to the constant it uses, not the exact method, and
  Code Cortex returned no inbound CALLS for Angular dependency-injected calls or
  callbacks in the cases checked. So the trigger is narrowed by text call sites (generic names like `save`/`onSave` are
  deliberately not chased). Empty-stub UI libraries (e.g. `settings` — see
  [projects.md](./projects.md)) and URLs built dynamically give
  `no indexed UI project calls this endpoint`.
- **Invisible to any static graph:** reflection, lambdas passed as callbacks, Spring
  `ApplicationEvent`s, AOP (`AuditAspect`), interceptors, scheduled jobs, DB triggers.
  If a saga "stops early", suspect one of these and read the source.
- **JPA:** custom naming strategies, `EntityManager.persist/merge`, `Specification`
  and QueryDSL reads aren't modelled. **Mongo:** `MongoTemplate.save(obj)` with no
  collection stays "unresolved".
- **Budgets:** depth 6, 150 methods per service, 3 service hops — `walk truncated`
  appears in the output when hit; raise the parameters or narrow the entry.
- **Snapshot:** both indexes are as of the last index run. `index_status` reports
  `STALE` per project.

## Verifying (the graph is a map, not the territory)

Per the F-KG rule: treat the saga as navigation. For any hop the conclusion depends on,
read the cited `file:line` (smallest region). Never present an `inferred` DB table or a
name-matched UI handler as certain, and never report a hop that isn't in the output.

## Keeping the indexes current

```bash
bash local-ai-environment/knowledge-graph-generator/sync-projects.sh            # everything
bash …/sync-projects.sh --dry-run                                               # what it would index
bash …/sync-projects.sh --skip-cortex | --skip-kg
```

It discovers every `Projects/BE/*/pom.xml` and `Projects/UI/*/angular.json`, indexes each
into both the Knowledge Graph and Code Cortex, and is safe to re-run (unchanged files are
skipped; duplicate edges are removed). Run it after cloning a repo, after a UI split
lands, after a big pull. It never edits `kg-config.env`.

Two rules that keep multi-repo data correct:
- Each UI repo runs from its own throwaway config (`KG_CONFIG_PATH`), and non-monolith
  UI libraries are stored under `<repo>/<library>` service names. Without this, the
  embedded copies of shared libraries (`clinical-casesheet`, …) overwrite each other.
- Never run the indexer with `INCREMENTAL=false` unless you mean to rebuild the whole
  combined DB — it deletes the file.

## Testing

```bash
cd knowledge-graph-generator && python -m pytest tests            # parsers + saga queries (116)
cd enterprise-ai-platform/shared/mcp-tools/unified-trace-mcp
node --test test/saga.test.mjs                                    # 10 real-workspace sagas, ~3 min
node test/run-tool.mjs saga '{"target":"PUT /settings/{id}","service":"BE/ipd-clinical-service"}'
```

The saga tests are integration tests over the real indexes (URL → Mongo, Kafka → four
consuming services, API → Kafka → DB with an exact UI click, Feign hop, UI constant,
unknown target, unindexed service). A failure means the tool regressed **or** the
workspace changed — read the failing render first. A newly added tool only appears in a
running Claude Code session after it is restarted; the runner above works immediately.

## Why not the old tools

`get_business_flow` pads chains with unrelated events and `get_api_context.
downstream_services` can be wrong; `trace_business_flow` only walks class→method
structure. `saga` uses only mechanism-level evidence (annotations, AST calls, resolved
Feign/Kafka edges) and reports the rest as gaps.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Entry: … no endpoint matched` | service not indexed, or path typo — try `PUT /path` with `service` |
| Chain stops right after the controller | interface without an indexed implementation, or the project is `STALE` — run `sync-projects.sh` |
| No DB line at the end | reflection/AOP/`EntityManager`, or a custom naming strategy — read the service method |
| `UI trigger: no indexed UI project calls this endpoint` | UI library is an empty stub, URL built dynamically, or UI repo not indexed |
| `saga` tool missing in Claude | restart Claude Code (tools load at session start) |
