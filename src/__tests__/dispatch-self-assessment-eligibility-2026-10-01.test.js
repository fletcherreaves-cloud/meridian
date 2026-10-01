// @ts-nocheck
// 2027 Self-Assessed RGRV eligibility — Operations PACE Mid-Cycle Update (09/15/26,
// memory/finding-pace-midcycle-update-2026-09-15.md): an org qualifies only if it meets all 3
// of (1) all National Franchising Standards, (2) no restaurant in Process to Cure, (3) >=92%
// combined CFV+Food-Safety organizational pass rate for actual 2025+2026 visits, computed as
// (passing CFV+FS)/(total CFV+FS) * 100, NOT rounded (the official FAQ: 91.5% does not qualify).
// computeSelfAssessmentEligibility measures ONLY criterion (3) — (1) and (2) aren't in
// Meridian's data model — so it must never claim overall eligibility, only the pass-rate gap.
// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeSelfAssessmentEligibility, computeVisitReadiness } from '../engine/visit-readiness.js';
import { VisitReadinessPanel } from '../views/visit-readiness.js';
import { DEFAULT_TARGETS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('computeSelfAssessmentEligibility', () => {
  it('computes the exact official formula: passing / total * 100, across CFV + EcoSure only', () => {
    const gv = [
      { store: 'A', dateISO: '2025-03-01', reportType: 'CFV', score: 88, pass: true },
      { store: 'A', dateISO: '2025-06-01', reportType: 'CFV', score: 70, pass: false },
      { store: 'A', dateISO: '2026-03-01', reportType: 'EcoSure', score: 90, pass: true },
      { store: 'A', dateISO: '2026-06-01', reportType: 'EcoSure', score: 95, pass: true },
    ];
    const r = computeSelfAssessmentEligibility(gv);
    expect(r.total).toBe(4);
    expect(r.passing).toBe(3);
    expect(r.rate).toBeCloseTo(75, 5);
    expect(r.meetsPassRateThreshold).toBe(false);
  });

  it('excludes RGR/RGR-HealthSafety visits from the denominator — only CFV + Food Safety count', () => {
    const gv = [
      { store: 'A', dateISO: '2025-03-01', reportType: 'CFV', score: 88, pass: true },
      { store: 'A', dateISO: '2025-04-01', reportType: 'RGR', score: 50, pass: false },
      { store: 'A', dateISO: '2025-05-01', reportType: 'RGR-HealthSafety', score: 40, pass: false },
    ];
    const r = computeSelfAssessmentEligibility(gv);
    expect(r.total).toBe(1); // only the CFV visit
    expect(r.rate).toBeCloseTo(100, 5);
  });

  it('is exactly >=92, never rounds up (the official FAQ: 91.5% does not qualify)', () => {
    // 11/12 = 91.666...% — rounds to 91.67% at 2dp, which itself is < 92, but prove the
    // comparison is against the raw float, not a rounded display value.
    const mk = (n, pass) => Array.from({ length: n }, (_, i) => ({
      store: 'A', dateISO: '2026-01-01', reportType: 'CFV', score: pass ? 90 : 70, pass,
    }));
    const r = computeSelfAssessmentEligibility([...mk(11, true), ...mk(1, false)]);
    expect(r.total).toBe(12);
    expect(r.rate).toBeCloseTo(91.6667, 3);
    expect(r.meetsPassRateThreshold).toBe(false);
    // 23/25 = exactly 92%.
    const r2 = computeSelfAssessmentEligibility([...mk(23, true), ...mk(2, false)]);
    expect(r2.total).toBe(25);
    expect(r2.rate).toBeCloseTo(92, 5);
    expect(r2.meetsPassRateThreshold).toBe(true);
  });

  it('only counts visits in the given cycle years — defaults to 2025+2026, a visit outside that window is excluded', () => {
    const gv = [
      { store: 'A', dateISO: '2024-06-01', reportType: 'CFV', score: 20, pass: false }, // outside window
      { store: 'A', dateISO: '2025-06-01', reportType: 'CFV', score: 90, pass: true },
      { store: 'A', dateISO: '2027-06-01', reportType: 'CFV', score: 20, pass: false }, // outside window
    ];
    const r = computeSelfAssessmentEligibility(gv);
    expect(r.total).toBe(1);
    expect(r.rate).toBeCloseTo(100, 5);
    expect(r.cycleYears).toEqual([2025, 2026]);
  });

  it('cycleYears is overridable', () => {
    const gv = [
      { store: 'A', dateISO: '2024-06-01', reportType: 'CFV', score: 90, pass: true },
      { store: 'A', dateISO: '2025-06-01', reportType: 'CFV', score: 20, pass: false },
    ];
    const r = computeSelfAssessmentEligibility(gv, { cycleYears: [2024] });
    expect(r.total).toBe(1);
    expect(r.rate).toBeCloseTo(100, 5);
  });

  it('breaks the rate down by CFV vs Food Safety separately', () => {
    const gv = [
      { store: 'A', dateISO: '2026-01-01', reportType: 'CFV', score: 70, pass: false },
      { store: 'A', dateISO: '2026-01-02', reportType: 'CFV', score: 70, pass: false },
      { store: 'A', dateISO: '2026-01-03', reportType: 'EcoSure', score: 95, pass: true },
      { store: 'A', dateISO: '2026-01-04', reportType: 'EcoSure', score: 95, pass: true },
    ];
    const r = computeSelfAssessmentEligibility(gv);
    expect(r.cfv).toEqual({ n: 2, pass: 0, passRate: 0 });
    expect(r.foodSafety).toEqual({ n: 2, pass: 2, passRate: 1 });
  });

  it('returns null rate / total:0 with no CFV or Food Safety visits in the window, never throws', () => {
    expect(computeSelfAssessmentEligibility([])).toEqual(expect.objectContaining({ total: 0, passing: 0, rate: null, meetsPassRateThreshold: false }));
    expect(computeSelfAssessmentEligibility(null)).toEqual(expect.objectContaining({ total: 0 }));
  });

  it('never claims overall eligibility in its own output shape — no bare "eligible" field', () => {
    const r = computeSelfAssessmentEligibility([{ store: 'A', dateISO: '2026-01-01', reportType: 'CFV', score: 95, pass: true }]);
    expect(r).not.toHaveProperty('eligible');
    expect(r.note).toMatch(/Process to Cure/);
    expect(r.note).toMatch(/National Franchising Standards/);
  });
});

describe('computeVisitReadiness wires selfAssessmentEligibility through, org-level (not scoped to opts.locs)', () => {
  const LOC_A = Object.keys(DEFAULT_TARGETS).find(l => /^\d+$/.test(l));
  const LOC_B = Object.keys(DEFAULT_TARGETS).filter(l => /^\d+$/.test(l))[1];

  it('is present on the result and reflects ds.gradedVisits regardless of the locs filter', () => {
    const ds = {
      gradedVisits: [
        { store: LOC_A, dateISO: '2026-01-01', reportType: 'CFV', score: 95, pass: true },
        { store: LOC_B, dateISO: '2026-01-01', reportType: 'CFV', score: 60, pass: false },
      ],
    };
    const resAll = computeVisitReadiness(ds);
    const resScoped = computeVisitReadiness(ds, { locs: [LOC_A] }); // scoped to one store only
    expect(resAll.selfAssessmentEligibility.total).toBe(2);
    // Org-level figure must NOT shrink just because the panel is filtered to one store.
    expect(resScoped.selfAssessmentEligibility.total).toBe(2);
    expect(resScoped.selfAssessmentEligibility).toEqual(resAll.selfAssessmentEligibility);
  });

  it('is a well-formed object even with zero graded visits', () => {
    const res = computeVisitReadiness({ gradedVisits: [] });
    expect(res.selfAssessmentEligibility.total).toBe(0);
    expect(res.selfAssessmentEligibility.meetsPassRateThreshold).toBe(false);
  });
});

// Same minimal "on-target" fixture shape visit-readiness.test.js / the suspension test use —
// computeVisitReadiness's empty-state gate needs real operational rows present (not just
// gradedVisits) before res.stores is non-empty and the panel body renders at all.
function goodOpsRows(loc) {
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

// Per "would this verification still pass if reverted?" — an engine-only test can't tell
// "computed" from "computed but never rendered". Renders the REAL VisitReadinessPanel.
describe('VisitReadinessPanel — self-assessment eligibility card actually renders', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('shows the computed rate and the Process-to-Cure/National-Standards caveat', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = goodOpsRows('3708');
    const ds = {
      glimpseRows: r.glimpseRows, opsRows: r.opsRows, laborRows: r.laborRows, schedRows: r.schedRows,
      gradedVisits: [
        { store: '3708', dateISO: '2026-01-01', reportType: 'CFV', score: 95, pass: true },
        { store: '3708', dateISO: '2026-01-02', reportType: 'CFV', score: 60, pass: false },
      ],
    };
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    expect(container.textContent).toContain('2027 Self-Assessed RGRV eligibility');
    expect(container.textContent).toContain('50.00%');
    expect(container.textContent).toContain('Process to Cure');
    expect(container.textContent).toContain('National Franchising Standards');
  });

  it('renders nothing for the card when there are zero CFV/Food-Safety visits on record', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const r = goodOpsRows('3708');
    const ds = { glimpseRows: r.glimpseRows, opsRows: r.opsRows, laborRows: r.laborRows, schedRows: r.schedRows, gradedVisits: [] };
    act(() => { root.render(React.createElement(VisitReadinessPanel, { ds, onClose: () => {} })); });

    expect(container.textContent).not.toContain('2027 Self-Assessed RGRV eligibility');
  });
});
