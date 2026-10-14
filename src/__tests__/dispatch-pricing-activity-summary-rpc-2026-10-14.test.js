// @ts-nocheck
// Owner report 2026-10-14: "Need to get pricing data in the app. not loading" -- the app's own
// DATA INCOMPLETE banner named qsr_menu_item_activity. Live-measured root cause: the table has
// grown to 627,939 rows / 398,273 in the default 30-day window, and src/lib/supabase.js's
// loadQsrMenuItemActivity() pulled every raw row via fetchAll()'s STRICTLY SEQUENTIAL pagination
// (~400 serial round-trips for the default view) -- far past the point some page times out.
//
// enrichItemMargins() (engine/pricing-engine.js) only ever needed the SUM of waste/comp/promo/
// activity per (loc, item_number) across the window, so the fix moves that SUM/GROUP BY into
// Postgres (schema-qsr-menu-item-activity-summary-rpc.sql's qsr_menu_item_activity_summary()) and
// has loadQsrMenuItemActivitySummary() (src/lib/supabase.js) call it via supabase.rpc(), then
// synthesize one already-summed row per (loc, item_number) in the exact raw-row shape
// enrichItemMargins() already parses -- so enrichItemMargins() itself needed no changes.
//
// This suite covers the NEW loader directly: the RPC is called with the right date args, its
// result is mapped into enrichItemMargins()-compatible rows, and -- since the SQL migration is a
// manual owner step, same as every other schema-*.sql file in this repo -- a "function not found"
// RPC error falls back to the old full-row loader rather than breaking the panel.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [] };
  const builder = {
    select() { return builder; },
    in() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    range(from, to) { return Promise.resolve({ data: cfg.rows.slice(from, to + 1), error: null }); },
  };
  return builder;
}

let __rpcCalls;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => mkBuilder(table),
    rpc: (name, params) => {
      __rpcCalls.push({ name, params });
      const cfg = __fakeConfig.__rpc || {};
      if (cfg.error) return Promise.resolve({ data: null, error: cfg.error });
      return Promise.resolve({ data: cfg.rows || [], error: null });
    },
  }),
}));

let loadQsrMenuItemActivitySummary;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  __rpcCalls = [];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadQsrMenuItemActivitySummary } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('loadQsrMenuItemActivitySummary (dispatch 2026-10-14)', () => {
  it('calls the RPC with the dateRange as ISO day strings, not a raw Date/the full table', async () => {
    __fakeConfig.__rpc = { rows: [] };
    await loadQsrMenuItemActivitySummary({ dateRange: { start: new Date(2026, 8, 13), end: new Date(2026, 9, 13) } });
    expect(__rpcCalls.length).toBe(1);
    expect(__rpcCalls[0].name).toBe('qsr_menu_item_activity_summary');
    expect(__rpcCalls[0].params).toEqual({ p_start: '2026-09-13', p_end: '2026-10-13' });
  });

  it('passes null/null for an "All Time" (no dateRange) call -- still one request, not a full-table pull', async () => {
    __fakeConfig.__rpc = { rows: [] };
    await loadQsrMenuItemActivitySummary({});
    expect(__rpcCalls[0].params).toEqual({ p_start: null, p_end: null });
  });

  it('maps each summary row into enrichItemMargins()-compatible shape: comp already combines emp_meal+mgr_meal', async () => {
    __fakeConfig.__rpc = { rows: [
      { loc: '0010034', item_number: 5, waste: 3, comp: 7, promo: 1, activity: 200 },
    ] };
    const rows = await loadQsrMenuItemActivitySummary({ dateRange: { start: '2026-09-13', end: '2026-10-13' } });
    expect(rows).toEqual([{
      loc: '0010034', itemNumber: 5, date: '2026-09-13',
      waste: 3, empMeal: 7, mgrMeal: 0, promo: 1, activity: 200,
    }]);
  });

  it('one summary row per item reproduces the SAME enrichItemMargins() output as summing many raw rows', async () => {
    const { enrichItemMargins } = await import('../engine/pricing-engine.js');
    const marginRows = [{ loc: '0010034', itemNumber: 5, foodCost: 1, paperCost: 0.5 }];

    // Old shape: three raw daily rows for the same item/window.
    const rawRows = [
      { loc: '0010034', itemNumber: 5, date: '2026-09-20', waste: 1, empMeal: 2, mgrMeal: 0, promo: 0, activity: 80 },
      { loc: '0010034', itemNumber: 5, date: '2026-09-21', waste: 1, empMeal: 1, mgrMeal: 1, promo: 1, activity: 60 },
      { loc: '0010034', itemNumber: 5, date: '2026-09-22', waste: 1, empMeal: 4, mgrMeal: 0, promo: 0, activity: 60 },
    ];
    const viaRaw = enrichItemMargins(marginRows, rawRows, { dateRange: { start: '2026-09-13', end: '2026-10-13' } });

    // New shape: one pre-summed row from the RPC (waste=3, comp=2+1+1+4=8, promo=1, activity=200).
    __fakeConfig.__rpc = { rows: [{ loc: '0010034', item_number: 5, waste: 3, comp: 8, promo: 1, activity: 200 }] };
    const summaryRows = await loadQsrMenuItemActivitySummary({ dateRange: { start: '2026-09-13', end: '2026-10-13' } });
    const viaSummary = enrichItemMargins(marginRows, summaryRows, { dateRange: { start: '2026-09-13', end: '2026-10-13' } });

    expect(viaSummary[0].wasteUnits).toBe(viaRaw[0].wasteUnits);
    expect(viaSummary[0].compUnits).toBe(viaRaw[0].compUnits);
    expect(viaSummary[0].promoUnits).toBe(viaRaw[0].promoUnits);
    expect(viaSummary[0].activityUnits).toBe(viaRaw[0].activityUnits);
    expect(viaSummary[0].wasteDollars).toBeCloseTo(viaRaw[0].wasteDollars, 6);
  });

  it('falls back to the full-row loader when the RPC is not installed yet (PGRST202), instead of breaking the panel', async () => {
    __fakeConfig.__rpc = { error: { message: 'Could not find the function public.qsr_menu_item_activity_summary(date, date) in the schema cache', code: 'PGRST202' } };
    __fakeConfig.qsr_menu_item_activity = { rows: [
      { loc: '0010034', store_menuitem_id: 1, date: '2026-09-20', item_number: 5, activity: 80, sold: 70, emp_meal: 2, mgr_meal: 0, waste: 1, promo: 0, free_choice_qty: 0, food_cost: 1, paper_cost: 0.5, total_cost: 1.5, last_close_business_date: '2026-09-20', updated_at: '2026-09-21' },
    ] };
    const rows = await loadQsrMenuItemActivitySummary({ dateRange: { start: '2026-09-13', end: '2026-10-13' } });
    expect(rows.length).toBe(1);
    expect(rows[0].itemNumber).toBe(5); // the raw-loader's camelCase shape, proving the fallback path ran
    expect(rows[0].waste).toBe(1);
  });
});
