// @ts-nocheck
// ── EOM Inventory / Food-Cost engine ──────────────────────────────────────────
// Pure logic for the End-Of-Month inventory close (Notes 29). Consumes the
// auto-pulled QSRSoft inventory streams (On-Hand, Variance Stat, Inventory
// Summary/Usage) and derives:
//   • count progress  — how far along a store is (the ~90-95% "believes done" signal)
//   • incomplete-count diagnosis — which items/classes still need counting
//   • variance follow-ups — items whose count most likely explains a food-cost miss
//
// Domain (owner, authoritative):
//   • EOM = last 3 calendar days of the month.
//   • Food / Condiment / Paper counted on the 3rd & 2nd days out (either day, splits ok).
//   • Non-Product counted on the last day.
//   • FOB (what we control) = Food + Condiment classes only, 24–28% of revenue.
//   • Completion is inferred from the last_counted / last_submitted date columns:
//     an item is "counted" once one of those dates falls inside the count window.
//
// All functions are pure — pass `asOf` (a Date) so tests are deterministic and
// there is no Date.now() coupling. Row shapes match src/views/fob-eom.js parsers
// and the qsr_onhand / qsr_variance_stat / qsr_inventory_summary tables.

// ── Period + window helpers ───────────────────────────────────────────────────

// 'YYYY-MM' key for the month a date belongs to.
export function periodKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInPeriod(period) {
  const [y, m] = String(period).split('-').map(Number);
  return new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
}

// The count window = the last COUNT_WINDOW_DAYS calendar days of the period.
export const COUNT_WINDOW_DAYS = 3;

// Local midnight Date for day `dom` of the period.
function periodDay(period, dom) {
  const [y, m] = String(period).split('-').map(Number);
  const d = new Date(y, m - 1, dom);
  d.setHours(0, 0, 0, 0);
  return d;
}

// First day of the count window (inclusive). July (31d) → the 29th.
export function countWindowStart(period) {
  return periodDay(period, daysInPeriod(period) - (COUNT_WINDOW_DAYS - 1));
}

// The last day of the month — when Non-Product must be counted.
export function lastDayOfPeriod(period) {
  return periodDay(period, daysInPeriod(period));
}

// Is `asOf` inside (or past the start of) the count window for `period`?
export function inCountWindow(period, asOf) {
  const t = asOf instanceof Date ? asOf : new Date(asOf);
  return t >= countWindowStart(period);
}

// ── Class normalisation ───────────────────────────────────────────────────────
// QSRSoft class labels vary; normalise to our four buckets.
export function normClass(cls) {
  const s = String(cls || '').toLowerCase();
  if (/non[-\s]?product|nonprod|non prod|supplies|operating/.test(s)) return 'nonproduct';
  if (/condiment/.test(s)) return 'condiment';
  if (/paper/.test(s)) return 'paper';
  if (/food/.test(s)) return 'food';
  return 'other';
}

// FOB = Food + Condiment (what the owner controls at EOM).
export const FOB_CLASSES = ['food', 'condiment'];
// Classes due on the 2nd/3rd days out vs the last day.
const EARLY_CLASSES = ['food', 'condiment', 'paper'];
const LATE_CLASSES = ['nonproduct'];

// A store is treated as "believes they're done" at this overall completion.
export const BELIEVES_DONE_PCT = 0.90;
// A class is treated as complete at this fraction.
export const CLASS_DONE_PCT = 0.98;

// The most recent count/submit date on an On-Hand row (or null).
function countedDate(row) {
  const c = row.lastCounted ? new Date(row.lastCounted) : null;
  const s = row.lastSubmitted ? new Date(row.lastSubmitted) : null;
  if (c && s) return c > s ? c : s;
  return c || s || null;
}

// Has this item been counted inside the current window?
function isCounted(row, windowStart) {
  const d = countedDate(row);
  return !!(d && d >= windowStart);
}

// ── Count progress ────────────────────────────────────────────────────────────
// Given a store's On-Hand rows for a period, how far along is the count?
// Returns overall + per-class breakdown and the "believes done" flag.
export function computeCountProgress(onHandRows, { period, asOf } = {}) {
  const rows = Array.isArray(onHandRows) ? onHandRows : [];
  if (!period) period = rows.length ? periodKey(countedDate(rows[0]) || new Date()) : null;
  const windowStart = period ? countWindowStart(period) : new Date(0);

  const byClass = {};
  const ensure = k => (byClass[k] || (byClass[k] = { total: 0, counted: 0, pct: 0, done: false }));

  let itemsTotal = 0, itemsCounted = 0, lastActivityAt = null;
  for (const r of rows) {
    const k = normClass(r.cls);
    const bucket = ensure(k);
    bucket.total++; itemsTotal++;
    if (isCounted(r, windowStart)) {
      bucket.counted++; itemsCounted++;
      const d = countedDate(r);
      if (d && (!lastActivityAt || d > lastActivityAt)) lastActivityAt = d;
    }
  }
  for (const k of Object.keys(byClass)) {
    const b = byClass[k];
    b.pct = b.total ? b.counted / b.total : 0;
    b.done = b.total > 0 && b.pct >= CLASS_DONE_PCT;
  }

  const pctCounted = itemsTotal ? itemsCounted / itemsTotal : 0;

  // FOB-only completion (Food + Condiment) — the classes that actually matter.
  let fobTotal = 0, fobCounted = 0;
  for (const k of FOB_CLASSES) { if (byClass[k]) { fobTotal += byClass[k].total; fobCounted += byClass[k].counted; } }
  const fobPctCounted = fobTotal ? fobCounted / fobTotal : 0;

  const earlyDone = EARLY_CLASSES.every(k => !byClass[k] || byClass[k].done);
  const lateDone = LATE_CLASSES.every(k => !byClass[k] || byClass[k].done);

  return {
    period,
    itemsTotal,
    itemsCounted,
    pctCounted,
    fobTotal,
    fobCounted,
    fobPctCounted,
    byClass,
    earlyDone,
    lateDone,
    lastActivityAt,
    // "Believes done": overall completion high enough that the store thinks they're finished.
    believesDone: itemsTotal > 0 && pctCounted >= BELIEVES_DONE_PCT,
    inWindow: period ? inCountWindow(period, asOf || new Date()) : false,
  };
}

// ── Incomplete-count diagnosis ────────────────────────────────────────────────
// Which items/classes are still uncounted, ranked by their $ weight so the store
// chases the ones that actually move food cost. Uncounted, high-value items are
// the #1 driver of false variance (undercounted ending inventory → usage up).
export function diagnoseIncompleteCount(onHandRows, { period, asOf, minValue = 0 } = {}) {
  const rows = Array.isArray(onHandRows) ? onHandRows : [];
  const windowStart = period ? countWindowStart(period) : new Date(0);

  const uncounted = rows
    .filter(r => !isCounted(r, windowStart))
    .map(r => ({
      wrin: r.wrin,
      descr: r.descr || r.desc,
      cls: normClass(r.cls),
      // value at risk if this item is skipped — prior on-hand amount is the best proxy
      valueAtRisk: Math.abs(Number(r.onHandAmt) || (Number(r.unitPrice) || 0) * (Number(r.totalUnits) || 0)),
      lastCounted: r.lastCounted || null,
    }))
    .filter(r => r.valueAtRisk >= minValue)
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk);

  // Roll up by class so the message to the store is "Food: 12 items left ($430)".
  const byClass = {};
  for (const u of uncounted) {
    const b = byClass[u.cls] || (byClass[u.cls] = { cls: u.cls, count: 0, valueAtRisk: 0, items: [] });
    b.count++; b.valueAtRisk += u.valueAtRisk; b.items.push(u);
  }

  return {
    uncountedCount: uncounted.length,
    uncountedValue: uncounted.reduce((s, u) => s + u.valueAtRisk, 0),
    uncounted,
    byClass: Object.values(byClass).sort((a, b) => b.valueAtRisk - a.valueAtRisk),
  };
}

// ── Variance follow-ups ───────────────────────────────────────────────────────
// Rank variance-stat items by how likely a count correction explains the miss.
// Mirrors the priority heuristic in fob-eom.js analyzeData:
//   large negative $ variance + low on-hand (few cases) ⇒ likely UNDERcount → recount up.
//   large positive variance + high days-supply ⇒ possible OVERcount → verify.
export function rankVarianceFollowups(varianceRows, onHandRows, summaryRows, { minDol = 50 } = {}) {
  const vr = Array.isArray(varianceRows) ? varianceRows : [];
  const ohMap = {}; (onHandRows || []).forEach(o => { ohMap[o.wrin] = o; });
  const sumMap = {}; (summaryRows || []).forEach(s => { sumMap[s.wrin] = s; });

  return vr
    .filter(v => Math.abs(Number(v.dolDiff) || 0) >= minDol)
    .map(v => {
      const oh = ohMap[v.wrin] || null;
      const s = sumMap[v.wrin] || {};
      const dol = Number(v.dolDiff) || 0;
      const cases = oh ? (Number(oh.cases) || 0) : 0;
      const dos = Number(s.daysSupply) || 0;
      const severity = Math.abs(dol) >= 300 ? 'critical' : Math.abs(dol) >= 100 ? 'high' : 'medium';
      const priority = Math.abs(dol) * (cases >= 3 ? 1.5 : 1) * (dos > 10 ? 0.8 : 1);
      let action = 'review';
      if (dol < 0) action = 'recount-up';          // undercounted ending inventory → correct up
      else if (dos > 10 && cases >= 1) action = 'verify-overcount';
      return {
        wrin: v.wrin,
        descr: v.descr || v.desc,
        cls: normClass(v.cls),
        dolDiff: dol,
        variance: Number(v.variance) || 0,
        rawWaste: Number(v.rawWaste) || 0,
        compWaste: Number(v.compWaste) || 0,
        onHand: oh,
        daysSupply: dos,
        severity,
        priority,
        action,
        tip: buildCountTip({ oh, s, dol }),
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

export function buildCountTip({ oh, s = {}, dol = 0 }) {
  if (!oh) return 'Not on the On-Hand report — operational issue (waste, yield, or tracking), not a count error.';
  const dos = Number(s.daysSupply) || 0;
  const parts = [];
  if (oh.cases > 0) parts.push(`${oh.cases} case${oh.cases !== 1 ? 's' : ''}`);
  if (oh.packs > 0) parts.push(`${oh.packs} pack${oh.packs !== 1 ? 's' : ''}`);
  if (oh.loose > 0) parts.push(`${Number(oh.loose).toFixed(2)} loose`);
  const counted = parts.join(' + ') || 'nothing counted';
  const tip = dos < 3
    ? 'LOW on hand — look for uncounted stock in the freezer / walk-in.'
    : dos > 10
      ? 'Unusually high days-of-supply — double-check the case count is right.'
      : 'Verify the loose count.';
  return `Counted ${counted}. ${tip}`;
}

// ── Store status roll-up (for the EOM dashboard + notification trigger) ────────
// Combines count progress with a FOB snapshot into one dashboard row per store.
export function buildStoreStatus({ loc, period, onHandRows, fobSnapshot, asOf } = {}) {
  const prog = computeCountProgress(onHandRows, { period, asOf });
  return {
    loc,
    period,
    itemsTotal: prog.itemsTotal,
    itemsCounted: prog.itemsCounted,
    pctCounted: prog.pctCounted,
    fobPctCounted: prog.fobPctCounted,
    byClass: prog.byClass,
    lastActivityAt: prog.lastActivityAt,
    believesDone: prog.believesDone,
    // fires the "store thinks they're finished — begin review" alert
    shouldNotify: prog.believesDone && prog.inWindow,
    fobPct: fobSnapshot?.fobPct ?? null,
    totalFcPct: fobSnapshot?.totalFcPct ?? null,
  };
}
