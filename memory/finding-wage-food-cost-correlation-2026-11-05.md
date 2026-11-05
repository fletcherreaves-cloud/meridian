# Finding: "Avg Wage Rate ($/hr) ↔ Base Food %" (r=+0.91) does NOT survive scrutiny

**Owner's prompt (2026-11-05):** Signals' Scanner surfaced "Avg Wage Rate ($/hr) ↔ Base Food %"
at r=+0.91 (screenshot). Owner's words: *"This is good! We should expound upon that for deeper
analytics. Could be something we get that no one else puts out front."* Investigated per
CLAUDE.md's standing "measure, don't assume causation from correlation" rule, **before** building
anything on top of it.

**Verdict: do not build a feature on this. The relationship does not reproduce in sign, is
substantially explained by a market confound (FL vs OK), and the part that survives the
confound is a static cross-store pattern, not a demonstrated dynamic lever.**

## Credential + method

Measured live against production Supabase with `SUPABASE_SERVICE_ROLE_KEY` (service-role,
bypasses RLS — this environment's key was live for this session; per CLAUDE.md, re-measure
before trusting this in a different session). Tables read directly via PostgREST:
`fob_rows` (manual Base Food % upload, one row per `(loc, month)`, dated the 1st of the month —
**confirmed monthly, not daily**: 1373 rows, 41 distinct dates in the first 1000-row page, 0 of
them off the 1st of a month), `ctrl_rows` (manual Controls upload, has its own `avg_rate` $/hr column directly,
2022-01-01 → 2026-07-15, 41,510 rows), `daily_glimpse_daily` (auto/emailed, **starts 2026-07-01,
no earlier** — confirmed the stream's documented forward-only floor), `qsr_daily_activity_rollup`
(auto DAR rollup, full history back to 2019). 27 distinct locs across both FL (Emerald Arches:
6178/6838/10034/35242/37566/38609/43701) and OK (MCDOK, the other 20).

`avgRate`'s real resolution path is `metric-source.js`'s auto-first derive
(`laborPct × sales ÷ actHrs`, with `laborPct` preferring `glimpseRows` then `ctrlRows` then
`laborRows`) — `signal-registry.js`'s declared `source:'laborRows'` is cosmetic labeling only;
`scanAllPairs` actually resolves every metric through `metricSeriesWithSource`/`METRIC_SOURCES`.
`baseFoodPct` resolves to `fobRows` only (monthly granularity, no auto chain at all in
`METRIC_SOURCES`) — confirmed in `signal-registry.js`'s own category table.

## What the full 55-month history actually shows (n=1373 paired store-months, 2022-01 → 2026-07,
using `ctrl_rows.avg_rate` directly as the wage figure — the Controls report's own $/hr, the
same underlying number the derive chain approximates)

| Slice | n | r |
|---|---|---|
| Pooled same-month, all 27 stores together | 1373 | **-0.429** |
| wage(month t) → food%(month t+1) | 1346 | -0.437 |
| food%(month t) → wage(month t+1) | 1346 | -0.453 |
| Cross-sectional, one point per store (store-average wage vs store-average food%) | 27 | **-0.854** |
| Within-store de-meaned (fixed-effect), pools each store's own deviations from its own mean | 1368 | +0.244 |
| Per-store r (stores with ≥12 paired months), mean across 26 stores | — | mean +0.277 (range **-0.34 to +0.71**, 21/26 positive) |

Every full-history slice that pools or cross-sections ACROSS stores comes back **negative and
moderate-to-strong** — the opposite sign from the owner's screenshot. The only slices that run
positive are the per-store time-series ones, and they're weak and inconsistent store to store
(5 of 26 stores are flat-to-negative).

## Where a +0.91-MAGNITUDE number could plausibly have come from

`daily_glimpse_daily` (the auto-preferred `laborPct` source) and `fob_rows` (the only source
`baseFoodPct` has) **only overlap in exactly one calendar month: July 2026** — glimpse starts
2026-07-01, and `fob_rows`'s newest row is dated 2026-07-01. So if the live widget's auto-first
resolver actually got to use its *preferred* source for both legs (rather than falling through to
`ctrl_rows`), the comparison it's running is a **27-store, one-month, cross-sectional snapshot**,
not a time series. Measured that exact slice directly (glimpse `labor_pct` × DAR
`product_sales` ÷ DAR `actual_punched_hours`, dollar-weighted, vs July's `fob_rows.base_food_pct`,
28/28 matched days for every store): **r = -0.891, n=27** — within 0.02 of the owner's reported
*magnitude*, with the opposite sign. Whether the UI itself shows the wrong sign or the owner
reported it from memory, the magnitude match says this is very likely the exact pairing that
produced the number, and it is a single-month cross-section, not a discovered trend.

## The cross-sectional pattern is substantially an FL/OK confound, not crew execution

Sorted by store-average wage (full 55-month history), the **top 7 highest-wage stores are
exactly the 7 FL (Emerald Arches) stores** — no overlap with OK. FL mean avgWage $14.22 vs OK
mean $11.79 (consistent with FL's state minimum wage running well above OK's, unrelated to crew
quality). FL mean Base Food% 20.62% vs OK mean 21.99%.

Splitting the cross-sectional correlation by market:

| Group | n | r |
|---|---|---|
| All 27 stores pooled | 27 | -0.854 |
| OK stores only (removes the FL/OK split) | 20 | **-0.517** |
| FL stores only | 7 | -0.336 (n too small to trust) |

Removing the market split roughly HALVES the correlation (-0.854 → -0.517). A real, smaller
cross-store pattern survives within OK alone (stores that have historically paid a bit more have
run a bit leaner on Base Food %) — but it is a **static, cross-sectional** pattern (which stores
happen to pay more), not evidence that raising a given store's wage CAUSES its food cost to fall.
Confirmed NOT a simple volume/complexity confound: store-avg wage vs store-avg sales r=0.053,
store-avg food% vs store-avg sales r=-0.189 — both near zero, so bigger/more-complex stores are
not simply the ones paying more.

## Why this fails the "survives scrutiny" bar

1. **Mechanism test (owner's Q1):** the within-store time-series relationship — the one slice
   that actually tests "does THIS store's own wage move precede/accompany its OWN food-cost
   move" — is weak (+0.24 to +0.28) and runs in the SAME direction trouble-shooting would not
   want (wage up slightly co-moves with food% up, not down), and is inconsistent store-by-store
   (5/26 stores flat-or-negative). It does not support "higher-paid crew waste less" as a live,
   actionable lever.
2. **Lag test (owner's Q2):** wage(t)→food(t+1) and food(t)→wage(t+1) are nearly identical
   (-0.437 vs -0.453) to the same-month pooled figure (-0.429) — there is no lag/lead structure
   distinguishing a dynamic effect from the static between-store difference already captured by
   the cross-sectional number.
3. **Store-by-store test (owner's Q3):** confirmed it does NOT hold uniformly — per-store r ranges
   -0.34 to +0.71; a district-level number here would be hiding real disagreement, exactly the
   failure mode the owner asked to check for.
4. **Confound test (owner's Q4):** confirmed real — FL/OK market split accounts for roughly half
   of the strongest (cross-sectional) version of the relationship, and volume/complexity does not
   explain it (ruled out directly).

## Disposition

No feature built. Per CLAUDE.md ("if it does NOT survive scrutiny... report that finding
honestly instead — a correlation that doesn't hold up is a real, useful answer too"), this is
reported as the answer. Secondary, smaller finding worth a follow-up (not actioned here, outside
this task's scope): `scanAllPairs`'s `minN` for monthly pairs is 6 — low enough that a
single-overlapping-month, 27-store cross-section like the July-2026 glimpse/fob_rows pairing
above can clear both the effect-size floor and FDR correction while being this fragile. The
guardrails protect against multiple-comparisons noise; they do not protect against a pairing
whose real sample size is "one calendar month," which reads to a user as a 27-point finding
but behaves statistically like n≈2 (FL vs OK) once the market split is accounted for.
