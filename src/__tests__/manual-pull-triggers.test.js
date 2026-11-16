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

describe('computeManualPullTriggers — Security Events (register-audit.js target-aware flags)', () => {
  // RESOLVED 2026-11-16 (owner follow-up): tolerance-status.js's own 'pos' category still can
  // never produce a tol status (every TOL_METRICS 'pos' entry has offKey:null — still true,
  // asserted below so a future edit there is caught) — but that was never the only path. This
  // trigger reuses register-audit.js's computeTargetAwareRegisterFlags directly instead, which
  // already flags egregious/repetitive Cash O/S/T-Red/POS-Over/Refund deviations against the
  // real per-store DEFAULT_TARGETS values.
  it('tolerance-status.js pos category still has no official target (sanity check for the comment above)', () => {
    const posMetrics = TOL_METRICS.filter(m => m.cat === 'pos');
    expect(posMetrics.every(m => m.offKey == null)).toBe(true);
  });

  it('flags red when an employee racks up 2+ egregious Register Audit metrics in the recent window', () => {
    const t = DEFAULT_TARGETS[LOC];
    expect(t.tRedAPct).not.toBeNull();
    const auditRows = [{
      emp: 'Test Employee', loc: LOC, date: recentDate(), drawerSales: 1000,
      tRedADollar: 1000 * (t.tRedAPct + 0.02), // ~2pp over target -- comfortably past the egregious floor
      cashOSDollar: 1000 * ((t.tCashOSPct || 0) + 0.02),
      tRedBDollar: 0, posOverAmt: 0, refundCash: 0, refundCashless: 0,
    }];
    const ds = baseDs({ auditRows });
    const hit = computeManualPullTriggers(ds, { locs: [LOC] }).find(x => x.metricId === 'register_audit_flags');
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('red');
    expect(hit.report).toContain('Security Events');
    expect(hit.reason).toContain('1 employee(s)');
  });

  it('does not flag a store whose Register Audit rows are all comfortably on target', () => {
    const t = DEFAULT_TARGETS[LOC];
    const auditRows = [{
      emp: 'Test Employee', loc: LOC, date: recentDate(), drawerSales: 1000,
      tRedADollar: 1000 * t.tRedAPct, cashOSDollar: 1000 * (t.tCashOSPct || 0),
      tRedBDollar: 1000 * t.tRedBPct, posOverAmt: 1000 * t.tPosOverPct, refundCash: 1000 * t.tRefundPct, refundCashless: 0,
    }];
    const ds = baseDs({ auditRows });
    expect(computeManualPullTriggers(ds, { locs: [LOC] }).find(x => x.metricId === 'register_audit_flags')).toBeUndefined();
  });

  it('an official-target override actually changes the outcome (the bug register-audit.js fixed, exercised end-to-end)', () => {
    const t = DEFAULT_TARGETS[LOC];
    const dayPct = t.tRedAPct + 0.02; // would be egregious against the real DEFAULT_TARGETS value
    const auditRows = [{
      emp: 'Test Employee', loc: LOC, date: recentDate(), drawerSales: 1000,
      tRedADollar: 1000 * dayPct, cashOSDollar: 0, tRedBDollar: 0, posOverAmt: 0, refundCash: 0, refundCashless: 0,
    }];
    // Without an override: egregious, flags.
    const dsNoOverride = baseDs({ auditRows });
    expect(computeManualPullTriggers(dsNoOverride, { locs: [LOC] }).find(x => x.metricId === 'register_audit_flags')).toBeTruthy();
    // ds.targets[loc] override raises the T-Red After target to match the actual day -- same
    // merge chain tolMergedTarget already gives every other consumer (UnifiedTargetsPanel, Smart
    // Targets); register-audit.js used to ignore this entirely before the 2026-11-16 fix.
    const dsWithOverride = baseDs({ auditRows, targets: { [LOC]: { tRedAPct: dayPct } } });
    expect(computeManualPullTriggers(dsWithOverride, { locs: [LOC] }).find(x => x.metricId === 'register_audit_flags')).toBeUndefined();
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
