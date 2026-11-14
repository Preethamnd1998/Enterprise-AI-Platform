# Gemini analysis helper (optional)

An optional MCP server, `gemini-assistant`, that lets Claude delegate **large pre-processing jobs** to
Google's Gemini API and get **compact, structured JSON** back. Claude keeps complex reasoning,
implementation and every final decision; Gemini only pre-digests big inputs.

**Disabled by default.** If you never enable it, nothing about the platform changes: the server is not
registered, its npm dependencies are not installed, its skill is not shipped, and no tool appears in Claude.

---

## 1. Enable / disable

```bash
node shared/core/cli.js gemini:setup          # enable (interactive)
node shared/core/cli.js gemini:status         # enabled? key found? model? — never prints the key
node shared/core/cli.js gemini:setup --disable            # back to Claude-only
node shared/core/cli.js gemini:setup --disable --forget-key   # also remove the stored key
```

`gemini:setup`:

1. Looks for a key in `GEMINI_API_KEY`, then `GOOGLE_API_KEY` (environment), then the same names in the
   local env file (`<repo>/.env`, or `GEMINI_ENV_FILE`).
2. If none is found and you are in a terminal, asks for it with **hidden input** and stores it as
   `GEMINI_API_KEY=…` in the local env file — gitignored, owner-only permissions (`0600`). The key is
   validated as a plain token first, so a pasted value can never inject extra lines.
3. In a terminal (or with `--check`) makes one cheap metadata request to confirm the key works (no tokens consumed); a rejected key leaves the integration disabled.
4. Writes `GEMINI_ENABLED=true` to `paths.local.env` (gitignored; never the tracked `paths.env`).
5. Prints the follow-up commands:

```bash
node shared/core/cli.js platform:install --apply              # installs the server's npm dependencies
node shared/core/cli.js plugin:install claude-code --apply    # rebuilds: adds the server + delegation skill
claude plugin update enterprise-ai-platform@eap-local         # then restart Claude Code
```

The setup prompt (`Auto setup claude prompt/…MASTER PROMPT.md`) asks whether to enable it and defaults to **no**.
Never paste the key into a chat or into the setup agent: run `gemini:setup` in your own terminal.
Without a terminal (CI, agents) it will not enable anything unless you pass `--enable` explicitly.

| Flag | Effect |
|---|---|
| `--disable` | set `GEMINI_ENABLED=false` |
| `--forget-key` | with `--disable`: delete `GEMINI_API_KEY` from the env file |
| `--prompt-key` | ask for a key even if one is in the environment, and store it in the env file |
| `--check` | verify the key against the API even without a terminal |
| `--enable` | enable even when no key exists yet (tools will report "unavailable" until you add one) |

## 2. Configuration

Set in `paths.local.env` (or the environment — environment wins). See `paths.env.example`.

| Setting | Default | Meaning |
|---|---|---|
| `GEMINI_ENABLED` | off | master switch |
| `GEMINI_MODEL` | `gemini-2.5-flash` | any model your key can use; `gemini:setup --check` reports an unknown model |
| `GEMINI_ALLOWED_ROOTS` | `PROJECTS_DIR` | comma list of folders the file/diff tools may read |
| `GEMINI_ENV_FILE` | `<repo>/.env` | where the key file lives |

Environment-only tuning: `GEMINI_MAX_INPUT_CHARS` (400000), `GEMINI_MAX_OUTPUT_TOKENS` (8192 — Gemini 2.5 models spend part of this on internal reasoning, so it is larger than the JSON answer needs),
`GEMINI_TIMEOUT_MS` (60000), `GEMINI_REDACT_PII` (`false` turns off email/phone/id masking; secrets are
always masked), `GEMINI_BASE_URL` (https only; `http` only for localhost, used by tests and proxies).

The key is looked up on every call, so adding or changing it in the env file works without restarting
Claude Code (a key exported in a shell is only visible to processes started from that shell — use the env
file if you launch Claude Code from a desktop app).

## 3. Tools

All return one compact JSON object: `{ ok, tool, model, data, input, usage }`, or on failure
`{ ok:false, tool, code, reason, unavailable?, fallback? }`.

| Tool | Input | Returns (in `data`) |
|---|---|---|
| `gemini_summarize` | `path` or `text`, `focus?`, `max_points?` | summary, key_points, notable items (map-reduce for very large inputs: ≤ 6 chunks + 1 merge) |
| `gemini_analyze_logs` | `path` or `text`, `hint?`, `max_findings?` | overview, time range, error groups (signature, count, first/last seen, likely cause), root-cause hypotheses, checks to run — keeps the most recent lines of huge logs |
| `gemini_explore_codebase` | `question`, `paths[]` (files/dirs you choose), limits | answer, relevant files with line ranges, call flow, open questions |
| `gemini_review_diff` | `repo` + `base`/`head`/`staged`, or `diff` | summary, risk level, findings with file/line/severity, tests to add |
| `gemini_generate_tests` | `path`, `text` or `diff`, `framework?`, `count?` | prioritised scenarios (steps + expected), coverage gaps, assumptions |
| `gemini_extract_findings` | `path` or `text`, `categories?`, `max_findings?` | findings with evidence, severity, confidence; categories with nothing found |
| `gemini_status` | — | local configuration check, no API call |

When enabled, the plugin also ships a short skill (`gemini-delegation`) that tells Claude when to delegate
(large raw material) and what to keep (implementation, conclusions, security judgements, small inputs),
and to treat every result as a lead to verify (`file:line`) rather than a fact.

## 4. If Gemini is unavailable

No key, bad key, quota, network error, blocked response or an unreadable path: the tool returns
`ok:false, unavailable:true` with a one-line reason and a `fallback` hint. It is a normal tool result, not
a protocol error — Claude simply continues the task itself. Disabled or never enabled: the tools do not
exist, so the Claude-only workflow is byte-for-byte what it was.

## 5. Privacy and safety

- **Content leaves your machine** and goes to Google's Gemini API. Check that this is allowed for the data
  involved. Do not send patient data, customer records or credentials on purpose.
- **Masking before sending** (best effort, not a guarantee): private keys, JWTs, bearer tokens, cloud/Git
  tokens, `password=`/`token=`-style values, credentials inside URLs, and — unless `GEMINI_REDACT_PII=false` —
  email addresses, Indian mobile numbers and 12-digit ids. Counts are reported in `input.redactions`.
- **Sandboxed reads**: paths must be inside the allowed roots; `.env` files, `.ssh`, key files and similar
  are refused by the platform's path guard; `node_modules`, `.git`, build output and binaries are skipped.
  Directory walks are bounded (depth 4, sorted, ≤ 80 files). You pass the paths; nothing scans the repo.
- **git**: only `git diff` runs (no shell), ref names are validated, the repo must be inside the roots.
- **Prompt injection**: analysed text is framed as untrusted data and the model is told never to follow
  instructions inside it; results still go through Claude, which verifies them.
- **The key** is never printed, logged, returned in a result, put in an MCP config, or sent anywhere but the
  `x-goog-api-key` header of requests to the Gemini API. Status output shows only "set (N chars)".
- **Cost control**: one call per tool use (map-reduce is capped), output capped at 8192 tokens by default (answers are asked to be concise),
  input capped at 400k characters; 429/5xx are retried twice with backoff, then reported.

## 6. Implementation notes

| Piece | Location |
|---|---|
| MCP server | `shared/mcp-tools/gemini-assistant-mcp/` (`index.js`, `lib/{client,tools,input,redact}.js`) |
| Registry entry (`optionalSetting: GEMINI_ENABLED`) | `shared/core/mcp-registry/registry.json` |
| Key detection, env-file writing, setup CLI | `shared/core/gemini/` (`gemini:setup`, `gemini:status` in `shared/core/cli.js`) |
| Delegation skill (shipped only when enabled) | `shared/optional/gemini-assistant/skills/gemini-delegation/` |
| Tests | `shared/mcp-tools/gemini-assistant-mcp/test/`, `shared/core/tests/gemini.test.mjs` |

It uses the official Gemini API (`generateContent` over REST with JSON-mode structured output) through
Node's built-in `fetch` — no SDK and no new dependencies beyond the MCP SDK/zod every platform server
already uses. The same server is offered to Claude Code, Cursor and OpenCode through the shared registry.
No existing Gemini integration was present in the platform, so none was reused.

## 7. Troubleshooting

| Symptom | Check |
|---|---|
| Tools not visible in Claude | `gemini:status` says enabled? then rebuild + update the plugin and restart Claude Code (§1) |
| `unavailable … NO_KEY` | key not in the environment of the process that started Claude Code — store it with `gemini:setup --prompt-key` |
| `unavailable … AUTH` | key rejected or the Generative Language API is not enabled for it |
| `unavailable … BAD_RESPONSE` ("output was cut off") | raise `GEMINI_MAX_OUTPUT_TOKENS` or narrow the input |
| `unavailable … MODEL` | set `GEMINI_MODEL` to a model your key can list |
| `NO_ROOTS` / "outside allowed roots" | set `PROJECTS_DIR` or `GEMINI_ALLOWED_ROOTS` to the folders that may be read |
| `unavailable … QUOTA` | rate limit — wait, or use a key/project with more quota |
| Unsure whether the server starts | `GEMINI_ENABLED=true node shared/core/cli.js mcp:selftest` |
