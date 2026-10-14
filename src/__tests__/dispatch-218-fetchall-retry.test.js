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
//
// 2026-10-14 (owner-reported live, Security panel): a page that still fails after its retries
// used to stop pagination FOR GOOD -- not just that one page, every page after it too, however
// many there were. Live-reproduced on security_findings_latest: roughly 1 page in 20 genuinely
// times out (57014) under the app's own ordered/indexed query, and inventory-domain rows are the
// MAJORITY of that table -- so one unlucky mid-pagination timeout could silently drop most of the
// Inventory tab's findings while the banner, hardcoded to `_recordDataError(label, 1, 0, ...)`,
// reported a misleadingly tiny "1 page(s) failed" no matter how much was actually lost. Extended
// below: a page that exhausts its retries is now SKIPPED (not fatal) and pagination continues,
// bounded by MAX_CONSECUTIVE_PAGE_FAILURES so a genuinely unreachable table still gives up rather
// than hammering forever. The pre-existing "fails ALL retry attempts" test is updated to match --
// it now makes 3 page-level attempts (the new cap), not 1, before giving up.
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

  it('a page that fails ALL retry attempts, forever (a genuinely unreachable table) gives up after MAX_CONSECUTIVE_PAGE_FAILURES page-level attempts, not just one (2026-10-14 extension)', async () => {
    const err = { message: 'network error' };
    let calls = 0;
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => { calls++; return { data: null, error: err }; },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    // _partial marker set (non-enumerable, so this checks the raw array fetchAll returns --
    // loadQsrRawItemDetail's own .map() would already have dropped it, matching the file's own
    // documented caveat that 14/37 callers lose the marker through .map()), and exactly one
    // _recordDataError entry recorded globally so the banner fires regardless.
    expect(result.length).toBe(0);
    const errors = dataLoadErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].label).toBe('qsr_raw_item_detail');
    // 3 page-level attempts (the new MAX_CONSECUTIVE_PAGE_FAILURES cap), not 1 -- a single bad
    // page no longer ends pagination; only 3 CONSECUTIVE failures do. Each page-level attempt
    // makes up to 3 calls (1 initial + 2 retries), so 3 attempts x 3 calls = 9 total.
    expect(errors[0].failed).toBe(3);
    expect(errors[0].total).toBe(3);
    expect(calls).toBe(9);
  });

  it('a page that fails all its retries is SKIPPED, not fatal -- pagination continues and recovers the pages after it (2026-10-14, the live Security-panel bug)', async () => {
    const fullPage = Array.from({ length: 200 }, (_, i) => ({ ...rawItemRow(), wrin: `PAGE1-${i}` }));
    const shortPage = [{ ...rawItemRow(), wrin: 'PAGE3-ONLY' }]; // short page -> signals true end
    const err = { message: 'network error' };
    let call = 0;
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => {
        call++;
        if (call === 1) return { data: fullPage, error: null };                 // page 1: full, succeeds
        if (call >= 2 && call <= 4) return { data: null, error: err };          // page 2: 1 + 2 retries, all fail
        return { data: shortPage, error: null };                                 // page 3: succeeds, short -> stop
      },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    // Pre-fix, this would have returned ONLY page 1's 200 rows and dropped page 3 entirely (the
    // loop broke dead at page 2's failure). Post-fix: page 2's row range is skipped, but
    // pagination continues on to page 3 and recovers it.
    expect(result.length).toBe(201); // 200 (page 1) + 1 (page 3) -- page 2's rows are the only gap
    expect(result.some(r => r.wrin === 'PAGE3-ONLY')).toBe(true);
    const errors = dataLoadErrors();
    expect(errors.length).toBe(1);
    expect(errors[0].failed).toBe(1);  // exactly the one page that failed, not "everything after it"
    expect(errors[0].total).toBe(3);   // 3 page-level attempts total (1 ok, 1 failed, 1 ok)
  });

  it('a successful page after a failed one resets the consecutive-failure count -- isolated bad pages scattered through a big table never trip the MAX_CONSECUTIVE_PAGE_FAILURES cap', async () => {
    const page = (tag) => Array.from({ length: 200 }, (_, i) => ({ ...rawItemRow(), wrin: `${tag}-${i}` }));
    const err = { message: 'network error' };
    let call = 0;
    // Pattern: good, BAD(x3 calls), good, BAD(x3 calls), good, short-end. Two separate failed
    // pages, each isolated by a successful page in between -- never 3 in a row.
    const script = [
      { data: page('A'), error: null },                 // page 1 ok
      { data: null, error: err }, { data: null, error: err }, { data: null, error: err }, // page 2: fails x3
      { data: page('B'), error: null },                 // page 3 ok -- resets the counter
      { data: null, error: err }, { data: null, error: err }, { data: null, error: err }, // page 4: fails x3
      { data: page('C'), error: null },                 // page 5 ok
      { data: [], error: null },                        // page 6: empty -> true end
    ];
    __fakeConfig.qsr_raw_item_detail = {
      rangeHandler: async () => { const r = script[call]; call++; return r; },
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const p = loadQsrRawItemDetail({});
    await vi.runAllTimersAsync();
    const result = await p;
    // All three good pages recovered (600 rows) -- neither isolated failure tripped the cap,
    // because a success in between reset consecutiveFailures back to 0.
    expect(result.length).toBe(600);
    const errors = dataLoadErrors();
    expect(errors[0].failed).toBe(2); // 2 distinct failed pages, neither one fatal
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
