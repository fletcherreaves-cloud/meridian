# labor_pct 30-day movement tail contamination (#236)

`scripts/measure-coaching-noise-threshold.mjs` found labor_pct's ordinary 30-day-movement
distribution had a contaminated tail: p90→p95 jumps 3.698pp→10.650pp, p99 is 19.497pp — a step
change in kind, not degree, and mean (1.940pp) sitting way above median (0.841pp) confirms heavy
right skew a genuine operational distribution wouldn't show. This blocks labor coaching verdicts
(#208) and casts doubt on every panel that reads `labor_pct`. Per the repo's standing rule, this
was found by dumping and reading actual rows, not by theorizing about candidate mechanisms first.

## Method

`scripts/dump-labor-movement-outliers.mjs` (new, forks `measure-coaching-noise-threshold.mjs`'s
exact windowing) prints the top-N labor_pct 30-day movements with both window endpoints, both
trailing-30 values, each window's observation count, and every individual row inside both windows.

Top-50 output immediately showed an unambiguous pattern: trailing-30 windows ending late
June/early July 2026 read ~0–2% labor (n=30 real observations each, not a thin-window artifact —
the guard was holding), while the paired 30-days-earlier window read a normal ~21–24%. A store
cannot run near-0% labor for 30 straight days; this was a data-pipeline defect, not operations.

Pulled the raw `labor_rows` history for one flagged store (6838, June–July 2026) directly:
`labor_pct=0, tpph=0, ot_hrs=0` on **every single day** from 2026-06-01 through 2026-07-11 (41
consecutive calendar days, no gaps — weekends included), while `sales` was real and varied
normally ($9,089–$19,880/day). From 2026-07-12 on, real values resume intermittently (0.21,
0.2553, 0.2259, 0.2251, 0.2079, 0.2794 — all plausible 20–28% labor) interleaved with *more*
zero-stub days (07-20, 07-22, 07-23) — a chronic, recurring pattern, not a one-time outage.

## Root cause — traced to the exact line, not assumed

`src/parsers/index.js`'s `parseSalesLedger()` (the QSRSoft **Sales Ledger** channel-mix report
parser — a completely different report from **Labor Analysis**) stamped every row with a hardcoded
labor stub:

```js
// Labor fields stub — Sales Ledger has no labor data
laborPct:0,actHrs:0,otHrs:0,tpph:0,spph:0,
```

`src/engine/pipeline.js:578` merges Sales Ledger rows straight into `ds.laborRows`:

```js
else if(type==='sales-ledger') ds.laborRows.push(...parseSalesLedger(wb,filename));
```

This is intentional plumbing, confirmed by the Data Manager panel's own UI (`analytics.js`
~line 1679: *"Sales Ledger row — count = files ingested, tooltip explains data merges into Labor
Analysis"*) — Sales Ledger's `sales` figure was meant to supplement Labor Analysis history when
that report lags, the same intent `supplementLaborWithSched` (App.js, DAR-based) now serves more
safely. The bug is that the labor-field stub was a literal `0`, not `null` — a "this store ran 0%
labor today" claim, not an honest "unknown."

`src/app/App.js`'s manual-upload path then pushed the newly-merged rows straight to the
`labor_rows` Supabase table:

```js
_freshLaborRows.push(...currentDS.laborRows.slice(_bL));
...
if(_freshLaborRows.length>0) saveLaborRows(_freshLaborRows)...
```

`saveLaborRows` (`src/lib/supabase.js`) maps `labor_pct: r.laborPct ?? null` — `0 ?? null` is `0`,
not `null` — so the stub got written verbatim. The table upserts on `(loc, report_date)` and
Postgres/PostgREST upsert replaces every column present in the payload on conflict, so a Sales
Ledger upload for a date that already had a real Labor Analysis row **silently overwrote it** with
the false zero; for a date with no prior row, it filled one in that reads as "0% labor" everywhere
that trusts `labor_rows.labor_pct` directly.

**Why this was never visibly noticed in the live app:** `metric-source.js`'s `laborPct` chain
(`glimpseRows → ctrlRows → laborRows`) uses `mode:'pos'` — the comment there is explicit: *"a real
value is > 0 (sales, gc, speed times, %s that are never legitimately 0)"* — so the resolver already
treats a stub `labor_pct===0` as invalid and falls through to the next source. Any panel sourced
through the shared `metricDaily`/`metricAvg`/`metricSeries` helpers was protected by construction.
The exposure is (a) the persisted `labor_rows` table itself (which the coaching-noise measurement
scripts, and any future coaching-loop code, read directly — not through metric-source), and (b) any
panel that reads `ds.laborRows` directly rather than through the shared helper (several exist in
`analytics.js`, not fully audited here — out of scope for this incident, in scope for the standing
"source through shared helpers" sweep).

`src/lib/supabase.js`'s `loadSalesLedger()` (the cloud loader for `sales_ledger_daily`, the emailed
pipeline's table) carried the identical `laborPct:0,...` stub for consistency with the client
parser, but nothing currently reads `ds.salesLedgerRows.laborPct` as a metric-source input — fixed
for hygiene/future-proofing, not because it was live-corrupting anything today.

## Measured — count of affected store-days

```sql
labor_pct = 0 AND sales > 0
```

**994 rows**, out of 42,156 total `labor_rows` (2.36%), **all 27 stores affected**, spanning
**2025-01-22 through 2026-07-23** — an 18-month chronic pattern, not a recent-only outage (the
June–July 2026 block found first was just the most recent, most visible batch). Every one of the
994 also has `tpph=0 AND ot_hrs=0` — the pure stub signature, verified before writing the cleanup
script so no partial-real-data row could be swept up by accident. Per-store counts range 22–46
(OK stores ~44–46, FL stores ~22–25, roughly proportional to each store's total history length —
evenly distributed, not concentrated in a market or a handful of stores).

## Fix — three layers, per the #192 padding precedent (fix root cause, not the symptom)

1. **Parser** (`src/parsers/index.js`, `parseSalesLedger`): labor fields are now `null`, not `0`,
   and the row is tagged `_salesLedgerSupplement: true`.
2. **Cloud loader** (`src/lib/supabase.js`, `loadSalesLedger`): same null fix, for consistency.
3. **Save path** (`src/app/App.js`, the manual-upload merge): `_freshLaborRows` now excludes
   `_salesLedgerSupplement` rows before calling `saveLaborRows` — Sales-Ledger-only rows stay in
   the in-memory `ds.laborRows` (still usable there for same-session DI-calibration continuity) but
   never reach the `labor_rows` table, where an upsert could blank out or fabricate a real
   percentage. `supplementLaborWithSched` (DAR-based, already verified 2026-08-04 against real
   overlap days) already covers "sales when Labor Analysis lags" without ever touching this table,
   so nothing is lost by keeping this narrower.

New regression test: `src/__tests__/sales-ledger-labor-stub.test.js` (4 tests) — asserts
`parseSalesLedger`'s output has `laborPct===null` (never `0`) on every row, asserts the
`_salesLedgerSupplement` tag is present, and source-parses the function body to guard against the
literal `laborPct:0` stub ever being reintroduced.

## Cleanup of the 994 already-corrupted rows — script ready, NOT yet run

`scripts/cleanup-labor-pct-stub-zeros.mjs` (`--dry` by default until re-run without the flag) nulls
`labor_pct`/`tpph`/`ot_hrs`/`ot_dollar` on exactly the 994 rows matching the verified signature
(`labor_pct=0 AND sales>0`, confirmed `tpph=0 AND ot_hrs=0` on all of them), leaving `sales`/`loc`/
`report_date` untouched. This corrects a false zero to an honest "unknown" — it does **not**
attempt to recover whatever real percentage may have originally existed for an overwritten date,
since that value is not reconstructible from this table once overwritten.

**Per this repo's own established precedent** (v4.839: *"does NOT run the two scripts, needs the
owner's go-ahead"* — a decision that survived its session specifically because it was written down
here rather than left in chat), **this script has been dry-run and verified but not executed
against production.** Writing to 994 live rows is a real, only-partially-reversible action on
shared data; running it needs the owner's explicit go-ahead, not an agent's unilateral judgment
call mid-session.

## Still open — per the issue's Definition of done

- [ ] **Run the cleanup script** (owner go-ahead required) — `node scripts/cleanup-labor-pct-stub-zeros.mjs` (no `--dry`)
- [ ] **Re-run the measurement post-cleanup** — both `scripts/measure-coaching-noise-threshold.mjs`
      and `scripts/measure-district-relative-noise.mjs` (#237) should be re-run against labor_pct
      once the 994 rows are nulled, and the corrected distribution posted to #236. The #237
      district-relative result for labor (2.30x reduction, driven almost entirely by the p95/p99
      tail) should be treated as provisional until this re-run — the tail this cleanup targets is
      exactly the region driving that number.
- [ ] **Audit direct `ds.laborRows` consumers** in `analytics.js` that don't go through
      `metric-source.js`'s `mode:'pos'` protection — not fully audited in this pass; the live-app
      blast radius for those specific call sites is unconfirmed (metric-source-sourced panels are
      confirmed safe by construction, see above).
- [ ] Only after the above: propose a labor coaching threshold, informed by the corrected
      distribution — not before.

## Related

- #208 — the coaching loop; labor verdicts stay off until this closes
- #237 (`memory/project-noise-measurement-237.md`) — the companion district-relative-noise gate;
  labor's result there needs revisiting once this cleanup lands
- `memory/project-labor-pct-punched-vs-crew.md` — the Crew/Punched/Total basis question (a
  different, real, separate concern from this incident — not the cause here)
- `memory/feedback-measure-dont-reason.md` — the standing rule this investigation followed
