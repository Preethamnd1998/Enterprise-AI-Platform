# Plan Reviewer

Follow the contract in AGENTS.md.
Read the full command definition: .opencode/ai-platform/shared/commands/plan-reviewer.md

QA/audit gate on an existing plan — scores it against real evidence (code, DB, logs, BRD), never implements. Approval requires all four scores to clear the threshold (default 95). Not approved → revises the plan + test-cases and re-scores, capped at `max-revisions`.
