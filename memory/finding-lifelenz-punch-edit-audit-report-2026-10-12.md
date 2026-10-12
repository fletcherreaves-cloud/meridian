---
name: finding-lifelenz-punch-edit-audit-report-2026-10-12
description: Owner-provided LifeLenz admin endpoint "Time Punch Change Approval Report" (time_punch_change_approvals_report) -- the real punch-edit audit trail this repo spent 2026-10-12 looking for in the wrong vendor. Carries editor identity (Manager Modified), edit timestamp, adjustment type (Add/Edit), and original-vs-adjusted punch value. No employee sample data (names/GEIDs/payroll IDs/manager names) from the live capture is recorded here.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# LifeLenz `time_punch_change_approvals_report` — the real punch-edit audit trail

**Supersedes same-day research in `plan-security-loss-prevention.md` §2.4a and
`finding-qsrsoft-time-punches-endpoint-2026-08-21.md`'s framing.** Earlier today this repo
concluded "QSRSoft, not LifeLenz" owns raw punch+edit data, based on LifeLenz's REST pull
(`scripts/lifelenz-pull.mjs`) only exposing aggregated schedule-vs-actual data and QSRSoft's
`qsr_punch_times` carrying a coarse `inModified`/`outModified` flag with no editor/timestamp/
old-value. **Both halves of that conclusion were wrong.** The owner captured a live, working
LifeLenz admin report that carries exactly the three fields the research called "still missing":
editor identity, edit timestamp, and the original-vs-adjusted value — the one thing a
self-approval check, a per-manager edit-rate outlier check, or a rounding-direction check
actually needs.

## The endpoint (owner capture, 2026-10-12, live curl + CSV output)

```
GET https://us01-connect.lifelenz.com/api/admin/report/businesses/{BUSINESS_ID}/schedules/{scheduleId}/time_punch_change_approvals_report?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&type=csv
```

Same host, same `BUSINESS_ID` (`01979dbf-a166-759b-8702-aba9915c578e`), same `X-Auth-Token`/
`X-Business-Id`/`X-Schedule-Id` header shape, and the **exact same URL family** as
`fetchReportChunk()`'s already-confirmed `labor_analysis_actuals_report` call in
`scripts/lifelenz-pull.mjs:502-534` — just a different report name in the path. The `scheduleId`
is the SAME per-store schedule id `getStoreSchedules()` (`scripts/lifelenz-pull.mjs:459-492`)
already discovers for every store today (one schedule per 4-7-digit store number, filtered from
`GET /api/admin/businesses/{id}/schedules`). **No new discovery step is needed** — this report
can be pulled for every store with the schedule ids the existing pull already has in hand.

## Response shape (CSV header, fields only — no sample row values recorded)

```
Employee Name, GEID, Payroll ID, Original Punch Date/Time, Punch Type, Punch Method,
Adjustment Type, Adjusted Punch Date/Time, Modified Date/Time, Manager Modified,
Employee Action Date/Time, Employee Action Status
```

- **`Punch Type`**: Clock In, Clock Out, Break Start, Break End, Role Rate Operation — matches
  the punch taxonomy the existing `lifelenz_schedule`/shift pulls already use.
- **`Punch Method`**: Pin, Biometrics, Manual — distinguishes a normal clock event from one
  entered by hand in the first place (a `Manual` row with no `Adjustment Type` is the ORIGINAL
  punch method, not itself an edit).
- **`Adjustment Type`**: blank (no edit), `Add` (a punch that didn't exist was added — e.g. a
  missed clock-out), `Edit` (an existing punch's time was changed). This is the row-level signal
  every manual-edit-pattern rule needs.
  - A row is only a real "edit" event when `Adjustment Type` is non-blank. Most rows in the live
    sample had everything blank except `Punch Type`/`Punch Method` — a punch with no adjustment
    at all. Filter on `Adjustment Type != ''` before treating a row as an edit.
- **`Original Punch Date/Time`** vs **`Adjusted Punch Date/Time`**: the before/after pair every
  rounding-direction check needs (`adjusted - original` gives signed drift in minutes, the exact
  input a "always rounds down by ~10-15 min" detector wants).
- **`Modified Date/Time`**: when the edit was made — can be compared against the original punch's
  own date to catch same-day vs. much-later edits (a known manual-edit-fraud pattern: editing a
  card right before a payroll cutoff, long after the shift).
- **`Manager Modified`**: **the editor identity.** This is the field that unblocks every
  per-manager check — self-approval (`Manager Modified == the employee's own name/geid`, needs a
  join against the roster to know who manages whom vs. who punched), per-manager edit-RATE
  outlier (group by `Manager Modified`, compare against peers, same baseline-comparison principle
  every other rule in `plan-security-loss-prevention.md` uses), and edits clustering heavily on
  one manager across many different employees.
- **`Employee Action Date/Time`** / **`Employee Action Status`**: whether/when the employee
  acknowledged the edit (`Acknowledged` in every populated sample row) — a second signal: an edit
  the employee never acknowledges, or acknowledges suspiciously fast/late, could itself be worth
  a check, though this needs more samples before building a rule on it.

## What this unblocks

**Every manual-edit-pattern row in `plan-security-loss-prevention.md` §2.4** that was flagged
blocked on "editor identity + timestamp + original value" — self-approval, per-manager outlier
rate, rounding-direction skew, edits concentrated on an already-approved record — is now
buildable, pending a real pull script and table, not pending more research. The QSRSoft
`inModified`/`outModified` coarse flag (found earlier today, still real, see
`plan-security-loss-prevention.md` §2.4a) becomes redundant for this purpose once this LifeLenz
report is pulled — LifeLenz's version carries everything the QSRSoft flag does, plus the three
fields QSRSoft doesn't have.

## Built, same session (2026-10-12) — pull script + table shipped, UNTESTED against the live API

The owner asked to build this now rather than hold. Shipped:

- **`scripts/lifelenz-pull.mjs`**: new `fetchPunchEditReportChunk()` (same URL/header shape as
  `fetchReportChunk()`, different report name, reuses `pollForReport()` as-is — it was already
  report-name-agnostic), `parsePunchEditCSV()` (pure, exported, handles the report's sparse
  per-employee-block shape — Employee Name/GEID/Payroll ID carry forward across blank rows,
  only rows with a non-blank `Adjustment Type` are kept), `parsePunchDateTime()` (parses
  `MM/DD/YYYY HH:MM`, strips an observed trailing `(EI)`-style annotation rather than guessing
  at its meaning), `upsertPunchEditRows()`, and `pullPunchEditAudit()` — wired into `main()` as
  step 6, same best-effort/never-fatal posture as `pullJobHours`/`pullShiftAssignments` (steps
  4-5), escape hatch `LIFELENZ_SKIP_PUNCH_AUDIT=1`. Reuses the SAME per-store `scheduleId`s
  `getStoreSchedules()` already discovers — no new discovery step.
- **`supabase/schema-lifelenz-punch-edits.sql`**: new `lifelenz_punch_edits` table, same
  tenant+`accessible_locs` RLS pattern as `lifelenz_shift_assignments` (names stored directly,
  not tokenized, per dispatch #125). Primary key `(loc, geid, punch_type, modified_at,
  adjusted_punch_at)` — no stable row id exists in the source CSV, but a given employee's punch
  of a given type can only be modified once at a given instant, so this is idempotent across
  re-pulls of the same safety-window range.
- **15 new tests** (`lifelenz-punch-edit-audit-2026-10-12.test.js`) against
  `parsePunchEditCSV`/`parsePunchDateTime` directly, 100% synthetic fixtures (no real
  names/GEIDs/manager names), covering the carry-forward behavior, the Add-vs-Edit distinction,
  the Adjustment-Type filter, and null-vs-empty-string field hygiene.

**None of this has run against the live LifeLenz API.** No `LIFELENZ_TOKEN`/credentials exist in
any agent session's environment this session had access to, so `fetchPunchEditReportChunk()`'s
URL shape, the CSV parser's column-name matching (`fc()`'s substring match against the real
header row), and the `scheduleId`-reuse assumption are all built from the owner's one live
capture + this repo's existing confirmed pattern for the sibling report — not independently
re-verified against a second live call. **First real test is the next scheduled GitHub Action
run** (`.github/workflows/lifelenz-pull.yml`, already watches this script via
`sync-failure-watch.yml` — no new entry needed, this is a new step inside the SAME watched
workflow) or an owner-run manual pull with `LIFELENZ_SKIP_PUNCH_AUDIT` unset. If the real column
headers differ even slightly from the live capture's (e.g. a header the capture didn't show, or
different capitalization `fc()`'s substring-and-lowercase match doesn't account for), the pull
will silently return zero rows rather than error — best-effort by design, but worth explicitly
checking the first run's log line (`[punch-audit] ✓ N/M edit-event(s) saved`) rather than
assuming success from a clean exit code.

**Still not built:** a `security_rules` registry row or `assembleLaborDrilldown()` in
`security-panel.js` — the data now lands in Supabase, but nothing in the Security panel reads it
yet. That's the next piece, scoped separately (a `'labor'` domain is net-new UI/rule work, not
just a data pull).

**The curl the owner pasted to share this finding carried a live `x-auth-token` in plaintext
in the chat.** Not retained, used, or written anywhere by this session. Recommended the owner
rotate that LifeLenz admin session once done testing today, same posture as every other
DevTools-captured token in this repo's standing PII/credential rules.

## Correction record (so the wrong conclusion doesn't get re-cited)

The research pass earlier today (`finding-qsrsoft-time-punches-endpoint-2026-08-21.md`'s own
follow-up, and this file's sibling correction in `plan-security-loss-prevention.md` §2.4a) said:
*"LifeLenz... only exposes an aggregated schedule-vs-actual CSV — no individual clock punches, no
edit metadata"* and named QSRSoft as "the correct vendor to pursue." Both claims were based on
`scripts/lifelenz-pull.mjs`'s EXISTING pull (`labor_analysis_actuals_report`) and
`memory/lifelenz-session.md`'s prior notes — neither had actually probed LifeLenz's admin report
catalog for a punch-edit-specific report, the same gap the "measure it" standing rule warns
about: absence in the pulls this repo happens to have built is not absence in the vendor's API.
