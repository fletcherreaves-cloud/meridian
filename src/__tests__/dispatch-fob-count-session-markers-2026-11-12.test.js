// @vitest-environment happy-dom
// @ts-nocheck
// Owner feedback on the Food Cost tab's Day-by-Day Variance chart (2026-11-12, live): "Still
// need to wire in the weekly and daily counts to this chart." This closes the
// `annotateTouchpoints` deferral FoodCostCockpitTab's own comment already flagged -- sourced
// from the durable inv_count_sessions log (sessionsFromLog, count-cycle.js), the same basis
// eom-dashboard.js's own dispatch #97 comment says superseded weekly-cadence.js's older
// analyzeCountCadence/qsr_raw_item_detail approach.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadInvCountSessionsMock = vi.fn();
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadInvCountSessions: (...args) => loadInvCountSessionsMock(...args) };
});

const { FoodCostCockpitTab } = await import('../views/store-cockpit.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LOC = '10422';
const STORE = { loc: LOC, name: 'Atoka-Mississippi', org: 'MCDOK', t: { tFOBTarget: 0.028 } };
const PERIOD = new Date().toISOString().slice(0, 7);

function fobRow(day, over) {
  return {
    loc: '0010422', date: PERIOD + '-' + day,
    prodSalesAmt: 100000, compWasteAmt: 500, rawWasteAmt: 400, condimentsAmt: 300,
    empMgrMealsAmt: 200, statVarianceAmt: 700, unexplainedAmt: 100, ...over,
  };
}

describe('Food Cost Day-by-Day Variance — real weekly/daily count-session markers (owner feedback 2026-11-12)', () => {
  let container, root;
  afterEach(async () => { await act(async () => { root?.unmount(); }); container?.remove(); loadInvCountSessionsMock.mockReset(); });

  it('plots a real weekly count session on the chart, labeled by day with items counted -- not just the raw rows silently ignored', async () => {
    // A real complete weekly count on the 14th: both Food and Condiment covered -- the exact
    // shape sessionQualities()'s own satisfiesWeekly check (count-cycle.js) requires.
    loadInvCountSessionsMock.mockResolvedValue([
      { loc: LOC, countDate: new Date(PERIOD + '-14T00:00:00'), cls: 'Food', period: PERIOD, itemsCounted: 180, classTotal: 200, covered: true, sessionKind: 'weekly' },
      { loc: LOC, countDate: new Date(PERIOD + '-14T00:00:00'), cls: 'Condiment', period: PERIOD, itemsCounted: 60, classTotal: 65, covered: true, sessionKind: 'weekly' },
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(FoodCostCockpitTab, { store: STORE, ds: { qsrFobRows: [fobRow('13'), fobRow('14', { statVarianceAmt: 1400 })] } }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(loadInvCountSessionsMock).toHaveBeenCalledWith({ period: PERIOD });
    const titles = Array.from(container.querySelectorAll('title')).map(t => t.textContent);
    const sessionTitle = titles.find(t => t.includes('Weekly') && t.includes('240 items counted'));
    expect(sessionTitle, `expected a session marker title among: ${JSON.stringify(titles)}`).toBeTruthy();
    expect(container.textContent).toContain('Weekly/EOM count');
  });

  it('never plots a count session whose date falls outside this trace\'s own range', async () => {
    // Same period as the fixture's own FOB rows, but on day 20 -- a real day this store has no
    // qsr_fob snapshot for, so it never becomes a trace point to attach a marker to.
    loadInvCountSessionsMock.mockResolvedValue([
      { loc: LOC, countDate: new Date(PERIOD + '-20T00:00:00'), cls: 'Food', period: PERIOD, itemsCounted: 180, classTotal: 200, covered: true, sessionKind: 'weekly' },
      { loc: LOC, countDate: new Date(PERIOD + '-20T00:00:00'), cls: 'Condiment', period: PERIOD, itemsCounted: 60, classTotal: 65, covered: true, sessionKind: 'weekly' },
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(FoodCostCockpitTab, { store: STORE, ds: { qsrFobRows: [fobRow('13'), fobRow('14')] } }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).not.toContain('Weekly/EOM count');
  });
});
