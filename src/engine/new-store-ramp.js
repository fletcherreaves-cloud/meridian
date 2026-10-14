// @ts-nocheck
// New-store ramp forecasting via comparable-store blending (dispatch 2026-10-14, Lindsay
// 18213 -> 44689 relocation).
//
// Why this exists: forecast.js's generic new-store fallback (fetchRampSales) has no history to
// widen into for a genuinely brand-new store, so it falls back to "district DOW average x 0.65"
// -- a reasonable default for an actual new-MARKET opening, but wrong for Lindsay: 44689 isn't
// entering a new trade area, it's replacing 18213 in the SAME town, with a proven sales level
// already on record. The owner's own read: expect volume similar to Tishomingo (43380, also a
// freestanding small-town opening) adjusted for inflation, more than Ponce de Leon (43701, a
// gas-station/interstate location -- a genuinely different demand pattern, "might could" help but
// weighted lower).
//
// Approach: pull each comparable store's own REAL sales trajectory from ITS first trading day
// forward, express it as a fraction of ITS OWN mature run-rate (so two stores of different sizes
// both contribute a comparable SHAPE, not comparable dollars), blend the shapes by weight, then
// apply that blended shape to an assumption about 44689's own mature run-rate (left to the
// caller -- deliberately NOT guessed here; see projectNewStoreSales's own comment). Deliberately
// standalone -- not wired into forecast.js's automatic Model Assignment backtest, which grades
// every store the same way and would need a much larger, riskier change to carry a per-store
// comparable-list override. This is a focused, callable, tested tool for this one transition
// (and reusable verbatim for the next comparable-opening scenario), not a forecast.js rewrite.

// A comparable store's own first trading day, from its real sales rows -- the exact same
// "earliest date with sales>0" rule forecast.js's storeAgeDays() uses, so this stays consistent
// with the rest of the forecast engine's own new-store age math.
export function firstTradingDay(laborRows, loc) {
  const rows = (laborRows || []).filter(r => r.loc === loc && r.sales > 0 && r.date);
  if (!rows.length) return null;
  return rows.reduce((a, r) => (r.date < a ? r.date : a), rows[0].date);
}

function _toTime(d) { return (typeof d === 'string' ? new Date(d) : d).getTime(); }
function _dateKey(d) { return typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10); }

// Day-since-open indexed sales for one comparable store, days 0..maxDays-1 (0 = first trading
// day). Missing days (closures, gaps) are left out, not zero-filled -- a closure is missing
// information, not a real zero, same reasoning forecast.js's own ±300% outlier-drop comment uses.
export function rampSeriesFor(laborRows, loc, maxDays) {
  const open = firstTradingDay(laborRows, loc);
  if (!open) return [];
  const openTime = _toTime(open);
  const rows = (laborRows || []).filter(r => r.loc === loc && r.sales > 0 && r.date);
  const out = [];
  for (const r of rows) {
    const dayN = Math.round((_toTime(r.date) - openTime) / 864e5);
    if (dayN < 0 || dayN >= maxDays) continue;
    out.push({ dayN, sales: r.sales, date: _dateKey(r.date) });
  }
  return out.sort((a, b) => a.dayN - b.dayN);
}

// A comparable store's own mature baseline -- the denominator that turns its absolute sales into
// a "fraction of mature" shape. Uses its own trailing 90 days of real sales as of the series'
// OWN last available day (not "today"), so a comparable with a long trading history (Tishomingo,
// opened 2024-12-16) and one with a shorter history (Ponce de Leon, opened 2026-03-13) both
// produce a defensible mature figure from their own real data, not an arbitrary fixed window.
// Returns null (rather than a misleading number) when there isn't enough recent history to call
// the store "mature" yet.
export function matureBaseline(laborRows, loc, minDays = 10) {
  const rows = (laborRows || []).filter(r => r.loc === loc && r.sales > 0 && r.date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (rows.length < minDays) return null;
  const last90 = rows.slice(0, 90);
  return last90.reduce((a, r) => a + r.sales, 0) / last90.length;
}

// One comparable's ramp SHAPE: day-since-open -> fraction of its own mature daily average.
// A fraction near 1.0 means "trading like a mature store already"; <1.0 means still ramping.
export function rampShape(laborRows, loc, maxDays) {
  const mature = matureBaseline(laborRows, loc);
  if (!mature) return [];
  return rampSeriesFor(laborRows, loc, maxDays).map(p => ({ dayN: p.dayN, frac: p.sales / mature }));
}

// Blend several comparables' shapes by weight, day-since-open aligned. A day with fewer than all
// comparables reporting still blends (weighted average of whatever's present that day) -- useful
// near the edges where one comparable's history runs shorter than maxDays. Weights need not sum
// to 1 going in; they're normalized per day over whichever comparables actually have a value.
export function blendRampShapes(comparables, maxDays) {
  // comparables: [{loc, laborRows, weight}]
  const byDay = new Map(); // dayN -> [{frac, weight}]
  for (const c of (comparables || [])) {
    const shape = rampShape(c.laborRows, c.loc, maxDays);
    for (const p of shape) {
      if (!byDay.has(p.dayN)) byDay.set(p.dayN, []);
      byDay.get(p.dayN).push({ frac: p.frac, weight: c.weight });
    }
  }
  const out = [];
  for (const [dayN, entries] of byDay) {
    const wSum = entries.reduce((a, e) => a + e.weight, 0);
    if (!wSum) continue;
    const frac = entries.reduce((a, e) => a + e.frac * e.weight, 0) / wSum;
    out.push({ dayN, frac: +frac.toFixed(4) });
  }
  return out.sort((a, b) => a.dayN - b.dayN);
}

// Apply a blended ramp shape to an assumed mature WEEKLY sales figure for the NEW store,
// producing a day-by-day $ forecast for its first `maxDays` days. `matureWeeklySales` is
// deliberately a required INPUT, not derived here -- this engine does not guess the new store's
// eventual run rate (that's a judgment call involving the format upgrade -- drive-thru addition,
// freestanding vs. in-store, inflation since the comparable opened -- that only the owner can
// size), it only answers "given that assumption, what does the ramp curve look like."
export function projectNewStoreSales({ comparables, matureWeeklySales, maxDays = 120 }) {
  if (!matureWeeklySales || matureWeeklySales <= 0) return [];
  const shape = blendRampShapes(comparables, maxDays);
  const matureDaily = matureWeeklySales / 7;
  return shape.map(p => ({ dayN: p.dayN, frac: p.frac, forecastSales: +(p.frac * matureDaily).toFixed(2) }));
}
