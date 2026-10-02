// @vitest-environment happy-dom
// @ts-nocheck
// Operations Process to Cure -- memory/project-graded-visits-pace.md: "4 qualifying visits ->
// Operations Process to Cure (was 2 in 2025). NEW: mandatory support visit after just 2
// qualifying visits (within 90d)." memory/finding-pace-midcycle-update-2026-09-15.md flagged
// this as a real gap: Meridian has no per-store Process-to-Cure flag anywhere, and the CFV/RGR
// suspension (VISIT_SUSPENSIONS) applies uniformly even though McDonald's exempts restaurants
// in Cure from it. computeProcessToCureStatus closes the INFERRED half of that gap (there is no
// official status field anywhere Meridian has looked -- Propel, PEAK -- so this is derived from
// qualifying visits already on file, never claimed as authoritative).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeProcessToCureStatus, computeVisitReadiness } from '../engine/visit-readiness.js';
import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const rgr = (date, pass) => ({ store: LOC, dateISO: date, reportType: 'RGR', score: pass ? 90 : 60, pass });
const rgrHs = (date, pass) => ({ store: LOC, dateISO: date, reportType: 'RGR-HealthSafety', score: pass ? 90 : 60, pass });
const eco = (date, { critical = 0, pass = true } = {}) => ({
  store: LOC, dateISO: date, reportType: 'EcoSure', score: critical ? 60 : 95, pass,
  modules: { criticalFailCount: critical },
});
const cfv = (date, pass) => ({ store: LOC, dateISO: date, reportType: 'CFV', score: pass ? 90 : 50, pass });

describe('computeProcessToCureStatus -- what counts as a qualifying visit', () => {
  it('counts an Unacceptable RGR visit (pass:false)', () => {
    const r = computeProcessToCureStatus([rgr('2026-01-01', false)]);
    expect(r.byLoc[LOC].count).toBe(1);
    expect(r.byLoc[LOC].qualifyingVisits[0].reason).toBe('RGR Unacceptable');
  });
  it('does NOT count a passing RGR visit', () => {
    const r = computeProcessToCureStatus([rgr('2026-01-01', true)]);
    expect(r.byLoc[LOC]).toBeUndefined();
  });
  it('counts an Unacceptable RGR-HealthSafety visit the same way', () => {
    const r = computeProcessToCureStatus([rgrHs('2026-01-01', false)]);
    expect(r.byLoc[LOC].count).toBe(1);
  });
  it('counts an EcoSure visit with a cited critical', () => {
    const r = computeProcessToCureStatus([eco('2026-01-01', { critical: 1, pass: false })]);
    expect(r.byLoc[LOC].count).toBe(1);
    expect(r.byLoc[LOC].qualifyingVisits[0].reason).toBe('EcoSure critical fail');
  });
  it('does NOT count an EcoSure visit that failed without a critical (criticalFailCount 0)', () => {
    const r = computeProcessToCureStatus([eco('2026-01-01', { critical: 0, pass: false })]);
    expect(r.byLoc[LOC]).toBeUndefined();
  });
  it('NEVER counts a CFV visit, however poorly it scores -- "no remediation, but feeds trend"', () => {
    const r = computeProcessToCureStatus([cfv('2026-01-01', false), cfv('2026-02-01', false), cfv('2026-03-01', false), cfv('2026-04-01', false)]);
    expect(r.byLoc[LOC]).toBeUndefined();
  });
});

describe('computeProcessToCureStatus -- thresholds', () => {
  it('is not in Cure at 3 qualifying visits', () => {
    const r = computeProcessToCureStatus([rgr('2026-01-01', false), rgr('2026-06-01', false), rgr('2026-12-01', false)]);
    expect(r.byLoc[LOC].count).toBe(3);
    expect(r.byLoc[LOC].inCure).toBe(false);
  });
  it('IS in Cure at exactly 4 qualifying visits, counted cumulatively over the full history on file (no reset window)', () => {
    const r = computeProcessToCureStatus([
      rgr('2023-01-01', false), rgr('2024-06-01', false), rgr('2025-12-01', false), eco('2026-08-01', { critical: 1 }),
    ]);
    expect(r.byLoc[LOC].count).toBe(4);
    expect(r.byLoc[LOC].inCure).toBe(true);
  });
  it('mandatorySupportVisitDue is true only when 2 qualifying visits land within 90 days of each other', () => {
    const near = computeProcessToCureStatus([rgr('2026-01-01', false), rgr('2026-03-01', false)]); // 59 days apart
    expect(near.byLoc[LOC].mandatorySupportVisitDue).toBe(true);
    const far = computeProcessToCureStatus([rgr('2026-01-01', false), rgr('2026-06-01', false)]); // >90 days apart
    expect(far.byLoc[LOC].mandatorySupportVisitDue).toBe(false);
  });
  it('finds a within-90-day pair even when it is not the first-vs-second visit (adjacent-gap check over sorted dates)', () => {
    const r = computeProcessToCureStatus([rgr('2026-01-01', false), rgr('2026-08-01', false), rgr('2026-08-20', false)]);
    expect(r.byLoc[LOC].mandatorySupportVisitDue).toBe(true); // Aug 1 -> Aug 20 = 19 days
  });
  it('is keyed per store -- one store crossing 4 does not affect another', () => {
    const r = computeProcessToCureStatus([
      rgr('2026-01-01', false), { ...rgr('2026-02-01', false), store: '5183' },
    ]);
    expect(r.byLoc[LOC].count).toBe(1);
    expect(r.byLoc['5183'].count).toBe(1);
    expect(r.byLoc[LOC].inCure).toBe(false);
  });
});

describe('computeProcessToCureStatus -- honesty about what it cannot see', () => {
  it('returns a note naming the caveats, and never a bare "official" claim', () => {
    const r = computeProcessToCureStatus([rgr('2026-01-01', false)]);
    expect(r.note).toMatch(/no official Process-to-Cure status field/i);
    expect(r.note).toMatch(/egregious/i);
    expect(r.note).toMatch(/refused-access/i);
  });
  it('is null/empty-safe', () => {
    expect(computeProcessToCureStatus([]).byLoc).toEqual({});
    expect(computeProcessToCureStatus(null).byLoc).toEqual({});
    expect(() => computeProcessToCureStatus(undefined)).not.toThrow();
  });
  it('ignores a visit with no score and a visit with no resolvable store', () => {
    const r = computeProcessToCureStatus([{ reportType: 'RGR', pass: false, dateISO: '2026-01-01' }, { store: LOC, reportType: 'RGR', pass: false, score: null, dateISO: '2026-01-01' }]);
    expect(r.byLoc[LOC]).toBeUndefined();
  });
});

function goodRows(loc) {
  const t = DEFAULT_TARGETS[loc];
  const recent = n => new Date(Date.now() - n * 864e5);
  const days = [recent(1), recent(3), recent(6)];
  return {
    glimpseRows: days.map(d => ({ loc, date: d, oepe: t.tOepe * 0.85, kvst: t.tKvst * 0.8, laborPct: t.tCrewLabor * 0.92 })),
    opsRows: days.map(d => ({ loc, date: d, park: t.tPark * 0.7, r2p: t.tR2p * 0.85 })),
    laborRows: days.map(d => ({ loc, date: d, tpph: t.tTpph * 1.15, laborPct: t.tCrewLabor * 0.92 })),
    schedRows: days.map(d => ({ loc, date: d, schVsIdealDiff: 1 })),
  };
}
function mkDs(gradedVisits = []) {
  const r = goodRows(LOC);
  return { glimpseRows: r.glimpseRows, opsRows: r.opsRows, laborRows: r.laborRows, schedRows: r.schedRows, gradedVisits };
}

describe('computeVisitReadiness -- wires processToCure through per-store and to the district rollup', () => {
  it('a store with 4 qualifying visits is flagged inCure, and the district counts it', () => {
    const gv = [rgr('2023-01-01', false), rgr('2024-06-01', false), rgr('2025-12-01', false), eco('2026-08-01', { critical: 1 })];
    const res = computeVisitReadiness(mkDs(gv));
    const store = res.stores.find(s => s.loc === LOC);
    expect(store.processToCure.inCure).toBe(true);
    expect(store.processToCure.count).toBe(4);
    expect(res.district.inCure).toBe(1);
  });
  it('a store with no qualifying visits gets a well-formed zero entry, never undefined', () => {
    const res = computeVisitReadiness(mkDs([]));
    const store = res.stores.find(s => s.loc === LOC);
    expect(store.processToCure).toEqual({ qualifyingVisits: [], count: 0, mandatorySupportVisitDue: false, inCure: false });
    expect(res.district.inCure).toBe(0);
  });
  it('carries the explanatory note at the top level', () => {
    const res = computeVisitReadiness(mkDs([]));
    expect(res.processToCureNote).toMatch(/no official Process-to-Cure status field/i);
  });
  it('folds an org-level inCure count into selfAssessmentEligibility without touching its criterion-3 formula', () => {
    const gv = [rgr('2023-01-01', false), rgr('2024-06-01', false), rgr('2025-12-01', false), eco('2026-08-01', { critical: 1 })];
    const res = computeVisitReadiness(mkDs(gv));
    expect(res.selfAssessmentEligibility.orgInCureCount).toBe(1);
    expect(res.selfAssessmentEligibility).toHaveProperty('rate'); // criterion-3 formula untouched
  });
});

describe('computeVisitReadiness -- a store inferred in Cure is exempt from the uniform CFV/RGR suspension', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T12:00:00')); }); // inside the real suspension window
  afterEach(() => { vi.useRealTimers(); });

  it('visitsSuspended is true for an ordinary store while the window is active', () => {
    const res = computeVisitReadiness(mkDs([]));
    const store = res.stores.find(s => s.loc === LOC);
    expect(res.suspension).toBeTruthy();
    expect(store.visitsSuspended).toBe(true);
  });
  it('visitsSuspended is false for the SAME store once it crosses the inferred Cure threshold', () => {
    const gv = [rgr('2023-01-01', false), rgr('2024-06-01', false), rgr('2025-12-01', false), eco('2026-08-01', { critical: 1 })];
    const res = computeVisitReadiness(mkDs(gv));
    const store = res.stores.find(s => s.loc === LOC);
    expect(res.suspension).toBeTruthy(); // the district-wide window is still active...
    expect(store.processToCure.inCure).toBe(true);
    expect(store.visitsSuspended).toBe(false); // ...but this one store is exempt
  });
});

describe('Visit Readiness panel -- Process to Cure renders in the real consumer, not just the engine', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T12:00:00')); // inside the suspension window
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); });

  it('shows the per-store Cure badge and a real readiness score for that store even though the district is suspended', () => {
    const gv = [rgr('2023-01-01', false), rgr('2024-06-01', false), rgr('2025-12-01', false), eco('2026-08-01', { critical: 1 })];
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds: mkDs(gv), onClose: () => {} })); });

    expect(container.textContent).toContain('CFV & RGR graded visits suspended'); // district-wide banner still shows
    expect(container.textContent).toContain('Process to Cure (inferred, 4 qualifying visits)');
    expect(container.textContent).toContain('exempt from this suspension');
    // This store must NOT show the generic "Suspended" pill -- it is the exception.
    expect(container.textContent).not.toContain('Suspended — no visit scheduled');
  });

  it('shows no Cure badge and the normal Suspended pill for a store with no qualifying visits', () => {
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds: mkDs([]), onClose: () => {} })); });

    expect(container.textContent).not.toContain('Process to Cure (inferred');
    expect(container.textContent).toContain('Suspended — no visit scheduled');
  });
});
