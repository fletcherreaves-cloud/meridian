---
name: project-hourly-projection-accuracy
description: Projection Accuracy report (Signals tab) — a small daily-accumulating table + scheduled job + UI panel that tracks whether QSRSoft/LifeLenz's hourly sales/GC projections are systematically biased by hour-of-day, without re-scanning the large raw qsr_daily_activity table.
metadata:
  type: project
---

# Hourly Projection Accuracy (shipped 2026-08-09)

## Why this exists

Grew out of a live investigation into `signals.js`'s `pacePct`/`gcPacePct` noise (data-integrity
sweep signature #1, see `memory/plan-data-integrity-sweep.md`). Confirmed cumulative-so-far is the
right framing for that live "Pace vs Plan" indicator — no code change needed there. But along the
way, measured (7-day sample, district-wide) a **standalone, non-cumulative** per-hour bias that
looked genuinely systematic, not just noisy:

```
3p-4p  bias -12.2%    4p-5p  bias -8.0%    5p-6p  bias -11.1%    6p-7p  bias -9.5%    7p-8p  bias -11.0%
```

Five straight afternoon/dinner hours running 8-12% under the QSRSoft projection, every one of the
8 sample days. Late night (9p-11p) showed the opposite: **+5% to +11%**. That's a shape, not
scatter — a real candidate for "QSRSoft/LifeLenz's hourly curve is off here, worth manually
overriding" (owner's own framing). But 8 days is nowhere near enough to confirm it — this feature
exists to accumulate that evidence over weeks/months, cheaply.

## The core design constraint

`qsr_daily_activity` (the raw hourly source, ~367k+ rows) times out on `dt`-filtered reads past
~30 days — confirmed live, repeatedly, this session (60-day pull that worked earlier in the
session failed on a later attempt; had to fall back to 7 days). The root cause was ALREADY
diagnosed in a prior session: `supabase/schema-qsr-daily-activity-index.sql` (dated 2026-08-07)
documents that the table's primary key is `(loc, dt, hour_slot)` — loc-leading — so every
`dt`-filtered query (which is every query this table serves) forces a full sequential scan.
**Unclear whether that index fix has actually been run in Supabase** — if the timeouts persist,
check `select indexname from pg_indexes where tablename='qsr_daily_activity'` for
`qsr_daily_activity_dt_idx`; if it's missing, running that file would help this AND the app's live
queries generally, not just this report.

Rather than depend on that (or re-fight the timeout every time this report is opened), this
feature computes and stores a **small, purpose-built rollup**: one row per `(dt, hour_slot, loc)`,
~675 rows/day, appended once daily. A `dt`-leading index from day one avoids repeating the mistake
that broke the source table.

## What shipped

1. **`supabase/schema-hourly-projection-accuracy.sql`** — the table. RLS uses the simple,
   self-contained pattern (`org_events`'s original style — `exists(select 1 from profiles...)`),
   NOT the heavier RESTRICTIVE + `my_locs()` pattern `qsr_daily_activity` and its 51
   perf-critical siblings use (`schema-rls-phase2-loc.sql`) — this table is nowhere near the row
   count that pattern exists to survive. Sweep it into that migration + the multi-tenant phase
   list later if/when it actually needs that treatment (the same path `org_events` took — it
   started simple too, see `schema-multitenant-phase1.sql`/`phase2-rls.sql`'s table lists).
   **Owner action: run this once in the Supabase SQL editor** (nothing auto-creates it).
2. **`scripts/compute-hourly-projection-accuracy.mjs`** — reads ONE day (`eq('dt', DATE)`, not a
   range — stays fast even against the un-indexed source table) from `qsr_daily_activity`,
   upserts into the new table. `HPA_DATE` env override, `--dry` flag. Follows
   `scripts/eom-snapshot-pull.mjs`'s conventions (pure-Supabase-read, no QSRSoft auth, `withRetry`).
3. **`.github/workflows/hourly-projection-accuracy.yml`** — daily cron at 11:00 UTC (~6am CT,
   after the prior day's data pulls finish), `workflow_dispatch` with a date override for backfill.
   Uses the existing `SUPABASE_SERVICE_ROLE_KEY` GitHub secret (no new secret needed).
4. **`src/engine/projection-accuracy.js`** — pure stats engine: `districtHourlyRatios` (sums all
   stores per date+hour first, then one ratio — not an average of ratios),
   `perStoreHourlyRatios` (no cross-store summing), `hourlyBiasTable` (groups by hour, adds a
   `bias = median - baseline` column alongside the usual percentile/IQR spread). 9 unit tests.
5. **`loadHourlyProjectionAccuracy()`** in `src/lib/supabase.js` — paginated read of the new table.
6. **UI**: new "📐 Projection Accuracy" tab in Signals (`ProjectionAccuracyTab`, next to Live Ops).
   Window selector (7/14/30/60/90 days — all equally fast, unlike the raw table), $ Sales / Guest
   Count toggle, district-wide vs per-store scope. Browser-verified: renders, tab switches, window/
   metric/store controls all interactive, no console errors. Couldn't verify live data rendering
   from this session (this sandboxed browser's network path to Supabase differs from the Node/Bash
   scripts' — separate from the schema itself not existing yet either way).

## A real bug found and fixed along the way

Building `hourLabel()` for this feature, a test caught: `hour_slot` runs **past 24** for a store
whose business day is still open after midnight — confirmed live (the "12a-13p", "1a-14p",
"2a-15p", "3a-16p" garbled labels in this session's own earlier `measure-denominator-floors.mjs`
output were exactly this bug, not noticed until this test). Owner confirmed the mechanism:
**operational hours run 4am to 4am** — `hour_slot` counts continuously from the 4am open (slot 5 =
"4a-5a") through the following 4am close (slot 28 = "3a-4a" next day), so hours 25-28 are
1am/2am/3am/4am of the *next calendar day*, same business day. The existing hour-formatting
helpers never wrapped the DISPLAY back to a real clock hour for that tail — slot 25 rendered
`"13p"` (not a real time) instead of `"1a"`. Fixed in 5 places sharing the same
`parseInt→format` shape, all with the identical one-line fix (`% 24` before formatting, sort order
unaffected — slot 5→28 ascending is already the correct business-day sequence):
- `src/views/graded-visits.js` `hourLabel`
- `src/views/signals.js` `slotLabel` (Baseline Anomalies) + the inline `fmt` in the hourly DAR table
- `scripts/measure-denominator-floors.mjs` `printHourBuckets`
- (new) `src/engine/projection-accuracy.js` `hourLabel` — written correctly from the start

**Flagged, NOT fixed — unconfirmed, needs a live check before touching:**
`src/views/dt-speedofservice.js`'s `HOUR_LABELS` is a static lookup keyed by `"05:00"`-style
strings (`'06:00':'6am'`, etc.), a completely different shape than the `parseInt`-based helpers
above. If `qsr_daily_activity.hour_slot` is actually stored as bare integers (which the garbled-label
evidence above strongly suggests, given `(+a)-(+b)` numeric sort worked cleanly on it), this lookup
would NEVER match and `HOUR_LABELS[slot] || slot` would silently fall through to displaying the
raw number every time. Did not confirm this against a real `hour_slot` value from this session —
flagging for a future session to check with a live query
(`select distinct hour_slot from qsr_daily_activity limit 5`) before assuming it's broken.

## Open follow-ups

- Owner needs to run `schema-hourly-projection-accuracy.sql` before the workflow can write anything.
- Once it's run, the GitHub Action needs at least one firing (or a manual `workflow_dispatch`) before
  the report shows real data — consider backfilling a few weeks via repeated `HPA_DATE` dispatches.
- The 8-day afternoon-bias pattern that motivated this feature is a LEAD, not a confirmed finding —
  revisit once a few weeks of real data have accumulated, ideally split by day-of-week too (a
  weekday dinner rush likely differs from a weekend one — not built in this pass).
- Check whether `schema-qsr-daily-activity-index.sql` has actually been applied (see above) —
  independent value beyond this feature.
- The `dt-speedofservice.js` `HOUR_LABELS` concern above.
