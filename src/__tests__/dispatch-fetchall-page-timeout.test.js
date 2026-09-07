// @ts-nocheck
// fetchAll() (src/lib/supabase.js) had no per-page timeout — a request that HANGS (no
// response, no error object ever arriving; a stalled connection, not a failure) previously
// blocked pagination forever with no escape. Everything dispatch #218 added (retry, give-up,
// _partial marker, DataErrorBanner) only reacts to an error object actually showing up; a
// silent hang never produces one. backlog-open-2026-09-06.md §4 named this directly:
// "fetchAll has no per-page timeout... it can hang a panel with no escape."
//
// Fix wraps each page attempt in _withPageTimeout(), which races the real request against a
// clock and, on timeout, resolves with a synthetic no-`.code` error — the SAME shape
// _isRetryablePageError already classifies as retryable (dispatch-218-fetchall-retry.test.js's
// own "DOES retry a raw network/fetch-level failure with no .code at all" case), so a timed-
// out page falls into the exact retry-then-give-up path dispatch #218 built, rather than
// needing new handling of its own.
//
// Mirrors dispatch-218-fetchall-retry.test.js's own approach: drive the internal helper
// through a real exported loader (loadQsrRawItemDetail) against a mock Supabase client,
// rather than reimplementing the mock scaffolding a third time.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const cfg = __fakeConfig[table];
      return {
        select() { return this; },
        range(from, to) { return cfg.rangeHandler(from, to); },
      };
    },
  }),
}));

function rawItemRow() {
  return { loc: '0010422', period: '2026-08', wrin: '1234567', descr: 'Test Item', item_class: 'FOOD', history: [], updated_at: '2026-08-29T00:00:00.000Z' };
}

// A page fetch that never settles — the exact failure mode a per-page timeout exists for.
function neverResolves() { return new Promise(() => {}); }

let loadQsrRawItemDetail, dataLoadErrors, clearDataLoadErrors, _withPageTimeout;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  // Same deterministic env stub as dispatch-218-fetchall-retry.test.js — this sandbox carries
  // ambient real Supabase env vars that would otherwise mask the null-guard short-circuit.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadQsrRawItemDetail, dataLoadErrors, clearDataLoadErrors, _withPageTimeout } = await import('../lib/supabase.js'));
  clearDataLoadErrors();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('_withPageTimeout (fetchAll per-page timeout)', () => {
  it('resolves with the real result when the promise settles before the deadline', async () => {
    const result = await _withPageTimeout(Promise.resolve({ data: [1], error: null }), 1000);
    expect(result).toEqual({ data: [1], error: null });
  });

  it('resolves with a synthetic no-.code error once the deadline passes, for a promise that never settles', async () => {
    vi.useFakeTimers();
    const p = _withPageTimeout(neverResolves(), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    expect(result.error.code).toBeUndefined(); // classified retryable by _isRetryablePageError
    expect(result.error.message).toMatch(/timed out/);
  });

  it('a rejecting promise (e.g. a fetch abort) resolves to an error shape instead of throwing', async () => {
    const result = await _withPageTimeout(Promise.reject(new Error('aborted')), 1000);
    expect(result.data).toBeNull();
    expect(result.error.message).toBe('aborted');
  });
});

describe('fetchAll() recovers from a hung page (via loadQsrRawItemDetail)', () => {
  it('a page that hangs once past the timeout, then succeeds on retry — full data, nothing recorded', async () => {
    let calls = 0;
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => {
        calls++;
        if (calls === 1) return neverResolves();
        return { data: [rawItemRow()], error: null };
      },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.length).toBe(1);
    expect(dataLoadErrors()).toEqual([]);
    expect(result._partial).toBeUndefined();
  });

  it('a page that hangs on every attempt falls through to the SAME give-up behavior as any other unrecoverable page error', async () => {
    __fakeConfig.qsr_raw_item_detail = { rangeHandler: async () => neverResolves() };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.length).toBe(0);
    const errors = dataLoadErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].label).toBe('qsr_raw_item_detail');
    expect(errors[0].failed).toBe(1);
  });

  it('the happy (no-hang) path still schedules no lingering timer — matches dispatch-218\'s own invariant', async () => {
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => ({ data: [rawItemRow()], error: null }),
    };
    vi.useFakeTimers();
    const result = await loadQsrRawItemDetail({});
    expect(result.length).toBe(1);
    expect(vi.getTimerCount()).toBe(0); // the per-page timeout timer is cleared once the real fetch resolves
  });
});
