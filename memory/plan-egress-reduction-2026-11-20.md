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
