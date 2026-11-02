# MCP Read-Only Credential Setup
**Updated:** 2026-07-07 (Phase B — allowlist mode + env injection added)

Governance is enforced at two layers:
1. **Credential layer** — MCP servers use read-only tokens so writes are physically impossible.
2. **Allowlist layer** — `settings.json` lists only read tools; unlisted tools are denied by `mcp__*` wildcard.

Both layers are required. Either alone is insufficient.

---

## Step 0 — Install and configure `.mcp.json`

The platform provides `shared/mcp/.mcp.json.template`. Copy it to `.mcp.json` in the consuming
repo root (`.mcp.json` is gitignored — see `docs/secrets.md`).

```powershell
Copy-Item shared/mcp/.mcp.json.template .mcp.json
```

Then set the required environment variables (see `docs/secrets.md` for the full list and
`.env.example` for a template). Load them in your shell profile or `.env`:

```powershell
$env:GITLAB_PAT      = "glpat-<YOUR_TOKEN>"
$env:GITLAB_BASE_URL = "https://git.example.com"
$env:GITLAB_MCP_PATH = "C:/tools/gitlab-mcp"
```

Claude Code reads `.mcp.json` and substitutes `${env:VARNAME}` before launching each server.

---

## Step 1 — Install custom gitlab-reader MCP server

The platform uses the **custom `gitlab-reader`** MCP server (decision: V-C3, docs/sp-vc3-result.md).
This is NOT the official GitLab MCP — it is a Lifetrenz-internal read-only server.

```powershell
# Install the gitlab-reader server globally
npm install -g @lifetrenz/gitlab-mcp-reader   # or your internal registry path

# Verify installation
node $env:GITLAB_MCP_PATH/index.js --help
```

Set `GITLAB_MCP_PATH` to the directory containing `index.js`.

---

## GitLab MCP (gitlab-reader)

Create a project-scoped or group-scoped token with **read-only** scopes only.

**Required scopes (check exactly these, nothing else):**
- `read_api`
- `read_repository`

**Prohibited scopes (must NOT be present):**
- `api` (write access to all APIs)
- `write_repository`
- `write_registry`

**Steps:**
1. GitLab → User Settings (or Group/Project Settings) → Access Tokens → New token
2. Name: `ai-platform-readonly`
3. Expiry: set a renewal date (90 days recommended)
4. Select ONLY: `read_api`, `read_repository`
5. Copy the token
6. Set in your MCP server config:
   ```json
   { "GITLAB_TOKEN": "<read-only-token>" }
   ```

**Verify (run this — should return 403 for any write attempt):**
```bash
curl -X POST "https://git.lifetrenz.com/api/v4/projects/1/repository/branches" \
  -H "PRIVATE-TOKEN: <your-token>" \
  -d "branch=test&ref=main"
# Expected: {"message":"403 Forbidden"}
```

---

## Redmine MCP (redmine-reader)

Redmine does not have granular token scopes.
Use a **dedicated service account** with minimal permissions:

1. Create a Redmine user: `ai-platform-service`
2. Assign role: **Reporter** (can read issues, cannot create/update/delete)
3. Generate an API key for this user (My Account → API access key)
4. Set in MCP config:
   ```json
   { "REDMINE_API_KEY": "<service-account-key>" }
   ```

**Verify:**
```bash
curl -X POST "https://redmine.lifetrenz.com/issues.json" \
  -H "X-Redmine-API-Key: <key>" \
  -H "Content-Type: application/json" \
  -d '{"issue":{"project_id":1,"subject":"test"}}'
# Expected: 403 or 422 (not 201)
```

---

## Database MCPs

Each DB MCP should connect with a **read-only database user**.

```sql
-- PostgreSQL: create a read-only user
CREATE USER ai_platform_ro WITH PASSWORD '<strong-password>';
GRANT CONNECT ON DATABASE your_db TO ai_platform_ro;
GRANT USAGE ON SCHEMA public TO ai_platform_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_platform_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_platform_ro;
```

Set in MCP config:
```json
{ "DB_USER": "ai_platform_ro", "DB_PASSWORD": "<password>" }
```

---

## Verification checklist

Run before fleet rollout. All must return non-2xx for write operations.

```
☐ GitLab: POST /repository/branches → 403
☐ GitLab: POST /merge_requests       → 403
☐ GitLab: PUT  /issues/:id           → 403
☐ Redmine: POST /issues.json         → 403
☐ DB: INSERT INTO any_table          → permission denied
☐ DB: DROP TABLE any_table           → permission denied
```

Only after all checks pass: proceed with fleet rollout.

> **Self-contained install (Unreleased):** see [CROSS_PLATFORM_INSTALLATION](CROSS_PLATFORM_INSTALLATION.md) and [PLUGIN_INTEGRATIONS](PLUGIN_INTEGRATIONS.md) (`npm run plugin:install:claude`, dry-run by default). Windows is not verified on a real machine.
