# <REPO_NAME> — Repository Profile (Enterprise AI Platform v3)

Engine lives in the `enterprise-ai-platform` plugin. This file declares ONLY the
repo-specific facts the engine needs. Keep it short and stable (it is cached).

## Repository metadata
- Stack: <Java 21 / Spring Boot 3 | Angular 17 | SQL/Flyway>
- GitLab project: <group/project>
- Default integration branch: <develop>
- Active release branches: <release/2.4, release/2.3>
- Flyway location: <src/main/resources/db/migration>

## Module boundaries (for migration mode=functionality)
List the top-level module/package prefixes. Capability closure must NOT cross these
unless a real reference does.
- com.<org>.<module-a>
- com.<org>.<module-b>
- (Angular) libs/<feature-a>, libs/<feature-b>

## Shared / allowed cross-module packages
Closure MAY follow references into these (common/shared code):
- com.<org>.common.*
- com.<org>.shared.*
- (Angular) libs/shared/*, libs/ui/*

## Forbidden boundaries (never auto-expand into)
- com.<org>.billing.*
- com.<org>.pharmacy.*
- com.<org>.inventory.*

## Notes
- Conventions: <XController → XService → XRepository; XDTO/XMapper; VNNN__name.sql>
- Anything not listed here uses the plugin defaults.
