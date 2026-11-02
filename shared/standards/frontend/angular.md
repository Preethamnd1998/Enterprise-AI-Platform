# Angular Standards
<!-- Reclassified 2026-10-13: this file previously carried `name: angular-skill` /
     `description:` frontmatter mimicking a SKILL.md, but it is a STANDARD (rules the agent
     must follow), is not under shared/skills/, and is not named SKILL.md, so it was never
     actually discoverable as a skill -- the frontmatter was inert decoration. It is also the
     likely source of the dangling `loads-after: angular-enterprise-ui` reference removed from
     shared/skills/abdm-integration-frontend/SKILL.md during this reorg (name doesn't even
     match: angular-skill vs angular-enterprise-ui). See shared/reports/ for the full audit. -->


## STACK

- Angular 17+
- PrimeNG 17+
- PrimeFlex
- RxJS

## RULES

- preserve lazy loading
- avoid unnecessary subscriptions
- prefer async pipe
- preserve standalone architecture