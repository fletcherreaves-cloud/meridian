// @ts-nocheck
// Manual Pull Triggers (owner request 2026-11-16) — composes two existing single-sources-of-
// truth (tolerance-status.js's tol comparison, visit-readiness.js's overdue-visit tracking)
// into "which store, which report" flags, rather than re-deriving either signal. Per this
// repo's "would this verification still pass if reverted" rule, these tests exercise the real
// computeManualPullTriggers() against realistic ds shapes (DEFAULT_TARGETS-anchored, same
// pattern as dispatch-94-phase3-findings.test.js), not a reimplementation of the math.
globalThis.window = globalThis.window || {};
import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS } from '../constants.js';
import { computeManualPullTriggers } from '../engine/manual-pull-triggers.js';
import { TOL_METRICS } from '../engine/tolerance-status.js';
import { overdueThresholdDays } from '../engine/visit-readiness.js';

const LOC = Object.keys(DEFAULT_TARGETS).find(l => DEFAULT_TARGETS[l].tCompWaste > 0);
const COMPW_TOL = TOL_METRICS.find(m => m.id === 'compW').tol;
const past = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const recentDate = () => new Date(Date.now() - 5 * 86400000);

// Minimal non-visit data so computeVisitReadiness includes the store at all (measured: a store
// with ONLY gradedVisits and no other operational stream has wSum===0 and is dropped entirely —
// see computeVisitReadiness's own `if (wSum === 0) continue`).
function baseDs(over = {}) {
  const t = DEFAULT_TARGETS[LOC];
  return { glimpseRows: [{ loc: LOC, date: recentDate(), oepe: t.tOepe }], ...over };
}

describe('computeManualPullTriggers — FOB category (eBOS Purchases)', () => {
  it('flags red when a FOB metric is clearly past tol*2 of its official target', () => {
    const t = DEFAULT_TARGETS[LOC];
    const cur = t.tCompWaste + COMPW_TOL * 3; // red, per tolStatus's tol*2 boundary
    const ds = baseDs({ fobRows: [{ loc: LOC, date: recentDate(), compWaste: cur }] });
    const triggers = computeManualPullTriggers(ds, { locs: [LOC] });
    const hit = triggers.find(x => x.loc === LOC && x.metricId === 'compW');
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('red');
    expect(hit.report).toBe('eBOS Purchases');
    expect(hit.reason).toContain('Comp Waste %');
  });

  it('does not flag a FOB metric comfortably within tolerance', () => {
    const t = DEFAULT_TARGETS[LOC];
    const ds = baseDs({ fobRows: [{ loc: LOC, date: recentDate(), compWaste: t.tCompWaste }] });
    const triggers = computeManualPullTriggers(ds, { locs: [LOC] });
    expect(triggers.find(x => x.metricId === 'compW')).toBeUndefined();
  });
});

describe('computeManualPullTriggers — visit readiness (Forms Completion Report)', () => {
  const threshold = overdueThresholdDays('CFV'); // 242 as measured 2026-11-16

  it('flags yellow when a store is within the 14-day lookahead of its own overdue threshold', () => {
    const daysSinceLast = threshold - 7; // 7 days until due
    const ds = baseDs({ gradedVisits: [{ store: LOC, reportType: 'CFV', dateISO: past(daysSinceLast), score: 90, pass: true }] });
    const hit = computeManualPullTriggers(ds, { locs: [LOC] }).find(x => x.metricId === 'visit_overdue');
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('yellow');
    expect(hit.report).toBe('Forms Completion Report');
    expect(hit.reason).toMatch(/Due for a graded visit within [0-7] day\(s\)/);
  });

  it('flags red when a store is already past its own overdue threshold', () => {
    const daysSinceLast = threshold + 8;
    const ds = baseDs({ gradedVisits: [{ store: LOC, reportType: 'CFV', dateISO: past(daysSinceLast), score: 90, pass: true }] });
    const hit = computeManualPullTriggers(ds, { locs: [LOC] }).find(x => x.metricId === 'visit_overdue');
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('red');
    expect(hit.reason).toMatch(/Overdue for a graded visit by [8-9] day\(s\)/);
  });

  it('does not flag a store whose last visit is well inside the cadence', () => {
    const ds = baseDs({ gradedVisits: [{ store: LOC, reportType: 'CFV', dateISO: past(30), score: 90, pass: true }] });
    expect(computeManualPullTriggers(ds, { locs: [LOC] }).find(x => x.metricId === 'visit_overdue')).toBeUndefined();
  });
});

describe('computeManualPullTriggers — known gap: no POS-Controls trigger yet', () => {
  it('never emits a Security Events trigger, because no pos-category TOL_METRICS entry has an official target', () => {
    // Documents the real constraint this module's own header comment explains: all 4 'pos'
    // metrics (cashOS/tRedB/tRedA/discP) have offKey:null, so TOL_ROLLUP_METRICS excludes them
    // and tolStatusesForStore can never emit a 'pos' status. If this ever starts failing, the
    // gap has been closed upstream — update this module's REPORT_BY_CAT to add it back in.
    const posMetrics = TOL_METRICS.filter(m => m.cat === 'pos');
    expect(posMetrics.every(m => m.offKey == null)).toBe(true);
    const ds = baseDs();
    expect(computeManualPullTriggers(ds, { locs: [LOC] }).some(x => x.report?.includes('Security Events'))).toBe(false);
  });
});

describe('computeManualPullTriggers — sorting', () => {
  it('sorts red triggers before yellow', () => {
    const t = DEFAULT_TARGETS[LOC];
    const ds = baseDs({
      fobRows: [{ loc: LOC, date: recentDate(), compWaste: t.tCompWaste + COMPW_TOL * 3 }], // red
      gradedVisits: [{ store: LOC, reportType: 'CFV', dateISO: past(overdueThresholdDays('CFV') - 7), score: 90, pass: true }], // yellow
    });
    const triggers = computeManualPullTriggers(ds, { locs: [LOC] });
    expect(triggers.length).toBeGreaterThanOrEqual(2);
    expect(triggers[0].severity).toBe('red');
  });
});
