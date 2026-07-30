// @ts-nocheck
// ── EOM Item Journey ──────────────────────────────────────────────────────────
// Turns a single raw-item movement ledger (from mapRawItemHistory) into a
// count-cycle "journey": a chronological, lane-classified timeline of everything
// that happened to the item during the period, plus a plain-English read of WHERE
// the variance was realized and the most likely cause.
//
// DESIGN PRINCIPLE (owner directive, verbatim intent): the recipients of this data
// mostly don't know how to diagnose food cost — so the output must (a) be visual and
// self-explanatory and (b) NEVER blur fact and guess. Every signal we surface is
// tagged `kind: 'fact'` (read straight off the ledger, verifiable) or
// `kind: 'inference'` (an educated, data-backed guess the user should confirm).
// Trust is the product. We only assert what the ledger proves.

import { countWindowStart, lastDayOfPeriod } from './eom-inventory.js';

// QSRSoft raw_detail history `source` → a display lane.
export const SOURCE_LANE = {
  invoice: 'received',
  pos_open: 'used', pos_sales: 'used',
  waste: 'waste', comp_waste: 'waste',
  transfer: 'transfer',
  inventory: 'count',
};

export const LANE_META = {
  received: { label: 'Received', hint: 'Invoices / deliveries in', color: '#38bdf8', flow: +1 },
  used:     { label: 'Used', hint: 'Rung on POS (theoretical usage)', color: '#94a3b8', flow: -1 },
  waste:    { label: 'Waste', hint: 'Logged as waste / comped', color: '#f87171', flow: -1 },
  transfer: { label: 'Transfer', hint: 'Moved to / from another store', color: '#c084fc', flow: 0 },
  count:    { label: 'Count', hint: 'Physical inventory count', color: '#f5bc00', flow: 0 },
};

const laneOf = (source) => SOURCE_LANE[source] || 'used';
const ts = (dt) => { const t = Date.parse(dt || ''); return Number.isNaN(t) ? null : t; };
// Minutes-of-day from a "HH:MM" (or "H:MM AM/PM") time string, for within-day ordering.
const tmMin = (tm) => {
  const s = String(tm || '').trim(); if (!s) return 0;
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i); if (!m) return 0;
  let h = +m[1]; const mm = +m[2]; const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  return h * 60 + mm;
};

// Count-timing metric (owner req #45): from a store's raw-item count history, when did the store's
// EOM count BEGIN and END, and how long did it take. began = earliest count-event timestamp across
// all items, ended = latest, duration = the span. Also nDays (a multi-day count) + nCounts.
// `rawItems` = [mapRawItemHistory()]. Returns null when no timestamped count events exist.
export function computeCountTiming(rawItems = []) {
  const stamps = [];
  for (const it of (rawItems || [])) {
    for (const h of (it.history || [])) {
      if (!h.isCount) continue;
      const dayT = ts(h.dt); if (dayT == null) continue;
      const hasTime = !!String(h.tm || '').trim();
      stamps.push({ when: dayT + tmMin(h.tm) * 60000, dayT, dt: h.dt, tm: h.tm, hasTime });
    }
  }
  if (!stamps.length) return null;
  // Owner (2026-07-30): the duration is the LAST count DATE only — first recorded time → last
  // recorded time that day. Mid-cycle count days telescope out of the EOM result; the meaningful
  // count is the final one, and its start→end is the actual time spent counting.
  const lastDayT = Math.max(...stamps.map(s => s.dayT));
  const onLast = stamps.filter(s => s.dayT === lastDayT).sort((a, b) => a.when - b.when);
  const b = onLast[0], e = onLast[onLast.length - 1];
  const hasTimes = onLast.some(s => s.hasTime);
  const nDistinctTimes = new Set(onLast.filter(s => s.hasTime).map(s => s.when)).size;
  // Bulk-submit tell (owner integrity 2026-07-30): ≥2 counts recorded but a single distinct
  // timestamp = counted everything and submitted at once, not the lock-in-as-you-go travel path.
  // Skews variance for items in active use during the count. See project-inventory-integrity-detection.
  const bulkSubmit = hasTimes && onLast.length >= 2 && nDistinctTimes <= 1;
  return {
    countDate: b.dt,
    began: b.when, beganTm: b.tm,
    ended: e.when, endedTm: e.tm,
    durationMs: Math.max(0, e.when - b.when),
    nCountsLastDay: onLast.length,
    nCountsTotal: stamps.length,
    nDays: new Set(stamps.map(s => s.dt)).size,
    nDistinctTimes,
    bulkSubmit,
    hasTimes,   // false → date only (no time recorded, duration unknown)
  };
}

// "2h 15m 30s" / "45m 0s" from a millisecond duration (count-duration display; H:M:S per owner).
export function fmtDurationHMS(ms) {
  if (ms == null) return '—';
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

// Build the journey for one item. `detail` = a mapRawItemHistory() result.
export function buildItemJourney(detail = {}, { period, asOf } = {}) {
  const windowStart = period ? countWindowStart(period).getTime() : null;
  const lastDay = period ? lastDayOfPeriod(period).getTime() : null;

  const events = (detail.history || [])
    .map((h) => {
      const lane = laneOf(h.source);
      return {
        dt: h.dt, tm: h.tm, when: (ts(h.dt) != null ? ts(h.dt) + tmMin(h.tm) * 60000 : null), lane,
        source: h.source,
        qty: Number(h.qtyChange) || 0,
        // $ impact is only meaningful on count events (the realized variance $).
        dollars: h.isCount ? (Number(h.difference) || 0) : null,
        unitVar: h.isCount && h.variance != null ? Number(h.variance) : null,
        manager: h.manager || null,
        invoice: h.invoice || null,
        isCount: !!h.isCount,
      };
    })
    .sort((a, b) => (a.when ?? 0) - (b.when ?? 0));

  // Flow totals across the period (qty). Received in, used/waste out, net transfers.
  const totals = { received: 0, used: 0, waste: 0, transfer: 0, count: 0 };
  for (const e of events) totals[e.lane] += Math.abs(e.qty);
  const outflow = totals.used + totals.waste + Math.max(0, totals.transfer);
  const wasteShare = outflow > 0 ? totals.waste / outflow : 0;

  const counts = events.filter((e) => e.isCount);
  // The count that realized the most variance $ (the "break point").
  const breakPoint = counts.reduce(
    (best, c) => (best == null || Math.abs(c.dollars || 0) > Math.abs(best.dollars || 0) ? c : best),
    null,
  );

  const netCountDollars = counts.reduce((s, c) => s + (c.dollars || 0), 0);
  const netCountUnits = counts.reduce((s, c) => s + (c.unitVar || 0), 0);

  // ── Signals: facts first, then clearly-labeled inferences ───────────────────
  const signals = [];
  const money = (n) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

  // FACT: each material count variance, attributed to its date + counter.
  for (const c of counts) {
    if (Math.abs(c.dollars || 0) < 25) continue;
    const dir = c.dollars < 0 ? 'short' : 'over';
    signals.push({
      kind: 'fact',
      lane: 'count',
      at: c.dt,
      text: `${money(c.dollars)} ${dir} at the ${c.dt} count${c.manager ? ` (counted by ${c.manager})` : ''}.`,
      dollars: c.dollars,
    });
  }

  // INFERENCE: recoverability of the break-point variance (early vs late in window).
  if (breakPoint && Math.abs(breakPoint.dollars || 0) >= 50 && windowStart != null) {
    const late = breakPoint.when != null && breakPoint.when >= windowStart;
    signals.push({
      kind: 'inference',
      lane: 'count',
      at: breakPoint.dt,
      text: late
        ? `This ${money(breakPoint.dollars)} variance landed inside the count window — a careful physical recount now may still recover it. Recount ${detail.descr || detail.wrin} and resubmit.`
        : `This ${money(breakPoint.dollars)} variance was realized on ${breakPoint.dt}, before the count window — it is effectively locked for the period. A recount now won't recover it; instead verify the ${breakPoint.dt} count sheet for a keying error and carry the lesson forward.`,
      dollars: breakPoint.dollars,
    });
  }

  // INFERENCE: waste dominates the item's outflow.
  if (wasteShare >= 0.15 && totals.waste > 0) {
    signals.push({
      kind: 'inference',
      lane: 'waste',
      text: `Waste is ${Math.round(wasteShare * 100)}% of this item's outflow (${Math.round(totals.waste)} units wasted vs ${Math.round(totals.used)} used on POS). Usage here is being driven by waste, not sales — review waste discipline before blaming the count.`,
    });
  }

  // INFERENCE: net transfers out — confirm the other store logged the matching side.
  if (totals.transfer > 0) {
    const xfers = events.filter((e) => e.lane === 'transfer');
    const net = xfers.reduce((s, e) => s + e.qty, 0);
    if (Math.abs(net) >= 1) {
      signals.push({
        kind: 'inference',
        lane: 'transfer',
        text: `${Math.round(Math.abs(net))} units net ${net < 0 ? 'transferred out' : 'transferred in'} across ${xfers.length} transfer${xfers.length !== 1 ? 's' : ''}. Confirm the paired store logged the matching side — an unmatched transfer shows up as variance on one side only.`,
      });
    }
  }

  // Headline verdict — the one line a GM should read first.
  let verdict;
  if (!counts.length) {
    verdict = { tone: 'neutral', text: 'No physical count recorded for this item yet this period.' };
  } else if (Math.abs(netCountDollars) < 50) {
    verdict = { tone: 'good', text: `On track — net count variance is ${money(netCountDollars)} across ${counts.length} count${counts.length !== 1 ? 's' : ''}.` };
  } else {
    const dir = netCountDollars < 0 ? 'short (usage overstated)' : 'over (usage understated)';
    verdict = {
      tone: netCountDollars < 0 ? 'bad' : 'warn',
      text: `${money(netCountDollars)} ${dir} for the period${breakPoint ? `, most of it at the ${breakPoint.dt} count` : ''}.`,
    };
  }

  return {
    wrin: detail.wrin,
    descr: detail.descr,
    itemClass: detail.itemClass,
    uom: detail.uom,
    caseSz: detail.caseSz,           // units per case — lets the UI show qty as full cases (Notes 36)
    period,
    windowStart, lastDay,
    events,
    counts,
    totals,
    wasteShare,
    netCountDollars,
    netCountUnits,
    breakPoint,
    verdict,
    signals,
  };
}

// Convenience: build journeys for a whole store's raw-item set, worst-first.
export function buildStoreJourneys(rawItems = [], opts = {}) {
  return (rawItems || [])
    .map((d) => buildItemJourney(d, opts))
    .sort((a, b) => Math.abs(b.netCountDollars) - Math.abs(a.netCountDollars));
}
