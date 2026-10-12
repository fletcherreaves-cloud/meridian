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

## Not yet done (as of this finding)

- **No pull script exists for this report.** `scripts/lifelenz-pull.mjs` would need a new
  function mirroring `fetchReportChunk()`/`pollForReport()` against this report name, looped over
  every store's already-discovered `scheduleId` (same pattern `pullJobHours()`/
  `pullShiftAssignments()` already use for their own per-store report pulls).
  - **Scope note on `scheduleId` validity:** the live capture used a specific `scheduleId`
    (presumably one store, from a specific past date window) — confirm this report accepts the
    same per-store `scheduleId`s the existing pull already discovers for every one of the ~27
    stores, not a different id namespace, before assuming full-district coverage is a drop-in.
- **No Supabase table.** Would need `tenant_id` + RLS like every other stream (standing rule).
  Names are fine to store here per dispatch #125's existing owner directive ("no reason to hide
  names for scheduling and punch times — everyone can see this data as-is") — this is squarely
  that same domain, not a new PII question. No SSN/DOB/address field appears anywhere in this
  report's column list.
- **No security-rules registry row, no `assembleLaborDrilldown()`.** Per §2.4a's existing
  architecture note — a `'labor'` domain in `security-panel.js`'s `SubjectDrilldown` is still
  net-new, whichever data source ends up feeding it.
- **The curl the owner pasted to share this finding carried a live `x-auth-token` in plaintext
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
