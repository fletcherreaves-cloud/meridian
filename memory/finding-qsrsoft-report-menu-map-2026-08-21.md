---
name: finding-qsrsoft-report-menu-map-2026-08-21
description: Owner-captured QSRSoft People and Labor report menus - the inventory of what reports exist, so a future session picks a target instead of guessing one. Labels only, no schemas captured. Flags four that overlap or extend what Meridian already computes, notably VLH Over/Under which Meridian derives itself from lifelenz_schedules.
metadata:
  node_type: memory
  type: finding
---

# QSRSoft report menus — People and Labor (owner capture, 2026-08-21)

**⚠️ These are MENU LABELS ONLY.** No request, response, schema or endpoint path was captured for
any of them except the two marked ✅. Everything under "why it might matter" is **inference from the
label** — a reasonable place to start looking, never a claim about what the report contains. Confirm
before scoping any of it.

Kept because the alternative is a future session guessing which report might hold a field. This is
the map; the territory still needs walking.

## People

| report | status | why it might matter |
|---|---|---|
| At A Glance | — | |
| **Employee Roster** | ✅ captured | `finding-qsrsoft-employee-roster-endpoint-2026-08-21.md`. 🔴 returns SSN/address/DOB/race |
| Birthdays and Anniversaries | — | probably a view over roster dates; unlikely to add a field |
| Roster Statistics | — | aggregate roster; possibly headcount trends without per-person PII, which would be the *safe* version of the roster |
| **Turnover** | — | **a real KPI Meridian does not have.** Derivable from roster start/end dates, but a native report is a cross-check — and per the standing rule, diff the two computations rather than trusting either alone |
| Store Time Punches | — | likely a per-store view of the same punches |
| **Time Punch Export** | ✅ captured | `people/time-punches-matched`. 🔴 returns SSN. Carries `inModified`/`outModified` — the punch-edit loss-prevention signal |
| **Labor Exceptions** | — | label suggests missed breaks / overtime / compliance flags. If so, it is a **ready-made rules source** that would otherwise have to be derived from raw punches |
| Time and Attendance | — | |
| Emp Hours This Week | — | |
| Shift | — | |
| Rewards | — | |

## Labor

| report | status | why it might matter |
|---|---|---|
| All Hours | — | |
| Labor Statistics | — | |
| Labor Schedules | — | possible overlap with `lifelenz_schedules`, which Meridian already pulls daily |
| Labor Analysis | — | |
| Schedule Analysis Summary | — | |
| **Schedule Variance** | — | **scheduled vs actual.** Meridian derives this today; a native version is both a redundancy check and a candidate replacement |
| **VLH Over/Under** | — | 🔴 **Meridian already computes the VLH gap itself**, from `lifelenz_schedules` via `query_lifelenz_labor`. QSRSoft has it natively |

## ⚠️ The VLH overlap is the one to handle carefully

Meridian's VLH gap is computed in-house. QSRSoft ships **VLH Over/Under** as a report. That is
exactly the shape of the `CLAUDE.md` standing rule: *"When two panels disagree on one number, diff
the two computations before debugging either."*

**Do not treat the QSRSoft report as ground truth and do not assume ours is wrong** — the two may
use different denominators, different boundaries (ours is LifeLenz-scheduled; theirs may be
`compType`-based), or a different definition of variable labor. **Pull it once and diff the
computations side by side before deciding anything.** If they agree, it is a free validation of a
number the app already shows. If they disagree, the disagreement itself is the finding — and it is
cheaper to find that now than after a GM has acted on the wrong one.

The same caution applies, less sharply, to **Schedule Variance** and **Turnover**: both are things
Meridian either derives or could derive from data it already holds. Per the auto-first /
no-redundant-source rules, check overlap before adding a stream.

## What this map is good for right now

- **`Labor Exceptions`** is the most interesting *unclaimed* item — a compliance/exception feed
  Meridian has no equivalent of, and a natural companion to the punch-edit rule already scoped from
  `time-punches`.
- **`Turnover`** is the most interesting *unclaimed KPI* — nothing in Meridian reports it today.
- **`Roster Statistics`** may allow roster-derived insight **without touching PII at all**, which
  would sidestep the entire `selectCols` allowlist problem. Worth checking before building anything
  on the full roster.

## Not captured, deliberately

No request was made against any of these. **The next capture round should target one report at a
time with a purpose**, not sweep the menu — a sweep of `people/*` risks pulling another payload like
the roster's, and every such capture lands permanently in a session transcript.
