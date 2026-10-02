// @vitest-environment happy-dom
// @ts-nocheck
// Owner-reported (2026-10-02), from a real Patch Sheet screenshot ("Robert Spencer", September
// 2026 actuals): "Base Food %" showed a literal 0.00% actual with a nonsensical +$318,070.53
// "Opportunity $" instead of "—", even though no store in the group had any real FOB actual on
// file for the period. Root cause: rollActuals (inside buildGroupSheetHTML), rollupGroup
// (buildEmailReportHTML) and rollupProj (the on-screen grid) all summed `(value||0)*sales` and
// divided by TOTAL group sales — a store with no value for a field contributed a silent 0 to
// the numerator while its sales still counted in the denominator, so a field with ZERO real
// data across the whole group resolved to a literal 0 instead of null. Fixed: each field now
// tracks its OWN numerator and denominator, built only from stores that actually had a value
// for that field — a field with no real data anywhere returns null (renders "—"), and a field
// with partial coverage averages only over the stores that reported it.
//
// Also covers two things built in the same pass: the "State" (All OK / All Florida) Patch
// Sheet grouping option (owner request, "like the style of the Operator roll-ups, where each
// location is listed along with a combined total"), and the Service/Bonus Labor/Bonus Food
// show-hide toggles on the on-screen Monthly Projections grid.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  rollupGroup, rollupProj, buildGroupSheetHTML, MonthlyProjectionsPanel, PROJ_FIELDS,
} from '../views/analytics.js';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Three real store numbers from the live roster, used throughout.
const [A, B, C] = ['3708', '5183', '5985'];

describe('rollupGroup — missing actual/target data never dilutes to a false 0', () => {
  const mt = {
    [A]: { tProdSales: 300000, tCrewLabor: 0.21, tBonusLabor: 0.20, tFOBBase: 0.23, tFOBTotal: 0.28 },
    [B]: { tProdSales: 200000, tCrewLabor: 0.22, tBonusLabor: 0.19, tFOBBase: 0.24, tFOBTotal: 0.27 },
  };

  it('a field with ZERO real actuals anywhere in the group rolls up to null, not 0', () => {
    // Both stores have real sales/labor actuals but NEITHER has a fobBasePct on file yet —
    // exactly the reported incident (no FOB upload for the current period).
    const actuals = { byLoc: {
      [A]: { sales: 310000, crewLaborPct: 0.215, tpph: 5.5, fobBasePct: null, fobTotalPct: null },
      [B]: { sales: 210000, crewLaborPct: 0.225, tpph: 5.2, fobBasePct: null, fobTotalPct: null },
    } };
    const r = rollupGroup([A, B], mt, actuals);
    expect(r.aFobBase).toBeNull();
    expect(r.aFobTotal).toBeNull();
    // Fields that DID report should still roll up normally, proving the fix didn't just
    // blank everything out.
    expect(r.aCrewLabor).toBeCloseTo((0.215*310000 + 0.225*210000) / (310000+210000), 6);
  });

  it('a field with PARTIAL coverage averages only over the stores that reported it', () => {
    const actuals = { byLoc: {
      [A]: { sales: 310000, crewLaborPct: 0.215, fobBasePct: 0.23, fobTotalPct: null },
      [B]: { sales: 210000, crewLaborPct: 0.225, fobBasePct: null, fobTotalPct: null }, // no FOB yet
    } };
    const r = rollupGroup([A, B], mt, actuals);
    // Only store A reported fobBasePct -- the group figure must equal A's own value exactly,
    // not A's value diluted by B's uncounted sales.
    expect(r.aFobBase).toBeCloseTo(0.23, 6);
  });

  it('regression: full coverage still dollar-weights correctly (the fix does not break the normal case)', () => {
    const actuals = { byLoc: {
      [A]: { sales: 310000, crewLaborPct: 0.215, fobBasePct: 0.23, fobTotalPct: 0.28 },
      [B]: { sales: 210000, crewLaborPct: 0.225, fobBasePct: 0.24, fobTotalPct: 0.27 },
    } };
    const r = rollupGroup([A, B], mt, actuals);
    const s = 310000+210000;
    expect(r.aFobBase).toBeCloseTo((0.23*310000 + 0.24*210000)/s, 6);
    expect(r.aFobTotal).toBeCloseTo((0.28*310000 + 0.27*210000)/s, 6);
  });

  it('a TARGET field missing for one store (e.g. a null tBonusLabor) also drops out cleanly, not just actuals', () => {
    const mtPartial = {
      [A]: { tProdSales: 300000, tBonusLabor: 0.20 },
      [B]: { tProdSales: 200000, tBonusLabor: null },
    };
    const r = rollupGroup([A, B], mtPartial, { byLoc: {} });
    expect(r.tBonusLabor).toBeCloseTo(0.20, 6); // only A reported it
  });
});

describe('rollupProj — same fix, on-screen grid group/district totals', () => {
  it('a PROJ_FIELDS metric missing for every store in the group rolls up to null, not 0', () => {
    const mt = {
      [A]: { tProdSales: 300000, tCrewLabor: 0.21 }, // no tFOBBonusBase anywhere
      [B]: { tProdSales: 200000, tCrewLabor: 0.22 },
    };
    const r = rollupProj([A, B], mt);
    expect(r.tFOBBonusBase).toBeNull();
    expect(r.tCrewLabor).toBeCloseTo((0.21*300000 + 0.22*200000)/500000, 6);
  });

  it('partial coverage of a metric averages only over the stores that have it', () => {
    const mt = {
      [A]: { tProdSales: 300000, tPaperCost: 0.038 },
      [B]: { tProdSales: 200000, tPaperCost: null },
    };
    const r = rollupProj([A, B], mt);
    expect(r.tPaperCost).toBeCloseTo(0.038, 6);
  });

  it('includes the new tFOBBonusBase field (Bonus Food Threshold) in PROJ_FIELDS, grouped under Food Cost', () => {
    const f = PROJ_FIELDS.find(f => f.key === 'tFOBBonusBase');
    expect(f).toBeTruthy();
    expect(f.g).toBe('Food Cost');
  });
});

describe('buildGroupSheetHTML — the exact reported incident, reproduced and fixed', () => {
  const mt_next = { [A]: { tFOBBase: 0.231, tProdSales: 320000 }, [B]: { tFOBBase: 0.241, tProdSales: 220000 } };
  const mt_curr = { [A]: { tFOBBase: 0.230, tProdSales: 310000 }, [B]: { tFOBBase: 0.240, tProdSales: 210000 } };

  it('no store has a real FOB actual on file: Base Food % renders "—", not "0.00%", and no bogus Opportunity $ appears', () => {
    const actuals = { byLoc: {
      [A]: { sales: 311000, crewLaborPct: 0.215, fobBasePct: null, fobTotalPct: null },
      [B]: { sales: 212000, crewLaborPct: 0.225, fobBasePct: null, fobTotalPct: null },
    } };
    const html = buildGroupSheetHTML('Test Group', [A, B], mt_next, mt_curr, actuals,
      {year:2026,month:11}, {year:2026,month:10}, '10/31/2026', {[A]:STORE_NAMES[A],[B]:STORE_NAMES[B]});
    // Isolate the Base Food % GROUP TOTAL row and check its actual cell directly, rather than
    // a loose proximity match against a row full of long inline-style attributes.
    const rowMatch = html.match(/<tr[^>]*>\s*<td[^>]*>Base Food %<\/td>([\s\S]*?)<\/tr>/);
    expect(rowMatch).toBeTruthy();
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1]);
    // [next target, action-items(empty), actual, curr target, opportunity]
    expect(cells[2]).toBe('—'); // the bug rendered "0.00%" here instead
    expect(cells[4]).toBe('—'); // and a six-figure fake "opportunity" here
    expect(html).not.toContain('0.00%'); // never a phantom zero anywhere in the sheet
  });

  it('regression: a store that DOES have a real FOB actual still shows it correctly (sales-weighted, not a silent 0)', () => {
    const actuals = { byLoc: {
      [A]: { sales: 311000, crewLaborPct: 0.215, fobBasePct: 0.229, fobTotalPct: 0.279 },
      [B]: { sales: 212000, crewLaborPct: 0.225, fobBasePct: 0.238, fobTotalPct: 0.283 },
    } };
    const html = buildGroupSheetHTML('Test Group', [A, B], mt_next, mt_curr, actuals,
      {year:2026,month:11}, {year:2026,month:10}, '10/31/2026', {[A]:STORE_NAMES[A],[B]:STORE_NAMES[B]});
    const expected = ((0.229*311000 + 0.238*212000)/(311000+212000)*100).toFixed(2)+'%';
    expect(html).toContain(expected);
  });

  it('OK/FL group label reads as a friendly name, not the bare "OK"/"FL" key', () => {
    const html = buildGroupSheetHTML('Oklahoma (All Locations)', [A, B], mt_next, mt_curr,
      { byLoc: {} }, {year:2026,month:11}, {year:2026,month:10}, '10/31/2026', {});
    expect(html).toContain('GROUP TOTAL — Oklahoma (All Locations)');
  });
});

describe('MonthlyProjectionsPanel — toggles and the State grouping option actually render', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  function mkDs() {
    return {
      loaded: true,
      monthlyTargets: {
        [A]: { tProdSales: 300000, tCrewLabor: 0.21, tBonusLabor: 0.20, tOepe: 140, tFOBBase: 0.23, tFOBBonusBase: 0.04, _year: 2026, _month: 10 },
      },
      monthlyTargetsMeta: { year: 2026, month: 10, label: 'October 2026', storeCount: 1 },
      allMonthlyTargets: {},
    };
  }
  function mkStores() { return [{ loc: A, name: STORE_NAMES[A] }]; }

  it('Service, Bonus Cr, and Bonus Food Thresh columns all show by default', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, { ds: mkDs(), stores: mkStores(), settings: {}, onClose: () => {} }));
    });
    expect(container.textContent).toContain('OEPE'); // Service group
    expect(container.textContent).toContain('Bonus Cr');
    expect(container.textContent).toContain('Bonus Food Thresh');
  });

  it('clicking the Service toggle calls onUpdateSettings with showProjService:false', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const onUpdateSettings = vi.fn();
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, { ds: mkDs(), stores: mkStores(), settings: {}, onClose: () => {}, onUpdateSettings }));
    });
    const serviceBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Service');
    expect(serviceBtn).toBeTruthy();
    await act(async () => { serviceBtn.click(); });
    expect(onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({ showProjService: false }));
  });

  it('settings.showProjService:false hides the Service columns from the grid', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, { ds: mkDs(), stores: mkStores(), settings: { showProjService: false }, onClose: () => {} }));
    });
    expect(container.textContent).not.toContain('OEPE');
    // Unrelated columns stay visible -- this isn't a global wipe.
    expect(container.textContent).toContain('Bonus Cr');
  });

  it('the Patch Sheet picker offers a State option alongside Supervisors/Operators', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(MonthlyProjectionsPanel, { ds: mkDs(), stores: mkStores(), settings: {}, onClose: () => {} }));
    });
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '📋 Patch Sheet');
    await act(async () => { patchBtn.click(); });
    const stateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'State');
    expect(stateBtn).toBeTruthy();
    await act(async () => { stateBtn.click(); });
    expect(container.textContent).toContain('Oklahoma (all)');
    expect(container.textContent).toContain('Florida (all)');
  });
});
