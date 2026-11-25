<!-- Post only when the user asks. Redmine here renders Markdown. Counts/shapes only, no patient data. -->
## Plan review: <score>/100, <VERDICT>

Basis: <refs read with tip dates>; <DB/log checks done>; **not checked:** <gaps>.

### Verdict
<three lines>

### Branch state
| Repo | Ref | Bug present | Fix/plan code present |
|---|---|---|---|

### Change Map check (bug fixes)
| Plan row | Verified on | Result | Correct lines |
|---|---|---|---|

### Blast radius
<consumers, shared code, release path, risk class>

### Score
| Area | Pts | Score | Why |
|---|---|---|---|

### Developer start-guide
1. <step with file path and done-when>
2. …

### Test cases
<IDs grouped by kind; P0/P1 marked>

### Self-testing the developer (or AI agent) must do
Failing-first test · UI: Jasmine+Karma `ng test` + production build run · BE: JUnit 5 +
Mockito `mvn test` / `mvn verify` · API tests + black-box call (happy, negative, unauthorised) ·
DB/Kafka checks · consumer regression · post the Self-Test Evidence block
(`reference/self-testing-guidelines.md`).

### Exit criteria
<list>
