# Mobile — Routing Instructions

> Also read: `mobile/flutter.md`.

Default: **`go_router`**. If the project already uses `Navigator` 1.0 named routes exclusively, follow the existing pattern instead — never introduce a second routing library into a project.

---

## Route Declaration

```dart
final router = GoRouter(
  routes: [
    GoRoute(
      path: '/my-feature',
      name: 'myFeature',
      builder: (context, state) => const MyFeatureScreen(),
      routes: [
        GoRoute(
          path: ':id',
          name: 'myFeatureDetail',
          builder: (context, state) =>
              MyFeatureDetailScreen(id: state.pathParameters['id']!),
        ),
      ],
    ),
  ],
);
```

## Navigation Calls

```dart
context.goNamed('myFeature');
context.goNamed('myFeatureDetail', pathParameters: {'id': item.id.toString()});
context.pop();
```

---

## Rules

- Route paths and names are declared in one central router file per app/module — never scattered `GoRoute` declarations inside feature widgets.
- Use `goNamed`/`pushNamed` with named routes — never hardcode path strings at the call site (`context.go('/my-feature/42')`).
- Route guards (auth/permission checks) live in the router's `redirect` callback, not inside individual screen widgets.
- Deep-link parameters are validated before use — never trust `state.pathParameters`/`state.uri.queryParameters` without a null/format check.
- Preserve existing route names and paths when modifying a route — renaming a route is a breaking change to deep links and must be flagged as a regression risk (contract §8).
