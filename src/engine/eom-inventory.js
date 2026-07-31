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
    acc[loc] = { sales, comp, raw, cond, emp, statv, unex, fob, fobPct: sales ? fob / sales : null, asOf: latest[loc].key };
  }
  return acc;
}

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
export function diagnoseIncompleteCount(onHandRows, { period, asOf, minValue = 0, acceptEarly = false } = {}) {
  const rows = Array.isArray(onHandRows) ? onHandRows : [];
  const windowStart = period ? countWindowStart(period) : new Date(0);
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
  // Count-date exception: the store's early count was approved as its EOM count → early-counted items
  // are accepted (dropped from the uncounted/flagged set). Stale/never are unaffected.
  if (acceptEarly) uncounted = uncounted.filter(u => u.state !== 'early');
  // Tally by state so callers can separate true blanks from counted-early / obsolete-inactive items.
  const byState = { never: { n: 0, value: 0 }, early: { n: 0, value: 0 }, stale: { n: 0, value: 0 } };
  for (const u of uncounted) { const b = byState[u.state]; if (b) { b.n++; b.value += u.valueAtRisk; } }

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

function _titleClass(k) {
  return { food: 'Food', condiment: 'Condiment', paper: 'Paper', nonproduct: 'Non-Product', other: 'Other' }[k] || k;
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
