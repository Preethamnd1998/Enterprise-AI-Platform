# AI_ARCHITECTURE — Architecture Reference
<!-- Template version: 4.1 | Created by Enterprise AI Platform installer -->
<!-- Fill in with the current architecture. AI uses this to avoid violating layering rules. -->

## Layering Rules
<!-- Describe the layers and what is allowed to call what. -->
```
Controller → Service → Repository → Database
           ↓
         DTO / Mapper
           ↓
         Entity
```
TODO: Update with actual layering rules.

## Package Conventions
<!-- List the naming conventions AI must follow when suggesting new files. -->
- Controllers: `com.<company>.<service>.controller.<Feature>Controller`
- Services:    `com.<company>.<service>.service.<Feature>Service`
- Repos:       `com.<company>.<service>.repository.<Feature>Repository`
- DTOs:        `com.<company>.<service>.dto.<Feature>Request/Response`
- Entities:    `com.<company>.<service>.entity.<Feature>`
TODO: Update with actual package names.

## API Contracts
<!-- List public API endpoints that must NOT change signature without review. -->
- TODO: list critical endpoints (e.g. POST /api/v1/patients)

## Database Schema Notes
<!-- Tables / collections with special constraints the AI must respect. -->
- TODO: list critical tables / collections

## Integration Points
<!-- External systems integrated with this service. -->
- TODO: none documented
