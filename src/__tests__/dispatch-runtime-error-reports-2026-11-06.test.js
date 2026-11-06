// @ts-nocheck
// Error telemetry capture (memory/plan-error-telemetry-auto-fix-2026-11-06.md, task #103,
// Phase 1). Mocked-client technique matches weekly-count-day-config.test.js's own precedent for
// exercising the real src/lib/supabase.js functions against a fake supabase-js client.
//
// Scope, matching the plan doc exactly: dedup upsert by fingerprint (never one row per
// occurrence), self-heal silent no-op against a missing table (owner hasn't run
// schema-runtime-error-reports.sql yet), and reportRuntimeError() must NEVER throw -- a
// telemetry failure is not something a user should ever see as a SECOND error.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _existingRow = null;     // the row reportRuntimeError's SELECT should find, or null
let _selectErrorOnce = null;
let _insertErrorOnce = null;
let _updateErrorOnce = null;
let _lastInsert = null;
let _lastUpdate = null;
let _selectCallCount = 0;
let _rowAfterNthSelect = null; // { n, row } -- override _existingRow from the Nth select() onward (1-indexed), for race-retry tests

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => {
            _selectCallCount++;
            if (_selectErrorOnce) { const err = _selectErrorOnce; _selectErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
            if (_rowAfterNthSelect && _selectCallCount >= _rowAfterNthSelect.n) {
              return Promise.resolve({ data: _rowAfterNthSelect.row, error: null });
            }
            return Promise.resolve({ data: _existingRow, error: null });
          },
        }),
      }),
      insert: (row) => {
        _lastInsert = { table, row };
        if (_insertErrorOnce) { const err = _insertErrorOnce; _insertErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
        return Promise.resolve({ data: row, error: null });
      },
      update: (fields) => ({
        eq: () => {
          _lastUpdate = { table, fields };
          if (_updateErrorOnce) { const err = _updateErrorOnce; _updateErrorOnce = null; return Promise.resolve({ data: null, error: err }); }
          return Promise.resolve({ data: fields, error: null });
        },
      }),
    }),
  }),
}));

const { reportRuntimeError } = await import('../lib/supabase.js');

beforeEach(() => {
  _existingRow = null; _selectErrorOnce = null; _insertErrorOnce = null; _updateErrorOnce = null;
  _lastInsert = null; _lastUpdate = null; _selectCallCount = 0; _rowAfterNthSelect = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('reportRuntimeError', () => {
  it('inserts a fresh row (occurrence_count:1) when no existing fingerprint is found', async () => {
    await reportRuntimeError('boom', 'Error: boom\n    at f (a.js:1:1)', 'store-dash');
    expect(_lastInsert.table).toBe('runtime_error_reports');
    expect(_lastInsert.row).toMatchObject({ message: 'boom', panel: 'store-dash', occurrence_count: 1 });
    expect(typeof _lastInsert.row.fingerprint).toBe('string');
    expect(_lastInsert.row.fingerprint.length).toBeGreaterThan(0);
    expect(_lastUpdate).toBeNull();
  });

  it('bumps occurrence_count and last_seen_at on an EXISTING fingerprint instead of inserting a second row', async () => {
    _existingRow = { id: 'row-1', occurrence_count: 4 };
    await reportRuntimeError('boom', 'Error: boom\n    at f (a.js:1:1)', 'store-dash');
    expect(_lastInsert).toBeNull();
    expect(_lastUpdate.table).toBe('runtime_error_reports');
    expect(_lastUpdate.fields.occurrence_count).toBe(5);
    expect(typeof _lastUpdate.fields.last_seen_at).toBe('string');
  });

  it('truncates an unreasonably long message/stack rather than writing an unbounded row', async () => {
    await reportRuntimeError('x'.repeat(5000), 'y'.repeat(10000), 'sage');
    expect(_lastInsert.row.message.length).toBeLessThanOrEqual(2000);
    expect(_lastInsert.row.stack.length).toBeLessThanOrEqual(4000);
  });

  it('self-heals SILENTLY (no throw, no console.warn) when the table has not been migrated yet (42P01)', async () => {
    _selectErrorOnce = { code: '42P01', message: 'relation "runtime_error_reports" does not exist' };
    await expect(reportRuntimeError('boom', 'Error: boom', 'sage')).resolves.toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
    expect(_lastInsert).toBeNull();
  });

  it('self-heals SILENTLY on the PostgREST schema-cache-miss shape (PGRST205) too', async () => {
    _selectErrorOnce = { code: 'PGRST205', message: "Could not find the table 'public.runtime_error_reports'" };
    await expect(reportRuntimeError('boom', 'Error: boom', 'sage')).resolves.toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('on a genuine (non-missing-table) select error, warns but still resolves without throwing', async () => {
    _selectErrorOnce = { code: '42703', message: 'column "fingerprint" does not exist' };
    await expect(reportRuntimeError('boom', 'Error: boom', 'sage')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('on an insert race (23505 unique violation), re-fetches and bumps the winner instead of losing the report', async () => {
    // First select (before the insert attempt): nothing found -> reportRuntimeError tries to
    // insert. The insert then fails with a unique-violation -- another writer's row for the SAME
    // fingerprint landed first. The second select (the race-retry re-fetch) must see that row.
    _existingRow = null;
    _insertErrorOnce = { code: '23505', message: 'duplicate key value violates unique constraint' };
    _rowAfterNthSelect = { n: 2, row: { id: 'winner', occurrence_count: 1 } };
    await reportRuntimeError('boom', 'Error: boom\n    at f (a.js:1:1)', 'sage');
    expect(_lastInsert).not.toBeNull(); // the losing insert attempt still happened
    expect(_lastUpdate).not.toBeNull(); // but the report was NOT lost -- it bumped the winner's row
    expect(_lastUpdate.fields.occurrence_count).toBe(2);
  });

  it('NEVER throws, even on a totally unexpected error shape', async () => {
    _selectErrorOnce = { code: 'XX000', message: 'something truly unexpected' };
    await expect(reportRuntimeError('boom', 'Error: boom', 'sage')).resolves.toBeUndefined();
  });

  it('is a safe no-op when Supabase is not configured at all', async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const mod = await import('../lib/supabase.js');
    await expect(mod.reportRuntimeError('boom', 'Error: boom', 'sage')).resolves.toBeUndefined();
    vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');
  });
});
