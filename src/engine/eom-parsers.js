// @ts-nocheck
// ── EOM eBOS response parsers ─────────────────────────────────────────────────
// Pure mappers from the raw QSRSoft eBOS API responses (prod.ebos.qsrsoft.com)
// into the normalized shapes the diagnosis engine (eom-diagnosis.js) consumes.
// Keeping them here means the pull script (scripts/qsrsoft-variance-pull.mjs) and
// the client parse the SAME way — zero drift, the standing rule for cloud streams.
//
// Endpoints these map (all auth = eBOS x-auth-token):
//   /stat_variance/monthly/{date}      → mapVarianceRows   (Food/Paper carry $; Condiment unit-only)
//   /stat_variance/daily?start&end     → mapVarianceRows   (same shape, arbitrary window)
//   /stat_variance/yields?start&end    → mapYieldGroups    (acceptable yield band per concept group)
//   /raw_waste_promo?start&end         → mapWasteEvents    (per-entry, manager-attributed)
//   /raw_detail/{itemId}?start&end     → mapRawItemHistory (forensic count-timing register)
import { normClass } from './eom-inventory.js';

// ── Variance Stat rows ────────────────────────────────────────────────────────
// Food/Paper (ri:1) carry dollar_variance + yield + loose_unit_cost; Condiment
// (ri:0) rows are unit-only (no $). We keep BOTH but expose a single `dolDiff`
// (0 for condiments — they get the always-review unit-variance treatment).
export function mapVarianceRows(rows = []) {
  return (rows || []).map((r) => {
    const hasDollars = r.ri === 1 || r.dollar_variance != null;
    return {
      wrin: r.wrin,
      rawItemId: r.store_rawitem_id,
      descr: r.long_desc || r.short_desc || r.wrin,
      cls: normClass(r.class),
      classCode: r.class,
      // dolDiff is the top-5 / ±$50 sort key. Condiments have no $ → 0.
      dolDiff: hasDollars ? Number(r.dollar_variance) || 0 : 0,
      unitVar: Number(r.variance) || 0,
      expectedUsage: Number(r.expected_usage) || 0,
      actualUsage: Number(r.actual_usage) || 0,
      unitCost: Number(r.loose_unit_cost) || 0,
      pctOfSales: r.percentage != null ? Number(r.percentage) : null,
      yield: r.yield != null ? Number(r.yield) : null,
      midRangeYield: Number(r.mid_range_yield) || null,
      rawWaste: Number(r.raw_waste) || 0,
      compWaste: Number(r.comp_waste) || 0,
      hasDollars,
    };
  });
}

// ── Yields (acceptable yield band per concept group) ──────────────────────────
// Response: [{ groupName, description "Y Range: lo - hi", items: [wrinPrefix,…] }].
// We flatten to a prefix→band lookup so a variance row's actual `yield` can be
// checked against its group band → out-of-band = a procedural/calibration cause.
export function mapYieldGroups(groups = []) {
  const byPrefix = {};
  const list = [];
  for (const g of groups || []) {
    const band = parseYieldRange(g.description);
    const entry = { group: g.groupName, ...band, prefixes: g.items || [] };
    list.push(entry);
    for (const p of g.items || []) byPrefix[String(p)] = entry;
  }
  return { byPrefix, list };
}

// "Y Range: 35.00 - 37.00" | "Y Range: 53.1-58.7" → { lo, hi }
export function parseYieldRange(desc = '') {
  const m = String(desc).match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (!m) return { lo: null, hi: null };
  return { lo: Number(m[1]), hi: Number(m[2]) };
}

// wrin "00055-332" → prefix "00055"; look up its band; classify actual yield.
export function yieldBandFor(wrin, yieldLookup) {
  if (!wrin || !yieldLookup) return null;
  const prefix = String(wrin).split('-')[0];
  return yieldLookup.byPrefix?.[prefix] || null;
}
export function yieldStatus(actualYield, band) {
  if (band == null || actualYield == null || band.lo == null) return 'unknown';
  if (actualYield < band.lo) return 'below'; // over-portioning / cook loss
  if (actualYield > band.hi) return 'above'; // under-portioning / calibration high
  return 'in-band';
}

// ── Waste events (raw_waste_promo) ────────────────────────────────────────────
// Flat per-entry array; type "waste"=raw, "comp_waste"=completed. eID = manager.
export function mapWasteEvents(rows = []) {
  return (rows || []).map((r) => ({
    dt: r.store_busn_dt,
    tm: r.store_busn_tm,
    type: r.type === 'comp_waste' ? 'completed' : 'raw',
    amount: Number(r.amount) || 0,
    manager: r.eID || null,
    source: r.source || null, // BOS | MobileApp
    edited: r.edited === 1 || r.edited === true,
    reason: r.reason || null,
    createdSec: r.date_created_sec || r.date_created || null,
  }));
}

// Per-manager waste aggregation → feeds the manager-risk overlay + pencil-whip flags.
export function summarizeWasteByManager(events = []) {
  const by = {};
  let total = 0;
  for (const e of events) {
    total += e.amount;
    const m = (by[e.manager] = by[e.manager] || {
      manager: e.manager, total: 0, count: 0, raw: 0, completed: 0, edited: 0,
    });
    m.total += e.amount; m.count += 1; m[e.type] += e.amount;
    if (e.edited) m.edited += 1;
  }
  const list = Object.values(by).map((m) => ({ ...m, share: total ? m.total / total : 0 }));
  list.sort((a, b) => b.total - a.total);
  return { total, byManager: list };
}

// ── Transfers (transfers) ─────────────────────────────────────────────────────
// One row per line item; rows of the same transfer share `id` + `header_total_amt`.
// Out = product left this store; In = arrived. trans_nsn = counterparty store.
export function mapTransferLines(rows = []) {
  return (rows || []).map((r) => ({
    id: r.id,
    dir: r.type, // "In" | "Out"
    counterpartyNsn: r.trans_nsn != null ? String(r.trans_nsn) : null,
    dt: r.store_busn_dt,
    status: r.status, // approved | rejected
    lineAmt: Number(r.total_amt) || 0,
    transferTotal: Number(r.header_total_amt) || 0,
    manager: r.eID || null,
    autoPost: r.auto_post === 1 || r.auto_post === true,
    wrin: r.wrin,
    rawItemId: r.store_rawitem_id,
    descr: r.long_desc || r.wrin,
    cls: normClass(r.invty_class_cd),
    classCode: r.invty_class_cd,
    units: Number(r.units_count) || 0,
  }));
}

// Unmatched-side detection (integrity #47): a real inter-store transfer shows up on BOTH stores —
// an Out at the sender and a matching In at the receiver, same amount + date. A transfer whose
// counterparty is one of OUR stores but has no mirror record is a phantom-transfer risk (a paper
// move with no physical product, or a pair booked into different periods on each side). Only flagged
// when the counterparty is in the loaded store set — an outside-org store's side we simply never see.
// Returns a Set of `${normLoc}|${transferId}` keys (loc-scoped so ids can't collide across stores).
export function flagUnmatchedTransfers(lines = [], ourLocs = []) {
  const norm = s => String(s || '').replace(/^0+/, '') || String(s || '');
  const dayDiff = (a, b) => { const ta = Date.parse(a), tb = Date.parse(b); return (Number.isNaN(ta) || Number.isNaN(tb)) ? 999 : Math.abs(ta - tb) / 86400000; };
  const ours = new Set((ourLocs || []).map(norm));
  // Collapse to one header per (loc, transferId).
  const headers = new Map();
  for (const l of (lines || [])) {
    const id = l.transferId ?? l.id; if (id == null) continue;
    const key = norm(l.loc) + '|' + id;
    if (!headers.has(key)) headers.set(key, {
      id, key, loc: norm(l.loc), dir: l.dir, cp: norm(l.counterpartyNsn),
      total: Number(l.transferTotal) || 0, dt: String(l.dt || '').slice(0, 10),
    });
  }
  const hs = [...headers.values()];
  const unmatched = new Set();
  for (const h of hs) {
    if (!h.cp || !ours.has(h.cp)) continue;   // counterparty outside our org → can't verify, skip
    const mirror = hs.find(o =>
      o.loc === h.cp && o.cp === h.loc && o.dir !== h.dir &&
      Math.abs((o.total || 0) - (h.total || 0)) <= 1 && dayDiff(o.dt, h.dt) <= 1);
    if (!mirror) unmatched.add(h.key);
  }
  return unmatched;
}

// Net In/Out $ by class + a list of transfers to eyeball (large / not-approved).
export function summarizeTransfers(lines = [], { largeAmt = 100 } = {}) {
  let inTotal = 0, outTotal = 0;
  const byClass = {};
  const byId = {};
  for (const l of lines) {
    const id = l.id ?? l.transferId; // tolerate DB-loaded rows (transferId) + freshly-mapped (id)
    const lineAmt = Number(l.lineAmt) || 0;
    if (l.dir === 'Out') outTotal += lineAmt; else inTotal += lineAmt;
    const c = (byClass[l.cls] = byClass[l.cls] || { cls: l.cls, in: 0, out: 0 });
    if (l.dir === 'Out') c.out += lineAmt; else c.in += lineAmt;
    const t = (byId[id] = byId[id] || {
      id, dir: l.dir, dt: l.dt, status: l.status, manager: l.manager,
      counterpartyNsn: l.counterpartyNsn, total: Number(l.transferTotal) || 0, lines: 0,
    });
    t.lines += 1;
  }
  const transfers = Object.values(byId);
  const flagged = transfers.filter((t) => t.status !== 'approved' || t.total >= largeAmt);
  return { inTotal, outTotal, netAmt: inTotal - outTotal, byClass: Object.values(byClass), transfers, flagged };
}

// ── Raw-item forensic history (raw_detail/{itemId}) ───────────────────────────
// The per-transaction "life of the product". source=inventory rows are COUNTS
// carrying variance/difference/eID → the "when did the variance occur" answer.
export function mapRawItemHistory(detail = {}) {
  const history = (detail.history || []).map((h) => ({
    dt: h.store_busn_dt || h.store_busn_dt_raw,
    tm: h.store_busn_tm,
    displayDt: h.display_dt_tm,
    source: h.source, // invoice | pos_open | pos_sales | waste | comp_waste | transfer | inventory
    qtyChange: Number(h.qty_change) || 0,
    isCount: h.source === 'inventory',
    variance: h.variance != null ? Number(h.variance) : null,
    difference: h.difference != null ? Number(h.difference) : null, // $ impact of a count
    manager: h.eID || null,
    countSource: h.count_source || null,
    invoice: h.invoice_identifier || null,
  }));
  return {
    wrin: detail.full_wrin,
    descr: detail.long_desc,
    itemClass: detail.item_class,
    uom: detail.uom_desc,
    history,
    counts: history.filter((h) => h.isCount),
  };
}
