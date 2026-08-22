# Dispatch #64 — Visit Readiness sources half its metrics manually while auto streams exist

**Status:** ready to start. Needs nothing from the owner. **Priority: above the rest of the queue.**
**Found:** owner, 2026-08-22, from a Visit Readiness coaching report for Ardmore-Cooper/12th
(#24471) generated that day showing `R2P front counter · QSRSoft · Operations Report (Excel
upload) (manual) · 7 days · as of 2026-07-15` — **a 38-day-old input on a report dated today.**

---

## The report told the truth. The sourcing is the bug.

`SOURCE_META` (`src/engine/visit-readiness.js:39`) correctly labelled the input `manual` and
printed its real as-of date. That provenance line is what surfaced this — **it worked.** Do not
"fix" the label. The defect is one layer up: the metric should never have been reading a manual
stream in the first place.

## What's wrong

`visit-readiness.js` carries its **own** `srcs` chains (`SPEED`/`ACCURACY`/`QUALITY`/
`LEADERSHIP`/`FOODSAFETY`, lines 84-124) instead of calling `src/engine/metric-source.js`. This is
the standing rule verbatim: *"Source data through the shared helpers — never filter raw rows for a
metric or a vs-LY in a panel."* Those local chains have drifted strictly **worse** than the shared
ones — measured 2026-08-22:

| VR key | `visit-readiness.js` | `METRIC_SOURCES` | gap |
|---|---|---|---|
| `r2p` | `[opsRows]` | `[qsrActSummaryRows, opsRows]` | 🔴 **manual-only; auto exists** |
| `park` | `[opsRows]` | `[glimpseRows.parkedPct, opsServiceRows, opsRows]` | 🔴 **manual-only; 2 auto exist** |
| `tpph` | `[laborRows]` | `[qsrActSummaryRows, ctrlRows, laborRows]` | 🔴 **manual-only; auto exists** |
| `oepe` | `[glimpseRows, opsRows]` | `+ qsrActSummaryRows, opsServiceRows` | 2 auto fallbacks missing |
| `kvst` | `[glimpseRows, opsRows]` | `+ opsServiceRows, qsrActSummaryRows` | 2 auto fallbacks missing |
| `labor` | `[glimpseRows, laborRows]` | `laborPct: + ctrlRows` | minor; **note the key rename** |

**The auto R2P source already exists and is already reconciled.** `src/lib/supabase.js:1990`
derives it from the DAR as `(fc_untilserve − fc_untilclosedrawer) / fc_trans_cnt / 1000`, and its
own comment states it is *"Reconciled EXACTLY to the QSRSoft Daily Activity report's R2P column
across every"* store and *"Cloud-fresh (DAR pulls run ~8a/10a/2p CT)"*. Nothing needs building.

## Why this is worse than a stale label

**R2P feeds Speed (35% weight). TPPH feeds Leadership (15%).** So half the composite on that
report was computed from inputs frozen on 2026-07-15. The headline `47 · At risk`, the
`Recommended focus` ranking, and the coaching action are therefore **not describing the store as
it is today** — on a report whose entire purpose is coaching a GM. A confidently wrong coaching
report is worse than an obviously incomplete one.

## Phase 1 — route through the shared helper (the whole point)

Replace the local `srcs` mechanism with `metricDaily`/`metricSeries`/`metricAvg` from
`metric-source.js` for the six keys above. **This is a deletion, not a construction** — the
freshest-wins ordering, the auto-first chains, and future source additions all come free, and
`MANUAL_ONLY_METRICS` stays empty as the standing rule requires.

⚠️ **Key mapping is not identity.** VR's `labor` is the helper's `laborPct`; VR's `park` reads
`park` while the helper's first source is `glimpseRows.parkedPct`. Map explicitly; do not assume
the names line up.

⚠️ **Preserve the provenance display.** `SOURCE_META` drives the report's `Source / freshness`
column, which is what made this findable. The helper must report *which* source actually answered
so that column keeps telling the truth — if `metricDaily` doesn't expose that today, add it rather
than dropping the column to a constant.

## Phase 2 — the four metrics the helper doesn't cover yet

Not in `METRIC_SOURCES` at all, and reading manual streams that have auto equivalents:

- **`tRedA`** ← `ctrlRows` (manual Controls upload). Signals already reads Controls
  loss-prevention from **cloud** streams (`glimpse`/`cash`/`salesLedger`/`qsrActSummary`) as
  `(Cloud)` metric groups — see `src/engine/signal-registry.js`. Wire the same source in.
- **`comp` / `raw` / `statVar`** ← `fobRows` (FOB Excel). **`qsr_fob` is an auto stream** — At A
  Glance already reads FOB from it, dollar-weighted. Same treatment.

Per the standing rule, adding a metric is **one line in `METRIC_SOURCES`**. Do that, then Phase 1
picks them up automatically.

**Genuinely manual, leave alone:** `accB2B` / `problem` / `osat` come from `smgFullscale` (SMG
VOICE PDF/Excel drop) — no API exists, so manual is correct here. Keep the `manual` provenance
label honest. `schedGap` ← `schedRows` is LifeLenz, already auto.

## Verification bar

- **Reproduce first.** Generate the Ardmore-Cooper/12th (#24471) report before the change and
  capture R2P's as-of date and the composite score; regenerate after. The as-of must move to a
  current DAR date and **the score will change** — report both numbers in the PR body. A score
  that does *not* change means the wiring didn't take.
- **Render the real report** in the test, not the engine alone — per the standing revert rule, an
  engine-level test cannot tell "rewired" from "rewired but not called". A revert of either half
  must fail it.
- A store with **no** DAR coverage must still fall back to `opsRows` and still say `manual`.
- `npm run build` clean; entry-chunk before/after in the commit body.
- **Check `node -v` against `ci.yml`'s `[20, 22]` matrix** before trusting a local green (#60).

## Out of scope

Changing weights, targets, bands, or the food-safety flag. This dispatch changes **where the
numbers come from**, nothing about how they are scored.

---

## Resolution (2026-08-22, shipped v5.106)

**Shipped as specified.** Phase 1 and Phase 2 both landed; `accB2B`/`problem`/`osat`/`schedGap`
were left on the local resolver exactly as this brief said to.

### Implementation

- `src/engine/metric-source.js`:
  - New `metricSeriesWithSource(ds, loc, range, key)` export — same per-day auto-first
    resolution as `metricSeries()`, but each day carries `{ value, source, field }` instead of a
    bare number. `metricSeries()` is now a thin wrapper that strips `.value`, so every one of its
    ~27 existing call sites is unaffected (confirmed by the full suite staying green unchanged).
    This is what let VR keep reporting which source answered, per the brief's warning.
  - New `METRIC_SOURCES` entries: `compWasteAmt`/`rawWasteAmt`/`statVarianceAmt`/`prodSalesAmt`
    (raw $ legs from `qsr_fob`, `mode:'any'` — a real $0 day or a negative `statVarianceAmt` is
    legitimate, `'pos'` would discard both) and `compWaste`/`rawWaste`/`statVar` (the % a `derive`
    computes from those $ legs ÷ `prodSalesAmt`, behind the manual `fobRows` %'s own chain).
    Mirrors `analytics.js`'s `cloudFobRows` division exactly.
  - `qsr_fob`'s rows carry `loc` zero-padded by deliberate, documented loader contract (4 other
    consumers depend on it staying padded). Rather than touch the loader, `_srcIdx`/`_srcDates`
    now normalize ONLY that one source (`_PADDED_LOC_SOURCES`/`_srcLocKey`) at the index-building
    boundary — every other source and every caller's own loc string is untouched.
  - `MANUAL_FED_SOURCES` gained `fobRows`; `metric-source-order.test.js`'s `KNOWN_AUTO` list
    gained `qsrFobRows` — both existing structural ratchets (no chain may prefer a manual stream
    ahead of an auto one; every source must be classified) needed to know about the two new
    stream names before they'd pass.
- `src/engine/visit-readiness.js`:
  - `SPEED`/`ACCURACY`/`QUALITY`/`LEADERSHIP`/`FOODSAFETY` specs for the migrated keys
    (`oepe`/`kvst`/`park`/`r2p`/`tpph`/`labor`/`tRedA`/`comp`/`raw`/`statVar`) no longer carry a
    local `srcs:` array. `accB2B`/`problem`/`osat`/`schedGap` still do, by design — they use the
    legacy local resolver.
  - `MS_KEY = { labor: 'laborPct', tRedA: 'tRedAPct', comp: 'compWaste', raw: 'rawWaste' }` — the
    only four keys that aren't identity between this file and `metric-source.js`. Everything else
    migrated (`oepe`/`kvst`/`park`/`r2p`/`tpph`/`statVar`) already matches metric-source.js's own
    key name.
  - New `msValueForLoc(ds, msKey, loc, monthly)` — calls `metricSeriesWithSource` over either a
    45-day window (daily metrics, same as before) or a **1095-day** window (monthly metrics —
    see "self-caught" below), reduces to the same `{ v, n, firstMs, lastMs, source, field }` shape
    `pickValue` already returned, with provenance taken from the FRESHEST contributing day (the
    day the displayed number is actually tracking).
  - `pickValue` now branches: a spec with `srcs:` uses the untouched legacy path
    (`valuesByLoc` + local resolution); everything else goes through `msValueForLoc`. Return shape
    is identical either way, so `subScore`/the report needed no changes to consume it.
  - `subScore`'s missing-reason message now reads `METRIC_SOURCES[MS_KEY[spec.key]||spec.key].srcs`
    for migrated specs (falls back to the deleted local array only for the 4 still using it) —
    the exact fix the brief's second trap named: without this, the message itself would have
    re-drifted stale the moment metric-source.js's chain changed underneath it.
  - `SOURCE_META` gained entries for `qsrActSummaryRows`/`opsCashRows`/`qsrFobRows`/`derived` so
    the report's provenance column shows the real system/report/feed for a migrated driver
    instead of `srcMeta()`'s unknown-key fallback (`Meridian · feed unknown`) — not strictly
    required by the brief, but the brief's own point is that this column is what makes staleness
    findable, and an "unknown" feed for a genuinely auto source would have quietly undercut that.
  - `valuesByLoc()` was NOT deleted (the plan going into this session assumed it would be) — it
    is still the resolver for the 4 specs deliberately left local.

### Self-caught, not in the brief

1. **Monthly window.** The old `valuesByLoc`'s monthly branch had no cutoff at all — it scanned
   full history for the single latest-dated value. Re-read before writing any code; would have
   silently broken "latest on record" for anything uploaded >45 days ago had the daily window been
   reused. Fixed with `MONTHLY_LOOKBACK_DAYS = 1095` (~3 years) instead.
2. **Zero-discarding, live-measured.** After the Phase 1/2 code was written, the mandated live
   verification against Ardmore-Cooper (see below) surfaced `park` resolving to `notMeasured`
   despite `metricSeriesWithSource` correctly returning a real value for every day in range. Root
   cause: `msValueForLoc`'s daily mean carried over the old resolver's `v === 0` exclusion, which
   never mattered under the old single-source `park` chain but is actively wrong now — `park`'s
   `METRIC_SOURCES` chain leads with `glimpseRows.parkedPct` under `mode:'any'` specifically so a
   genuine 0% park rate counts as data (#150/#178). Every in-window day happened to be a real 0%
   from Glimpse, so the outer exclusion threw away the whole metric instead of reporting `0`.
   Fixed by removing the exclusion — `_ok()` already guarantees a `mode:'pos'` series can never
   contain a `0` (filtered upstream), so the check was a no-op for those and actively wrong for
   `mode:'any'` ones. This is exactly the "would this verification still pass if the change were
   reverted" bar: an engine-only check that never ran against real `mode:'any'` data would have
   shipped this regression invisibly.

### Verification (the score itself, live)

Service-role key, real Ardmore-Cooper/12th (#24471) data, both engines run against the identical
`ds` (pre-dispatch `visit-readiness.js` from `git show`, and the shipped one):

| | R2P value | R2P source | R2P as-of | Composite readiness |
|---|---|---|---|---|
| **Before** | 111.7s | `opsRows` (manual) | **2026-07-15** (38 days stale) | **48.6** |
| **After**  | 128.5s | `qsrActSummaryRows` (auto DAR) | **2026-08-22** (current) | **53.2** |

The composite moved — the wiring took. (`park` also moved from "not measured" — see the
zero-discarding bug above — to `0%`, `glimpseRows`, as-of 2026-08-20; `comp`/`raw`/`statVar`
resolved via `derived` from the qsr_fob $ amounts, as-of today; `tRedA` correctly still fell back
to `ctrlRows` because `opsCashRows`' `tRedAPct` had no valid value for this store in this
window — auto-first, manual-fallback working exactly as designed, not a bug.)

5 new tests in `visit-readiness.test.js` (31 total, up from 26): auto-only fixtures the old local
chains could never have read resolve correctly with the right key/field traps; a genuine `0` from
an auto source is not discarded (regression test for the self-caught bug above); a no-DAR-coverage
store still falls back to `opsRows` and still reports `manual`; the not-measured reason names the
live `metric-source.js` chain; and the actual `readinessReportHTML`/`readinessAuditCSV` (not just
`computeVisitReadiness`) surface a migrated driver's real source. **Demonstrated revert-sensitive**:
stashing `metric-source.js` + `visit-readiness.js`'s changes and re-running failed all 5, restoring
made them pass again.

2021/2021 tests total, `npm run build` clean, entry chunk 511.84 → 512.03 KB gzip
(`visit-readiness.js` itself is lazy-loaded via `lazyPanel()`, not in the entry chunk — the small
delta is `metric-source.js`'s new entries, which several eagerly-loaded panels import).
`node -v` (22) is within `ci.yml`'s `[20, 22]` matrix.

Shipped as `v5.106` (`src/app/changelog/5.106.js`).
