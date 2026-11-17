# LifeLenz DAR (`darData`) real schema — discovery + production pull (2026-11-17)

## Why

QSRSoft's own DAR pull (`qsrsoft-dar-pull.mjs` → `qsr_daily_activity_rollup`) is paused for
compliance reasons (`memory/finding-qsrsoft-security-notice-2026-11-16.md`). Owner's idea: pull
LifeLenz's own `darData` GraphQL query instead to fill the gap, hourly, ~5 minutes after each
hour completes.

`memory/finding-lifelenz-dar-vs-qsrsoft-dar-2026-11-05.md` had already measured ONE store/day of
`darData` against QSRSoft's DAR (near-perfect agreement on 4 fields: net sales, transactions,
punch hours, DT service time) using a manually-captured browser token — but never captured the
full response shape, so the real field names for a production pull were still unknown.

## Discovery method

`scripts/lifelenz-dar-probe.mjs`, `workflow_dispatch`-only, read-only, no Supabase writes. Four
dispatches, each measuring the previous run's real output rather than guessing again:

1. **Run 44169445984 — failed immediately.** `import 'dotenv/config'` with no `node_modules`
   installed (workflow never ran `npm ci`). Fixed by adding the install step.
2. **Run 44175053122 — failed for a real reason.** The schedules REST call returned `422
   INVALID_SESSION_ERROR`. Measured (not assumed): pulled the real `lifelenz-pull.yml`'s own job
   log and found it logs `[auth] LIFELENZ_TOKEN rejected (422, expired?), falling back to login
   flow` on every single run right now — `LIFELENZ_TOKEN` is genuinely expired; the daily sync
   only keeps working via its own SignIn-mutation fallback, which it never persists back to the
   secret. Ported the same fallback into the probe.
3. **Run 44176718577 — succeeded end-to-end for the first time.** Surfaced: `DarData` has
   exactly 2 fields (`dar`: a list, `totals`: a list of `FieldValue`); every guessed field name
   from the 2026-11-05 finding (`netSales`/`transactions`/`avgDtServiceTime`/"intervals") was
   wrong — `totals` is a generic `[FieldValue!]!` list, not named scalar properties; the real
   per-interval field is `dar`, not `intervals`; the granularity enum TYPE is
   `DarGranularityEnum`, not `DarGranularity`.
4. **Run 44178404036 — surfaced real data, but `dar{}` was still empty.** `FieldValue`'s shape
   (`fieldCode`/`value`) and real field codes came back. But the code extracting `dar`'s
   list-element type name was itself one `ofType` level too shallow, so the
   "introspect `Dar` directly" branch silently never ran (no error, just skipped) — the raw
   `DarData` dump in that same run's own log plainly showed `"name": "Dar"` one level deeper
   than the extraction code read.
5. **Run 44181293382 (post-fix, on `main`) — fully succeeded.** `Dar`'s real shape and real
   per-hour data both came back. This is the schema this pull is built from.

## Real schema

```graphql
DarData { totals: [FieldValue!]!, dar: [Dar!]! }
Dar     { data: [FieldValue!]!, missingActuals: Boolean!, startTime: ISO8601DateTime! }
FieldValue { fieldCode: String!, value: String }
```

`DarGranularityEnum` real values: `hour`, `quarter_hour`, `day`, `week`, `month`. The pull uses
`hour`.

Real `fieldCode`s (16, confirmed live, store `0003708`, 2026-11-17): `net_sales`, `transactions`,
`total_transactions_variation`, `drive_through_transactions_variation`,
`window_transactions_variation`, `sandwiches`, `sandwich_count_variation`,
`avg_dt_service_time`, `avg_fc_service_time`, `avg_mfy_service_time`, `actual_punch_hours`,
`total_hours_diff`, `total_hours_ideal_variation`, `transactions_per_punch_hour`,
`sales_per_punch_hour`, `labour_percentage_of_sales`.

`totals` is the exact sum/aggregate of `dar[]` across the requested window — not stored in
`lifelenz_dar` (storing it too would be a second copy of a derivable number, the same
"never average averages / don't duplicate a derivable total" standing rule).

**Confirmed business-day alignment (one store, Oklahoma/Central-time):** querying a 24-hour
window starting at `10:00Z` with `granularity: hour` returned exactly 24 `dar[]` elements with
`startTime` stepping hourly from `2026-11-15T10:00:00Z` through `2026-11-16T09:00:00Z` —
`10:00Z` = 4:00am CST, matching Meridian's own 4am business-day boundary exactly for this store.

## What shipped (Phase 1)

- `supabase/schema-lifelenz-dar.sql` — new `lifelenz_dar` table, one row per `(loc, start_time)`,
  all 16 fieldCodes as numeric columns + `missing_actuals`, standard tenant + `accessible_locs`
  RLS (owner needs to run this SQL — same DDL posture as every other new table in this repo).
- `scripts/lifelenz-dar-pull.mjs` — the real production pull (not the probe). Hourly, re-pulls a
  trailing `LIFELENZ_DAR_LOOKBACK_HOURS` (default 6) window ending at the most recently
  *completed* hour, upserting by `(loc, start_time)` — self-heals a late-settling or missed hour
  on the next run. `LIFELENZ_DAR_START`/`LIFELENZ_DAR_END` override the window for a manual
  backfill.
- `.github/workflows/lifelenz-dar-pull.yml` — `cron: '5 * * * *'` (hourly at :05, per the
  owner's request).
- `.github/workflows/sync-failure-watch.yml` — `LifeLenz DAR Pull` added to the watched list.
- `src/__tests__/lifelenz-dar-pull.test.js` — row-shaping + window-boundary tests, fixture taken
  directly from the real captured response above.

## What is deliberately NOT done yet (Phase 2 — explicit follow-on)

This pull **writes `lifelenz_dar` and is watched for failures, but the app does not read it
yet.** Not wired into `stream-freshness.js`'s `STREAMS`, `scheduled-pull-registry.mjs`'s
`PULL_REGISTRY`, `App.js`'s `ds`, or `metric-source.js`'s auto-first chains.

**Why:** every measurement above was against exactly ONE store schedule (`0003708`, Oklahoma /
Central time). Whether LifeLenz buckets `darData`'s hourly intervals in each store's OWN local
timezone — so a Florida/Eastern store's `startTime` values would land on a *different* UTC offset
for the same 4am-local business-day boundary — is a real, unmeasured question, not something to
assume into a derived `dt`/business-date column. `lifelenz_dar` deliberately stores the raw
`start_time` verbatim (no re-bucketing) until a Florida store schedule is probed the same way and
that question is answered. Doing the derivation wrong would silently misalign every OK-vs-FL
comparison the exact way the 4am-boundary rule in CLAUDE.md warns against.

**Next steps, in order:** (1) re-run the probe (or a one-off variant) against a Florida store
schedule to confirm/refute same-local-time bucketing; (2) once confirmed, add the `dt` derivation
+ `STREAMS`/`PULL_REGISTRY` entries + an `App.js` loader (`ds.lifelenzDarRows`), same pattern as
every sibling LifeLenz stream; (3) only after that, consider whether/how `metric-source.js`'s
auto-first chains for sales/DT%/labor% should read this as a fallback while QSRSoft's own DAR
pull stays paused — that step changes DISPLAYED numbers across many panels and needs its own
real-vs-real validation pass (mirroring the 2026-11-05 finding's QSRSoft-vs-LifeLenz comparison)
before it reaches a tile, not just a schema that compiles.
