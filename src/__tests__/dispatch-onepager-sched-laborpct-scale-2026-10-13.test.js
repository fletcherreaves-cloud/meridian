// @vitest-environment happy-dom
// @ts-nocheck
// Owner-flagged anomaly: the Above-Store One-Pager's Scheduling section showed "Scheduled Labor
// % (Total): 2397.15%" for a store whose real weekly labor % was ~24%.
//
// Root cause, live-measured against the source: schedule-summary.js's rollup() (and the
// normLaborPct it runs every row through) puts laborPct on a 0-100 PERCENT scale by design
// ("% scale", schedule-summary.js:63/95; schedule-summary.test.js's own fixtures use 24.34,
// 24.92, etc, and assert `toBeCloseTo(24.50, 2)` — not 0.245). one-pager-data.js's
// buildScheduleActuals() passed that value straight through as `laborPctTotal` with no
// conversion. Every one of its 3 render sites in above-store-onepager.js (the live Scheduling
// section, the print HTML, and the AI-narrative text) formats it with this file's own fmtV(v,'%')
// helper, which does `(v*100).toFixed(2)+'%'` — the same convention every SIBLING field here uses
// (fixedPct/floorPct/vlhPct/combinedPct are all hrs-ratio FRACTIONS, 0-1 scale). So a real
// 23.9715% ran through fmtV's *100 a second time and rendered as "2397.15%" — exactly the
// reported value. This is the identical bug class already fixed once in this codebase for a
// DIFFERENT panel reading the same already-percent-scale field (see
// schedule-retention-rollup-labor-delta-scale.test.js, 2026-08-26, Retention Rollup's "Labor % Δ"
// column) — recurring because buildScheduleActuals is a separate call site that test never
// touched.
//
// Fix: one-pager-data.js's buildScheduleActuals divides band.laborPct by 100 before returning it
// as laborPctTotal, so it's a fraction like every sibling field and fmtV's *100 lands correctly.
//
// Verified by rendering the REAL AboveStoreOnePager component end-to-end (per this repo's "would
// this verification still pass if reverted?" rule) — not by calling buildScheduleActuals alone,
// since the bug was in how its OUTPUT was consumed, not in its own math.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AboveStoreOnePager } from '../views/above-store-onepager.js';
import { buildScheduleActuals } from '../engine/one-pager-data.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '3708';
const RANGE = { s: '2026-09-01', e: '2026-09-07' };

// A real week's worth of schedule rows, laborPct on its native 0-100 percent scale (matching
// schedule-summary.test.js's own fixtures), weighted to land at a dollar-weighted 24.50% —
// nowhere near the 70% ceiling normLaborPct enforces, so this is a genuine, in-band reading.
function schedRowsFor(loc, range) {
  const days = [];
  let d = new Date(range.s + 'T12:00:00');
  const end = new Date(range.e + 'T12:00:00');
  while (d <= end) {
    days.push({
      loc, date: new Date(d),
      schVLH: 150, schFixHrs: 20, schFloor: 20,
      projVLH: 150, fixGuideHrs: 20, projFloor: 20,
      fcstSales: 12000, sales: 12000, laborPct: 24.50, fcstTCs: 1000,
    });
    d = new Date(d); d.setDate(d.getDate() + 1);
  }
  return days;
}

describe('buildScheduleActuals — laborPctTotal is a fraction (0-1), matching every sibling field', () => {
  it('returns ~0.245 for a real 24.50% week, not 24.50 itself', () => {
    const sched = buildScheduleActuals({ schedRows: schedRowsFor(LOC, RANGE) }, [LOC], RANGE);
    expect(sched).toBeTruthy();
    expect(sched.laborPctTotal).toBeCloseTo(0.245, 3);
  });
});

describe('AboveStoreOnePager — Scheduling section renders the real percent, not a 100x-inflated one (2026-10-13)', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('shows "24.50%" for "Scheduled Labor % (Total)", never "2450.00%"', async () => {
    await act(async () => {
      root.render(React.createElement(AboveStoreOnePager, {
        ds: { loaded: true, qsrFobRows: [], schedRows: schedRowsFor(LOC, RANGE) },
        settings: {}, userEvents: {}, eventImpact: {}, onClose: () => {},
        initialScope: LOC, initialPeriod: 'custom', initialCustomRange: RANGE,
      }));
    });

    expect(container.textContent).toContain('Scheduled Labor % (Total)');
    expect(container.textContent).toContain('24.50%');
    // The exact shape the bug produced (v already a percent, re-multiplied by 100).
    expect(container.textContent).not.toMatch(/2450\.00%/);
  });
});
