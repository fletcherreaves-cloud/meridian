// @ts-nocheck
// ── Promo / Discount ROI — matched-day lift engine ────────────────────────────
// Answers "are our promos and discounts paying for themselves?" without a raw
// correlation (which conflates volume with lift and gets biased when promos are
// deployed on already-slow days). Method: a quasi-experimental MATCHED-DAY
// comparison per store — split each store's days into promo-heavy vs promo-light
// at that store's median intensity, compare WITHIN each day-of-week (controls for
// the weekly pattern), and measure the sales / guest lift against the margin given
// up. This is association-with-controls, not a randomized trial — labeled as a
// directional readout, not proof.

import { mean, median } from '../utils/stats.js';

const _normLoc = l => String(parseInt(String(l ?? '').replace(/\D/g, ''), 10) || '');
const _dateKey = d => { const t = d instanceof Date ? d : new Date(String(d)); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); };
const _dow = d => { const t = d instanceof Date ? d : new Date(String(d)); return t.getDay(); };
const _num = v => (typeof v === 'number' && isFinite(v)) ? v : null;

// Merge the daily sources into one record per (loc, date):
//   sales/gc  ← glimpse → salesLedger → labor → qsrActSummary (first with data wins)
//   promo     ← glimpse (promoAmt/promoPct) → ctrl
//   discount  ← ctrl (discAmt/discPct)
export function buildDailyRecords(ds) {
  if (!ds) return [];
  const map = {};
  const touch = (loc, date) => {
    const L = _normLoc(loc); if (!L || !date) return null;
    const k = L + '|' + _dateKey(date);
    if (!map[k]) map[k] = { loc: L, date: (date instanceof Date ? date : new Date(String(date))), dow: _dow(date), sales: null, gc: null, promoPct: null, promoAmt: null, discPct: null, discAmt: null };
    return map[k];
  };
  const setSalesGc = (rows, salesField, gcField) => {
    for (const r of rows || []) {
      const rec = touch(r.loc, r.date); if (!rec) continue;
      if (rec.sales == null) { const s = _num(r[salesField]); if (s != null && s > 0) rec.sales = s; }
      if (rec.gc == null) { const g = _num(r[gcField]); if (g != null && g > 0) rec.gc = g; }
    }
  };
  // Sales/GC base — priority order (glimpse first as it also carries promo).
  setSalesGc(ds.glimpseRows, 'allNetSales', 'gc');
  setSalesGc(ds.salesLedgerRows, 'allNetSales', 'gc');
  setSalesGc(ds.laborRows, 'sales', 'gc');
  setSalesGc(ds.qsrActSummaryRows, 'sales', 'gc');
  // Promo — glimpse preferred, else controls.
  for (const r of ds.glimpseRows || []) { const rec = touch(r.loc, r.date); if (!rec) continue; if (rec.promoAmt == null && _num(r.promoAmt) != null) rec.promoAmt = _num(r.promoAmt); if (rec.promoPct == null && _num(r.promoPct) != null) rec.promoPct = _num(r.promoPct); }
  for (const r of ds.ctrlRows || []) {
    const rec = touch(r.loc, r.date); if (!rec) continue;
    if (rec.promoAmt == null && _num(r.promoAmt) != null) rec.promoAmt = _num(r.promoAmt);
    if (rec.promoPct == null && _num(r.promoPct) != null) rec.promoPct = _num(r.promoPct);
    if (rec.discAmt == null && _num(r.discAmt) != null) rec.discAmt = _num(r.discAmt);
    if (rec.discPct == null && _num(r.discPct) != null) rec.discPct = _num(r.discPct);
  }
  return Object.values(map);
}

// Per-store matched-day lift for one lever (promo or discount).
// opts: { intensityField, spendField, marginRate=0.35, minDays=24, minPerCell=2 }
// Returns { byStore:[…], district:{…}, marginRate }.
export function matchedLift(records, opts = {}) {
  const intensityField = opts.intensityField || 'promoPct';
  const spendField = opts.spendField || 'promoAmt';
  const marginRate = opts.marginRate != null ? opts.marginRate : 0.35;
  const minDays = opts.minDays != null ? opts.minDays : 24;
  const minPerCell = opts.minPerCell != null ? opts.minPerCell : 2;

  // group records by loc
  const byLoc = {};
  for (const r of records) {
    if (!(r.sales > 0)) continue;
    if (_num(r[intensityField]) == null) continue;
    (byLoc[r.loc] || (byLoc[r.loc] = [])).push(r);
  }

  const byStore = [];
  for (const loc of Object.keys(byLoc)) {
    const rows = byLoc[loc];
    if (rows.length < minDays) continue;
    const med = median(rows.map(r => r[intensityField]));
    if (med == null) continue;

    // day-of-week cells: heavy (> median) vs light (≤ median). Strict-above keeps
    // the mass of low-intensity days on the light side (and cleanly separates
    // promo days from no-promo days when the median sits at the low end).
    const cells = {};
    for (const r of rows) {
      const c = cells[r.dow] || (cells[r.dow] = { heavy: [], light: [] });
      (r[intensityField] > med ? c.heavy : c.light).push(r);
    }
    let wSum = 0, exSales = 0, exGc = 0, exSpend = 0, baseSales = 0, nCells = 0;
    for (const dow of Object.keys(cells)) {
      const { heavy, light } = cells[dow];
      if (heavy.length < minPerCell || light.length < minPerCell) continue;
      const hS = mean(heavy.map(r => r.sales)), lS = mean(light.map(r => r.sales));
      const hG = mean(heavy.map(r => r.gc).filter(x => x != null)), lG = mean(light.map(r => r.gc).filter(x => x != null));
      const hSp = mean(heavy.map(r => _num(r[spendField]) || 0)), lSp = mean(light.map(r => _num(r[spendField]) || 0));
      const w = heavy.length + light.length;
      wSum += w; nCells++;
      exSales += (hS - lS) * w;
      exGc += ((hG != null && lG != null) ? (hG - lG) : 0) * w;
      exSpend += (hSp - lSp) * w;
      baseSales += lS * w;
    }
    if (!wSum || nCells < 1) continue;
    const extraSalesPerDay = exSales / wSum;
    const extraGcPerDay = exGc / wSum;
    const extraSpendPerDay = exSpend / wSum;
    const baseSalesPerDay = baseSales / wSum;
    const liftSalesPct = baseSalesPerDay > 0 ? extraSalesPerDay / baseSalesPerDay * 100 : null;
    // Directional ROI: incremental gross profit on the sales lift minus the extra
    // give-away. marginRate = incremental contribution margin (config, default 35%).
    const grossProfitDelta = extraSalesPerDay * marginRate - extraSpendPerDay;
    const verdict = extraSpendPerDay <= 0 ? 'n/a'
      : grossProfitDelta > Math.max(5, 0.02 * Math.abs(extraSpendPerDay)) ? 'pays'
      : grossProfitDelta < -Math.max(5, 0.02 * Math.abs(extraSpendPerDay)) ? 'costs'
      : 'neutral';
    byStore.push({
      loc, nDays: rows.length, nCells,
      medianIntensity: med,
      extraSalesPerDay, extraGcPerDay, extraSpendPerDay,
      liftSalesPct, grossProfitDelta, verdict,
    });
  }

  // district: weight each store by its day count
  let dW = 0, dSales = 0, dGc = 0, dSpend = 0, dGp = 0;
  for (const s of byStore) { const w = s.nDays; dW += w; dSales += s.extraSalesPerDay * w; dGc += s.extraGcPerDay * w; dSpend += s.extraSpendPerDay * w; dGp += s.grossProfitDelta * w; }
  const district = dW ? {
    nStores: byStore.length,
    extraSalesPerDay: dSales / dW, extraGcPerDay: dGc / dW,
    extraSpendPerDay: dSpend / dW, grossProfitDelta: dGp / dW,
    verdict: (dSpend / dW) <= 0 ? 'n/a' : (dGp / dW) > 0 ? 'pays' : (dGp / dW) < 0 ? 'costs' : 'neutral',
  } : null;

  byStore.sort((a, b) => (a.grossProfitDelta) - (b.grossProfitDelta)); // worst ROI first (coach these)
  return { byStore, district, marginRate };
}

// Convenience: both levers at once.
export function computePromoDiscountRoi(ds, opts = {}) {
  const marginRate = opts.marginRate != null ? opts.marginRate : 0.35;
  const records = buildDailyRecords(ds);
  return {
    nRecords: records.length,
    marginRate,
    promo: matchedLift(records, { intensityField: 'promoPct', spendField: 'promoAmt', marginRate }),
    discount: matchedLift(records, { intensityField: 'discPct', spendField: 'discAmt', marginRate }),
  };
}
