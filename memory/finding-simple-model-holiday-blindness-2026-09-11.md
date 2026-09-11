# MBI vs LifeLenz Accuracy analysis — 'simple' model had zero holiday awareness, fixed (2026-09-11)

Owner asked for a real analysis of why LifeLenz's forecast wins "MBI vs LifeLenz Accuracy" more
often than not, and a theory on the cause. Measured against real data rather than reasoned about
in the abstract, per the standing rule.

## Data used

`forecast_snapshots` (source='simple') joined against `lifelenz_schedule`'s `fcst_sales`/`sales`,
same dispatch #117 plausibility guard the Accuracy tab itself uses (actual/forecast < 0.15 ⇒
treated as an incomplete LifeLenz pull, excluded). 6,653 matched (loc, date) pairs, all 27 stores,
Jan 1 – Sep 10 2026.

## Headline result

LifeLenz wins 57.3% of days (3,810 vs 2,843), with a lower mean |variance| (6.74% vs 7.66%) and
lower median (5.02% vs 5.79%). This is real and consistent — LifeLenz's edge shows up in every
month sampled and on every day of the week, not concentrated in one anomaly.

## Finding #1 (fixed same session): 'simple' had no holiday adjustment at all

`forecastSimple()` (src/engine/forecast.js) is pure trailing-rate × same-DOW-shape — no LY
component, no reference to `isHoliday()`/`getHolidayAdj()` anywhere, unlike the engineered/DOW
pipeline which explicitly corrects for a holiday/LY-holiday mismatch. So July 4th, New Year's
Day, etc. were forecast exactly like an ordinary day of that weekday.

Measured impact: split the 6,653-pair sample by `isHoliday()`:

| | n | LFZ win% | avg\|var\| LFZ | avg\|var\| MBI | MBI worse by |
|---|---|---|---|---|---|
| All days | 6,653 | 57.3% | 6.74% | 7.66% | 0.92pp |
| **Holidays only** | 293 | 59.7% | 9.87% | **12.59%** | **2.71pp** |
| Non-holiday only | 6,360 | 57.2% | 6.60% | 7.43% | 0.84pp |

Holidays are only ~4.4% of days, so this does NOT explain the bulk of the gap — but the
disadvantage roughly triples on exactly those days, and several of the single worst MBI misses in
the whole sample were July 4 and New Year's Day (MBI 25-35% off, LifeLenz within 0.6-5.6%).

**Fixed**: `forecastSimple` now multiplies by `getHolidayAdj(date, loc, locLaborRows)` when
`isHoliday(date)`, the same function the engineered pipeline already uses. Stays leak-free —
`getHolidayAdj`'s own date lookups only ever reference prior years (`yrsBack>=1`), never anything
at or after the target date. 2 new tests in `src/__tests__/forecast.test.js` (holiday describe
block), confirmed to fail against the pre-fix code (ratio was exactly 1.0, not 0.80).

## Finding #2 (open): the majority of the gap persists on ordinary, non-holiday days too

57.2% LFZ win rate excluding holidays entirely — this is the real question, and holiday-blindness
doesn't answer it. Checked directional bias: both systems skew toward over-forecasting (MBI mean
+2.64%, LFZ mean +1.82%, over-forecasting on 58.8%/56.8% of days respectively) — not a sharply
different calibration direction, more like LFZ is just a bit tighter/less noisy across the board.

## Why the current comparison isn't apples-to-apples, and what that means for Finding #2

`lifelenz_schedule` upserts on `(loc, date)` — every daily pull OVERWRITES `fcst_sales` for a
given target date. So the `fcst_sales` a past date shows NOW is whatever LifeLenz's system last
reported for it, which — per LifeLenz's own support bot, asked directly by the owner — is
continuously refined "up to the day it goes live." Meridian's side of this comparison
(`forecast_snapshots`'s 'simple' source) is leak-free (never sees data at/after the target date)
but computed with NO artificial lead-time restriction — effectively also "as fresh as possible."
So the comparison isn't biased toward MBI in an obvious way, but it also isn't matched on lead
time: we don't know what LifeLenz's forecast looked like 6 days out (when a real schedule gets
locked) for any past date, because that state was already overwritten.

**This can't be backfilled** — the lead-time history for every past date is already gone. Fixed
going forward: see `memory/project-lifelenz-leadtime-capture-2026-09-11.md` and
`supabase/schema-lifelenz-forecast-captures.sql` — a new immutable capture table, written daily
by `scripts/lifelenz-pull.mjs`, that will let a genuinely lead-time-matched comparison (including
the owner's specific "Thursday, 6 days out" ask) be built once a few weeks of history accumulate.

## Recommendations, in priority order

1. ✅ **Done**: fix 'simple's holiday blindness (small, well-evidenced, immediately shipped).
2. ✅ **Done**: build the lead-time capture mechanism so the "does freshness explain the rest of
   the gap" question can finally be tested with real data, not guessed at.
3. **Not done, worth considering once capture data exists**: LifeLenz's own support bot cites
   weather as an input signal. Meridian already has `weatherRows` (Signals panel). If the
   lead-time-matched data shows LFZ's edge concentrated on weather-anomalous days even at matched
   lead times, that's a concrete case for feeding weather into 'simple' too — don't build this
   blind; let the new capture data confirm or rule it out first.
4. Re-run this exact analysis once `lifelenz_forecast_captures` has a few weeks of history, sliced
   to the owner's actual lock lead time, to see whether Meridian's edge (which the owner suspects
   is real, "we do pretty damn good as-is") shows up once the comparison is fair.
