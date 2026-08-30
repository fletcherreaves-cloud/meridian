// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #222 — GitHub issue #299: FOB Analysis Root-Cause Priority Matrix's own subtitle
// promises "Excludes Base Food (largely outside store control)" but didn't. Root cause:
// `FOB_COMP`'s `baseFoodPct` entry never set `actionable`, so the filter guard
// `c.actionable!==false` (analytics.js's rootCauseItems memo) was a permanent no-op, and the
// `c.actionable===false` branch in statusInfo (the "— Reference" badge) never fired either.
// Fix: `actionable:false` added to the `baseFoodPct` entry in FOB_COMP.
//
// Per this repo's "would this verification still pass if the change were reverted?" standing
// rule, the two checks below render the REAL FOBAnalysisPanel component and exercise the REAL
// rootCauseItems filter + statusInfo/statusBadge functions through it -- not a reimplementation
// of the filter or badge branching logic. A revert of the one-line fix flips both back to red.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let resolveLoadQsrFob;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadQsrFob: () => new Promise((resolve) => { resolveLoadQsrFob = resolve; }) };
});

// Waste-Entry Discipline is irrelevant to this dispatch -- bypass it exactly like
// dispatch-129-fob-print.test.js does, so it can't interfere with rendering.
vi.mock('../engine/metric-source.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ensureLazyFill: () => false, isLazyFillPending: () => false, isLazyFillError: () => false };
});
vi.mock('../engine/waste-discipline.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, computeStoreDataDiscipline: () => [], disciplineSummary: () => null };
});

const { FOBAnalysisPanel, FOB_COMP } = await import('../views/analytics.js');
const h = React.createElement;

// Real store carried in DEFAULT_TARGETS (constants.js) so the panel's own allLocs filter
// (`DEFAULT_TARGETS[s.loc]`) includes it. tFOBBase=0.04, tCompWaste=0.002, tRawWaste=0.0035,
// tCondiment=0.0205, tEmpFood=0.002, tStatLoss=0.0105, tUnex=0.0 (verified live against
// constants.js before writing this fixture).
const STORE_LOC = '3708';
const STORES = [{ loc: STORE_LOC }];

// One row: baseFoodPct pushed massively over target (diff 0.16, ~$32,000 impact on $200k sales)
// -- deliberately dwarfing every other component so, under the OLD buggy filter, Base Food would
// rank #1 in the matrix. compWaste is also pushed just over ITS target (diff 0.008 > the 0.001
// threshold, ~$1,600 impact) so there's a second, genuinely-actionable breach that must survive
// the fix untouched. Every other lower-is-better component is held at/under its own target (no
// breach) so it can't confound the ranking.
const FOB_ROW = {
  loc: STORE_LOC, date: new Date('2026-08-20T00:00:00'), sales: 200000,
  compWaste: 0.01,       // target 0.002 -> diff 0.008, breaches (threshold 0.001)
  rawWaste: 0.003,        // target 0.0035 -> no breach
  condiment: 0.02,        // target 0.0205 -> no breach
  empMeal: 0.002,         // target 0.002 -> no breach
  statVar: 0.01,          // target 0.0105 -> no breach
  unexplained: 0,         // target 0.0 -> no breach
  fobPct: 0.038,          // sep:true, excluded from the ranking filter regardless
  baseFoodPct: 0.20,      // target 0.04 -> diff 0.16, ~$32,000 -- would otherwise rank #1
  discCoupon: 0.013,      // lower:false, already excluded from the ranking filter regardless
  pLFoodPct: 0.29,        // isTotal:true, excluded from the ranking filter regardless
};

describe('FOB_COMP.baseFoodPct.actionable (Dispatch #222 / GitHub #299)', () => {
  it('the data property itself is set (the one-line fix)', () => {
    const baseFood = FOB_COMP.find(c => c.key === 'baseFoodPct');
    expect(baseFood).toBeTruthy();
    expect(baseFood.actionable).toBe(false);
  });

  // The dispatch's own "worth a moment's thought" check: discCoupon (lower:false) does NOT need
  // actionable:false for THIS filter, because rootCauseItems' guard is `c.lower && ...` -- a
  // falsy `lower` already drops it before `actionable` is ever consulted. Assert both halves of
  // that reasoning directly against the live FOB_COMP entry, not just narrate it.
  it('discCoupon does not need actionable:false -- its lower:false already excludes it from the ranking filter', () => {
    const discCoupon = FOB_COMP.find(c => c.key === 'discCoupon');
    expect(discCoupon).toBeTruthy();
    expect(discCoupon.lower).toBe(false);
    expect(discCoupon.actionable).not.toBe(false); // untouched by this dispatch, on purpose
  });

  // No other FOB_COMP entry picked up actionable:false as a side effect of this fix.
  it('no other FOB_COMP entry was touched', () => {
    const flagged = FOB_COMP.filter(c => c.actionable === false).map(c => c.key);
    expect(flagged).toEqual(['baseFoodPct']);
  });
});

describe('FOBAnalysisPanel real-consumer behavior (Dispatch #222 / GitHub #299)', () => {
  let container, root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null; resolveLoadQsrFob = undefined;
  });

  async function renderAndSettle() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(h(FOBAnalysisPanel, {
        stores: STORES,
        ds: { fobRows: [FOB_ROW], wasteRows: [], targets: {}, monthlyTargets: {} },
        settings: {}, onClose: () => {},
      }));
    });

    // Empty cloud stream -> fobRowsEff falls back entirely to the manual ds.fobRows fixture above.
    await act(async () => {
      resolveLoadQsrFob([]);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
  }

  it('the Root-Cause Priority Matrix (rootCauseItems, the real ranking filter) excludes Base Food even though its dollar impact would otherwise rank #1', async () => {
    await renderAndSettle();
    expect(container.textContent).toContain('Root-Cause Priority Matrix');
    // The matrix's own subtitle literally contains the words "Excludes Base Food" (that's the
    // panel's promise to the user, not a bug) and the KPI-card strip above it has its own
    // "Base Food" tile -- so this can't be a plain substring check against the whole panel or
    // even the whole matrix block. Isolate the RANKED ROWS specifically: the title div's parent
    // is the matrix container, whose children are [title, subtitle, ...one div per ranked item].
    const titleEl = [...container.querySelectorAll('div')]
      .find(d => d.textContent.trim() === '🎯 Root-Cause Priority Matrix — Top Coaching Opportunities');
    expect(titleEl).toBeTruthy();
    const matrixContainer = titleEl.parentElement;
    const rowEls = [...matrixContainer.children].slice(2); // skip title + subtitle
    expect(rowEls.length).toBeGreaterThan(0); // the compWaste breach must still produce a row
    const rowLabels = rowEls.map(r => r.textContent);
    // The genuinely-actionable compWaste breach ("Completed Waste") must still surface --
    // proves the filter is discriminating (excluding Base Food specifically), not just empty.
    expect(rowLabels.some(t => t.includes('Completed Waste'))).toBe(true);
    expect(rowLabels.some(t => t.includes('Base Food'))).toBe(false);
  });

  it('the Contributors table Status badge (statusInfo/statusBadge, the real badge functions) shows "— Reference" for Base Food, not Over/Watch/OK', async () => {
    await renderAndSettle();
    const row = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('Base Food'));
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('— Reference');
    expect(row.textContent).not.toContain('⚠ Over');
    expect(row.textContent).not.toContain('△ Watch');
    expect(row.textContent).not.toContain('✓ OK');
  });

  it('a genuinely actionable component (Completed Waste, over its own target) keeps its normal Over/Watch badge, unaffected by this fix', async () => {
    await renderAndSettle();
    const row = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('Completed Waste'));
    expect(row).toBeTruthy();
    expect(row.textContent).not.toContain('— Reference');
  });
});
