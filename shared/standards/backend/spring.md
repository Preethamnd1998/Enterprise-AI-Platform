# Spring Boot Standards
<!-- Reclassified 2026-10-13: this file previously carried `name: spring-skill` /
     `description:` frontmatter mimicking a SKILL.md, but it is a STANDARD (rules the agent
     must follow), is not under shared/skills/, and is not named SKILL.md, so it was never
     actually discoverable as a skill -- the frontmatter was inert decoration. It is also the
     likely source of the dangling `loads-after: spring-enterprise-backend` reference removed
     from shared/skills/abdm-integration-backend/SKILL.md during this reorg (name doesn't even
     match: spring-skill vs spring-enterprise-backend). See shared/reports/ for the full audit. -->


## STACK

- Spring Boot
- Hibernate
- PostgreSQL
- MongoDB
- Redis
- Kafka
- Docker
- Feign Client
- WebClient
- Spring Batch
- Microservices
- RESTful APIs


## RULES

- preserve transactions
- avoid N+1 queries
- use DTO projections
- preserve backward compatibility