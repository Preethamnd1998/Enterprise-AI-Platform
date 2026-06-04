# Prompt Guide — How to Talk to the AI

> One rule: **give the AI a pointer, not the content.**
> Use `redmine=`, `mr=`, or `context` instead of pasting 300 lines into chat.
> Fewer tokens = faster, cheaper, more accurate.

---

## First-time setup — context folder (do once per machine)

1. Create a folder **outside** any repo, e.g. `D:\AI-Context\`
1. Open `context/context.path` in this repo
1. Write the full absolute path on the first non-comment line and save:

```text
D:\AI-Context\
```

Done. Every agent in every repo will now look there when you say `context`.
Your logs and design files never enter git history.

---

## Quick-start patterns

| You have | Use this |
| -------- | -------- |
| Redmine ticket | `redmine=42391` |
| GitLab MR | `mr=!247` |
| Stack trace / log / spec / design file | drop in `context/` → say `context` |
| Specific file (any name) | `file=context/my-file.md` |
| Screenshot | attach the image directly to the chat message |
| Component name (UI) | `component=WardManagement` |

**`context` is the shorthand for the whole folder.** The agent lists it and reads every file — you don't need to know or type the filename.

---

## `/bug-fix`

```text
# Minimum — let Redmine drive everything
/bug-fix redmine=42391

# Files in context/ folder (any names)
/bug-fix context

# UI bug — name the component + context folder
/bug-fix component=WardManagement context

# Skip approval gate
/bug-fix redmine=42391 auto=true
```

> Tip: never paste the stack trace in the message — drop it in `context/` and say `context`.

---

## `/new-development`

```text
# From Redmine story
/new-development redmine=41800

# Free text (keep it one sentence)
/new-development "Add bulk discharge for ward patients"

# Files in context/ folder (spec, design HTML, anything)
/new-development context

# Redmine + extra design files in context/
/new-development redmine=41800 context
```

> Tip: for complex features, fill in a file in `context/` first — it saves a round-trip Q&A.

---

## `/migration`

```text
# Cherry-pick / hotfix / backport (smallest patch)
/migration mode=exact mr=!247 target=release/v2.5

# Feature port / cross-version (full capability)
/migration mode=functionality redmine=41800 target=main

# From a commit
/migration mode=exact commit=abc1234 target=main

# Skip approval
/migration mode=exact mr=!247 target=release/v2.5 auto=true
```

> Rule of thumb: `mode=exact` for hotfixes · `mode=functionality` for feature ports.

---

## `/ui-design-update`

The command auto-detects the task type — you don't have to specify "bug" or "new component".

```text
# Bug fix — name the component, put log in context/
/ui-design-update component=WardManagement context

# New component — put spec in context/
/ui-design-update context

# Design update — put designer HTML in context/
/ui-design-update component=WardManagement context

# Shorthand (Format B) — module · component-folder · component-name
/ui-design-update inpatient ward-management ward-management
```

**How to specify the component:**

| You know | Write |
| -------- | ----- |
| Component display name | `component=WardManagement` |
| Folder path (UI repo) | `d:\GitLab Workspace\UI\Core\Clinical\src\app\inpatient\ward-management\` |
| Module + folder + name | `/ui-design-update inpatient ward-management ward-management` |
| Only the feature area | Just describe it: `/ui-design-update "fix the ward bed grid layout"` |

---

## `/data-correction`

```text
# From Redmine ticket
/data-correction redmine=42500

# Free text
/data-correction "Patient bills show wrong totals after v2.5 upgrade"

# Specific table + record
/data-correction table=patient_bill id=123456

# With extra context in context/ folder
/data-correction context
```

> Note: `auto=true` does NOT auto-execute scripts. Scripts are always shown for manual review.

---

## Session Mode vs Direct Mode

```text
/bug-fix                    ← Session Mode: multiple bugs, type "done" to finish
/bug-fix redmine=42391      ← Direct Mode: one task, then done
```

Use **Session Mode** when you have several related tasks — standards load once, saving tokens.

---

## BE vs UI — how to tell the AI which layer

| Your task is in | Add this to the prompt |
| --------------- | ---------------------- |
| Backend (Java/Spring) | nothing — stack trace or Redmine links to BE files automatically |
| Frontend (Angular) | `component=<Name>` or use Format B |
| Both layers | `component=WardManagement redmine=42391` |

> If the AI guesses the wrong layer, just say `"this is a BE task"` or `"this is a UI task"` at the start.

---

## context/ folder — quick reference

```text
context/
├── (any name).md    ← stack traces, specs, notes
├── (any name).html  ← designer HTML mockups
└── (any name).txt   ← any plain text input
```

Say `context` in any prompt — the agent reads all files it finds.

**After each task:** clear the files so stale content doesn't leak into the next task.

---

## What NOT to paste in chat

| Don't paste | Do this instead |
| ----------- | --------------- |
| Full stack trace (>20 lines) | drop in `context/` → say `context` |
| Full feature spec | drop in `context/` → say `context` |
| Designer HTML | drop in `context/` → say `context` |
| Long Redmine description | `redmine=<id>` — the AI fetches it |
| Full MR diff | `mr=!<n>` — the AI fetches it |

Paste in chat only: one-line descriptions, component names, record IDs, short clarifications.
