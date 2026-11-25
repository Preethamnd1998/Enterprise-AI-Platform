# Branch Matrix: review across all branches

Canonical environment → branch mapping and promotion rules:
`shared/knowledge/architecture/environments.md` (read it; do not restate it here).
Chain: `development` (Canary) → `V2-QA` → `Medvista-QA` → `Medvista-UAT` → `Medvista-PROD`;
`V2-QA` → `Aster-UAT` → `Aster-PROD`. `development → V2-QA` and `V2-QA → Medvista-QA` are
controlled cherry-picks; later hops are full releases.

## Rules

- Read code with `git show <ref>:<path>` (or `git cat-file -p`). **Never** treat a worktree as
  a branch: it may sit on a feature branch with uncommitted edits. Print `git rev-parse
  --abbrev-ref HEAD` if you do read a working tree.
- Do **not** run `git fetch`/`pull` unless the user agrees. Use local refs, record each ref's
  tip date (`git log -1 --format='%h %cd' <ref>`), and state that remote refs may be stale.
- Repos differ: a repo may have no `Medvista-*` branch (e.g. an app repo) while its submodule
  does. Discover with `git branch -a | grep -iE 'vista|v2-?qa|development|aster'`; report
  "branch absent" rather than assuming.
- Dated/copy branches (`merge/v2qa-*`, `COPY_*`, `DDMMYYYY_v2qa`) are snapshots, not
  environments. Check them only to trace where a commit travelled.
- Submodules: record the **pointer** each branch holds (`git ls-tree <ref> <submodule-path>`)
  as well as the submodule's own branches.

## Procedure per repo touched by the plan

1. List relevant refs: `development`, `V2-QA`, `Medvista-QA/UAT/PROD`, `Aster-UAT`, plus any
   `merge/*` or feature branch named in the ticket/MRs.
2. For each: does the **bug** exist? (grep the specific line/symbol via `git show`.)
3. For each: does the **fix or plan code** already exist? Search by symbol **and** by content,
   not by ticket id: a fix can ship under another ticket (e.g. a one-line import fix labelled
   with a different issue number).
4. Ancestry misses cherry-picks. Use both:
   `git merge-base --is-ancestor <commit> <ref>` and a content check
   (`git log <ref> -S'<symbol>' --oneline`, `git cherry -v <upstream> <head>`).
5. Check commit/MR references in ticket journals; confirm each MR's target branch and merge
   state when the GitLab MCP is available.
6. Note drift: lines/paths in the plan that match no branch (plan written against another
   checkout) → D3 deduction.

## Output (table in the report)

| Repo | Ref (tip date) | Bug present? | Fix/plan code present? | Evidence | Gap |
|---|---|---|---|---|---|

Then answer, in one line each: *Where is the bug live? Where is the fix already? What must
be backported, and by which path (cherry-pick onto a merge branch cut from the target vs full
release)? Which build does each environment actually run?* (Ask DevOps if unknown; do not
guess.)

## Data and logs per environment

Match the environment to its read-only MCP (`environments.md` ticket-status → DB table):
Mongo/Postgres counts for "has this ever worked in env X", Grafana/SigNoz for errors. Use
**counts and shapes only**. If no log source exists for the environment, list that as a
not-checked gap with the exact search a human should run.
