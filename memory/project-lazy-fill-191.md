---
name: project-lazy-fill-191
description: "#191 — manual-fallback lazy fill (auditRows) + qsr_fob parallel pagination: what shipped, what was deliberately narrowed, and the reasoning behind each cut"
metadata:
  node_type: memory
  type: project
---

# #191 — manual-fallback lazy fill + qsr_fob parallel pagination

Owner's production waterfall (v4.974) measured startup at 63s, with two independently-actionable
chunks: **~21s** eagerly loading manual-fallback streams that are last-resort fill per CLAUDE.md's
own standing rule, and **~14s** of `qsr_fob` on strictly-serial pagination. Full issue text and the
owner's design comment are on GitHub #191 — this records what actually shipped and why it's
narrower than the full design the issue's comment sketched.

## Part 1 — lazy fill, scoped to `auditRows` only

**What shipped:** `metric-source.js` gained a small trigger mechanism
(`configureLazyFill`/`ensureLazyFill`/`isLazyFillPending`, `LAZY_FILL_SOURCES = ['auditRows']`).
`metricDaily`/`metricSeries` now kick off an on-demand load the first time a metric chain that
includes `auditRows` is actually resolved, instead of `auditRows` loading unconditionally in the
startup T3 batch (`App.js`'s `_stAuditRows`, now removed). `auditRows` was the highest-volume
manual stream (21,929 of ~42,500 T3 rows).

**What did NOT ship, and why:**

- **Gap-scoping.** The owner's comment described a demand queue keyed on `(stream, loc,
  dateRange)`, unioning demands and requesting only the missing range — "automatically
  gap-scoped... strictly better than load the whole table when the panel opens." What shipped
  instead loads the WHOLE `auditRows` table, once, on first demand — same shape/cost as the eager
  load it replaces, just triggered on demand instead of unconditionally. This was a deliberate
  simplification: gap-scoping requires `metricDaily`/`metricSeries` (synchronous, cannot await) to
  track demand at (loc,date) granularity and a coordinator to union+debounce+dedupe, which is
  real additional plumbing this pass didn't build. The core win (a session that never resolves an
  `auditRows`-touching metric never loads it) is captured without it.
- **`laborRows`/`opsRows`/`ctrlRows`/`fobRows` stay eager.** Per the issue's own suggested
  sequencing ("prove the mechanism on audit_rows first... measure, then extend"). Nothing about
  their loading changed in this pass.
- **The trigger fires more eagerly than a naive reading suggests.** `metricDaily`'s chain-walk
  loop calls the trigger only when it actually REACHES the `auditRows` position — i.e. every
  earlier source in that chain (glimpseRows, ctrlRows) already checked and had nothing for that
  (loc,date). But `forecast.js`'s `compute6wk` calls the 4 chains that include `auditRows`
  (`empMealAmt`, `mgrMealAmt`, `manualRefAmt`, `mgrMealCnt`) for every store as part of the
  ALREADY-eager `buildStore`/`rawStores` pipeline. On any startup where even one store/day in the
  ~42-day compute6wk window lacks ctrl/glimpse coverage (routine — the current week's Controls
  upload often lags), the trigger fires almost immediately anyway. **This is not a bug — it's the
  mechanism doing exactly what "load when actually needed" means.** The measurable win is real but
  narrower than "auditRows never loads at startup": it's (a) auditRows no longer participates in
  T3's `Promise.all` gate — T3 now completes when fob/ops/ctrl finish, not waiting on a 4th
  concurrent stream — and (b) on any session where compute6wk's window IS fully covered by
  ctrl/glimpse for every store, the load genuinely never happens at all.
- **`ds.auditRows.length` never throws.** `ds` initializes `auditRows: []` (not `undefined`) at
  every ds-construction site in App.js, so removing the eager load does NOT change that shape —
  the lazy-fill's own module-level trigger state (`_lazyState`, not `ds.auditRows`'s
  defined/undefined-ness) is what tracks "already loaded."

### The 3 non-resolver `auditRows` consumers (owner asked: handle each differently)

1. **`store-analytics.js`'s `RegisterAuditTab`** — reads `ds.auditRows` directly (not through the
   resolver), so it would never fire a demand on its own. Now calls `ensureLazyFill('auditRows')`
   on mount and shows "Loading Register Audit data…" (distinct from "No Register Audit data")
   while pending — the v4.870 "pending must never look like empty" rule, applied where it's
   actually load-bearing (a real empty state vs a transient one look identical to the owner
   otherwise).
2. **`pipeline.js`'s `empRisk`** (2 sites) — the owner asked to "decide whether risk scoring is
   startup work at all." Measured, not assumed: `ds.empRisk` is WRITTEN in 5 places
   (`pipeline.js` x2, `session.js` x2, `App.js` x1) and READ in **zero** — grepped 2026-08-11.
   Decision: does not trigger the lazy-fill. Wiring a trigger to keep computing a field nothing
   reads would silently reintroduce the exact eager-load cost this issue removes, for no consumer
   benefit. Left exactly as it was (guarded on `ds.auditRows.length>0`, which stays `[]` — and
   therefore this line stays a no-op — until something ELSE demands `auditRows`). If `empRisk`
   ever gets a real reader, that reader should trigger the fill itself.
3. **`analytics.js`'s `DataManagerPanel` coverage tiles** (`auditGrid`, and the generic `cov`
   table's `auditRows` row) — the issue's own design doc calls this "the trap": these report ROW
   COUNTS, so a naive migration would make them demand the full stream, moving the eager cost from
   startup to every panel-open instead of eliminating it. **Judgment call, recorded so it isn't
   re-litigated:** `DataManagerPanel` is a modal, opened deliberately and rarely (not part of the
   eagerly-mounted dashboard) — unlike a coverage tile embedded in something like At-A-Glance,
   opening it IS a genuine "load on open" moment, the same class as the Register Audit tab, not
   the trap the issue warned about (a coverage tile inside always-mounted UI). So this panel also
   calls `ensureLazyFill('auditRows')` on mount, and the two `auditRows`-related displays (the
   coverage grid's Audit column, the overview tab's Audit row) show a neutral "…" / "(loading…)"
   annotation instead of a red zero while pending, rather than a full second, more invasive
   count-only (`head:true`) query path. A true count-only endpoint is real future work if this
   panel's own open-cost ever becomes a reported problem.

## Part 2 — `qsr_fob` parallel pagination

`loadQsrFob` (`supabase.js`) was the last `qsr_*` loader on `fetchAll`'s strictly-sequential
one-page-then-wait loop — measured at ~30 back-to-back requests, ~14s (22% of the 63s startup) for
a 500-day/~13,200-row read. Switched to `_pagedParallel` (already used by `labor_rows`,
`peaks_rows`, `audit_rows`), which fans pages out under the shared `_MAX_INFLIGHT` concurrency cap
instead of awaiting each page before starting the next. `_pagedParallel` gained an `inCol`/`inVals`
option (mirroring its existing `gteCol`/`gteVal`) so `loadQsrFob`'s `dates`-array mode (unused in
production today — every call site calls it with no args or `daysBack` only) keeps working
identically if it's ever exercised. The 400-row page size is unchanged (Notes 60 bug #1: 1000-row
pages are ~1.45MB and previously timed out).

**⚠️ Measure before trusting this, per the issue's own warning.** `supabase.js`'s standing note
("Volume is the binding constraint, not ordering") records that two PRIOR scheduling changes
(v4.846, v4.847) both made total wall time WORSE while fetching the same bytes. This sandbox has
no authenticated Supabase session, so the wall-clock improvement is **not verified live** — only
that the change compiles, passes the full test suite, and preserves `loadQsrFob`'s exact filter
semantics (`dates` vs `daysBack` vs neither, tested via existing behavior — no test suite change
needed since the function's I/O contract is unchanged, only its internal pagination strategy). If
a live before/after waterfall shows this regressed, per the issue: **revert, don't tune further.**

## What's still open (not this pass)

- Items 3 (`ctrlRows`/`opsRows`/`fobRows` still eager), 4 (duplicate startup requests —
  `auth`/`org_config`/`user_settings` etc. deduping), and the #189 instrument fix (naming the 7s
  and 8.6s main-thread blocks) are separate, tracked issues.
- Gap-scoped demand queue (see "What did NOT ship" above) — worth building if `auditRows`'s
  simpler on-demand-whole-table load proves it captures less of the win than hoped once measured
  live.
