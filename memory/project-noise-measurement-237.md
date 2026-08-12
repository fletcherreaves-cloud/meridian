# District-relative noise measurement — the gate on coaching verdicts (#237)

Read-only measurement. No product change. Answers the question `project-coaching-loop-208.md`
left open (`NOISE_THRESHOLDS` ships `{}`, `computeVerdict()` always returns `null`): is district-
wide differencing tight enough to detect the owner's real coaching target (0.25–0.50pp) against
ordinary drift? **Both runs' full numbers are recorded here** — the first run's output previously
existed only in a chat thread; that is exactly how `cleanup-backlog.md`,
`finding-live-intraday-operations-report-data.md`, and `project-aag-tiles-reimagine.md` were lost
(CLAUDE.md's "Commit every memory file" standing rule).

## Run 1 — `scripts/measure-coaching-noise-threshold.mjs` (2026-08-12, service-role)

Ordinary |30-day movement| per store, pooled district-wide. Labor's own trailing-30 is a simple
mean (matches `metric-source.js`'s `metricAvg()`); FOB variants are dollar-weighted
(Σamt/Σsales) per store.

| Component | n | p50 | p75 | p90 | p95 | p99 | mean |
|---|---|---|---|---|---|---|---|
| labor_pct | 13,260 | 0.841 | 1.646 | 3.698 | 10.650 | 19.497 | 1.940 |
| fob_total_pct | 22,590 | 0.210 | 0.416 | 0.743 | 1.059 | 2.890 | 0.354 |
| condiment_pct | 22,590 | 0.071 | 0.136 | 0.245 | 0.344 | 0.600 | 0.108 |
| raw_waste_pct | 22,590 | 0.052 | 0.104 | 0.184 | 0.241 | 0.389 | 0.079 |
| comp_waste_pct | 22,590 | 0.017 | 0.035 | 0.064 | 0.084 | 0.132 | 0.027 |

All percentage points. Owner's target improvement is 0.25–0.50pp — both labor's median (0.841pp)
and FOB total's p75 (0.416pp) sit **inside** this noise band. A raw single-store before/after
verdict would fire on ordinary drift, which #208 forbids. Labor's tail is contaminated (#236) —
untrustworthy at p90+ until that closes.

## Run 2 — `scripts/measure-district-relative-noise.mjs` (2026-08-12, service-role, same data pull)

Tests the hypothesis that most of Run 1's movement is district-wide (commodity, promo, weather,
seasonality) and differencing it out leaves a materially tighter residual:

```
store_delta(N)    = trailing30_store(N)    − trailing30_store(N−30)
district_delta(N) = trailing30_district(N) − trailing30_district(N−30)
residual(N)       = store_delta(N) − district_delta(N)
```

District aggregate is dollar-weighted (Σvalue·weight/Σweight — for labor_pct that's Σlabor$/Σsales$
using `labor_rows.sales` as weight, even though labor's own STORE-side number stays an unweighted
mean; the two are different questions), leave-one-out (the measured store excluded from its own
district figure), computed over the exact calendar-date set of the store's own trailing-30 window
(not a district trailing-30-by-index that happens to end on the same date), and requires ≥20
(other-store, day) observations in that date set or the point is dropped — same guard as the store
side.

**Sanity check: Run 2's own raw `|store_delta|` column reproduces Run 1's table exactly**, to 3
decimals, on every component and every percentile — confirms both scripts are measuring the same
underlying series before trusting the residual comparison.

| Component | n survived | p50 raw→resid | p75 raw→resid | p90 raw→resid | p95 raw→resid | p99 raw→resid | mean raw→resid | **reduction (p95 raw÷resid)** |
|---|---|---|---|---|---|---|---|---|
| labor_pct | 13,260 | 0.841→0.735 | 1.646→1.457 | 3.698→2.937 | 10.650→4.634 | 19.497→10.490 | 1.940→1.294 | **2.30x** |
| fob_total_pct | 22,590 | 0.210→0.226 | 0.416→0.425 | 0.743→0.738 | 1.059→1.079 | 2.890→2.889 | 0.354→0.360 | **0.98x** |
| condiment_pct | 22,590 | 0.071→0.068 | 0.136→0.132 | 0.245→0.234 | 0.344→0.323 | 0.600→0.581 | 0.108→0.103 | **1.06x** |
| raw_waste_pct | 22,590 | 0.052→0.051 | 0.104→0.099 | 0.184→0.167 | 0.241→0.225 | 0.389→0.378 | 0.079→0.075 | **1.07x** |
| comp_waste_pct | 22,590 | 0.017→0.019 | 0.035→0.036 | 0.064→0.061 | 0.084→0.081 | 0.132→0.128 | 0.027→0.027 | **1.04x** |

All percentage points, `n survived` = (store, day) pairs passing every guard on both sides.

## Verdict — reported plainly, not massaged into a threshold

**The hypothesis mostly fails.** For all 4 FOB-family components, the reduction factor is
essentially 1.0x (0.98x–1.07x) — differencing out district-wide movement removes almost none of
the noise. FOB drift is predominantly **store-idiosyncratic**, not a shared district signal; there
is very little common market movement to subtract in the first place. The residual for
`fob_total_pct` at p50 (0.226pp) is still inside the owner's 0.25pp target floor — a single-store
residual-based verdict at that target size would still be indistinguishable from noise roughly half
the time.

**Labor's 2.30x reduction is real but almost entirely a tail effect, and the tail is the part #236
already flagged as broken data, not operations.** At p50/p75 — the percentiles that describe
*typical* movement, not extreme events — labor's reduction is only **~1.13–1.14x** (0.841→0.735,
1.646→1.457), a ~13% noise cut. The dramatic 2.30x number is driven by p95/p99, exactly the region
Run 1 already flagged as contaminated. Once #236 fixes or excludes those rows, labor's *real*
reduction factor is more likely close to the ~1.13x seen at the percentiles that aren't already
known to be broken — nowhere near enough on its own to bring a 0.841pp median drift down to a
0.25–0.50pp detectable signal.

**Conclusion: district-wide drift is not the dominant noise source for any of the 5 components
measured.** Per the issue's own contingency, this points toward the *other* path — longer
measurement windows, or reporting coaching verdicts as a confidence level rather than a binary
real/not-real call — not toward picking a residual threshold and pretending FOB's ~1.0x reduction
solves the problem it was tested against. **Verdicts stay off** (`NOISE_THRESHOLDS` stays `{}`);
this issue does not close by shipping a threshold, it closes by reporting this result.

## Per-store dispersion — one store is a data-completeness problem, not noise

Store `43701` is the single worst-dispersion store on every one of the 5 components, by a wide
margin (e.g. labor `|residual|` p90 = 11.057pp vs the next-worst store's 4.432pp), **and** it has
roughly a fifth of every other store's sample size (labor n=73 vs ~505–508 for the rest; FOB n=105
vs ~877). That is a coverage gap — a recently-added or sparsely-uploaded store — showing up as
apparent noise, not evidence the measurement or the coaching signal is unreliable elsewhere.
Worth naming when scoping #236 or setting per-store coaching eligibility; not itself acted on here.

## Four corruption risks named in the issue, and how Run 2 avoids each

1. **Dollar-weight the district aggregate, never average 27 percentages** — `districtWeightedAvg()`
   sums Σvalue·weight and Σweight across stores and divides once, for every component including
   labor_pct (added `labor_rows.sales` as the weight column specifically for this; labor's
   store-side average is intentionally left unweighted per the existing convention — those are two
   different questions, "what did this store do" vs "what did the market do").
2. **Leave-one-out** — `districtWeightedAvg(dates, excludeLoc, byDate)` skips the measured store's
   own entries when summing.
3. **Same day universe** — the district aggregate for a given window is computed over the exact
   `dates` array returned alongside that store's own `trailing30WithDates()` call, not a
   separately-computed district trailing-30 that merely ends on the same date.
4. **≥20-observation guard on the district side too** — `districtWeightedAvg()` returns `null` (the
   point is dropped) if fewer than 20 (other-store, day) pairs have valid data across the window's
   date set, on top of the pre-existing store-side guard.

## Running it again

```
set -a; source .env.local; set +a
node scripts/measure-district-relative-noise.mjs               # all 5 components
node scripts/measure-district-relative-noise.mjs --component labor_pct
node scripts/measure-district-relative-noise.mjs --min-days 180
```

Requires `VITE_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (RLS-scoped tables, anon key sees 0
rows — same constraint as every other `measure-*.mjs` script in this repo).

## Related

- #208 — the coaching loop; `NOISE_THRESHOLDS` stays empty pending a different approach
- #236 — labor_pct tail contamination; revisit labor's reduction factor once that closes
- `scripts/measure-coaching-noise-threshold.mjs` — Run 1, same data/conventions
- `memory/project-coaching-loop-208.md` — the v1 design this measurement gates
- `memory/feedback-measure-dont-reason.md` — the standing rule this measurement follows
