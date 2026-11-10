# Finding: `HEALTH_SCORE_SCALE=8` saturated every store at 100 — recalibrated to 0.1

**2026-11-10, owner-reported live from phone, minutes after the `security_findings_latest`
materialization fix (`finding-security-findings-latest-materialization-2026-11-10.md`) went
live:** the new 🩺 Briefing view's district health grid showed **every single one of 27 stores**
at score `100`, all red "Needs attention" — no ranking, no differentiation at all. Screenshot
showed Chickasha-So 4th (4 signals) and Madill-Hwy 70 (64 signals) both reading identically 100.

## Root cause

`src/engine/security-health.js`'s `computeStoreHealth()`:
```js
row.score = Math.min(100, Math.round(row.score * HEALTH_SCORE_SCALE));
```
shipped (PR #1803, same day) with `HEALTH_SCORE_SCALE = 8`, documented in its own header comment
as a "first-pass... not measured from live data" placeholder. That placeholder was picked before
two things landed in the same push: the Security Events pull going live (EVENT-001/002/003) and
the `security_findings_latest` pagination fix that, for the first time, let the Briefing view's
bulk `loadSecurityFindings()` call actually return its full real dataset instead of timing out.
Once real data could flow, `scale=8` was never tested against it.

## Measured, live, against the real post-fix dataset

Pulled every `pass=true`, non-lifecycle-routed `security_findings` row with `window_end >=
2026-10-01` (2,042 raw rows, paginated past PostgREST's 1000-row-per-request cap), deduped to the
latest row per `(loc, subject_key, rule_id)` — same dedup `security_findings_latest` performs —
giving **884 real current findings across all 27 stores with at least one flag**. Computed each
store's raw `severity × magnitude × (1 - exoneration)` sum using the exact same logic
`findingContribution()` already implements (re-derived in Python from the real `security_rules`
severities and real `baseline_context`/`threshold_used` values, not copied from the app):

| | raw per-store sum |
|---|---|
| min | 45.00 |
| median | 249.12 |
| mean | 341.45 |
| max | 1,480.40 |

At `scale=8`: every value above 12.5 clamps to 100 — **27/27 stores saturate.** At `scale=1`:
still 24/27 saturate. Real tier separation (`needsAttention:50`, `watch:15` thresholds) only
starts appearing well below 1:

| scale | saturate (>=100) | needs-attention | watch | clean |
|---|---|---|---|---|
| 8 (shipped) | 27/27 | 27 | 0 | 0 |
| 1 | 24/27 | 26 | 1 | 0 |
| 0.25 | 6/27 | 18 | 7 | 2 |
| **0.1 (chosen)** | **1/27** | **4** | **17** | **6** |
| 0.05 | 0/27 | 1 | 8 | 18 |

`scale=0.1` was chosen over `0.05` because the latter undersells real volume (18/27 stores read
"clean" despite having dozens of real flagged findings each) — `0.1` keeps the one genuine
statistical outlier (raw 1,480.40, nearly double the next-highest store) pinned at the clamp,
appropriately, while spreading the rest across watch/clean in a way that actually ranks the fleet.

## Fix

One-line change: `HEALTH_SCORE_SCALE = 8` → `0.1`, with the header comment rewritten to record
this measurement (so the NEXT person who touches this constant has the real distribution to
recalibrate against, not another guess). No other code changed — `findingMagnitude()`,
`findingContribution()`, `computeStoreHealth()`'s own math are all unchanged and already correct;
only the display-scale constant was wrong.

## What this does NOT fix

This is still a single linear scale applied to a raw contribution sum — not the full
persistence/convergence model the deep-dive doc scoped (still explicitly phase 2, per
`security-health.js`'s own header). A future phase's real trend/convergence terms will change the
raw sums again, and this constant will need re-measuring against whatever that produces — this
fix anchors it to a REAL measurement now, it doesn't make it permanent.
