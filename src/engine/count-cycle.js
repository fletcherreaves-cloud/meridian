// @ts-nocheck
// ── Count-cycle compliance ───────────────────────────────────────────────────
// Notes 58 #1. The owner's rules, verbatim:
//   · every WEEKLY count requires a full FOOD and CONDIMENT count — 2 classes every week
//   · PAPER is mandatory on the MID-MONTH count, which FLOATS (its day-of-week depends
//     on when each store chooses to count)
//   · a missed mid-month paper count must be FLAGGED so it's completed ASAP, or on the
//     next weekly count at the latest
//
// ── WHY THIS READS qsr_onhand AND NOT qsr_raw_item_detail ───────────────────
// The existing cadence engine (weekly-cadence.js) reads `qsr_raw_item_detail`, whose
// live class coverage for 2026-07 is {F: 573, P: 122} — ZERO Condiment rows across all
// 27 stores. That table is written by the variance pull, which only keeps the top ~20
// WRINs by |$| over a $50 threshold. Condiments are low-dollar so they are never
// selected. "Did they count Condiment?" is therefore unanswerable there, by design.
//
// That $50 filter is CORRECT for what it was built for — variance diagnosis, where
// anything smaller isn't chased. It's simply the wrong source for a completeness
// question. Two different questions, two different sources:
//     "what went wrong and where did it go"  → qsr_raw_item_detail (top-$ variances)
//     "did they complete the required count" → qsr_onhand (full item universe)
//
// qsr_onhand carries the whole universe — verified live {Food:510, Paper:305,
// Condiment:140, Non-Product:45} — with per-item last_counted / last_submitted dates.
//
// ── KNOWN LIMITATION, stated plainly ────────────────────────────────────────
// qsr_onhand upserts on (loc, period, wrin), so `last_counted` is ROLLING LATEST STATE,
// not an event log. Each new count of an item overwrites the previous date. So this can
// answer "when was the last complete weekly count, and was it complete" but CANNOT
// answer "were all four weekly counts complete last month" — the earlier ones have been
// overwritten. Building real history needs the daily snapshot to record per-class counted
// dates (eom_count_progress_log has the right shape but currently measures percentages
// against an EOM-only window, so a mid-month count reads 0%).

export const CLASSES = ['Food', 'Condiment', 'Paper', 'Non-Product'];
export const WEEKLY_CLASSES = ['Food', 'Condiment'];

// A class counts as "covered" in a session when at least this share of that store's
// item universe for the class was touched.
//
// MEASURED, not guessed. Across 158 class-sessions in the live 2026-08 snapshot the
// coverage ratio is sharply bimodal:
//     0.0-0.1  → 69 sessions   (spot checks, 1-2 items)
//     0.1-0.8  →  6 sessions   (a near-empty gap)
//     0.8-1.0  → 77 sessions   (real cycle counts)
// 0.75 sits inside that gap and above the scattered middle. An earlier 0.5 pulled in
// four ~50% sessions that are genuinely partial counts, not full ones.
export const COVER_FRAC = 0.75;
// Days after which a store with no qualifying weekly count is overdue. 7 + grace,
// because the count day floats.
export const WEEKLY_DUE_DAYS = 9;

const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');
const dOnly = (d) => {
  if (!d) return null;
  // Accept a Date (what loadQsrOnHand returns) or an ISO string (what the pull script and
  // raw REST return). Getting this wrong is silent: the engine would find no dates and
  // report every store as never-counted.
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};
/** Read the count date from either the DB shape (last_counted) or the app shape (lastCounted). */
const countedOf = (r) => dOnly(r.last_counted != null ? r.last_counted : r.lastCounted);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

/** Last calendar day of the month a YYYY-MM-DD falls in. */
export function lastDayOf(dateStr) {
  const [y, m] = String(dateStr).split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Is this date inside the end-of-month close window? */
export function inCloseWindow(dateStr, closeDays = 4) {
  const day = Number(String(dateStr).slice(8, 10));
  return day > lastDayOf(dateStr) - closeDays;
}

// #357-B2/3 — the denominator (classTotals / `totals` below) must be ACTIVE items, never
// "counted recently" (that's circular — it would make a store's own count history define
// what counts as required, which the owner explicitly forbade). Measured via a live
// DUMP_RAW_FIELDS probe (2026-08-17, 7127 items): the On-Hand API's active_in_recipe flag
// really does vary (1: 4807, 0: 2320 — not a constant), so it's a genuine, independent
// status signal, not a "counted recently" proxy in disguise. `r.active !== false` treats
// missing/null (rows pulled before this column existed, or a store whose current pull
// hasn't landed yet) as active, so this is a no-op on data that predates the column.
//
// Dispatch16 (#374 KB verification, 2026-08-18) — active=false alone is not "safe to
// exclude": the QSRSoft KB distinguishes Topic 3 ("not in any recipe, inventory > 0" —
// legacy/obsolete, correctly excluded) from Topic 6 ("not active but part of an ACTIVE
// recipe" — still real to-count work). Measured live: of 2316 active=false items, 144
// (6.2%) are recipeItem=true — genuine Topic 6, spread across 23/27 stores. `r.recipeItem
// === true` rescues exactly those, regardless of the active flag — an item still living in
// an active recipe is real work even if QSRSoft's own active_in_recipe flag says otherwise.
const isActive = (r) => r.active !== false || r.recipeItem === true;

/**
 * Group on-hand rows into count SESSIONS — one per (store, last_counted date) — with a
 * per-class item count and the store's ACTIVE class universe for comparison.
 * `rows`: [{ loc, cls, wrin, last_counted, last_submitted, active }]
 */
export function detectSessions(rows = []) {
  const totals = {};      // loc → cls → ACTIVE universe size
  const byDate = {};      // loc → date → cls → n (counted ACTIVE items)
  for (const r of (rows || [])) {
    if (!r || !r.cls || !isActive(r)) continue;
    const loc = unpad(r.loc);
    (totals[loc] || (totals[loc] = {}));
    totals[loc][r.cls] = (totals[loc][r.cls] || 0) + 1;
    const d = countedOf(r);
    if (!d) continue;
    ((byDate[loc] || (byDate[loc] = {}))[d] || (byDate[loc][d] = {}));
    byDate[loc][d][r.cls] = (byDate[loc][d][r.cls] || 0) + 1;
  }

  const out = {};
  for (const loc of Object.keys(byDate)) {
    out[loc] = Object.keys(byDate[loc]).sort().map(date => {
      const counts = byDate[loc][date];
      const n = Object.values(counts).reduce((a, b) => a + b, 0);
      // Dispatch20 §3 investigation, 2026-08-18 — a class with ZERO active items in this
      // store's own universe is trivially "covered": there is nothing to count, so it can
      // never gate compliance. The prior `(totals[loc][c] || Infinity) * COVER_FRAC` fell
      // through to Infinity for exactly that case, making the class permanently
      // uncoverable regardless of what the store actually does — a real, structural bug,
      // not a stale-feed artifact (re-graded against several asOf dates, all showed the
      // same 27/27 crit; only a genuine logic bug produces that, per CLAUDE.md's own
      // "measure before theorizing" standard). Measured live: 967/978 (98.9%) of ALL
      // Condiment-class rows district-wide read active=false (none Topic-6-rescued),
      // leaving 17/27 stores with a totals[loc].Condiment of 0 or undefined — their
      // Food+Condiment weekly requirement was mathematically impossible to satisfy no
      // matter how well they counted. Full writeup: memory/count-cycle-condiment-bug-2026-08-18.md.
      const covered = CLASSES.filter(c => {
        const universe = totals[loc][c] || 0;
        if (universe === 0) return true;
        return (counts[c] || 0) > 0 && (counts[c] || 0) >= universe * COVER_FRAC;
      });
      const q = sessionQualities(date, covered, n);
      // #357-A — touchedWeeklyClasses is independent of `covered` (which requires
      // COVER_FRAC): a Paper-only session touches ZERO Food/Condiment items, so it must
      // never be mistaken for a partial/botched weekly attempt (#357-B1) even though it
      // can still fail to reach `satisfiesWeekly`.
      const touchedWeeklyClasses = (counts.Food || 0) > 0 || (counts.Condiment || 0) > 0;
      return { loc, date, counts, n, covered, touchedWeeklyClasses,
        ...q, kind: sessionLabel(q) };
    });
  }
  return { sessions: out, classTotals: totals };
}

/**
 * #357-A — a session has INDEPENDENT qualities, not one mutually-exclusive `kind`. The
 * original if/else chain returned on the first match, so a session that satisfied BOTH
 * the weekly requirement (Food+Condiment) and the mid-month-paper requirement (Paper,
 * outside the close window) was stamped only 'mid-paper' and the weekly check never ran
 * — the exact bug that graded Marietta's 2026-08-11 session (Cond✓ Food✓ Pape✓) as if it
 * never satisfied a weekly count at all, because `lastWeekly` only matched kind==='weekly'.
 *
 *   satisfiesWeekly   — Food AND Condiment both covered (the owner's weekly rule)
 *   satisfiesMidPaper — Paper covered, OUTSIDE the close window (the floating mid-month count)
 *   isEom             — a large count (n>=50) INSIDE the close window, covering Paper —
 *                        the close-window count that covers Paper is EOM, not mid-paper
 *   isPartial/isSpot  — display-only buckets for a session that satisfies none of the
 *                        above; never consulted for compliance, only for the session label
 *                        and (isPartial) as the substantial-but-incomplete signal B1 gates on.
 */
export function sessionQualities(date, covered, n) {
  const has = (c) => covered.includes(c);
  const eomWindow = inCloseWindow(date);
  const satisfiesWeekly = has('Food') && has('Condiment');
  const satisfiesMidPaper = has('Paper') && !eomWindow;
  const isEom = eomWindow && has('Paper') && n >= 50;
  const satisfiesAny = satisfiesWeekly || satisfiesMidPaper || isEom;
  return {
    satisfiesWeekly, satisfiesMidPaper, isEom,
    isPartial: !satisfiesAny && n >= 25,
    isSpot: !satisfiesAny && n < 25,
  };
}

/** Human-readable label derived from the qualities — for display ONLY, never for grading.
 *  A session can legitimately earn more than one label, e.g. "Weekly + Mid-Month Paper"
 *  (Marietta's 2026-08-11 session — the exact case #357-A was filed over). */
export function sessionLabel(q) {
  const parts = [];
  if (q.isEom) parts.push('End of month');
  if (q.satisfiesWeekly) parts.push('Weekly');
  if (q.satisfiesMidPaper) parts.push('Mid-month paper');
  if (parts.length) return parts.join(' + ');
  return q.isPartial ? 'Partial' : 'Spot check';
}

/**
 * Per-store compliance against the owner's rules, as of `asOf` (YYYY-MM-DD).
 * Returns one row per store with the specific exceptions to act on.
 */
export function cycleCompliance(rows = [], { asOf = null } = {}) {
  const today = dOnly(asOf) || new Date().toISOString().slice(0, 10);
  const { sessions, classTotals } = detectSessions(rows);
  const month = today.slice(0, 7);

  return Object.keys(sessions).sort().map(loc => {
    const all = sessions[loc];
    // #357-A — was s.kind !== 'spot'; kind was a single mutually-exclusive label so a
    // session satisfying multiple qualities (weekly AND mid-paper) collapsed to whichever
    // the if/else chain hit first. Now every consumer below reads the independent flags.
    const cycles = all.filter(s => !s.isSpot);
    const lastWeekly = [...all].reverse().find(s => s.satisfiesWeekly || s.isEom) || null;
    const lastAny = cycles.length ? cycles[cycles.length - 1] : null;
    // A partial session more recent than the last good weekly is the actionable case:
    // they counted, but not completely.
    const lastPartial = [...all].reverse().find(s => s.isPartial) || null;

    const daysSinceWeekly = lastWeekly ? daysBetween(lastWeekly.date, today) : null;
    const overdue = daysSinceWeekly == null || daysSinceWeekly > WEEKLY_DUE_DAYS;

    // Mid-month paper: has a non-EOM paper count happened this month?
    const paperThisMonth = all.some(s => s.date.slice(0, 7) === month && s.satisfiesMidPaper);
    const dayNum = Number(today.slice(8, 10));
    const lastDay = lastDayOf(today);
    // Only meaningful once the month is far enough along to expect it, and it stops being
    // "missed" once the EOM count would cover paper anyway.
    const paperExpected = dayNum >= 12 && dayNum <= lastDay - 4;
    const paperMissing = paperExpected && !paperThisMonth;

    const exceptions = [];
    if (overdue) exceptions.push({
      rule: 'weekly-overdue', severity: 'crit',
      detail: daysSinceWeekly == null
        ? 'No complete weekly count on record'
        : `${daysSinceWeekly} days since the last complete Food + Condiment count`,
    });
    // #357-B1 — was: any partial session newer than the last weekly fires this warning,
    // even a session that never touched Food or Condiment at all (e.g. a pure Paper
    // count). Tecumseh counted Food+Condiment completely on 08-14, then counted Paper on
    // 08-15 — the 08-15 session was never a weekly attempt, so it must not be graded as
    // a botched one. Gated on touchedWeeklyClasses: the session actually included at
    // least one Food or Condiment item.
    else if (lastPartial && lastWeekly && lastPartial.date > lastWeekly.date && lastPartial.touchedWeeklyClasses) {
      const missing = WEEKLY_CLASSES.filter(c => !lastPartial.covered.includes(c));
      exceptions.push({
        rule: 'weekly-incomplete', severity: 'warn',
        detail: `Counted ${lastPartial.date} but ${missing.join(' and ')} not fully counted — every weekly count needs Food and Condiment`,
      });
    }
    if (paperMissing) exceptions.push({
      rule: 'mid-month-paper', severity: 'warn',
      detail: 'No mid-month Paper count yet this period — complete it ASAP, or on the next weekly count at the latest',
    });

    return {
      loc, sessions: all, classTotals: classTotals[loc] || {},
      perClass: perClassCounted(all, classTotals[loc] || {}),
      lastWeekly, lastAny, lastPartial, daysSinceWeekly,
      paperThisMonth, paperMissing, overdue,
      exceptions,
      status: exceptions.some(e => e.severity === 'crit') ? 'crit'
            : exceptions.length ? 'warn' : 'ok',
    };
  });
}

// #357-5 — "counted / active per class" for the panel rows. `counted` is the item count
// from the MOST RECENT session that touched the class at all (not necessarily a session
// that satisfied any rule) — the most current read on where that class's count stands,
// independent of the weekly/mid-paper grading above. `active` is the same ACTIVE-only
// denominator as classTotals (#357-B2/3), so a store showing "36/36 Condiment" means every
// active Condiment item, not every WRIN the API has ever returned for that store.
function perClassCounted(sessions, classTotals) {
  const out = {};
  for (const cls of CLASSES) {
    let counted = 0, date = null;
    for (const s of sessions) {
      if ((s.counts[cls] || 0) > 0) { counted = s.counts[cls]; date = s.date; }
    }
    out[cls] = { active: classTotals[cls] || 0, counted, date };
  }
  return out;
}

/** District rollup for a tile header. */
export function cycleSummary(compliance = []) {
  const s = { stores: compliance.length, ok: 0, warn: 0, crit: 0, paperMissing: 0, overdue: 0 };
  for (const c of compliance) {
    s[c.status] = (s[c.status] || 0) + 1;
    if (c.paperMissing) s.paperMissing++;
    if (c.overdue) s.overdue++;
  }
  return s;
}
