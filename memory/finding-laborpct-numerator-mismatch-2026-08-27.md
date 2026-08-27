---
name: finding-laborpct-numerator-mismatch-2026-08-27
description: Dispatch #173 -- chased all 4 leads for #327's 10.2% laborPct derive mismatch (job-code scope, revision lag, scale/rounding, generalizing the 31357 numerator deep-dive). All 4 leads measured and REFUTED. The gap is confirmed (not just suspected) to be a numerator disagreement on all 66/66 mismatched days, generalized from the single-day 31357 finding, but its specific cause remains unexplained. No code change.
metadata:
  type: finding
---

# #327's laborPct derive mismatch: four leads chased, all refuted (dispatch #173)

## Starting point

`src/engine/metric-source.js`'s `laborPct` chain comment (search `MEASURED ACCURACY` /
`crew_labor_dollars`) already documented: the `laborDollar ÷ sales` derive
(`crew_labor_dollars ÷ DAR product_sales`) matches Daily Glimpse's real `labor_pct` on 582/648
(89.8%) real store-days and disagrees on 66/648 (10.2%), mean signed diff +0.0050 (mostly runs
high), spread across 25/27 stores. Dispatch #164 already refuted the leading day-boundary
hypothesis (`memory/finding-comptype-calendar-labor-summary-2026-08-27.md`) — both legs are on
the same 4am business-day boundary. One prior deep-dive (store 31357, 2026-07-19) had ruled out
both candidate sales denominators for that one day, meaning the numerator itself likely
disagreed with whatever Glimpse used — the strongest unchased lead going into this dispatch.

This dispatch (#173) picked up the four prioritized leads left open: job-code/pay-type scope,
revision/correction lag, scale-dependent rounding, and generalizing the 31357 deep-dive.
**All four were measured and refuted.** Per the dispatch's own framing, "investigated further,
still open, here's what's now ruled out" is the legitimate outcome here — no fix is applied.

## Credential and reproduction

`SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_...`) confirmed live this session: `apikey` +
`Authorization: Bearer` against `lifelenz_schedule` returned `content-range: 0-0/15226` (real
rows, real count) before any measurement below. All numbers in this file come from that
credential against production tables — anon-scoped reads were not used.

The original 66-day mismatch list was **not preserved anywhere** in the repo or `memory/` (no
script producing it was found). It was reconstructed from scratch: pulled `qsr_labor_summary`
(`metrics.crew_labor_dollars`), `qsr_daily_activity_rollup` (`product_sales`), and
`daily_glimpse_daily` (`labor_pct`) for 2026-07-19..2026-08-11, joined on `(loc, dt)` with
zero-padding normalized, computed `derive = crew_labor_dollars / product_sales`, and compared to
`labor_pct` at the same >0.001 threshold the code comment uses. Result:

```
Joined store-days: 648
matches: 582 (89.8%)
mismatches: 66 (10.2%)
pos/neg: 58 / 8   meanDiff: 0.0050   meanAbsDiff: 0.0074   maxAbsDiff: 0.0276
stores affected: 25 of 27
```

This reproduces the documented numbers **exactly** (store count, match/mismatch counts, signed
mean, pos/neg split), so the reconstructed 66-day list is confirmed to be the same population
the original measurement found, not a fresh independent sample that happens to look similar.

## Lead 1 — job-code / pay-type scope mismatch on the numerator: REFUTED

`qsrsoft_kb` (public-read) has a "Job Title Codes (JTC) Crew and Manager" article with a table of
`(code, description, POS Access, Manager vs. Crew Labor %)`. Several titles are "ambiguous" —
`POS Access = Manager` but `Manager vs. Crew Labor % = Crew` (i.e. QSRSoft's own official
crew-labor-% definition counts them as crew despite manager-level POS access): codes 541 (GM w/
Crew Punches), 646 (Floor Supervisor), 647 (Certified Swing Manager), 800 (OTP Pro Hourly), 2168,
2103, 2152, 10001, 10002, 20107. This looked like a strong candidate — if `crewLaborDollars`
(the labor-summary API field) and Glimpse's internal `labor_pct` classify these titles
differently, that would produce exactly a day-specific, mostly-one-directional gap.

**Measured against real punch data** (`qsr_punch_times`, which carries `job_title_code` per
punch and is the same raw-timestamp source dispatch #164 used, so the 4am business-day
re-bucketing convention it validated — clock components read as local wall-clock despite the
`+00:00` suffix — was reused unchanged): for each of the 66 mismatched days, summed hours from
"ambiguous" job-title-code punches (shift-punch time minus unpaid meal-punch time, same
subtraction dispatch #164's method required) inside the `[dt 04:00, dt+1 04:00)` window, and
compared to a 65-day control sample of *matched* (non-mismatched) days:

```
mismatch days: avg ambiguous-code hours = 47.98  (26.3% of total worked hours)
control  days: avg ambiguous-code hours = 44.88  (24.7% of total worked hours)
corr(ambiguous hours, diff) on mismatch set        =  0.011
corr(ambiguous hours, |diff|) on mismatch set       =  0.003
corr(ambiguous hrs / total hrs, diff) on mismatch set = 0.180
corr(ambiguous hours, isMismatch) across both sets  =  0.087
```

Ambiguous-title hours are present at essentially the same rate on mismatched and matched days,
and none of the correlations clear even a weak-effect threshold. If job-code scope were driving
the gap, mismatched days should show either much more ambiguous-hour exposure or a real
correlation between that exposure and the diff's sign/size. Neither holds. **Refuted.**

(One unclassified `job_title_code` — `670` — appeared in the punch data and isn't in the JTC
article; it's rare enough not to move the aggregate, and wasn't investigated further since the
overall correlation is already flat.)

## Lead 2 — correction / revision-lag hypothesis: REFUTED (with a caveat on what could be tested)

Both `qsr_labor_summary.updated_at` and `daily_glimpse_daily.updated_at` reflect the timestamp of
the **most recent upsert**, not a first-pull timestamp — `scripts/qsrsoft-ops-pull.mjs` re-pulls
a rolling trailing window (`QSRSOFT_OPS_DAYS_RECENT`, default 4 days) on every run, so a value
that changed on a later re-pull would already be reflected in `updated_at` without leaving a
history of the earlier (wrong) value. This means the *ideal* test — "did `crew_labor_dollars` for
a given date actually change between an early pull and a later one" — isn't answerable from this
environment; no pull-history/snapshot log survives in Supabase or the repo. Stated explicitly
per the dispatch's instruction to say so rather than guess.

What **is** testable and was measured: whether mismatched days differ systematically from matched
days in how stale their current `updated_at` is (a proxy for "was this row touched by a later
re-pull that could have carried a correction"):

```
labor updated_at lag from business date (days):  mismatch avg 4.91  vs  match avg 4.55
glimpse updated_at lag from business date (days): mismatch avg 6.56  vs  match avg 6.79
dar refreshed_at lag from business date (days):   mismatch avg 13.60 vs match avg 12.80

mismatches where labor.updated_at is EARLIER than glimpse.updated_at (labor "stale" relative to
Glimpse, the direction the lag hypothesis predicts): 35/66 (53.0%)
same check on matched rows (baseline rate):                                    370/582 (63.6%)
```

Mismatched days are not staler than matched days on any of the three streams, and the
"labor pulled before Glimpse" rate is actually *lower* on mismatched days than on matched days —
the opposite of what the lag hypothesis predicts (if a stale/uncorrected labor pull were
producing the gap, mismatches should show labor staler-relative-to-Glimpse more often, not less).
Mismatched days are also spread across 22 of the 24 dates in the window with no clustering near
the window edges (recent, still-correcting days) — printed per-date counts, min 1/max 6 per date,
no trend. **Refuted**, to the extent testable without pull-history data.

## Lead 3 — scale-dependent rounding/truncation artifact: REFUTED

```
corr(|diff|, sales) on mismatch set only   = -0.206
corr(|diff|, crewDollars) on mismatch set  = -0.205
corr(|diff|, sales) across ALL 648 rows    = -0.034

Mismatch rate by sales quartile:
  Q1 ($4,039–$8,594):   14/162 (8.6%)
  Q2 ($8,598–$10,455):  19/162 (11.7%)
  Q3 ($10,474–$12,823): 18/162 (11.1%)
  Q4 ($12,860–$24,726): 15/162 (9.3%)
```

No correlation, and mismatch rate is flat (8.6–11.7%) across the sales-volume spectrum — a
rounding/truncation artifact tied to dollar magnitude would show a monotonic trend here. It
doesn't. If anything the weak negative correlation within mismatches points away from bigger
stores having bigger absolute errors. **Refuted.**

## Lead 4 — generalize the 31357 deep-dive: CONFIRMED and extended (still not a fix)

The one existing deep-dive (store 31357, 2026-07-19) had ruled out `product_sales_amt` and
`net_sales_amt` as the implied denominator for that single day. Re-ran the same method across
**all 66 mismatched days**: for each, computed the sales figure that *would* make
`crew_labor_dollars / sales == glimpsePct` exactly (`implied = crewDollars / glimpsePct`), then
checked five independently-sourced sales candidates for that `(loc, dt)` against a tight $5
tolerance:

- `qsr_daily_activity_rollup.product_sales` (DAR, the derive's actual current denominator)
- `qsr_sales_mix.metrics.net_sales_amt`
- `qsr_sales_mix.metrics.product_sales_amt`
- `sales_ledger_daily.all_net_sales`
- `daily_glimpse_daily.all_net_sales` (Glimpse's own reported sales figure)

```
Of 66 mismatched days:
  0 have ANY candidate reconciling within $5 of implied sales
  66 have NO candidate reconciling -- numerator disagreement, same as the 31357 finding
```

**0/66, not just the one previously-checked day.** This robustly generalizes the 31357 finding:
the gap is a numerator problem on every mismatched day sampled, not a denominator-candidate-
picking problem, and not something specific to that one store/date.

Followed up by testing whether the numerator gap itself (`deltaDollars = crewDollars -
glimpsePct × sales`, i.e. the dollar amount `crew_labor_dollars` would need to shrink by to match
Glimpse, using the *already-confirmed-correct* DAR sales denominator) correlates with other
`qsr_labor_summary` fields that could plausibly be a scope difference:

```
corr(deltaDollars, over_time_total_dollars)   =  0.010
corr(deltaDollars, over_time_total_hours)     =  0.004
corr(deltaDollars, crew_labor_hours)          = -0.039
corr(deltaDollars, gross_dollars)             = -0.046
corr(deltaDollars, salaried_manager_dollars)  = -0.121
days where deltaDollars is within $5 of over_time_total_dollars: 1/66
deltaDollars / crewHours ratio: mean $0.291/hr, stdev $0.436/hr, range -$1.30 to +$1.44/hr
```

None of these correlate, and `deltaDollars/crewHours` isn't a clean constant rate either (a real
per-hour or fixed-category sweep — e.g. "OT premium double-counted" or "salaried-manager $
leaking into crew $" — would show up as a tight, near-constant ratio or a strong correlation with
one of these fields). It doesn't. So the numerator gap is confirmed real and pervasive, but its
specific cause is **not** OT dollars, gross dollars, salaried-manager dollars, or a simple
per-hour rate artifact either.

## What remains true / not true after this dispatch

- ✅ **Confirmed, not just suspected:** the 10.2% gap is a numerator-side disagreement between
  `crew_labor_dollars` (from `qsr_labor_summary`, `compType:'calendar'`) and whatever labor $
  figure Daily Glimpse's own `labor_pct` is internally computed from — on all 66/66 sampled
  mismatched days, not just the one previously checked.
- ❌ Not a day-boundary mismatch (dispatch #164, unchanged).
- ❌ Not a job-code/pay-type scope difference detectable via QSRSoft's own published
  "Manager vs. Crew Labor %" JTC classification (this dispatch).
- ❌ Not explainable by pull-timing / staleness differences between the two streams, to the
  extent testable without a pull-history log (this dispatch).
- ❌ Not scale-dependent (store size, sales volume, absolute $) (this dispatch).
- ❌ Not OT dollars, gross dollars, or salaried-manager dollars leaking across the crew/manager
  line, and not a clean per-hour rate artifact (this dispatch).
- **Still open:** what Daily Glimpse's `labor_pct` numerator actually is internally. It is not
  derivable from any field this environment can currently read — `daily_glimpse_daily` only ever
  carries the precomputed `labor_pct` itself, never a labor-dollar component field, and no
  QSRSoft KB article found in this session's search documents Glimpse's internal labor-$
  calculation (only the JTC crew/manager classification, which was tested and didn't explain it).
  Closing this would need either a QSRSoft-side field definition for Glimpse's `labor_pct` that
  isn't in the `qsrsoft_kb` table as currently populated, or a punch-level $-rate dataset this
  environment doesn't have (`qsr_punch_times` has hours and job codes but no wage rate/$ field).

## Scope discipline

Per the dispatch: `laborPct`'s source-priority order, its derive definition, and the
`metric-source.js` chain comment were **not** touched — no unambiguous, narrow, confirmed cause
was found, so no fix is in scope. The chain comment already correctly describes the state as
"gap's real cause is still open" (from dispatch #164's edit); this dispatch adds evidence that
narrows *what the cause is not*, but doesn't change that top-line conclusion, so the comment
itself needed no edit. No test changes, no version bump (docs-only investigation, per the
dispatch's own verification section).

## Reproduction

All measurement scripts were ad-hoc Node (`fetch` against the Supabase REST API using
`SUPABASE_SERVICE_ROLE_KEY`), run from the scratchpad, not committed to the repo (per this
repo's convention of committing findings, not one-off probe scripts). The methodology above is
complete enough to re-run: pull `qsr_labor_summary`/`qsr_daily_activity_rollup`/
`daily_glimpse_daily` for a date range, join on zero-padding-normalized `(loc, dt)`, threshold at
0.001 abs diff, then for the mismatched set pull `qsr_punch_times` (job-code hours),
`qsr_sales_mix`/`sales_ledger_daily` (alternate sales candidates), and the labor-summary
`metrics` sub-fields (OT/gross/salaried-manager $) for the correlation checks above.
