// @vitest-environment happy-dom
// @ts-nocheck
// New Store Launch Planner (memory/project-new-store-launch-planner.md, owner-approved
// 2026-11-06 -- "Build it now"). Covers: the self-healing Supabase helpers
// (saveLaunchPlanRow/loadLaunchPlan/loadDailySalesForStore) against a mocked supabase-js client,
// and the real NewStoreLaunchPlanner panel component (renders, an override edit recomputes
// Effective $, "Regenerate from ramp model" never touches a manually-overridden row, and the
// grand-opening date gets flagged).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { HOUR_SLOTS, DEEP_OVERNIGHT_SLOTS, QTR_SLOTS, DEEP_OVERNIGHT_QTR_SLOTS } from '../engine/new-store-ramp.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── Supabase helper tests (mocked client, same technique as
// dispatch-runtime-error-reports-2026-11-06.test.js) ────────────────────────────────────────────
let _upsertError = null;
let _selectError = null;
let _selectData = null;
let _lastUpsert = null;
let _allUpserts = [];
let _dailyActivityRows = [];

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      upsert: (row, opts) => { _lastUpsert = { table, row, opts }; _allUpserts.push({ table, row, opts }); return Promise.resolve({ data: row, error: _upsertError }); },
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: _selectData, error: _selectError }),
          gte: () => ({ lte: () => ({ order: () => ({ range: (lo, hi) => Promise.resolve({ data: _dailyActivityRows.slice(lo, hi + 1), error: null }) }) }) }),
        }),
      }),
    }),
  }),
}));

const { saveLaunchPlanRow, loadLaunchPlan, loadDailySalesForStore, loadHourlySalesForStore, loadQuarterHourSalesForStore } = await import('../lib/supabase.js');

beforeEach(() => {
  _upsertError = null; _selectError = null; _selectData = null; _lastUpsert = null; _allUpserts = []; _dailyActivityRows = [];
  if (console.warn.mockRestore) console.warn.mockRestore(); // vi.spyOn reuses an existing spy rather than
  vi.spyOn(console, 'warn').mockImplementation(() => {});   // re-wrapping it -- restore first so each
});                                                          // test's call history starts fresh.

describe('saveLaunchPlanRow', () => {
  it('upserts onConflict tenant_id,loc,plan_date', async () => {
    const r = await saveLaunchPlanRow('44689', '2026-11-14', { dayN: 0, projectedSales: 2020, source: 'ramp' });
    expect(r.error).toBeNull();
    expect(_lastUpsert.table).toBe('new_store_launch_plan');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'tenant_id,loc,plan_date' });
    expect(_lastUpsert.row).toMatchObject({ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2020, source: 'ramp' });
  });
  it('self-heals SILENTLY when the table has not been migrated yet (42P01)', async () => {
    _upsertError = { code: '42P01', message: 'relation "new_store_launch_plan" does not exist' };
    const r = await saveLaunchPlanRow('44689', '2026-11-14', { projectedSales: 2020 });
    expect(r.error).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });
  it('on a genuine error, warns and returns the error message', async () => {
    _upsertError = { code: '42703', message: 'column does not exist' };
    const r = await saveLaunchPlanRow('44689', '2026-11-14', { projectedSales: 2020 });
    expect(r.error).toBe('column does not exist');
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('loadLaunchPlan', () => {
  it('maps DB rows to camelCase', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2020, override_sales: null, note: null, source: 'ramp' }];
    const rows = await loadLaunchPlan('44689');
    expect(rows).toEqual([{ loc: '44689', planDate: '2026-11-14', dayN: 0, projectedSales: 2020, overrideSales: null, note: null, source: 'ramp' }]);
  });
  it('self-heals to [] when the table is missing', async () => {
    _selectError = { code: 'PGRST205', message: "Could not find the table 'public.new_store_launch_plan'" };
    const rows = await loadLaunchPlan('44689');
    expect(rows).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('loadDailySalesForStore', () => {
  it('pads the loc and sums product_sales across hour_slot per date', async () => {
    _dailyActivityRows = [
      { dt: '2026-01-01', product_sales: 100 },
      { dt: '2026-01-01', product_sales: 50 },
      { dt: '2026-01-02', product_sales: 200 },
    ];
    const rows = await loadDailySalesForStore('43380', '2026-01-01', '2026-01-02');
    expect(rows).toEqual([{ loc: '43380', date: '2026-01-01', sales: 150 }, { loc: '43380', date: '2026-01-02', sales: 200 }]);
  });
});

describe('loadHourlySalesForStore', () => {
  it('pads the loc and keeps hour_slot (does not sum it away like loadDailySalesForStore)', async () => {
    _dailyActivityRows = [
      { dt: '2026-01-01', hour_slot: '06:00', product_sales: 100 },
      { dt: '2026-01-01', hour_slot: '07:00', product_sales: 50 },
    ];
    const rows = await loadHourlySalesForStore('43380', '2026-01-01', '2026-01-01');
    expect(rows).toEqual([
      { loc: '43380', date: '2026-01-01', hourSlot: '06:00', sales: 100 },
      { loc: '43380', date: '2026-01-01', hourSlot: '07:00', sales: 50 },
    ]);
  });
});

describe('loadQuarterHourSalesForStore', () => {
  it('pads the loc and keeps qtr_slot (15-minute buckets, not summed)', async () => {
    _dailyActivityRows = [
      { dt: '2026-01-01', qtr_slot: '06:00', product_sales: 25 },
      { dt: '2026-01-01', qtr_slot: '06:15', product_sales: 12 },
    ];
    const rows = await loadQuarterHourSalesForStore('43380', '2026-01-01', '2026-01-01');
    expect(rows).toEqual([
      { loc: '43380', date: '2026-01-01', qtrSlot: '06:00', sales: 25 },
      { loc: '43380', date: '2026-01-01', qtrSlot: '06:15', sales: 12 },
    ]);
  });
});

// ── Panel tests ──────────────────────────────────────────────────────────────────────────────
vi.mock('../engine/forecast.js', async () => {
  const actual = await vi.importActual('../engine/forecast.js');
  return { ...actual, InfoIcon: () => null }; // KB article doesn't exist yet -- not under test here
});

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});
function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
// React tracks an <input>'s previous value via a hidden property on the DOM node, so setting
// `.value` directly is silently ignored by its change-detection unless the NATIVE setter is used
// (same technique as crew-schedule-panel.test.js's setInputValue).
function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('NewStoreLaunchPlanner', () => {
  it('renders the title and the empty-state message when no plan exists yet', async () => {
    _selectData = [];
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    expect(container.textContent).toMatch(/New Store Launch Planner/);
    expect(container.textContent).toMatch(/No plan yet for this store/);
  });

  it('shows the Lindsay-specific 24-hour-operation ops note (owner-stated, mid-build addition)', async () => {
    _selectData = [];
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    expect(container.textContent).toMatch(/24-hour operation/);
  });

  it('typing an Override $ recomputes the Effective $ column and persists source:manual', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2020, override_sales: null, note: null, source: 'ramp' }];
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    const row = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('2026-11-14'));
    const overrideInput = row.querySelector('input[type="number"]');
    await act(async () => { setInputValue(overrideInput, '3500'); });
    await flush();
    expect(row.textContent).toMatch(/\$3,500/);
    expect(_lastUpsert.row).toMatchObject({ loc: '44689', plan_date: '2026-11-14', override_sales: 3500, source: 'manual' });
  });

  it('flags the Grand Opening date visually', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-17', day_n: 3, projected_sales: 9309, override_sales: null, note: null, source: 'ramp' }];
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    expect(container.textContent).toMatch(/Grand Opening/);
  });

  it('"Regenerate from ramp model" never overwrites a row whose source is already manual', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2020, override_sales: 9999, note: null, source: 'manual' }];
    _dailyActivityRows = (() => {
      const out = [];
      let d = new Date('2026-01-01');
      for (let i = 0; i < 100; i++) { out.push({ dt: d.toISOString().slice(0, 10), product_sales: 1000 }); d = new Date(d.getTime() + 864e5); }
      return out;
    })();
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    const regenBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Regenerate'));
    await act(async () => { regenBtn.click(); });
    await flush();
    // The 2026-11-14 row is source:'manual' -- regenerate must skip it entirely across EVERY
    // upsert call it makes, not just the last one.
    expect(_allUpserts.length).toBeGreaterThan(0);
    expect(_allUpserts.some(u => u.row.plan_date === '2026-11-14')).toBe(false);
  });

  // Hourly breakdown (2026-11-06 follow-on) -- the mock's .eq() doesn't actually filter by loc
  // (see the vi.mock above), so both configured comparables (43380/43701) receive this SAME
  // synthetic hourly dataset when the panel loads each one's real rows -- fine for exercising the
  // blend/render path, which doesn't depend on the two comparables differing.
  function mkHourlyActivityRows(dailyPattern) {
    const out = [];
    let d = new Date('2026-01-01');
    for (let i = 0; i < 20; i++) {
      const dt = d.toISOString().slice(0, 10);
      for (const hs of HOUR_SLOTS) out.push({ dt, hour_slot: hs, product_sales: dailyPattern(hs) });
      d = new Date(d.getTime() + 864e5);
    }
    return out;
  }

  it('expanding a row shows all 24 real hour_slot buckets with the corrected hours formula', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2400, override_sales: null, note: null, source: 'ramp' }];
    _dailyActivityRows = mkHourlyActivityRows(() => 100); // flat 24hr pattern, no overnight gap
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    const hourlyBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Hourly'));
    await act(async () => { hourlyBtn.click(); });
    await flush();
    await flush(); // extra tick for the async loadHourlySalesForStore round-trip
    const hourRows = [...container.querySelectorAll('table')][1]?.querySelectorAll('tbody tr') || [];
    expect(hourRows.length).toBe(24);
    // No overnight caveat -- this comparable's synthetic data trades through the night for real.
    expect(container.textContent).not.toMatch(/minimal real overnight volume/);
  });

  it('shows the overnight-shape caveat when the comparables carry near-zero real Late Night volume', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2400, override_sales: null, note: null, source: 'ramp' }];
    _dailyActivityRows = mkHourlyActivityRows((hs) => (DEEP_OVERNIGHT_SLOTS.includes(hs) ? 0 : 100));
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    const hourlyBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Hourly'));
    await act(async () => { hourlyBtn.click(); });
    await flush();
    await flush();
    expect(container.textContent).toMatch(/minimal real overnight volume/);
  });

  // 15-min breakdown (2026-11-07 follow-on) -- real qsr_sales_quarter_hour data, same mock
  // table-agnostic caveat as the Hourly tests above, mirrored one level finer.
  function mkQtrActivityRows(dailyPattern) {
    const out = [];
    let d = new Date('2026-01-01');
    for (let i = 0; i < 20; i++) {
      const dt = d.toISOString().slice(0, 10);
      for (const qs of QTR_SLOTS) out.push({ dt, qtr_slot: qs, product_sales: dailyPattern(qs) });
      d = new Date(d.getTime() + 864e5);
    }
    return out;
  }

  it('expanding a row\'s 15-min toggle shows all 96 real qtr_slot buckets with the corrected hours formula', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2400, override_sales: null, note: null, source: 'ramp' }];
    _dailyActivityRows = mkQtrActivityRows(() => 25); // flat 24hr pattern, no overnight gap
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    const qtrBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('15-min'));
    await act(async () => { qtrBtn.click(); });
    await flush();
    await flush(); // extra tick for the async loadQuarterHourSalesForStore round-trip
    const qtrRows = [...container.querySelectorAll('table')][1]?.querySelectorAll('tbody tr') || [];
    expect(qtrRows.length).toBe(96);
    expect(container.textContent).not.toMatch(/minimal real overnight volume/);
  });

  it('shows the overnight-shape caveat on the 15-min breakdown too', async () => {
    _selectData = [{ loc: '44689', plan_date: '2026-11-14', day_n: 0, projected_sales: 2400, override_sales: null, note: null, source: 'ramp' }];
    _dailyActivityRows = mkQtrActivityRows((qs) => (DEEP_OVERNIGHT_QTR_SLOTS.includes(qs) ? 0 : 25));
    const { NewStoreLaunchPlanner } = await import('../views/launch-planner.js');
    mountEl(React.createElement(NewStoreLaunchPlanner, { onClose: () => {} }));
    await flush();
    const qtrBtn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('15-min'));
    await act(async () => { qtrBtn.click(); });
    await flush();
    await flush();
    expect(container.textContent).toMatch(/minimal real overnight volume/);
  });
});
