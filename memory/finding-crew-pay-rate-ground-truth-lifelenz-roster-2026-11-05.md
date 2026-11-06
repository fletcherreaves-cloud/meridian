---
name: finding-crew-pay-rate-ground-truth-lifelenz-roster-2026-11-05
description: "Owner-caught live, same day as the OT-split fix: crew pay rate in Pay Rate History is DERIVED (never a real field), which can show false 'decreases'. Wires in LifeLenz's employee_roster_report for a real, vendor-recorded current rate, PII-stripped at parse time, with the same read-before-overwrite diff pattern already proven for management. Also records a stronger QSRSoft alternative found mid-build, deliberately not pursued in this pass."
metadata:
  type: finding
---

# Crew pay-rate ground truth — LifeLenz employee_roster_report (owner request 2026-11-05)

## What the owner caught

Same day as the morning's OT-split fix, while reviewing a fresh LifeLenz sync after entering a
round of raises: "I see a bunch in app that appear wrong and some even as decreases. They are not
correct... If we need to, we can wire in the employee roster report from Lifelenz and obtain the
current pay information from there."

## Root cause

Crew pay rate has never been a real field anywhere in this app -- `weeklyCrewRates()`
(`src/engine/employee-pay-history.js`) DERIVES it as Σearnings/Σhours from actual worked shifts.
That's inherently noisy (role/station mix, low-hour weeks) and, critically, LAGS: a raise entered
in LifeLenz only moves this number once shifts are actually worked and paid at the new rate and
synced back -- so right after a round of raise entry, derived numbers are *expected* to look
stale/wrong for anyone who hasn't worked a shift at the new rate yet. That's not a bug on its own,
but it means the derived number was never a reliable "what is this person's rate right now"
answer, which is exactly what the owner needed while verifying raise entry.

Management already has the real thing: QSRSoft's roster pull reads `hourlyPayRate` directly and
diffs it against the stored value before every overwrite (`scripts/qsrsoft-employee-roster-pull.mjs`'s
`detectAndRecordPayRateChanges`), logging real changes to `employee_pay_rate_changes`. Crew had
no equivalent.

## What was tested live (owner-provided curls, tokens used transiently, never persisted to disk)

**`employee_roster_report`** (`POST /api/admin/report/businesses/{id}/schedules/{scheduleId}/employee_roster_report`,
body `{employee_ids: [...]}`) -- same admin-report family `scripts/lifelenz-pull.mjs` already
automates (`LIFELENZ_TOKEN` + Playwright-login fallback) for `labor_analysis_actuals_report`/
`time_punch_change_approvals_report`. Returns a CSV: `Home Store NSN, First Name, Last Name,
Nickname, DOB, Minor Age, SSN, Street Address, City, State, Zip Code, Home Phone, Cellphone,
Emergency Contact, Emergency Contact Consent, Date of Consent, Email, Hire Date, Restaurant Start
Date, Primary JTC, Pay Rate, Last PR Rating, Last PR Date, Next PR Due Date, LOA Start Date, LOA
Proposed End Date, Status, Termination Date, Termination Reason`.

Two load-bearing measurements:
1. **Real current Pay Rate column, confirmed present** -- the missing ground truth.
2. **No selectCols-style param** -- unlike QSRSoft's roster endpoint, this report cannot be asked
   for fewer columns. SSN/DOB/full address/phone/email/emergency-contact arrive over the wire on
   every call, full stop. Same PII trap CLAUDE.md already documents for QSRSoft's `employeeRoster`
   -- the discipline has to live entirely in how the response is PARSED, never in the request.
3. **No employee-id echoed back** -- the request takes a LifeLenz employment-id array, but the
   response CSV has no id/geid column, only first/last name. Resolving a row back to a real
   `assignedEmploymentId` requires a separate (loc, name) lookup.

Also tested `availability_report` (name/GEID/weekly availability windows, low PII, unrelated to
wages -- queued separately, not acted on here) and confirmed `employee_roster_report` was not
referenced anywhere in the codebase before this change (plain grep, zero hits).

## The fix

- **`supabase/schema-lifelenz-employee-roster.sql`** (new, owner must run) -- `lifelenz_employee_roster`,
  a current-state snapshot table (crew's equivalent of `qsr_employee_tenure`), PII-stripped by
  construction: it only ever holds the columns the parser below explicitly reads. Role-gated
  (Owner/Admin/DO), same RLS shape as `employee_pay_rate_changes`/`schema-lifelenz-shift-pay.sql`.
- **`scripts/lifelenz-pull.mjs`**'s new `pullEmployeeRoster()` (step 7, best-effort, never fatal,
  `LIFELENZ_SKIP_ROSTER=1` escape hatch):
  - `parseEmployeeRosterCSV()` -- allowlist BY OMISSION: only ever reads
    `{loc, firstName, lastName, hireDate, restaurantStartDate, jobTitleCode, payRate, status,
    terminationDate, terminationReason}` by exact header name. SSN/DOB/address/phone/email/
    emergency-contact are never looked up, so they can't land in a row even by future accident --
    verified by a test that includes every real PII column in the fixture and asserts none of
    their values appear anywhere in the parsed output.
  - `getRecentShiftIdentities()` -- builds the `employee_ids` request list AND the name→id lookup
    from the SAME already-synced `lifelenz_shift_assignments` rows (confirmed live:
    `assigned_employment_id` is the identical UUID namespace the roster report's `employee_ids`
    takes) -- no new discovery call needed.
  - `resolveRosterPersonKeys()` -- resolves each CSV row to a real employment id by exact
    (loc, name) match; falls back to a visibly-synthetic `name:<normalized>` key when unresolved
    (brand-new hire with no shifts yet, or an ambiguous duplicate name at that store -- logged,
    never silently merged into the wrong person).
  - `detectAndRecordLifelenzRosterChanges()` -- reads the current `lifelenz_employee_roster` value
    BEFORE the upsert overwrites it, same read-before-overwrite pattern already proven for
    management. Reuses `qsrsoft-employee-roster-pull.mjs`'s `computePayRateChanges()` (given a
    new 4th optional `source` param, default unchanged) rather than duplicating the diff logic,
    writing `source:'lifelenz_roster'` rows into the SAME `employee_pay_rate_changes` table
    management already uses.
- **`src/engine/employee-pay-history.js`**'s new `lifelenzRosterRateChanges()` -- a deliberately
  SEPARATE reshape function from `managementRateChanges()` (same table, different `source` filter)
  because the two populations need different $ impact handling downstream: crew has a real
  measured-hours source (`weeklyCrewRates()`) to join to when resolved to a real employment id;
  management doesn't (`ASSUMED_MANAGEMENT_WEEKLY_HOURS`). An unresolved (`name:`-prefixed) roster
  row shows no fabricated $ impact rather than guessing at hours.
- **`src/views/pay-rate-history.js`** -- a third merge branch (`rosterChanges`) alongside the
  existing management/derived-crew ones, joined to that employee's own most recent
  `weeklyCrewRates()` week when resolved. Summary line now reads "N management · N crew (roster)
  · N crew (derived)".

## What's gated on the owner (DDL, never run by an agent)

`supabase/schema-lifelenz-employee-roster.sql` must be run before `pullEmployeeRoster()` can
persist anything -- it degrades to a harmless no-op (upsert error, logged, never fatal) until then,
same graceful-degrade posture as every other optimistic-schema pull in this codebase.

## A stronger alternative found mid-build, deliberately NOT pursued in this pass

While this was being built, the owner separately surfaced QSRSoft's own
`data_layer/v1/people/employee-pay-details` endpoint (tested live): a date-ranged query returning
`geid` (the SAME stable key `qsr_employee_tenure`/`employee_pay_rate_changes` already use for
management), `hourlyPayRate`, `payType`, `totalHours`, `totalDollars`, `jobTitleDescription`
(covers BOTH crew AND management job titles in one response), `isFinal` (pay-period-locked flag),
with NO SSN/DOB/address/phone/email in the selectCols the owner queried. Because it's queried by
date range, it can plausibly BACKFILL years of real historical per-pay-period pay rate directly --
something the LifeLenz roster snapshot above fundamentally cannot do (it only starts building a
real trail from whenever this pull first runs forward). This is very likely the better long-term
source for a real crew+management wage HISTORY, and could eventually let the diff-detection
mechanism built in this pass be simplified or retired in favor of direct historical reads. Queued
as a separate follow-on task rather than built here, to avoid abandoning this already-working,
tested LifeLenz pull mid-stream and to give it its own proper measurement pass (QSRSoft Cognito
auth TTL, pay-period grain vs. this app's weekly grain, and how far back `isFinal` data actually
goes are all open questions, not yet measured).
