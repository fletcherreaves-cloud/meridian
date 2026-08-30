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

// Non-Product is counted on the LAST day of the month (not the 2nd/3rd days out like Food/Cond/Paper).
// So it's "due today" only once asOf is on or past the period's last calendar day — before that it's
// expected-uncounted ("tmrw"). On the last day (and during the early-next-month close) it IS due today.
// (owner Notes 38: chip said "tmrw" on 07/31 — the last day — when Non-Product was actually due.)
export function nonProductDueToday(period, asOf = new Date()) {
  if (!period) return false;
  const a = asOf instanceof Date ? new Date(asOf) : new Date(asOf);
  if (isNaN(a)) return false;
  a.setHours(0, 0, 0, 0);
  const l = lastDayOfPeriod(period); l.setHours(0, 0, 0, 0);
  return a.getTime() >= l.getTime();
}

// Is `asOf` inside (or past the start of) the count window for `period`?
export function inCountWindow(period, asOf) {
  const t = asOf instanceof Date ? asOf : new Date(asOf);
  return t >= countWindowStart(period);
}

// ── Class normalisation ───────────────────────────────────────────────────────
// QSRSoft class labels vary; normalise to our four buckets.
export function normClass(cls) {
  const raw = String(cls || '').trim();
  // eBOS single-letter class codes: F=Food, C=Condiment, P=Paper, N/S/M/L=Non-Product buckets.
  if (/^[FCPNSML]$/.test(raw)) {
    return ({ F: 'food', C: 'condiment', P: 'paper' })[raw] || 'nonproduct';
  }
  const s = raw.toLowerCase();
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

// Total P&L Food Cost $/% from a single qsr_fob row — the Begin+Purchases+Adjustments+
// Transfers-Promotions-End build-up QSRSoft's own "P & L Food Cost %" column reports
// (EOM Supervisor's "Total Food Cost", 2026-08-03). A different, broader metric than FOB
// (Food Over Base) below. Exported so every consumer of a qsr_fob row (fobSnapshotByStore
// here, and FOBAnalysisPanel's per-date cloud mapping — #222) computes it from this ONE
// place — a second hand-rolled copy of this formula is how #222 happened: analytics.js
// hardcoded pLFoodPct:null for cloud rows instead of deriving it, even though every field
// this needs was already loaded.
export function pLFoodCostFromRow(r, sales) {
  const pLFoodCost = (r.pnlFoodCostBegin || 0) + (r.pnlFoodCostPurchases || 0) + (r.pnlFoodCostAdjustments || 0)
                    + (r.pnlFoodCostTransfers || 0) - (r.pnlFoodCostPromotions || 0) - (r.pnlFoodCostEnd || 0);
  return { pLFoodCost, pLFoodPct: sales ? pLFoodCost / sales : null };
}

// A store is treated as "believes they're done" at this overall completion.
// FOB $/% per store for a period. qsr_fob is a DAILY table, but each daily row is a period-to-date
// SNAPSHOT (the FOB report is month-keyed — the pull queries one date but the API returns the running
// month value), NOT a daily increment. So the period figure = the LATEST snapshot per store, NEVER the
// sum of the daily rows: summing ~30 snapshots inflates $ ~30× while the ratio (FOB%) survives, which
// is why only absolute-$ consumers (the AI cross-check) ever surfaced the bug. This is the ONE correct
// aggregation — kept here, pure + unit-tested, so it can't silently regress to a sum. (owner FOB 30×.)
export function fobSnapshotByStore(fobRows, period) {
  const latest = {};
  const dkey = (d) => typeof d === 'string' ? d.slice(0, 10)
    : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
  for (const r of (fobRows || [])) {
    const k = dkey(r.date);
    if (period && k.slice(0, 7) !== period) continue;
    const loc = String(r.loc);
    const cur = latest[loc];
    if (!cur || k > cur.key) latest[loc] = { row: r, key: k };
  }
  const acc = {};
  for (const loc of Object.keys(latest)) {
    const r = latest[loc].row;
    const comp = r.compWasteAmt || 0, raw = r.rawWasteAmt || 0, cond = r.condimentsAmt || 0;
    const emp = r.empMgrMealsAmt || 0, statv = r.statVarianceAmt || 0, unex = r.unexplainedAmt || 0;
    const sales = r.prodSalesAmt || 0;
    const fob = comp + raw + cond + emp + statv + unex;
    const { pLFoodCost, pLFoodPct } = pLFoodCostFromRow(r, sales);
    acc[loc] = { sales, comp, raw, cond, emp, statv, unex, fob, fobPct: sales ? fob / sales : null,
      pLFoodCost, pLFoodPct, asOf: latest[loc].key };
  }
  return acc;
}

export const BELIEVES_DONE_PCT = 0.90;
// A class is treated as complete at this fraction.
export const CLASS_DONE_PCT = 0.98;

// The most recent count/submit date on an On-Hand row (or null). Exported (dispatch #213) so
// scripts/qsrsoft-onhand-pull.mjs's FOB-freshness check reuses this "counted or submitted,
// whichever is later" logic verbatim instead of a second copy — every other consumer of this
// semantics (computeCountProgress/diagnoseIncompleteCount below) stays on the same function.
export function countedDate(row) {
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
export function computeCountProgress(onHandRows, { period, asOf, acceptEarly = false } = {}) {
  const rows = Array.isArray(onHandRows) ? onHandRows : [];
  if (!period) period = rows.length ? periodKey(countedDate(rows[0]) || new Date()) : null;
  // acceptEarly (count-date exception): count anything counted THIS period as done, not just the final
  // window — so a store whose approved count was early reads complete. See project-eom-count-exceptions.
  const windowStart = period
    ? (acceptEarly && /^\d{4}-\d{2}$/.test(period) ? new Date(period + '-01T00:00:00') : countWindowStart(period))
    : new Date(0);

  const byClass = {};
  const ensure = k => (byClass[k] || (byClass[k] = { total: 0, counted: 0, pct: 0, done: false }));

  let itemsTotal = 0, itemsCounted = 0, lastActivityAt = null;
  const dayTally = {};   // YYYY-MM-DD → count of items counted that day (to find the bulk-count day)
  for (const r of rows) {
    const k = normClass(r.cls);
    const bucket = ensure(k);
    bucket.total++; itemsTotal++;
    if (isCounted(r, windowStart)) {
      bucket.counted++; itemsCounted++;
      const d = countedDate(r);
      if (d && (!lastActivityAt || d > lastActivityAt)) lastActivityAt = d;
      if (d) { const key = d.toISOString().slice(0, 10); dayTally[key] = (dayTally[key] || 0) + 1; }
    }
  }
  // The "perceived full count" date = the day the BULK of items were counted (the mode), NOT the latest
  // stray touch (owner: PDL counted 07/28 but a lone 07/31 activity made lastActivityAt read 07/31). Ties
  // break to the later day. This is the date the dashboard should attribute the count to.
  let fullCountDate = null, fullCountN = -1;
  for (const day of Object.keys(dayTally)) {
    if (dayTally[day] > fullCountN || (dayTally[day] === fullCountN && day > fullCountDate)) { fullCountN = dayTally[day]; fullCountDate = day; }
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

  // On the LAST day of the month Non-Product IS due today, so it joins the due-today (early) set
  // (owner Notes 38). Before then it's "late" (tomorrow). effEarly/effLate switch on that.
  const npDue = nonProductDueToday(period, asOf || new Date());
  const effEarly = npDue ? [...EARLY_CLASSES, ...LATE_CLASSES] : EARLY_CLASSES;
  const effLate = npDue ? [] : LATE_CLASSES;
  const earlyDone = effEarly.every(k => !byClass[k] || byClass[k].done);
  const lateDone = effLate.every(k => !byClass[k] || byClass[k].done);

  // TODAY'S target (owner 2026-07-30): Food + Condiment + Paper are due to 100% by EOD; Non-Product
  // isn't counted until tomorrow — UNLESS today is the last day of the month, when it's due too. So
  // the store's real "am I done today?" number is the effective-early %. Non-Product uncounted before
  // the last day is expected; on the last day it counts against today's 100%.
  let earlyTotal = 0, earlyCounted = 0;
  for (const k of effEarly) { if (byClass[k]) { earlyTotal += byClass[k].total; earlyCounted += byClass[k].counted; } }
  const earlyPctCounted = earlyTotal ? earlyCounted / earlyTotal : (itemsTotal ? pctCounted : 0);
  let lateTotal = 0, lateCounted = 0;
  for (const k of effLate) { if (byClass[k]) { lateTotal += byClass[k].total; lateCounted += byClass[k].counted; } }
  const latePctCounted = lateTotal ? lateCounted / lateTotal : 0;

  return {
    period,
    itemsTotal,
    itemsCounted,
    pctCounted,
    fobTotal,
    fobCounted,
    fobPctCounted,
    earlyTotal, earlyCounted, earlyPctCounted,   // Food+Condiment+Paper — today's 100% target
    lateTotal, lateCounted, latePctCounted,       // Non-Product — due tomorrow (or today on the last day)
    nonProductDueToday: npDue,                     // last day of month → Non-Product due today too
    byClass,
    earlyDone,
    lateDone,
    lastActivityAt,
    fullCountDate,     // the bulk-count day (mode) — the date to attribute the count to on the dashboard
    // "Believes done": TODAY's target (Food+Condiment+Paper) high enough that the store is finished
    // for today. Non-Product isn't due until tomorrow, so it must NOT hold a store below "done"
    // (owner 2026-07-30). Falls back to all-class % only if there are no early-class items.
    believesDone: earlyTotal > 0 ? earlyPctCounted >= BELIEVES_DONE_PCT : (itemsTotal > 0 && pctCounted >= BELIEVES_DONE_PCT),
    inWindow: period ? inCountWindow(period, asOf || new Date()) : false,
  };
}

// ── Incomplete-count diagnosis ────────────────────────────────────────────────
// Which items/classes are still uncounted, ranked by their $ weight so the store
// chases the ones that actually move food cost. Uncounted, high-value items are
// the #1 driver of false variance (undercounted ending inventory → usage up).
// `acceptEarly` (owner 2026-07-31, count-date exception): the store's early count was approved as its
// EOM count (e.g., Ponce counted 07/28 and won't recount), so items counted EARLY this period are
// treated as counted — dropped from the uncounted/flagged set. See project-eom-count-exceptions.
// `windowStart` (dispatch #97, 2026-08-24): an explicit override for the completion window's
// start, for callers whose "is this counted yet" window isn't EOM's own last-3-days-of-month
// close window — e.g. the weekly-count widget's "since the store's current count attempt began."
// `period` still drives the stale-vs-early split below (which calendar month owns `periodStart`)
// even when `windowStart` overrides the window itself, so a caller can pass the current month's
// `period` for correct stale/early attribution while grading completion against its own window.
export function diagnoseIncompleteCount(onHandRows, { period, asOf, minValue = 0, acceptEarly = false, windowStart: windowStartOverride = null } = {}) {
  const rows = Array.isArray(onHandRows) ? onHandRows : [];
  const windowStart = windowStartOverride || (period ? countWindowStart(period) : new Date(0));
  // Period start (1st of the count month) so we can tell WHY an item reads "uncounted":
  //   never   — no count on record this period → a true blank (QSRSoft flags this too).
  //   early   — counted THIS period but before the final window → QSRSoft shows it counted;
  //             recounting it is the cascaded-count discussion, NOT free "just count it" money.
  //   stale   — last counted in a PRIOR period → likely an obsolete / discontinued / inactive item
  //             carrying a residual on-hand (QSRSoft drops it from the active count list). These
  //             inflate value-at-risk without being real to-count work — the Durant #5985 case.
  const periodStart = /^\d{4}-\d{2}$/.test(period || '') ? new Date(period + '-01T00:00:00') : null;

  let uncounted = rows
    .filter(r => !isCounted(r, windowStart))
    .map(r => {
      const d = countedDate(r);
      const state = !d ? 'never' : (periodStart && d < periodStart ? 'stale' : 'early');
      return {
        wrin: r.wrin,
        descr: r.descr || r.desc,
        cls: normClass(r.cls),
        // value at risk if this item is skipped — prior on-hand amount is the best proxy
        valueAtRisk: Math.abs(Number(r.onHandAmt) || (Number(r.unitPrice) || 0) * (Number(r.totalUnits) || 0)),
        lastCounted: d ? d.toISOString().slice(0, 10) : null,
        state,                                              // never | early | stale
        onHandAmt: Number(r.onHandAmt) || 0,
        totalUnits: Number(r.totalUnits) || 0,
      };
    })
    .filter(r => r.valueAtRisk >= minValue)
    .sort((a, b) => b.valueAtRisk - a.valueAtRisk);
  // A never/early item with $0 on hand AND 0 units has nothing to recount — recounting it can't
  // change anything, so it shouldn't read as an action item (store 43380, WRIN 02373-015
  // APPLES/DICED: deactivated + zeroed out in QSRSoft, counted 8/15 [before the final window] →
  // state 'early', $0 value-at-risk, still surfaced as "needs recounting" purely from its count
  // date). `stale` is deliberately EXEMPT — that's the Obsolete/Discontinued/Inactive "verify &
  // clear" bucket, which exists specifically to catch a zeroed residual so the store can formally
  // deactivate it in QSRSoft; dropping zero-value items there would hide the exact rows it exists for.
  uncounted = uncounted.filter(u => u.state === 'stale' || u.valueAtRisk > 0 || u.totalUnits > 0);
  // Count-date exception: the store's early count was approved as its EOM count → early-counted items
  // are accepted (dropped from the uncounted/flagged set). Stale/never are unaffected.
  if (acceptEarly) uncounted = uncounted.filter(u => u.state !== 'early');
  // Tally by state so callers can separate true blanks from counted-early / obsolete-inactive items.
  const byState = { never: { n: 0, value: 0 }, early: { n: 0, value: 0 }, stale: { n: 0, value: 0 } };
  for (const u of uncounted) { const b = byState[u.state]; if (b) { b.n++; b.value += u.valueAtRisk; } }

  // Late-count timing (owner 2026-07-31): Food/Condiment/Paper should be counted on the 2nd & 3rd day
  // out from EOM — NOT the last day (that's for Non-Product). If the store's BULK count of those classes
  // (the mode day) landed on the last calendar day, flag it "late" — a soft coaching note, not a gap
  // (the count IS done, just off the intended schedule). Prior-period (stale) counts are ignored.
  const lastIso = periodStart ? lastDayOfPeriod(period).toISOString().slice(0, 10) : null;
  const timingClasses = new Set(['food', 'condiment', 'paper']);
  const fcDayTally = {};
  for (const r of rows) {
    if (!timingClasses.has(normClass(r.cls))) continue;
    const d = countedDate(r); if (!d || (periodStart && d < periodStart)) continue;
    const iso = d.toISOString().slice(0, 10); fcDayTally[iso] = (fcDayTally[iso] || 0) + 1;
  }
  let fcBulkDay = null, fcBulkN = -1;
  for (const iso of Object.keys(fcDayTally)) { if (fcDayTally[iso] > fcBulkN || (fcDayTally[iso] === fcBulkN && iso > fcBulkDay)) { fcBulkN = fcDayTally[iso]; fcBulkDay = iso; } }
  const lateBulk = !!(lastIso && fcBulkDay && fcBulkDay === lastIso);

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
    byState,
    // "True blanks" only — items with NO count this period. This is the number that means
    // "count these before close"; early/stale items are a different (cascade / obsolete-inactive) story.
    trueBlankCount: byState.never.n,
    trueBlankValue: byState.never.value,
    // Late-count coaching (Food/Cond/Paper bulk-counted on the last day instead of the 2nd/3rd day out).
    lateBulk,
    lateBulkDay: fcBulkDay,
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

// ── Communication generator: incomplete-count nudge + diagnosis action plan ───
// For a store that believes it's finished but still has high-value items on an old
// count date, produce a ready-to-send message listing exactly what to recount — and,
// when the diagnosis engine has surfaced findings, fold those into the body as a
// concrete "what to fix" action plan (WRIN-level ±$50 variance, waste patterns, etc.).
// This is what makes the draft useful OFF the count window: even when the count looks
// complete (no On-Hand gaps), a populated `actionItems` still produces a real message.
// `storeName` is display text; `minValue` filters out trivial-dollar items.
// `actionItems` = diagnosis result `.actionItems` (medium+ severity strings);
// `diagSummary` = diagnosis `.summary`; `diagDollars` = `.totalDollars`.
export function buildIncompleteCountMessage(storeName, onHandRows, {
  period, asOf, minValue = 25, maxItems = 20,
  actionItems = [], diagSummary = '', diagDollars = 0, planMax = 12,
} = {}) {
  const diag = diagnoseIncompleteCount(onHandRows, { period, asOf, minValue });
  const hasGaps = !!diag.uncountedCount;
  const planItems = (actionItems || []).slice(0, planMax);
  const hasPlan = planItems.length > 0;
  const morePlan = (actionItems || []).length > planItems.length
    ? `\n  …and ${actionItems.length - planItems.length} more finding${actionItems.length - planItems.length !== 1 ? 's' : ''}.` : '';
  const planSection = hasPlan
    ? `Food-cost diagnosis — action plan${diagDollars ? ` (~$${Math.round(diagDollars).toLocaleString()} at stake)` : ''}:

${planItems.map(a => `  • ${a}`).join('\n')}${morePlan}`
    : '';

  // Nothing to say: count looks complete AND no diagnosis findings.
  if (!hasGaps && !hasPlan) {
    return {
      hasGaps: false, hasPlan: false,
      subject: `EOM count — ${storeName}: looks complete`,
      body: `${storeName}: your inventory count shows no outstanding high-value items and the food-cost diagnosis is clean. Nice work — go ahead and finalize.`,
      uncounted: [],
    };
  }

  // Count complete but diagnosis flagged issues (the common OFF-window case) →
  // deliver the action plan on its own instead of an empty "looks complete" note.
  if (!hasGaps && hasPlan) {
    const body =
`${storeName} — EOM food-cost review

Your inventory count looks complete, but the food-cost diagnosis flagged the following to review and correct before this period closes:

${planSection}

Please review each item, correct at the source where you can (recount + resubmit, re-log waste to the right manager/day, approve or reject the transfer), and reply with what you find. Thank you!`;
    return {
      hasGaps: false, hasPlan: true,
      subject: `EOM food-cost — ${storeName}: ${actionItems.length} item${actionItems.length !== 1 ? 's' : ''} to review${diagDollars ? ` (~$${Math.round(diagDollars).toLocaleString()})` : ''}`,
      body,
      uncounted: [],
      totalValue: diagDollars,
      count: actionItems.length,
    };
  }

  // Uncounted high-value items → recount nudge, with the action plan appended when present.
  const items = diag.uncounted.slice(0, maxItems);
  const byClass = diag.byClass.map(c => `${_titleClass(c.cls)}: ${c.count} item${c.count !== 1 ? 's' : ''} (~$${Math.round(c.valueAtRisk).toLocaleString()})`).join(' · ');
  const lines = items.map(u => `  • ${u.descr || u.wrin} — ~$${Math.round(u.valueAtRisk).toLocaleString()} on hand${u.cls ? ` [${_titleClass(u.cls)}]` : ''}`);
  const more = diag.uncountedCount > items.length ? `\n  …and ${diag.uncountedCount - items.length} more.` : '';
  const body =
`${storeName} — EOM count review

Before you finalize, these ${diag.uncountedCount} items (~$${Math.round(diag.uncountedValue).toLocaleString()}) are still showing an old count date. Uncounted ending inventory inflates usage and hurts your food-cost variance, so please physically recount and resubmit them:

${lines.join('\n')}${more}

Summary by class — ${byClass}${hasPlan ? `\n\n${planSection}` : ''}

Recount, resubmit, and reply when done. Thank you!`;
  return {
    hasGaps: true, hasPlan,
    subject: `EOM count — ${storeName}: ${diag.uncountedCount} items need recount (~$${Math.round(diag.uncountedValue).toLocaleString()})`,
    body,
    uncounted: items,
    totalValue: diag.uncountedValue,
    count: diag.uncountedCount,
  };
}

// ── Uncounted-item recommendation text (dispatch #227, District Missing-Items report) ─────────────
// Maps diagnoseIncompleteCount()'s never/early/stale `state` to the exact phrasing already proven
// in buildIncompleteCountMessage()'s body above — not new copy — so a printed all-store report reads
// consistently with the per-store recount nudge the owner already sends.
export const STATE_RECOMMENDATION = {
  never: 'Physically count and submit — no count on record this period.',
  early: 'Recount before close — last count predates the final count window; a cascade error earlier in the count can still be corrected here.',
  stale: 'Verify and deactivate in QSRSoft if no longer sold, or count if still active — no count since a prior period.',
};
export function recommendationForState(state) {
  return STATE_RECOMMENDATION[state] || 'Review this item\'s count status.';
}

function _titleClass(k) {
  return { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product', other: 'Other' }[k] || k;
}

// ── Count-completion notification detection (dispatch #209) ────────────────────
// Generalizes the existing `notified_90` fire-once pattern (scripts/qsrsoft-onhand-pull.mjs —
// overall ~90% "believes done") to PER-CLASS completion, with the owner's exact wait/stale/
// not-started rules (memory/dispatch-209.md, "The exact rules", transcribed verbatim there):
//   1. Food+Condiment are usually counted together — wait for BOTH complete before notifying,
//      UNLESS a long period has passed with only one done (the "stale" timeout), in which case
//      notify anyway showing the stalled class's real status.
//   2. Paper is usually a separate day — the moment it completes, notify (independent trigger),
//      but ALWAYS include current Food/Condiment/Non-Product status in that same notification.
//   3. A class with zero items in the store's catalog is "not applicable" (never a fake 0%); a
//      touched-but-unfinished class is "in progress" with its real %; an untouched class with
//      real items is "not started" — never blank/missing. Every notification names every
//      relevant class's status, not just the trigger class(es).
//   4. Fire-once per store+period+trigger-kind — a later run must never re-notify for the same
//      transition even though the done-flags stay true for the rest of the month.
//
// Pure + asOf-parameterized (no Date.now() coupling) so it is deterministic to unit test. The
// caller (scripts/qsrsoft-onhand-pull.mjs) owns persistence: it must fold `triggerKinds` into
// the store's `notified_classes` marker (and stamp `${cls}_done_at` on first true) when it
// upserts `eom_count_status` — this function only DECIDES, it does not write anything.
export const NOTIFY_STALE_HOURS = 3; // default wait on a stalled Food/Condiment pairing (rule 1)
const NOTIFY_CLASS_KEYS = ['food', 'condiment', 'paper', 'nonproduct'];

// Rule 3's four-way classification for one class, for a notification payload. Never returns a
// fake 0% for a class with no items in the store's catalog — that's "not_applicable", distinct
// from "not_started" (real items, zero counted).
function classNotifyStatus(byClass, k) {
  const b = byClass && byClass[k];
  if (!b || !b.total) return { status: 'not_applicable', pct: null, total: 0, counted: 0 };
  if (b.counted === 0) return { status: 'not_started', pct: 0, total: b.total, counted: 0 };
  if (b.done) return { status: 'complete', pct: b.pct, total: b.total, counted: b.counted };
  return { status: 'in_progress', pct: b.pct, total: b.total, counted: b.counted };
}

// `prevStatus` — the store's PRIOR `eom_count_status` row (about to be overwritten this run):
//   needs `food_done/condiment_done/paper_done/nonproduct_done`, the matching `*_done_at`
//   timestamps, and `notified_classes` (the fire-once marker — an array of trigger-kind strings
//   already fired for this store+period, e.g. `['paper']`).
// `newProgress` — this run's fresh `computeCountProgress()` output.
// Returns `{ shouldNotify:true, triggerClasses, triggerKinds, reasons, classStatuses }` or
// `null` when there is nothing to notify this run (fire-once already consumed every trigger
// that is currently satisfied, or nothing is complete/stale enough yet).
export function detectCountNotifications(prevStatus, newProgress, { staleHours = NOTIFY_STALE_HOURS, asOf = new Date() } = {}) {
  const prev = prevStatus || {};
  const byClass = (newProgress && newProgress.byClass) || {};
  const now = asOf instanceof Date ? asOf : new Date(asOf);

  // Every relevant class's status, always (rule 3) — one shared payload reused by every trigger.
  const classStatuses = {};
  for (const k of NOTIFY_CLASS_KEYS) classStatuses[k] = classNotifyStatus(byClass, k);

  const isDone = k => !!(byClass[k] && byClass[k].done);
  const wasDone = k => !!prev[`${k}_done`];
  // The timestamp to reason about for class k: the stamp already on the prior row if it was
  // already done coming into this run, else "now" if it just flipped true THIS run, else null
  // (not done at all). The actual stamping into `${k}_done_at` is the caller's job (Task 2's
  // schema) — this only reads what the caller already knows plus what just became true.
  const doneAt = k => {
    const stamp = prev[`${k}_done_at`];
    if (stamp) return new Date(stamp);
    return (isDone(k) && !wasDone(k)) ? now : null;
  };
  const alreadyFired = kind => Array.isArray(prev.notified_classes) && prev.notified_classes.includes(kind);

  const firing = []; // { kind, classes, reason }

  // ── Rule 1: Food + Condiment pairing ────────────────────────────────────────
  if (!alreadyFired('food_condiment')) {
    if (isDone('food') && isDone('condiment')) {
      // Both read complete (whether they flipped true in the same run, or one arrived after the
      // other was already done) — fire immediately, no need to wait for the stale timer.
      firing.push({ kind: 'food_condiment', classes: ['food', 'condiment'], reason: 'both_complete' });
    } else if (isDone('food') !== isDone('condiment')) {
      // Exactly one done, the other still isn't — hold off unless the done one has been sitting
      // long enough (owner: "a long period... since it last submitted") that the store likely
      // isn't coming back to finish the pair today. Notify with the stalled class's REAL status
      // (never "not started" just because it's the one holding things up — rule 3 reserves that
      // for a class with zero counted items).
      const doneClass = isDone('food') ? 'food' : 'condiment';
      const at = doneAt(doneClass);
      if (at && (now - at) > staleHours * 3600 * 1000) {
        firing.push({ kind: 'food_condiment', classes: [doneClass], reason: 'stale_timeout' });
      }
    }
  }

  // ── Rule 2: Paper — independent trigger ─────────────────────────────────────
  if (!alreadyFired('paper') && isDone('paper')) {
    firing.push({ kind: 'paper', classes: ['paper'], reason: 'paper_complete' });
  }

  if (!firing.length) return null;

  return {
    shouldNotify: true,
    triggerClasses: [...new Set(firing.flatMap(f => f.classes))],
    triggerKinds: firing.map(f => f.kind),
    reasons: firing.map(f => f.reason),
    classStatuses,
  };
}

// ── Scoreboard row fields (dispatch #227) ───────────────────────────────────────
// The exact Store/State/Count%/FOB%/FOB$ fields eom-dashboard.js's own Scoreboard-tab CSV export
// (`exportCSV`) reads off a `rows` entry — factored out here (an engine file both eom-dashboard.js
// and the new "send to teams" snapshot report, eom-team-snapshot.js, can import without one view
// file importing the other) so the two reports can never drift on these 5 numbers (the "two panels
// disagree on one number" trap CLAUDE.md's Dev Rules calls out). `r` is one entry from
// EOMDashboardPanel's `rows`/`allRows` array (buildStoreStatus-shaped, with `.org`/`.prog`/
// `.fobPct`/`.fob$`/`.name`). Returns raw values (fractions for the two percents), not
// pre-formatted strings — each caller keeps its own display formatting (CSV vs. a printed table).
export function scoreboardRowFields(r) {
  return {
    store: r.name,
    state: r.org === 'emerald' ? 'FL' : 'OK',
    countPct: r.prog.earlyPctCounted ?? r.prog.pctCounted,
    fobPct: r.fobPct,
    fobDollar: r.fob$,
  };
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
