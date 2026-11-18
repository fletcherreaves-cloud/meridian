// @ts-nocheck
// Rolls up LifeLenz DAR's hourly rows (src/lib/supabase.js's loadLifeLenzDar) into one row per
// (loc, dt) -- the shape metric-source.js's METRIC_SOURCES srcs chains need (one row per day,
// not per hour, matching qsrActSummaryRows' own grain).
//
// Owner decision 2026-11-18 (practicality over a full field-by-field reconciliation project):
// use LifeLenz DAR for sales/gc/speed-of-service/labor% as-is, with a UI disclaimer covering
// the small, known variance against QSRSoft rather than holding every field to the same
// real-vs-real bar `sales` got (see memory/finding-lifelenz-dar-schema-2026-11-17.md).
//
// Still never averages an average, though -- "practical" isn't "wrong":
//   - netSales / transactions / actualPunchHours: straight sums (exact).
//   - avgDtServiceTime / avgFcServiceTime / avgMfyServiceTime: transaction-weighted daily
//     average, not a naive mean-of-hours -- LifeLenz exposes no per-station (DT/FC/MFY)
//     transaction count to weight by exactly, so overall hourly `transactions` is the best
//     available proxy weight. An approximation, not an exact figure; flagged in the UI
//     disclaimer, not just this comment.
//   - labourPercentageOfSales: net-sales-weighted daily average -- this one IS exact, not an
//     approximation: weighting a per-hour %-of-sales by that hour's sales exactly recovers
//     Σ(laborDollar)/Σ(sales) for the day, since laborDollar_hour = pct_hour × sales_hour.
//     Stored as a FRACTION (0-1), matching this app's laborPct convention -- LifeLenz's wire
//     value is a percent (e.g. 45.5, not 0.455), divided by 100 here, once, at the source.
export function aggregateLifelenzDarDaily(hourlyRows) {
  const byKey = new Map();
  for (const r of (hourlyRows || [])) {
    if (!r || !r.loc || !r.dt) continue;
    const key = `${r.loc}|${r.dt}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        loc: r.loc, dt: r.dt, netSales: 0, transactions: 0, actualPunchHours: 0,
        _dtTimeWeighted: 0, _dtWeight: 0,
        _fcTimeWeighted: 0, _fcWeight: 0,
        _mfyTimeWeighted: 0, _mfyWeight: 0,
        _laborPctWeighted: 0, _laborWeight: 0,
      });
    }
    const a = byKey.get(key);
    const trans = r.transactions || 0;
    const sales = r.netSales || 0;
    a.netSales += sales;
    a.transactions += trans;
    a.actualPunchHours += r.actualPunchHours || 0;
    if (r.avgDtServiceTime != null && trans > 0) { a._dtTimeWeighted += r.avgDtServiceTime * trans; a._dtWeight += trans; }
    if (r.avgFcServiceTime != null && trans > 0) { a._fcTimeWeighted += r.avgFcServiceTime * trans; a._fcWeight += trans; }
    if (r.avgMfyServiceTime != null && trans > 0) { a._mfyTimeWeighted += r.avgMfyServiceTime * trans; a._mfyWeight += trans; }
    if (r.labourPercentageOfSales != null && sales > 0) { a._laborPctWeighted += (r.labourPercentageOfSales / 100) * sales; a._laborWeight += sales; }
  }
  return [...byKey.values()].map(a => ({
    loc: a.loc, dt: a.dt,
    netSales: a.netSales, transactions: a.transactions, actualPunchHours: a.actualPunchHours,
    avgDtServiceTime: a._dtWeight > 0 ? a._dtTimeWeighted / a._dtWeight : null,
    avgFcServiceTime: a._fcWeight > 0 ? a._fcTimeWeighted / a._fcWeight : null,
    avgMfyServiceTime: a._mfyWeight > 0 ? a._mfyTimeWeighted / a._mfyWeight : null,
    labourPercentageOfSales: a._laborWeight > 0 ? a._laborPctWeighted / a._laborWeight : null,
  }));
}
