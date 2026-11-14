# MASTER PROMPT — LOCAL AI DEVELOPMENT ENVIRONMENT SETUP (plugins only, v4.15)

Paste this whole file into Claude Code on the machine to set up. It works for **new users** (nothing
installed) and **existing users** (older install with copies under `~/.claude`): every step is
idempotent, detects the current state first, and only changes what is out of date. Run it again any
time to repair or update.

> Replaces the earlier Windows-only, GraphRAG-based prompt (kept in git history). GraphRAG is **not**
> part of the platform. Code intelligence = Knowledge Graph + Code Cortex, merged by `unified-trace`.

---

## 0. Role and rules

You are the **Environment Setup Agent**. Inspect, install, configure, test, fix and verify — do not
just print instructions, and do not claim anything works until you have run the check that proves it.

Hard rules:

1. **Plugins only.** Commands, skills, standards, rules, knowledge and MCP servers come from two
   Claude Code plugins in the local marketplace `eap-local`: `enterprise-ai-platform` and
   `knowledge-graph`. Never copy those things into `~/.claude/skills`, `commands`, `standards`,
   `rules` or `knowledge`. The only thing written to `~/.claude/CLAUDE.md` is the contract **kernel**
   (done by the CLI below, never by hand).
2. **Use the platform CLI, not ad-hoc edits.** `node shared/core/cli.js <command>` (npm scripts are
   aliases). Never edit `~/.claude.json` directly; MCP changes go through `claude mcp …`.
3. **Back up before removing.** Removal of old copies happens only through `platform:migrate`, which
   backs up everything it touches and writes a manifest. Dry-run first, show the result, then `--apply`.
4. **Never remove or disable what is not ours:** Trail/graft/code-cortex skills and hooks, other
   plugins, user-authored skills or commands, monitoring MCP servers (Grafana, SigNoz, lths, Kafka),
   DB MCP servers, templates, `paths.env` / `paths.local.env` values the user set.
5. **Git safety:** no force-push, no `reset --hard`, no overwriting a dirty working tree. If a repo has
   local changes, skip its update and report it.
6. **Secrets:** never print or log credentials. Connection strings stay in MCP config / env vars.
7. **Ask the user only** for a credential, a permission prompt, a destructive choice, or a path you
   cannot discover (for example where the project repos live). Otherwise decide and continue.
8. Keep tool output small: run builds/tests through `bin/eap-run` once the plugin is installed, or
   `| tail -n 60`. Report failures with the root-cause lines, not whole logs.

---

## 1. Discover the machine and the current state (read-only)

Run and record the results:

| Check | Command | Needed |
|---|---|---|
| OS / shell | `uname -a` (macOS/Linux) or `$PSVersionTable` (Windows) | any |
| Git | `git --version` | yes |
| Node | `node --version` | **20+** |
| Python | `python3 --version` (Windows: `python --version`) | **3.10+** (Knowledge Graph venv) |
| Claude Code CLI | `claude --version` | yes |
| Platform repo | folder containing `shared/core/cli.js` | clone if missing |
| Knowledge Graph repo | sibling `knowledge-graph-generator/` containing `mcp_server_main.py` | clone if missing |
| Plugins installed | `claude plugin list` | see §5 |
| Old copies present | `ls ~/.claude/skills ~/.claude/commands ~/.claude/standards ~/.claude/knowledge` | see §6 |
| Project repos | folder that holds `BE/` and `UI/` checkouts | ask if not found |

Classify the machine: **NEW** (no platform repo, no plugins), **EXISTING-OLD** (plugins missing or
`~/.claude` contains copies of platform content), or **EXISTING-CURRENT** (plugins at the repo
version, nothing to migrate). Say which one in one line, then continue — the steps below apply to
all three and skip what is already satisfied.

Install missing prerequisites with the OS package manager only if the user's tools allow it;
otherwise stop and list exactly what is missing.

---

## 2. Repositories

Layout (paths are examples; keep the user's existing locations if the repos already exist):

```text
<ROOT>/enterprise-ai-platform          https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform.git
<ROOT>/knowledge-graph-generator       https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator.git   (sibling)
```

- Missing → `git clone`. Present and clean → `git fetch` then `git pull --ff-only` on the checked-out
  branch. Present and dirty or diverged → leave untouched and report.
- Verify each remote URL; if a repo points elsewhere, report it, do not rewrite it.
- If the Knowledge Graph repo lives somewhere else, set `KNOWLEDGE_GRAPH_PATH=<path>` in
  `enterprise-ai-platform/paths.local.env` (never in the tracked `paths.env`).
- Set `PROJECTS_DIR=<folder holding BE/ and UI/>` in `paths.local.env` (create the file if missing).
  If an existing value is there and valid, keep it.

---

## 3. Runtime (Node tools, Knowledge Graph venv, Code Cortex)

From the platform repo:

```bash
node shared/core/cli.js platform:doctor                     # what is missing, per OS
node shared/core/cli.js platform:install                    # dry-run plan
node shared/core/cli.js platform:install --apply --with-cortex
```

This installs the MCP servers' npm dependencies, creates the Knowledge Graph virtualenv
(`.venv-mcp`) with `requirements-mcp.txt`, and downloads the prebuilt Code Cortex binary
(Windows: edits the *user* PATH — mention that to the user). Re-run `platform:doctor` until it has
no `FAIL`. A `blocked` step names the exact missing prerequisite — fix that, then re-run.

---

## 4. Build the plugins and write the kernel

```bash
node shared/core/cli.js plugin:install claude-code          # dry-run: shows files, kernel change, run-commands
node shared/core/cli.js plugin:install claude-code --apply  # builds dist/, writes the kernel into ~/.claude/CLAUDE.md (backup kept)
```

`dist/plugins/claude-code/` is a per-machine build (absolute paths) — never copy it between
machines; every user builds their own. The kernel in `~/.claude/CLAUDE.md` is about 3 KB; text the
user wrote outside the kernel markers is preserved; legacy contract blocks from older installs are
removed.

---

## 5. Install or update the two plugins (Claude's own CLI)

```bash
claude plugin marketplace add "<platform>/dist/plugins/claude-code"   # already added → run: claude plugin marketplace update eap-local
claude plugin install enterprise-ai-platform@eap-local
claude plugin install knowledge-graph@eap-local
# already installed? update instead:
claude plugin update enterprise-ai-platform@eap-local
claude plugin update knowledge-graph@eap-local
claude plugin list          # both: Version = repo VERSION, Status = enabled
```

If `eap-local` is registered with a different path (the repo moved), run
`claude plugin marketplace remove eap-local` first, then add the current path.
The plugins take effect in **new** Claude Code sessions; tell the user to restart.

---

## 6. Existing users — migrate to the plugin-only layout

Do this after §5 (the migration refuses to remove anything until the plugins are installed and enabled):

```bash
node shared/core/cli.js platform:migrate --project "<each project root that has a .mcp.json>"   # dry-run
node shared/core/cli.js platform:migrate --apply --project "<same>"
```

What it does, and nothing else:

| Old state (pre-4.14 installers) | Action |
|---|---|
| `~/.claude/skills/*`, `commands/*`, `standards/*`, `rules/*`, `knowledge/*` whose **name exists in `shared/`**, and `company-profile.md` | removed (the plugin provides them) |
| `~/.claude/CLAUDE.md` with the full contract / `contract:start…end` block / "SHARED CONTRACT v3" header | rewritten to the kernel only; user text kept |
| user-level `usage-logger` hook (the plugin registers its own) | hook entry and file removed |
| user-scope MCP `unified-trace`, `opencode-bridge`, `knowledge-graph` (plugins register them; Claude Code does not dedupe) | removed with `claude mcp remove -s user` |
| the same names inside a project `.mcp.json` | removed from that file |

Everything removed is copied to `~/.claude/backups/eap-migrate-<timestamp>/` with a `MANIFEST.json`;
copying files back undoes it. Read the dry-run output and check that every line matches the table
above. If every line matches, run `--apply`. If any line does not match, do not apply: stop and ask
the user.

Also, as advice only (do not change without asking):
- a user-scope `code-cortex-mcp` MCP server is redundant (unified-trace runs Code Cortex itself);
- plugins that duplicate each other (for example two copies of the same skill pack) and plugins that
  time out on start — name them, let the user decide;
- many always-on DB MCP servers: `bin/mcp-env` (shipped in the plugin) can split a project
  `.mcp.json` into profiles (`core`, `monitoring`, `db-<env>`); never drop monitoring servers.

---

## 7. Index the code (needed for real answers from unified-trace)

Check first, index only what is missing or stale (indexing is slow and rewrites the index):

1. Call `index_status` on the `unified-trace` MCP (or ask Claude Code to). `INDEXED` → done.
2. Knowledge Graph: from the Knowledge Graph repo run `sync-projects.sh` (Windows: `sync-projects.ps1`
   or `run-knowledge-graph.bat`). It reads `PROJECTS_DIR`. Output: `output/knowledge_graph.db`.
3. Code Cortex: `code-cortex-mcp cli index_repository --repo_path <repo root>` per repository
   (or let unified-trace's `index_status` tell you which are `NOT_INDEXED`).
4. Re-run `index_status`; it must report the project repos as indexed.

If the user's repos are not available yet, finish the rest of the setup and report indexing as
pending with the exact commands.

---

## 8. Other clients (optional — only if the user uses them)

- OpenCode: `node shared/core/cli.js plugin:install opencode --apply`
- Cursor: `node shared/core/cli.js plugin:install cursor --apply` (documented path, untested here)
- Copilot: unchanged per-repo flow (`install/install-copilot.ps1`); it vendors its own kernel copy.

---

## 9. Verify — every line must pass

```bash
claude plugin list                                        # eap-local plugins enabled at repo VERSION
claude mcp list                                           # unified-trace, opencode-bridge, knowledge-graph: Connected
node shared/core/cli.js mcp:selftest                      # every registry server starts through the launcher
node shared/core/cli.js platform:migrate                  # → "nothing to migrate — already plugin-only"
bash ci/validate.sh && npm test                           # platform checks (Windows: run from Git Bash or WSL)
claude -p "/context" --output-format json                 # in a project folder; read the result field
```

Read the `/context` output and confirm:

- no skill or command appears twice, and every platform skill's **Source is `Plugin (...)`**, none `User`;
- Memory files lists `~/.claude/CLAUDE.md` at roughly 1k tokens (kernel only);
- the platform plugins' skills add ≈ 1–2k tokens in total; slash commands are not listed (they are
  user-invoked only).

Smoke test the graph (skip with a note if no project is indexed):
`node shared/mcp-tools/unified-trace-mcp/test/run-tool.mjs trace '{"query":"<a known Class.method>","depth":2}'`
→ compact text (not a JSON blob) with VERIFIED/INFERRED edges.

Measurement baseline for later comparison (optional but recommended):
`python3 shared/core/context/ctx-report.py --days 30 --save-baseline <folder>/baseline.json --html <folder>/baseline.html`
then `/usage-report tokens days=7 baseline=<folder>/baseline.json` after a week of use.

---

## 10. Failure handling

For any failing step: read the error, find the root cause in the repo docs or source
(`docs/TROUBLESHOOTING.md`, `docs/INSTALL-CLAUDE.md`), apply the smallest safe fix, retry once, verify.
Typical causes: Node < 20, Python < 3.10 or a missing `venv` module, Code Cortex binary not on PATH,
`KNOWLEDGE_GRAPH_PATH` wrong, corporate proxy blocking `git.lifetrenz.com` or the Code Cortex download,
marketplace registered with a stale path. A plugin MCP server that shows "failed, cached" in a running
session is retried automatically after ~15 minutes or on restart — confirm with `claude mcp list`.
Stop and ask only when the fix needs a credential, VPN access or a destructive action.

OS notes: on Windows use PowerShell for the commands above; shell scripts (`*.sh`) have `.ps1`/`.bat`
twins in the repos; path separators in `paths.local.env` may be either style.

---

## 11. Final report (plain, short)

```text
Machine state     : NEW | EXISTING-OLD | EXISTING-CURRENT  (OS, node, python, claude versions)
Repos             : platform <branch@sha, clean?> · knowledge-graph <branch@sha, clean?>
Plugins           : enterprise-ai-platform <ver> enabled · knowledge-graph <ver> enabled
Migration         : <n items removed, backup path>  or  nothing to migrate
CLAUDE.md         : kernel only, <bytes>
MCP               : unified-trace / opencode-bridge / knowledge-graph connected (yes/no each)
Index             : <projects indexed / pending, with command>
Always-on context : <tokens from /context>, duplicates: none | <list>
Checks            : platform:doctor · mcp:selftest · ci/validate · npm test  → PASS/FAIL each
Needs the user    : <restart Claude Code; anything blocked, with the exact command>
```

Report only what you verified. Mark anything skipped or blocked as such, with the reason.
