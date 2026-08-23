// @ts-nocheck
// Pure-function tests for scripts/qsrsoft-security-events-pull.mjs (dispatch #65). No fetch, no
// Supabase -- this module is import-safe under vitest (guarded createClient, same pattern as
// scripts/qsrsoft-register-audit-pull.mjs's own test file) and only its exported pure helpers
// are exercised here. saveSecurityEventRows/runAll/main are NOT covered here (they need a live
// or mocked Supabase client + fetch), matching the existing convention for this repo's pull
// scripts: mapping/URL/envelope logic is unit-tested, the live network path is verified by an
// actual scheduled/workflow_dispatch run.
import { describe, it, expect } from 'vitest';
import { buildUrl, buildBody, extractRows } from '../../scripts/qsrsoft-security-events-pull.mjs';

describe('qsrsoft-security-events-pull', () => {
  it('buildUrl matches the confirmed endpoint shape (path AND query carry orgId)', () => {
    const url = buildUrl('29760');
    expect(url).toBe('https://api.security.myqsrsoft.com/security/event_details/v1/a546d4ef-684a-4f25-8bc0-6580af068875/29760?orgId=a546d4ef-684a-4f25-8bc0-6580af068875');
  });

  it('buildBody sends empty registers/cashiers/time_slices — dispatch #58 measured empty means ALL', () => {
    const body = buildBody('all_promo', '2026-08-14');
    expect(body).toEqual({
      event_token: 'all_promo', start_date: '2026-08-14', end_date: '2026-08-14',
      registers: [], time_slices: [], cashiers: [], mgr_code: null,
    });
    // Same day for start/end -- one request per (store, date, token), not a range.
    expect(body.start_date).toBe(body.end_date);
  });

  it('extractRows accepts a bare array', () => {
    const rows = [{ event_token: 'all_promo' }];
    expect(extractRows(rows, 'unit')).toBe(rows);
  });

  it('extractRows accepts {resp:[...]} — the envelope key measured for the sibling regAudit endpoint', () => {
    const rows = [{ event_token: 'all_promo' }];
    expect(extractRows({ resp: rows }, 'unit')).toBe(rows);
  });

  it('extractRows accepts {result:[...]} and {data:[...]} as fallbacks', () => {
    const rows = [{ event_token: 'all_promo' }];
    expect(extractRows({ result: rows }, 'unit')).toBe(rows);
    expect(extractRows({ data: rows }, 'unit')).toBe(rows);
  });

  it('extractRows returns [] (not throws) on an unrecognized envelope', () => {
    expect(extractRows({ somethingElse: 1 }, 'unit')).toEqual([]);
    expect(extractRows(null, 'unit')).toEqual([]);
    expect(extractRows('a string', 'unit')).toEqual([]);
  });
});

// ── Date-window guard (added 2026-08-23 after a live silent-zero run) ──────────
// A workflow_dispatch with `2026/08/22` (slashes) produced an Invalid Date, an empty date
// list, "0 row(s) parsed, 0 saved", "0/27 stores", and exit 0 — a fully GREEN run that
// pulled nothing. These assert the run now fails loudly instead.
describe('qsrsoft-security-events-pull — date window guard', () => {
  it('rejects slash-formatted dates instead of silently pulling zero days', async () => {
    const mod = await import('../../scripts/qsrsoft-security-events-pull.mjs');
    expect(() => mod.dateList('2026/08/22', '2026/08/22')).toThrow(/YYYY-MM-DD/);
  });

  it('rejects a reversed window', async () => {
    const mod = await import('../../scripts/qsrsoft-security-events-pull.mjs');
    expect(() => mod.dateList('2026-08-23', '2026-08-22')).toThrow(/after end date/);
  });

  it('still returns exactly one date for an inclusive single-day window', async () => {
    const mod = await import('../../scripts/qsrsoft-security-events-pull.mjs');
    expect(mod.dateList('2026-08-22', '2026-08-22')).toEqual(['2026-08-22']);
  });

  it('returns every day of a multi-day window, inclusive of both ends', async () => {
    const mod = await import('../../scripts/qsrsoft-security-events-pull.mjs');
    expect(mod.dateList('2026-08-20', '2026-08-23'))
      .toEqual(['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']);
  });
});
