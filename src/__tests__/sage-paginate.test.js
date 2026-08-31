// @ts-nocheck
// Dispatch #85 -- every SAGE data-aggregation tool set a client-side `.limit(100000)`, which does
// nothing: PostgREST's server-side `max-rows` (1000 on this project) overrides a client limit, so
// every one of those queries silently truncated at 1000 rows. Verification bar (memory/
// dispatch-85.md): a query whose true result exceeds 1000 rows must return all of them -- assert
// on a row count > 1000 from a real range, not on "it didn't error" (the broken version succeeds
// too, it just lies).
//
// Imports supabase/functions/sage-chat/paginate.js directly -- the same plain-JS module index.ts's
// tools call to fetch every aggregation query. No Deno test infrastructure exists in this repo to
// boot the edge function itself, so this is the closest thing to the real call site: reverting the
// pagination loop (not just its wiring into index.ts) makes these tests fail, since they exercise
// that exact code.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fetchAllRows } from '../../supabase/functions/sage-chat/paginate.js';

// Simulates PostgREST's max-rows behavior: a query builder whose `.range(offset, end)` always
// returns at most `serverCap` rows regardless of what the caller asked for, from a fixed
// in-memory dataset -- exactly what a client-side `.limit(100000)` looks like against a real
// server-enforced max-rows of 1000.
function makeMockSupabaseTable(totalRows, serverCap = 1000) {
  const allRows = Array.from({ length: totalRows }, (_, i) => ({ id: i }));
  let callCount = 0;
  const build = () => ({
    range(offset, end) {
      callCount++;
      const requested = end - offset + 1;
      const page = allRows.slice(offset, offset + Math.min(requested, serverCap));
      return Promise.resolve({ data: page, error: null });
    },
  });
  return { build, getCallCount: () => callCount };
}

describe('paginate -- fetchAllRows (dispatch #85)', () => {
  it('returns every row when the true result is well under the page size', async () => {
    const { build } = makeMockSupabaseTable(37);
    const { data, error } = await fetchAllRows(build, 1000);
    expect(error).toBeNull();
    expect(data.length).toBe(37);
  });

  it('returns MORE than 1000 rows for a range whose true count exceeds the server cap -- the actual regression bar', async () => {
    // 27 stores * 24 hour_slots * 14 days = 9072, matching dispatch #85's own arithmetic for the
    // symptom that was reported ("only 2 days of data per store" out of 14 requested).
    const TRUE_COUNT = 27 * 24 * 14;
    const { build, getCallCount } = makeMockSupabaseTable(TRUE_COUNT, 1000);
    const { data, error } = await fetchAllRows(build, 1000);
    expect(error).toBeNull();
    // This is the assertion that would have caught the original bug: a caller stuck at a single
    // .limit(100000) against a real max-rows=1000 server gets back exactly 1000, never more.
    expect(data.length).toBeGreaterThan(1000);
    expect(data.length).toBe(TRUE_COUNT);
    // 10 full pages of 1000 + 1 final page of 72 (< pageSize) that stops the loop.
    expect(getCallCount()).toBe(Math.ceil(TRUE_COUNT / 1000));
  });

  it('a total that is an exact multiple of pageSize still returns everything (one extra empty page to confirm the end)', async () => {
    // Exactly 2000 rows: two full 1000-row pages. A full page can never self-report as the last
    // one (nothing distinguishes "exactly 1000 rows total" from "1000 of many more"), so the loop
    // correctly issues a third, empty-page request before stopping -- this is the unavoidable cost
    // of offset pagination at an exact boundary, not a bug.
    const { build, getCallCount } = makeMockSupabaseTable(2000, 1000);
    const { data } = await fetchAllRows(build, 1000);
    expect(data.length).toBe(2000);
    expect(getCallCount()).toBe(3);
  });

  it('returns rows collected so far plus the error when a later page fails', async () => {
    let call = 0;
    const build = () => ({
      range() {
        call++;
        if (call === 1) return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null });
        return Promise.resolve({ data: null, error: { message: 'connection reset', code: 'ECONNRESET' } });
      },
    });
    const { data, error } = await fetchAllRows(build, 1000);
    expect(error).toBeTruthy();
    expect(error.code).toBe('ECONNRESET'); // the raw Supabase error object survives, not a re-shaped one
    expect(data.length).toBe(1000); // whatever was collected before the failure
  });

  it('an empty result returns an empty array, not an error', async () => {
    const { build } = makeMockSupabaseTable(0);
    const { data, error } = await fetchAllRows(build, 1000);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Call-site contract: every fetchAllRows() query must be deterministically ordered.
//
// The pagination loop above is correct in isolation and still wrong at the call site if the
// query it pages has no ORDER BY: Postgres leaves row order unspecified without one, so two
// .range() reads of the same table can overlap or skip -- duplicating some rows and dropping
// others while the total COUNT still looks plausible. A test that only imports paginate.js
// cannot see that; this one reads index.ts, so deleting an .order() fails the suite.
describe('sage-chat: fetchAllRows call sites impose a total order', () => {
  const src = readFileSync(
    new URL('../../supabase/functions/sage-chat/index.ts', import.meta.url),
    'utf8',
  );

  // Each fetchAllRows(...) call, from the opening paren to the balanced closing one.
  function fetchAllRowsCalls(text) {
    const calls = [];
    const NEEDLE = 'fetchAllRows(';
    let at = text.indexOf(NEEDLE);
    while (at !== -1) {
      let depth = 0;
      let i = at + NEEDLE.length - 1;
      for (; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')' && --depth === 0) break;
      }
      calls.push(text.slice(at, i + 1));
      at = text.indexOf(NEEDLE, i);
    }
    return calls;
  }

  const calls = fetchAllRowsCalls(src);

  it('finds every paginated tool query (guards against the scan silently matching nothing)', () => {
    // daily_activity, lifelenz, labor_summary (qsr_labor_summary + qsr_daily_activity_rollup,
    // dispatch #90), forecast_snapshots, glimpse, qsr_cash_sheet (opsCash auto-first discount
    // sourcing, dispatch-111.md), ctrl_rows, qsr_raw_item_detail (query_eom_recount_impact,
    // dispatch-226.md)
    expect(calls.length).toBe(9);
  });

  it.each(calls.map((c, i) => [i, c]))('call %i orders its query', (_i, call) => {
    expect(call).toMatch(/\.order\(/);
  });
});
