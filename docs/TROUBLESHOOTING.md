# Troubleshooting Guide

**Version:** v4.3.0

This guide covers the most common problems encountered when installing, configuring, and using the Enterprise AI Platform.

---

## Installation Problems

### Commands not available in Claude Code session

**Symptom:** `/bug-fix` or other platform commands are not recognised by Claude Code.

**Cause 1:** Global install was not run.
```powershell
# Re-run global install
pwsh install/install-claude.ps1

# Verify commands installed
ls "$env:USERPROFILE\.claude\commands\"
```

**Cause 2:** Claude Code is not loading the global commands directory.
Check your Claude Code version: `claude --version`. Commands require CC ≥ 1.0.0.

**Cause 3:** You are running CC from a session that started before the install.
Close and reopen your Claude Code session after install.

---

### `pwsh: command not found` or `pwsh is not recognized`

**Cause:** PowerShell 7 (`pwsh`) is not installed. The installer requires PowerShell 7 — it will NOT work with `powershell.exe` (Windows 5.1).

```powershell
# Check what's available
powershell -Command "Write-Host 'PS5.1 available'"
pwsh -Command "Write-Host 'PS7+ available'"  # Will fail if not installed
```

**Fix:** Install PowerShell 7 from [github.com/PowerShell/PowerShell/releases](https://github.com/PowerShell/PowerShell/releases).

---

### Installer fails: `Cannot find platform root`

**Symptom:**
```
Cannot find platform root (no shared/contract.md)
```

**Cause:** The installer script is not being run from within the platform repository.

**Fix:** Run the installer from the platform repo directory:
```powershell
cd D:\enterprise-ai-platform
pwsh install/install-claude.ps1
```

---

### Per-repo install leaves `.claude/CLAUDE.md` unchanged

**Symptom:** The installer warns:
```
! .claude/CLAUDE.md exists -- left unchanged (edit module boundaries manually)
```

This is expected behaviour — the installer never overwrites your module boundaries. Edit `.claude/CLAUDE.md` manually to update the boundaries if needed.

---

### `~/.claude/settings.json` already exists warning

**Symptom:**
```
! ~/.claude/settings.json already exists -- merge allowlist manually if needed
```

**Cause:** You already have a global `settings.json` from a previous install or manual configuration.

**Fix:** Open both files and merge the `allow[]` and `deny[]` arrays manually. The platform's allowlist reference is at `adapters/claude/config/settings.json`.

---

## Hook Problems

### `hash-check.js` fails on every session start

**Symptom:** Every session starts with a contract hash mismatch warning.

**Cause 1:** The contract kernel was manually edited without updating the hash file.
```powershell
# Recompute the hash (from platform repo)
$kernelContent = (Get-Content shared/contract.md -Raw) -replace '(?s).*enterprise-ai-platform:kernel:start -->\r?\n',''-replace '\r?\n<!-- enterprise-ai-platform:kernel:end.*',''
$hash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($kernelContent))).Replace('-','').ToLower()
Write-Host $hash
```
Compare with `shared/contract.md.sha256`. If different, re-run the global install.

**Cause 2:** The per-repo install was run but the global install (which writes the contract) was not run first, or ran an older version.
```powershell
# Re-run global install to refresh contract
pwsh install/install-claude.ps1
```

**Cause 3:** `.ai/.contract-hash` in the repo is stale.
```powershell
# Force re-install to update the hash file
pwsh install/install-claude.ps1 -RepoPath .
```

---

### `audit.js` not writing to log

**Symptom:** No log entries appear in `.claude/audit/log.jsonl`.

**Check 1:** Node.js is available:
```powershell
node --version  # Must be v18+
```

**Check 2:** The hook is configured in `.claude/settings.json`:
```powershell
Get-Content .claude\settings.json | ConvertFrom-Json | Select-Object -ExpandProperty hooks
```
You should see `PostToolUse` and `Stop` entries.

**Check 3:** The audit directory exists:
```powershell
Test-Path .claude\audit\  # Must be True
```

**Fix:** Re-run the per-repo install:
```powershell
pwsh install/install-claude.ps1 -RepoPath .
```

---

### `Cannot find module '.claude/hooks/audit.js'`

**Cause:** The per-repo install was not run. The hooks directory does not exist.

**Fix:**
```powershell
pwsh install/install-claude.ps1 -RepoPath C:\src\your-service
```

---

## MCP Problems

### MCP tools not available (`mcp__gitlab-reader__get_file` not found)

**Cause 1:** `.mcp.json` does not exist in the repo.
```powershell
Test-Path .mcp.json  # Must be True
```
If missing: `Copy-Item shared/mcp/.mcp.json.template .mcp.json`

**Cause 2:** Environment variables are not set.
```powershell
$env:GITLAB_PAT      # Should not be empty
$env:GITLAB_BASE_URL # Should not be empty
$env:GITLAB_MCP_PATH # Should not be empty
```

**Cause 3:** The MCP server binary is not installed or the path is wrong.
```powershell
node $env:GITLAB_MCP_PATH/index.js --help  # Should print help
```

---

### MCP tool returns 401 Unauthorized

**Cause:** The GitLab PAT has expired or has insufficient scopes.

**Required scopes:** `read_api`, `read_repository` (nothing else).

**Fix:**
1. Go to GitLab → User Settings → Access Tokens
2. Create a new token with `read_api` and `read_repository` scopes
3. Update `$env:GITLAB_PAT` in your profile

---

### MCP tool is blocked by the allowlist

**Symptom:** Claude Code refuses a tool call with a permission denied error.

**Check:** Is the tool in the allow list?
```powershell
$s = Get-Content .claude\settings.json | ConvertFrom-Json
$s.permissions.allow | Where-Object { $_ -like "*<tool-name>*" }
```

**If legitimate:** Add the tool to `adapters/claude/config/settings.json` allow list, re-run per-repo install, and follow the upgrade procedure in [GOVERNANCE.md](GOVERNANCE.md) §1 (adding a tool to the allowlist is a governance change).

**If it is a write tool:** Do not add it. The allowlist blocks write tools by design.

---

## Command Problems

### Command produces no output or hangs

**Check 1:** Is the approval gate waiting for your response?
Look for: `Approve implementation? (approve / yes / proceed / implement)` — you must type a response.

**Check 2:** Is the context window exceeded?
Large repositories may require narrowing the scope. Use specific `redmine=` or `mr=` arguments instead of free-text descriptions.

---

### "SEARCH RESULT — NOT FOUND" on every search

**Cause:** The MCP server cannot find the issue or MR you specified.

**Check:**
- Is the Redmine ID correct? `redmine=12345` should be a valid issue in your Redmine.
- Is the MR ID correct? `mr=!456` should be a real GitLab MR.
- Is the MCP server connected? Check `$env:GITLAB_PAT` is set and not expired.

---

### Contract hash mismatch in audit log

**Symptom:** `contract_hash_status: mismatch` appears in `.claude/audit/log.jsonl`.

**Meaning:** The `~/.claude/CLAUDE.md` contract does not match the expected kernel hash.

**Action:**
1. Check when this happened (timestamp in the log)
2. Re-run global install: `pwsh install/install-claude.ps1`
3. If it recurs, investigate whether `~/.claude/CLAUDE.md` was modified manually or by another tool

---

## OpenCode Problems

### Command shells not found

**Cause:** OpenCode adapter was not installed.
```powershell
pwsh adapters/opencode/install.ps1 -RepoPath C:\src\your-service
```

### AGENTS.md injection not working

**Check:** Does `AGENTS.md` contain the platform markers?
```powershell
Select-String "enterprise-ai-platform:contract:start" AGENTS.md
```

If missing, re-run the installer.

---

## Copilot Problems

### Chatmodes not showing in dropdown

**Cause:** GitHub Copilot extension version is too old.

**Fix:** Update the GitHub Copilot VS Code extension to ≥ 1.200.

Also verify: `.github/chatmodes/` directory exists and contains `.chatmode.md` files.

---

### Copilot ignores `copilot-instructions.md`

**Cause 1:** The file is not committed. Copilot reads from the repository.
```bash
git add .github/copilot-instructions.md
git commit -m "chore: add Copilot instructions"
git push
```

**Cause 2:** Your Copilot subscription tier does not support custom instructions.
Check with your GitHub administrator.

---

## CI/CD Problems

### `contract-hash-verify` job fails

**Cause:** The kernel hash in `shared/contract.md.sha256` does not match the actual kernel content.

**This happens when:**
- The kernel section in `shared/contract.md` was changed without recomputing the hash
- The `.sha256` file was manually edited

**Fix:** Recompute the hash and commit the new `.sha256` file. See `GOVERNANCE.md` §1 for the hash recomputation procedure.

---

### `no-dup-shared` CI job fails

**Cause:** Content was accidentally duplicated from `shared/` into an adapter.

**Check:**
```bash
# Find large adapter files that may contain shared content
find adapters/ -name "*.md" -size +20c -not -name "STUB.md" -not -name "capability-map.yml" -not -name "file-map.yml" | head -20
```

**Fix:** Remove duplicated content from the adapter. Adapters may only contain thin glue files (for OpenCode: ≤20 lines).

---

## Audit Log Problems

### Log file grows very large

The audit log is never rotated automatically.

```powershell
# Archive and restart (keeps all history, starts fresh active log)
Move-Item .claude\audit\log.jsonl ".claude\audit\log-$(Get-Date -Format 'yyyyMMdd').jsonl"
```

Alternatively, compress the old log:
```powershell
Compress-Archive ".claude\audit\log.jsonl" ".claude\audit\log-archive-$(Get-Date -Format 'yyyyMMdd').zip"
Remove-Item .claude\audit\log.jsonl
```

---

## Getting More Help

1. Check the [FAQ](FAQ.md) for common questions
2. Review the specific platform guide: [INSTALL-CLAUDE.md](INSTALL-CLAUDE.md), [INSTALL-COPILOT.md](INSTALL-COPILOT.md), [INSTALL-OPENCODE.md](INSTALL-OPENCODE.md)
3. For security incidents: contact preetham.nd@lifetrenz.com immediately (see [GOVERNANCE.md](GOVERNANCE.md) §4)
4. For rollback of any component: see [docs/rollback.md](docs/rollback.md)
