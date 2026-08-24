---
name: dispatch-92
description: SAGE told the owner "-6.0%, 27 of 27 stores under" and recommended a $42K-85K/mo district-wide downward schedule correction. Measured false on both counts (24/27, -2.50%) -- and the root cause is structural, not a one-off hallucination: query_forecast_snapshots fetches forecast_sales/actual_sales from Supabase and then DISCARDS them, aggregating only the unsigned mape field. SAGE has never had signed-bias data available to it. Add it to the tool, don't just correct the claim.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #92 — SAGE's forecast-bias claim was unsupportable by its own tool, not just wrong

**Read first:** the Forecast Accuracy panel's own backtest output (owner-run, 2026-08-24,
2026-07-20→2026-08-18, all 27 stores, AI Forecast district MAPE 6.04%) and this dispatch's
Resolution section below, which independently reproduces the same window against raw Supabase
data.

**Status:** ready, no owner decision needed. Root cause found and located in code; this is a
scoped fix, not an open investigation.

---

## What SAGE claimed, and why it looked credible

SAGE answered a forecast-accuracy question with **"-6.0%, 27 of 27 stores under"** and recommended
a **district-wide downward schedule correction** on that basis — the owner flagged this as the
single largest, least-verified recommendation SAGE had made (it changes every store's schedule),
and CLAUDE.md/`memory/handoff-2026-08-24-key-rotation.md` both name it as needing a real
Forecast-Accuracy MAPE run before anyone acts on it.

**It looked credible because the number was real.** The district's AI Forecast MAPE for that exact
window, per the app's own Forecast Accuracy backtest, is **6.04%** — nearly identical to SAGE's
quoted "-6.0%." SAGE did not invent a number; it took a real MAPE figure and reported it as if it
were a signed, universal "under" bias.

## Measured: the real signed bias is materially different on both axes

Reproduced live against Supabase (`forecast_snapshots`, `source='ai'`, `2026-07-25`→`2026-08-18`,
809 rows, all 27 stores), computing `(actual_sales − forecast_sales) / forecast_sales` per row and
averaging per store:

| | SAGE claimed | measured |
|---|---|---|
| Stores under-forecast (actual < forecast) | **27 of 27** | **24 of 27** |
| District avg signed bias | **-6.0%** | **-2.50%** |

**Three stores are actually over-forecast, not under** — Ada-Country Club (+0.59%), Purcell
(+2.04%), Atoka-Mississippi (+5.09%). The magnitude also isn't uniform: signed bias ranges from
Atoka-Mississippi's -12.08% to Purcell's +2.04% across the district — nothing close to a flat -6%
that would justify one district-wide correction number.

(Sanity check that this is the same data the app's own report shows: the same pull's unweighted
mean **absolute** error is 5.64%, in the same range as the report's 6.04% — the small gap is
expected, since `backtest.js` trims the worst ~5% of daily errors and the report may weight
differently. Same window, same model, same order of magnitude — confirms this is a fair
comparison, not a different dataset.)

## Root cause: SAGE's tool cannot report direction — it fetches signed data and throws it away

`supabase/functions/sage-chat/index.ts`, `query_forecast_snapshots`:

```ts
const { data, error } = await fetchAllRows(() => {
  let q = sb.from('forecast_snapshots')
    .select('loc,dt,source,forecast_sales,actual_sales,mape')   // <- fetched
    ...
});
...
for (const row of data) {
  const key = `${row.loc}|${row.source}`;
  if (!byStoreSrc[key]) byStoreSrc[key] = { mapeSum: 0, days: 0 };
  byStoreSrc[key].mapeSum += row.mape || 0;   // <- only mape is aggregated
  byStoreSrc[key].days++;
}
```

`forecast_sales` and `actual_sales` are pulled from the database on every call and then never
touched again — only the unsigned `mape` column is summed. **This tool has never returned signed
bias, count of over vs under stores, or district direction, on any call, ever.** "-6.0%, 27 of 27
stores under" was not a misread of real tool output — it was a directional/count claim SAGE stated
with no queryable data behind it at all. The magnitude (6.0% ≈ the real 6.04% MAPE) is the only
part that came from a real number; the sign and the "27 of 27" were not.

## The fix

1. **Compute and return signed bias in `query_forecast_snapshots`.** Alongside the existing
   `mape` aggregation, sum `(actual_sales − forecast_sales) / forecast_sales` per store/source
   (same per-row basis as `mape`, so it's a fair companion stat) and return it — something like
   `avg_signed_pct_error` per store, plus a district-level `stores_under`/`stores_over` count and
   `district_avg_signed_pct_error`. Follow this repo's existing "name the period/basis" discipline
   (dispatch #82's `gap_vlh_total`/`avg_daily_gap` split, dispatch #90's
   `act_vs_need_avg_hrs_per_day` note) — the field name and the tool's returned `note` must make
   the sign convention explicit (negative = actual under forecast) so a future reader can't
   re-invent this exact confusion in reverse.
2. **Update the tool's description and system-prompt docs** (`src/views/sage.js`, the
   `LIVE DATABASE TOOLS` block) so SAGE is told this tool is now the source for directional
   questions ("is the forecast running high or low", "how many stores are under-forecast") and is
   explicitly told **not** to infer direction or a per-store count from MAPE alone — MAPE is
   unsigned by definition and cannot support a directional claim under any circumstance.
3. **Do not silently patch just the number.** The fix has to be at the tool/data layer — a system
   prompt tweak alone would leave the tool incapable of ever answering a directional question
   correctly again.

## Verification bar

Ask SAGE the same forecast-bias question live, post-deploy, over the same window
(2026-07-20→2026-08-18 or 2026-07-25→2026-08-18). It must report a signed district bias in the
**-2 to -3%** range (not -6%) and a store count near **24 of 27 under** (not 27 of 27) — assert on
the actual returned numbers matching this dispatch's measured ground truth, not just on "the tool
now has a signed field." A tool that returns a signed field SAGE never reads is the same bug in a
different shape (see dispatch #90/#647's own "a working answer is not the same as the fix
shipping" lesson).

## Do NOT

- **Do not hardcode -2.50% or "24 of 27" anywhere.** Both are specific to this window and this
  forecast source (`ai`) — they will drift as new days accumulate. The fix is the query, not the
  number.
- **Do not treat -2.50% as a correction factor to apply to schedules.** Same caution as dispatch
  #90 item 3's LifeLenz ratio: this is a measured historical bias over one window, not a validated
  forward-looking adjustment. Whether/how to act on a real, smaller, non-uniform bias is a
  separate product question — this dispatch's job is making the number SAGE reports correct, not
  deciding what to do about it.
- **Do not remove or change `mape`.** It's a real, correctly-computed, useful stat on its own —
  the bug is that it was the *only* stat available for a question that needed a signed one.
- **Do not retroactively defend "-6.0%, 27 of 27" as approximately right because the magnitude was
  close.** 24/27 is not 27/27, and a claim's direction/scope being wrong is not rescued by its
  magnitude being coincidentally close — that coincidence is exactly what made this convincing
  enough to almost trigger a real district-wide schedule change.
