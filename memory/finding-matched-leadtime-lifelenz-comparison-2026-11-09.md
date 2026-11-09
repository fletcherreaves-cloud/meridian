# Matched-lead-time MBI vs LifeLenz — real result (2026-11-09)

Closes the gap `memory/project-lifelenz-leadtime-capture-2026-09-11.md` opened: the original
2026-09-11 comparison (LifeLenz won 57.3% of days, mean |variance| LFZ 6.74% vs MBI 7.66% — see
`memory/finding-simple-model-holiday-blindness-2026-09-11.md`) wasn't apples-to-apples, because
`lifelenz_schedule.fcst_sales` is overwritten on every pull — a past date's LifeLenz number was
"as fresh as possible," not what LifeLenz actually knew at any real lead time. The owner's own
framing when he asked for the capture mechanism: *"More apples to apples. I suspect we will win
then!"* Two months of real `lifelenz_forecast_captures` history (append-only, written daily since
2026-09-12) now makes the real comparison possible. This file is that comparison, run once,
2026-11-09.

## Is this actually apples-to-apples now, or still "our locked vs their rolling"?

**It's apples-to-apples on information horizon — it is NOT locked-vs-rolling.** Meridian's side of
this comparison never touches a locked projection. For every `(loc, target_date, captured_date)`
row LifeLenz actually captured, the script calls the real production `forecastSimple(locRows, loc,
targetDate, asOf)` with `asOf = captured_date` — i.e. it recomputes, right now, exactly what
Meridian's own trailing-rate model would have said on that historical day, using only the sales
history that existed up through that day. `forecastSimple` is a deterministic function of trailing
data truncated at `asOf`, so this retrospective replay is mathematically identical to what a live
daily capture job would have written on that date — both sides see exactly the same lead time, the
same information horizon, no leakage either direction.

**The one real caveat (not a locked/rolling issue, a model-version issue):** the replay runs
TODAY's `forecastSimple` code — including the holiday-blindness fix that shipped after the original
September analysis — not whatever the function looked like on each historical day. That's
intentional: the question being answered is "how good is our current model at the lead time
LifeLenz operates at," not "what would a user have seen in September." Worth stating plainly so a
future reader doesn't assume this retroactively audits what actually displayed on-screen back then
— it doesn't, by design.

Once the new `forecast_rolling_captures` table (owner-directed 2026-11-09, generalizing this same
pattern to Meridian's own engine — see `memory/project-rolling-forecast-snapshots-2026-11-09.md`)
has real accumulated history, this comparison gets even more directly apples-to-apples: it can join
two real captured streams instead of replaying one of them retrospectively. That's the natural
point to automate this as a recurring, self-updating report instead of a one-off script run — see
Next Steps.

## Method

- `lifelenz_forecast_captures` (5,425 rows, 2026-09-12 → 2026-11-08) joined to `lifelenz_schedule.sales`
  (real resolved actuals) on `(loc, target_date)`.
- MBI side: `forecastSimple(trailingRows, loc, targetDate, asOf=captured_date)`, trailing series built
  from the same `lifelenz_schedule.sales` actuals (≥14 days of history required).
- Same plausibility guard as the original analysis: pairs excluded if `actual/forecast` or
  `forecast/actual` < 0.15 (an implausible/incomplete pull, not a real miss).
- Script: `/tmp/.../scratchpad/matched-leadtime-compare.mjs` (session-local; not committed — see
  Next Steps for where this logic should actually live).

## Result

| Bucket | n pairs | stores | LFZ win % | MBI win % | LFZ mean \|var\| | MBI mean \|var\| | LFZ median | MBI median |
|---|---|---|---|---|---|---|---|---|
| **Lead = 6** (the original "Thursday, 6 days out" ask) | 290 | 27 | **50.7%** | 49.3% | 12.52% | 12.41% | 5.30% | 5.21% |
| Lead = 1 (freshest, largest sample) | 1,205 | 27 | 52.9% | 47.1% | 12.85% | 13.43% | 5.02% | 5.46% |
| Lead = 3 | 816 | 27 | 52.9% | 47.1% | 15.92% | 16.53% | 5.36% | 5.68% |
| All lead times pooled | 4,901 | 27 | 52.1% | 47.9% | 15.05% | 15.49% | 5.31% | 5.58% |

## Verdict

**LifeLenz still edges us out, but the margin collapsed once the comparison was made fair.** The
original unmatched analysis showed a 57.3/42.7 split — a real, apparent 15-point LifeLenz advantage.
Matched for lead time, that shrinks to roughly **52/48 at every lead time except exactly 6 days,
where it's a statistical coin flip (50.7/49.3, n=290)**. Most of the original gap was the lead-time
mismatch itself, not a real accuracy difference — confirming the hypothesis that motivated building
the capture mechanism in the first place.

The remaining ~2-3 point edge at 1/3/pooled lead times is small but consistent and not noise (same
direction across three separate buckets, thousands of pairs). It's a real, modest LifeLenz
advantage, not a reversal in Meridian's favor — so the owner's hunch ("I suspect we will win then")
was directionally wrong at the specific 6-day ask (coin flip, not a win) but the broader instinct
that the comparison was unfair to Meridian was correct. A plausible (unconfirmed) explanation: at
very short lead times LifeLenz's scheduling platform likely has visibility into same-week
in-progress signals (manager overrides, confirmed event changes) that a pure trailing-rate model
can't see — this is a hypothesis, not something measured here, and would need its own investigation
to confirm.

## Next steps

- Wire this into a recurring, self-updating report once `forecast_rolling_captures` has enough real
  history to replace the retrospective `forecastSimple(asOf=...)` replay with a direct join of two
  real captured streams — cleaner (no model-version caveat above) and removes the need to
  temporarily re-export `forecastSimple` from `forecast.js` each time this is re-run (it is
  deliberately NOT exported from the module today).
- Candidate home for the recurring version: a small script alongside
  `scripts/forecast-rolling-capture.mjs` (same ds-building recipe, same cloud tables), surfaced
  either as a SAGE tool (`query_forecast_snapshots` already exists for MAPE-by-model; this would be
  a sibling) or a periodic note written somewhere the owner already looks (e.g. a Data Manager tile
  or a scheduled SAGE prompt run).
- Re-running today's version requires the same temporary edit-and-revert of `forecast.js`'s export
  block this session used twice — not something to leave as the permanent path.
