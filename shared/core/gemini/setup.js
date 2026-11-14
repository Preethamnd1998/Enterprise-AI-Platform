// gemini:setup / gemini:status — the optional-feature switch. Disabled by default; nothing in
// the platform changes until a user runs `gemini:setup`. Never prints the key.
import {
  detectKey, envFilePath, geminiStatus, saveKey, forgetKey, setSetting, isGitIgnored, promptHidden, checkApi, candidateModels, normalizeKeyInput, explainKeyProblem, DEFAULT_MODEL,
} from "./index.js";
import { loadSettings } from "../path-resolver/index.js";

const NEXT_STEPS = (apply) => [
  "next:",
  "  node shared/core/cli.js platform:install --apply     # installs the server's npm dependencies",
  "  node shared/core/cli.js plugin:install claude-code --apply   # rebuild: adds the server + delegation skill",
  "  claude plugin update enterprise-ai-platform@eap-local        # then restart Claude Code",
  ...(apply ? [] : ["(dry-run: nothing was written)"]),
];

export function printStatus(ctx, log = console.log) {
  const s = geminiStatus(ctx);
  log(`gemini integration : ${s.enabled ? "ENABLED" : "disabled (default)"}`);
  log(`api key            : ${s.keyDescription}${s.keySource ? ` — from ${s.keySource.startsWith("file:") ? "env file" : s.keySource}` : ""}`);
  log(`model              : ${s.model}`);
  log(`key file           : ${s.envFile}${s.envFileExists ? "" : " (not created)"}`);
  log(`allowed roots      : ${s.allowedRoots.join(", ") || "none — file/diff tools will refuse until PROJECTS_DIR or GEMINI_ALLOWED_ROOTS is set"}`);
  return s;
}

// opts: { disable, forceEnable, forgetKey, promptKey, storeKey, check, apply(default true) }
// deps (tests): { prompt, check, log }
export async function runSetup(ctx, opts = {}, deps = {}) {
  const log = deps.log ?? console.log;
  const prompt = deps.prompt ?? promptHidden;
  const check = deps.check ?? checkApi;
  const pick = deps.pick ?? candidateModels;
  const interactive = deps.interactive ?? !!process.stdin.isTTY;
  const apply = opts.apply !== false;
  const settings = loadSettings(ctx);
  const file = envFilePath(ctx, settings);

  if (opts.disable) {
    if (apply) { setSetting(ctx, "GEMINI_ENABLED", "false"); if (opts.forgetKey) forgetKey(file); }
    log("gemini integration disabled — the platform runs Claude-only, exactly as before.");
    if (opts.forgetKey) log(`stored key removed from ${file}`);
    for (const l of NEXT_STEPS(apply).slice(0, 1)) log(l);
    log("  node shared/core/cli.js plugin:install claude-code --apply   # rebuild without the server, then restart Claude Code");
    return { enabled: false, code: 0 };
  }

  let det = detectKey(ctx, { settings });
  if (det.key) {
    log(`API key found (${det.source.startsWith("file:") ? "env file" : det.source}; not displayed).`);
    if (det.source.startsWith("env:")) log("  note: an environment variable is only visible to processes started from that shell; to make the key independent of the shell, re-run with --prompt-key to store it in the gitignored env file.");
  }
  if (det.key && opts.storeKey && det.source.startsWith("env:")) {
    const clean = normalizeKeyInput(det.key);
    try {
      if (apply) saveKey(file, clean);
      det = { key: clean, source: `file:${file}` };
      log(`key stored in ${file} (owner-only permissions).`);
      if (isGitIgnored(ctx, file) === false) log(`WARNING: ${file} is inside a git checkout and NOT ignored — add it to .gitignore before committing anything.`);
    } catch (e) { log(`not stored: ${e.message}`); return { enabled: false, code: 1 }; }
  }
  if (!det.key || opts.promptKey) {
    if (!interactive && !det.key) {
      log("No GEMINI_API_KEY / GOOGLE_API_KEY found and this is not an interactive terminal.");
      log("Run `node shared/core/cli.js gemini:setup` in your own terminal to enter the key without echo (never paste it into a chat),");
      log(`or export GEMINI_API_KEY, or add GEMINI_API_KEY=… to ${file}.`);
      if (!opts.forceEnable) return { enabled: false, code: 2, reason: "no key" };
    } else if (interactive && (opts.promptKey || !det.key)) {
      let key;
      try { key = normalizeKeyInput(await prompt("Enter your Gemini API key (input is hidden; paste it, then press Enter; leave empty to skip): ")); } catch (e) { log(`cancelled (${e.message})`); return { enabled: false, code: 130 }; }
      if (key) log(`received ${key.length} characters.`);
      if (key) {
        try {
          if (apply) saveKey(file, key);
          det = { key, source: `file:${file}` };
          log(`key saved to ${file} (owner-only permissions).`);
          const ignored = isGitIgnored(ctx, file);
          if (ignored === false) log(`WARNING: ${file} is inside a git checkout and NOT ignored — add it to .gitignore before committing anything.`);
        } catch (e) {
          log(`not saved: ${e.message}`);
          log("  tip: copy only the key (no quotes or spaces). If pasting into the hidden prompt keeps failing, use the shell instead:");
          log("       read -s GEMINI_API_KEY; export GEMINI_API_KEY; node shared/core/cli.js gemini:setup --store-key");
          return { enabled: false, code: 1 };
        }
      } else if (!det.key && !opts.forceEnable) {
        log("no key entered — integration stays disabled.");
        return { enabled: false, code: 0 };
      }
    }
  }

  if (det.key && (opts.check || interactive)) {
    let model = settings.GEMINI_MODEL || DEFAULT_MODEL;
    log(`checking "${model}" with a real request (Google can take 20–60 s to answer)…`);
    let r = await check({ key: det.key, model });
    if (!r.ok && r.code === "MODEL") {
      // the configured/default model is retired or not offered to this key: find one that works
      const names = [r.suggestion, ...(await pick({ key: det.key }))].filter((n, i, a) => n && a.indexOf(n) === i && n !== model).slice(0, 3);
      for (const n of names) {
        log(`trying "${n}"…`);
        const probe = await check({ key: det.key, model: n });
        if (probe.ok) {
          log(`model "${model}" is not available to your key; using "${n}" instead${apply ? " (saved as GEMINI_MODEL in paths.local.env)" : ""}.`);
          if (apply) setSetting(ctx, "GEMINI_MODEL", n);
          model = n; r = probe;
          break;
        }
      }
    }
    if (r.ok) log(`API check: OK (real request, model ${model})`);
    else log(`API check: ${r.code} — ${r.reason}`);
    if (!r.ok && r.code === "AUTH") { log("the key was not accepted — fix it and re-run; integration stays disabled."); return { enabled: false, code: 3 }; }
    if (!r.ok && (r.code === "UNAVAILABLE" || r.code === "QUOTA" || r.code === "NETWORK")) log("the key was not rejected, but Google is slow, busy or limiting requests right now — enabling anyway; tool calls wait up to 120 s (GEMINI_TIMEOUT_MS) and 429/5xx are retried.");
    if (!r.ok && r.code === "MODEL") log(`no working model found automatically — set GEMINI_MODEL in paths.local.env to a model your key can use.`);
  }

  if (apply) setSetting(ctx, "GEMINI_ENABLED", "true");
  log(`gemini integration ${apply ? "ENABLED" : "would be enabled"}${det.key ? "" : " (no key yet — tools will report 'unavailable' and Claude continues without Gemini)"}.`);
  for (const l of NEXT_STEPS(apply)) log(l);
  return { enabled: true, code: 0, keyConfigured: !!det.key };
}
