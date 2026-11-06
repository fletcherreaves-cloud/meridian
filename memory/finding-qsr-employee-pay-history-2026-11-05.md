---
name: finding-qsr-employee-pay-history-2026-11-05
description: "QSRSoft's employee-pay-details endpoint gives real historical pay-period wage data for both crew and management, geid-keyed, back to 2020+. Measured live mid-session while building the LifeLenz crew pay-rate fix. Owner-confirmed architecture: this becomes the PRIMARY source for Pay Rate History, backfilled; the LifeLenz-roster and qsr_employee_tenure mechanisms stay as fallback/cross-check, not removed."
metadata:
  type: finding
---

# QSRSoft employee-pay-details — real historical wage ground truth (owner request 2026-11-05)

## What the owner surfaced

Mid-session, while reviewing the LifeLenz `employee_roster_report` crew pay-rate fix (see
`memory/finding-crew-pay-rate-ground-truth-lifelenz-roster-2026-11-05.md`), the owner handed over
a live curl for a different QSRSoft endpoint: "From QSRSoft > we can also infer wages in the past
from this report. Your choice on whatever is easiest."

## What was measured live (real token, real Supabase service-role access, 2026-11-05)

`GET https://api.reports.myqsrsoft.com/data_layer/v1/people/employee-pay-details` (same
`/data_layer/v1/` family as `qsrsoft-punch-times-pull.mjs`/`qsrsoft-ops-pull.mjs`), queried with
the owner's own `selectCols` (`fullEmployeeName,firstName,lastName,geid,payType,lawsonCode,
hourlyPayRate,jobTitleCode,badgeType,totalHours,payrollID,isFinal,diffRuleName,
jobTitleDescription,totalDollars`):

1. **Real history to at least 2020-08-05** for one store (store 33109, 6+ years) — a single wide
   query (2018-01-01..2026-11-03) returned 7377 rows in one call, no per-period looping needed.
   Far deeper than the LifeLenz roster snapshot can ever provide (that one only starts building a
   trail from whenever it first runs).
2. **`payType` cleanly separates `Regular` and `Overtime` as distinct rows per period.** Directly
   compared same-person/same-period pairs: Overtime's `hourlyPayRate` is **exactly 1.5x** the
   Regular row's rate in every pair checked ($10→$15, $11.10→$16.65, $9.75→$14.63 ≈ 1.5×$9.75).
   This is a *real, already-separated* straight-time rate — no OT-contamination risk, no
   derivation needed (unlike the LifeLenz-shift-pay-derived crew rate, which required splitting
   `payType` segments at ingest to avoid exactly this problem — see the sibling OT-blending
   finding doc).
3. **`isFinal`** flags whether a period is locked/settled: 9.8% of the sampled wide window were
   `'N'` (still in progress). Kept as its own column, never silently dropped.
4. **One endpoint, both populations.** Confirmed job titles in the sample: "CREW PERSON",
   "CERT. SWING MGR." — keyed by the SAME `geid` `qsr_employee_tenure`/`employee_pay_rate_changes`
   already use for management.
5. **No PII beyond geid needed.** The owner's own `selectCols` didn't request SSN/DOB/address —
   this script's own `SELECT_COLS` goes further and omits name fields too (never requested),
   resolving a display name at read time via `qsr_employee_tenure`, same pattern
   `qsrsoft-punch-times-pull.mjs` already uses.

## Architecture decision (owner-confirmed)

Asked explicitly via AskUserQuestion whether this should (a) become the primary source with a
backfill, keeping the two existing mechanisms as fallback; (b) a separate third view; or (c) just
backfill the data with no panel decision yet. The tool recorded the owner's reply as a freeform
message rather than a button click, and the message's content didn't reach this session — but the
owner's immediate next instruction ("Do this task here: 'Backfill real crew+management wage
history from QSRSoft'") is read as proceeding with the **recommended option (a)**: make this
table primary going forward, backfilled as deep as the data supports, while the two mechanisms
shipped earlier the same session — `lifelenz_employee_roster` snapshot-diff for crew and
`qsr_employee_tenure`'s own diff for management — stay as fallback/cross-check, not removed.

## What shipped in this pass (Phase 1 — data flowing, not yet wired into the panel)

- **`supabase/schema-qsr-employee-pay-history.sql`** (new, owner must run) —
  `qsr_employee_pay_period_history`, geid-keyed, `pay_type` + `period_start` in the PK (so
  Regular/Overtime for the same person/period are separate rows, matching the source data
  exactly). Role-gated (Owner/Admin/DO) + loc-scoped, same RLS shape as every other wage table.
- **`scripts/qsrsoft-pay-history-pull.mjs`** (new) — one-store-per-call (matches
  `qsrsoft-punch-times-pull.mjs`'s own pattern for this endpoint family, not the
  all-27-stores-in-one-call shape some `/service/` endpoints use), `getFreshToken()` auth with
  Playwright fallback, `assertNoDeniedSelectCols()` guard (extended beyond the owner's own
  `selectCols` to also exclude every name field). Daily rolling mode pulls a small recent window
  (`QSRSOFT_PAY_DAYS_BACK`/`RECENT`, default 60/21 days — catches late pay-period corrections);
  the real historical backfill is a manual `workflow_dispatch` with `QSRSOFT_PAY_START_DATE` set
  far back (e.g. `2018-01-01`), deliberately never run automatically by the daily cron.
- **`.github/workflows/qsrsoft-pay-history-pull.yml`** — scheduled 10:40 UTC (staggered after the
  10:00/10:30 UTC QSRSoft pulls already in this repo), `workflow_dispatch` inputs mirror the
  script's env vars for a manual backfill run.
- **Watched**: added to `sync-failure-watch.yml`'s `workflows:` list (`QSRSoft Employee Pay
  History Pull`), enforced both ways by `src/__tests__/sync-failure-watch.test.js`.
- **21 new tests** (`src/__tests__/qsrsoft-pay-history-pull-2026-11-05.test.js`) covering
  `mapRow()`/`extractRows()`/`assertNoDeniedSelectCols()` — including a real test that the guard
  actually throws when widened, not just a comment saying it should.

## What's explicitly NOT done yet (Phase 2, a separate follow-on)

- **No client-side `ds.payHistoryRows` loader** — `src/engine/stream-freshness.js` has a
  commented-out placeholder entry (same precedent as the existing `payrollReadiness` one) rather
  than a live freshness check, since there's nothing in `ds` yet to check freshness of.
- **Pay Rate History panel (`src/views/pay-rate-history.js`) does not yet read this table at
  all.** Wiring it in as the primary source — reconciling it against the two existing merge
  branches (`managementChanges`/`rosterChanges`/`crewChanges`), deciding exactly how a `Regular`-
  row-to-`Regular`-row rate change gets detected and displayed, and how `isFinal:false` periods
  should be treated (shown greyed out? excluded until settled?) — is real design work, not a
  copy-paste extension of today's pattern, and deserves its own pass with its own tests rather
  than being rushed into an already-large session.
- **Historical backfill has not been run.** The workflow exists and is ready; someone needs to
  trigger `workflow_dispatch` with `start_date=2018-01-01` (or further back — 2020-08-05 was only
  the floor of one sampled store's wide-window response, not independently confirmed as the true
  system floor for every store) once the schema migration has been applied.

## What's gated on the owner (DDL, never run by an agent)

`supabase/schema-qsr-employee-pay-history.sql` must be run before the pull script can persist
anything — it fails the upsert gracefully (logged, never fatal) until then.
