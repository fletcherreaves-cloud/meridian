// @ts-nocheck
// ── Promo / Discount ROI — matched-day lift engine ────────────────────────────
// Answers "are our promos and discounts paying for themselves?" without a raw
// correlation (which conflates volume with lift and gets biased when promos are
// deployed on already-slow days). Method: a quasi-experimental MATCHED-DAY
// comparison per store — split each store's days into promo-tagged vs promo-
// untagged, compare WITHIN each day-of-week (controls for the weekly pattern),
// and measure the sales / guest lift against the margin given up. This is
// association-with-controls, not a randomized trial — labeled as a directional
// readout, not proof.
//
// ⚠️ dispatch-113.md / memory/finding-promo-roi-denominator-bias-2026-08-23.md —
// READ BOTH IN FULL before touching the split logic below. Two prior attempts
// (percentage-of-sales split, then absolute-dollar split) both split on a
// variable that is itself a function of that day's SALES OUTCOME (give-away
// dollars scale with traffic), so both were selection-on-the-outcome and both
// were measured biased -- in OPPOSITE directions -- even at a true effect of
// exactly zero (percentage split: -0.1%; dollar split: +16.5%, 27/27 "pays").
// The fix here is NOT a third intensity split. It is a different SPLIT
// VARIABLE entirely: whether a real, EXOGENOUS org_events 'promo' tag covers
// that (loc, date) -- a national marketing-calendar window McDonald's corporate
// sets months ahead, verified (2026-08-25, org_events query against production)
// to be independent of any single store's day-to-day sales: all 756 promo-type
// rows in production carry entered_by:'lto-import', method:'bulk upload', and
// match data/marketing-calendars/2025-opnad-retail-windows.json's program names
// and dates exactly, applied identically across all 27 stores. That is a
// calendar fact, not a same-day-derived number -- it cannot inherit the "spend
// scales with traffic" bias no matter how strongly real give-away dollars do,
// because it never reads give-away dollars or sales at all.
//
// No equivalent exogenous signal exists for the DISCOUNT lever (register-level
// comps/overrides are reactive, not corporate-scheduled -- org_events has no
// 'discount' event type). Per the finding's own explicit fallback, that lever
// now honestly reports "cannot determine" (empty byStore, a stated reason)
// rather than reusing an endogenous split a third time.

import { mean } from '../utils/stats.js';

const _normLoc = l => String(parseInt(String(l ?? '').replace(/\D/g, ''), 10) || '');
const _dateKey = d => { const t = d instanceof Date ? d : new Date(String(d)); return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); };
// Zero-padded ISO 'YYYY-MM-DD' -- MUST match org_events' date_start/date_end format exactly
// (unlike _dateKey above, which is a loose internal merge key and is NOT zero-padded).
const _isoKey = d => { const t = d instanceof Date ? d : new Date(String(d)); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const _dow = d => { const t = d instanceof Date ? d : new Date(String(d)); return t.getDay(); };
const _num = v => (typeof v === 'number' && isFinite(v)) ? v : null;

// Merge the daily sources into one record per (loc, date):
//   sales/gc  ← glimpse → salesLedger → labor → qsrActSummary (first with data wins)
//   promo     ← glimpse (promoAmt/promoPct) → ctrl
//   discount  ← opsCashRows (auto-pulled qsr_cash_sheet, discAmt/discPct) → ctrl (manual, fallback)
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
  // Discount — opsCashRows (auto-pulled qsr_cash_sheet, see metric-source.js's discAmt/discPct
  // chains) preferred, else controls. Mirrors the promo leg's glimpse-then-ctrl pattern: without
  // this loop, discAmt/discPct only ever came from ctrlRows (manual upload), so a store/date with
  // no manual Controls upload -- the expected steady state per CLAUDE.md's auto-first rule --
  // scored an empty discount lever even though the auto-pulled data existed. dispatch-111.md.
  for (const r of ds.opsCashRows || []) {
    const rec = touch(r.loc, r.date); if (!rec) continue;
    if (rec.discAmt == null && _num(r.discAmt) != null) rec.discAmt = _num(r.discAmt);
    if (rec.discPct == null && _num(r.discPct) != null) rec.discPct = _num(r.discPct);
  }
  for (const r of ds.ctrlRows || []) {
    const rec = touch(r.loc, r.date); if (!rec) continue;
    if (rec.promoAmt == null && _num(r.promoAmt) != null) rec.promoAmt = _num(r.promoAmt);
    if (rec.promoPct == null && _num(r.promoPct) != null) rec.promoPct = _num(r.promoPct);
    if (rec.discAmt == null && _num(r.discAmt) != null) rec.discAmt = _num(r.discAmt);
    if (rec.discPct == null && _num(r.discPct) != null) rec.discPct = _num(r.discPct);
  }
  return Object.values(map);
}

// ── Exogenous promo-tag coverage ────────────────────────────────────────────
// Build, from the client's per-day event map (mf_events shape: { loc: { 'YYYY-MM-DD': entry } },
// the same shape orgEventsToDayMap() in events-import.js produces and App.js hydrates from
// org_events on load), the set of dates each store carries a REAL exogenous promo-calendar tag.
//
// Restricted to ORG-SOURCED entries only (`ev.orgSourced`). Verified 2026-08-25 against
// production: every org_events row with event_type='promo' today (756 rows, all 27 stores) was
// written by a single bulk import (entered_by:'lto-import', method:'bulk upload') of the national
// OPNAD marketing calendar (data/marketing-calendars/2025-opnad-retail-windows.json) -- dates
// McDonald's corporate sets months ahead, identical across every store, verifiably NOT derived
// from any store's own sales. A hand-typed same-day tag via Calendar Manager is NOT restricted
// to org-sourced entries by that flag alone; excluding non-org-sourced entries here is
// deliberate -- a GM could in principle tag "promo" retroactively after noticing a good day,
// which would reopen exactly the endogeneity this fix closes. If the owner starts hand-tagging
// promo days as a matter of course, this filter should be revisited against fresh provenance
// evidence, not loosened on assumption.
//
// Returns { tagged: {loc: Set<'YYYY-MM-DD'>}, covStart: {loc: 'YYYY-MM-DD'}, covEnd: {loc: ...} }.
// covStart/covEnd is each store's own KNOWN calendar window (earliest/latest tagged date) -- a
// date outside it is UNKNOWN, not "no promo running", and matchedLift below must never treat an
// unknown day as a light/control day (see the coverage-window note there).
export function promoTagCoverage(userEvents) {
  const tagged = {}, covStart = {}, covEnd = {};
  for (const [loc, dayMap] of Object.entries(userEvents || {})) {
    for (const [dk, ev] of Object.entries(dayMap || {})) {
      if (!ev || !ev.orgSourced) continue;
      const isPromo = ev.type === 'promo' || (Array.isArray(ev.tags) && ev.tags.some(t => t && t.type === 'promo'));
      if (!isPromo) continue;
      (tagged[loc] || (tagged[loc] = new Set())).add(dk);
      if (!covStart[loc] || dk < covStart[loc]) covStart[loc] = dk;
      if (!covEnd[loc] || dk > covEnd[loc]) covEnd[loc] = dk;
    }
  }
  return { tagged, covStart, covEnd };
}

// Per-store matched-day lift for one lever, split by EXOGENOUS calendar-tag membership
// (dispatch-113.md) rather than same-day intensity. opts: { spendField, marginRate=0.35,
// minDays=24, minPerCell=2 }. tagCoverage: promoTagCoverage()'s return shape (or the "always
// empty" shape below for a lever with no exogenous signal, e.g. discount).
// Returns { byStore:[…], district:{…}, marginRate, nCandidates, reason? }.
export function matchedLift(records, tagCoverage, opts = {}) {
  const spendField = opts.spendField || 'promoAmt';
  const marginRate = opts.marginRate != null ? opts.marginRate : 0.35;
  const minDays = opts.minDays != null ? opts.minDays : 24;
  const minPerCell = opts.minPerCell != null ? opts.minPerCell : 2;
  const { tagged = {}, covStart = {}, covEnd = {} } = tagCoverage || {};

  // Group by loc, restricted to that loc's OWN known calendar-coverage window. A record whose
  // date falls outside [covStart[loc], covEnd[loc]] carries no calendar information at all --
  // excluded entirely rather than defaulted to "light" (see promoTagCoverage's doc comment).
  // A loc with no coverage at all (covStart[loc] undefined -- no exogenous tag ever seen for it,
  // e.g. every store for the discount lever today) contributes nothing and is not a candidate.
  const byLoc = {};
  for (const r of records) {
    if (!(r.sales > 0)) continue;
    const lo = covStart[r.loc], hi = covEnd[r.loc];
    if (!lo || !hi) continue;
    const dk = _isoKey(r.date);
    if (dk < lo || dk > hi) continue;
    (byLoc[r.loc] || (byLoc[r.loc] = [])).push({ r, dk });
  }
  const nCandidates = Object.keys(byLoc).length;
  if (!nCandidates) {
    return { byStore: [], district: null, marginRate, nCandidates: 0, reason: 'no_exogenous_tag_data' };
  }

  const byStore = [];
  for (const loc of Object.keys(byLoc)) {
    const rows = byLoc[loc];
    if (rows.length < minDays) continue;
    const tagSet = tagged[loc] || new Set();

    // day-of-week cells: tagged (real calendar promo window covers this date) vs untagged
    // (inside the SAME known calendar window, just not covered by any tag).
    const cells = {};
    for (const { r, dk } of rows) {
      const c = cells[r.dow] || (cells[r.dow] = { heavy: [], light: [] });
      (tagSet.has(dk) ? c.heavy : c.light).push(r);
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
  return { byStore, district, marginRate, nCandidates, coverage: { covStart, covEnd } };
}

// An always-empty tag-coverage map, for a lever with no exogenous signal at all today (discount:
// org_events has no 'discount' event type -- register-level comps/overrides are reactive, not
// corporate-scheduled, so no calendar fact could ever tell us "a discount was going to happen
// here" before the day did). Passed explicitly rather than reusing the promo map, so
// matchedLift's "no candidates" result is honest ("no signal exists"), not an accident of one
// lever borrowing another's calendar.
const NO_EXOGENOUS_SIGNAL = { tagged: {}, covStart: {}, covEnd: {} };

// Convenience: both levers at once. userEvents is the client's mf_events per-day map (App.js
// state, already hydrated from org_events -- see promoTagCoverage's doc comment); pass null/
// undefined when unavailable (e.g. a caller with no calendar loaded) and the promo lever
// degrades to the same honest "cannot determine" result as discount, rather than throwing.
export function computePromoDiscountRoi(ds, userEvents, opts = {}) {
  const marginRate = opts.marginRate != null ? opts.marginRate : 0.35;
  const records = buildDailyRecords(ds);
  const promoCov = promoTagCoverage(userEvents);
  return {
    nRecords: records.length,
    marginRate,
    // dispatch-113.md -- split by whether a REAL, exogenous org_events 'promo' tag (the national
    // marketing calendar, set months ahead by McDonald's corporate) covers that date, not by
    // same-day promo-dollar intensity. See this file's top-of-file comment for why every
    // intensity-based split (percentage OR dollar) was structurally endogenous.
    promo: matchedLift(records, promoCov, { spendField: 'promoAmt', marginRate }),
    // No exogenous discount-timing signal exists in this data model -- see NO_EXOGENOUS_SIGNAL.
    // Distinct reason from a promo lever that simply has no coverage for the LOADED data (which
    // could be fixed by tagging/loading a broader window): here nothing could ever fix it short
    // of a genuinely new, verified-exogenous discount-timing source, so the UI copy must say so.
    discount: { ...matchedLift(records, NO_EXOGENOUS_SIGNAL, { spendField: 'discAmt', marginRate }), reason: 'no_signal_exists' },
  };
}
