# Semantic Git Standards
<!-- Reclassified 2026-10-13: this file previously carried `name: semantic-git-skill` /
     `description:` frontmatter mimicking a SKILL.md, but it is a STANDARD (rules the agent
     must follow), is not under shared/skills/, and is not named SKILL.md, so it was never
     actually discoverable as a skill -- the frontmatter was inert decoration.
     See shared/reports/ for the full audit. -->


## RULES

Never:
- raw cherry-pick merge commits
- duplicate logic
- move formatting-only changes

Always:
- compute merge-base
- detect partial migrations
- build semantic patches