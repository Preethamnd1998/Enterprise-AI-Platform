#!/usr/bin/env node
// eap — platform CLI (client-independent). Dry-run by default for anything
// that writes outside this repo's dist/. Usage: node shared/core/cli.js <cmd> [opts]
//   platform:doctor | mcp:doctor | mcp:selftest
//   platform:install [--apply] [--with-cortex]
//   plugin:build [client|all]
//   plugin:install|update|uninstall <client|all> [--apply] [--config-root <dir>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContext, describePlatform } from "./path-resolver/index.js";
import { planRuntime, runRuntime, diagnose } from "./runtime-manager/index.js";
import { loadRegistry, validateRegistry } from "./mcp-registry/index.js";
import {
  buildPlugins, planInstall, applyInstall, planUninstall, applyUninstall, selectClients,
} from "./plugin-manager/index.js";
import { selftest } from "./selftest.js";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i > -1 ? argv[i + 1] : null; };
const positional = argv.slice(1).filter((a, i, arr) => !a.startsWith("--") && !(arr[i - 1] ?? "").startsWith("--config-root"));
const ctx = createContext();
const icon = { ok: "PASS", warn: "WARN", fail: "FAIL", skip: "skip", "dry-run": "dry ", blocked: "BLOCK", manual: "MANUAL" };

function printChecks(checks) {
  for (const c of checks) console.log(`[${icon[c.status] ?? c.status}] ${c.name}: ${c.detail}`);
  return checks.some((c) => c.status === "fail") ? 1 : 0;
}

async function main() {
  switch (cmd) {
    case "platform:doctor": {
      console.log(JSON.stringify(describePlatform(ctx)));
      return printChecks(diagnose(ctx));
    }
    case "mcp:doctor": {
      const reg = loadRegistry(ctx);
      const errs = validateRegistry(reg, ctx);
      return printChecks([
        { name: "registry", status: errs.length ? "fail" : "ok", detail: errs.length ? errs.join("; ") : "valid" },
        ...diagnose(ctx).filter((c) => /python|code-cortex|knowledge|npm|PROJECTS/.test(c.name)),
      ]);
    }
    case "mcp:selftest":
      return printChecks(await selftest(ctx));
    case "platform:install": {
      const apply = flag("apply");
      const report = runRuntime(ctx, planRuntime(ctx, { withCortex: flag("with-cortex") }), { apply, withCortex: flag("with-cortex") });
      for (const r of report) console.log(`[${icon[r.status] ?? r.status}] ${r.id}: ${r.detail}`);
      if (!apply) console.log("\n(dry-run — rerun with --apply to execute)");
      return report.some((r) => r.status === "fail") ? 1 : 0;
    }
    case "plugin:build": {
      const built = buildPlugins(ctx, { clients: selectClients(positional[0]), preferPlugin: flag("prefer-plugin"), withHooks: flag("with-hooks") });
      for (const [c, b] of Object.entries(built)) console.log(`built ${c} v${b.version} -> ${b.root}`);
      return 0;
    }
    case "plugin:install":
    case "plugin:update":
    case "plugin:uninstall": {
      const clients = selectClients(positional[0]);
      const apply = flag("apply");
      const configRootArg = opt("config-root");
      const configRoot = configRootArg ? path.resolve(configRootArg) : null;
      const uninstall = cmd === "plugin:uninstall";
      const built = uninstall ? null : buildPlugins(ctx, { clients, configRoot, preferPlugin: flag("prefer-plugin"), withHooks: flag("with-hooks"), outDir: configRoot ? path.join(os.tmpdir(), "eap-dist-" + process.pid) : undefined });
      for (const c of clients) {
        const plan = uninstall ? planUninstall(c, ctx, { configRoot }) : planInstall(c, ctx, built, { configRoot });
        (uninstall ? applyUninstall : applyInstall)(plan, { apply });
        const tally = {};
        for (const o of plan.ops ?? []) tally[o.action] = (tally[o.action] ?? 0) + 1;
        console.log(`\n== ${c} ${uninstall ? "uninstall" : `v${plan.version}`}${apply ? "" : "  [DRY-RUN]"}`);
        if (plan.target) console.log(`target       : ${plan.target}`);
        if (plan.ops?.length) {
          const cat = {};
          for (const o of plan.ops) { const k = o.rel.split("/")[0]; cat[k] = (cat[k] ?? 0) + 1; }
          console.log(`files        : ${JSON.stringify(tally)}  by dir ${JSON.stringify(cat)}`);
          const bk = plan.ops.filter((o) => o.action === "backup+overwrite");
          console.log(`backups      : ${bk.length ? bk.map((o) => `${o.dst}.eap-backup-<ts>`).join("\n               ") : "none needed (nothing existing is overwritten)"}`);
        }
        if (plan.existingConfig) {
          const ex = plan.existingConfig;
          console.log(`preserved    : ${ex.file ?? "-"} untouched; existing MCP entries kept: ${ex.entries.map((e) => e.id + (e.stale ? "(stale)" : "")).join(", ") || "none"}`);
        }
        if (plan.mcpEntries) console.log(`mcp from pkg : ${plan.mcpEntries.join(", ") || "none"}`);
        if (plan.preserved?.length) console.log(`not added    : ${plan.preserved.join(", ")} (already at user scope)`);
        console.log(`duplicates   : ${(plan.duplicates ?? plan.preserved ?? []).join(", ") || "none"}`);
        if (plan.note) console.log(`config edits : ${plan.note}`);
        for (const m of plan.manual ?? []) console.log(`run          : ${m}`);
        for (const w of plan.warnings ?? []) console.log(`WARN         : ${w}`);
        if (!uninstall) {
          const u = c === "claude-code" ? "claude plugin uninstall enterprise-ai-platform@eap-local && claude plugin marketplace remove eap-local" : `npm run plugin:uninstall -- ${c} --apply   (removes only files recorded in ${".eap-install.json"}; user-modified files and *.eap-backup-* kept)`;
          console.log(`rollback     : ${u}`);
        }
      }
      if (!apply) console.log("\n(dry-run — nothing written; add --apply to execute)");
      return 0;
    }
    default:
      console.error("commands: platform:doctor mcp:doctor mcp:selftest platform:install plugin:build plugin:install plugin:update plugin:uninstall");
      return 2;
  }
}

main().then((code) => process.exit(code), (e) => { console.error(e.message); process.exit(1); });
