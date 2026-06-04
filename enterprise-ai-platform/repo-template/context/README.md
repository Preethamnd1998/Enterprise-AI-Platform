# context/ — Agent Input Folder

Store your logs, specs, and design files in a folder **outside this repository**.
The agent reads `context.path` to find that folder — so git never tracks your content.

## First-time setup (do once per machine)

1. Create a folder anywhere outside the repo, e.g. `D:\AI-Context\`
1. Open `context/context.path` in this repo
1. Write the full path on the first non-comment line:

```text
D:\AI-Context\
```

1. Save. That's it — the setting is committed and reused every session.

## Usage

Say `context` in any prompt. The agent reads `context.path`, finds your folder, and reads every file in it:

```text
/bug-fix context
/new-development context
/ui-design-update component=WardManagement context
/data-correction context
```

## What to put in your external folder

Name files whatever you want. Supported formats: `.md` · `.txt` · `.html`

## Rules

- Clear files after each task — stale content leaks into the next task.
- Multiple files are fine — agent reads all in one pass.
- If `context.path` is blank, agent falls back to the `context/` folder inside this repo.
