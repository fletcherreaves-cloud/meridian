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

## ✅ Phase 2 (2026-11-17, same day) — Central-time confirmation closes the TZ blocker; dt/STREAMS/App.js wired

**Owner, directly, closing the one open question above:** "All of our locations (OK and FL) are
Central time zone. Not a current issue, could be down the road." This resolves Phase 1's real
unmeasured question outright — not just for the one store already probed, but for every store —
because there is no second timezone in the fleet to begin with. The FL panhandle stores
(Freeport/Mossy Head/Cottondale/Bonifay/DeFuniak Springs/Chipley/Ponce de Leon) sit west of the
Apalachicola River, which is the real Eastern/Central line in Florida; they are Central like
every OK store. The Florida-store probe this file's Phase 1 section called for as the next step
is now moot — there is no cross-timezone bucketing question to answer, today or structurally. If
LifeLenz is ever onboarded for a store outside Central time, this assumption would need
re-checking, but that is a "down the road" owner-flagged contingency, not a present gap.

**What shipped on the strength of that:**
- `lifelenz_dar` now carries a derived `dt date` column (`supabase/schema-lifelenz-dar.sql`),
  computed in `scripts/lifelenz-dar-pull.mjs`'s new `businessDateChicago()` — converts the real
  UTC `start_time` to America/Chicago wall-clock via `Intl.DateTimeFormat` (not a fixed UTC
  offset, so CST/CDT's DST transition is handled correctly) and applies the same 4am cutover
  `src/utils/date.js`'s `businessDate()` uses. Verified against this file's own Phase 1
  measurement: the confirmed 10:00Z-start 24-hour window for 2026-11-15 (CST) now derives `dt`
  consistently across its first hour (10:00Z → dt 2026-11-15) and its last (09:00Z next day → dt
  2026-11-15, not -16) — 13 tests in `src/__tests__/lifelenz-dar-pull.test.js`, including an
  explicit CDT (summer, UTC-5) case so the DST branch is exercised, not just assumed.
- `src/engine/stream-freshness.js`'s `STREAMS` and `scripts/lib/scheduled-pull-registry.mjs`'s
  `PULL_REGISTRY` both gained a `lifelenzDar` entry (`dateField`/`dateCol: 'dt'`, `group:'sales'`
  — the same group as the paused QSRSoft `dar` entry, checked independently per CLAUDE.md's
  per-stream staleness rule, never pooled with it).
- `src/app/App.js` loads it as `ds.lifelenzDarRows` via a new `_stLifelenzDar` T2-tier stage
  (same lazy-load pattern as every sibling LifeLenz stream), backed by a new
  `loadLifeLenzDar()` in `src/lib/supabase.js`.
- **Deliberately NOT done in this pass: wiring `lifelenzDarRows` into `metric-source.js`'s
  DISPLAYED auto-first chains** (sales/gc/laborPct/oepe/kvst/r2p). Two real, specific gaps make
  this unsafe to do blind, found while reading the exact chains that would need it:
  - `sales` in this app resolves `qsrActSummaryRows.sales` → DAR's `product_sales` — and this
    same file's `laborPct` derive comment already measured that `product_sales` reconciles with
    crew labor $ while `net_sales` does NOT (~0.2–0.3pp systematic low bias). `lifelenz_dar` only
    exposes `net_sales`. Wiring it in as `sales`'s next fallback would silently swap the basis on
    every day the DAR stream is down, not just fill a gap.
  - `oepe` is specifically `(dt_untilserve − dt_untilstore − dt_heldtime) ÷ dt_trans_cnt` —
    i.e. DT service time with parked/held time EXCLUDED (dispatch #183). `lifelenz_dar`'s
    `avg_dt_service_time` is a plain average with no stated parked-time exclusion; conflating the
    two would quietly redefine OEPE for every panel that reads it. (This is the same distinction
    the owner's own "DT OEPE w/o parked" report request turns on.)
  - The 2026-11-05 finding's "near-perfect agreement on net sales/transactions/punch
    hours/DT service time" was a real-value comparison for ONE store/day using a manually
    captured token, before the real field names were even known — useful as a sanity check that
    LifeLenz's numbers are in the right ballpark, not as proof any one LifeLenz field is a safe
    drop-in replacement for a specifically-defined Meridian metric.
  **Next step, concretely:** once the owner runs the schema SQL below and a few days of real
  parallel data exist (QSRSoft's own DAR, `qsr_daily_activity_rollup`, is still live and current
  as of this writing — see the hiccup below — so a same-day comparison is possible immediately,
  not something to wait weeks for), run a real field-by-field reconciliation
  (`lifelenz_dar.net_sales` vs `qsr_daily_activity_rollup.product_sales`/`dt_allNetSales`,
  `avg_dt_service_time` vs the `oepe`/raw-leg chain, `actual_punch_hours` vs `qsrActSummaryRows.actHrs`,
  `labour_percentage_of_sales` vs the derived `laborPct`) before adding any of them to
  `METRIC_SOURCES`, the same discipline the 2026-08-16/08-27 labor% investigations above already
  used on this exact pair of streams.

## ⚠️ Hiccups found while wiring this in (2026-11-17) — flagging per the owner's ask

1. **`lifelenz_dar` does not exist in the live Supabase schema yet.** Measured directly (service
   role REST call): `GET .../lifelenz_dar` returns `PGRST205 "Could not find the table
   'public.lifelenz_dar' in the schema cache"`. This session has no SQL execution path to
   Supabase (same limitation as every other new table in this repo) — **the owner needs to run
   the updated `supabase/schema-lifelenz-dar.sql` (now including the `dt` column) in the
   Supabase SQL editor** before the pull can write a single row.
2. **`lifelenz-dar-pull.yml` has never fired — zero runs in its history** (checked via the
   GitHub Actions API), despite an hourly `cron: '5 * * * *'` schedule. Once the table exists
   this should self-correct on its own next scheduled tick, but it's worth knowing this pull has
   not actually run yet, successfully or otherwise — "watched and wired" is not the same as
   "has ever produced a row." Worth a one-time `workflow_dispatch` check after the SQL runs,
   rather than only waiting on the hourly schedule.
3. **QSRSoft's own DAR (`qsr_daily_activity_rollup`) is NOT currently stale** — measured live,
   its latest `dt` is today (2026-11-17), despite the automated `qsrsoft-dar-pull.yml` schedule
   being paused for compliance since 2026-11-16. Most likely explanation: the in-app Manual Pull
   Triggers (task #168) are being used to keep it current by hand. This doesn't change the
   rationale for building LifeLenz DAR (resilience if manual triggers lapse, plus it's the
   sanctioned non-QSRSoft-credential source going forward), but it does mean there is currently
   no urgent gap in what's DISPLAYED today — the real benefit lands once (a) the schema is live
   and (b) the metric-equivalence validation above is done.

None of the three above are things I can resolve myself from this session (no SQL execution
path, no ability to make GitHub Actions fire early other than `workflow_dispatch`, which still
needs the table to exist first) — raising them here rather than guessing past them.
