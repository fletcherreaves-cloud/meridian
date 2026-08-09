// @ts-nocheck
// ── Hourly Projection Accuracy — pure stats engine (2026-08-09) ──────────────────────────────────
// Computes, per hour-of-day, the STANDALONE (non-cumulative) actual-vs-projected ratio distribution
// from hourly_projection_accuracy rows: { dt, hour_slot, loc, actual_sales, proj_sales, actual_gc,
// proj_gc } (supabase/schema-hourly-projection-accuracy.sql). This is deliberately the standalone
// per-hour ratio, not the cumulative-so-far pacing signals.js's LiveOps tab already shows — the
// point here is finding whether QSRSoft/LifeLenz's hourly projection curve itself is systematically
// off at a given hour, which the cumulative framing smooths away (measured live 2026-08-09; see
// memory/plan-data-integrity-sweep.md — cumulative was confirmed noisier-when-thin but NOT the
// right lens for spotting a projection-source bias, standalone is).
//
// Percentile-based stats — same method as scripts/measure-denominator-floors.mjs's bucketStats,
// kept in sync by hand (that script measures ad hoc from live Supabase; this is the same math
// wired into the app so the report doesn't need a service-role key to view).

const pct = (sorted, p) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

export function distStats(values) {
  const s = (values || []).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  const p25 = pct(s, 0.25), p75 = pct(s, 0.75);
  return { n: s.length, p10: pct(s, 0.10), p25, median: pct(s, 0.5), p75, p90: pct(s, 0.90), iqr: p75 - p25 };
}

// District-wide: sum every store's actual/proj together for each (date, hour_slot) FIRST, then take
// one ratio per date — matches how a district total would actually be read, not an average-of-ratios.
export function districtHourlyRatios(rows, { metric = 'sales' } = {}) {
  const actualKey = metric === 'gc' ? 'actual_gc' : 'actual_sales';
  const projKey = metric === 'gc' ? 'proj_gc' : 'proj_sales';
  const byDateHour = {};
  for (const r of rows || []) {
    const k = r.dt + '|' + r.hour_slot;
    const b = byDateHour[k] || (byDateHour[k] = { hourSlot: String(r.hour_slot), actual: 0, proj: 0 });
    b.actual += r[actualKey] || 0; b.proj += r[projKey] || 0;
  }
  return Object.values(byDateHour).filter(b => b.proj > 0)
    .map(b => ({ hourSlot: b.hourSlot, ratio: b.actual / b.proj * 100 }));
}

// Per-store: each row's own hour, no cross-store summing — one sample per (store, date, hour).
export function perStoreHourlyRatios(rows, { metric = 'sales' } = {}) {
  const actualKey = metric === 'gc' ? 'actual_gc' : 'actual_sales';
  const projKey = metric === 'gc' ? 'proj_gc' : 'proj_sales';
  return (rows || [])
    .filter(r => (r[projKey] || 0) > 0)
    .map(r => ({ hourSlot: String(r.hour_slot), loc: String(r.loc), ratio: (r[actualKey] || 0) / r[projKey] * 100 }));
}

const HOUR_FMT = x => x === 0 ? '12a' : x <= 11 ? `${x}a` : x === 12 ? '12p' : `${x - 12}p`;
export function hourLabel(hourSlot) {
  const end = parseInt(hourSlot, 10);
  if (isNaN(end)) return String(hourSlot);
  // hour_slot uses '24' for the midnight-ending block, not '0' — normalize mod 24 before
  // formatting so it reads '12a' like every other midnight boundary, not '12p'.
  return `${HOUR_FMT((end - 1 + 24) % 24)}-${HOUR_FMT(end % 24)}`;
}

// Groups ratio samples { hourSlot, ratio } by hour and computes distStats + bias (median - baseline)
// for each, sorted by hour-of-day (not by magnitude — this answers "by what hour," not "how much
// denominator"). `baseline` = 100 for a ratio-to-plan metric; bias > 0 = actual running ahead of
// projection at that hour, bias < 0 = projection over-stating that hour.
export function hourlyBiasTable(ratioSamples, { baseline = 100 } = {}) {
  const byHour = {};
  for (const r of (ratioSamples || [])) (byHour[r.hourSlot] = byHour[r.hourSlot] || []).push(r.ratio);
  const hours = Object.keys(byHour).sort((a, b) => (+a) - (+b));
  return hours.map(h => {
    const st = distStats(byHour[h]);
    if (!st) return { hourSlot: h, label: hourLabel(h), n: 0 };
    return { hourSlot: h, label: hourLabel(h), ...st, bias: st.median - baseline };
  });
}
