# Environments & Branches

## Branch → environment mapping

| Environment | Branch |
|---|---|
| `development` | `development` — present in every service repo |
| `v2-qa` | `V2-QA` |
| `medvista-qa` | `Medvista-QA` |
| `medvista-uat` | `Medvista-UAT` |
| `medvista-production` | `Medvista-PROD` |
| `aster-uat` | `Aster-UAT` — this same branch also deploys `ajyal-uat` |
| `ajyal-uat` | No branch of its own. Deployed from the `Aster-UAT` branch (environment-level config difference, not a separate codebase branch). Live at `ajyal-uat.ltz.one` — seen in Redmine issue data, `Customer/Env` custom field value `"Ajyal (UAT)"`. |
| `aster-production` | `Aster-PROD` branch exists but is not set up/live yet |

Many dated/copy branches referencing v2qa also exist (`v2qa`, `V2QA`,
`04052026_v2qa`, `COPY_V2QA_*`, `merge/v2qa-*`, …) — these are working/snapshot
branches, not separate environments. `V2-QA` is the only one that matters for
environment mapping.

## Code promotion flow

```
development
     │  (controlled — cherry-pick)
     ▼
v2-qa
     │  (controlled — cherry-pick)
     ├──────────────────────────────┐
     ▼                              ▼
medvista-qa                    aster-uat  ──── also serves ajyal-uat (same branch)
     │  (full release)              │
     ▼                              ▼
medvista-uat                   aster-prod  (branch exists, not set up/live yet)
     │  (full release)
     ▼
medvista-prod
```

- **`development → v2-qa`** and **`v2-qa → medvista-qa`** move via *controlled*
  cherry-pick — only specific commits/fixes move forward at these two steps.
  (Redmine issue comments confirm this directly, e.g. a developer note reading
  `cherry-picked to v2qa` alongside the GitLab MR links for that fix.)
- **Every other promotion** (`medvista-qa → medvista-uat`, `medvista-uat →
  medvista-prod`, `v2-qa → aster-uat`) is a **full code release** — the entire
  branch state moves forward, not a cherry-picked subset.
- `v2-qa` is the fork point for the two customer lineages: Medvista/RMH
  (`medvista-qa → medvista-uat → medvista-prod`) and Aster/GCC/Ajyal
  (`aster-uat`, which also serves `ajyal-uat`; `aster-prod` exists but is not
  live).
- This matches the Redmine status workflow in [redmine.md](./redmine.md):
  `Moved to RC` = pushed to `v2-qa`, `Moved to QA` = pushed to `medvista-qa`,
  `Moved to UAT` = pushed to `medvista-uat` or `aster-uat`.

**Flyway / DB migrations**: because `development → v2-qa` and `v2-qa →
medvista-qa` move via cherry-pick rather than a full merge, a migration script
can land out of the order it would have in a normal linear history, or a
migration cherry-picked into `medvista-qa` may not yet exist on
`v2-qa`/`development` in the same numbered sequence. Always check the actual
Flyway migration history/version table in the target environment before adding
or reordering a migration — don't assume a migration version number free on
`development` is safe to reuse on `v2-qa`/`medvista-qa` without checking for a
collision.

## config-repo-local profile evidence

`UI-BE/config-repo-local` has partial per-environment `.properties` coverage —
only for core, inventory, ipd, and ipd-clinical services, not the full service
fleet:

| Profile suffix | Environment |
|---|---|
| `development` | development |
| `A-UAT` (core-service only) | Aster-UAT — also backs `ajyal-uat` |
| `M-UAT` (core-service only) | Medvista-UAT |
| `SIT` | SIT |
| `V2QA` | v2-qa |
| `CNRY` | Canary (`canary-dev.lifetrenz.com`, used by Consul/dev-proxy) |
| `STAGE` (ipd-service only) | Not verified which environment |
| `UAT` (ipd-service only) | Ambiguous — which UAT is not specified in the filename |

No `PROD` or `Ajyal`-suffixed profile file exists in this local config dir,
consistent with `ajyal-uat` reusing the `Aster-UAT`/`A-UAT` profile rather than
having its own.

## Other environments seen in MCP tooling config

`canary` (multiple `canary-*-db` and `canary-signoz-reader`/`canary-mongodb`
servers configured), `smiles-stage` (`smiles-stage-*-db` servers — "smiles" also
matches the Redmine "Lifetrenz" project identifier `smiles`), `sit`
(`sit-grafana-reader`, `sit-uat-prod-signoz-reader`), `v2qa` (Grafana + Mongo/
Postgres DB readers).

## Ticket status → DB MCP routing

When a Redmine ticket, MR, or user prompt names an environment (explicitly, or
via a status like `RC Failed`/`QA Failed`/`UAT Failed`), route DB verification
to the matching MCP server(s) below — never query a higher/customer-facing
environment when a lower one is sufficient to diagnose the issue.

| Environment keyword in ticket/prompt | Redmine status (see [redmine.md](./redmine.md)) | MCP servers to use |
|---|---|---|
| `local`, `dev`, `development`, `beta`, `BETA BUG` | New / Dev in Progress | `local-core-service-db`, `local-inventory-service-db`, `local-ipd-service-db`, `local-supplimentory-service-db`, `local-mongodb` |
| `V2QA`, `v2qa`, `RC`, `RC Failed` | Moved to RC / RC Testing / RC Failed | `v2qa-core-service-db`, `v2qa-inventory-service-db`, `v2qa-ipd-service-db`, `v2qa-invsupplimentory-service-db`, `v2qa-grafana-reader`, `v2qa-mongodb` |
| `SIT`, `sit`, `QA Failed` | Moved to QA / QA Testing / QA Failed | `sit-grafana-reader`, `sit-uat-prod-signoz-reader` |
| `canary`, `canary-dev` | Pre-prod / canary verification | `canary-core-service-db`, `canary-inventory-service-db`, `canary-ipd-service-db`, `canary-report-service-db`, `canary-supplimentory-service-db`, `canary-signoz-reader`, `canary-mongodb` |
| `Medvista`, `medvista-qa` | Moved to QA (Medvista lineage) | `medvista-qa-core-db`, `medvista-qa-ipd-db` |
| `Medvista UAT`, `medvista-uat`, `UAT Failed` (Medvista lineage) | Moved to UAT / UAT Testing / UAT Failed | `medvista-uat-core-db`, `medvista-uat-ip-db` |
| `Aster`, `aster-uat`, `UAT Failed` (Aster/GCC lineage) | Moved to UAT / UAT Testing / UAT Failed | `Aster-UAT-Inventory-service-db`, `Aster-UAT-core-service-db`, `Aster-UAT-IPDBilling-service-db`, `aster-uat-core-db` |
| `Ajyal` (deploys from `Aster-UAT` branch — see above) | Moved to UAT / UAT Testing / UAT Failed | `Ajyal-UAT-IPDBilling-service-db`, `Ajyal-UAT-Inventory-service-db`, `Ajyal-UAT-core-service-db` |
| `Lifetrenz` project / `smiles-stage` | Staging (Lifetrenz project lineage) | `smiles-stage-core-service-db`, `smiles-stage-inventory-service-db`, `smiles-stage-ipd-service-db`, `smiles-stage-supplimentory-service-db` |
| (no environment keyword) | New / unclear | Default to `local-*-db` unless other context (Redmine `Customer/Env` custom field, branch name) suggests a specific environment |

Server names above are this session's actual configured MCP names (`mcp__<name>__query` etc.) — verify against the live MCP list before use, since server names can be added/renamed. Never invent a server name that "sounds right."
