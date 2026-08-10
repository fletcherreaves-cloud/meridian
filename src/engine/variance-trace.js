// @ts-nocheck
// ── Inventory Variance Trace — "where did it happen" troubleshooting engine ──
// Notes 56 #1 (owner, 2026-08-06): plot every count touchpoint through the month
// against a trend line and visually narrow the window a variance occurred in.
//
// Grounding: qsr_fob is pulled several times a day and each row is a MONTH-TO-DATE
// CUMULATIVE snapshot (not a daily increment — see fobSnapshotByStore's doc). That
// means the FOB components (comp waste, raw waste, condiments, emp/mgr meals, stat
// variance, unexplained) already trace a real day-by-day curve with ZERO new data
// needed — differencing consecutive days' snapshots gives an actual "how much $
// variance showed up today" series. This is deliberately NOT a reconstructed
// theoretical-on-hand model from POS sales/waste rates — Meridian has no per-item
// theoretical-usage-per-unit-sold table to build that credibly, and a wrong
// "theoretical" curve would be worse than an honest one grounded in real snapshots.
// The FOB components ARE the reconciliation QSRSoft already computes (Begin +
// Purchases + Adjustments + Transfers − Promotions − End vs the physical count);
// this just exposes ITS trend day-by-day instead of only the MTD end-state number.
//
// Pure + unit-tested. Row shapes match loadQsrFob (src/lib/supabase.js) and
// analyzeCountCadence's sessions (src/engine/weekly-cadence.js).

const _dk = d => (typeof d === 'string') ? d.slice(0, 10)
  : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
// qsr_fob's own loc padding convention has drifted between loaders this session (some
// strip the zero-padded NSN on return, some don't) — compare unpadded on both sides so
// this engine works regardless of which convention the caller's fobRows happens to carry.
const _unpad = l => String(l == null ? '' : l).replace(/^0+(?=\d)/, '');

export const FOB_TRACE_COMPONENTS = ['compWaste', 'rawWaste', 'condiment', 'empMeal', 'statVar', 'unexplained'];
const _COMP_FIELD = {
  compWaste: 'compWasteAmt', rawWaste: 'rawWasteAmt', condiment: 'condimentsAmt',
  empMeal: 'empMgrMealsAmt', statVar: 'statVarianceAmt', unexplained: 'unexplainedAmt',
};

// One store's qsr_fob rows for a period → a sorted daily trace of cumulative MTD
// snapshots + the day-over-day delta (how much $ each component added THAT day).
// `fobRows` may span more than the period (harmless — extra rows outside it are only
// used to seed same-month lookback, never cross-month: MTD resets at month start, so
// day 1 of any period always deltas vs $0, not against the prior month's total).
export function fobDailyTrace(fobRows, { loc, period, since = null } = {}) {
  const rows = (fobRows || []).filter(r => _unpad(r.loc) === _unpad(loc));
  // One row per day — if a day pulled more than once (multiple intraday runs), keep the LAST
  // (freshest) one for that date.
  const byDay = {};
  for (const r of rows) { const k = _dk(r.date); if (k) byDay[k] = r; }
  const days = Object.keys(byDay).sort();
  // `since` (Notes 58 #2) narrows the domain to start at the last ACTUAL PHYSICAL COUNT
  // instead of the calendar-month boundary — the owner's "loopback needs to go back to
  // the last submitted count".
  //
  // CONSTRAINT, and it is a hard one: qsr_fob rows are MONTH-TO-DATE CUMULATIVE, so the
  // snapshot resets at month start and the delta logic below refuses to difference across
  // that boundary. A `since` earlier than the period start therefore cannot be honoured —
  // the curve would show the reset as a cliff. It is clamped to the period, and callers
  // can detect that from the returned trace's first date.
  const inPeriod = d => (!period || d.slice(0, 7) === period) && (!since || d >= since);

  let prevCum = null, prevDay = null;
  const out = [];
  for (const day of days) {
    const r = byDay[day];
    const sales = +r.prodSalesAmt || 0;
    const cum = {};
    for (const c of FOB_TRACE_COMPONENTS) cum[c] = +r[_COMP_FIELD[c]] || 0;
    cum.fob = FOB_TRACE_COMPONENTS.reduce((s, c) => s + cum[c], 0);
    cum.sales = sales;
    cum.fobPct = sales > 0 ? cum.fob / sales : null;

    if (!inPeriod(day)) { prevCum = cum; prevDay = day; continue; }   // lead-in row: seeds the delta only

    // A new calendar month resets the MTD snapshot to near-zero — don't diff across that
    // boundary (would read as a huge negative "delta" that's really just the reset).
    const sameMonth = prevDay && prevDay.slice(0, 7) === day.slice(0, 7);
    const delta = {};
    for (const c of [...FOB_TRACE_COMPONENTS, 'fob']) {
      delta[c] = (prevCum && sameMonth) ? cum[c] - prevCum[c] : cum[c];
    }
    out.push({ date: day, cumulative: cum, delta, daysSincePrev: prevDay ? _daysBetween(prevDay, day) : null });
    prevCum = cum; prevDay = day;
  }
  return out;
}

/**
 * The count day to anchor a variance trace on: the most recent real count that still
 * leaves a usable span of chart. Anchoring on a count taken yesterday would produce a
 * one-point chart, so this walks back until the window is at least `minSpanDays` wide.
 *
 * `sessions` is analyzeCountCadence's output ({ day, kind }); `eomDay` is the explicit
 * close-count day when one is known.
 */
export function lastCountAnchor(sessions = [], { asOf = null, eomDay = null, minSpanDays = 7 } = {}) {
  const days = [...new Set([...(sessions || []).map(s => s && s.day), eomDay].filter(Boolean))].sort();
  if (!days.length) return null;
  const end = asOf || days[days.length - 1];
  for (let i = days.length - 1; i >= 0; i--) {
    if (_daysBetween(days[i], end) >= minSpanDays) return days[i];
  }
  return days[0];
}

function _daysBetween(a, b) {
  const ta = new Date(a + 'T00:00:00').getTime(), tb = new Date(b + 'T00:00:00').getTime();
  return Math.round((tb - ta) / 86400000);
}

// Attach count-touchpoint context to a trace: which days had a real count (weekly-full,
// spot, or EOM), from analyzeCountCadence's `sessions` (weekly-cadence.js) + an optional
// explicit EOM lock/count day. Returns the trace with `touchpoint` set per matching day.
export function annotateTouchpoints(trace, { sessions = [], eomDay = null } = {}) {
  const byDay = {}; for (const s of sessions) byDay[s.day] = s.kind;   // 'weekly' | 'spot'
  return (trace || []).map(pt => ({
    ...pt,
    touchpoint: pt.date === eomDay ? 'eom' : (byDay[pt.date] || null),
  }));
}

// The single biggest day-over-day $ jump in `fob` (up OR down — a sudden IMPROVEMENT can be
// just as diagnostic as a worsening, e.g. a late count correction landing). This is the
// "look-back window" the count-cycle vision calls for: the day right before this one is
// where whatever happened, happened, bounded by the previous real count (touchpoint).
export function biggestJumpDay(trace) {
  if (!trace || !trace.length) return null;
  let best = null;
  for (const pt of trace) {
    if (pt.delta.fob == null) continue;
    if (!best || Math.abs(pt.delta.fob) > Math.abs(best.delta.fob)) best = pt;
  }
  if (!best) return null;
  // Bracket: the nearest PRIOR touchpoint (real count) before the jump day — the window to
  // focus on is (that count day, jump day].
  const idx = trace.findIndex(p => p.date === best.date);
  let windowStart = null;
  for (let i = idx - 1; i >= 0; i--) { if (trace[i].touchpoint) { windowStart = trace[i].date; break; } }
  return { date: best.date, delta: best.delta.fob, windowStart: windowStart || (trace[0] && trace[0].date) || null };
}
