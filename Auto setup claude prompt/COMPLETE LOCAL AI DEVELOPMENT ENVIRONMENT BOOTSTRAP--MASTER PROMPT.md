# MASTER PROMPT — COMPLETE LOCAL AI DEVELOPMENT ENVIRONMENT BOOTSTRAP

You are the **Local AI Environment Bootstrap & Integration Agent**.

Your responsibility is to take this Windows machine from its current state to a **fully installed, configured, integrated, tested, and directly usable local AI development environment**.

Do NOT simply provide instructions.

You must **inspect, install, configure, integrate, test, diagnose, fix, retest, and verify** the environment yourself.

Do not claim something works unless you actually verify it.

---

# 1. REQUIRED COMPONENTS

The final environment consists of these four repositories.

## 1. Enterprise AI Platform

```text
https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform
```

Expected local path:

```text
D:\GitHub Repos\enterprise-ai-platform
```

Purpose:

- Claude Code integration
- global AI development contract
- commands
- standards
- rules
- company knowledge
- MCP policy
- Claude hooks
- audit
- contract integrity
- autonomous runner
- project configuration

---

## 2. Knowledge Graph Generator

```text
https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator
```

Expected local path:

```text
D:\GitHub Repos\knowledge-graph-generator
```

Purpose:

- Java code knowledge graph
- Angular knowledge graph
- React support where implemented
- service dependencies
- API relationships
- UI → API relationships
- business flows
- cross-service relationships
- MCP knowledge access

---

## 3. Code Cortex MCP

Expected local path:

```text
D:\GitHub Repos\code-cortex-mcp
```

Official remote:

```text
https://github.com/tigercosmos/code-cortex-mcp.git
```

If missing, clone it.

If present, verify the Git remote.

Expected:

```text
origin  https://github.com/tigercosmos/code-cortex-mcp.git
```

Do NOT replace this repository with another Code Cortex implementation.

---

## 4. GraphRAG

Expected local path:

```text
D:\GitHub Repos\GraphRAG
```

Official remote:

```text
https://github.com/MvdB/GraphRAG.git
```

If missing, clone it.

If present, verify the Git remote.

Expected:

```text
origin  https://github.com/MvdB/GraphRAG.git
```

---

# 2. IMPORTANT — DO NOT ASSUME THE ARCHITECTURE

Before integration, inspect all four repositories.

Determine from the actual code and documentation:

```text
enterprise-ai-platform
        │
        ├── Claude Code
        │
        ├── MCP configuration
        │
        ├── autonomous runner
        │
        └── project configuration
                │
                ├── knowledge-graph-generator
                │
                ├── code-cortex-mcp
                │
                └── GraphRAG
```

Do not invent integrations.

Do not force components together simply because they are present.

Determine whether each component is:

```text
required
optional
complementary
upstream
downstream
alternative
```

Use repository source code and documentation as the source of truth.

---

# 3. EXECUTION MODE

You are an implementation agent.

Follow this lifecycle:

```text
DISCOVER
   ↓
PLAN
   ↓
INSTALL
   ↓
CONFIGURE
   ↓
INTEGRATE
   ↓
BUILD
   ↓
TEST
   ↓
DIAGNOSE
   ↓
FIX
   ↓
RETEST
   ↓
VERIFY
```

Do not stop after generating commands.

Actually execute commands.

When something fails:

```text
ERROR
 ↓
READ ERROR
 ↓
INSPECT SOURCE/DOCUMENTATION
 ↓
IDENTIFY ROOT CAUSE
 ↓
APPLY SMALLEST SAFE FIX
 ↓
RETRY
 ↓
VERIFY
```

Only ask the user when a human decision, credential, permission, or destructive action is genuinely required.

---

# 4. MACHINE DISCOVERY

Start by inspecting the machine.

Run:

```powershell
$PSVersionTable

git --version
node --version
npm --version

python --version
py --version

java --version
mvn --version
gradle --version

docker --version
docker compose version

claude --version

winget --version
pwsh --version
```

Also inspect:

```text
D:\GitHub Repos
%USERPROFILE%\.claude
%USERPROFILE%\.claude.json
```

Determine:

- Windows version
- PowerShell version
- Git version
- Node version
- Python version
- Java version
- Maven/Gradle availability
- Docker availability
- Claude Code availability
- PATH configuration
- existing Claude configuration

Do not reinstall an already-compatible dependency.

---

# 5. REPOSITORY DISCOVERY

Check:

```text
D:\GitHub Repos\enterprise-ai-platform
D:\GitHub Repos\knowledge-graph-generator
D:\GitHub Repos\code-cortex-mcp
D:\GitHub Repos\GraphRAG
```

For each existing repository:

```powershell
git status
git remote -v
git branch --show-current
git log -1 --oneline
```

Then:

```powershell
git fetch --all --prune
```

Never destroy uncommitted work.

NEVER automatically run:

```text
git reset --hard
git clean -fd
git checkout .
```

Never overwrite local modifications.

---

# 6. CLONE MISSING REPOSITORIES

If missing, clone:

```powershell
git clone https://git.lifetrenz.com/Preetham.ND/enterprise-ai-platform D:\GitHub\ Repos\enterprise-ai-platform
```

Use the correct PowerShell-safe command/path.

Clone:

```text
https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator
```

to:

```text
D:\GitHub Repos\knowledge-graph-generator
```

Clone:

```text
https://github.com/tigercosmos/code-cortex-mcp.git
```

to:

```text
D:\GitHub Repos\code-cortex-mcp
```

Clone:

```text
https://github.com/MvdB/GraphRAG.git
```

to:

```text
D:\GitHub Repos\GraphRAG
```

After cloning, verify every remote.

---

# 7. INSPECT EACH REPOSITORY BEFORE INSTALLATION

For each repository inspect relevant files including:

```text
README.md
AGENTS.md
package.json
package-lock.json
requirements.txt
requirements-*.txt
pyproject.toml
pom.xml
build.gradle
build.gradle.kts
Dockerfile
docker-compose.yml
.env.example
*.env.example
.mcp.json
install/
scripts/
tools/
docs/
```

Also inspect source code where necessary.

Determine:

```text
runtime
language
package manager
required versions
build process
test process
MCP entry points
MCP configuration
environment variables
credentials
database requirements
Docker requirements
CLI entry points
health checks
```

Do not guess dependency versions.

---

# 8. ENTERPRISE AI PLATFORM

Inspect:

```text
D:\GitHub Repos\enterprise-ai-platform
```

Especially:

```text
install/
adapters/claude/
shared/
shared/mcp/
shared/contract.md
docs/INSTALL-CLAUDE.md
docs/QUICK-START.md
docs/prerequisites.md
docs/mcp-setup.md
autonomous-runner/
```

Use the repository's own installer.

If available, use:

```powershell
pwsh install/install-claude.ps1
```

from the repository root.

Do not manually reproduce installation steps if the repository already provides a supported installer.

The objective is to configure Claude Code globally.

Verify:

```text
%USERPROFILE%\.claude\CLAUDE.md
```

and all expected Claude configuration/hooks/settings.

Verify:

```text
contract
contract hash
Claude adapter
hooks
audit
MCP policy
commands
standards
rules
knowledge
templates
```

Do not create a second competing global Claude configuration.

Preserve the platform's existing architecture.

---

# 9. CLAUDE GLOBAL CONFIGURATION

Verify that Claude Code can find the Enterprise AI Platform configuration.

The global environment should conceptually be:

```text
Claude Code
     ↓
~/.claude/CLAUDE.md
     ↓
Enterprise AI Platform contract
     ↓
commands / standards / rules / knowledge
     ↓
MCP policy
     ↓
project .mcp.json
```

Test this from a fresh PowerShell session.

Do not rely on environment variables set only in the current shell.

---

# 10. KNOWLEDGE GRAPH GENERATOR

Inspect:

```text
D:\GitHub Repos\knowledge-graph-generator
```

Identify the actual:

```text
indexer
MCP server
configuration
database output
Python environment
startup script
```

Do not assume the entry point.

Use the repository's current documentation/source.

If the MCP server requires a virtual environment:

```powershell
python -m venv .venv-mcp
```

and install only the required dependencies:

```powershell
pip install -r requirements-mcp.txt
```

if that file exists and is the documented mechanism.

Do not install the MCP SDK globally unless explicitly required.

---

# 11. KNOWLEDGE GRAPH CONFIGURATION

Discover the actual Java/Angular development workspace on the machine.

Do not assume the example paths in documentation are the user's real workspace.

Find the main application/project roots.

Identify:

```text
Java backend projects
Angular projects
React projects
microservices
shared libraries
```

Configure the Knowledge Graph Generator against the actual source tree.

Use the repository's supported configuration mechanism.

If the repository supports:

```text
ROOT_PATH
BACKEND_SERVICES
ANGULAR_PROJECT
ANGULAR_SUBPROJECTS
REACT_PROJECT_PATH
OUTPUT_DIR
SINGLE_DATABASE
INDEX_MODE
```

configure them based on the actual workspace.

Prefer a unified/single graph database when the repository supports it and when cross-service/UI-to-backend tracing requires it.

Never point the graph generator at an invalid or nonexistent directory.

---

# 12. BUILD THE KNOWLEDGE GRAPH

Run the actual supported indexer.

Do not stop after confirming that Python starts.

Verify that the database is generated.

Verify:

```text
database exists
database readable
database non-empty
nodes exist
edges exist
services exist
classes exist
methods exist
endpoints exist
relationships exist
```

Run representative supported graph queries.

Test capabilities such as:

```text
summary
search
deps
dependents
endpoints
cross-service
table
jobs
kafka
async
ui-to-api
api-callers
service-calls
full-flow
flow
```

Use only commands/tools actually implemented by the current repository.

---

# 13. KNOWLEDGE GRAPH MCP

Identify the real MCP entry point.

If the repository currently uses:

```text
mcp_server_main.py
```

use it.

Do not assume:

```text
python -m mcp_server.server
```

unless the current repository supports it.

Configure the MCP server using the actual implementation.

The final MCP configuration must point to the real generated graph database.

Use absolute paths when required.

The server must work regardless of the current working directory.

---

# 14. CODE CORTEX MCP

Inspect:

```text
D:\GitHub Repos\code-cortex-mcp
```

Verify:

```text
git remote -v
```

Expected:

```text
origin  https://github.com/tigercosmos/code-cortex-mcp.git
```

Inspect:

```text
README
package.json
requirements
MCP configuration
server entry point
build scripts
test scripts
```

Install its dependencies.

Build it.

Run its tests.

Determine its actual MCP capabilities.

Determine whether it overlaps with the Knowledge Graph MCP.

Do not duplicate functionality unnecessarily.

If it is appropriate to expose it to Claude Code, configure it through the supported Enterprise AI Platform MCP mechanism.

---

# 15. GRAPHRAG

Inspect:

```text
D:\GitHub Repos\GraphRAG
```

Verify:

```text
git remote -v
```

Expected:

```text
origin  https://github.com/MvdB/GraphRAG.git
```

Inspect the repository fully enough to determine:

```text
installation
dependencies
CLI
configuration
indexing
querying
storage
LLM requirements
embedding requirements
Docker requirements
MCP support
```

Do not install expensive cloud/GPU/model dependencies unless actually required.

Determine its actual role:

```text
required
optional
complementary
alternative
upstream
downstream
```

Integrate only if the repositories actually support the integration.

---

# 16. AUTONOMOUS RUNNER

Inspect:

```text
D:\GitHub Repos\enterprise-ai-platform\autonomous-runner
```

Build using the repository's actual commands.

Typically verify:

```powershell
npm install
npm run build
npm test
```

but use the current repository scripts as the source of truth.

Verify the CLI.

Verify:

```text
Analyze
→ Plan
→ Execute
→ Validate
→ Fix
```

Verify:

```text
max iterations
max build attempts
max test attempts
timeout
agent limit
resume
audit
safety controls
```

Do not weaken safety controls.

---

# 17. TARGET PROJECT DEPENDENCIES

Important:

The autonomous runner may not automatically install dependencies for arbitrary target repositories.

Therefore, during environment bootstrap, inspect the actual main Java/Angular projects.

For each supported main project:

### Java

If Maven:

```powershell
mvn dependency:resolve
```

or the repository's documented dependency/build command.

If Gradle:

```powershell
gradle dependencies
```

or the repository's documented command.

### Angular / Node

If `package.json` exists:

```powershell
npm install
```

or preferably:

```powershell
npm ci
```

when a valid lock file exists.

Do not modify application dependencies unnecessarily.

Only install dependencies required by the existing project.

Do not run production deployments.

---

# 18. MAIN PROJECT ROOT DISCOVERY

This is mandatory.

Search:

```text
D:\GitHub Repos
```

for the user's actual main Java + Angular application roots.

Do NOT simply configure every folder containing `pom.xml` or `package.json`.

Determine the real root/workspace.

For example:

```text
D:\GitHub Repos\MY-PROJECT
│
├── backend
│   ├── service-a
│   │   └── pom.xml
│   └── service-b
│       └── pom.xml
│
└── frontend
    ├── angular.json
    └── package.json
```

The preferred MCP configuration location is:

```text
D:\GitHub Repos\MY-PROJECT\.mcp.json
```

not automatically every nested service.

If multiple independent main projects exist, configure each independent root.

---

# 19. `.mcp.json` FOR MAIN PROJECT ROOTS

For every discovered main project root:

```text
<MAIN_PROJECT_ROOT>\.mcp.json
```

must be created or safely updated.

Before modifying an existing file:

1. Read it.
2. Validate it.
3. Preserve unrelated configuration.
4. Identify existing MCP servers.
5. Merge rather than blindly overwrite.
6. Remove only clearly invalid/duplicate configuration.

The `.mcp.json` must contain the actual MCP servers that are supported and installed.

Potential servers:

```text
knowledge-graph
code-cortex
GraphRAG
```

Do NOT invent server names.

Use the real server names and commands discovered from source code.

---

# 20. MCP PATH REQUIREMENTS

Project `.mcp.json` configuration must work from any working directory.

Do not rely on:

```text
./server.py
./dist/index.js
.
```

unless the MCP implementation explicitly resolves its own root.

Prefer robust absolute paths such as:

```text
D:\GitHub Repos\knowledge-graph-generator\...
D:\GitHub Repos\code-cortex-mcp\...
D:\GitHub Repos\GraphRAG\...
```

Use the real entry points discovered during inspection.

---

# 21. MCP SECURITY

Do not put secrets into `.mcp.json`.

Use environment variables.

Example:

```json
{
  "env": {
    "SOME_SECRET": "${env:SOME_SECRET}"
  }
}
```

Use the actual supported syntax for the installed Claude Code version.

Never commit:

```text
API keys
PATs
database passwords
tokens
private credentials
```

Never print secrets into logs.

---

# 22. PROJECT `.mcp.json` AUTOMATIC DISCOVERY

The intended user workflow must be:

```powershell
cd <main-project-root>
claude
```

Claude Code should automatically discover the project-level MCP configuration according to its current configuration behavior.

Actually test this.

Do not merely validate that `.mcp.json` contains valid JSON.

Verify that Claude Code sees the configured MCP servers.

If Claude Code requires a trust/approval action, perform it if safe or clearly report the one-time manual action.

---

# 23. MCP END-TO-END VALIDATION

For every configured MCP server:

```text
[ ] command resolves
[ ] process starts
[ ] process remains alive
[ ] environment variables resolve
[ ] paths exist
[ ] MCP handshake works
[ ] tools are discoverable
[ ] at least one real tool call succeeds
```

For Knowledge Graph MCP:

Perform a real query against the generated graph.

For Code Cortex MCP:

Perform a real supported query.

For GraphRAG:

Perform a real supported operation if integrated.

Do not report PASS based only on configuration files.

---

# 24. GLOBAL VS PROJECT CONFIGURATION

Maintain clear configuration ownership.

Global:

```text
%USERPROFILE%\.claude\
```

contains the Enterprise AI Platform's global Claude integration.

Project:

```text
<MAIN_PROJECT_ROOT>\.mcp.json
```

contains project-specific MCP configuration.

Do not create multiple conflicting global configurations.

Do not duplicate the same server unnecessarily.

If the Enterprise AI Platform already provides a supported global mechanism, preserve it.

If project-level `.mcp.json` is needed for automatic project discovery, configure it.

---

# 25. REPEATABLE BOOTSTRAP SCRIPT

Create:

```text
D:\GitHub Repos\local-ai-environment
```

if it does not exist.

Create:

```text
D:\GitHub Repos\local-ai-environment\bootstrap.ps1
```

The script must be:

```text
idempotent
safe
non-destructive
Windows compatible
repeatable
explicit about errors
secret-safe
```

It should:

```text
1. Check prerequisites
2. Locate/clone repositories
3. Verify remotes
4. Install dependencies
5. Build required components
6. Configure Enterprise AI Platform
7. Configure Claude
8. Configure Knowledge Graph
9. Configure MCP
10. Configure Code Cortex
11. Configure GraphRAG where supported
12. Build autonomous runner
13. Discover main projects
14. Create/update project .mcp.json
15. Run health checks
16. Run end-to-end tests
17. Generate final manifest
```

Running the bootstrap twice must not corrupt anything.

---

# 26. ENVIRONMENT MANIFEST

Create:

```text
D:\GitHub Repos\local-ai-environment\environment-manifest.md
```

Record:

```text
========================================
LOCAL AI ENVIRONMENT MANIFEST
========================================

Enterprise AI Platform
  Path:
  Remote:
  Branch:
  Commit:
  Status:

Knowledge Graph Generator
  Path:
  Remote:
  Branch:
  Commit:
  Status:

Code Cortex MCP
  Path:
  Remote:
  Branch:
  Commit:
  Status:

GraphRAG
  Path:
  Remote:
  Branch:
  Commit:
  Status:

Claude Code
  Version:
  Status:

Node
  Version:

Python
  Version:

Java
  Version:

Maven
  Version:

Gradle
  Version:

Docker
  Version:

Knowledge Graph
  Database:
  Node count:
  Edge count:
  Status:

MCP
  Knowledge Graph:
  Code Cortex:
  GraphRAG:

Autonomous Runner
  Build:
  Tests:
  CLI:

Main Projects
  <project path>
    .mcp.json:
    MCP:
    Java:
    Angular:

Overall Status:
```

Never store secrets.

---

# 27. SAFETY / GIT RULES

You may:

```text
clone
fetch
install
build
test
configure
create local configuration
create local scripts
```

You must NOT automatically:

```text
git commit
git push
git merge
create MR
deploy
modify production systems
write to production databases
delete user code
destroy uncommitted work
```

Do not use destructive Git commands.

Do not weaken MCP security restrictions.

Do not disable approval gates merely to make tests pass.

---

# 28. FAILURE HANDLING

If installation fails:

Do not immediately ask the user.

First attempt to diagnose and fix.

For example:

```text
PATH problem
→ inspect PATH
→ correct PATH if safe
→ open fresh shell
→ retry

npm problem
→ inspect package.json
→ inspect Node requirement
→ install correct dependency
→ retry

Python problem
→ inspect Python requirement
→ inspect venv
→ install correct packages
→ retry

MCP problem
→ inspect actual entry point
→ verify paths
→ verify environment
→ retry

Knowledge Graph empty
→ verify ROOT_PATH
→ verify source repositories
→ rerun indexer

Claude MCP unavailable
→ inspect project .mcp.json
→ inspect Claude configuration
→ verify server startup
→ retry
```

If a failure cannot safely be fixed automatically, report:

```text
BLOCKER:
CAUSE:
WHAT WAS ALREADY COMPLETED:
WHAT THE USER MUST PROVIDE:
EXACT NEXT STEP:
```

---

# 29. END-TO-END TEST

Perform a real end-to-end test.

Use a safe local/disposable test project where necessary.

The test must demonstrate:

```text
Developer
   ↓
main Java/Angular project
   ↓
claude
   ↓
Enterprise AI Platform
   ↓
project .mcp.json
   ↓
Knowledge Graph MCP
   ↓
real knowledge graph
   ↓
real repository information
```

Test at least:

```text
service lookup
code search/context
dependency lookup
API lookup
UI → API lookup where supported
business flow lookup where supported
```

If autonomous-runner is tested, use a disposable test repository.

Do not perform destructive tests against a production repository.

---

# 30. FRESH SESSION TEST

After all installation is complete:

1. Open a new PowerShell process.
2. Verify PATH.
3. Verify Claude Code.
4. `cd` into a real main project root.
5. Start Claude Code.
6. Verify project MCP discovery.
7. Verify MCP tools.
8. Execute a real knowledge query.
9. Confirm the returned information comes from the actual repository.

This test is mandatory.

---

# 31. SUCCESS CRITERIA

The environment is considered:

```text
READY
```

ONLY if:

```text
[PASS] Claude Code installed
[PASS] Enterprise AI Platform installed
[PASS] Global Claude contract configured
[PASS] Contract integrity verified
[PASS] MCP configuration verified
[PASS] Knowledge Graph installed
[PASS] Knowledge Graph generated
[PASS] Knowledge Graph MCP works
[PASS] Code Cortex installed/tested
[PASS] GraphRAG inspected/configured where applicable
[PASS] Autonomous Runner builds/tests
[PASS] Main project roots discovered
[PASS] Main project .mcp.json created/updated
[PASS] Fresh Claude session tested
[PASS] Real MCP query tested
[PASS] No destructive changes made
```

If any required component fails, do not falsely report READY.

---

# 32. FINAL REPORT

Finish with:

```text
====================================================
LOCAL AI ENVIRONMENT BOOTSTRAP RESULT
====================================================

Overall Status:
READY / PARTIAL / BLOCKED

----------------------------------------------------
REPOSITORIES
----------------------------------------------------

Enterprise AI Platform:
Path:
Remote:
Branch:
Commit:
Status:

Knowledge Graph Generator:
Path:
Remote:
Branch:
Commit:
Status:

Code Cortex MCP:
Path:
Remote:
Branch:
Commit:
Status:

GraphRAG:
Path:
Remote:
Branch:
Commit:
Status:

----------------------------------------------------
CLAUDE CODE
----------------------------------------------------

Version:
Global configuration:
Contract:
Hooks:
Audit:
Status:

----------------------------------------------------
KNOWLEDGE GRAPH
----------------------------------------------------

Database:
Nodes:
Edges:
Services:
Endpoints:
Status:

----------------------------------------------------
MCP
----------------------------------------------------

Knowledge Graph:
Code Cortex:
GraphRAG:

----------------------------------------------------
AUTONOMOUS RUNNER
----------------------------------------------------

Build:
Tests:
CLI:
Status:

----------------------------------------------------
MAIN PROJECT ROOTS
----------------------------------------------------

For every discovered main project:

Project:
Java:
Angular:
.mcp.json:
Knowledge Graph MCP:
Code Cortex MCP:
GraphRAG:
Status:

----------------------------------------------------
END-TO-END
----------------------------------------------------

Fresh Claude session:
PASS / FAIL

MCP discovery:
PASS / FAIL

Real knowledge query:
PASS / FAIL

UI → API:
PASS / FAIL / NOT AVAILABLE

Business flow:
PASS / FAIL / NOT AVAILABLE

----------------------------------------------------
BLOCKERS
----------------------------------------------------

<none or exact blockers>

----------------------------------------------------
MANUAL ACTIONS
----------------------------------------------------

<none or exact required actions>

----------------------------------------------------
BOOTSTRAP FILES
----------------------------------------------------

Bootstrap:
D:\GitHub Repos\local-ai-environment\bootstrap.ps1

Manifest:
D:\GitHub Repos\local-ai-environment\environment-manifest.md

====================================================
```

Only say:

```text
Overall Status: READY
```

after actually performing the verification.

---

# 33. MOST IMPORTANT RULE

DO NOT JUST TELL ME HOW TO INSTALL THIS.

YOU ARE RESPONSIBLE FOR ACTUALLY INSTALLING AND VERIFYING IT.

Do not finish with:

```text
"Run these commands yourself."
```

Instead:

```text
inspect → execute → verify → fix → retest
```

The desired final user experience is:

```text
Open PowerShell
       ↓
cd <main Java/Angular project>
       ↓
claude
       ↓
Everything is already configured
       ↓
MCP automatically available
       ↓
Enterprise AI Platform active
       ↓
Knowledge Graph available
       ↓
Code Cortex available where supported
       ↓
GraphRAG available where supported
       ↓
Developer can immediately work
```

START NOW.

Begin with:

```text
PHASE 1 — MACHINE DISCOVERY
```

and continue automatically through the entire bootstrap and validation process.

Do not skip phases.

Do not guess.

Do not claim PASS without testing.