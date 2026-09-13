# Coaching Loop (#208) — real NOISE_THRESHOLDS measured and filled in (2026-09-13)

Follow-on to `memory/project-coaching-feedback-loop.md`'s v1 design, which shipped
`src/engine/coaching-loop.js`'s `NOISE_THRESHOLDS` deliberately empty: *"if this measurement
isn't ready, ship the loop recording cycles WITHOUT verdicts rather than with wrong ones."*
`computeVerdict()` returned `null` for every cycle since v1 shipped. This closes that gap with
real, cited thresholds — the exact follow-on v1's own comments named as still open.

## Measurement

Ran `scripts/measure-coaching-noise-threshold.mjs` (read-only, default window=30 days,
min-days=120) against live Supabase `labor_rows` / `qsr_fob` via `SUPABASE_SERVICE_ROLE_KEY`.
Access confirmed real before running the script, not assumed, per CLAUDE.md's "a live-data
claim must name the credential and the observation" rule — a direct `curl` with
`Prefer: count=exact` + `Range: 0-0` against `labor_rows` returned `content-range: 0-0/42156`
using the service-role Bearer token.

The script computes, per store per metric, trailing-30-day vs. trailing-30-days-ago-30-day
movement (`|delta|` in percentage points) and prints percentile buckets. Results:

| metric | n (movements) | stores | p50 | p75 | **p90 (chosen)** | p95 | p99 |
|---|---|---|---|---|---|---|---|
| labor_pct | 12,268 | 26 | 0.735pp | 1.356pp | **2.117pp** | 2.713pp | 4.514pp |
| fob_total_pct | 23,454 | 27 | 0.208pp | 0.410pp | **0.733pp** | 1.040pp | 2.835pp |
| condiment_pct | 23,454 | 27 | 0.071pp | 0.135pp | **0.243pp** | 0.339pp | 0.594pp |
| raw_waste_pct | 23,454 | 27 | 0.052pp | 0.103pp | **0.184pp** | 0.241pp | 0.387pp |
| comp_waste_pct | 23,454 | 27 | 0.017pp | 0.035pp | **0.064pp** | 0.084pp | 0.131pp |

## Bar chosen: p90

The script is explicit that a human picks the bar — it does not recommend one. Picked **p90**
for all 5 metrics: a movement further from baseline than 90% of ordinary month-to-month drift
is a defensible "this wasn't just noise" bar, roughly the same stringency this codebase already
uses elsewhere for "trust this as current, not stale" — `visit-readiness.js`'s
`OVERDUE_MULTIPLIER = 2x` cadence cut lands in a similar tail-not-median position relative to
its own distribution. p95/p99 were visibly available in the same table if a stricter bar is
wanted later (e.g. if p90 verdicts prove too noisy in practice, once real coaching cycles start
completing) — this is a judgment call, flagged as such, not a second independently-derived
measurement.

`NOISE_THRESHOLDS` is on the **fraction (0-1) scale** (matching `snapshotMetricValue()`'s
return and `computeVerdict()`'s `baseline`/`result` args), not the pp scale the script prints —
each value above divided by 100:

```js
export const NOISE_THRESHOLDS = {
  labor_pct: 0.02117,
  fob_total_pct: 0.00733,
  condiment_pct: 0.00243,
  raw_waste_pct: 0.00184,
  comp_waste_pct: 0.00064,
};
```

## What changed

- `src/engine/coaching-loop.js` — `NOISE_THRESHOLDS` filled in (was `{}`), with the full
  measurement cited inline in the file's own comment (per CLAUDE.md's "cite anchors, not line
  numbers" + the swing-alarm/count-completeness precedent of citing the measurement that
  produced a threshold directly in code). `computeVerdict()` itself is unchanged — it already
  read `NOISE_THRESHOLDS[metricKey]` and returned `'improved'/'worse'/'no change'` once a
  positive threshold existed; only the data was missing.
- `src/__tests__/coaching-loop.test.js` — the two tests that asserted the v1 empty-fallback
  state (`NOISE_THRESHOLDS.labor_pct` undefined, `computeVerdict` always null) rewritten to
  assert the real state: all 5 metrics carry a positive threshold, `computeVerdict` classifies
  correctly against each metric's own distinct p90, and `recordCoachingResult` now returns a
  real verdict instead of always `null`. 6 of the rewritten/added tests confirmed to fail
  against pre-fix code (`git stash push -- src/engine/coaching-loop.js` round-trip, keeping the
  new tests in place against the old empty-threshold engine file).

## What did NOT need to change

- `src/views/coaching-modal.js` — already branches on `preview?.verdict` with a `VERDICT_COLOR`
  map covering all 3 real verdict strings (`improved`/`worse`/`'no change'`) plus a null-verdict
  fallback message. It was already built to render real verdicts the moment they existed; no UI
  edit was needed, only the data. Confirmed by reading the file, not assumed.
- `recordCoachingResult()`, `startCoachingCycle()`, `toAttentionItem()`, `dueForReview()` — all
  unchanged; verdict computation was always downstream of `NOISE_THRESHOLDS`, so filling in the
  map was sufficient to activate real verdicts everywhere they're consumed.

## Scope not covered by this measurement

`scripts/measure-coaching-noise-threshold.mjs` only measures the 5 metrics
`COACHING_METRICS` currently covers (labor % + the 4 FOB components) — #208's own explicit
scope (food cost and labor only for v1). No other metric has a threshold, and
`computeVerdict()` still returns `null` for any metric key not in `NOISE_THRESHOLDS` (now only
reachable for a key outside `COACHING_METRICS` entirely, since all 5 real keys are now filled).
