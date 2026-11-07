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

// ── Launch Planner calendar mapping (New Store Launch Planner, 2026-11-06) ──────────────────
// A thin layer over projectNewStoreSales above — this file's own day-indexed math is untouched.
// The Launch Planner (src/views/launch-planner.js) needs real CALENDAR dates to show and persist
// (new_store_launch_plan rows are keyed by plan_date, not dayN), so this maps dayN -> the real
// date starting at openDate. Built reusable for the NEXT relocation/opening, not Lindsay-specific
// — every input (loc, comparables, matureWeeklySales, openDate) is a caller-supplied parameter.
function _addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function projectLaunchPlan({ loc, comparables, matureWeeklySales, openDate, maxDays = 60, dowShape = null }) {
  if (!loc || !openDate) return [];
  const forecast = projectNewStoreSales({ comparables, matureWeeklySales, maxDays });
  return forecast.map(p => {
    const planDate = _addDays(openDate, p.dayN);
    let projectedSales = p.forecastSales;
    if (dowShape) {
      const dow = new Date(planDate + 'T12:00:00Z').getUTCDay();
      const entry = dowShape.find(d => d.dow === dow);
      if (entry) projectedSales = +(projectedSales * entry.frac).toFixed(2);
    }
    return { loc, planDate, dayN: p.dayN, projectedSales };
  });
}

// ── Day-of-week shape (Launch Planner DOW overlay, 2026-11-07) ─────────────────────────────
// A derived VIEW over a PREDECESSOR store's real daily sales -- NOT a ramp-shape comparable.
// The predecessor (e.g. 18213 for Lindsay/44689) is the SAME town/trade-area as the new store,
// just the old building, so its real day-of-week pattern is genuinely local demand (payday
// Fridays, a quiet rural Sunday, etc.) rather than borrowed from a different town the way the
// Tishomingo/Ponce de Leon ramp-shape comparables are. Owner ask (2026-11-07), after liking the
// "$8k-$9k/day early weeks" finding: "lets figure out, based on 18213 patterns how that splits
// by day of week and apply to launch as well."
//
// Deliberately separate from forecast.js's private _dowShape (not exported, not reusable here):
// that function shapes a SINGLE day, strictly asOf-bounded (leak-free), from an ACTIVE store's
// own recent trailing history, for live day-ahead forecasting. This function derives a full
// 7-value shape once, from a RETIRED predecessor's entire real history, for a brand-new store's
// launch plan -- a different mechanism solving a different problem, not an overload of the same
// one.
//
// dailyRows: [{loc, date, sales}] -- loadDailySalesForStore's own output shape, reused as-is.
// Requires real data on every one of the 7 weekdays (not just `minDays` total) before returning
// a shape -- a predecessor with, say, zero real Sundays would otherwise silently apply frac:1
// there, which is indistinguishable from "no adjustment" and would misrepresent real coverage.
export function dowShapeFor(dailyRows, loc, minDays = 20) {
  const rows = (dailyRows || []).filter(r => r.loc === loc && r.sales > 0 && r.date);
  if (rows.length < minDays) return null;
  const byDow = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const r of rows) {
    const d = new Date(r.date + 'T12:00:00Z').getUTCDay();
    byDow[d].sum += r.sales;
    byDow[d].count += 1;
  }
  if (byDow.some(b => b.count === 0)) return null; // every weekday needs real coverage
  const avgByDow = byDow.map(b => b.sum / b.count);
  const overallAvg = avgByDow.reduce((a, b) => a + b, 0) / 7;
  if (!(overallAvg > 0)) return null;
  return avgByDow.map((avg, dow) => ({ dow, frac: +(avg / overallAvg).toFixed(4) }));
}

// ── Hourly shape (Launch Planner hourly breakdown, 2026-11-06) ──────────────────────────────
// A derived VIEW over real hour_slot-level sales, not a new day-indexed ramp concept and NOT
// persisted anywhere — the panel computes this live from already-loaded rows whenever the owner
// expands a day, so no new schema/DDL. For each comparable, this is the average fraction of ITS
// OWN daily total that lands in each of the 24 real hour_slot buckets ('05:00'..'28:00'), taken
// from the same trailing-up-to-90-real-trading-days window matureBaseline() uses above, for the
// identical reason: a comparable with a long history and one with a short history both produce a
// defensible shape from their own real data rather than an arbitrary fixed window.
//
// hourlyRows: [{loc, date, hourSlot, sales}] — one row per (date, hour_slot), the hour_slot
// dimension preserved (loadHourlySalesForStore in src/lib/supabase.js; loadDailySalesForStore
// already sums this away for the day-level model above, which is why this needs its own reader).
export const HOUR_SLOTS = [
  '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '24:00',
  '25:00', '26:00', '27:00', '28:00',
];
// The pre-dawn + wrap-around slots a genuinely 24-hour store trades through, but a typical-hours
// comparable may show near-zero in — checked explicitly so a near-closed comparable's own shape
// is never silently blended into a 24-hour store's real Late Night hours (owner-flagged risk for
// Lindsay specifically, but this check applies to any future comparable set).
export const DEEP_OVERNIGHT_SLOTS = ['05:00', '24:00', '25:00', '26:00', '27:00', '28:00'];

// One comparable's hourly SHAPE: hour_slot -> fraction of its own daily total, averaged over its
// trailing up-to-90 real trading days. Returns null (never a misleading shape) when there isn't
// enough history, same "not mature yet" guard matureBaseline() uses.
export function hourlyShapeFor(hourlyRows, loc, minDays = 10) {
  const rows = (hourlyRows || []).filter(r => r.loc === loc && r.date);
  if (!rows.length) return null;
  const positiveDates = new Set(rows.filter(r => (Number(r.sales) || 0) > 0).map(r => r.date));
  const dates = [...positiveDates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (dates.length < minDays) return null;
  const matureDates = new Set(dates.slice(0, 90));
  const byHour = new Map(HOUR_SLOTS.map(h => [h, 0]));
  let dayTotal = 0;
  for (const r of rows) {
    if (!matureDates.has(r.date) || !byHour.has(r.hourSlot)) continue;
    const s = Number(r.sales) || 0;
    byHour.set(r.hourSlot, byHour.get(r.hourSlot) + s);
    dayTotal += s;
  }
  if (!dayTotal) return null;
  const overnightSales = DEEP_OVERNIGHT_SLOTS.reduce((a, h) => a + byHour.get(h), 0);
  const overnightFrac = overnightSales / dayTotal;
  const shape = HOUR_SLOTS.map(h => ({ hourSlot: h, frac: byHour.get(h) / dayTotal }));
  return { shape, overnightFrac, nearlyClosedOvernight: overnightFrac < 0.01 };
}

// Weight-blend several comparables' hourly shapes, hour_slot aligned. comparables:
// [{loc, hourlyRows, weight}]. Also carries a weighted-average overnight fraction and whether ANY
// comparable is itself near-closed overnight, so the caller can warn before applying this shape
// to a store that trades through the night for real (e.g. Lindsay's 24-hour-year-one decision).
export function blendHourlyShapes(comparables) {
  const perComparable = [];
  for (const c of (comparables || [])) {
    const r = hourlyShapeFor(c.hourlyRows, c.loc);
    if (r) perComparable.push({ ...r, weight: c.weight });
  }
  if (!perComparable.length) return null;
  const byHour = new Map(HOUR_SLOTS.map(h => [h, []]));
  for (const c of perComparable) {
    for (const p of c.shape) byHour.get(p.hourSlot).push({ frac: p.frac, weight: c.weight });
  }
  const shape = HOUR_SLOTS.map(h => {
    const entries = byHour.get(h);
    const wSum = entries.reduce((a, e) => a + e.weight, 0);
    const frac = wSum ? entries.reduce((a, e) => a + e.frac * e.weight, 0) / wSum : 0;
    return { hourSlot: h, frac: +frac.toFixed(5) };
  });
  const wSum = perComparable.reduce((a, c) => a + c.weight, 0);
  const overnightFrac = wSum ? perComparable.reduce((a, c) => a + c.overnightFrac * c.weight, 0) / wSum : 0;
  const anyNearlyClosedOvernight = perComparable.some(c => c.nearlyClosedOvernight);
  return { shape, overnightFrac, anyNearlyClosedOvernight };
}

// Split one day's $ total across the 24 real hour_slot buckets using a blended shape. Proportional
// by fraction; the LAST slot absorbs the rounding remainder so the 24 figures always sum exactly
// to dailyTotal rather than drifting a few cents short/over from independent rounding.
export function splitDayAcrossHours(dailyTotal, blended) {
  if (!blended || !dailyTotal) return [];
  const { shape } = blended;
  const out = [];
  let running = 0;
  for (let i = 0; i < shape.length; i++) {
    const isLast = i === shape.length - 1;
    const amt = isLast ? +(dailyTotal - running).toFixed(2) : +(shape[i].frac * dailyTotal).toFixed(2);
    running += amt;
    out.push({ hourSlot: shape[i].hourSlot, sales: amt });
  }
  return out;
}

// ── Quarter-hour shape (Launch Planner 15-min breakdown, 2026-11-07) ────────────────────────
// Same derived-VIEW approach as the hourly shape above, one level finer. The hourly build's own
// comment (2026-11-06) concluded "quarter-hour: no, not from this table" -- true of
// qsr_daily_activity (genuinely hourly-only, confirmed live), but that check never looked beyond
// that one table. A SEPARATE table, qsr_sales_quarter_hour, already holds REAL 15-minute sales
// buckets -- built for the unrelated "Record Hour" feature, confirmed live at 96 distinct
// qtr_slot values/store/day, backfilled to 2024-01-01 (memory/finding-record-hour-quarter-hour-
// pull.md). This is that same real data, reused here rather than interpolated, with the identical
// trailing-up-to-90-real-trading-days shape logic hourlyShapeFor uses, just keyed on 96 real
// qtr_slot buckets instead of 24 hour_slot buckets.
//
// qtrHourRows: [{loc, date, qtrSlot, sales}] — loadQuarterHourSalesForStore in src/lib/supabase.js.
export const QTR_SLOTS = (() => {
  const START_MIN = 4 * 60 + 15; // '04:15' -- first real 15-min bucket after the 4am business-day open
  const END_MIN = 28 * 60;       // '28:00'
  const out = [];
  for (let t = START_MIN; t <= END_MIN; t += 15) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
})();

// The 4 quarter-hour buckets that compose each DEEP_OVERNIGHT_SLOTS hour bucket, derived from that
// array rather than hand-duplicated, so the two sets can never drift out of lockstep.
function _hourBucketToQtrSlots(hourLabel) {
  const [hh, mm] = hourLabel.split(':').map(Number);
  const endMin = hh * 60 + mm;
  const out = [];
  for (let k = 3; k >= 0; k--) {
    const t = endMin - k * 15;
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}
export const DEEP_OVERNIGHT_QTR_SLOTS = [...new Set(DEEP_OVERNIGHT_SLOTS.flatMap(_hourBucketToQtrSlots))];

export function quarterHourShapeFor(qtrHourRows, loc, minDays = 10) {
  const rows = (qtrHourRows || []).filter(r => r.loc === loc && r.date);
  if (!rows.length) return null;
  const positiveDates = new Set(rows.filter(r => (Number(r.sales) || 0) > 0).map(r => r.date));
  const dates = [...positiveDates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (dates.length < minDays) return null;
  const matureDates = new Set(dates.slice(0, 90));
  const bySlot = new Map(QTR_SLOTS.map(s => [s, 0]));
  let dayTotal = 0;
  for (const r of rows) {
    if (!matureDates.has(r.date) || !bySlot.has(r.qtrSlot)) continue;
    const s = Number(r.sales) || 0;
    bySlot.set(r.qtrSlot, bySlot.get(r.qtrSlot) + s);
    dayTotal += s;
  }
  if (!dayTotal) return null;
  const overnightSales = DEEP_OVERNIGHT_QTR_SLOTS.reduce((a, s) => a + bySlot.get(s), 0);
  const overnightFrac = overnightSales / dayTotal;
  const shape = QTR_SLOTS.map(s => ({ qtrSlot: s, frac: bySlot.get(s) / dayTotal }));
  return { shape, overnightFrac, nearlyClosedOvernight: overnightFrac < 0.01 };
}

// Weight-blend several comparables' quarter-hour shapes, qtr_slot aligned. comparables:
// [{loc, qtrHourRows, weight}]. Same overnight-comparability guard as blendHourlyShapes.
export function blendQuarterHourShapes(comparables) {
  const perComparable = [];
  for (const c of (comparables || [])) {
    const r = quarterHourShapeFor(c.qtrHourRows, c.loc);
    if (r) perComparable.push({ ...r, weight: c.weight });
  }
  if (!perComparable.length) return null;
  const bySlot = new Map(QTR_SLOTS.map(s => [s, []]));
  for (const c of perComparable) {
    for (const p of c.shape) bySlot.get(p.qtrSlot).push({ frac: p.frac, weight: c.weight });
  }
  const shape = QTR_SLOTS.map(s => {
    const entries = bySlot.get(s);
    const wSum = entries.reduce((a, e) => a + e.weight, 0);
    const frac = wSum ? entries.reduce((a, e) => a + e.frac * e.weight, 0) / wSum : 0;
    return { qtrSlot: s, frac: +frac.toFixed(5) };
  });
  const wSum = perComparable.reduce((a, c) => a + c.weight, 0);
  const overnightFrac = wSum ? perComparable.reduce((a, c) => a + c.overnightFrac * c.weight, 0) / wSum : 0;
  const anyNearlyClosedOvernight = perComparable.some(c => c.nearlyClosedOvernight);
  return { shape, overnightFrac, anyNearlyClosedOvernight };
}

// Split one day's $ total across the 96 real qtr_slot buckets using a blended shape. Same
// last-slot-absorbs-the-remainder rounding discipline as splitDayAcrossHours.
export function splitDayAcrossQuarterHours(dailyTotal, blended) {
  if (!blended || !dailyTotal) return [];
  const { shape } = blended;
  const out = [];
  let running = 0;
  for (let i = 0; i < shape.length; i++) {
    const isLast = i === shape.length - 1;
    const amt = isLast ? +(dailyTotal - running).toFixed(2) : +(shape[i].frac * dailyTotal).toFixed(2);
    running += amt;
    out.push({ qtrSlot: shape[i].qtrSlot, sales: amt });
  }
  return out;
}
