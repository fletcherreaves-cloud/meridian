// Shared, Deno/Node-agnostic aggregation logic for SAGE's query_forecast_snapshots tool
// (dispatch #92, memory/dispatch-92.md). Imported directly by
// supabase/functions/sage-chat/index.ts and by its Vitest test in src/__tests__/, so the SAME
// code that runs in production is what the test exercises. Plain JS, no TypeScript, per repo
// convention (see labor-summary-agg.js for the prior instance of this pattern).
//
// The bug this fixes: SAGE told the owner "-6.0%, 27 of 27 stores under" on a forecast-accuracy
// question and recommended a district-wide downward schedule correction on that basis. Measured
// false on both counts (24 of 27, -2.50% over the same window) -- and the root cause was
// structural: this tool fetched forecast_sales/actual_sales from Supabase on every call and threw
// them away, aggregating only the unsigned mape column. SAGE never had signed-direction data
// available to it; "-6.0%" was really the district's MAPE (a real, unsigned stat) misreported as
// a signed, universal "under" bias.
//
// This module adds a signed companion stat computed on the SAME per-row basis as mape --
// (actual_sales - forecast_sales) / forecast_sales per row, averaged per store then per district
// (never a flat row average, so it's directly comparable to district_avg_mape's own store-then-
// district aggregation). Negative = actual came in UNDER forecast (the forecast over-projected);
// positive = actual came in OVER forecast (the forecast under-projected).

export function aggregateForecastSnapshots(rows, storeNames = {}) {
  // signedSum/signedDays track separately from mapeSum/days: forecast_sales can be null/0 on a
  // row where mape is still present, and we don't want a missing denominator to corrupt the mape
  // average or silently zero out the signed one.
  const byStoreSrc = {};
  const get = (loc, src) => {
    const key = `${loc}|${src}`;
    return (byStoreSrc[key] ||= { mapeSum: 0, days: 0, signedSum: 0, signedDays: 0 });
  };

  for (const row of rows) {
    const s = get(row.loc, row.source);
    s.mapeSum += Number(row.mape) || 0;
    s.days++;
    const fc = row.forecast_sales;
    const ac = row.actual_sales;
    if (fc != null && fc !== 0 && ac != null) {
      s.signedSum += (Number(ac) - Number(fc)) / Number(fc);
      s.signedDays++;
    }
  }

  // Reshape to per-store, per-source summary. mape stays under its bare source key (unchanged
  // shape from before this dispatch); the signed companion lives under `${src}_signed_pct_error`
  // so any existing reader of the mape fields is unaffected.
  const storeMap = {};
  for (const [key, v] of Object.entries(byStoreSrc)) {
    const [loc, src] = key.split('|');
    const entry = (storeMap[loc] ||= { loc, name: storeNames[loc] || `Store ${loc}` });
    entry[src] = +(v.mapeSum / v.days).toFixed(2);
    if (v.signedDays) entry[`${src}_signed_pct_error`] = +((v.signedSum / v.signedDays) * 100).toFixed(2);
  }

  return Object.values(storeMap).sort((a, b) => (a.ai ?? a.ly ?? 99) - (b.ai ?? b.ly ?? 99));
}

// District-level averages + directional counts, per forecast source. Mirrors
// aggregateForecastSnapshots' store-then-district aggregation: the mean of each store's own
// average, not a flat row average across all rows.
export function districtForecastStats(stores, srcNames = ['ai', 'ly', 'blend', 'di', 'qsr']) {
  const distAvgMape = {};
  const distAvgSigned = {};
  const storesUnderOver = {};
  for (const src of srcNames) {
    const mapeVals = stores.map(s => s[src]).filter(v => v != null);
    distAvgMape[src] = mapeVals.length ? +(mapeVals.reduce((a, b) => a + b, 0) / mapeVals.length).toFixed(2) : null;

    const signedVals = stores.map(s => s[`${src}_signed_pct_error`]).filter(v => v != null);
    distAvgSigned[src] = signedVals.length ? +(signedVals.reduce((a, b) => a + b, 0) / signedVals.length).toFixed(2) : null;
    storesUnderOver[src] = signedVals.length
      ? { under: signedVals.filter(v => v < 0).length, over: signedVals.filter(v => v > 0).length }
      : null;
  }
  return { distAvgMape, distAvgSigned, storesUnderOver };
}

export const FORECAST_SNAPSHOTS_NOTE =
  'mape = mean absolute % error (unsigned, cannot show direction). Lower = better. '
  + '{source}_signed_pct_error = mean((actual-forecast)/forecast)*100 per store: NEGATIVE means '
  + 'actual sales came in UNDER forecast (the forecast over-projected), POSITIVE means actual came '
  + 'in OVER forecast (the forecast under-projected). district_stores_under_over counts stores '
  + 'whose signed average is under (<0) vs over (>0) forecast, per source. '
  + 'Sources: ai=Meridian AI, ly=last-year-adj, blend=(ai+ly)/2, di=dialed-in, qsr=QSRSoft scheduled projection.';
