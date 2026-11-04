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
