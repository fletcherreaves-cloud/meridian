---
name: finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04
description: "First live run of the LifeLenz Payroll Readiness pull failed on every store -- root cause, the fix shipped, and a real open question about the table's primary key that still needs the owner's attention."
metadata:
  type: finding
---

# LifeLenz Payroll Readiness pull — first live run failed on every store (2026-11-04)

## What happened

Task #85 Phase 1 (`scripts/lifelenz-payroll-readiness-pull.mjs`, `supabase/schema-lifelenz-
payroll-readiness.sql`) merged earlier this session, explicitly flagged as unvalidated (no
`LIFELENZ_TOKEN` in any agent session, so it could never be live-tested before merge). The owner
ran the SQL and manually triggered the GitHub Action today. It failed completely: **27 of 28
stores failed, 0 rows saved anywhere**, the 28th had zero rows in its window (not a failure, just
nothing posted yet).

Every failing store hit the identical Postgres error on every upsert attempt:
```
[supabase] upsert error for <loc>: ON CONFLICT DO UPDATE command cannot affect row a second time
```

Critically, **this was not an auth/token problem** — every store's log line showed real parsed
row counts (e.g. "COTTONDALE (loc 0035242): 1905 payroll row(s) parsed, 0 saved") — the LifeLenz
Data Explorer pull itself worked exactly as designed; the token pulled real data. The failure was
100% on the Supabase write side.

## Root cause

`upsertRows()` batched all of a store's parsed rows into 500-row chunks and called
`supabase.upsert(slice, { onConflict: 'loc,geid,pay_period_start' })` once per chunk. Postgres
cannot apply `ON CONFLICT DO UPDATE` twice to the same conflict-target key within a single bulk
statement — if two CSV rows in the same 500-row chunk shared a `(geid, pay_period_start)` pair,
the ENTIRE chunk's upsert failed, and the old code just `continue`'d past it, discarding all 500
rows (good and bad alike) with zero partial credit.

`parsePayrollReadinessCSV` itself does no deduplication — it pushes one row per CSV line,
directly from whatever `geid`/`pay_period_start` that line carries, with no aggregation step.

## A deeper open question, not resolved here

The sheer VOLUME of parsed rows is the real flag worth the owner's attention: 1905-4313 rows
parsed per store over a ~60-day/~4-pay-period window. A single McDonald's store's headcount is
nowhere near large enough for "one row per employee per pay period" to produce that many rows —
back-of-envelope, even a generously-staffed 80-employee store × 4 pay periods is only ~320 rows,
roughly 6-18x fewer than what was actually parsed.

This strongly suggests the real LifeLenz "Payroll Readiness" report's row grain is **finer** than
this table's `(loc, geid, pay_period_start)` primary key assumes — e.g. possibly one row per
shift, per day, or some other sub-dimension not currently in `PROMOTED_MEMBERS`/the table's real
columns, with `pay_period_start` just repeated on every finer-grained row rather than uniquely
identifying it. This is EXACTLY the kind of thing `schema-lifelenz-payroll-readiness.sql`'s own
header already flagged as a real risk: *"Do NOT treat this table's real data, once it exists, as
validated until a live GetReportMeta dispatch... confirms the real reportKey and field members
match"* — this volume mismatch is new, additional evidence for that same open question, not a
new problem.

**Not fixed in this pass, deliberately:** changing the table's primary key is a real schema/DDL
decision (which column(s) would need to be added, and whether raw rows need to be inspected
first to find the real grain) — DDL is never an agent's own action in this repo, and guessing the
right column to add without seeing actual conflicting raw rows would be exactly the kind of
unvalidated guess this codebase's standing rules warn against.

## What was fixed

`upsertRows()` now falls back from a dead whole-chunk bulk upsert to row-by-row upserts for that
one chunk — same `onConflict`/last-write-wins semantics the bulk upsert already used, just
applied one row at a time so a single colliding pair can no longer sink up to 499 otherwise-good
rows with it. It also now logs, per store, what fraction of parsed rows collided on
`(geid,pay_period_start)` and were overwritten by a later row in the same pull — loudly, as a
real signal to watch, not silently absorbed.

## What to do next (owner, once this ships and the Action is re-triggered)

1. Re-run the "LifeLenz Payroll Readiness Pull" GitHub Action.
2. Read the new `[lifelenz-payroll-readiness-pull] <loc>: N/M row(s) (P%) collided...` warnings
   this fix adds. If the collision rate is small (a handful of genuine duplicate re-postings),
   this table's data is probably fine to trust as-is. If it's large (the row-count math above
   suggests it will be, plausibly 80%+), the table's real grain needs live investigation — likely
   a raw GetReportMeta dispatch plus inspecting a handful of actual colliding CSV rows side by
   side to see what column actually differs between them — before task #85's overtime-correlation
   work builds on this data.

## v2 (same day) — the first fix above was itself wrong, measured not guessed

The re-triggered Action (after the fix above merged) was watched live rather than assumed
successful. Two real defects in the first fix, found by reading its full run log rather than
trusting the "no errors, so it's fine" absence of a loud warning:

1. **The collision rate wasn't small — it was 100%, every chunk, every store.** The live log
   showed `bulk upsert error ... falling back to row-by-row` for literally every 500-row chunk of
   every one of the 6 stores that got through before the run timed out (MARIETTA, TECUMSEH,
   HARRAH, HOLDENVILLE, TISHOMINGO, CHIPLEY — 1453-2297 rows each). This is much stronger,
   directly measured confirmation of the grain-mismatch question above — not just the row-count
   inference, but every single bulk write actually colliding.
2. **The "loud collision logging" the first fix promised never fired, for a structural reason:**
   a single-row upsert always succeeds even when it silently overwrites a sibling row from the
   same batch written moments earlier under the same key — there is no SQL-level conflict with
   only one row in flight. `collisions = rows.length - saved` could therefore never detect a
   collision; every store's log showed `rows.length` rows parsed and `rows.length` rows "saved,"
   with zero collision warnings, even though every bulk chunk had just failed for exactly that
   reason. The diagnostic was dead code that happened to never do what its own comment said it
   would.
3. **Performance:** row-by-row upserts take roughly 50 seconds per 500-row chunk (one HTTP round
   trip per row). At 1453-4313 rows/store across 28 stores, the full run would need well over an
   hour; the job's own 20-minute timeout killed it after only 6 of 28 stores finished.

**Real fix (shipped as v2, same commit cycle):** de-duplicate the parsed rows **in memory**
before any upsert, by `(geid,pay_period_start)`, keeping the last row seen per key — identical
last-write-wins semantics to what the bulk upsert already does, just computed cheaply (one pass
over an array) instead of discovered expensively (a failed bulk statement, then hundreds of
individual round trips). This restores full bulk-upsert speed (row-by-row is now only a
defensive fallback for a genuinely different, unexpected error, not the normal path) and, because
the collision count now comes from comparing keys directly rather than inferring it from
upsert success/failure, it can actually produce the accurate per-store collision rate the first
fix only promised.

**Still true, now with stronger evidence:** this does not resolve whether
`(loc,geid,pay_period_start)` is really this report's unique key — it's the opposite, in fact:
a 100% per-chunk collision rate across every store measured so far is a LOUDER signal that the
real grain is finer than this table's PK assumes. Watch the new (now-accurate)
`N/M row(s) (P%) shared a key` warnings on the next run; if the rate stays near 100%, this table's
primary key genuinely needs the owner's attention (live GetReportMeta + raw row inspection) before
trusting its totals for task #85's overtime-correlation work — collapsing to last-write-wins keeps
the pull from failing outright, but it is very likely discarding real data, not just resolving
incidental re-postings.

## v2 confirmed live, full district (2026-11-05) — the grain mismatch is real, not a guess

v2 shipped (PR #1662) and the Action was re-triggered a third time. Operationally, the fix worked
exactly as intended: the pull step finished in ~70 seconds (vs. timing out after over 20 minutes
on v1), and all 28/28 stores completed with at least one row saved.

But the collision rate, now measured across **every single store in the district, not just the 6
that got through before v1 timed out**, is remarkably consistent: **86-88% on every store, no
exceptions** (e.g. ARDMORE-BROADWAY 2306/2648 = 87%, ADA-COUNTRY CLUB 3803/4313 = 88%, SULPHUR
1458/1667 = 87% — the full 28-store list is in the run's own log, `run_id 41939299809`). Total:
**8,132 rows saved** across the whole district, out of a much larger parsed total — roughly 1 row
survives dedup for every ~7-8 rows parsed. This is no longer an inference from row-count math or
a 6-store sample; it is the full, complete, live measurement.

**The pull-outcome tracker (the same shared `makeOutcomeTracker` machinery every LifeLenz/QSRSoft
pull uses, with its own pre-existing 25% per-store data-loss threshold) correctly marked this run
as a failure — 27/28 stores saved less than 25% of what was parsed.** This is NOT a bug to silence
or a threshold to loosen: it is the tracker doing exactly its job, refusing to call a run "clean"
when ~87% of the real data it pulled was just discarded as a key collision. Making this run report
"success" by adjusting the threshold, skipping the check, or otherwise suppressing the signal would
hide a real, now-confirmed data-completeness problem, not fix one — not done here.

**Where this actually stands (as of the sections above):** the pull is now operationally healthy
(fast, no timeout, no total-zero failures, honest accounting), but the TABLE's data is very likely
incomplete under the current schema — `(loc,geid,pay_period_start)` almost certainly is not this
report's real unique key. Closing that gap needs a real schema decision (which extra column
distinguishes the ~7-8 colliding rows per key — a live GetReportMeta-plus-row-inspection question,
requiring `LIFELENZ_TOKEN` access no agent session has had so far) and is the owner's call, not
something to resolve by further guessing in this script. Until that happens, this table should be
treated as a partial/representative sample (whichever row each key's dedup happened to keep last),
not a complete payroll record, for task #85's overtime-correlation work.

## RESOLVED (2026-11-05) — the real grain, confirmed by live GetReportMeta + real row inspection

The owner added a `LIFELENZ_TOKEN` network credential to this session (`us01-connect.lifelenz.com`,
header `X-Auth-Token`) specifically to close this out. Two live calls against the real API, not
inference:

**1. `GetReportMeta(payroll_readiness_report)`** returned the real 58-column schema. It carries
`shift_date`, `clock_in_time`, `clock_out_time`, `scheduled_shifts_scheduled_shift_id` ("Shift
Id"), and `worked_shift_id`/`payroll_entry_id` ("Time Clock Id" / "Entry Id") — none of which are
in the current table. This alone was already strong evidence the real grain is per-shift, not
per-pay-period.

**2. A real `GetReportDataCsvAsync` pull** (FREEPORT, 2026-10-16→11-05, 879 real rows) proved it
directly, no inference:
- **Current PK `(geid,pay_period_start)`: 122 distinct keys for 879 rows — 118 keys collide,
  covering 875 rows (99.5%)**, consistent with the 86-88%-across-the-district measurement above.
- **`entry_id` (the report's own `payroll_entry_id` field, surfaced as "Entry Id" in the CSV):
  879 distinct values for 879 rows — unique on EVERY row, zero exceptions.** Grouping by
  `(geid, entry_id)` instead of `(geid, pay_period_start)` produces zero groups with more than one
  row.
- A real example (employee identity redacted — not needed to make the point and not something
  that belongs in a committed file): one real employee's one real pay period had **13 separate
  shifts** (spread across ~2 weeks), each a distinct row today, each with its own unique `entry_id`
  and (when worked) its own `shift_id`/clock-in/clock-out — the exact "repeated `pay_period_start`
  across many real sub-rows" shape the row-count math first flagged back on 2026-11-04, now seen
  directly instead of inferred.

**Verdict, now a measurement, not a guess:** the report's real grain is one row per
**(employee, payroll entry/shift)**, not one row per (employee, pay period). `entry_id` is the
real natural unique identifier; `pay_period_start` is just which pay period that shift's date
falls into, legitimately repeated across every shift in it.

**Still not changed here — DDL stays the owner's own action.** The concrete, now fully-confirmed
recommendation: add a `payroll_entry_id` column to `lifelenz_payroll_readiness`, re-key the table's
unique constraint to `(loc, payroll_entry_id)` instead of `(loc, geid, pay_period_start)`, and
change `upsertRows()`'s in-memory dedup key in `scripts/lifelenz-payroll-readiness-pull.mjs`
(currently `geid + '|' + pay_period_start`) to `geid + '|' + payroll_entry_id`. That one column is
already present in every `GetReportMeta` response and was already being read into `raw` JSONB on
every row pulled so far (via `PROMOTED_MEMBERS`'s existing `raw`-fallback for unlisted fields) — no
new LifeLenz-side discovery needed, just promoting a field that's already landing, unused, and
fixing the key it collapses on. Once the owner runs that migration and the script change ships,
the table stops discarding ~87-99% of real shifts and the PK collision warning this whole finding
is about should drop to ~0% on the next run.

## SHIPPED (2026-11-07) — the script-side fix + migration, both ready for the owner's migration run

Implemented the exact recommendation above, verbatim:
- `supabase/schema-fix-lifelenz-payroll-readiness-pk-2026-11-07.sql` — new migration for the
  EXISTING production table (adds `payroll_entry_id`, drops the old `(loc,geid,pay_period_start)`
  PK, deletes the pre-fix rows that have no `payroll_entry_id` value to backfill from — they were
  already a known-incomplete last-write-wins sample, not a real record worth keeping — and adds
  the new `(loc, payroll_entry_id)` PK). **Not run against production — DDL is never an agent's
  own action; this is the owner's next step**, same as every other `schema-*.sql` in this repo.
- `supabase/schema-lifelenz-payroll-readiness.sql` (the original create-table script) updated to
  match, so a fresh install gets the right schema from day one, plus its stale "UNCONFIRMED
  reportKey" header framing corrected to reflect the 2026-11-05 live confirmation above.
- `scripts/lifelenz-payroll-readiness-pull.mjs`: `payroll_entry_id` added to `GATE_MEMBERS` (header-
  row detection now requires it) and `PROMOTED_MEMBERS` (promoted to its own column instead of
  sitting unused in `raw`, where it had already been landing on every row pulled so far); the
  in-memory dedup key and both `onConflict` targets (bulk + row-by-row fallback) changed from
  `geid+pay_period_start`/`'loc,geid,pay_period_start'` to `geid+payroll_entry_id`/
  `'loc,payroll_entry_id'`; a row now also skips if `payroll_entry_id` is missing, same as the
  existing `geid`/`pay_period_start` gate.
- Tests (`dispatch-lifelenz-payroll-readiness-2026-11-04.test.js`) extended: a new test proving two
  rows that share `(geid,pay_period_start)` but carry distinct `payroll_entry_id` values both now
  survive parsing (the exact real-world shape this whole finding is about — one employee, one pay
  period, multiple real shifts), and a new test for the missing-`payroll_entry_id` skip path.

**What happens next, concretely:** once the owner runs the new migration file against production,
the next scheduled/triggered run of the pull Action will upsert real rows under the real key —
replacing the deleted incomplete sample with the genuine, complete one. No further code change
needed on this repo's side; this finding is closed pending that one owner action.
