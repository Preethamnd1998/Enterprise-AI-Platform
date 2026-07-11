# Mobile — State Management Instructions

> Also read: `mobile/flutter.md`, `mobile/service.md`.

Default: **Bloc** (`flutter_bloc`). If the project already uses Provider or Riverpod exclusively, follow the existing pattern instead — never introduce a second state-management library into a project.

---

## Bloc/Cubit Template

```dart
// my_feature_event.dart
sealed class MyFeatureEvent {}

class MyFeatureLoadRequested extends MyFeatureEvent {}

class MyFeatureSaveRequested extends MyFeatureEvent {
  MyFeatureSaveRequested(this.item);
  final MyFeatureItem item;
}

// my_feature_state.dart
sealed class MyFeatureState {}

class MyFeatureInitial extends MyFeatureState {}
class MyFeatureLoading extends MyFeatureState {}
class MyFeatureLoaded extends MyFeatureState {
  MyFeatureLoaded(this.items);
  final List<MyFeatureItem> items;
}
class MyFeatureError extends MyFeatureState {
  MyFeatureError(this.message);
  final String message;
}

// my_feature_bloc.dart
class MyFeatureBloc extends Bloc<MyFeatureEvent, MyFeatureState> {
  MyFeatureBloc(this._repository) : super(MyFeatureInitial()) {
    on<MyFeatureLoadRequested>(_onLoadRequested);
    on<MyFeatureSaveRequested>(_onSaveRequested);
  }

  final MyFeatureRepository _repository;

  Future<void> _onLoadRequested(
    MyFeatureLoadRequested event,
    Emitter<MyFeatureState> emit,
  ) async {
    emit(MyFeatureLoading());
    try {
      emit(MyFeatureLoaded(await _repository.getItems()));
    } on DioException catch (e) {
      emit(MyFeatureError(_mapError(e)));
    }
  }

  Future<void> _onSaveRequested(
    MyFeatureSaveRequested event,
    Emitter<MyFeatureState> emit,
  ) async {
    await _repository.save(event.item);
    add(MyFeatureLoadRequested());
  }
}
```

---

## Rules

- States are immutable, sealed/exhaustive (`sealed class` + exhaustive `switch`, or `freezed` union) — a `BlocBuilder` must never need a `default:` case that silently does nothing.
- One Bloc per feature/screen, not one giant app-wide Bloc. Cross-feature communication goes through a repository-level stream or an explicit event bus — never by reaching into another feature's Bloc.
- Never call `emit()` after the Bloc/Cubit is closed — guard long-running async work with `if (isClosed) return;` where cancellation is possible.
- Side effects that should happen once (navigation, snackbar) go through `BlocListener`, never inside `BlocBuilder`'s `builder`.
- Close all `StreamSubscription`s created inside a Bloc in `close()`.
- Never put `BuildContext` or any widget reference inside Bloc/Cubit/state classes.

---

## BlocListener for Side Effects

```dart
BlocListener<MyFeatureBloc, MyFeatureState>(
  listener: (context, state) {
    if (state is MyFeatureError) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(state.message)),
      );
    }
  },
  child: const MyFeatureView(),
)
```
