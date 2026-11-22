---
name: plan-egress-reduction-2026-11-20
description: "Research + phased plan for the rising Supabase usage/egress concern raised 2026-11-19/20 — login-time read volume, not the paused QSRSoft pulls, is the real driver. Measured: lifelenz_schedule alone moves ~12,212 rows (~6.9MB uncompressed JSON) on every single login via a 455-day default window, re-fetched fresh every time with zero local caching. Dozens of other eager loaders in App.js have the same shape. Proposes a phased local-first cache + delta-sync + panel-open-priority design, matching the owner's own ask, informed by how Replicache/Convex/ElectricSQL/PowerSync and Supabase's own egress guidance frame this problem. Phase 0 (window right-sizing) is safe to start solo; Phase 2 (watermark columns) needs an owner DDL decision."
metadata:
  node_type: memory
  type: plan
scope: tenant
sensitivity: open
---

# Login-time data footprint: why usage is climbing, and a phased plan to fix it (2026-11-20)

## Why this exists

2026-11-19/20: owner saw Supabase usage climbing and asked why, given 30+ QSRSoft credential-login pulls are paused. Answered same night: pausing *writes* doesn't touch *reads*, and named the likely real driver (every login re-reads a growing, feature-rich app) without a number. Owner then asked for a proper plan: "retain loaded data in memory... refresh quietly in the background... if a specific panel is opened that should expedite the refresh... look into how other platforms deal with this... consider load routine... offer a speed load improvement as well."

This is that plan. Research only — nothing below is implemented except what Section 5 explicitly calls "safe to start now," and even that is pending the owner's go-ahead.

## 1. The measured problem

### 1a. One concrete number, not a guess

`loadLifeLenzSchedule({ daysBack = 455, daysFwd = 30 })` (`src/lib/supabase.js:1262`) is called with **no arguments** from `App.js:937` — every login pulls the full 485-day default window. Measured live against production (2026-11-20):

| Measurement | Value |
|---|---|
| `lifelenz_schedule` total rows (all time) | 17,548 |
| Rows inside the default 455-day-back/30-day-fwd window | **12,212** |
| Avg row size (uncompressed JSON) | 564 bytes |
| Uncompressed payload for this ONE table, ONE login | **~6.9 MB** |

The function's own comment says this was *already* cut once: `// was 1825 (5yr) — egress guard, ~15 months back covers YoY + trends`. So this exact failure mode — a bounded-but-still-huge default window, re-fetched in full on every login — has been hit and partially treated before, on this same table, and nobody went back to check whether 455 days is still the right number or whether the fix should have been structural instead of a smaller magic number.

### 1b. This is not an isolated case — it's the app's default shape

`App.js` defines ~30+ independent `_st*()` loader closures (named `_stQsrsoftActSummary`, `_stCloudEmailReport`, `_stPeopleReports`, `_stEbosOpSupplies`, `_stEmployeeTenure`, `_stCustomSignals`, `_stForecastWeekCache`, `_stDigitalDeliveryShiftmgr`, etc. — grep `^\s*const _st` in `App.js`), each wrapped in try/catch, each firing its own Supabase query on every login. Windows vary (60 days for Glimpse/Cash/SalesLedger, 400 days for eBOS, unbounded-by-day for several monthly/roster tables) but the *pattern* is identical everywhere: **no check of "do I already have this, and is it fresh enough" before firing the network call.**

Only **4 streams** (`LAZY_FILL_SOURCES` in `src/engine/metric-source.js:857` — `auditRows`, `wasteRows`, `pmixRows`, `qsrSalesQtrHourRows`) are demand-loaded instead of eager. Everything else — including the biggest tables — loads in full, every time, whether or not the user ever opens the panel that needs it.

### 1c. The existing local cache doesn't cover the tables that matter most

`src/db/index.js` (Dexie/OPFS) persists `laborRows/opsRows/ctrlRows/fobRows/auditRows/peaksRows/darRows/pmixRows/weatherRows` plus `glimpse/cash/exceptions/monthlyTargets/smgVoicePerf` — the **manual-upload-era** streams, as a write-through backup. It does **not** cover `lifelenz_schedule`, `qsrActSummaryRows`, `salesLedgerRows`, people reports, or any of the other cloud-first streams that now carry the bulk of the data volume. And even for the tables it does cover, the loader never asks the cache "am I fresh" before hitting the network — `_stCloudEmailReport` always calls `loadGlimpse(60)/loadCash(60)/loadSalesLedger(60)` fresh, cache or no cache.

**Net finding: there is no stream in this app today that skips a network re-fetch because a local cache is already fresh enough.** The cache that exists is a backup for offline resilience, not a read-first/revalidate-in-background layer.

### 1d. What's NOT the driver

- Compute tier ($15/mo Small instance) is flat-rate, confirmed via Management API — doesn't scale with query volume.
- No hidden add-ons (PITR, IPv4, log drain) — checked, none purchased.
- `scheduled-pull-watchdog.yml`'s freshness checks are tiny (`SELECT` a single latest date per stream) — real, but a rounding error next to the table above. Already dialed back 30min→2h (PR #2003) per the owner's direct ask.
- `_MAX_INFLIGHT = 6` throttles *concurrency*, not *volume* — relevant to the earlier capacity incidents, not to the dollar line on an egress-billed table.

## 2. How other platforms handle this (prior art, not just theory)

Two different layers get conflated in most writeups, and it matters which one this app needs:

- **Stale-while-revalidate** (service-worker caching vocabulary) is about *serving a cached response fast and refreshing it after* — a performance/latency optimization. It does not, by itself, reduce how much data eventually crosses the wire; it just moves the refetch off the critical path.
- **Incremental/delta sync** (the Replicache/Convex/ElectricSQL/PowerSync class of "sync engine") is the piece that actually cuts *bytes transferred*: the client keeps a cursor/watermark ("I've seen everything up to version N" or "...up to `updated_at` = T"), and every subsequent fetch asks the server for only what changed since then, merging into a local store that already holds the rest.

Named products doing exactly this against Postgres:
- **ElectricSQL / "Postgres Sync"** — a read-path sync engine: client defines a "shape" of the data it wants, Electric streams only the delta for that shape over HTTP, backed by Postgres logical replication.
- **PowerSync** — bidirectional Postgres↔SQLite sync: server-side "sync rules" partition data into buckets, the client gets a local embedded SQLite database that the service keeps incrementally in sync.
- **Replicache/Convex** — client-side cache + sync protocol built around the same two questions: *initial sync* (how does a new client get the first full copy) and *incremental sync* (how does it cheaply stay current).

All three exist because this exact problem — "a BI/collab app re-reading its own growing history on every load" — is common enough to have spawned a product category. **Adopting one of these wholesale is a bigger lift than this problem needs right now** (new infra dependency, new auth model, a real migration project) — but the *pattern* they all share (local store + watermark cursor + merge-not-replace) is exactly what Section 4 below proposes building lightweight and in-house, on top of the OPFS/Dexie layer that already exists.

Supabase's own guidance (`supabase.com/docs/guides/troubleshooting/all-about-supabase-egress`) says the same thing in blunter terms: *select less data, make fewer calls, cache*. Their own worked cautionary example — a single query that generated 19GB of egress because it quietly over-fetched — is this app's `lifelenz_schedule` situation exactly, just at a different scale. One Supabase-specific note worth *verifying* before relying on it: traffic through the shared connection pooler (Supavisor) is explicitly **not** counted as database egress, per their docs — but that's documented for direct Postgres-protocol connections, and this app talks to Supabase over PostgREST's REST API via the JS client, a different wire path. Don't assume this helps without confirming it actually applies to PostgREST traffic.

## 3. The design this points to

**Local-first read cache + watermark delta sync + panel-open priority** — three layers, each buildable independently, each delivering value on its own:

1. **Cache-first render.** On login, show the UI from whatever's already in OPFS/IndexedDB *immediately* — no blocking network wait. This alone is the "speed load improvement" the owner asked about: time-to-first-render drops from "wait for N parallel round-trips" to "read a local file."
2. **Quiet background revalidation.** After the cached render, kick off the real fetches in the background exactly as today — except each one asks for a **delta**, not a full re-fetch: `WHERE updated_at > watermark` (or `pulled_at`/`refreshed_at` — most of these tables already carry one of those columns, confirmed this session on `lifelenz_schedule`, `qsr_daily_activity_rollup`, and others) instead of `WHERE date >= (today - 455)`. Merge the delta into the cached set rather than replacing it. The watermark itself is just "the newest `updated_at` I've already stored for this stream," kept in IndexedDB alongside the data.
3. **Panel-open priority.** This already exists for 4 streams (`ensureLazyFill`/`LAZY_FILL_SOURCES`) — a panel mounting calls `ensureLazyFill('auditRows')`, which bumps that stream to the front of the queue instead of waiting its turn. The plan generalizes this mechanism to the eager streams too: everything defaults to "serve from cache, revalidate quietly, lowest priority," and a panel that actually needs a specific stream right now calls the same trigger to jump it to the front — exactly the owner's "if a specific panel is opened that should expedite the refresh" ask, using an idiom the codebase has already proven out.

Net effect on the egress line: a returning user on a normal day has a small or zero delta most of the time (yesterday's rows don't change), instead of re-pulling the full historical window every single login. The `lifelenz_schedule` case above goes from "~12,212 rows, every login" to "N new/changed rows since my last visit, typically a few dozen to a few hundred."

## 4. Phased plan

**Phase 0 — window right-sizing audit (safe, solo, no schema change).**
Before building any caching machinery: audit each eager loader's default window against what its actual consumers read. `lifelenz_schedule`'s 455-day default is the standout (it was already cut once from 1825 days without a usage audit backing the new number) — check which panels/features genuinely need lookback that long (YoY comparisons, long-horizon forecast training) versus panels that only ever look at the last 30-90 days by default, and whether a long-horizon need could pull its own wider one-off query instead of inflating everyone's login. Same question for every other `_st*` loader's window. This alone could meaningfully cut today's number without touching the architecture at all — but it needs the audit, not a guessed new constant, per this repo's own "measure, don't reason" rule.

**Phase 1 — extend cache-first-render to the cloud-first streams (moderate, mostly solo).**
Generalize the OPFS snapshot mechanism (`src/db/index.js`) to cover the streams it currently excludes (`lifelenz_schedule`, `qsrActSummaryRows`, `salesLedgerRows`, people reports, etc.), and change the loader pattern from "always fetch, write into ds when done" to "render from cache now, fetch in background, replace when the fetch lands." No delta logic yet — still a full re-fetch — but the user sees data instantly and the network traffic moves off the critical path. This is the quickest way to deliver the "speed load improvement" half of the ask.

**Phase 2 — watermark delta sync (the real egress fix; needs an owner decision).**
Add the "last synced at" cursor per stream per device (stored client-side, trivial) and switch each loader's query from a fixed day-window to `WHERE updated_at > watermark`. Before this can ship broadly: audit which of the ~30 eager tables already have a reliable modified-at column (most do — `updated_at`/`refreshed_at`/`pulled_at` turned up repeatedly this session) and which don't. **Adding a modified-at column to a table that lacks one is a schema/DDL change — this repo's own standing rule (`CLAUDE.md`'s sweep-tier framework) is that DDL is never applied unattended, so that list goes to the owner as a specific, named ask, not something done solo.**

**Phase 3 — generalize panel-open priority (solo, once Phase 1/2 land).**
Extend `LAZY_FILL_SOURCES`-style prioritization from 4 streams to the full eager set, so a panel mount can jump its own dependency to the front of the background-revalidation queue instead of waiting in line behind everything else.

## 5. What I can start on my own vs. what needs the owner

**Can start solo, no sign-off needed:** Phase 0's audit (which panels actually consume which windows — pure code-reading, no changes yet), and once that audit has real numbers, the specific window reductions it justifies. Phase 1's cache-first-render scaffolding is also pure application code, fully reversible, no schema touched.

**Needs the owner:** Phase 2's column audit will very likely surface at least one table that needs a new `updated_at`-style column added — that's a DDL change, which this repo's standing rule keeps out of unattended work regardless of how small it looks. The owner also gets to set the actual staleness tolerance per stream (is it fine for Register Audit numbers to be 10 minutes stale on first paint before the quiet background refresh lands? Almost certainly yes — but that's a product call, not mine to make silently for every panel in the app).

## 6. Suggested sequencing

Start with Phase 0 now — it's pure measurement plus some safe constant changes, delivers real savings on the single biggest number found tonight, and needs nothing from the owner except a nod to proceed. Phase 1 is the next real project (bigger, still solo-doable, delivers the speed win). Phase 2 is the piece that actually bends the egress curve long-term, gated on the owner's DDL decision once Phase 0/1 surface exactly which tables need it.

## 7. Phase 0 — done (2026-11-20, v5.834)

`loadLifeLenzSchedule`'s default `daysBack` cut from 455 to 180 after auditing every `ds.schedRows`
consumer (`insights.js`, `metric-source.js`'s schedRows-sourced chains, `smart-targets.js`/
`projections.js`/`one-pager-data.js`'s `computeScheduleRollup` callers, `visit-readiness.js`,
`schedule-retention.js`) — none needs more than its own selected date range; the one no-filter
reader (Schedule Retention's `computeStoreWeeks`) degrades to "fewer weeks visible," not broken.
Measured: 12,212 rows (~6.9MB uncompressed) → 5,292 rows (~57% cut), on every single login.
`daysBack` stays overridable for a future caller that needs deeper history on demand. Full
suite (8450 tests) + build both clean. See `src/app/changelog/5.834.js`.

**Checked and deliberately left alone:** `loadEbosDaily(400)` — its 400-day window has a real,
named rationale (`"so a full review year is covered on any device"`, tied to the Performance
Review "Op Supplies vs Budget" feature, Notes 32 #4) unlike `lifelenz_schedule`'s vaguer "YoY +
trends" comment. Not touched without the same kind of consumer audit this pass gave
`lifelenz_schedule` — flagged here as the next Phase 0 candidate, not done yet.

**Not yet audited:** the rest of the ~30 `_st*()` eager loaders in `App.js` (people reports,
digital/delivery/shift-manager monthlies, forecast week cache, employee tenure, custom signals,
etc.). `lifelenz_schedule` was the single largest number measured and the only one with prior
"someone already tried to fix this once" history, so it went first. A second pass through the
rest is real remaining work, not assumed-fine.

## 8. Second pass (2026-11-20) — eBOS confirmed-needed, job-hours no-op, two real findings

Audited 4 more candidates the same way: `loadEbosDaily(400)`, `loadLifeLenzJobHours({weeksBack:60})`,
`loadPeaksRows(400)`, `loadOpsRows(400)`/`loadCtrlRows(400)`.

- **eBOS (400d): confirmed, not a guess this time.** `review-engine.js`'s Performance Review
  genuinely buckets a full calendar year of eBOS by month (`byMonth`, no date filter) — the
  comment's "full review year" claim checked out. Left alone.
- **`lifelenz_job_hours` (60 weeks): no savings available today.** Measured 26 weeks back and 60
  weeks back return the identical 7,752 rows — nothing in the table is older than 26 weeks yet
  (a newer automated stream still growing into its own window). Not worth a PR until it has more
  history to trim.
- **`peaks_rows` (400d): real dead-weight finding, spun off as a suggested task
  (`task_d8a2e97c`), not fixed here.** Measured **zero rows in the last 90 days** — this manual
  upload has been stale since 2026-06-30 (the app's own code comment already says so) and is
  fully superseded by the auto-pulled "3 Peaks" daypart stream next to it. Every login still
  pulls all 15,612 rows of acknowledged-dead data. Needs a real consumer check before touching
  (same rigor this file demands), not a blind cut — see the spawned task for the full brief.
- **`ops_rows`/`ctrl_rows` (400d each): real lazy-fill candidate, NOT a window shrink — proposed,
  not yet built.** Owner input that triggered the recheck: LifeLenz/QSRSoft data only goes back
  ~3 years total (2 years at onboarding + ~1 since), and the production-winning sales model
  (`forecast.js`'s `'simple'` trailing family, v4.532 — needs as little as 14 days, typically
  ≤~90) doesn't need deep history at all, which raised the right question: does anything on the
  *eager, every-login* path actually need these tables' full 400-day depth? Checked every real
  consumer (not just the index-building noise in `pipeline.js`/`session.js`):
  - `morning-brief.js` only does a same-day/nearby lookup — needs today's row, not history.
  - `promo-roi.js` (Promo/Discount ROI panel) and `location-intel.js` (`liOpsCorr`'s TPPH/OEPE
    correlation, which requires `tpphPairs.length>=20` for statistical validity) are the two
    consumers that genuinely want deep history — and both are **deliberately-opened drill-down
    panels, not the default home/login view.**
  - That's the same shape `auditRows`/`wasteRows`/`pmixRows`/`qsrSalesQtrHourRows` already solved
    via `metric-source.js`'s `LAZY_FILL_SOURCES`: default eager load stays short (enough for
    `morning-brief.js`'s recent-context need), and Promo ROI / Location Intel trigger
    `ensureLazyFill('ctrlRows')`/`ensureLazyFill('opsRows')` themselves when actually opened, the
    same way `RegisterAuditTab` does today for `auditRows`.
  - **Not done yet** — this is real Phase 1 wiring (new lazy-fill entries, two panel call sites,
    verifying `promo-roi.js`'s bias-corrected DOW-matched methodology still gets its full window
    when it actually runs), not a Phase-0 constant tweak, and it touches a hard-won analysis
    engine (`promo-roi.js` — see `finding-promo-roi-denominator-bias-2026-08-23.md`). Proposed to
    the owner; pending go-ahead before implementing.
  - **This also validates Phase 2's framing independently**, via the owner's own observation:
    pull deep history once (onboarding, or an explicit backfill) to establish trends/seasonality,
    then stop re-pulling that depth on every regular visit and sync deltas instead. That's exactly
    the watermark-cursor design already in Section 3-4 above, not a new direction.

## 9. Both items closed (2026-11-20, same day) — one shipped as scoped, one scoped wrong and corrected before writing code

Owner go-ahead: *"Go ahead with the ops_rows/ctrl_rows lazy-fill, you can pick up peaks_rows as
well."* Re-auditing `ops_rows`/`ctrl_rows` for the actual implementation (not just the earlier
3-file consumer check) surfaced that Section 8's consumer list was **wrong by an order of
magnitude** — caught before any code was touched, per this file's own "measure it, don't reason
about it" rule, not after.

**`ops_rows`/`ctrl_rows`: NOT implemented — the real consumer count invalidates the plan.**
A full `grep -rn "ds\.opsRows\|ds\.ctrlRows"` across `src/` (not just the three files Section 8
checked) finds at least a dozen direct readers, not two drill-down panels:
`at-a-glance.js` (the **login-time default home screen** — `coreStreamsLoading`, `opsInRange`/
`ctrlInRange` filtered by the toolbar's own user-selected date range, which can be widened to any
historical window), `smart-targets.js` (`cutLY = mk(Math.max(104, lookbackWeeks))` — up to **104
weeks / 2 years** back, deliberately wider than the current 400-day eager window already),
`labor-tools.js` (user-selected date range, not a fixed recent window), `signals.js`, `graded-visits.js`
(historical visit context, same non-recency "any row" shape `peaks_rows` has), `store-analytics.js`,
`store-dash.js`, `scheduling.js`'s Opportunity Report, `sage.js`, `projections.js`. A safe two-tier
lazy-fill (bounded default + `ensureLazyFillWide` for deep consumers, the pattern Section 8
proposed) would need EVERY one of those call sites individually migrated and wired with its own
trigger first — not two files, a dozen-plus, several of them on the app's own default view and its
production Smart Targets model. Shipping the original 2-file-scoped plan as the 2026-11-20
go-ahead actually authorized would have silently broken At-A-Glance or starved Smart Targets of
up to 2 years of real history until each caller got its own fix — exactly the "would this
verification still pass if reverted" trap this file's own Dev Rules section warns about, just
pointed at a plan instead of a diff. **Verdict: left eager, unchanged.** The real fix is the
standing CLAUDE.md rule these dozen+ files already violate — route through `metric-source.js`'s
resolver instead of reading `ds.opsRows`/`ds.ctrlRows` raw — and that migration is its own
separate, larger project, not a corollary of an egress pass. No PR for this half.

**`peaks_rows`: implemented as a lazy-fill conversion, not a blind delete.** This one's consumer
set (7 files) was ALSO wider than Section 8's "needs a real consumer check" flagged it to be, but
every one of those 7 splits cleanly into two shapes: a pure-recency filter (`morning-brief.js`'s
8-week norms, `revenue-opportunity.js`'s daypart erosion, `forecast.js`'s daypart engine) that
already reads as empty against data stale since 2026-06-30 — zero behavior change either way —
or a non-recency "does this loc have any row at all" check (`graded-visits.js`'s historical visit
context, `store-dash.js`/`store-analytics.js`'s 3-Peaks tab + "file loaded but store not found"
messaging) where outright deletion WOULD have been real, silent data loss for a historical lookup.
That shape is small enough (one shared `loadPeaksRows()` fetch split by `_peakSvc`, triggered from
each real call site) to do safely in one pass — unlike `ops_rows`/`ctrl_rows`'s dozen-plus raw
readers, none of which can be migrated without first routing through `metric-source.js`.
`peaksSvcRows`/`peaksSalesRows` now join `LAZY_FILL_SOURCES`; eager T2 stage removed from
`App.js`. See `src/app/changelog/5.835.js` for the full consumer-by-consumer list. Full suite
(8450 tests) + build both clean.

**The lesson, stated plainly:** two findings that read as similarly-scoped in Section 8 turned out
to need opposite verdicts once someone actually tried to build the smaller one — `peaks_rows`'
"wider than expected" consumer set was still small enough to wire safely; `ops_rows`/`ctrl_rows`'
was not. The difference only showed up at implementation time, which is exactly why Section 8
flagged both as "proposed, not yet built" rather than claiming either was done.

## 10. Phase 1 — first pilot shipped (2026-11-20, v5.839): schedRows cache-first render

Owner go-ahead: *"let's continue the egress phases."* Phase 0 (window right-sizing) was
essentially done per Sections 7-9; this moves to Phase 1 ("cache-first render" — Section 3 item
1 / Section 4's Phase 1 description). Rather than attempt the full "generalize OPFS to every
cloud-first stream" rewrite in one pass — real risk on a live production app, and Section 9's own
lesson that scope estimates are unreliable until implementation is actually attempted — this
ships ONE real stream as a vertical slice: `lifelenz_schedule` (`ds.schedRows`), chosen because
it's the best-measured table in this whole plan (Section 1a) and Phase 0 already worked on it.

**What shipped:** `src/db/index.js`'s OPFS snapshot blob (previously manual-upload-era streams
only — labor/ops/ctrl/fob/audit/peaks/dar/pmix/weather/glimpse/cash/exceptions/targets) gained a
`sched` field, bumped v3→v4, backward-compatible (a v3 reader/writer missing the field just gets
`[]`). `App.js`'s cold-start restore now seeds `ds.schedRows` from that cache in BOTH restore
paths — the normal "manual-upload history exists" branch and the empty-shell "no manual-upload
history at all" branch, so a cloud-only user (no legacy labor/ops/ctrl uploads) still gets the
benefit, not just a legacy one. `_stLifelenz`'s existing live T2 fetch is unchanged in what it
fetches or how it wins — it still runs every login and still overwrites the cached render once it
lands — but now also writes its result back into the same OPFS snapshot, so each login's cache
is the previous login's live data, not a one-time snapshot that goes stale forever.

**What this does NOT do, stated plainly so it isn't mistaken for more than it is:**
- **No delta sync.** `_stLifelenz` still does a full 180-day-window re-fetch every login (Phase
  0's number, unchanged). This pilot only moves WHEN the user sees data (instantly, from cache)
  relative to WHEN the network call completes — it does not reduce what that network call costs.
  That reduction is still Phase 2, still not started, still gated on the owner's DDL-column
  decision per Section 4.
- **Not generalized.** Only `schedRows` joined the cache. The other ~29 eager `_st*()` loaders
  in `App.js` are untouched. `ops_rows`/`ctrl_rows` specifically were already found NOT safely
  convertible to even a lazy-fill treatment (Section 9) — they'd need the same kind of
  stream-specific pilot this section describes, individually, and some (the dozen-plus raw
  `ds.opsRows`/`ds.ctrlRows` readers) need the larger `metric-source.js` migration first regardless.
- **Net egress effect of this pilot alone: ~zero.** The bytes crossing the wire per login are
  unchanged — same 180-day window, same full re-fetch. The win is purely user-perceived speed
  (the "offer a speed load improvement" half of the owner's original ask) and establishing the
  cache-write plumbing that Phase 2's delta-sync will build on top of for this one stream.

**Verification:** 5 new tests (`src/__tests__/dispatch-egress-phase1-sched-cache-2026-11-20.test.js`)
exercise the REAL `opfsSave`→`loadDsFromIDB` round-trip — not a hand-built object shape — by
faking the two browser-only primitives this mechanism depends on (`navigator.storage`'s OPFS
directory handle, and the dedicated Worker), since this repo's test suite runs in Vitest's `node`
environment where neither exists natively. Confirmed the test actually catches a regression (not
just passing vacuously) by temporarily reverting the `sched` threading in `loadDsFromIDB` and
watching it fail, per this file's own "measure it" standing rule. **This is also the first test
coverage this OPFS-snapshot mechanism has ever had** — none of its other 9 cached fields
(glimpse/cash/exceptions/pmix/records/monthlyTargets/etc.) had a direct round-trip test before
this pass either; that gap is pre-existing and not fixed here beyond the one field this pilot
touched. Full suite + build both clean.

**Next candidate for the same per-stream pilot treatment, if the owner wants to keep going:**
`qsrActSummaryRows` or `salesLedgerRows` — both named in Section 3/4 as cloud-first streams the
current cache excludes, and both render on the default At-A-Glance home screen (unlike schedRows,
which is mostly a Labor Tools/Projections dependency) — so a cache-first win there would be felt
on every single login, not just on panels a user has to navigate into.

## 11. Phase 1 pilot #2 shipped (2026-11-21, v5.840): qsrActSummaryRows cache-first render

Owner: *"Keep going on the egress phases."* Picked `qsrActSummaryRows` (`qsr_daily_activity_rollup`)
over `salesLedgerRows` as the higher-value next target — it's a **T1-tier** stream (`App.js`'s
tiered startup loader `await`s `_stQsrsoftActSummary(60)` before calling the app "usable"),
unlike schedRows which was T2/background. This is literally the stream the owner has said he
watches load ("when that line popped up, the tiles populated" — Section 10's own T1 comment
block), so a cache-first win here lands on the actual perceived-speed metric the whole Phase 1
ask was about, not just a nice-to-have.

**Same mechanism as pilot #1**, two differences:
- `qsrActSummaryRows` rows carry a SECOND Date field (`refreshedAt`, used by At-A-Glance's Movers
  strip via `r.refreshedAt.getTime()`) beyond the `date` field the shared `strip()`/`toRow()`
  helpers already handle. Caught this BEFORE writing the cache code by grepping every real
  `refreshedAt` consumer first (not after shipping and having it throw) — added a dedicated
  `toQsrActRow` wrapper in `opfsLoad` just for this stream. Confirmed by test: reverting the
  wrapper to a plain `toRow` reproduces the exact failure a shipped regression would have hit
  (`refreshedAt` restored as a string, `.getTime is not a function` the moment Movers-strip code
  touched a cached-but-not-yet-live-refreshed row).
- OPFS blob bumped v4→v5 (additive, same backward-compat guarantee as v3→v4).

**Mid-build tangent, resolved same session:** while this was in progress, the owner asked whether
the in-progress change could be why Signals' LiveOps DAR tab looked empty. It can't be — not yet
shipped, and that tab's `darRows` is a totally separate state (`refreshDar()`, a direct
`qsr_daily_activity` query), never touched by this pilot or pilot #1. Measured the REAL cause
live: `qsr_daily_activity` AND `qsr_daily_activity_rollup` are both frozen at **2026-11-17** —
`.github/workflows/qsrsoft-dar-pull.yml`'s schedule has been commented out since 2026-11-16
(QSRSoft compliance triage) and nothing has backfilled since. `lifelenz_dar` is fresh through
**2026-11-20** and already feeds `metric-source.js`'s fallback chains (`sales`/`gc`/`oepe`/`kvst`/
`r2p`/`laborPct`/`actHrs` all list `lifelenzDarDailyRows` after `qsrActSummaryRows`), but the
LiveOps tab's own `refreshDar()` was never updated to fall back to it — a real, separate,
**not-yet-fixed** gap, flagged to the owner, not fixed in this pass (kept this pilot scoped to
what it was already doing). This also confirms pilot #2's caching is NOT making anything more
stale than it already was: `qsr_daily_activity_rollup` has nothing past 2026-11-17 whether served
from cache or from a fresh T1 fetch, so for any date after the pause, `metric-source.js`'s
resolver already falls through to `lifelenzDarDailyRows` on its own, cache or no cache.

**Next candidate, if the owner wants to keep going on cache-first pilots:** `salesLedgerRows`
(Section 3/4's other named T1-adjacent candidate) — or, separately, actually fixing the LiveOps
DAR→LifeLenz-fallback gap just found, which is unrelated to the egress plan but a real live bug.

(The LiveOps DAR fallback was built and shipped separately, same session — v5.841, owner-approved
scope — see `memory/finding-liveops-lifelenz-dar-fallback-2026-11-21.md`. Not part of this plan;
noted here only because it was found while working this plan.)

## 12. Phase 1 pilot #3 shipped (2026-11-21, v5.842): salesLedgerRows cache-first render +
glimpse/cash write-back-gap fix

Owner: *"You can keep going in the egress plan... Have a goodnight."* — continued autonomously
per that sign-off. Picked `salesLedgerRows` (`sales_ledger_daily`), the last of the three
`_stCloudEmailReport` T1 email-report streams (alongside glimpse/cash) named as a candidate in
Section 11.

**Same mechanism as pilots #1/#2**, no new wrinkle this time: confirmed by reading
`loadSalesLedger`/`loadGlimpse`/`loadCash` (`src/lib/supabase.js`) that each emits exactly one
Date field (`date`) — no `refreshedAt`-style second field like pilot #2's `qsrActSummaryRows` had
— so the existing plain `strip()`/`toRow()` pair is sufficient; no dedicated wrapper needed.
OPFS blob bumped v5→v6 (additive, same backward-compat guarantee as every prior bump).

**Real bug found and fixed in the same pass, not a new feature:** `glimpseRows`/`cashRows` were
already part of this OPFS blob — added back at the Dexie v7 "QSRSoft email report types"
migration, long before this egress plan existed — but the cache-first *pattern* this plan has
been applying (seed-on-restore + write-back-on-live-fetch) had only ever been half-built for
them:
1. **App.js's empty-shell restore branch** (a user with no legacy manual-upload history at all —
   i.e. anyone who signed up after the cloud-first architecture, never touched a manual upload)
   had `glimpseRows:[], cashRows:[], exceptionRows:[]` hardcoded — never actually read from the
   cache, unlike every other stream in that same branch.
2. **`_stCloudEmailReport`** (the live T1 fetch stage that loads glimpse/cash/salesLedger from
   Supabase on every login) never called `opfsSave()` at all — only the OLD manual-upload code
   path wrote to this cache.
Combined, any user who has never done a manual upload has had an effectively **permanently-empty**
glimpse/cash cache since Dexie v7 shipped — cold-starting from zero every single session, cache or
no cache, for those two streams specifically. Fixed both: the empty-shell branch now seeds
`glimpseRows:glimpse||[], cashRows:cash||[], salesLedgerRows:salesLedger||[]` from the cache same
as the legacy-history branch already did, and `_stCloudEmailReport`'s `setDs` updater now captures
`next` and fires `opfsSave(next).catch(()=>{})`, same fire-and-forget pattern as
`_stLifelenz`/`_stQsrsoftActSummary`.

**Verification:** 5 new tests
(`src/__tests__/dispatch-egress-phase1-salesledger-cache-2026-11-21.test.js`) — the real
`opfsSave`→`loadDsFromIDB` round-trip for `salesLedgerRows`, a joint round-trip proving
glimpse/cash restore correctly too (confirming the write-back-gap fix actually reaches the cache,
not just that it compiles), a v5-blob backward-compat check, and an unrecognized-version-number
guard. Confirmed the salesLedgerRows test actually catches a regression: temporarily reverted the
`opfsSave` write-back line to `salesLedger: []`, watched the restore test fail with the exact
wrong empty array, restored the file, and re-ran clean before trusting it as real coverage — same
discipline as pilots #1/#2. Full suite + build both clean.

**Discovered along the way, noted but NOT fixed (same "measure it" rule — don't fix what wasn't
asked, name it instead):** `loadDsFromIDB`'s OPFS branch only trusts the cached snapshot at all
when `opfs.labor.length > 0` — its own sentinel for "this is a real, valid snapshot," inherited
from the original manual-upload-era design where `laborRows` was the first (and for a long time,
only) stream. A user whose ONLY cloud-first data is glimpse/cash/salesLedger/sched/qsrAct with
zero `laborRows` ever (plausible for a brand-new cloud-only user who has genuinely never touched
a manual upload) would fail that sentinel check and fall through to the empty IDB-migration cold
path instead of using their real OPFS cache — a pre-existing design assumption this plan hasn't
touched, surfaced by writing a direct test against it, not a regression this pilot introduced.
Worth a dedicated look if/when Phase 1 finishes migrating every stream off the manual-upload-era
assumptions, not scoped into this one.

**Phase 1 cache-first-render status after pilot #3:** schedRows, qsrActSummaryRows, salesLedgerRows,
glimpseRows, cashRows all now correctly cache-first (6 of the streams originally named in Section
3/4, plus the two-stream glimpse/cash bonus fix). `exceptionRows` rides along with glimpse/cash in
the same OPFS fields and `_stCloudEmailReport` call, so it was never actually broken the way
glimpse/cash were — confirmed by this pilot's round-trip test covering it implicitly (it's part of
the same `exceptions` OPFS field, unchanged this pass). No further named candidates remain from
Section 3/4's original list — the next egress work is either Phase 2 (delta sync, gated on the
owner's DDL decision) or a fresh sweep for any other T1/T2 stream not yet covered.

## 13. Phase 2 column audit (2026-11-21) — corrects this plan's own framing, work still open

Owner: "Keep going on egress Phase 2." Started the audit Section 4/5 called for — "which of the
~30 eager tables already have a reliable modified-at column, which don't" — against the real
schema, not a guess.

**Methodology, and a real gap in it found along the way.** Mapped every one of App.js's 52 `_st*`
eager-loader functions to the `load*()` function it calls (`src/lib/supabase.js`), then to that
function's real table(s) — 56 distinct tables, not ~30; the plan's original estimate undercounted.
First pass used service-role REST probes (`?select=<candidate_col>&limit=1` — a `42703` error means
the column doesn't exist, a 200 means it does; same calibration CLAUDE.md's own "measure it" rule
uses for anon-key reads) against 8 candidate names (`updated_at`/`refreshed_at`/`pulled_at`/
`synced_at`/`modified_at`/`last_updated`/`ingested_at`/`created_at`). **Confirmed this service-role
key is live and tenant-reading before trusting any result** (`lifelenz_schedule` → `content-range:
0-0/17576`, a real row, real count — this session's own measurement, not inherited from an earlier
one, per CLAUDE.md's standing per-session-credential warning).

That first pass found 45/56 tables with one of the 8 candidate names, 7 with only `created_at`, and
4 with none of the 8. **The 4-with-none result was itself wrong** — a plain `select=*` on each
showed `employee_pay_rate_changes` has `detected_at` and `forecast_week_cache` has `computed_at`,
neither in the candidate list. Same undercounting trap CLAUDE.md's QSRSoft-token paragraph already
warns about ("a plain grep... undercounts") — a fixed candidate-name list can't see a domain-named
column (`committed_at`, `entered_at`, `detected_at`, `computed_at` all turned up this session alone).
**So table-level "does it have A column" is the wrong question; the real one, per-table, is "does
its actual write path put a fresh timestamp on a row EVERY time that row changes."**

**That second question has a sharp trap this schema doesn't guard against at all: zero tables in
`supabase/*.sql` have an `updated_at`-bumping trigger (`moddatetime`, `trigger_set_timestamp`, or
any hand-rolled equivalent — grepped every schema file, zero hits).** Every `updated_at timestamptz
default now()` column in this schema only gets that default applied on INSERT; Postgres does NOT
re-apply a column default on the UPDATE half of an upsert. So a column's mere existence proves
nothing about whether a row that gets corrected (re-upserted into an existing `(loc,date)`-keyed
row, the exact shape `lifelenz_schedule`/`qsr_*`/`sales_ledger_daily`/etc. all use) actually bumps
it — that depends entirely on whether the WRITING CODE explicitly sets the column in its own
upsert payload. Get this wrong and a watermark delta-sync would silently stop seeing corrections
forever after the first pull, with no error, no mismatch anyone would notice until a number looked
wrong weeks later — exactly the kind of bug CLAUDE.md's "measure it" rule exists to prevent, and
far worse than Phase 1's cache-first risk (which only ever shows briefly-stale data, never
silently-wrong-forever data).

**Verified for the Phase 2 Pilot #1 candidate, `lifelenz_schedule`, by reading the real write path
(not inferring from the column's existence):** `scripts/lifelenz-pull.mjs`'s row-builder explicitly
sets `updated_at: new Date().toISOString()` on every row before `.upsert(rows, {onConflict:
'loc,date'})` (line ~613) — real, write-time-bumped, safe to build a watermark on. Also spot-checked
and confirmed safe: `forecast_commits.committed_at` (set explicitly in `saveCommit()`'s upsert
payload, `src/lib/supabase.js`) and `forecast_week_cache.computed_at` (set explicitly in
`scripts/forecast-week-precompute.mjs` before its upsert). The 7 `created_at`-only tables
(`coaching_cycle_notes`, `pay_events`, `smg_comments`, `smg_voice_daypart`, `smg_voice_performance`,
`custom_signals`, `staff_assignments`) split in two: `coaching_cycle_notes`/`pay_events`/
`smg_comments` are genuinely insert-only (grepped every `.from(...)` call site across `src/` and
`scripts/` — no `.update()`/`.upsert()` anywhere), so `created_at` alone is a safe watermark for
them; `custom_signals`/`staff_assignments` DO have real `.update()` call sites and would need a
real bumped-on-every-write column added — a genuine, narrow DDL candidate, not resolved yet.
`org_event_exceptions` and `forecast_commits`'s companion `org_event_exceptions` table has no write
path at all in the live app (confirmed by the existing 5.336 changelog note — not re-investigated
from scratch), so it's moot either way.

**So this plan's own framing in Sections 4/5 ("Phase 2... needs an owner DDL decision", "the column
audit will very likely surface at least one table that needs a new column") was PARTLY backwards —
not because no DDL is ever needed, but because the real blocking question was never "does a column
exist," it was "is this specific write path trustworthy," which needs reading actual upsert code
table by table, not a schema probe. Narrowed the open DDL candidates from "likely several of ~30"
to two confirmed-mutable, timestamp-less tables (`custom_signals`, `staff_assignments`) — small
enough to bring to the owner as a specific, named ask once (not yet done) — plus a standing
per-table verification requirement for any future watermark pilot on a table not already checked
above.

**Status: audit methodology established and the Pilot #1 candidate (`lifelenz_schedule`) is
write-path-verified safe. The remaining ~54 tables' write paths have NOT all been individually
read for this same explicit-set-on-every-write guarantee** — this session verified a representative
sample (schedule, forecast commits, forecast week cache, the three genuinely-insert-only
`created_at` tables, the two confirmed-mutable gaps) but did not open every one of the 56 tables'
pull scripts to confirm the same discipline. That full per-table verification, the actual
watermark-delta-sync mechanism (per-stream last-synced cursor storage + `WHERE <col> > watermark`
query + merge-not-replace into the cached array), and the two-table DDL ask are the next concrete
pieces of Phase 2 — reported to the owner rather than silently built, since the delta-merge
mechanism is the single most correctness-sensitive piece of this whole plan and deserves a nod on
scope before code, same posture as the LiveOps DAR fix (Section 11) got.

## 14. Phase 2 pilot #1 shipped (2026-11-21, v5.843): DDL + lifelenz_schedule delta-sync

Owner: "Go ahead with both — add the DDL and build pilot #1," approving both items Section 13
surfaced. Both done in the same pass.

**DDL — `supabase/schema-egress-phase2-watermarks.sql`.** Added `updated_at timestamptz default
now()` to `custom_signals` and `staff_assignments` (the two confirmed-mutable, timestamp-less
tables), backfilled every existing row (`updated_at = created_at`, 19/19 and 10/10 at run time),
and updated the three real `.update()` call sites
(`updateCustomSignal`/`appendCustomSignalHistory`/`setPrimaryStaffAssignment`,
`src/lib/supabase.js`) to set it explicitly on every write — this schema has zero triggers
anywhere, so a column only stays trustworthy if the application code sets it.

**Run mechanism — the Supabase Management API, not psql.** This agent session has no
`DATABASE_URL`/direct Postgres connection (same as every prior session that checked), but it DOES
have `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`, and the Management API's
`POST /v1/projects/{ref}/database/query` endpoint executes arbitrary SQL authenticated with that
token. Confirmed live before trusting it (`select now(), current_database()` returned a real
result, not an error), then used for the two `alter table` + two `update ... backfill` statements,
then re-verified via `information_schema.columns` + a row-count read that both columns exist and
every existing row has a non-null value. **This is a capability worth remembering for future DDL
asks in this repo** — it may let a future session run an owner-approved migration directly
instead of only ever writing a SQL file for the owner to run by hand. Still never run unattended
or without an explicit, specific owner approval, per CLAUDE.md's standing DDL rule — the
capability changes WHO can execute an approved change, not whether approval is still required
first.

**The delta-sync itself.** `_stLifelenz` (the T2 login-time startup stage) no longer calls
`STREAM_RELOADERS.lifelenz()` (which stays exactly as it was — a full-window fetch + full
replace, correct for its OTHER caller, the Data Manager "↻ Sync" button). It calls
`loadLifeLenzSchedule({ since: watermark })` and merges the result into `prev.schedRows` via the
new exported `mergeLifelenzScheduleDelta`/`maxUpdatedAt` helpers (`App.js`) instead of replacing
the array outright.

**Where the watermark lives — a real design error caught and fixed mid-build, not a clean first
pass.** First attempt threaded it through the OPFS blob as a new `watermarks` field (bumping the
version 6→7, exactly Phase 1's established pattern), assuming `_stLifelenz` ran nested inside
`performFullIDBRestore()` and could read the destructured `watermarks` value by plain closure —
the same assumption that made `sched`/`qsrAct`/etc. available to the Phase 1 pilots' own `_st*`
stages. **That assumption was wrong, and `src/__tests__/src-no-undef.test.js` caught it
immediately** (`'watermarks' is not defined` — a real ESLint no-undef failure, not a flake):
`performFullIDBRestore()` is only 133 lines (it restores the OPFS cache into `ds` and returns),
fired from its own `React.useEffect(()=>{ performFullIDBRestore(); },[])`. The tiered loader's
`_st*` stages — `_stLifelenz` among them — live in a COMPLETELY SEPARATE top-level `useEffect`
with no shared function scope and no guaranteed completion ordering between the two effects'
async work. Reading `dsRef.current` (a ref some other code in this file already uses) would have
worked but makes correctness depend on effect-commit timing between two independent effects —
fragile and hard to reason about. **Fixed by storing the watermark in `localStorage`** under
`mf_sched_watermark` (`App.js`'s exported `LIFELENZ_SCHED_WATERMARK_KEY`) instead — synchronous,
no cross-effect race at all, and the same mechanism this file already uses for other small
per-device bits (`mf_beta_mode`, `mf_email_report_ids`). The OPFS blob was reverted to exactly its
pilot-#3 state (`db/index.js` back to `v: 6`, no `watermarks` field) — this pilot needed no OPFS
schema change after all. **Lesson for any future cross-stage state in this tiered loader: don't
assume two `_st*`-looking functions share a closure just because they're textually close in the
file — check which `useEffect` actually encloses each one before designing around "it's already
in scope."**

**Design decisions, and why each one was checked against the real system rather than assumed:**
- **Merge key** is `loc|YYYY-MM-DD`, both sides already normalized the same way by
  `loadLifeLenzSchedule` (unpadded loc, date always built as `new Date(r.date + 'T12:00:00')`), so
  re-deriving the ISO date string from either a cached or fresh row is collision-free.
- **Deletions are a non-issue for this specific table** — grepped every pull script and app write
  path for `lifelenz_schedule`; it is upsert-only, never hard-deleted. A merge-only scheme that
  never removes a row based on its absence from a delta response would be WRONG for a table that
  gets real deletes; it's correct here only because this one doesn't.
- **Window pruning still runs on every call, delta or full**, so a row that's simply aged out of
  the current `[daysBack,daysFwd]` bounds since it was cached gets dropped — otherwise a
  merge-only scheme would grow the cache forever instead of tracking the window like a full fetch
  naturally does.
- **The watermark advances only from the SERVER's own `updated_at` values on returned rows, never
  the client clock.** An empty delta (nothing changed) correctly leaves the watermark unchanged —
  `updated_at > since` just matches nothing again next time, no special "advance anyway" logic
  needed, and no clock-skew risk from ever comparing two different machines' clocks.
- **The real egress win is ~79%, not ~100%, and the commit/changelog say so.** Read
  `scripts/lifelenz-pull.mjs`'s actual defaults (`LIFELENZ_DAYS_BACK=30`/`DAYS_FWD=14`, daily
  cron) before claiming any number — the pull script's own refresh window is narrower than the
  client's 180/30 read window, so roughly the most-recent-44-days slice gets its `updated_at`
  bumped on every single pull run regardless of whether the underlying numbers actually changed,
  and a delta sync still re-fetches that slice every login. Only the ~79% of the window outside
  that active zone genuinely stops being re-fetched once its `updated_at` stabilizes. Overclaiming
  "near-zero egress" here would have been exactly the kind of unmeasured, load-bearing claim
  CLAUDE.md's "measure it" rule and dispatch #89's own correction exist to prevent.

**Verification:** 10 new tests
(`src/__tests__/dispatch-egress-phase2-pilot1-watermark-sync-2026-11-21.test.js`) on the two pure
functions — merge-overwrite-by-key, merge-add-new-key, empty-delta-is-a-no-op,
aged-out-row-gets-pruned-even-with-an-empty-delta, distinct-stores-same-date-stay-distinct, and
`maxUpdatedAt`'s never-regress/ignore-null/empty-batch-keeps-prior-watermark behavior. Confirmed
the merge-key test actually catches a regression: temporarily collapsed the key to date-only
(dropping the store), watched the "distinct stores, same date" test fail with the exact wrong
collapsed count, restored, re-verified clean — same discipline as every prior pilot. Full suite +
build both clean.

**Status after this pilot:** Phase 2's only shipped delta-sync is `lifelenz_schedule`. The other
45+ tables confirmed to have a reliable watermark column (Section 13) are NOT yet wired for
delta-sync — each would need the same per-stream work (reading its real write path, choosing a
merge key, deciding whether deletes are possible for that table) that this pilot did for
schedule rows. That is the next candidate if the owner wants to keep going, not an automatic
follow-on — Section 13's own caveat stands: a column's existence was never the hard part.

## 15. Discovered mid-sweep (2026-11-21, v5.844): six LifeLenz loaders were fetching their ENTIRE
table history on every login — a bigger, separate problem from delta-sync itself

Owner: "Keep going and wire up the rest of the tables" (continuing Section 14's authorization).
Classifying the ~48 remaining eager-loaded tables into Wave 1 (safe for delta-sync)/Wave 2
(write-path gap, needs a prerequisite fix)/Excluded (real deletes) surfaced something more urgent
than delta-sync itself: the five LifeLenz Data Explorer startup stages in App.js
(`_stScheduleVariance`/`_stComplianceAudit`/`_stEmployeePerformance`/`_stPayrollReadiness`/
`_stLifelenzDar`) call their loaders with **no arguments at all**, and each loader's
`{start, end, locs} = {}` signature had **no internal default** — so `start`/`end` stayed
`undefined`, the `.gte`/`.lte` filters in the query builder were never applied, and the loader
fetched the WHOLE table, every single login. `loadLifeLenzAttendance` had the same bug class (no
`start` param to even pass).

**Measured live** (service-role REST recipe, CLAUDE.md's "measure it" rule):

| Table | Rows (unbounded) | Real consumer |
|---|---|---|
| `lifelenz_schedule_variance` | 6,227 | labor-tools.js's ScheduleDisciplinePanel, 7/14/30d window selector |
| `lifelenz_compliance_audit` | 9,727 | same panel family, same window selectors |
| `lifelenz_employee_performance` | 21,073 | per-period (monthly-ish) employee performance views |
| `lifelenz_payroll_readiness` | **83,595** | **ZERO** — confirmed by grep across src/views + src/features; only stream-freshness.js reads it, for a liveness check |
| `lifelenz_dar` | 2,884 | Signals LiveOps fallback (already bounded there — see below) |
| `lifelenz_attendance_summary` | 1,640 | smaller scale, same bug class |

Fixed by adding a `daysBack` default to each loader (45d for scheduleVariance/complianceAudit/
dar/attendance, 60d for employeePerformance, 14d for payrollReadiness — the tightest, since
nothing consumes it but a freshness check) that only kicks in when the caller doesn't supply
`start`. Verified via grep that no other call site in the repo relies on the unbounded behavior —
`loadLifeLenzDar`'s two existing `{start,end}` callers (`refreshDar`, and the LiveOps DAR fallback
inside `loadDailyActivity`) are byte-identical in behavior since they already pass an explicit
`start`.

**A real mock bug surfaced while writing the verifying test, worth recording:** the first version
of the mock Supabase query builder made `.range(from, to)` return an actual `Promise` immediately,
which broke chaining `.gte()`/`.lte()`/`.in()` AFTER `.range()` — and several of these loaders'
real code calls `.order(...).range(from, to)` and THEN applies `.gte()`. That's legal in real
supabase-js because its query builder is "thenable", not a real Promise: every filter method,
`.range()` included, returns the SAME chainable builder, and only `.then()` (i.e. awaiting it)
executes the query. The mock's bug (`q.gte is not a function`) looked exactly like a production
bug until traced to the mock itself — fixed by making `.range()` mutate-and-return-builder like
every other filter method, with execution deferred to a `.then()` implementation, matching real
supabase-js semantics. 7 tests
(`src/__tests__/finding-lifelenz-unbounded-eager-fetch-2026-11-21.test.js`), verified to catch a
reverted default (temporarily removed one loader's `if (!start)` guard, watched its test fail with
the exact expected "no gte call at all" symptom, restored, re-verified clean).

**Separately found + fixed in the same pass (owner request, mid-session):** Signals Live Ops's
"⟳ Sync Now" button (`signals.js`'s `handleSync` → `triggerDarSync`, `src/lib/supabase.js`) was
dispatching the `dar` workflow (`qsrsoft-dar-pull.yml`) via the `trigger-dar-sync` Edge Function —
but that workflow has been schedule-paused since 2026-11-16 for compliance reasons (CLAUDE.md's
QSRSoft Operator Security Notice), so every click dispatched a pull that would never run, with no
error surfaced (the Edge Function happily dispatches a workflow that then sits paused). This is
the SAME problem Section 11 (task #187) already fixed on the READ side — `loadDailyActivity`
falls back to LifeLenz's own DAR when `qsr_daily_activity` is empty — just never carried over to
the manual sync button. Fixed by adding a `lifelenz_dar` entry to the Edge Function's `WORKFLOWS`
allowlist (backed by the existing hourly `lifelenz-dar-pull.yml`) and repointing `triggerDarSync`
at it; `daysRecent` (days) converts to that workflow's `lookback_hours` input, floored at 24h so a
same-day click always covers the full current business day. Data Manager's own "QSRSoft Daily
Activity" row (`analytics.js`'s `SYNC_LABEL.dar`) is deliberately left alone — it is honestly
labeled as QSRSoft and paused, which is correct, not broken; only the Signals button (which never
claimed to be QSRSoft-specific) needed the swap. 3 tests
(`src/__tests__/dispatch-liveops-sync-now-lifelenz-dar-2026-11-21.test.js`), same
break-confirm-restore discipline.

**Not yet started (as of Section 15):** the actual Wave 1 delta-sync build for the ~21 tables
Section 13 classified as safe, which needs Phase-1-style OPFS cache-first-render added to each
LifeLenz `_st*` startup stage FIRST — none of them currently persist to OPFS at all, they do a
bare `setDs(prev=>({...prev, field: rows}))` full-replace with no `opfsSave` call. Delta-sync
without a persisted cache to merge into doesn't reduce login-time egress, since a fresh page load
starts from zero regardless of the watermark. Wave 2's ~11 tables (write-path gaps — `ops_rows`,
`ctrl_rows`, the `qsrsoft-ops-pull.mjs` upsert family, `smg_voice_performance`/`smg_voice_daypart`,
`qsr_employee_tenure`, `qsr_field_definitions`) still need their `updated_at`/timestamp set
explicitly on write before they can be delta-synced at all. `staff_assignments`/`org_events`/
`target_overrides` stay excluded (real delete paths, no alternative strategy designed).

## 16. Phase 1.5 shipped (2026-11-22, v5.846): OPFS cache-first-render for the 9 LifeLenz/HME/
Squadle streams — the Wave 1 prerequisite Section 15 identified

Owner: "You can just pick up" (continuing the prior session's work with no further scoping).
Closed Section 15's own "not yet started" prerequisite: `_stLifelenzJobHours`/
`_stLifelenzAttendance`/`_stScheduleVariance`/`_stComplianceAudit`/`_stEmployeePerformance`/
`_stPayrollReadiness`/`_stLifelenzDar`/`_stHmeDt`/`_stSquadle` now all write their fetched rows
into the OPFS blob (`opfsSave(next)`, same fire-and-forget pattern as pilots #1-3), and
`performFullIDBRestore()` renders the cached rows immediately on login — before the live T2 fetch
even starts — instead of leaving these panels blank until the network call lands.

**The real finding, surfaced by actually reading each loader's return shape before writing any
caching code (not assumed from the existing `sched`/`qsrAct`/`salesLedger` pattern):** the shared
`strip()`/`toRow()` pair every prior cached stream uses assumes a row's `date` field is either a
real `Date` instance or a value safe to run through `new Date(date)` and then read back via LOCAL
`getFullYear()`/`getMonth()`/`getDate()`. That assumption breaks for `lifelenzAttendanceRows`:
its `date` field (`r.period_end`, confirmed by reading `loadLifeLenzAttendance` in
`src/lib/supabase.js`) is a plain `"YYYY-MM-DD"` **string**, not a Date object. `new Date("2026-
11-20")` parses as UTC midnight; reading its LOCAL calendar components back in any negative-
UTC-offset timezone (America/Chicago, where this app actually runs, included) shifts the result
back one calendar day — the exact bug `src/utils/date.js`'s own `dKey()` header comment already
documents as a recurring trap in this codebase. Blindly reusing `strip()`/`toRow()` for this one
field would have silently corrupted every cached attendance row's date by a day in production,
while passing clean in a UTC CI runner — the kind of bug that never reproduces in the environment
that would have caught it.

**Fix: skip `strip()`/`toRow()` for all 9 new fields, cache verbatim, reconstruct only what
actually needs it.** Checked every one of the 9 loaders' real mapped row shapes first: 7 of the 9
(`jobHours`/`scheduleVariance`/`complianceAudit`/`employeePerformance`/`payrollReadiness`/
`lifelenzDar`/`lifelenzAttendance`) carry **no Date-object field at all** — every date-like value
on them (`weekStart`, `occurredAt`, `shiftDate`, `periodEnd`, `payPeriodStart`, `dt`, and
`lifelenzAttendance`'s own `date`) is already a plain string straight from Supabase. These seven
are cached byte-for-byte (`ds.X || []`, no mapping on write; `raw.X || []`, no mapping on read) —
JSON round-trips plain strings/numbers unaided, so there is nothing to corrupt. The other two
(`hmeDt`/`squadle`) DO carry real Date objects (`hmeDt` has two: `date` and `pulledAt`) —
`JSON.stringify` already serializes those via `Date.prototype.toJSON()` on write with no help
needed; `opfsLoad()`'s read side reconstructs them back into real Date objects via dedicated
`toDateIsoRow`/`toHmeDtRow` helpers, mirroring the existing `qsrAct`/`refreshedAt` wrapper pilot
#2 built for the identical reason (a stream with more than one Date-bearing field).

**Format:** OPFS blob bumped to `v: 7` (additive-only, same convention as v4-v6 — a reader on an
older cached file just gets `[]` for whichever of the 9 new fields it doesn't recognize, not a
crash). The two daily-aggregate derived views each raw stream already has a sibling for
(`scheduleVarianceDailyRows`/`complianceAuditDailyRows`/`lifelenzDarDailyRows`, computed by
`dailyScheduleVariance`/`dailyComplianceAudit`/`aggregateLifelenzDarDaily`) are recomputed from
the cached RAW rows at restore time rather than cached a second time — cheap pure functions
already imported in App.js, and recomputing keeps the cache a single source of truth.

**Verification:** 7 new tests
(`src/__tests__/dispatch-egress-phase1.5-lifelenz-opfs-cache-2026-11-22.test.js`), including a
direct check that `lifelenzAttendance.date` round-trips as the exact same string (never promoted
to a Date, never shifted a day) and that `hmeDt`/`squadle` restore real Date objects with the
exact original instant. Confirmed the `hmeDt` reconstruction test actually catches a regression:
temporarily stripped `toHmeDtRow`'s Date reconstruction down to a passthrough, watched the test
fail with the exact expected symptom (`date` restored as a plain ISO string, not a Date
instance), restored, re-verified clean — same discipline as every prior pilot. Full suite + build
both clean.

**Status after this pass:** Wave 1 delta-sync's own prerequisite (Section 15) is now closed for
all 9 of these streams. The actual Wave 1 delta-sync build itself (watermark-based `since` sync
for the ~21 tables Section 13 classified as safe) has still not started — this pass only built
the cache those future delta syncs will merge into, same scope boundary Section 15 drew.

## 17. Wave 1 readiness audit for the 9 Phase-1.5-cached streams (2026-11-22) — one real write-path
gap found, two loaders missing a field their own delta-sync would need

Before picking the next delta-sync pilot, read every one of the 9 streams' actual pull-script
write paths (not assumed from the "updated_at column exists" pattern CLAUDE.md already warns
is never the hard part) and their client-side loader mapping in `src/lib/supabase.js` — the same
"grep for `.update(`/`.upsert(` AND read what fields the row object actually carries" discipline
Section 13/14's audit used.

**6 of the 9 are Wave-1-ready as-is** — `updated_at` (or `pulled_at`) is set **unconditionally**
inside the upserted row object (so it refreshes on every write, including a same-row re-pull with
unchanged values — not just on first insert), confirmed by reading the literal line in each
script:
- `scripts/lifelenz-schedule-variance-pull.mjs:356`, `lifelenz-compliance-audit-pull.mjs:379`,
  `lifelenz-employee-performance-pull.mjs:357`, `lifelenz-payroll-readiness-pull.mjs:404` —
  `loc, updated_at: new Date().toISOString(), ...r` (identical pattern, all four).
- `scripts/lifelenz-dar-pull.mjs:230` and `scripts/lifelenz-pull.mjs:1096` (job hours) — same
  `updated_at: new Date().toISOString()` / `updated_at: now` pattern.
- `scripts/hme-cloud-pull.mjs:85` and `scripts/squadle-pull.mjs:192` — same pattern
  (`updated_at: new Date().toISOString(), ...r` / `...row`).
No client-side `.delete(` call exists anywhere in `src/` against any of these 9 table names
(grepped) — upsert-only, same as `lifelenz_schedule`'s own confirmed-safe write path (Section
14), so a merge-only delta scheme can't miss a server-side delete for any of them.

**1 real gap found: `lifelenz_attendance_summary`'s `pulled_at` is NOT a reliable watermark,
despite looking identical to the other 6 at a glance.** `scripts/lifelenz-attendance-pull.mjs:214`
upserts via `.upsert([row], { onConflict: 'loc,period_end' })` — but `row` never sets `pulled_at`
at all; the schema (`supabase/schema-lifelenz-attendance.sql:36`) only gives it a column
`default now()`. A Postgres column default fires on INSERT when the column is omitted from the
statement, but an `ON CONFLICT DO UPDATE` only touches the columns the upsert call's own row
object names — `pulled_at` isn't one of them, so **the column is set once on first insert and
never refreshed on any subsequent re-pull of the same `(loc, period_end)` row**, even when the
row's real content (`employeeCount`, `excusedAbsences`, etc.) changed. A delta-sync gated on
`pulled_at > since` would silently miss every real update after the first. **This table is Wave
2, not Wave 1** — same "write-path gap" category as the ~11 tables Section 15 already flagged
(`ops_rows`/`ctrl_rows`/the `qsrsoft-ops-pull.mjs` family/etc.), not a new category. The fix is a
one-line pull-script change (`pulled_at: new Date().toISOString()` explicit in the upserted row
object, matching every other LifeLenz table's own pattern) — not attempted in this pass; flagging
only.

**2 of the 6 write-path-safe streams are missing a field their own loader would need before a
delta-sync could actually be built against them — found by reading what the client gets back,
not just what the DB has:**
- **`lifelenz_schedule_variance`'s real primary key is `(loc, edited_by, occurred_at, seq)`** —
  `seq` exists specifically because `occurred_at` is "not necessarily unique per (loc,
  edited_by)... LifeLenz batches multiple field changes from one save action under the same
  timestamp" (the schema file's own comment). `loadLifeLenzScheduleVariance`'s mapped return
  shape does not surface `seq` at all today — a merge-by-key delta-sync keyed on anything less
  than the real PK would silently collapse multiple same-instant edits by the same editor into
  one. Needs one additive line (`seq: r.seq`) before a correct merge key can be built.
- **`hme_dt_daily`/`squadle_checklist_records` both set `updated_at` reliably on write, but
  neither `loadHmeDtRows` nor `loadSquadleChecklistRecords` surfaces `updatedAt` in its mapped
  return shape.** The existing `maxUpdatedAt(rows, since)` helper (App.js, built for
  `lifelenz_schedule`'s pilot) needs every delta row to carry `.updatedAt` to compute the next
  watermark — without it, the watermark could never advance past its initial value, and every
  "delta" fetch would silently re-request the same `since` floor forever (not wrong, just
  pointless — the real-content merge would still work, but the whole POINT of delta-sync, not
  re-asking for already-synced rows, would be defeated). Needs one additive line each
  (`updatedAt: r.updated_at`) before either is delta-sync-ready.

**Not a correctness bug in anything shipped — a scoping note for whoever builds the next pilot:**
none of the four additive field-exposure fixes above change any existing behavior (nothing reads
`seq`/`updatedAt` from these loaders today), so they're safe to land in the SAME commit as
whichever table's delta-sync pilot needs them, not a prerequisite PR of their own.

**Recommended next pilot, in order of readiness:** `lifelenz_job_hours` or `lifelenz_dar` (both
already expose a usable `updatedAt`/no composite-key gap) are the cleanest "copy the
`lifelenz_schedule` pilot's shape exactly" next steps. `lifelenz_schedule_variance`/
`lifelenz_compliance_audit`/`lifelenz_employee_performance`/`lifelenz_payroll_readiness` already
expose `updatedAt` too and need only the `seq` field (schedule_variance only) before the same
treatment. `hmeDt`/`squadle` need their one-line `updatedAt` exposure fix first.
`lifelenz_attendance_summary` needs its pull-script `pulled_at` fix first and is Wave 2, not
Wave 1 — do not attempt a delta-sync pilot for it before that lands.

⚠️ **Correction (2026-11-22, same pass that built the pilot below) — `lifelenz_job_hours` was
WRONGLY listed above as already exposing `updatedAt`.** Reading `loadLifeLenzJobHours`'s actual
mapped return shape (`src/lib/supabase.js`) before building on it — not assuming it matches
`lifelenz_dar`'s just because this section's own prior pass grouped them together — shows it
returns `loc/weekStart/businessRoleId/name/category/code/hours/cost/regHours/otHours/nShifts`
with **no `updatedAt` field anywhere**, even though the DB column exists and the pull script
(`scripts/lifelenz-pull.mjs:1096`) sets it unconditionally on every upsert. This is the exact
same "one additive line needed before delta-sync is buildable" category as `hmeDt`/`squadle`
below, not the "ready now" category — the write path is fine, only the loader's exposure is
missing (`updatedAt: r.updated_at`). Not attempted in this pass since `lifelenz_dar` alone was
enough for a clean next pilot; flagging for whoever does `lifelenz_job_hours` next.

## 18. Wave 1 delta-sync pilot #1 shipped (2026-11-22): lifelenz_dar

Built the actual delta-sync `lifelenz_dar` was already confirmed ready for in Section 17 —
copying `lifelenz_schedule`'s own pilot shape (Section 14) exactly, now that `_stLifelenzDar`
has somewhere to cache into (Section 16's Phase 1.5 OPFS write-back).

- `loadLifeLenzDar({ since })` (`src/lib/supabase.js`) — additive `since` param, adds
  `.gt('updated_at', since)` when given. Every pre-existing call site (no `since`) is
  byte-identical to before.
- `mergeLifelenzDarDelta(prevRows, deltaRows, { daysBack })` (`src/app/App.js`) — merge-by-key on
  `loc + '|' + startTime`, the table's real PK (`loc, start_time` — `supabase/schema-lifelenz-
  dar.sql`) both fields reproduced verbatim by the loader, so a cached row's key and a fresh
  delta row's key for the same hour always collide correctly. Window-prune on `dt` (a plain
  `'YYYY-MM-DD'` string field on these rows, never promoted to a `Date` the way
  `lifelenz_schedule`'s `date` field is) — a simple string compare, confirmed safe because ISO
  date strings sort lexicographically the same as chronologically.
  `LIFELENZ_DAR_WATERMARK_KEY = 'mf_lifelenz_dar_watermark'` in `localStorage`, same reasoning as
  `LIFELENZ_SCHED_WATERMARK_KEY` (no closure/ordering guarantee between this stage's `useEffect`
  and `performFullIDBRestore`'s).
- `_stLifelenzDar` (App.js) — reads the watermark, calls `loadLifeLenzDar({ since })`, early-
  returns on `since && !rows.length` (already current), advances the watermark via the existing
  `maxUpdatedAt` helper, merges into `ds.lifelenzDarRows`, recomputes `ds.lifelenzDarDailyRows`
  via `aggregateLifelenzDarDaily` on the MERGED rows (not just the delta — a daily rollup built
  from only the delta would silently drop every hour that didn't change this sync), then
  `opfsSave`s the result (Phase 1.5's cache-first write-back, already wired).
- Confirmed upsert-only before building: grepped `src/` and `scripts/` for any `.delete(` against
  `lifelenz_dar` — none exists, so "not in a delta response" only ever means "unchanged since the
  watermark," never "deleted server-side."
- 6 tests (`src/__tests__/dispatch-egress-wave1-pilot1-lifelenz-dar-watermark-2026-11-22.test.js`)
  covering overwrite-by-key, add-new-key, empty-delta-is-a-no-op, window-prune-on-aged-out-rows,
  and two distinct-keys-not-collapsed cases (same hour/different store; same store/different
  hour) — same coverage shape as `lifelenz_schedule`'s own pilot test file.
- `lifelenz_job_hours` is next per the corrected readiness note above, once its loader's
  `updatedAt` exposure gap is closed in the same commit as its pilot (not a prerequisite PR of
  its own, per Section 17's own scoping note). After that: `lifelenz_schedule_variance` /
  `lifelenz_compliance_audit` / `lifelenz_employee_performance` / `lifelenz_payroll_readiness`
  (schedule_variance needs `seq` exposed too), then `hmeDt`/`squadle` once their own `updatedAt`
  exposure lands.
