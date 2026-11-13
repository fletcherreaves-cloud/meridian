# Finding: Signals LiveOps tab mislabeled two core metrics (2026-11-13)

Owner reported (screenshot) that the Signals panel's Live Ops tab "DT Speed" number looked wrong.
Live investigation + fix, feeding into task #152 (app-wide metric/formula reconciliation) — this
file documents the root causes and the fix so #152 doesn't have to re-derive them.

## What was wrong

**"DT Speed" was never OEPE.** `aggregateByStore()` in `src/views/signals.js` computed
`dt_untilserve / dt_trans_cnt / 1000` with no subtraction at all. Per
`memory/project-qsrsoft-dar-columns.md`'s own column-factory table, that raw formula IS a real
QSRSoft metric — **"Avg DT TTL"** (`dtTTL` field id) — just not the one the label claimed. The
owner-requested metric, **OEPE W/O Parked**, is
`((dt_untilserve − dt_untilstore) − dt_heldtime) / dt_trans_cnt / 1e3`: three more raw components,
not summed anywhere in the old code. This is exactly `src/utils/oepe.js`'s `oepeSeconds()` — the
same shared, already-reconciled (r=0.9958 vs a real QSRSoft Service report) formula
`dt-speedofservice.js` and `graded-visits.js` already use. The fix imports and calls it, summing
the four raw components across a store's hourly rows first and dividing once (never averaging
per-hour ratios).

**"Accuracy" was never order accuracy.** `healthy_count / (healthy_count + unhealthy_count) * 100`
is QSRSoft's own **KVS Healthy Usage** formula (`memory/project-qsrsoft-dar-columns.md`'s KVS
table) — the % of time both kitchen prep-table sides are open and roughly balanced (≥20% of
orders each). It is the same concept `src/engine/daily-review.js` calls `kvsHealthy` and
`src/engine/metric-source.js`'s own comment (~line 164) already notes: *"Daily Glimpse calls it
`kvsHealthy`, and the auto-pulled DAR derives it from healthy/unhealthy."* The math was correct the
whole time — only the label was wrong. Renamed to **"2nd Side Healthy Usage %"** everywhere
(column header, summary strip, hourly detail, legend, export/print), explicitly flagged in the UI
as "NOT order accuracy."

## What shipped alongside the fix

`loadDailyActivity` (`src/lib/supabase.js`) select expanded from 16 to 28 columns to carry the raw
fields every new/fixed metric needs (`dt_untilstore`, `dt_heldtime`, `dt_carsheld`,
`fc_untilserve`, `fc_untilclosedrawer`, `fc_trans_cnt`, `mfy1_*`/`mfy2_*`, `prod_sales_scrubbed`,
`trans_scrubbed`, `actual_punched_dollars`) — confirmed via grep that `signals.js` is the only real
caller, so this is a safe additive change.

Five new real columns (not placeholders), all sum-raw-then-divide-once, both in the per-store
summary (`StoreRow`) and the per-hour detail (`HourlyDetail`):
- **R2P** (Front Counter Receipt-to-Present): `(fc_untilserve − fc_untilclosedrawer) / fc_trans_cnt`
- **KVS Time Per GC**: `(mfy1_untilserve + mfy2_untilserve) / (mfy1_trans_cnt + mfy2_trans_cnt)`
- **DT Parked %** (DT Pull Forward %): `dt_carsheld / dt_trans_cnt`
- **Labor %** (cost-based, Punch Labor %): `actual_punched_dollars / prod_sales_scrubbed` — kept as
  a field **separate from the pre-existing `laborPct`** (staffing level: punched ÷ needed hours),
  per owner directive never to conflate the two
- **TPPH**: `trans_scrubbed / actual_punched_hours`

"Sales" in the hourly detail renamed to **"Product Sales"** (it was already product sales by
value — just mislabeled as the generic term).

### Alert-threshold basis (none invented)

- **OEPE**: unchanged flat bands (renamed `DT_AMB`/`DT_RED` → `OEPE_AMB`/`OEPE_RED`, same 200s/240s
  values) — minimal-diff choice; the formula fix was the mandate, not a threshold redesign.
- **R2P / KVS**: reuse `dt-speedofservice.js`'s own established convention verbatim (its
  `stationBands`): green = this store's own `DEFAULT_TARGETS[loc].tR2p`/`tKvst`, amber = green+40s,
  falling back to the flat OEPE bands when a store has no target. New `secBands()`/`secColor()` in
  `signals.js` are a direct port of that logic (not re-invented).
- **DT Parked % / Labor % (cost) / TPPH**: reuse `analytics.js`'s own established `deltaColor`
  convention verbatim (actual vs `DEFAULT_TARGETS[loc].tPark`/`tLabor`/`tTpph`, within 0.5pp =
  amber, better = green, worse = red). New `targetColor()` is a direct port. A store with no target
  for one of these fields renders that metric in neutral/muted color — never a guessed threshold.

### Layout

`StoreRow`'s old fixed 6-column CSS grid (4 metrics + name + chevron) couldn't hold 9 metrics
readably. Replaced with a labeled-chip strip (`MetricCell`: small uppercase label above a
monospace value) that scrolls horizontally on narrow screens while the store name/alert badge and
toggle chevron stay pinned — satisfies the panel-contract mobile-scroll convention without a wall
of unlabeled numbers. `HourlyDetail`'s table gained `overflowX:'auto'` + `minWidth:980` for the
same reason now that it's 13 columns wide.

## Two pre-existing, unrelated latent bugs found incidentally (NOT fixed here — out of scope)

While tracing R2P/KVS field names, found that `src/engine/daily-review.js`'s `DAYPART_FIELDS`
already has its own (broken) attempt at these same two metrics:
- `r2p: { us: ['fc_untilserve', 'fc_untilcloseddrawer'], ... }` — **typo'd field name** (two d's;
  the real column, confirmed live and via `memory/project-qsrsoft-dar-columns.md`, is
  `fc_untilclosedrawer`, one d). Its source loader (`loadDtHistory`) also doesn't select that
  field at all, so this is doubly broken.
- `kvst: { us: ['mfy_time'], cnt: ['mfy_trans_cnt'] }` — these bare field names **don't exist** on
  `qsr_daily_activity` at all; only `mfy1_*`/`mfy2_*` suffixed fields exist. `mfy_time`/
  `mfy_trans_cnt` appear to be a different, pre-aggregated shape the pull script derives for a
  separate downstream table, not this one.

Also, `dt-speedofservice.js`'s own Front Counter station (`stationAvgSec`) uses raw
`fc_untilserve/fc_trans_cnt` with no subtraction for its "R2P" display — its own comments
(dispatch #128) explicitly scope that correction out as future work. Both are real, live,
independent bugs — flagged here as input to task #152, not fixed in this dispatch (different
files, not named in this directive, and fixing them risks scope creep against other concurrent
work on this same tab).
