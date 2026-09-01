// @ts-nocheck
// Owner-directed 2026-09-01: "Should probably add it to a table so it is persisted. The count
// days." loadWeeklyCountDayOverrides()/saveWeeklyCountDayOverrides() (src/lib/supabase.js)
// read/write the REAL `weekly_count_day_overrides` table (schema-weekly-count-day.sql), one row
// per store -- replacing this feature's first-shipped org_config-JSON-blob draft. Mocked-client
// technique matches eom-digest-config.test.js's own precedent for exercising the real
// src/lib/supabase.js functions against a fake supabase-js client.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _mockRows = [];       // weekly_count_day_overrides rows currently "in the table"
let _mockErrorOnce = null;
let _lastUpsert = null;   // { table, rows, opts }

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => {
        if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
        return Promise.resolve({ data: _mockRows, error: null });
      },
      upsert: (rows, opts) => {
        _lastUpsert = { table, rows, opts };
        if (_mockErrorOnce) { const err = _mockErrorOnce; _mockErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  }),
}));

const { loadWeeklyCountDayOverrides, saveWeeklyCountDayOverrides } = await import('../lib/supabase.js');

beforeEach(() => { _mockRows = []; _mockErrorOnce = null; _lastUpsert = null; });

describe('loadWeeklyCountDayOverrides', () => {
  it('returns {} when the table is empty (no upload yet)', async () => {
    expect(await loadWeeklyCountDayOverrides()).toEqual({});
  });

  it('maps real table rows to { [loc]: weekdayName }', async () => {
    _mockRows = [
      { loc: '3708', weekday_name: 'Tuesday' },
      { loc: '5183', weekday_name: 'Thursday' },
    ];
    expect(await loadWeeklyCountDayOverrides()).toEqual({ '3708': 'Tuesday', '5183': 'Thursday' });
  });

  it('degrades to {} on a query error (e.g. the migration has not been run yet) instead of throwing', async () => {
    _mockErrorOnce = { message: 'relation "weekly_count_day_overrides" does not exist' };
    expect(await loadWeeklyCountDayOverrides()).toEqual({});
  });
});

describe('saveWeeklyCountDayOverrides', () => {
  it('upserts one row per store, converting the weekday NAME to a NUMBER for the typed column', async () => {
    const res = await saveWeeklyCountDayOverrides({ '3708': 'Tuesday', '5183': 'Thursday' });
    expect(res).toEqual({ saved: true, count: 2 });
    expect(_lastUpsert.table).toBe('weekly_count_day_overrides');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'tenant_id,loc' });
    const byLoc = {}; for (const r of _lastUpsert.rows) byLoc[r.loc] = r;
    expect(byLoc['3708']).toMatchObject({ loc: '3708', weekday: 2, weekday_name: 'Tuesday' });
    expect(byLoc['5183']).toMatchObject({ loc: '5183', weekday: 4, weekday_name: 'Thursday' });
  });

  it('skips an entry with an unrecognized weekday name rather than writing a bad row', async () => {
    const res = await saveWeeklyCountDayOverrides({ '3708': 'Tuesday', '9999': 'Funday' });
    expect(res.count).toBe(1);
    expect(_lastUpsert.rows).toHaveLength(1);
    expect(_lastUpsert.rows[0].loc).toBe('3708');
  });

  it('an empty map is a no-op, not an empty upsert call', async () => {
    const res = await saveWeeklyCountDayOverrides({});
    expect(res).toEqual({ saved: true, count: 0 });
    expect(_lastUpsert).toBeNull();
  });

  it('surfaces a real write error instead of swallowing it', async () => {
    _mockErrorOnce = { message: 'permission denied' };
    const res = await saveWeeklyCountDayOverrides({ '3708': 'Tuesday' });
    expect(res).toEqual({ saved: false, error: 'permission denied' });
  });
});
