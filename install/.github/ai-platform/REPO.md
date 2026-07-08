# <REPO_NAME> — Repository Profile (Copilot)

Mirror of `.claude/CLAUDE.md` for Copilot. Declares ONLY repo-specific facts.

## Metadata
- Stack: <Java 21 / Spring Boot 3 | Angular 17 | SQL/Flyway>
- GitLab project: <group/project>
- Default integration branch: <develop>
- Active release branches: <release/2.4>
- Flyway location: <src/main/resources/db/migration>

## Module boundaries (migration mode=functionality)
- com.<org>.<module-a>
- libs/<feature-a>

## Shared / allowed cross-module packages
- com.<org>.common.*
- libs/shared/*

## Forbidden boundaries (never auto-expand into)
- com.<org>.billing.*
- com.<org>.pharmacy.*
