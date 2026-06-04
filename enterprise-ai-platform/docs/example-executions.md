# Example Executions (Week 2)

Each shows: MCP calls · context loaded · validation · expected output.

## /bug-fix redmine=12345
- MCP: `redmine_get_issue(12345)` → trace; `get_file_contents(OrderService.java, OrderController.java)`; `get_file_blame(OrderService:142)`. (3–4 read calls)
- Context: own-package trace frames + blame + depth-1 callee; lazy `backend/service.md` + `coding-standards.md`.
- Validation: completeness (applicable) + regression (order-place flow intact); changed files ⊆ frames.
- Output: root cause (e.g. null `customer` when CTA missing) · 1-file diff · both gates PASS · audit line. ~4–6k tokens.

## /planning redmine=54321
- MCP: `redmine_get_issue(54321)`; `search_repositories("Refund")`; `get_repository_tree(libs/refund, depth=1)`; `get_file_contents(signatures)`. (3 read calls)
- Context: requirements + Refund analog skeleton + `coding-standards.md` + touched-layer standards.
- Validation: plan-completeness (all layers enumerated); no code produced.
- Output: impact analysis · design · task breakdown · test strategy · audit line. <5s, ~6–10k tokens.

## /ui-redesign component=RefundPaymentComponent
- MCP: `get_file_contents(refund-payment.component.{ts,html,scss})` (+ optional chrome snapshot). (1 call)
- Context: the one component + screenshot image + `frontend/component.md`, `frontend/custom-components.md`. Depth-0.
- Validation: `redesign-checklist.md` — bindings/validations/permissions preserved; a11y improved; responsive verified.
- Output: analysis · proposal · HTML/CSS/TS diff · checklist PASS · audit line. ~4–8k tokens + image.

## /migration mode=exact mr=!5678 target=release/2.4
- MCP: `list_merge_request_changed_files(!5678)`; `get_merge_request_diffs(!5678)`; `get_file_contents(<touched files>@release/2.4)`. (3 read calls)
- Context: functional hunks (filter drops 1 import reorder) + target versions; lazy `migration/*`.
- Validation: completeness + regression + changed-set ⊆ {hunk files ∪ compile-deps}; signature-drift probe.
- Output: minimal patch (2 files) + any compile-deps + both gates PASS + audit line. ~6–12k tokens.

## /migration mode=functionality redmine=12345 target=release/2.4
- MCP: `redmine_get_issue(12345)` → `!8456`; `get_merge_request_diffs(!8456)`; bounded `get_file_contents` for capability closure + target delta checks. (≤10 calls)
- Context: seed symbols → closure along refs+conventions within boundary; migrate only missing/divergent vs target.
- Validation: `migration-checklist.md` + completeness + regression + target-compatibility (release).
- Output: capability set (e.g. entity + Flyway created; controller/service signature-checked) · per-layer report · gaps (if any) · audit line. ~15–40k tokens, bounded.
