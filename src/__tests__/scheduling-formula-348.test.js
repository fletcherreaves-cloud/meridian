// @ts-nocheck
// #348 — the Scheduling (Opportunity) panel computed Need/Scheduled hours and Labor %
// from schedRows with its own private formulas that disagreed with engine/schedule-
// summary.js's (reconciled, tested-against-LifeLenz) versions on the SAME rows. This
// fixture is the exact real production data the owner reported the bug against —
// Duncan (loc 0029760), LifeLenz week of Aug 12 2026 (Wed–Tue), pulled live from
// Supabase lifelenz_schedule on 2026-08-16 — not a hand-built or rounded example.
//
// The old formulas (needHrs = needVLH+fixGuideHrs, schedHrs = schVLH+schFixHrs, both
// omitting Floor hours; avgLaborPct = plain mean of daily labor%, no band) are
// reproduced INLINE below, exactly as they read pre-fix, so this test discriminates:
// it fails if the real exports (schedHrsOf/fcstHrsOf/normLaborPct) are reverted to
// those private reimplementations, per the standing "would this still pass if my
// change were reverted?" rule (memory/feedback-measure-dont-reason.md, Half 7).
import { describe, it, expect } from 'vitest';
import { schedHrsOf, fcstHrsOf } from '../engine/schedule-summary.js';
import { wAvgLaborPct } from '../views/scheduling.js';

const WEEK = [
  { loc: '0029760', date: '2026-08-12', sales: 15413.1, laborPct: 22.09, projVLH: 189.5, schVLH: 250,   needVLH: 183.25, fixGuideHrs: null, schFixHrs: 49,    projFloor: 30.75, schFloor: 18 },
  { loc: '0029760', date: '2026-08-13', sales: 13953.3, laborPct: 24.94, projVLH: 192.25, schVLH: 270.5, needVLH: 161.25, fixGuideHrs: null, schFixHrs: 57,    projFloor: 30.5,  schFloor: 18 },
  { loc: '0029760', date: '2026-08-14', sales: 15587.5, laborPct: 23.59, projVLH: 206.25, schVLH: 278,   needVLH: 181.75, fixGuideHrs: null, schFixHrs: 61.5,  projFloor: 32.75, schFloor: 18 },
  { loc: '0029760', date: '2026-08-15', sales: 15803.8, laborPct: 22.71, projVLH: 199.75, schVLH: 286,   needVLH: 178.25, fixGuideHrs: null, schFixHrs: 55.5,  projFloor: 30.75, schFloor: 18 },
  // The current (partial) business day: labor has accrued, the day's sales haven't
  // landed — 4493.32% is exactly the garbage a naive mean can't filter out.
  { loc: '0029760', date: '2026-08-16', sales: 22.46,   laborPct: 4493.32, projVLH: 176, schVLH: 251.5, needVLH: 0.75,   fixGuideHrs: null, schFixHrs: 45,    projFloor: 27.75, schFloor: 18 },
  // Future days already on the schedule — no actuals yet.
  { loc: '0029760', date: '2026-08-17', sales: null, laborPct: null, projVLH: 181, schVLH: 248,    needVLH: null, fixGuideHrs: null, schFixHrs: 45,    projFloor: 29.25, schFloor: 17.5 },
  { loc: '0029760', date: '2026-08-18', sales: null, laborPct: null, projVLH: 185, schVLH: 248.25, needVLH: null, fixGuideHrs: null, schFixHrs: 58.25, projFloor: 29.5,  schFloor: 18 },
];

// The private formulas scheduling.js used before #348 — omits schFloor/projFloor
// entirely, and reads needVLH instead of projVLH for the forecast leg.
const oldSchedHrs = r => (r.schVLH || 0) + (r.schFixHrs || 0);
const oldNeedHrs  = r => (r.needVLH || 0) + (r.fixGuideHrs || 0);
const oldAvgLaborPct = rows => rows.reduce((s, r) => s + (r.laborPct || 0), 0) / (rows.length || 1);

describe('#348 — Scheduling panel Need/Scheduled/Labor% now match schedule-summary.js', () => {
  it('Scheduled hours: schedHrsOf sums to 2329 (owner-reported correct value), not the 2204 the old formula gave', () => {
    const total = WEEK.reduce((s, r) => s + schedHrsOf(r), 0);
    expect(total).toBeCloseTo(2329, 0);
    const oldTotal = WEEK.reduce((s, r) => s + oldSchedHrs(r), 0);
    expect(oldTotal).toBeCloseTo(2203.5, 1); // ≈2204 — the old, wrong, floor-omitting total
    expect(total).not.toBeCloseTo(oldTotal, 0);
  });

  it('Forecast/Need hours: fcstHrsOf sums to 1541 (owner-reported correct value), not the 705 the old formula gave', () => {
    const total = WEEK.reduce((s, r) => s + fcstHrsOf(r), 0);
    expect(total).toBeCloseTo(1541, 0);
    const oldTotal = WEEK.reduce((s, r) => s + oldNeedHrs(r), 0);
    expect(oldTotal).toBeCloseTo(705.25, 1); // ≈705 — needVLH instead of projVLH, no floor
    expect(total).not.toBeCloseTo(oldTotal, 0);
  });

  it('Labor %: wAvgLaborPct is dollar-weighted and band-filtered — the partial day cannot poison a 7-day mean into 655%', () => {
    const fixed = wAvgLaborPct(WEEK);
    // Real value, banded + dollar-weighted over the 4 completed days only.
    expect(fixed).toBeCloseTo(23.29, 1);
    expect(fixed).toBeGreaterThan(15);
    expect(fixed).toBeLessThan(35); // any real weekly labor % lives well under 70

    const old = oldAvgLaborPct(WEEK);
    expect(old).toBeCloseTo(655.24, 1); // the exact number the owner reported
    expect(fixed).not.toBeCloseTo(old, -1); // not remotely the same order of magnitude
  });
});
