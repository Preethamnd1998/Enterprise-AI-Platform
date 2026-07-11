# Mobile — Widget Instructions

> Also read: `mobile/flutter.md` before writing any widget.

---

## File Structure (feature-first, always)

```
lib/features/my_feature/
├── presentation/
│   ├── my_feature_screen.dart       ← top-level page widget (route target)
│   └── widgets/
│       └── my_feature_card.dart     ← smaller reusable widgets
├── my_feature_state.dart            ← Bloc state (or ChangeNotifier state)
├── my_feature_bloc.dart             ← Bloc / Cubit (or Provider)
└── my_feature_test.dart             ← widget test (in test/, mirrored path)
```

---

## Screen Widget Template

```dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'my_feature_bloc.dart';
import 'my_feature_state.dart';

class MyFeatureScreen extends StatelessWidget {
  const MyFeatureScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => MyFeatureBloc()..add(MyFeatureLoadRequested()),
      child: Scaffold(
        appBar: AppBar(title: const Text('My Feature')),
        body: BlocBuilder<MyFeatureBloc, MyFeatureState>(
          builder: (context, state) {
            if (state is MyFeatureLoading) {
              return const Center(child: CircularProgressIndicator());
            }
            if (state is MyFeatureError) {
              return Center(child: Text(state.message));
            }
            if (state is MyFeatureLoaded) {
              return _MyFeatureList(items: state.items);
            }
            return const SizedBox.shrink();
          },
        ),
      ),
    );
  }
}

class _MyFeatureList extends StatelessWidget {
  const _MyFeatureList({required this.items});

  final List<MyFeatureItem> items;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return ListTile(
          key: ValueKey(item.id),
          title: Text(item.name),
          trailing: _StatusChip(status: item.status),
        );
      },
    );
  }
}
```

---

## Stateful Widget Pattern (local UI state only — never business state)

```dart
class MyToggle extends StatefulWidget {
  const MyToggle({super.key, required this.onChanged});

  final ValueChanged<bool> onChanged;

  @override
  State<MyToggle> createState() => _MyToggleState();
}

class _MyToggleState extends State<MyToggle> {
  bool _value = false;

  @override
  void dispose() {
    // dispose controllers/subscriptions here
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Switch(
      value: _value,
      onChanged: (v) {
        setState(() => _value = v);
        widget.onChanged(v);
      },
    );
  }
}
```

---

## Status Chip / Tag Pattern

```dart
class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

  final String status;

  static const Map<String, Color> _colorMap = {
    'ACTIVE': Color(0xFF4CAF50),
    'INACTIVE': Color(0xFFE53935),
    'PENDING': Color(0xFFD35400),
  };

  @override
  Widget build(BuildContext context) {
    return Chip(
      label: Text(status),
      backgroundColor: _colorMap[status] ?? const Color(0xFF999999),
      labelStyle: const TextStyle(color: Colors.white),
    );
  }
}
```

---

## Rules

- Prefer `StatelessWidget` + Bloc/Provider for anything touching business/API state. `StatefulWidget` is for local, ephemeral UI state only (toggle, animation controller, text field focus).
- Every widget that can be `const` must be `const`.
- Always give list-item widgets a stable `key` (`ValueKey`/`ObjectKey`) — never rely on index alone when the list can reorder.
- All user-facing text goes through the project's i18n mechanism (`AppLocalizations.of(context)` or equivalent) — never hardcode strings shown to users.
- Loading / error / empty / success are explicit, separate branches — never a single widget silently assuming success.
- Split any `build()` method approaching 150 lines into private widget classes, not private methods that return `Widget` (private classes get `const` and correct rebuild scoping; methods do not).
