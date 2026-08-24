// @ts-nocheck
// Pure-function tests for scripts/qsrsoft-security-events-pull.mjs (dispatch #65). No fetch, no
// Supabase -- this module is import-safe under vitest (guarded createClient, same pattern as
// scripts/qsrsoft-register-audit-pull.mjs's own test file) and only its exported pure helpers
// are exercised here. saveSecurityEventRows/runAll/main are NOT covered here (they need a live
// or mocked Supabase client + fetch), matching the existing convention for this repo's pull
// scripts: mapping/URL/envelope logic is unit-tested, the live network path is verified by an
// actual scheduled/workflow_dispatch run.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildUrl, buildBody, extractRows, runSecurityEvents } from '../../scripts/qsrsoft-security-events-pull.mjs';

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

// ── runSecurityEvents scoping override (dispatch #91, added for the token-injection test's
// Case F -- scripts/probe-security-token-identity.mjs) ────────────────────────────────────────
// The override lets Case F run the pull's REAL loop against ONE store/event_token instead of the
// full 27x8 sweep, so a one-variable check doesn't cost 216 requests. main()'s own 3-arg call is
// untouched (the 4th param defaults to the full production lists) -- these tests lock that in.
const fakeHeaders = { get: () => null };
function stubFetchOnce({ status = 200, body = [] } = {}) {
  const calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
    calls.push({ url, headers: opts?.headers, body: opts?.body ? JSON.parse(opts.body) : null });
    return { status, ok: status >= 200 && status < 300, headers: fakeHeaders, text: async () => JSON.stringify(body) };
  }));
  return calls;
}

describe('runSecurityEvents scoping override (dispatch #91 Case F)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('scopes to the given stores/eventTokens instead of the full 27x8 sweep', async () => {
    const calls = stubFetchOnce({ body: [] });
    const tracker = { fail: vi.fn() };
    await runSecurityEvents('literal-test-token', ['2026-08-22'], tracker, {
      stores: [3708], eventTokens: ['all_promo'],
    });
    // ONE unit (1 date x 1 store x 1 event_token), not 216.
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(buildUrl('3708'));
    expect(calls[0].body).toEqual(buildBody('all_promo', '2026-08-22'));
  });

  it('accepts a literal token string without minting -- resolveToken passes it through unchanged', async () => {
    const calls = stubFetchOnce({ body: [{ event_token: 'all_promo', event_dt: '2026-08-22', event_tm: '10:00:00' }] });
    const tracker = { fail: vi.fn() };
    const { collected } = await runSecurityEvents('literal-test-token', ['2026-08-22'], tracker, {
      stores: [3708], eventTokens: ['all_promo'],
    });
    // The pull's real parse path ran -- a row came back and was collected, using the literal
    // string as-is (no getFreshToken call, nothing to mock for minting).
    expect(collected.length).toBe(1);
    expect(calls[0].headers['X-Auth-Token']).toBe('literal-test-token');
  });

  it('a 403 AccessDenied is recorded via tracker.fail(), not thrown out of the loop', async () => {
    stubFetchOnce({ status: 403, body: { Message: 'User is not authorized to access this resource with an explicit deny in an identity-based policy' } });
    const tracker = { fail: vi.fn() };
    await runSecurityEvents('literal-test-token', ['2026-08-22'], tracker, {
      stores: [3708], eventTokens: ['all_promo'],
    });
    expect(tracker.fail).toHaveBeenCalledTimes(1);
    expect(tracker.fail.mock.calls[0][1]).toMatch(/AUTH_FAILED:403/);
  });

  it('defaults to the full production stores/eventTokens when no override is given', async () => {
    // The loop sleeps 100ms between units (rate-limiting courtesy) -- 27x8 units would be a
    // 21.6s real-time test. Fake timers keep this test fast without changing the loop itself.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const calls = stubFetchOnce({ body: [] });
      const tracker = { fail: vi.fn() };
      const p = runSecurityEvents('literal-test-token', ['2026-08-22'], tracker);
      await vi.runAllTimersAsync();
      await p;
      // 27 stores x 8 event tokens x 1 date, matching main()'s own unscoped call shape.
      expect(calls.length).toBe(27 * 8);
    } finally {
      vi.useRealTimers();
    }
  });
});
