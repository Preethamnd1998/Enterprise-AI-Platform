# Behaviour Matrix — run these against the new screen (and the reference to compare)

Legend: **P** = panel, **H** = host list, **TB** = top bar, **PG** = paginator.

| # | Scenario | Steps | Expected |
|---|---|---|---|
| 1 | Fresh load, no saved default | open screen | chip **Today** selected (✓), From/To calendars empty (reference clears them), top-bar date label `Today`, form fields empty, host fetches page 0 with today's range |
| 2 | Fresh load, saved default exists | open screen | default patched into form (chip/dates/fields), one search fired ~500 ms after view init, list shows filtered rows, `Show filter` list shows default icon highlighted |
| 3 | Screen without date range | open screen | no chip column / date label; request has no date params; backend returns recent-first page 0 |
| 4 | Chip click | click `Last 7 days` | `rangeDate="Last 7 days"`, that chip selected + ✓, From/To calendars show the derived dates |
| 5 | Custom date | pick From only | `rangeDate=[from,from]`, chip selection cleared (`selectedIndex=-1`) |
| 6 | Custom date range | From then To | `rangeDate=[from,to]`; chips unselected |
| 7 | To before From | set To earlier than From | error toast `To Date cannot be before From Date`; form unchanged |
| 8 | Min date | open calendar | dates earlier than today−3 months disabled |
| 9 | Search button | set fields, click Search | one `SearchFilterEvent` emitted; overlay closes; PG back to page 1; one HTTP call with expanded dates (never the label text); top-bar chip text shows non-empty filters |
| 10 | Enter in a text field | press Enter | same as Search |
| 11 | Quick label sent to API | inspect network | `startDate/endDate` are real date-times, not `Today` |
| 12 | Page 3 → Search | go to page 3, change filter, Search | lands on page 1; exactly one request |
| 13 | Clear, no default | click Clear | form back to Today + empty fields; chip Today; From/To empty |
| 14 | Clear, default exists | click Clear | default values restored (not blank) |
| 15 | Save Filter | click Save Filter | popup opens with `Filter N` (N = highest existing "Filter n" + 1); Save → toast `Filter saved successfully`; row appears in list (if `Show filter` on) as non-default |
| 16 | Empty name | clear name, Save | warning `Please Enter Filter name`; nothing saved |
| 17 | Name chars | type `<>#` | stripped by the input rule (`[A-Za-z0-9-,.;'&/.() ]`, no leading space) |
| 18 | Apply saved filter | click a saved row | form patched, chips/dates restored (label → chip selected; dates → custom), list searched once, PG page 1 |
| 19 | Set default | click grey ★ on a row | that row becomes default (teal), previous default becomes grey (server-side uniqueness); list re-searched with it |
| 20 | Unset default | click teal ★ | row grey; panel does `Clear` → falls back to Today/empty |
| 21 | Rename | edit name, Enter | PUT update; toast `Filter updated successfully`; list reloaded |
| 22 | Delete | click trash | row removed; toast `Filter deleted successfully` |
| 23 | No saved filters | tick `Show filter` | text `No Filters Saved- Filters Once saved will display here` |
| 24 | Reload persistence | save + set default, F5 | scenario 2 |
| 25 | Top-bar quick search | type text, Enter | form reset; range Today (if date filter); only the page's single quick field patched; list searched page 1; `✕` appears |
| 26 | Top-bar clear | click ✕ | text cleared, date label `Today`, list reset |
| 27 | Date label | apply `Last 15 days` | top-bar label shows `Last 15 days`; custom range shows `Custom` |
| 28 | Cross-screen leakage | open another filter screen after this one | its `handleSearch` ignores this screen's replayed event (type guard) |
| 29 | Toggle | click top-bar arrow twice | overlay opens/closes; arrow icon switches caret/sort-down |
| 30 | Destroy | navigate away | both host subscriptions unsubscribed; `isSearchVisible` false on non-filter screens |
| 31 | Dependent dropdown | choose Specialization | Physician options narrowed; clearing restores all |
| 32 | Failed saved-filter GET | simulate 500 | list `[]`, no crash, screen still searchable |
| 33 | Saved JSON with string dates | apply a filter saved earlier | `convertToValidDate` rebuilds Dates; invalid → null (no `Invalid Date` in calendars) |
| 34 | Page-size change | change to 50 | PG page 1, one request with `pageSize=50` |
| 35 | No results | filter to nothing | table `emptymessage`, `0 records`, PG shows page 1 |

Regression (Gate B): existing filter screens still work; no change to `SearchMenuService`/`ConponentSearchService` signatures; `FilterComponentType` only appended; no edits to applied Flyway files.
