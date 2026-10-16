// @ts-nocheck
// ── Weather Impact report (Reports redesign Phase 5, 2026-10-16) ────────────────────────────
// ds.weatherRows (auto-pulled, Open-Meteo) has been loaded since the weather metric group
// shipped (v4.533) but was never shown as its own report — only reachable through Signal Lab's
// correlation Scanner. This answers the plain question a GM/DO actually has: "does rain or heat
// historically move THIS store's sales/traffic, and by how much" — so a forecasted rain day or
// heat wave can be prepped for with this store's own measured sensitivity, not a guess.
//
// Deliberately a simple historical SPLIT (rainy days vs dry days; the hotter half of loaded
// days vs the cooler half), not a matched-day design like promo-roi.js's calendar-tag
// comparison — weather has no equivalent exogenous "coverage window" concept, and a same-store
// split across enough days is still a reasonable directional read. Framed as association, same
// honesty standard promo-roi.js holds itself to.
import { metricRowsForRange } from './signal-registry.js';
import { STORE_NAMES } from '../constants.js';

const MIN_DAYS_PER_GROUP = 3; // below this, a group average is too noisy to report

function dayKey(d) {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return null;
}

function toDateMap(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = dayKey(r.date);
    if (k != null && r.value != null) m.set(k, r.value);
  }
  return m;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function pctDelta(a, b) { return (a != null && b != null && b !== 0) ? ((a - b) / Math.abs(b)) * 100 : null; }

/**
 * One row per store: rainy-vs-dry and hotter-half-vs-cooler-half splits on sales and guest
 * count, over [range.s, range.e]. A group under MIN_DAYS_PER_GROUP days resolves its averages
 * to null rather than reporting a noisy one- or two-day "average".
 */
export function buildWeatherImpactReport(ds, { locs, range } = {}) {
  if (!range?.s || !range?.e) return [];
  const targetLocs = (locs && locs.length) ? locs : (ds?.storeIds || []);
  return targetLocs.map(loc => {
    const salesByDay = toDateMap(metricRowsForRange('sales', ds, { loc, start: range.s, end: range.e }));
    const gcByDay = toDateMap(metricRowsForRange('gc', ds, { loc, start: range.s, end: range.e }));
    const rainByDay = toDateMap(metricRowsForRange('wxRain', ds, { loc, start: range.s, end: range.e }));
    const tmaxByDay = toDateMap(metricRowsForRange('wxTmax', ds, { loc, start: range.s, end: range.e }));

    // Day universe = days with BOTH a sales figure and a weather figure — a day missing
    // either side can't be classified or compared.
    const tmaxVals = [...tmaxByDay.values()].filter(v => v != null);
    const tmaxMedian = tmaxVals.length ? [...tmaxVals].sort((a, b) => a - b)[Math.floor(tmaxVals.length / 2)] : null;

    const rainyDays = [], dryDays = [], hotDays = [], coolDays = [];
    for (const [dk, sales] of salesByDay) {
      const rain = rainByDay.get(dk);
      const tmax = tmaxByDay.get(dk);
      const gc = gcByDay.get(dk);
      if (rain != null) (rain > 0 ? rainyDays : dryDays).push({ sales, gc });
      if (tmax != null && tmaxMedian != null) (tmax >= tmaxMedian ? hotDays : coolDays).push({ sales, gc });
    }

    const grp = (arr) => arr.length >= MIN_DAYS_PER_GROUP
      ? { n: arr.length, sales: mean(arr.map(d => d.sales)), gc: mean(arr.map(d => d.gc).filter(v => v != null)) }
      : { n: arr.length, sales: null, gc: null };

    const rainy = grp(rainyDays), dry = grp(dryDays), hot = grp(hotDays), cool = grp(coolDays);

    return {
      loc, name: STORE_NAMES[loc] || loc,
      rainyDays: rainy.n, dryDays: dry.n,
      rainySalesAvg: rainy.sales, drySalesAvg: dry.sales, rainSalesDeltaPct: pctDelta(rainy.sales, dry.sales),
      rainyGCAvg: rainy.gc, dryGCAvg: dry.gc, rainGCDeltaPct: pctDelta(rainy.gc, dry.gc),
      hotDays: hot.n, coolDays: cool.n,
      hotSalesAvg: hot.sales, coolSalesAvg: cool.sales, heatSalesDeltaPct: pctDelta(hot.sales, cool.sales),
      hotGCAvg: hot.gc, coolGCAvg: cool.gc, heatGCDeltaPct: pctDelta(hot.gc, cool.gc),
    };
  });
}
