---
name: finding-crew-pay-rate-ot-blending-2026-11-05
description: "Real wage-accuracy bug in the just-shipped Pay Rate History panel (owner-caught live): the crew $/hr rate blended regular and overtime earnings, and overtime is genuinely paid at 1.5x -- measured directly against real lifelenz_payroll_readiness rows, not assumed. Root cause, the fix, and what's still gated on the owner's own DDL action."
metadata:
  type: finding
---

# Pay Rate History blended regular + overtime pay into one $/hr rate (owner-caught 2026-11-05)

## What the owner caught

While entering a round of OK-only raises (effective 11/04/26) by hand, the owner asked: "we need
to determine actual rate of pay as differed from overtime pay (time and a half) and make sure we
report accurate wages." This was a real, live concern about the crew side of the Pay Rate History
panel (`src/views/pay-rate-history.js`), shipped earlier the same day.

## Root cause, measured not assumed

`src/engine/employee-pay-history.js`'s `weeklyCrewRates()` computed one dollar-weighted $/hr rate
per employee per week as `Σearnings / Σhours` across every shift segment that week — with no
regard for LifeLenz's own `payType` field (`'regular'` vs `'overtime'`) on each segment. That
field IS fetched by `scripts/lifelenz-pull.mjs`'s `SHIFTS_QUERY` and IS already used to split
regular/OT hours in two sibling functions in the same engine file
(`rollupShiftsByRole`/`rollupShiftsByEmployee`) — it was simply never carried through to
`shiftsForEmployeeSchedule()`, the function that feeds the per-shift `lifelenz_shift_pay` table
Pay Rate History's crew detection reads from. That table has never persisted anything beyond
`earnings`/`seconds` (confirmed via `supabase/schema-lifelenz-shift-pay.sql`), so the split was
discarded at ingest, not just at the rate-calc step.

**Overtime really is paid at 1.5x, measured directly against real production data** (service-role
read against `lifelenz_payroll_readiness`, 2026-11-05, not inferred): for every real row sampled
with `overtime_hours > 0`,
```
overtime_earnings / overtime_hours  =  1.5 × (regular_earnings / regular_hours)
```
exactly, across a dozen+ real rows spanning multiple stores (0003708, 0005183, 0005985, 0006178,
0006838) and pay periods. Examples (loc, regular $/hr → OT $/hr):
- 0005183: $14.20/hr → $21.30/hr (×1.4996)
- 0005183: $11.00/hr → $16.52/hr (×1.5016)
- 0006838: a $9.69/hr-equivalent regular portion → $24.00/hr OT portion on a 3.15h-OT shift

**Consequence for Pay Rate History (now fixed):** any week with overtime pushed the blended
crew rate ABOVE the employee's real base rate by however much OT that week happened to carry.
Since OT mix varies week to week independent of any real rate change, this could:
1. Flag a false "rate change" purely from an OT-hours swing (RATE_STEP_THRESHOLD is $0.20/hr —
   easily cleared by a blended-rate shift from OT alone).
2. Report a wrong before/after rate even for a REAL raise/cut.
3. Feed `payImpact()` a contaminated `delta`, producing a wrong $ impact figure.

## Cross-check attempted, inconclusive (documented so it isn't re-attempted blind)

Tried to directly verify whether the Shifts GraphQL endpoint's own per-segment `earnings` for a
`payType:'overtime'` segment already bakes in the 1.5x (as opposed to being corrected only in the
separate Payroll Readiness report). No `LIFELENZ_TOKEN` in this session to query the live Shifts
endpoint directly. Tried cross-referencing a specific shift between `lifelenz_shift_pay` and
`lifelenz_payroll_readiness` for the same employee/date (Zoey Pashak, loc 0006838, 2026-11-02):
found a real shift (`shift_pay`: 7.5h/$120 flat) but it did not line up cleanly with the
`payroll_readiness` row for the same employee/pay-period (7.97 worked hours, different shift_date
timestamp) — almost certainly because `lifelenz_payroll_readiness`'s own well-documented PK/grain
bug (see `finding-lifelenz-payroll-readiness-pk-mismatch-2026-11-04.md`: ~87-99% of real rows
collapsed under the wrong `(geid,pay_period_start)` key) means the one surviving row for that
employee/period isn't necessarily the SAME entry as the Shifts-sourced shift. **Not resolved
either way** — the fix below is correct regardless of the answer (splitting by `payType` can only
ever REMOVE a contamination risk, never introduce one), so this was not blocking, but it's
recorded so a future session doesn't re-attempt the same inconclusive cross-check from scratch.

## The fix (shipped)

1. **`src/engine/lifelenz-shift-jobs.js`'s `shiftsForEmployeeSchedule()`** now also computes
   `regEarnings`/`regSeconds` (Σ segments where `payType != 'overtime'`) and `otEarnings`/
   `otSeconds` (Σ segments where `payType === 'overtime'`) per shift — same per-segment check the
   two sibling rollup functions already use. `earnings`/`seconds` (the blended totals) are
   unchanged, for backward compatibility and display.
2. **`src/engine/employee-pay-history.js`'s `weeklyCrewRates()`** now derives `rate` from
   `regEarnings/regSeconds` (straight-time) whenever any shift that week carries the split
   (`hasSplit`), falling back to the old blended `earnings/hours` only for (a) pre-migration
   data with no split persisted at all, or (b) the rare week that was 100% overtime (nothing to
   divide into). Each week also carries a `rateBasis` string
   (`'straight-time'` | `'blended (100% OT this week)'` | `'blended (pre-split data)'`).
   `detectRateSteps()` carries `fromRateBasis`/`toRateBasis` through to each detected step.
3. **`src/views/pay-rate-history.js`** adds a "Rate basis" column — "straight-time" in neutral
   text, "⚠ blended" in amber with a tooltip, whenever either end of a detected step isn't a
   clean straight-time comparison — so a less-certain row is visibly flagged, not presented with
   the same confidence as a clean one.
4. **`src/lib/supabase.js`'s `loadLifeLenzShiftPay()`** passes the 4 new fields through as `null`
   (not `0`) when absent, so the engine can tell "no split persisted" apart from "zero OT this
   shift."

## What's gated on the owner's own action (DDL, never run by an agent)

`supabase/schema-lifelenz-shift-pay-ot-split.sql` adds `reg_earnings`/`reg_seconds`/
`ot_earnings`/`ot_seconds` to `lifelenz_shift_pay` (additive, nullable-with-default-0, safe to
run any time). **The owner needs to run this** for the regular/overtime split to start being
persisted and the straight-time rate to take effect for NEW data going forward.

Until it runs: `scripts/lifelenz-pull.mjs`'s `upsertShiftPayRows()` tries the richer 6-column
payload first; on a `42703` ("column does not exist") it falls back to the old 2-column shape for
the rest of that run (same degrade-gracefully pattern `loadYearlyTargets`'s `prod_sales`/
`crew_labor_pct` 42703 handling already uses in `src/lib/supabase.js`) — so the existing daily
LifeLenz sync is never at risk of breaking, migration run or not. Once the owner runs the SQL, the
very next scheduled pull starts populating the split automatically, with no further deploy.

**Historical weeks pulled before this fix have no split data and will keep showing the
pre-migration "blended (pre-split data)" fallback** until re-pulled. The pull script's existing
`LIFELENZ_START_DATE` override (see CLAUDE.md's "data depth is never the limiter, backfill it"
standing rule) can re-pull a wider window once the migration has run, to backfill the split for
recent history.

## A separate, deeper opportunity flagged but NOT pursued here

`lifelenz_payroll_readiness` (task #85's own table) already has LifeLenz's own authoritative
`regular_earnings`/`overtime_earnings`/`overtime_hours`/`worked_hours` columns — no new schema
needed there at all, and it's where the 1.5x measurement above came from. It was deliberately NOT
used to rebuild Pay Rate History's crew-rate pipeline because (a) it keys employees by `geid`,
which doesn't join to `lifelenz_shift_assignments`' `assignedEmploymentId` namespace Pay Rate
History already uses, and (b) it has its OWN documented, owner-flagged, not-yet-fixed grain bug
(same finding doc cited above) that is explicitly the owner's call, not something to layer a new
feature on top of while unresolved. Worth revisiting once task #85's grain fix lands.
