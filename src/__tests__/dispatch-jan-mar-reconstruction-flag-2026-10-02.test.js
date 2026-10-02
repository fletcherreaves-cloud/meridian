// @ts-nocheck
// Owner request 2026-10-02: backfill the missing Jan-Mar 2026 monthly_targets months with a
// strictly-leak-free reconstruction, "flag them clearly" so a reconstructed row is never
// mistaken for a real approved target. monthly_targets.updated_by is a uuid FK to profiles(id)
// (supabase/schema.sql) -- it cannot carry a free-text marker without misattributing the
// reconstruction as a person's edit -- so this adds a dedicated nullable `data_source` column
// (supabase/schema-monthly-targets-data-source-flag.sql), wired into save (always clears it on a
// real upload) + both load functions (maps it back to `_dataSource`) + the Monthly Projections
// grid (period banner + per-store row badge). See memory/finding-jan-mar-2026-reconstruction-
// 2026-10-02.md for the reconstruction methodology itself.
import { describe, it, expect, beforeEach, vi } from 'vitest';

let _mockRows = [];
let _upsertedBatches = [];
let _upsertErrorOnce = null; // set to an error object to make the NEXT upsert call fail

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          then: (resolve) => resolve({ data: _mockRows, error: null }),
        };
        return chain;
      },
      upsert: (rows) => {
        _upsertedBatches.push(rows);
        if (_upsertErrorOnce) {
          const err = _upsertErrorOnce;
          _upsertErrorOnce = null;
          return Promise.resolve({ error: err });
        }
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const { saveMonthlyTargets, loadMonthlyTargets, loadAllMonthlyTargets } = await import('../lib/supabase.js');

beforeEach(() => { _mockRows = []; _upsertedBatches = []; _upsertErrorOnce = null; });

describe('monthly_targets.data_source reconstruction flag (2026-10-02)', () => {
  it('saveMonthlyTargets sends data_source: null on every real upload (clears any prior reconstruction flag)', async () => {
    await saveMonthlyTargets({ '3708': { tProdSales: 342661, tCrewLabor: 0.221 } }, 2026, 1);
    expect(_upsertedBatches).toHaveLength(1);
    expect(_upsertedBatches[0][0].data_source).toBeNull();
  });

  it('a column-missing error on data_source retries once WITHOUT it, same self-healing shape as the smg_fullscale/n precedent -- never breaks a real upload before the migration is run', async () => {
    _upsertErrorOnce = { message: `column "data_source" of relation "monthly_targets" does not exist` };
    const result = await saveMonthlyTargets({ '3708': { tProdSales: 342661, tCrewLabor: 0.221 } }, 2026, 1);
    expect(_upsertedBatches).toHaveLength(2);
    expect('data_source' in _upsertedBatches[0][0]).toBe(true);
    expect('data_source' in _upsertedBatches[1][0]).toBe(false);
    expect(result.saved).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('an unrelated upsert error is NOT swallowed by the self-healing retry (only the exact data_source-missing shape retries)', async () => {
    _upsertErrorOnce = { message: 'permission denied for table monthly_targets' };
    const result = await saveMonthlyTargets({ '3708': { tProdSales: 342661 } }, 2026, 1);
    expect(_upsertedBatches).toHaveLength(1); // no retry attempted
    expect(result.saved).toBe(0);
    expect(result.errors[0]).toMatch(/permission denied/);
  });

  it('loadMonthlyTargets maps data_source back to _dataSource', async () => {
    _mockRows = [{ loc: '3708', year: 2026, month: 1, sales_proj: 342661, data_source: 'reconstructed_leak_free_2026-10-02' }];
    const mt = await loadMonthlyTargets(2026, 1);
    expect(mt['3708']._dataSource).toBe('reconstructed_leak_free_2026-10-02');
  });

  it('loadMonthlyTargets strips a null/absent data_source to an absent key, same as every other column (#166 behavior) -- real rows never carry a false reconstruction flag', async () => {
    _mockRows = [{ loc: '3708', year: 2026, month: 4, sales_proj: 350000, data_source: null }];
    const mt = await loadMonthlyTargets(2026, 4);
    expect('_dataSource' in mt['3708']).toBe(false);
  });

  it('loadAllMonthlyTargets round-trips _dataSource per period, same as loadMonthlyTargets', async () => {
    _mockRows = [
      { loc: '3708', year: 2026, month: 1, data_source: 'reconstructed_leak_free_2026-10-02' },
      { loc: '3708', year: 2026, month: 4, data_source: null },
    ];
    const all = await loadAllMonthlyTargets();
    expect(all['2026-1']['3708']._dataSource).toBe('reconstructed_leak_free_2026-10-02');
    expect('_dataSource' in all['2026-4']['3708']).toBe(false);
  });
});
