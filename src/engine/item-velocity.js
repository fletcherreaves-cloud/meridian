// @ts-nocheck
// ── Item Velocity report (Reports redesign Phase 5, 2026-10-16) ─────────────────────────────
// ds.pmixRows carries 699+ distinct items (measured 2026-08-27, signal-registry.js's own
// header) but the only way to see an item's sales today is Signal Lab's dynamic
// `pmixItem:<code>` resolver — one item, one correlation at a time, never a "what's selling /
// what's dying" rollup. This reads ds.pmixRows directly (not through the per-item metric
// resolver, which would mean one findMetric()/extractMetricValues() call per item — this report
// wants every item in one pass over the loaded rows, the same single-sweep shape
// pmixItemsIndex() already uses for the Signal Lab item picker).
//
// Scope is the selected stores AGGREGATED together into one district (or single-store) item
// list, not a per-store breakdown -- "what's selling across the stores I picked," matching how
// every other across-store report in this app rolls up by default.
import { STORE_NAMES } from '../constants.js';

export const DEFAULT_TOP_N = 50;

function dayKey(d) {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  if (d instanceof Date) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return null;
}

// qsr_product_mix.loc is zero-padded ("0013113"); locs/storeIds elsewhere are not — same join
// trap price-events.js's own _unpadLoc normalizes for the identical reason.
function unpadLoc(l) { return String(parseInt(l, 10) || l); }

/**
 * Every item sold across the selected stores/range, aggregated into one list: total units,
 * total $ (soldQty × price, summed across every row — a real multi-price-tier day sums
 * correctly rather than picking one tier), and a trend split (first half of the range vs
 * second half, each normalized to a per-day RATE so an uneven day split doesn't bias the
 * comparison). Sorted by total units descending, capped at `topN` — same bounded-top-N shape
 * signal-registry.js's own PMIX_SCANNER_TOP_N already established for exactly this item-count
 * problem, not a new design.
 */
export function buildItemVelocityReport(ds, { locs, range, topN = DEFAULT_TOP_N } = {}) {
  if (!range?.s || !range?.e) return [];
  const wantLocs = (locs && locs.length) ? new Set(locs.map(unpadLoc)) : null;

  const rows = (ds?.pmixRows || []).filter(r => {
    if (!r || r.item == null || r.date == null) return false;
    const dk = dayKey(r.date);
    if (dk == null || dk < range.s || dk > range.e) return false;
    if (wantLocs && !wantLocs.has(unpadLoc(r.loc))) return false;
    return true;
  });
  if (!rows.length) return [];

  const midKey = dayKey(new Date((new Date(range.s).getTime() + new Date(range.e).getTime()) / 2));

  const byItem = new Map();
  for (const r of rows) {
    const code = String(r.item);
    let e = byItem.get(code);
    if (!e) {
      e = { item: code, label: r.desc || ('Item #' + code), totalSoldQty: 0, totalRevenue: 0,
            firstHalfQty: 0, secondHalfQty: 0, firstHalfDays: new Set(), secondHalfDays: new Set() };
      byItem.set(code, e);
    }
    const qty = (r.soldQty != null && !isNaN(r.soldQty)) ? r.soldQty : 0;
    const price = (r.price != null && !isNaN(r.price)) ? r.price : 0;
    e.totalSoldQty += qty;
    e.totalRevenue += qty * price;
    const dk = dayKey(r.date);
    if (dk <= midKey) { e.firstHalfQty += qty; e.firstHalfDays.add(dk); } else { e.secondHalfQty += qty; e.secondHalfDays.add(dk); }
    if (r.desc) e.label = r.desc;
  }

  const out = [...byItem.values()].map(e => {
    const firstRate = e.firstHalfDays.size ? e.firstHalfQty / e.firstHalfDays.size : null;
    const secondRate = e.secondHalfDays.size ? e.secondHalfQty / e.secondHalfDays.size : null;
    const trendPct = (firstRate != null && secondRate != null && firstRate !== 0)
      ? ((secondRate - firstRate) / firstRate) * 100 : null;
    return { item: e.item, label: e.label, totalSoldQty: e.totalSoldQty, totalRevenue: e.totalRevenue, trendPct };
  });

  out.sort((a, b) => b.totalSoldQty - a.totalSoldQty);
  return out.slice(0, topN);
}
