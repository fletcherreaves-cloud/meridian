// @ts-nocheck
// Dispatch #218 -- fetchAll() (src/lib/supabase.js), the ONE shared pagination helper ~37
// loaders call, used to treat ANY page-fetch error as immediately fatal: warn, _recordDataError
// (which drives the "DATA INCOMPLETE" banner), mark _partial, stop pagination -- the only
// recovery was a full manual page reload. Owner hit exactly this on qsr_raw_item_detail
// (2026-08-29) from what live triage confirmed was a one-off transient page failure against a
// healthy table. This adds a bounded, classified retry of the SAME failed page before falling
// through to that existing (unchanged, still correct) give-up behavior.
//
// High blast radius (fetchAll's own comment: ~37 callers) -- this suite exercises the retry
// logic directly through a real exported loader (loadQsrRawItemDetail, chosen because it is the
// actual table/loader from the triggering incident and is a plain, unfiltered fetchAll caller --
// no _pagedParallel involved), per this file's existing convention of driving an internal,
// unexported helper (fetchAll/_pagedParallel are both underscore-free-but-internal by this
// file's own convention -- see paged-parallel-count-fallback.test.js) through a real caller
// against a mock Supabase client, rather than reimplementing the mock scaffolding a third time.
// _isRetryablePageError is exported specifically so its classification can also be unit-tested
// in complete isolation, without going through the retry loop at all.
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

// Returns a rangeHandler that replays `responses` in order (by call count), holding on the last
// entry once exhausted. Each response is `{ data, error }`, matching a real Supabase result.
function scripted(responses) {
  let calls = 0;
  return async (from, to) => {
    const r = responses[Math.min(calls, responses.length - 1)];
    calls++;
    return r;
  };
}

let loadQsrRawItemDetail, dataLoadErrors, clearDataLoadErrors, _isRetryablePageError;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  // See paged-parallel-count-fallback.test.js's identical note: this sandbox carries ambient
  // real Supabase env vars, which would mask the null-guard short-circuit under CI (no ambient
  // env) making every assertion here trivially pass against []. Stub deterministically.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadQsrRawItemDetail, dataLoadErrors, clearDataLoadErrors, _isRetryablePageError } = await import('../lib/supabase.js'));
  clearDataLoadErrors();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('_isRetryablePageError classification (dispatch #218)', () => {
  it('does NOT retry the structural/permanent errors this file already treats as unrecoverable', () => {
    expect(_isRetryablePageError({ code: '42703', message: 'column does not exist' })).toBe(false);
    expect(_isRetryablePageError({ code: '42P01', message: 'relation "foo" does not exist' })).toBe(false);
    expect(_isRetryablePageError({ code: 'PGRST205', message: "Could not find the table 'public.foo'" })).toBe(false);
    // _isMissingTable's message-only fallback (no .code at all, just the Postgres wording) --
    // still permanent, must not be misread as the "no .code => retryable" network case.
    expect(_isRetryablePageError({ message: 'relation "bar" does not exist' })).toBe(false);
  });

  it('DOES retry a statement timeout (57014) -- CLAUDE.md names this exact code for this exact class of large-table read', () => {
    expect(_isRetryablePageError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(true);
  });

  it('DOES retry a raw network/fetch-level failure with no .code at all', () => {
    expect(_isRetryablePageError({ message: 'network error' })).toBe(true);
    expect(_isRetryablePageError(new Error('fetch failed'))).toBe(true);
  });

  it('defaults an unrecognized error shape to retryable (a wasted retry is cheap; a wrong permanent call is a real banner)', () => {
    expect(_isRetryablePageError({ code: '23505', message: 'duplicate key value' })).toBe(true);
  });

  it('there is nothing to retry when there is no error', () => {
    expect(_isRetryablePageError(null)).toBe(false);
    expect(_isRetryablePageError(undefined)).toBe(false);
  });
});

describe('fetchAll() retries a transient page failure (dispatch #218)', () => {
  it('a page that fails once with a retryable-shaped error (no .code) then succeeds -- full data returned, NOTHING recorded, no _partial', async () => {
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: scripted([
        { data: null, error: { message: 'network error' } },
        { data: [rawItemRow()], error: null },
      ]),
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.length).toBe(1);
    expect(dataLoadErrors()).toEqual([]);
    expect(result._partial).toBeUndefined();
  });

  it('a page that fails once with error.code 57014 (statement timeout) then succeeds -- same clean recovery', async () => {
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: scripted([
        { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } },
        { data: [rawItemRow()], error: null },
      ]),
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.length).toBe(1);
    expect(dataLoadErrors()).toEqual([]);
    expect(result._partial).toBeUndefined();
  });

  it('a page that fails ALL retry attempts (still retryable every time) falls through to TODAY\'s exact existing give-up behavior', async () => {
    const err = { message: 'network error' };
    __fakeConfig.qsr_raw_item_detail = {
      // 1 initial attempt + up to 2 retries = 3 calls scripted, all failing the same way.
      rangeHandler: scripted([{ data: null, error: err }, { data: null, error: err }, { data: null, error: err }]),
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    // Unchanged pre-dispatch shape: partial data (here, none loaded before the failing page),
    // _partial marker set (non-enumerable, so this checks the raw array fetchAll returns --
    // loadQsrRawItemDetail's own .map() would already have dropped it, matching the file's own
    // documented caveat that 14/37 callers lose the marker through .map()), and exactly one
    // _recordDataError entry recorded globally so the banner fires regardless.
    expect(result.length).toBe(0);
    const errors = dataLoadErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].label).toBe('qsr_raw_item_detail');
    expect(errors[0].failed).toBe(1);
    expect(errors[0].total).toBe(0);
  });

  it('a page that fails with a NON-retryable error (42703) fails IMMEDIATELY -- no retry attempted, not just "same end state"', async () => {
    let calls = 0;
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => { calls++; return { data: null, error: { code: '42703', message: 'column does not exist' } }; },
    };
    // Fake timers, deliberately NOT advanced: if the implementation regressed into retrying a
    // non-retryable error, it would call _sleep -> setTimeout, and this awaited call would hang
    // until vitest's test timeout since no timer is ever advanced -- the regression signal is
    // "this test times out", not a passing assertion on a subtly wrong end state.
    vi.useFakeTimers();
    const result = await loadQsrRawItemDetail({});
    expect(calls).toBe(1); // exactly one attempt -- proves no retry was even tried
    expect(vi.getTimerCount()).toBe(0); // no _sleep was ever scheduled
    expect(result.length).toBe(0);
    const errors = dataLoadErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].label).toBe('qsr_raw_item_detail');
  });

  it('a page that fails with 42P01 (missing table) also fails immediately, matching _isMissingTable elsewhere in this file', async () => {
    let calls = 0;
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => { calls++; return { data: null, error: { code: '42P01', message: 'relation "qsr_raw_item_detail" does not exist' } }; },
    };
    vi.useFakeTimers();
    await loadQsrRawItemDetail({});
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a page that succeeds on the FIRST try (the overwhelmingly common case) is untouched -- no artificial delay, no timer ever scheduled', async () => {
    let calls = 0;
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => { calls++; return { data: [rawItemRow()], error: null }; },
    };
    vi.useFakeTimers();
    const start = Date.now();
    const result = await loadQsrRawItemDetail({});
    expect(result.length).toBe(1);
    expect(calls).toBe(1);
    expect(vi.getTimerCount()).toBe(0); // fetchAll's happy path never touches _sleep at all
    expect(Date.now() - start).toBeLessThan(50); // no artificial delay on the happy path
    expect(dataLoadErrors()).toEqual([]);
  });
});
