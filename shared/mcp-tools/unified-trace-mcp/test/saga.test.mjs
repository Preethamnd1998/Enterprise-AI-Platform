// Integration tests for the `saga` tool against the REAL local indexes
// (Knowledge Generator db + Code Cortex projects built by install/bootstrap.sh).
// Not unit tests: they assert well-known, structural facts of this workspace
// (a handler exists, a Kafka topic has consumers, a Feign proxy resolves), so a
// failure means the tool regressed OR the workspace/indexes changed — read the
// failing render before assuming which.
//
//   node --test test/saga.test.mjs          (needs both indexes; ~1-2 min)
import { test } from "node:test";
import assert from "node:assert/strict";
import { callTool } from "./run-tool.mjs";
import { kgCall } from "./kg-client.mjs";

// UI narrowing has a wall-clock budget (60s default) that makes results load-dependent. Tests use a
// generous one so they measure correctness, and FAIL LOUDLY if narrowing still timed out — an
// incomplete result is never accepted as a pass.
process.env.UT_SAGA_UI_NARROW_BUDGET_MS ||= "300000";
const saga = async (args) => {
  const out = await callTool("saga", args);
  assert.ok(!out.metadata?.ui_narrowing?.timed_out, `UI narrowing hit its ${out.metadata?.ui_narrowing?.budget_ms}ms budget — result is partial: ${JSON.stringify(out.metadata?.ui_narrowing)}`);
  assert.ok(!out.metadata?.ui_lookup_failed, `UI trigger lookup failed — result is incomplete: ${(out.gaps || []).filter((g) => /lookup FAILED/.test(g)).join(" | ")}`);
  return out;
};
const has = (out, text, msg) => assert.ok(out.render.includes(text), `${msg || text}\n--- render ---\n${out.render.slice(0, 2500)}`);

test("gateway URL -> every handler on the path (same path, different HTTP methods), Mongo persistence reached", async () => {
  const out = await saga({
    target: "https://canary-dev.lifetrenz.com/api-gateway/ipd-clinical/settings/6a4baa3aef71725715121e7c",
    include_ui: false,
  });
  has(out, "PUT /settings/{id}");
  has(out, "DELETE /settings/{id}");
  has(out, "(stub→interface→impl)", "interface->impl dispatch followed");
  // Source-verified (SettingsServiceImpl.updateSettingEvent): settingsRepository.findById + .save — nothing else.
  assert.deepEqual(out.summary.db_writes, ["settings (mongo)"], JSON.stringify(out.summary));
  assert.deepEqual(out.summary.kafka_topics_published, [], "settings update publishes nothing");
  // Regression guards: Code Cortex name-collision edges once produced an api_audit_log write (AuditService.save),
  // a form_event read (FormService.findById) and a self-bound getGeneralSettings() branch. None exist in the source.
  for (const bogus of ["api_audit_log (mongo)", "form_event (mongo)"]) {
    assert.ok(!out.summary.db_writes.includes(bogus) && !out.summary.db_reads.includes(bogus), `false branch reappeared: ${bogus}`);
  }
  assert.ok(!out.render.includes("getGeneralSettings"), "a DTO accessor must not be bound to the class's own method");
});

test("explicit method + service disambiguates to one handler", async () => {
  const out = await saga({ target: "PUT /settings/{id}", service: "BE/ipd-clinical-service", include_ui: false });
  has(out, "SettingsController.updateSettings");
  assert.ok(!out.render.includes("deleteDoctorDiscount"));
});

test("API -> Kafka publish -> consumers in other services -> DB, with exact UI trigger", async () => {
  const out = await saga({ target: "POST /add/organization/item/exclusion", service: "BE/core-service", max_service_hops: 1 });
  has(out, "(click) → addConfigureItemExclusion", "UI click handler narrowed to the real action");
  has(out, "route: /configure-exclusion");
  has(out, "⇒ KAFKA topic LT_CORE_CONFIG_EVENTS");
  assert.ok(out.summary.db_writes.includes("organization_item_exclusion (jpa)"), JSON.stringify(out.summary));
  assert.ok(out.summary.services_touched.length >= 3, "consumers in several services: " + out.summary.services_touched);
});

test("Kafka topic entry -> publishers listed once, consumers walked in each service", async () => {
  const out = await saga({ target: "LT_CORE_CONFIG_EVENTS", max_service_hops: 1 });
  has(out, "published by BE/core-service");
  assert.equal(out.render.split("published by BE/core-service: OrganizationMgmtServiceImpl").length - 1, 1, "publishers printed once, not per consumer");
  assert.ok(out.summary.db_writes.some((w) => w.includes("serial_number")), JSON.stringify(out.summary));
  assert.ok(!out.summary.db_writes.some((w) => w.startsWith("public ")), "schema name must never be reported as a table");
});

test("backend symbol -> Feign hop resolved into the target service and followed", async () => {
  const out = await saga({ target: "PatientEncounterChecklistServiceImpl.getAdmissionChecklist", max_service_hops: 2, depth: 5, include_ui: false });
  has(out, "⇒ FEIGN GET /patient/{patientId}/personal/details → BE/core-service");
  has(out, "PatientController.getPatient", "walk continues inside core-service");
  assert.ok(out.summary.services_touched.includes("BE/core-service"));
});

test("UI API constant -> endpoint -> backend", async () => {
  const out = await saga({ target: "MastersApiConstant.ADD_ORGANIZATION_ITEM_EXCLUSION", service: undefined, max_service_hops: 0, include_ui: false });
  has(out, "POST /add/organization/item/exclusion");
  has(out, "OrganizationController.confirmOrganizationExclusion");
});

test("unknown target -> a named gap, never a crash or an invented hop", async () => {
  const out = await saga({ target: "/definitely/not/a/real/endpoint/12345", include_ui: false });
  assert.equal(out.render, "");
  assert.ok(out.gaps.some((g) => /Entry/i.test(g)), JSON.stringify(out.gaps));
});

test("service not indexed -> hop reported as a gap with its reason", async () => {
  // appointment-service is a real Feign target that isn't checked out locally.
  const out = await saga({ target: "POST /cancel/appt", include_ui: false });
  assert.ok(out.gaps.length > 0);
  assert.equal(out.summary.db_writes.length, 0);
});

test("auto-follow-up-rules: KG typed DI calls fill the GET, and Code Cortex's name-collision edges are rejected on the POST", async () => {
  const out = await saga({ target: "https://canary-dev.lifetrenz.com/api-gateway/core/auto-follow-up-rules", include_ui: false, max_service_hops: 0 });
  // GET: Code Cortex only offered a 0.33 name match; the KG's typed edge (field type) reaches the repository.
  has(out, "AutoFollowUpRuleRepository.getAutoFollowUpRule");
  has(out, "(DI-typed call, KG)");
  // POST: the real chain — and none of the unrelated same-named methods Code Cortex bound by name.
  assert.ok(out.summary.db_writes.includes("auto_follow_up_rule (jpa)"), JSON.stringify(out.summary));
  assert.ok(out.summary.db_writes.includes("message_event (jpa)"), JSON.stringify(out.summary));
  for (const bogus of ["pincode_city_mapping (sql)", "system_master (sql)", "auth_required_list_templates (jpa)"]) {
    assert.ok(!out.summary.db_writes.includes(bogus), `false branch reappeared: ${bogus}`);
  }
  assert.ok(!out.render.includes("CustomerClinicalCodeSetValueController"), "a controller must never be reached from a service");
  assert.ok(out.metadata.call_edges_rejected_by_kg > 0, "the KG cross-check should have rejected some edges");
});

test("shared Kafka topic: publisher resolved through the enum constant, multi-consumer hops are annotated and output is capped", async () => {
  const out = await saga({ target: "POST /auto-follow-up-rules", service: "BE/core-service", include_ui: false, max_service_hops: 1, max_lines: 60 });
  has(out, "⇒ KAFKA topic LT_IPD_EVENTS", "KafkaTopics.LT_IPD_EVENTS.toString() must resolve to the constant, not 'toString()'");
  has(out, "consumers on this topic; each may branch on the event payload");
  assert.ok(out.render.split("\n").length <= 62, "render must respect max_lines");
  assert.ok(out.render.includes("more line(s) not shown"));
  assert.ok(!out.render.includes("_id (mongo)"), "a query field literal must never be reported as a collection");
});

// Auto Follow-Up Rules, CURRENT workflow (the standalone /auto-follow-up-rules/add page was functionally
// migrated; its route was removed by an unrelated commit): rule CREATE/EDIT is a dialog in
// AutoFollowUpRulesComponent, rule ASSIGNMENT is a separate screen (ApplyFollowupRulesComponent, showAssignView)
// on a different endpoint/service. AutoFollowUpRulesAddComponent is legacy and is deliberately not asserted.
const componentBlock = (render, component, routeFragment) => {
  const lines = render.split("\n");
  const start = lines.findIndex((l) => l.includes(`• ${component} `) && l.includes(routeFragment));
  assert.ok(start >= 0, `${component} with route ${routeFragment} not found\n${render.slice(0, 2500)}`);
  const end = lines.findIndex((l, i) => i > start && /^\s+(•|UI )/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
};

test("UI stage (rule CREATE): a URL kept in a non-*ApiConstant class (SystemSettingsConstant) is linked to its component, route and the dialog's save click", async () => {
  const out = await saga({ target: "POST /auto-follow-up-rules", service: "BE/core-service", max_service_hops: 0, max_lines: 60 });
  has(out, "SystemSettingsConstant.AUTO_FOLLOW_UP_RULES_POST_GET");
  const list = componentBlock(out.render, "AutoFollowUpRulesComponent", "route: /front-desk-management-settings/auto-follow-up-rules");
  // The create dialog's footer button (html:900) and the edit dialog's (html:519) both call save().
  assert.match(list, /\(buttonClickEvent\) → save {2}\[auto-follow-up-rules\.component\.html:900\]/, "create-dialog save handler");
  assert.match(list, /\(buttonClickEvent\) → save {2}\[auto-follow-up-rules\.component\.html:519\]/, "edit-dialog save handler");
  // Creation and assignment are different operations on different endpoints.
  assert.ok(!out.render.includes("IPD_FOLLOW_UP_RULE_ASSIGNMENT"), "rule creation trace must not pull in the assignment API");
  assert.ok(!out.render.includes("ApplyFollowupRulesComponent"), "assignment screen is not part of rule creation");
  // The obsolete Add route must not be expected (or resolved) anywhere.
  assert.ok(!/route: \/[^\n]*auto-follow-up-rules\/add/.test(out.render), "no component may resolve to the removed /auto-follow-up-rules/add route");
});

test("UI stage (rule CREATE): the 'Create New Rule' button opens the dialog — template event openAddRuleCard() belongs to AutoFollowUpRulesComponent", async () => {
  const ev = await kgCall("find_template_events", { handler: "openAddRuleCard", component: "AutoFollowUpRulesComponent" });
  // The class exists in two screens (appointment-settings, system-settings); each project label of the
  // nested settings checkout (settings, settings/settings) repeats them, so compare distinct files.
  const files = [...new Set(ev.results.map((r) => r.file))].sort();
  assert.deepEqual(files, [
    "src/lib/module/appointment-settings/auto-follow-up-rules/auto-follow-up-rules.component.html",
    "src/lib/module/system-settings/auto-follow-up-rules/auto-follow-up-rules.component.html",
  ]);
  for (const r of ev.results) {
    assert.deepEqual([r.event_name, r.handler_expression, r.component_name, r.line], ["click", "openAddRuleCard()", "AutoFollowUpRulesComponent", 32]);
  }
  // openAddRuleCard only toggles the dialog (no API call): the API-calling click is the dialog's save(), asserted above.
});

test("UI stage (rule ASSIGNMENT): IPD_FOLLOW_UP_RULE_ASSIGNMENT is linked to ApplyFollowupRulesComponent, its route and the 'Save Assignment' click", async () => {
  const out = await saga({ target: "POST /followup-rule/assignment", service: "BE/ipd-service", max_service_hops: 0, max_lines: 60 });
  has(out, "IpdAutoFollowUpRuleAssignmentController.saveOrUpdateAssignment");
  has(out, "SystemSettingsConstant.IPD_FOLLOW_UP_RULE_ASSIGNMENT");
  const apply = componentBlock(out.render, "ApplyFollowupRulesComponent", "route: /front-desk-management-settings/apply-follow-up-rules");
  assert.match(apply, /\(click\) → onAssignmentSaved {2}\[apply-followup-rules\.component\.html:468\]/, "Save Assignment handler (showAssignView form)");
  // Assignment is served by ipd-service, creation by core-service, and the two UI components do not overlap.
  assert.deepEqual(out.summary.services_touched, ["BE/ipd-service"], JSON.stringify(out.summary));
  assert.ok(!/•\s+AutoFollowUpRulesComponent\b/.test(out.render.split("IPD_FOLLOW_UP_RULE_ASSIGNMENT_DELETE")[0]), "rule list/dialog component is not an assignment trigger");
  assert.ok(!out.render.includes("SystemSettingsConstant.AUTO_FOLLOW_UP_RULES_POST_GET"), "assignment trace must not include the rule-creation API");
  assert.ok(!/route: \/[^\n]*auto-follow-up-rules\/add/.test(out.render));
});

test("UI stage (rule ASSIGNMENT): the assign view is opened by showAssignmentView() and saved by onAssignmentSaved() in ApplyFollowupRulesComponent", async () => {
  for (const handler of ["showAssignmentView", "onAssignmentSaved"]) {
    const ev = await kgCall("find_template_events", { handler, component: "ApplyFollowupRulesComponent" });
    assert.ok(ev.results.some((r) => r.component_name === "ApplyFollowupRulesComponent" && r.handler_expression === `${handler}()` && r.file.endsWith("apply-followup-rules.component.html")), `${handler}: ${JSON.stringify(ev.results.map((r) => r.handler_expression))}`);
  }
});

test("constant + literal suffix: the UI call built as `${BASE}/unread-count` is found, and the {messageId} wildcard is NOT a second entry", async () => {
  const out = await saga({
    target: "https://canary-dev.lifetrenz.com/api-gateway/supplementary/chat/message/unread-count?siteId=3",
    max_service_hops: 0,
  });
  has(out, "GET /chat/message/unread-count");
  assert.equal(out.metadata.entries, 1, "Spring routes to the literal mapping only");
  assert.ok(!out.render.includes("/chat/message/{messageId}"), "wildcard mapping must not appear as an entry");
  has(out, "ChatApiConstant.GET_CHAT_MESSAGES_BASE + /unread-count", "derived UI constant");
  // Source-verified: ChatApiService.getUnreadCounts <- MqttChatComponent.onResult (a callback, not a template click).
  has(out, "MqttChatComponent");
  has(out, "calls it in: onResult");
  assert.deepEqual(out.summary.db_reads, ["message_read_receipt (jpa)"], JSON.stringify(out.summary));
  assert.deepEqual(out.summary.db_writes, []);
});

test("Mongo collections resolve for a @Document-less class and a helper handed the template; unresolved accesses never appear as a 'null' table", async () => {
  const out = await saga({ target: "GET /conductq/get", service: "BE/clinical-common-service", include_ui: false, max_service_hops: 0 });
  // Source-verified (NonotConductingServiceImpl.getNonOTConductQ): readMongoTemplate.count(q, ClinicalSchedule.class) and
  // CSAppUtil.boundedFind(readMongoTemplate, q, ClinicalSchedule|ConductingAdmissionDashBoardEvent) — reads only.
  assert.deepEqual(out.summary.db_reads.sort(), ["ccs_admission_dashboard (mongo)", "ccs_clinical_schedule (mongo)"], JSON.stringify(out.summary));
  assert.deepEqual(out.summary.db_writes, []);
  assert.ok(!out.render.includes("null ("), "an unresolved collection must not be rendered as a table named 'null'");
  assert.equal(out.summary.db_unresolved, undefined, JSON.stringify(out.summary));
});
