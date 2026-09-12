// @vitest-environment happy-dom
// @ts-nocheck
// Follow-on to dispatch #231 / memory/finding-ecosure-propel-api-2026-08-22.md (2026-09-12):
// that finding measured the waste/variance proxy near-uncorrelated with real EcoSure outcomes
// (Spearman r=0.07, n=240; backtestFoodSafetyProxy, already covered by visit-readiness.test.js)
// and, worse, found a live counterexample -- Ardmore-Broadway flagged "elevated" by the proxy
// while its real EcoSure audit scored 86/100 and passed clean. Its explicit instruction: use
// the real result to REPLACE the proxy when one is available, not just calibrate against it.
//
// This tests that computeVisitReadiness's LIVE fsFlag (not just the offline backtest) actually
// does that -- both directions: a real pass must override a bad proxy reading, AND a real
// critical must override a good one (the flip side the finding explicitly warns must never be
// hidden behind good pooled numbers). Per the standing "would this verification still pass if
// reverted" rule, the last test renders the ACTUAL VisitReadinessPanel, not just the engine.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeVisitReadiness, READINESS_GAPS, overdueThresholdDays } from '../engine/visit-readiness.js';
import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Same fixture shape as visit-readiness.test.js's goodRows()/badRows()/mkDs().
const GOOD = '3708';
const recent = n => new Date(Date.now() - n * 864e5);
function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 0.7, rawWaste: t.tRawWaste * 0.7, statVar: t.tStatLoss * 0.7 }],
  };
}
function badRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpse: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    ops: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    labor: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
    sched: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
    // Only the waste-proxy legs are bad -- isolates the food-safety flag from the operational
    // composite, same way visit-readiness.test.js's badRows() does for its own scenarios.
    fob: [{ loc, date: recent(10), compWaste: t.tCompWaste * 4, rawWaste: t.tRawWaste * 4, statVar: t.tStatLoss * 4 }],
  };
}
function mkDs(loc, rows, gradedVisits = []) {
  return {
    glimpseRows: rows.glimpse, opsRows: rows.ops, laborRows: rows.labor, schedRows: rows.sched,
    fobRows: rows.fob, gradedVisits,
  };
}

describe('computeVisitReadiness -- real EcoSure result overrides the waste/variance proxy', () => {
  it('a CURRENT clean EcoSure pass overrides a bad waste-proxy reading (the Ardmore-Broadway counterexample)', () => {
    const ds = mkDs(GOOD, badRows(GOOD), [
      { store: GOOD, reportType: 'EcoSure', dateISO: recent(150).toISOString(), score: 86, pass: true, modules: { criticalFailCount: 0 } },
    ]);
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    expect(s.fsSource).toBe('ecosure');
    expect(s.fsFlag).toBe('low');
    expect(s.fsScore).toBe(86);
    expect(s.verdict).not.toMatch(/waste & variance/i);
  });

  it('a CURRENT EcoSure critical fail overrides a clean waste-proxy reading -- a real critical always wins', () => {
    const ds = mkDs(GOOD, goodRows(GOOD), [
      { store: GOOD, reportType: 'EcoSure', dateISO: recent(150).toISOString(), score: 40, pass: false, modules: { criticalFailCount: 1, citedItems: [{ code: 'FS15-US ', section: 'Storage', critical: true }] } },
    ]);
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    expect(s.fsSource).toBe('ecosure');
    expect(s.fsFlag).toBe('elevated');
    expect(s.fsEcoSure.criticalFailCount).toBe(1);
    expect(s.verdict).toMatch(/real EcoSure critical/i);
    expect(s.verdict).not.toMatch(/waste & variance/i);
  });

  it('falls back to the waste-proxy flag when no EcoSure visit is on record at all (regression)', () => {
    const ds = mkDs(GOOD, badRows(GOOD));
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    expect(s.fsSource).toBe('proxy');
    expect(s.fsFlag).toBe('elevated');
    expect(s.fsEcoSure).toBeNull();
    expect(s.verdict).toMatch(/waste & variance/i);
  });

  it('falls back to the waste-proxy flag when the only EcoSure visit on record is stale (older than its own cadence)', () => {
    const overdueDays = overdueThresholdDays('EcoSure');
    const ds = mkDs(GOOD, goodRows(GOOD), [
      // Well past the 2x-cadence overdue threshold -- a pass/fail from that long ago should
      // not be trusted as still true today.
      { store: GOOD, reportType: 'EcoSure', dateISO: recent(overdueDays + 30).toISOString(), score: 95, pass: true, modules: { criticalFailCount: 0 } },
    ]);
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    expect(s.fsSource).toBe('proxy');
    expect(s.fsEcoSure).toBeTruthy();       // still on file
    expect(s.fsEcoSure.fresh).toBe(false);  // just not current
  });

  it('tracks the most recent EcoSure visit specifically, even when a more recent CFV exists (fsSource does not depend on which visit type is overall-most-recent)', () => {
    const ds = mkDs(GOOD, badRows(GOOD), [
      { store: GOOD, reportType: 'EcoSure', dateISO: recent(150).toISOString(), score: 86, pass: true, modules: { criticalFailCount: 0 } },
      { store: GOOD, reportType: 'CFV', dateISO: recent(10).toISOString(), score: 92, pass: true }, // more recent, but not EcoSure
    ]);
    const res = computeVisitReadiness(ds);
    const s = res.stores.find(x => x.loc === GOOD);
    // lastVisit (type-agnostic) is the CFV; fsSource must still resolve from the EcoSure one.
    expect(s.lastVisit.type).toBe('CFV');
    expect(s.fsSource).toBe('ecosure');
    expect(s.fsFlag).toBe('low');
  });

  it('READINESS_GAPS no longer describes the food-safety flag as proxy-only', () => {
    const gap = READINESS_GAPS.find(g => g.area === 'Food Safety criticals');
    expect(gap.status).not.toMatch(/proxy flag only/i);
    expect(gap.detail).toMatch(/real EcoSure/i);
  });
});

describe('Visit Readiness panel -- EcoSure badge renders distinctly from the waste-proxy badge', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows "EcoSure: CRITICAL" (not "W&V") for a store whose flag came from a real critical fail', () => {
    const OTHER = '5183';
    const ds = {
      glimpseRows: [...goodRows(GOOD).glimpse, ...badRows(OTHER).glimpse],
      opsRows: [...goodRows(GOOD).ops, ...badRows(OTHER).ops],
      laborRows: [...goodRows(GOOD).labor, ...badRows(OTHER).labor],
      schedRows: [...goodRows(GOOD).sched, ...badRows(OTHER).sched],
      fobRows: [...goodRows(GOOD).fob, ...badRows(OTHER).fob],
      gradedVisits: [
        { store: GOOD, reportType: 'EcoSure', dateISO: recent(150).toISOString(), score: 40, pass: false, modules: { criticalFailCount: 1 } },
      ],
    };
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });
    expect(container.textContent).toContain('EcoSure: CRITICAL');
    // OTHER has no EcoSure visit -- must still show the honest, unreplaced proxy label.
    expect(container.textContent).toMatch(/W&V (elevated|low|watch|n\/a)/);
  });
});
