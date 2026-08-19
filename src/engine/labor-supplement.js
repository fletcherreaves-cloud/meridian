// @ts-nocheck
// Extracted from src/app/App.js (dispatch22, Workstream A) so the forecast-week
// precompute job (scripts/forecast-week-precompute.mjs) can build a ds.laborRows
// identical to what the browser builds, instead of a hand copy that risks drifting
// from the real client behavior over time. Pure function, no browser globals.

// Supplements ds.laborRows (the manual Labor Report) with ds.qsrActSummaryRows (the DAR
// auto-pull, ~60 days rolling) for the recent window, per the CLAUDE.md standing rule
// ("Auto/emailed-first, freshest-wins... Manual uploads are last-resort fill only... must
// never override auto/emailed data"). Auto WINS for any overlapping day here — verified
// 2026-08-04 against 7 real overlap days (store 3708, 7/15-7/21): DAR matched manual exactly
// on 4/7 days and within ~1.4% on the rest, zero corrupted/null values. (An earlier attempt
// using ds.schedRows — LifeLenz's own auto sales sync — was reverted: it had a genuine
// reliability problem, showing $80.57 and null on 2 of the same 7 days against a real
// $10,644.71/$9,708.44 — a silent-corruption risk a null-check wouldn't even catch. DAR
// doesn't share that problem.) Blast radius is naturally bounded to the recent ~60-day
// window DAR covers — the deep multi-year history "MAPE Full" backtests use is untouched.
// Closes the gap where ds.laborIdx (the forecast/backtest/DI-Calibration sales history
// index) was built from laborRows ALONE with zero auto-pull fallback — DI Calibration's
// trailing 6W/4W/2W/1W MAPE windows went blank whenever the manual Labor Report lapsed
// (it had, 14 days stale) even though the DAR had real sales data through yesterday.
export function supplementLaborWithSched(laborRows, qsrActSummaryRows) {
  if (!qsrActSummaryRows?.length) return laborRows;
  const key = r => String(r.loc) + '|' + (r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10));
  const autoByKey = new Map(qsrActSummaryRows.filter(r => r.sales > 0).map(r => [key(r), r]));
  if (!autoByKey.size) return laborRows;
  const manualByKey = new Set((laborRows || []).map(key));
  let changed = false;
  const kept = (laborRows || []).map(r => {
    const auto = autoByKey.get(key(r));
    if (!auto || auto.sales === r.sales) return r;
    changed = true;
    return { ...r, sales: auto.sales };   // auto wins the SALES figure for this day; other manual fields (laborPct/tpph/otHrs) untouched
  });
  const fillDays = [...autoByKey.entries()].filter(([k]) => !manualByKey.has(k)).map(([, r]) => r);
  if (fillDays.length) changed = true;
  return changed ? [...kept, ...fillDays] : laborRows;
}
