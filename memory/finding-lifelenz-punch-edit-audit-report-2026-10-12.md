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

## ✅ VERIFIED LIVE, same day (2026-10-12) — ran for real, found and fixed one real bug

Owner ran `supabase/schema-lifelenz-punch-edits.sql` in the Supabase SQL editor, then a manual
`workflow_dispatch` of `.github/workflows/lifelenz-pull.yml` was triggered. Real result, read
from the job's own log (`gh api .../actions/jobs/<id>/logs`), not inferred from a green exit
code:

- **The URL shape, auth, and `scheduleId`-reuse assumption are all CONFIRMED correct.**
  `fetchPunchEditReportChunk()`'s endpoint returned `200` for every one of the 27 stores'
  already-discovered `scheduleId`s — no new discovery step was needed, exactly as predicted.
- **`parsePunchEditCSV()`'s field mapping is CONFIRMED correct against real data.** 317 real
  edit-events were parsed from the live CSV responses across 26 active stores (e.g. real
  Add/Edit rows at Marietta OK: 18, Bonifay: 31, Duncan: 17, Holdenville: 15 — store names only,
  no employee-level detail recorded here).
- **❌ Found a real bug, same run: 133 of 317 edit-events were LOST.** 7 of 26 stores (Cottondale,
  Mossy Head, Durant, Ardmore-Broadway, Seminole, Ponce de Leon FL, Ada) saved **0** rows despite
  their CSV responses parsing successfully, each logging `[punch-audit] upsert error (non-fatal):
  null value in column "adjusted_punch_at" of relation "lifelenz_punch_edits" violates not-null
  constraint`. Root cause: `adjusted_punch_at` was part of the table's PRIMARY KEY, and a
  primary-key column is implicitly `NOT NULL` in Postgres — but real LifeLenz data has rows
  where that field is legitimately blank (an `Add`/`Edit` whose adjusted value isn't the punch
  time itself, or isn't captured by this report for that case — not yet root-caused further).
  Because the script upserts one batch per store, a single bad row poisoned that WHOLE store's
  batch for the run, not just the bad row.
  - **Fixed same day:** dropped `adjusted_punch_at` from the primary key (`supabase/schema-
    lifelenz-punch-edits.sql` now `primary key (loc, geid, punch_type, modified_at)`, plus an
    idempotent `alter table ... drop constraint / add primary key` migration for the table that
    already exists live under the old key) and the matching `onConflict` string in
    `upsertPunchEditRows()`. **This migration still needs to be re-run in Supabase** — editing
    the file doesn't retroactively fix the already-created table.
  - This is exactly the kind of gap the "best-effort, never-fatal" design was built to survive
    without breaking the daily sync — but it's also exactly why "check the first run's log line
    rather than assume success from a clean exit code" mattered: the job's overall `conclusion`
    was `success` the whole time, with 42% of real edit-events silently dropped.

## ❌→✅ SECOND bug, same day: the 4-column key wasn't unique either — fixed with `seq`

The owner tried to apply the fix migration directly (`drop constraint ... / add primary key
(loc, geid, punch_type, modified_at)`) and it failed with a real, measured error, not a
hypothetical one:

```
ERROR: 23505: could not create unique index "lifelenz_punch_edits_pkey"
DETAIL: Key (loc, geid, punch_type, modified_at)=(0013113, 200668686, Role Rate Operation,
2026-10-09 15:29:00) is duplicated.
```

Root cause: LifeLenz's `Modified Date/Time` is **minute-granular**, not actually unique per
`(loc, geid, punch_type)` — at store 13113, that employee had TWO real edit events to the same
`Role Rate Operation` punch type logged in the same minute (almost certainly a multi-segment
role/rate split saved in one action, each segment its own row with a different
`original_punch_at`/`adjusted_punch_at` but the identical `modified_at`). No other CSV field
reliably disambiguates — `original_punch_at` and `adjusted_punch_at` can each independently be
blank, so neither is safe as a PK column either.

**Also important:** because `drop constraint` and `add primary key` ran as separate statements
and the second one failed, **the table was left with NO primary key at all** between the two
migration attempts. Not a data-loss event (the pull's upserts just keep erroring, caught
non-fatal) but worth knowing if debugging this window later.

**Fix:** added a `seq` column (0-based counter per `(loc,geid,punch_type,modified_at)` group,
assigned by `parsePunchEditCSV()` in CSV row order — always present, always an integer, so it's
safe as a PK column regardless of which other fields are blank) and a NEW primary key
`(loc, geid, punch_type, modified_at, seq)`. The schema migration now also backfills `seq`
correctly for the 184 rows already saved under the earlier key (a blanket default of 0 would
leave the one known duplicate pair BOTH at `seq=0`, failing the `ADD PRIMARY KEY` a third time) —
a window-function `UPDATE` ranks existing rows within each duplicate group before the key is
re-added.

**Honest open question, not yet verified:** `seq`'s idempotency (a re-pull of the same window
landing on the SAME seq per real event, so the upsert overwrites rather than duplicates) depends
on LifeLenz returning rows in a stable order for a given `(geid,punch_type,modified_at)` group
across repeat calls. This is an assumption, not a measurement — unverified beyond this one
capture. If it ever doesn't hold, the worst case is the same real events landing under swapped
`seq` slots on a re-pull (a cosmetic reshuffle), not data loss or a crash.

## ❌→✅ THIRD bug, same day: dropping the PK constraint didn't drop the NOT NULL it caused

The owner applied the `seq` migration and re-triggered the sync — and the live run hit the
**exact same error as the first bug**, on the **exact same 7 stores**, 184/319 saved:

```
[punch-audit] upsert error (non-fatal): null value in column "adjusted_punch_at" of relation
"lifelenz_punch_edits" violates not-null constraint
```

Root cause, measured against real Postgres behavior rather than assumed: when a column is made
part of a `PRIMARY KEY`, Postgres sets that column's `NOT NULL` attribute as a side effect — a
real `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` under the hood, not a property of the
constraint itself. The first bug's fix (`DROP CONSTRAINT lifelenz_punch_edits_pkey`) removed the
*constraint* that originally caused `adjusted_punch_at` to become `NOT NULL`, but **dropping a
constraint does not revert a column-level `NOT NULL` that was already set** — that flag is
independent of whatever caused it and stays until explicitly dropped. The `seq` fix built on top
of that wrong assumption, so the underlying `NOT NULL` was never actually cleared across either
of the first two migrations.

**Fix:** added `alter table ... alter column adjusted_punch_at drop not null;` as its own
explicit step in the migration.

**Not yet re-verified:** whether this THIRD fix actually resolves it — re-run the migration in
Supabase, then re-trigger the sync and check `[punch-audit] ✓ N/M` confirms all 26 active stores
(the 7 originally-failing ones, plus confirmation the Role Rate Operation duplicate pair at store
13113 now saves as 2 distinct rows, not 1 overwritten or 1 dropped).

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
