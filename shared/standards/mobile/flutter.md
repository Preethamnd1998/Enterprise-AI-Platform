# Flutter Standards
<!-- Reclassified 2026-10-13: this file previously carried `name: flutter-skill` /
     `description:` frontmatter mimicking a SKILL.md, but it is a STANDARD (rules the agent
     must follow), is not under shared/skills/, and is not named SKILL.md, so it was never
     actually discoverable as a skill -- the frontmatter was inert decoration.
     See shared/reports/ for the full audit. -->


## STACK

- Flutter 3.x (stable channel)
- Dart 3.x (null-safety required)
- State management: Bloc (`flutter_bloc`) — Provider/Riverpod only if the project already uses it
- `go_router` for navigation
- `dio` (or project's existing HTTP client) for networking
- `freezed` + `json_serializable` for models/DTOs

## RULES

- preserve `const` constructors wherever possible
- avoid rebuilding whole widget trees — scope `BlocBuilder`/`Consumer` to the smallest subtree
- never block the UI thread — long work goes through `compute()` or an isolate
- preserve existing folder-by-feature structure (`lib/features/<feature>/...`)
- null-safety: no `!` bang operator without a preceding non-null check, no new API surface typed `dynamic`
- dispose all `TextEditingController` / `AnimationController` / `StreamSubscription` in `dispose()`
