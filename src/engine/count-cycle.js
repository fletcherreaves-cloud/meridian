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
const dOnly = (d) => (d ? String(d).slice(0, 10) : null);
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

/**
 * Group on-hand rows into count SESSIONS — one per (store, last_counted date) — with a
 * per-class item count and the store's class universe for comparison.
 * `rows`: [{ loc, cls, wrin, last_counted, last_submitted }]
 */
export function detectSessions(rows = []) {
  const totals = {};      // loc → cls → universe size
  const byDate = {};      // loc → date → cls → n
  for (const r of (rows || [])) {
    if (!r || !r.cls) continue;
    const loc = unpad(r.loc);
    (totals[loc] || (totals[loc] = {}));
    totals[loc][r.cls] = (totals[loc][r.cls] || 0) + 1;
    const d = dOnly(r.last_counted);
    if (!d) continue;
    ((byDate[loc] || (byDate[loc] = {}))[d] || (byDate[loc][d] = {}));
    byDate[loc][d][r.cls] = (byDate[loc][d][r.cls] || 0) + 1;
  }

  const out = {};
  for (const loc of Object.keys(byDate)) {
    out[loc] = Object.keys(byDate[loc]).sort().map(date => {
      const counts = byDate[loc][date];
      const n = Object.values(counts).reduce((a, b) => a + b, 0);
      const covered = CLASSES.filter(c =>
        (counts[c] || 0) > 0 && (counts[c] || 0) >= (totals[loc][c] || Infinity) * COVER_FRAC);
      return { loc, date, counts, n, covered, kind: sessionKind(date, covered, n) };
    });
  }
  return { sessions: out, classTotals: totals };
}

/**
 * What kind of count this was.
 *   eom       — in the close window and covering Food+Condiment+Paper
 *   mid-paper — Paper covered OUTSIDE the close window. Paper is only counted mid-month
 *               and at EOM, so a non-EOM paper count IS the mid-month count.
 *   weekly    — Food and Condiment both covered
 *   partial   — a real session that failed to cover the weekly classes
 *   spot      — a handful of items; not a cycle count
 */
export function sessionKind(date, covered, n) {
  const has = (c) => covered.includes(c);
  const eomWindow = inCloseWindow(date);
  // EOM: a large count inside the close window. Requires Paper, because Paper is only
  // counted mid-month and at close — that is what separates it from a weekly.
  if (eomWindow && has('Paper') && n >= 50) return 'eom';
  if (has('Paper') && !eomWindow) return 'mid-paper';
  if (has('Food') && has('Condiment')) return 'weekly';
  if (n >= 25) return 'partial';
  return 'spot';
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
    const cycles = all.filter(s => s.kind !== 'spot');
    const lastWeekly = [...all].reverse().find(s => s.kind === 'weekly' || s.kind === 'eom') || null;
    const lastAny = cycles.length ? cycles[cycles.length - 1] : null;
    // A partial session more recent than the last good weekly is the actionable case:
    // they counted, but not completely.
    const lastPartial = [...all].reverse().find(s => s.kind === 'partial') || null;

    const daysSinceWeekly = lastWeekly ? daysBetween(lastWeekly.date, today) : null;
    const overdue = daysSinceWeekly == null || daysSinceWeekly > WEEKLY_DUE_DAYS;

    // Mid-month paper: has a non-EOM paper count happened this month?
    const paperThisMonth = all.some(s => s.date.slice(0, 7) === month && s.kind === 'mid-paper');
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
    else if (lastPartial && lastWeekly && lastPartial.date > lastWeekly.date) {
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
      lastWeekly, lastAny, lastPartial, daysSinceWeekly,
      paperThisMonth, paperMissing, overdue,
      exceptions,
      status: exceptions.some(e => e.severity === 'crit') ? 'crit'
            : exceptions.length ? 'warn' : 'ok',
    };
  });
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
