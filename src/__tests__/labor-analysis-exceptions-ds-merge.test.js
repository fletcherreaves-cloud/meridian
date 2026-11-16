// @ts-nocheck
// Owner request 2026-11-16 ("go ahead and wire it in its own careful pass"): wiring
// labor_analysis_daily/labor_exceptions_daily into ds.laborRows/ds.exceptionRows at App.js
// startup (see supabase.js's own header comment on these two loaders + mergeFreshRowsByLocDate,
// and App.js's loadLaborAnalysisDaily/loadLaborExceptionsDaily effects right after the
// pre-existing loadLaborRows merge). Two things actually need verifying here, independently:
//
//   1. The loaders map each table's real snake_case DB columns back to EXACTLY the camelCase
//      shape parseLaborData()/parseLaborExceptions() (the manual-upload parsers) already
//      produce — a silent name mismatch would zero-fill a field forever with no error anywhere.
//   2. The additive-merge-by-(loc,date) semantics App.js's effects rely on: existing rows
//      (manual upload, or an earlier-resolved cloud load) ALWAYS win on a key already present;
//      the new loaders only ever fill genuinely uncovered days. This is extracted into
//      mergeFreshRowsByLocDate (lib/supabase.js) specifically so it is one tested unit instead
//      of inline logic duplicated across two effects — App.js calls this exact function, not a
//      reimplementation of it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The exact column list from supabase/schema-labor-analysis-exceptions-email.sql's
// labor_analysis_daily table (everything but loc/date/tenant_id/updated_at, which
// mapLaborAnalysis sets separately) — copied from the real DDL, not derived from the code
// under test, so this can't pass by agreeing with its own bug.
const REAL_LABOR_ANALYSIS_COLUMNS = new Set([
  'sales','all_net_sales','proj_sales','gc','actual_gc','opp_cost_pct','opp_cost_dollar','avg_check',
  'tpph','spph','act_vs_need','punch_labor_pct','crew_labor_pct','total_labor_pct','ot_hrs','ot_dollar',
  'act_hrs','avg_rate','salary_mgr_hrs','fixed_contract_hrs','fixed_sched_hrs','variable_needed',
  'floor_mgmt_needed','floor_hrs_sched','sales_vs_ly_pct',
  'dt_sales','dt_gc','dt_avg_chk','dt_pct_total','bf_sales','bf_gc','bf_avg_chk','bf_pct_total',
  'deliv_sales','deliv_gc','deliv_avg_chk','deliv_pct_total','mop_sales','mop_gc','mop_avg_chk','mop_pct_total',
  'kiosk_sales','kiosk_gc','kiosk_avg_chk','kiosk_pct_total','eat_in_sales','eat_in_gc',
  'in_store_sales','in_store_gc','in_store_pct_total','fc_sales','fc_gc','fc_pct_total',
]);

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [] };
  const calls = cfg.calls || (cfg.calls = { gte: [] });
  const builder = {
    select(_cols, opts) { builder._headMode = !!(opts && opts.head); return builder; },
    gte(col, val) { calls.gte.push([col, val]); return builder; },
    in() { return builder; },
    order() { return builder; },
    range(from, to) {
      return Promise.resolve({ data: cfg.rows.slice(from, to + 1), error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ count: cfg.rows.length, error: null, data: null }).then(resolve, reject);
    },
  };
  return builder;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

let loadLaborAnalysisDaily, loadLaborExceptionsDaily, mergeFreshRowsByLocDate;
let toSnake, LABOR_ANALYSIS_FIELDS, mapLaborAnalysis;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  // Stubbed explicitly (not relying on this sandbox's own ambient Supabase env vars) so this
  // test is deterministic anywhere, including CI, which may have neither var set — the
  // write-side script's module-top-level code calls process.exit(1) if both are missing, which
  // would otherwise take down the whole vitest worker rather than failing one test.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadLaborAnalysisDaily, loadLaborExceptionsDaily, mergeFreshRowsByLocDate } = await import('../lib/supabase.js'));
  // qsrsoft-email-parse.mjs guards its real main() behind an import.meta.url===process.argv[1]
  // check (never true under vitest), so importing it here only loads the pure functions —
  // createClient is still the mocked one from vi.mock above, never a real network call.
  ({ toSnake, LABOR_ANALYSIS_FIELDS, mapLaborAnalysis } = await import('../../scripts/qsrsoft-email-parse.mjs'));
});
afterEach(() => { vi.unstubAllEnvs(); });

// A realistic row shaped exactly like scripts/qsrsoft-email-parse.mjs's mapLaborAnalysis() would
// write it — real snake_case column names, not an invented shape.
function laRow(overrides = {}) {
  return {
    loc: '3708', date: '2026-11-10',
    sales: 12000, all_net_sales: 12000, proj_sales: 11500, gc: 1200, actual_gc: 1180,
    opp_cost_pct: 0.5, opp_cost_dollar: 60, avg_check: 10.0,
    tpph: 45.2, spph: 55.1, act_vs_need: 1.02,
    punch_labor_pct: 28.4, crew_labor_pct: 24.1, total_labor_pct: 28.4,
    ot_hrs: 12.5, ot_dollar: 187.5, act_hrs: 310, avg_rate: 15.0,
    salary_mgr_hrs: 40, fixed_contract_hrs: 0, fixed_sched_hrs: 40,
    variable_needed: 270, floor_mgmt_needed: 40, floor_hrs_sched: 36,
    sales_vs_ly_pct: 3.1,
    dt_sales: 7000, dt_gc: 700, dt_avg_chk: 10.0, dt_pct_total: 58.3,
    bf_sales: 1500, bf_gc: 200, bf_avg_chk: 7.5, bf_pct_total: 12.5,
    deliv_sales: 300, deliv_gc: 25, deliv_avg_chk: 12.0, deliv_pct_total: 2.5,
    mop_sales: 2000, mop_gc: 180, mop_avg_chk: 11.1, mop_pct_total: 16.7,
    kiosk_sales: 500, kiosk_gc: 45, kiosk_avg_chk: 11.1, kiosk_pct_total: 4.2,
    eat_in_sales: 1800, eat_in_gc: 160,
    in_store_sales: 5000, in_store_gc: 480, in_store_pct_total: 41.7,
    fc_sales: 200, fc_gc: 18, fc_pct_total: 1.7,
    tenant_id: 't1', updated_at: '2026-11-10T12:00:00Z',
    ...overrides,
  };
}

describe('WRITE SIDE — scripts/qsrsoft-email-parse.mjs toSnake vs. the real labor_analysis_daily schema', () => {
  // This is the bug this pass actually caught: toSnake used to insert an underscore before
  // EVERY uppercase letter (k.replace(/([A-Z])/g,'_$1')), which splits consecutive capitals
  // apart — mopGC -> mop_g_c, actualGC -> actual_g_c — none of which are real columns. Every
  // upsert() call carrying one of those 9 "...GC" fields would have failed outright with a
  // Postgres 42703 unknown-column error (upsertRows() logs it and `continue`s, so the failure
  // is silent to anything but this test or the script's own console output), since
  // labor_analysis_daily went live TODAY (v5.804) with no prior coverage of this mapping
  // against the real schema.
  it('every LABOR_ANALYSIS_FIELDS entry resolves, via toSnake, to a column that really exists', () => {
    const resolved = LABOR_ANALYSIS_FIELDS.map(toSnake);
    const bad = resolved.filter(c => !REAL_LABOR_ANALYSIS_COLUMNS.has(c));
    expect(bad).toEqual([]);
    expect(resolved).toHaveLength(REAL_LABOR_ANALYSIS_COLUMNS.size); // one-to-one, no dupes either direction
  });

  it('mapLaborAnalysis() builds an upsert payload keyed ONLY by real column names', () => {
    const row = Object.fromEntries(LABOR_ANALYSIS_FIELDS.map(k => [k, 1]));
    row.loc = '3708'; row.date = '2026-11-15';
    const payload = mapLaborAnalysis(row);
    for (const key of Object.keys(payload)) {
      if (['loc', 'date', 'updated_at'].includes(key)) continue;
      expect(REAL_LABOR_ANALYSIS_COLUMNS.has(key)).toBe(true);
    }
  });

  it('specifically regresses the two acronym cases the generic regex cannot resolve alone', () => {
    expect(toSnake('mopGC')).toBe('mop_gc');       // was mop_g_c
    expect(toSnake('actualGC')).toBe('actual_gc'); // was actual_g_c
    expect(toSnake('salesVsLYPct')).toBe('sales_vs_ly_pct'); // was sales_vs_lypct — explicit override
  });
});

describe('loadLaborAnalysisDaily field mapping (real labor_analysis_daily columns)', () => {
  it('maps every snake_case DB column to parseLaborData()\'s exact camelCase field name', async () => {
    __fakeConfig.labor_analysis_daily = { rows: [laRow()] };
    const [row] = await loadLaborAnalysisDaily();
    expect(row.loc).toBe('3708');
    expect(row.date).toBeInstanceOf(Date);
    expect(row.isPeriodSummary).toBe(false);
    // Spot-check across the full width of the table, not just the first few columns — the
    // riskiest mismatches (dtPctTotal vs dt_pct_total, fcGC vs fc_gc) sit at the tail.
    expect(row.punchLaborPct).toBe(28.4);
    expect(row.crewLaborPct).toBe(24.1);
    expect(row.tpph).toBe(45.2);
    expect(row.actVsNeed).toBe(1.02);
    expect(row.dtPctTotal).toBe(58.3);
    expect(row.bfAvgChk).toBe(7.5);
    expect(row.delivPctTotal).toBe(2.5);
    expect(row.mopGC).toBe(180);
    expect(row.kioskAvgChk).toBe(11.1);
    expect(row.eatInGC).toBe(160);
    expect(row.inStorePctTotal).toBe(41.7);
    expect(row.fcGC).toBe(18);
    expect(row.salesVsLYPct).toBe(3.1);
  });

  it('derives laborPct and floorCompliance exactly like parseLaborData() does', async () => {
    __fakeConfig.labor_analysis_daily = { rows: [laRow({ punch_labor_pct: 27.9, floor_hrs_sched: 36, floor_mgmt_needed: 40 })] };
    const [row] = await loadLaborAnalysisDaily();
    expect(row.laborPct).toBe(27.9); // alias of punchLaborPct
    expect(row.floorCompliance).toBeCloseTo(36 / 40, 10);
  });

  it('floorCompliance is null when floorMgmtNeeded is 0 (no divide-by-zero)', async () => {
    __fakeConfig.labor_analysis_daily = { rows: [laRow({ floor_mgmt_needed: 0, floor_hrs_sched: 0 })] };
    const [row] = await loadLaborAnalysisDaily();
    expect(row.floorCompliance).toBeNull();
  });

  it('a column missing from the row maps to null, not undefined (never silently dropped)', async () => {
    const sparse = laRow();
    delete sparse.kiosk_gc;
    __fakeConfig.labor_analysis_daily = { rows: [sparse] };
    const [row] = await loadLaborAnalysisDaily();
    expect(row.kioskGC).toBeNull();
  });
});

describe('loadLaborExceptionsDaily field mapping (real labor_exceptions_daily columns)', () => {
  it('maps snake_case aggregate counts to the camelCase shape joinDaily()/coverage checks expect', async () => {
    __fakeConfig.labor_exceptions_daily = {
      rows: [{
        loc: '3708', date: '2026-11-10',
        total_exceptions: 7, missed_breaks: 2, early_out: 1, late_in: 1, ot_exceptions: 3, minor_exceptions: 0,
        tenant_id: 't1', updated_at: '2026-11-10T12:00:00Z',
      }],
    };
    const [row] = await loadLaborExceptionsDaily();
    expect(row).toMatchObject({
      loc: '3708', totalExceptions: 7, missedBreaks: 2, earlyOut: 1, lateIn: 1, otExceptions: 3, minorExceptions: 0,
    });
    expect(row.date).toBeInstanceOf(Date);
  });

  it('a missing count column defaults to 0, not null — these are summed, never displayed as "-"', async () => {
    __fakeConfig.labor_exceptions_daily = { rows: [{ loc: '3708', date: '2026-11-10' }] };
    const [row] = await loadLaborExceptionsDaily();
    expect(row).toMatchObject({ totalExceptions: 0, missedBreaks: 0, earlyOut: 0, lateIn: 0, otExceptions: 0, minorExceptions: 0 });
  });
});

describe('mergeFreshRowsByLocDate — the exact merge App.js calls for both new effects', () => {
  it('a cloud row on a (loc,date) already covered by an existing row never overwrites it', () => {
    const existing = [{ loc: '3708', date: new Date('2026-11-10T00:00:00'), sales: 999, _source: 'manual' }];
    const fresh = [{ loc: '3708', date: new Date('2026-11-10T00:00:00'), sales: 1, _source: 'cloud' }];
    const { fresh: added, merged } = mergeFreshRowsByLocDate(existing, fresh);
    expect(added).toEqual([]);
    expect(merged).toEqual(existing);
    expect(merged[0]._source).toBe('manual');
  });

  it('a cloud row on a genuinely new (loc,date) key is appended', () => {
    const existing = [{ loc: '3708', date: new Date('2026-11-10T00:00:00') }];
    const fresh = [{ loc: '3708', date: new Date('2026-11-11T00:00:00') }, { loc: '5183', date: new Date('2026-11-10T00:00:00') }];
    const { fresh: added, merged } = mergeFreshRowsByLocDate(existing, fresh);
    expect(added).toHaveLength(2);
    expect(merged).toHaveLength(3);
  });

  it('matches keys across Date-object and string date representations identically', () => {
    const existing = [{ loc: '3708', date: '2026-11-10' }]; // string, as a freshly-parsed manual upload might carry momentarily
    const fresh = [{ loc: '3708', date: new Date('2026-11-10T00:00:00') }]; // Date, as every loader in this file returns
    const { fresh: added } = mergeFreshRowsByLocDate(existing, fresh);
    expect(added).toEqual([]);
  });

  it('returns the SAME array reference when nothing is added (no unnecessary re-render)', () => {
    const existing = [{ loc: '3708', date: new Date('2026-11-10T00:00:00') }];
    const { merged } = mergeFreshRowsByLocDate(existing, [{ loc: '3708', date: new Date('2026-11-10T00:00:00') }]);
    expect(merged).toBe(existing);
  });

  it('handles an empty/undefined existing array (first-ever load)', () => {
    const fresh = [{ loc: '3708', date: new Date('2026-11-10T00:00:00') }];
    const { fresh: added, merged } = mergeFreshRowsByLocDate(undefined, fresh);
    expect(added).toHaveLength(1);
    expect(merged).toHaveLength(1);
  });
});
