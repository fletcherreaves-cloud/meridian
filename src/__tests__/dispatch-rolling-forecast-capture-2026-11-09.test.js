// @ts-nocheck
// Rolling Forecast — Commit & Drift (owner-directed 2026-11-09). Covers:
//  1. The pure drift engine (src/engine/forecast-drift.js) — tier boundaries both directions,
//     freshestCapture/committedCapture edge cases.
//  2. The self-healing Supabase helpers (loadRollingCaptures/loadCommits/loadAllCommits/
//     saveCommit, src/lib/supabase.js) against a mocked supabase-js client, same technique as
//     dispatch-launch-planner-2026-11-06.test.js's saveLaunchPlanRow/loadLaunchPlan coverage.
//  3. scripts/forecast-rolling-capture.mjs's pure date-window logic (mondayOf/fmtDate/addDays) —
//     no network calls, no forecastDay mocking needed since these helpers have zero IO.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeDrift, freshestCapture, committedCapture, DRIFT_WATCH_MULTIPLIER,
} from '../engine/forecast-drift.js';

// ── 1. Pure drift engine ──────────────────────────────────────────────────────────────────────
describe('computeDrift', () => {
  it('returns null with no commit (committedValue falsy/0)', () => {
    expect(computeDrift(1000, 0)).toBeNull();
    expect(computeDrift(1000, null)).toBeNull();
    expect(computeDrift(1000, undefined)).toBeNull();
  });
  it('returns null when liveValue is missing or non-finite', () => {
    expect(computeDrift(null, 1000)).toBeNull();
    expect(computeDrift(undefined, 1000)).toBeNull();
    expect(computeDrift(NaN, 1000)).toBeNull();
  });
  it('on-track: exactly at the tolerance boundary (|delta%| === tolerance)', () => {
    // committed 1000, tolerance 5% -> 1050 is EXACTLY +5%, must be on-track (<=), not watching
    const d = computeDrift(1050, 1000, 5);
    expect(d.tier).toBe('on-track');
    expect(d.deltaPct).toBeCloseTo(5, 5);
  });
  it('on-track: just inside the boundary', () => {
    expect(computeDrift(1049.99, 1000, 5).tier).toBe('on-track');
    expect(computeDrift(950.01, 1000, 5).tier).toBe('on-track');
  });
  it('watching: just past the on-track boundary, both directions', () => {
    expect(computeDrift(1050.01, 1000, 5).tier).toBe('watching');
    expect(computeDrift(949.99, 1000, 5).tier).toBe('watching');
  });
  it('watching: exactly at the watching/alert boundary (|delta%| === tolerance*MULTIPLIER)', () => {
    // 2x tolerance (10%) is still watching (<=), not yet alert
    const d = computeDrift(1100, 1000, 5);
    expect(d.tier).toBe('watching');
    expect(DRIFT_WATCH_MULTIPLIER).toBe(2);
  });
  it('alert: just past the watching boundary, both directions', () => {
    expect(computeDrift(1100.01, 1000, 5).tier).toBe('alert');
    expect(computeDrift(899.99, 1000, 5).tier).toBe('alert');
  });
  it('alert: a large swing either direction', () => {
    expect(computeDrift(1500, 1000, 5).tier).toBe('alert');
    expect(computeDrift(500, 1000, 5).tier).toBe('alert');
  });
  it('defaults tolerance to 5 when omitted, matching forecastDay\'s own settings.tolerance||5 convention', () => {
    expect(computeDrift(1051, 1000).tier).toBe('watching'); // >5%, <=10% with the default 5% tolerance
  });
  it('reports the exact live/committed values and signed delta back, for the UI to render', () => {
    const d = computeDrift('1200', '1000', 5); // string inputs (as they can arrive from a DB row) coerce cleanly
    expect(d).toEqual({ liveValue: 1200, committedValue: 1000, deltaPct: 20, tier: 'alert' });
  });
});

describe('freshestCapture', () => {
  it('null for an empty or missing array', () => {
    expect(freshestCapture([])).toBeNull();
    expect(freshestCapture(null)).toBeNull();
    expect(freshestCapture(undefined)).toBeNull();
  });
  it('picks the max capturedDate regardless of array order', () => {
    const rows = [
      { capturedDate: '2026-11-07', forecastValue: 100 },
      { capturedDate: '2026-11-09', forecastValue: 120 },
      { capturedDate: '2026-11-08', forecastValue: 110 },
    ];
    expect(freshestCapture(rows)).toEqual(rows[1]);
  });
  it('a single-row array returns that row', () => {
    const rows = [{ capturedDate: '2026-11-09', forecastValue: 50 }];
    expect(freshestCapture(rows)).toBe(rows[0]);
  });
});

describe('committedCapture', () => {
  const rows = [
    { capturedDate: '2026-11-07', forecastValue: 100 },
    { capturedDate: '2026-11-09', forecastValue: 120 },
  ];
  it('finds the exact row matching committedCapturedDate', () => {
    expect(committedCapture(rows, '2026-11-07')).toEqual(rows[0]);
  });
  it('null when the pointed-at row is not in the given set (rolled off the loaded window)', () => {
    expect(committedCapture(rows, '2026-10-01')).toBeNull();
  });
  it('null for a missing captures array or a null/undefined committedCapturedDate', () => {
    expect(committedCapture(null, '2026-11-07')).toBeNull();
    expect(committedCapture(rows, null)).toBeNull();
    expect(committedCapture(rows, undefined)).toBeNull();
  });
});

// ── 2. Supabase helpers (mocked client) ───────────────────────────────────────────────────────
let _selectData = null;
let _selectError = null;
let _upsertError = null;
let _insertError = null;
let _lastUpsert = null;
let _lastInsert = null;

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        order: () => chain,
        upsert: (row, opts) => { _lastUpsert = { table, row, opts }; return Promise.resolve({ data: row, error: _upsertError }); },
        insert: (row) => { _lastInsert = { table, row }; return Promise.resolve({ data: row, error: _insertError }); },
        then: (resolve, reject) => Promise.resolve({ data: _selectData, error: _selectError }).then(resolve, reject),
      };
      return chain;
    },
  }),
}));

const { loadRollingCaptures, loadCommits, loadAllCommits, saveCommit } = await import('../lib/supabase.js');

beforeEach(() => {
  _selectData = null; _selectError = null; _upsertError = null; _insertError = null;
  _lastUpsert = null; _lastInsert = null;
  if (console.warn.mockRestore) console.warn.mockRestore();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('loadRollingCaptures', () => {
  it('maps DB rows to camelCase, coercing forecast_value to a number', () => {
    _selectData = [{ loc: '44689', period_type: 'weekly', target_period: '2026-11-09', captured_date: '2026-11-09', lead_days: 0, forecast_value: '47900.5', model_used: 'ae' }];
    return loadRollingCaptures('44689', 'weekly', { fromDate: '2026-11-09', toDate: '2026-11-09' }).then(rows => {
      expect(rows).toEqual([{ loc: '44689', periodType: 'weekly', targetPeriod: '2026-11-09', capturedDate: '2026-11-09', leadDays: 0, forecastValue: 47900.5, modelUsed: 'ae' }]);
    });
  });
  it('self-heals to [] when the table is missing', async () => {
    _selectError = { code: 'PGRST205', message: "Could not find the table 'public.forecast_rolling_captures'" };
    const rows = await loadRollingCaptures('44689', 'daily', {});
    expect(rows).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('loadCommits / loadAllCommits', () => {
  it('loadCommits maps DB rows to camelCase', async () => {
    _selectData = [{ loc: '33704', period_type: 'weekly', target_period: '2026-11-09', committed_captured_date: '2026-11-07', committed_by: 'DM', committed_at: '2026-11-07T12:00:00Z' }];
    const rows = await loadCommits('33704', 'weekly');
    expect(rows).toEqual([{ loc: '33704', periodType: 'weekly', targetPeriod: '2026-11-09', committedCapturedDate: '2026-11-07', committedBy: 'DM', committedAt: '2026-11-07T12:00:00Z' }]);
  });
  it('loadAllCommits self-heals to [] when the table is missing', async () => {
    _selectError = { code: '42P01', message: 'relation "forecast_commits" does not exist' };
    const rows = await loadAllCommits('weekly');
    expect(rows).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('saveCommit', () => {
  it('upserts forecast_commits onConflict tenant_id,loc,period_type,target_period, AND appends forecast_commit_history with the denormalized value', async () => {
    const r = await saveCommit('44689', 'weekly', '2026-11-09', { committedCapturedDate: '2026-11-09', committedValue: 47900, committedBy: 'Fletcher' });
    expect(r.error).toBeNull();
    expect(_lastUpsert.table).toBe('forecast_commits');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'tenant_id,loc,period_type,target_period' });
    expect(_lastUpsert.row).toMatchObject({ loc: '44689', period_type: 'weekly', target_period: '2026-11-09', committed_captured_date: '2026-11-09', committed_by: 'Fletcher' });
    expect(_lastInsert.table).toBe('forecast_commit_history');
    expect(_lastInsert.row).toMatchObject({ loc: '44689', period_type: 'weekly', target_period: '2026-11-09', committed_captured_date: '2026-11-09', committed_value: 47900, committed_by: 'Fletcher' });
  });
  it('self-heals SILENTLY when forecast_commits has not been migrated yet (42P01)', async () => {
    _upsertError = { code: '42P01', message: 'relation "forecast_commits" does not exist' };
    const r = await saveCommit('44689', 'weekly', '2026-11-09', { committedCapturedDate: '2026-11-09', committedValue: 100 });
    expect(r.error).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
    expect(_lastInsert).toBeNull(); // never reaches the history append once the pointer write itself is a no-op
  });
  it('on a genuine commit upsert error, warns and returns the error message', async () => {
    _upsertError = { code: '42703', message: 'column does not exist' };
    const r = await saveCommit('44689', 'weekly', '2026-11-09', { committedCapturedDate: '2026-11-09', committedValue: 100 });
    expect(r.error).toBe('column does not exist');
    expect(console.warn).toHaveBeenCalled();
  });
  it('a failed history insert does not fail the overall call (the pointer write already succeeded)', async () => {
    _insertError = { code: '42P01', message: 'relation "forecast_commit_history" does not exist' };
    const r = await saveCommit('44689', 'weekly', '2026-11-09', { committedCapturedDate: '2026-11-09', committedValue: 100 });
    expect(r.error).toBeNull();
  });
});

// ── 3. Capture job's pure date-window logic (no mocking needed) ──────────────────────────────
const { fmtDate, addDays, noonOf, mondayOf, DAILY_FORWARD_DAYS, WEEKLY_FORWARD_WEEKS } =
  await import('../../scripts/forecast-rolling-capture.mjs');

describe('forecast-rolling-capture.mjs date helpers', () => {
  it('mondayOf resolves every day of a week to the SAME Monday', () => {
    // Nov 9, 2026 is a Monday — confirmed against the real calendar this feature was built on.
    const monday = '2026-11-09';
    for (let i = 0; i < 7; i++) {
      const d = addDays(new Date('2026-11-09T12:00:00'), i);
      expect(fmtDate(mondayOf(d))).toBe(monday);
    }
  });
  it('mondayOf is independent of settings.weekStartDay -- always ISO Monday', () => {
    // A Sunday should resolve to the Monday that STARTS the week it's the tail end of (the
    // PREVIOUS Monday), not the upcoming one -- the schema's own "Monday of the week being
    // forecast" convention, not a forward-looking one.
    const sunday = new Date('2026-11-15T12:00:00'); // the Sunday ending the 2026-11-09 week
    expect(fmtDate(mondayOf(sunday))).toBe('2026-11-09');
  });
  it('addDays/fmtDate round-trip cleanly across a month boundary', () => {
    const d = addDays(new Date('2026-11-30T12:00:00'), 1);
    expect(fmtDate(d)).toBe('2026-12-01');
  });
  it('noonOf strips time-of-day to local noon (avoids DST-edge date-shift bugs)', () => {
    const d = noonOf(new Date('2026-11-09T23:59:00'));
    expect(d.getHours()).toBe(12);
    expect(fmtDate(d)).toBe('2026-11-09');
  });
  it('the forward windows match the directive\'s "reasonable forward window" sizing', () => {
    expect(DAILY_FORWARD_DAYS).toBe(60);
    expect(WEEKLY_FORWARD_WEEKS).toBe(12);
  });
});
