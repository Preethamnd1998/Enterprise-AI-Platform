# Worked Example (calibration): Redmine #50950, Conduct Notes save

Use this to calibrate scoring. Facts are from the 2026-11-25 review; no patient data.

**Plan:** three plans (99 jQuery fix verification, 100 show existing note on reopen, 101
tooltip error via OnPush + interval). **Score 38/100 → REJECT/REVISE.**

| Dim | Pts | Score | Why |
|---|---|---|---|
| D1 | 12 | 5 | Lab "Select" not opening, logout and Global Search freeze (the title) have no plan item |
| D2 | 15 | 12 | Plan 99 cause right (`import * as jQuery` called as a function, console `go is not a function` in `isEditorValid`); Plans 100/101 are unrequested |
| D3 | 15 | 8 | Names the wrong file; line numbers (378, 569) match no branch (real: 302, 509) |
| D4 | 10 | 2 | Unaware the one-line fix is on `V2-QA` (commit cade21e, shipped under #51335) but not `development`, nor in adt/blood-bank/front-desk |
| D5 | 15 | 4 | Component is in a submodule shared by 13 apps; plan lists one |
| D6 | 10 | 1 | OnPush + timers would stop `ApiCallBack` results rendering (Save & Exit, spinners); dev-only NG0100 treated as a production defect |
| D7 | 15 | 7 | Good save tests; no negative/whitespace-only, prod-build, race, permission, original-ticket tests; test file named, not attached |
| D8 | 8 | 4 | "IMPLEMENTED" and "95/100" with the code on no branch |

**Caps hit:** a reported symptom with no plan item (≤ 69); plan code on no branch (D8
flag). **Lessons:** (1) search branches by content, not ticket id; (2) a shared submodule
multiplies the blast radius; (3) read the screenshot, the error text named the real cause;
(4) separate scope-creep plans into their own tickets; (5) a data count ("no notes saved in
env X since the fix date") is a cheap, strong hint about deployment state.
