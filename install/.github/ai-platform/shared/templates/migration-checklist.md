# Migration Checklist (v3)

Migration ID: MIG-YYYY-MM-DD-NNN
Mode: ☐ exact  ☐ functionality
Source: ☐ Redmine ☐ MR ☐ Commit(s) ☐ Branch ☐ Release range — value: __________
Target branch: __________

## Backend dependencies (applicable only)
☐ Controller   ☐ Service   ☐ Repository   ☐ DTO   ☐ Mapper   ☐ Entity
☐ Enum   ☐ Constants   ☐ Validator

## Frontend dependencies (applicable only)
☐ Component   ☐ UI Service   ☐ Model   ☐ Route   ☐ Shared component
☐ Permissions   ☐ Translations

## Mobile dependencies (Flutter, applicable only)
☐ Widget/Screen   ☐ State management (Bloc/Cubit/Provider)   ☐ Repository   ☐ Model
☐ Route (go_router)   ☐ Permissions   ☐ Localization

## Database
☐ Flyway (exists)   ☐ Flyway ordering correct   ☐ SQL / query
☐ Stored proc / function / view   ☐ Index

## Security
☐ Role validation   ☐ Permission validation   ☐ Audit logic

## Validation gates (BOTH mandatory)
☐ Completeness (contract §7): every applicable artifact present; no symbol missing on target
☐ Regression (contract §8): existing APIs / UI flows / permissions / integrations / Flyways / DB / tests still work

## Target-compatibility (release / backport only)
☐ API compatibility   ☐ DB compatibility   ☐ Flyway compatibility   ☐ Permission compatibility

## Testing
☐ Unit tests   ☐ Integration tests   ☐ Existing tests still pass

## Result
☐ PASS   ☐ FAIL — gaps: __________
Notes: __________
