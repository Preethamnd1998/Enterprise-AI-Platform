# Mobile — Models / DTO Instructions

> Also read: `mobile/flutter.md`.

---

## Model Template (`freezed` + `json_serializable`)

```dart
import 'package:freezed_annotation/freezed_annotation.dart';

part 'my_feature_item.freezed.dart';
part 'my_feature_item.g.dart';

@freezed
class MyFeatureItem with _$MyFeatureItem {
  const factory MyFeatureItem({
    required int id,
    required String name,
    required String status,
    DateTime? createdAt,
  }) = _MyFeatureItem;

  factory MyFeatureItem.fromJson(Map<String, dynamic> json) =>
      _$MyFeatureItemFromJson(json);
}
```

If the project does not use `freezed`, use a plain immutable class instead — never a mutable class with public setters for API models:

```dart
class MyFeatureItem {
  const MyFeatureItem({required this.id, required this.name, required this.status});

  final int id;
  final String name;
  final String status;

  factory MyFeatureItem.fromJson(Map<String, dynamic> json) => MyFeatureItem(
        id: json['id'] as int,
        name: json['name'] as String,
        status: json['status'] as String,
      );

  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'status': status};
}
```

---

## Rules

- Models are immutable (`final` fields, no setters). Never add a public setter to a model to work around an initialization order problem — fix the construction site instead.
- `*.g.dart` and `*.freezed.dart` are generated — never hand-edit them, never write tests against them directly, and never include them in a diff review as if hand-authored (see `standards/testing.md §8` generated-code exclusion).
- Split GET/POST shapes when the API request and response shapes diverge (`MyFeatureRequest` / `MyFeatureResponse`), mirroring the backend's DTO split — do not force one model to serve both directions when fields differ.
- Enums map to backend string/int constants explicitly (`@JsonValue('ACTIVE')`) — never rely on Dart enum name matching the wire value by coincidence.
- Nullability in a model must match the API contract: a field the backend can omit or send `null` must be nullable (`String?`), never defaulted silently to a sentinel value.
