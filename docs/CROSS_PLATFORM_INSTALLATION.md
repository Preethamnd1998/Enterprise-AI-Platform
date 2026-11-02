# Cross-platform installation

Prereqs: Node >= 20, Python >= 3.10, git. (Windows: Python from python.org/winget, not the Store stub.)

```
git clone https://git.lifetrenz.com/Preetham.ND/knowledge-graph-generator.git ../knowledge-graph-generator   # separate repo (or set KNOWLEDGE_GRAPH_PATH)
cp paths.local.env.example paths.local.env      # set PROJECTS_DIR (folder with BE/ and UI/)
./install/macos/install-all.sh [--apply] [--with-cortex] [--clients all]   # or install/linux/…
.\install\windows\install-all.ps1 [-Apply] [-WithCortex] [-Clients all]      # Windows
npm run platform:doctor                          # what is missing
npm run platform:install                         # dry-run plan
npm run platform:install -- --apply [--with-cortex]   # npm deps + .venv-mcp (+ code-cortex binary)
npm run mcp:selftest                             # starts each MCP via launcher
bash ../knowledge-graph-generator/sync-projects.sh       # macOS/Linux index
powershell -File ..\knowledge-graph-generator\sync-projects.ps1   # Windows index
npm run plugin:install:all                       # dry-run; add -- --apply to install
```
Never copy `.venv-mcp`, `node_modules` or binaries between machines/OSes.
Windows notes: paths with spaces supported; `opencode.cmd` shims can't take arbitrary prompts —
set `OPENCODE_BRIDGE_BIN` to opencode.exe. `NODE_PATH` in paths.local.env = node executable
(process `NODE_PATH` is ignored on purpose).
## Verification status (honest)
| Area | macOS | Windows | Linux |
|---|---|---|---|
| doctor / install / selftest / KG indexing / Claude+OpenCode plugin load | verified (real run) | **not run** | **not run** |
| path resolution, security guard, install planning, install-script lint | real + mock | **mock only** (`path.win32`, injected fs) | mock |
| `install-all.ps1`, `sync-projects.ps1` | n/a | **never executed** | n/a |
| Cursor plugin | not run in Cursor (not installed) | not run | not run |

"Works on Windows" is therefore a design intent, not a result. On a Windows machine run, in order: `npm run platform:doctor`, `npm test`, `npm run mcp:selftest`, then `.\install\windows\install-all.ps1` (dry-run) and report failures. Cursor local install: copy (not symlink) into `~/.cursor/plugins/local/<name>` and reload; Enterprise teams need the admin setting *Allow Local Plugin Imports*.
