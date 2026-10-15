// @ts-nocheck
// ── Pay raise / review cycle tracking, v1 ─────────────────────────────────────
// Owner, live, 2026-10-15: "We need to have ability to add review cycle dates and effective
// dates for any pay increases earned by employees... This data could be tied to Labor &
// Scheduling tab in store tiles in district view to notate for reason for average rate of pay
// jumping. You should be able to detect that as well from data pulls too... if you can run
// analysis in a report I can pull that shows impact of those raises to labor and profitability."
//
// Same identify -> log -> measure loop as coaching-loop.js (#208), applied to AROP (Average
// Rate Of Pay, metric-source.js's derived `avgRate`) instead of a coached finding:
//   1. detectAropJumps()  — finds a store whose trailing AROP stepped up with no logged reason.
//   2. a pay_events row   — the owner's log entry: effective date, (optional) review date,
//      raise type, $/hr, note. loc-scoped, append-only (no edit path in v1 — a wrong entry gets
//      superseded by a new one, same as this repo's other append-only logs, not overwritten).
//   3. payRaiseImpact()   — a plain before/after snapshot around the effective date (NOT a
//      synthetic-control DiD like the competitive-closure engine — that needs a peer-store
//      control group; AROP has no such control, every store sets its own pay independently).
//
// Deliberately NOT per-employee. qsr_employee_tenure (tenure-roles.js) only covers review-
// eligible management roles (GM/AM/DM/SM) with a usable hourly_pay_rate; hourly crew have no
// per-person roster pulled into Meridian at all (and PII rules bar pulling employeeRoster
// broadly — CLAUDE.md's PII standing rules). AROP is already the store-level aggregate the
// owner is looking at on the Labor & Scheduling tile (labor-tools.js's 'AROP' column) when he
// notices a jump, so a pay event is logged against the STORE, with an optional free-text label
// for who/what drove it ("new crew minimum," "Jane D. review raise," etc.) — not a row in a
// per-employee ledger that doesn't exist yet.
import { metricAvg } from './metric-source.js';
import { lastClosedBusinessDay, addD, dKey } from '../utils/date.js';

export const PAY_EVENT_TYPES = {
  review_raise:       { label: 'Performance Review Raise' },
  minimum_wage:        { label: 'Minimum Wage Adjustment' },
  promotion:           { label: 'Promotion' },
  market_adjustment:   { label: 'Market Rate Adjustment' },
  other:               { label: 'Other' },
};

// Trailing window either side of a comparison. Matches coaching-loop.js's SNAPSHOT_WINDOW_DAYS
// scale (14d) for the same reason — long enough to smooth day-of-week noise, short enough to
// read as a real step change rather than a whole quarter. NOT independently measured for this
// purpose (coaching-loop.js's NOISE_THRESHOLDS table exists because
// scripts/measure-coaching-noise-threshold.mjs was run for 5 specific metrics; avgRate was not
// one of them) — flagged as a judgment call, not presented as derived.
export const AROP_WINDOW_DAYS = 14;

// A rate jump worth flagging for explanation needs to be meaningfully bigger than ordinary
// week-to-week AROP drift (mix shift, a few new hires at a different starting rate, OT mix).
// $0.20/hr over AROP_WINDOW_DAYS is a judgment call, NOT a measured noise threshold — unlike
// coaching-loop.js's NOISE_THRESHOLDS, nobody has run the equivalent measurement for avgRate
// yet. Re-measure and replace this if that changes.
export const AROP_JUMP_THRESHOLD = 0.20;

const unpad = (l) => String(l || '').replace(/^0+/, '') || String(l || '');

function aropWindowAvg(ds, loc, end) {
  const start = addD(end, -(AROP_WINDOW_DAYS - 1));
  return metricAvg(ds, loc, { s: start, e: end }, 'avgRate');
}

/**
 * For each store in `locs`: compare the trailing AROP_WINDOW_DAYS average ending at the last
 * closed business day against the AROP_WINDOW_DAYS window immediately before that. Flags a
 * jump when the increase is >= AROP_JUMP_THRESHOLD AND no logged pay_events row already
 * explains it (an effective_date inside the combined lookback window) — so a jump that already
 * has a logged reason doesn't keep re-flagging every day.
 *
 * Only ever flags an INCREASE (a raise), never a drop — a falling AROP is a staffing-mix
 * question (fewer tenured/higher-rated hours scheduled), not a "did we give a raise" one, and
 * mixing the two into one detector would blur what this is actually for.
 */
export function detectAropJumps(ds, locs, payEvents = [], asOf = null) {
  if (!ds) return [];
  const end = lastClosedBusinessDay(asOf ? new Date(asOf) : undefined);
  const prevEnd = addD(end, -AROP_WINDOW_DAYS);
  const lookbackStartKey = dKey(addD(end, -(AROP_WINDOW_DAYS * 2 - 1)));
  const endKey = dKey(end);
  const out = [];
  for (const loc of (locs || [])) {
    const cur = aropWindowAvg(ds, loc, end);
    const prev = aropWindowAvg(ds, loc, prevEnd);
    if (cur == null || prev == null) continue;
    const delta = cur - prev;
    if (delta < AROP_JUMP_THRESHOLD) continue;
    const explained = (payEvents || []).some(e => e && unpad(e.loc) === unpad(loc)
      && e.effectiveDate >= lookbackStartKey && e.effectiveDate <= endKey);
    if (explained) continue;
    out.push({ loc: unpad(loc), current: cur, prior: prev, delta });
  }
  return out.sort((a, b) => b.delta - a.delta);
}

/**
 * Plain before/after snapshot around a logged pay event's effective date — a trailing
 * AROP_WINDOW_DAYS window ending the day before effective_date, vs a leading AROP_WINDOW_DAYS
 * window starting on effective_date. `ready` is false (and the "after" fields reflect a
 * SHORTER, still-in-progress window) until AROP_WINDOW_DAYS have actually elapsed since
 * effective_date — same "don't grade an incomplete window as final" discipline coaching-loop.js
 * enforces via dueForReview/reviewAt, just inline here since there's no separate review step.
 */
export function payRaiseImpact(ds, payEvent, asOf = null) {
  const loc = payEvent.loc;
  const eff = payEvent.effectiveDate;
  const today = dKey(asOf ? new Date(asOf) : new Date());
  const beforeEnd = addD(new Date(eff + 'T00:00:00'), -1);
  const beforeRange = { s: addD(beforeEnd, -(AROP_WINDOW_DAYS - 1)), e: beforeEnd };

  const afterStart = new Date(eff + 'T00:00:00');
  const fullAfterEndKey = dKey(addD(afterStart, AROP_WINDOW_DAYS - 1));
  const ready = fullAfterEndKey <= today;
  const afterEnd = ready ? new Date(fullAfterEndKey + 'T00:00:00') : lastClosedBusinessDay(asOf ? new Date(asOf) : undefined);
  const afterRange = { s: afterStart, e: afterEnd };

  const aropBefore = metricAvg(ds, loc, beforeRange, 'avgRate');
  const aropAfter = metricAvg(ds, loc, afterRange, 'avgRate');
  const laborPctBefore = metricAvg(ds, loc, beforeRange, 'laborPct');
  const laborPctAfter = metricAvg(ds, loc, afterRange, 'laborPct');
  const actHrsAfter = metricAvg(ds, loc, afterRange, 'actHrs');
  const salesBefore = metricAvg(ds, loc, beforeRange, 'sales');
  const salesAfter = metricAvg(ds, loc, afterRange, 'sales');

  const aropDelta = (aropBefore != null && aropAfter != null) ? aropAfter - aropBefore : null;
  // actHrsAfter is a mean DAILY hours figure (metricAvg's own convention) — x7 to annualize
  // weekly, matching labor-tools.js's own OT-cost-style "hrs/day x days" scaling idiom.
  const weeklyLaborDollarImpact = (aropDelta != null && actHrsAfter != null) ? aropDelta * actHrsAfter * 7 : null;
  const annualizedLaborDollarImpact = weeklyLaborDollarImpact != null ? weeklyLaborDollarImpact * 52 : null;
  const laborPctDeltaPP = (laborPctBefore != null && laborPctAfter != null) ? (laborPctAfter - laborPctBefore) * 100 : null;

  return {
    loc: unpad(loc), ready,
    aropBefore, aropAfter, aropDelta,
    laborPctBefore, laborPctAfter, laborPctDeltaPP,
    salesBefore, salesAfter,
    weeklyLaborDollarImpact, annualizedLaborDollarImpact,
  };
}
