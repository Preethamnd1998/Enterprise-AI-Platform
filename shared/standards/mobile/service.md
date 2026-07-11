# Mobile — Service / Repository Instructions

> Also read: `mobile/flutter.md`.

---

## Repository Template

Repositories are the bridge between Blocs/Providers and the HTTP client. Blocs never call the HTTP client directly.

```dart
import 'package:dio/dio.dart';
import 'my_feature_model.dart';

class MyFeatureRepository {
  MyFeatureRepository(this._dio);

  final Dio _dio;

  static const _basePath = '/api/my-feature';

  Future<List<MyFeatureItem>> getItems({int page = 1, int size = 15}) async {
    final response = await _dio.get(_basePath, queryParameters: {
      'pageNo': page,
      'noOfRecord': size,
    });
    return (response.data['data'] as List)
        .map((json) => MyFeatureItem.fromJson(json))
        .toList();
  }

  Future<MyFeatureItem> getById(int id) async {
    final response = await _dio.get('$_basePath/$id');
    return MyFeatureItem.fromJson(response.data['data']);
  }

  Future<MyFeatureItem> save(MyFeatureItem item) async {
    final response = await _dio.post(_basePath, data: item.toJson());
    return MyFeatureItem.fromJson(response.data['data']);
  }

  Future<void> delete(int id) async {
    await _dio.delete('$_basePath/$id');
  }
}
```

---

## Rules

- **Always use** a base path constant per repository — never hardcode API paths inline at the call site.
- Repositories must not import anything from `package:flutter/material.dart` — no UI concerns (no `BuildContext`, no `ScaffoldMessenger`) in the data layer.
- Repositories throw; they do not catch and swallow. Error mapping (network exception → user-facing message) happens in the Bloc/Cubit, not the repository.
- Register repositories via the project's existing DI mechanism (`get_it`, `Provider`, or constructor injection) — never instantiate `Dio`/repositories inline inside a widget's `build()`.
- Pagination parameters, sort keys, and filter keys are named constants (an `ApiConstants` class per feature), never magic strings.
- File upload: use `FormData` from `dio` — do not hand-encode multipart bodies.

---

## Error Handling

```dart
Future<void> _onLoadRequested(
  MyFeatureLoadRequested event,
  Emitter<MyFeatureState> emit,
) async {
  emit(MyFeatureLoading());
  try {
    final items = await _repository.getItems();
    emit(MyFeatureLoaded(items));
  } on DioException catch (e) {
    emit(MyFeatureError(_mapError(e)));
  }
}

String _mapError(DioException e) {
  if (e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout) {
    return 'Request timed out. Please try again.';
  }
  return e.response?.data?['message'] as String? ?? 'An error occurred.';
}
```

- Never let a raw `DioException`/stack trace reach the UI as display text.
- Log via the project's logger (e.g. `logger.e(...)`) — never `print()`/`debugPrint()` in production error paths beyond debug builds.
