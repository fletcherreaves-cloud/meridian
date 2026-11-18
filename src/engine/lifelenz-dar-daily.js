// @ts-nocheck
// Rolls up LifeLenz DAR's hourly rows (src/lib/supabase.js's loadLifeLenzDar) into one row per
// (loc, dt) -- the shape metric-source.js's METRIC_SOURCES srcs chains need (one row per day,
// not per hour, matching qsrActSummaryRows' own grain). Straight sums only (net sales,
// transactions, punch hours) -- no rate math, no OEPE/service-time derivation. LifeLenz's
// avg_*_service_time fields are already-averaged and deliberately NOT wired into any metric
// chain yet; see memory/finding-lifelenz-dar-schema-2026-11-17.md for the measured reasons
// (net_sales reconciles against QSRSoft's product_sales; transactions does not reconcile as
// cleanly and isn't wired anywhere yet either).
export function aggregateLifelenzDarDaily(hourlyRows) {
  const byKey = new Map();
  for (const r of (hourlyRows || [])) {
    if (!r || !r.loc || !r.dt) continue;
    const key = `${r.loc}|${r.dt}`;
    if (!byKey.has(key)) byKey.set(key, { loc: r.loc, dt: r.dt, netSales: 0, transactions: 0, actualPunchHours: 0 });
    const a = byKey.get(key);
    a.netSales += r.netSales || 0;
    a.transactions += r.transactions || 0;
    a.actualPunchHours += r.actualPunchHours || 0;
  }
  return [...byKey.values()];
}
