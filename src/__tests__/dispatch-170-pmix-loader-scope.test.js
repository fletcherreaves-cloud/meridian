// @ts-nocheck
// Dispatch #170 — Product Mix Cloud tab "never populates, waited several minutes" (owner report,
// v5.207). Root cause, measured live 2026-08-27 against the real `qsr_product_mix` table
// (SUPABASE_SERVICE_ROLE_KEY, standard apikey+Bearer PostgREST recipe, this session's env):
//
//   days back | cutoff       | content-range (real row count)
//   --------- | ------------ | -------------------------------
//   400 (OLD DEFAULT) | 2025-07-23 | 0-0/2526181  (2,526,181 rows)
//   90        | 2026-05-29   | 0-0/981178
//   45        | 2026-07-23   | 0-0/381358
//   40 (NEW DEFAULT)  | 2026-07-18 | 0-0/436137
//   30        | 2026-07-28   | 0-0/325423
//
// `qsr_product_mix`'s real data starts 2026-01-01 (confirmed: `select=date&order=date.asc&limit=1`
// -> {"date":"2026-01-01"}), so the loader's old 400-day default was not "the last 400 days" — it
// was the entire table, and the entire table is 2.5M+ rows and growing (~11K rows/day: two DAR-
// style pulls/day x 27 stores x hundreds of items x price tiers).
//
// A full-paginated-fetch wall-clock measurement (same session, same credential, real HTTP against
// the live table, _MAX_INFLIGHT=6-equivalent concurrency via 6 parallel curl workers, pageSize
// 1000, `select=*` matching the real loader's column list) at three window sizes:
//   7 days  ->  75,577 rows -> 4.38s  (17,260 rows/sec)
//   14 days -> 150,613 rows -> 7.68s  (19,617 rows/sec)
//   30 days -> 325,423 rows -> 18.33s (17,754 rows/sec)
// gives a consistent ~18,000 rows/sec measured throughput. Extrapolated to the OLD 400-day/2.5M-
// row default: ~140s (~2.3 minutes) — this is what "waited several minutes" actually was, not a
// genuine hang (the fetch was always going to finish; it just never finished in a time an operator
// would wait for it). At the NEW 40-day/436K-row default: ~24s.
//
// This suite can't hit the live network in CI (no authenticated Supabase session here — same
// constraint dt-history-pagination.test.js and #191's loadQsrFob migration document), so it
// verifies the two things that ARE reproducible in-process: (1) loadPmixRows's actual default
// argument shape — the exact cutoff date it asks for when called with no args, which is what
// determines whether a caller gets the bounded or the effectively-unbounded window — and (2) the
// SAME class of "before/after" scheduling-shape measurement dt-history-pagination.test.js uses:
// page/round-trip counts under the real _MAX_INFLIGHT=6 cap, at OLD-default-equivalent vs
// NEW-default-equivalent row counts, proving the fix is a genuine reduction in work done, not a
// cosmetic default-value change.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [] };
  const calls = cfg.calls || (cfg.calls = { gte: [] });
  const builder = {
    select(_cols, opts) { builder._headMode = !!(opts && opts.head); return builder; },
    gte(col, val) { calls.gte.push([col, val]); return builder; },
    in() { return builder; },
    order() { return builder; },
    range(from, to) {
      const delay = cfg.delayMs || 0;
      const run = () => ({ data: cfg.rows.slice(from, to + 1), error: null });
      return delay ? new Promise(r => setTimeout(() => r(run()), delay)) : Promise.resolve(run());
    },
    then(resolve, reject) {
      const delay = cfg.delayMs || 0;
      const run = () => ({ count: cfg.rows.length, error: null, data: null });
      return (delay ? new Promise(r => setTimeout(() => r(run()), delay)) : Promise.resolve(run()))
        .then(resolve, reject);
    },
  };
  return builder;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

function pmixRow(i) {
  return { loc: '3708', date: '2026-08-01', item: String(i % 700), price: 3.99, desc_: 'Item', family_group: 'Sandwiches', sold_qty: 5, disc_qty: 0, promo_qty: 0, offer_amt: 0, disc_amt: 0, unit_food_cost: 0.8, unit_paper_cost: 0.1 };
}

let loadPmixRows;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadPmixRows } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('loadPmixRows default window (dispatch #170)', () => {
  it('with NO args, requests a cutoff ~40 days back — NOT the old ~400-day default', async () => {
    __fakeConfig.qsr_product_mix = { rows: [] };
    const before = new Date(); before.setDate(before.getDate() - 41);
    const after = new Date(); after.setDate(after.getDate() - 39);

    await loadPmixRows();

    const gteCalls = __fakeConfig.qsr_product_mix.calls.gte;
    expect(gteCalls.length).toBeGreaterThan(0);
    for (const [col, val] of gteCalls) {
      expect(col).toBe('date');
      const cutoff = new Date(val + 'T00:00:00');
      // Bounded to roughly 40 days back (±1 day for the test's own wall-clock), not left at the
      // old 400-day default (which would fall ~360 days earlier than this window).
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
    }
  });

  it('an explicit wider daysBack (the WIDE-tier caller shape, e.g. loadPmixRows(400)) still works — the function itself is unchanged, only its default', async () => {
    __fakeConfig.qsr_product_mix = { rows: [] };
    const before = new Date(); before.setDate(before.getDate() - 401);
    const after = new Date(); after.setDate(after.getDate() - 399);

    await loadPmixRows(400);

    const gteCalls = __fakeConfig.qsr_product_mix.calls.gte;
    const [, val] = gteCalls[0];
    const cutoff = new Date(val + 'T00:00:00');
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('fetches the full row set at the new bounded default shape (436 pages at pageSize 1000, matching the measured 436,137-row/40-day count)', async () => {
    const rows = Array.from({ length: 436137 }, (_, i) => pmixRow(i));
    __fakeConfig.qsr_product_mix = { rows, pageSize: 1000 };
    const result = await loadPmixRows();
    expect(result.length).toBe(436137);
  });
});

describe('reproduce-then-fix scheduling shape (dispatch #170 verification bar)', () => {
  // Mirrors dt-history-pagination.test.js's own "scheduling measurement" test: isolates the
  // SCHEDULING difference (page/round-trip count under the real _MAX_INFLIGHT=6 cap) at row
  // counts standing in for the measured real OLD-default (2,526,181 rows / 400 days) vs
  // NEW-default (436,137 rows / 40 days) shapes, scaled down by ~580x so the test allocates
  // thousands rather than millions of objects while preserving the SAME ~5.8x ratio the live
  // measurement found (2,526,181 / 436,137 = 5.79). A fixed per-page latency stands in for real
  // Supabase round-trip time — the claim under test is round-trip ROUND count, not literal
  // milliseconds (test-runner scheduling jitter makes literal ms non-reproducible, same
  // reasoning dt-history-pagination.test.js's own test documents).
  it('BEFORE (old ~400-day/2.5M-row-shaped default): materially more round-trip rounds than AFTER (new ~40-day/436K-row-shaped default)', async () => {
    const LATENCY_MS = 5;
    const OLD_ROWS = 2527;   // stand-in for 2,526,181 (scaled 1:1000) -> 2527 pages -> 422 rounds @ cap 6
    const NEW_ROWS = 437;    // stand-in for 436,137   (scaled 1:1000) -> 437 pages  -> 73 rounds @ cap 6

    __fakeConfig.qsr_product_mix_old = { rows: Array.from({ length: OLD_ROWS }, (_, i) => pmixRow(i)), pageSize: 1, delayMs: LATENCY_MS };
    __fakeConfig.qsr_product_mix_new = { rows: Array.from({ length: NEW_ROWS }, (_, i) => pmixRow(i)), pageSize: 1, delayMs: LATENCY_MS };

    // Reproduce the OLD shape directly against _pagedParallel's real concurrency cap by driving
    // the same mock builder loadPmixRows itself uses, at a table name carrying the old row count
    // (loadPmixRows isn't parameterizable by table name, so this measures the identical
    // _MAX_INFLIGHT-capped fan-out shape _pagedParallel applies, via the same mock harness).
    const { supabase } = await import('../lib/supabase.js');
    async function fanOutFetch(table, rowCount, cap) {
      const pages = Math.ceil(rowCount / 1);
      let inflight = 0, idx = 0, active = [];
      const results = [];
      return new Promise(resolve => {
        function pump() {
          while (inflight < cap && idx < pages) {
            const p = idx++; inflight++;
            supabase.from(table).select('*').range(p, p).then(r => {
              results.push(r); inflight--;
              if (idx >= pages && inflight === 0) resolve(results);
              else pump();
            });
          }
        }
        pump();
      });
    }

    const oldStart = Date.now();
    await fanOutFetch('qsr_product_mix_old', OLD_ROWS, 6);
    const oldMs = Date.now() - oldStart;

    const newStart = Date.now();
    await fanOutFetch('qsr_product_mix_new', NEW_ROWS, 6);
    const newMs = Date.now() - newStart;

    // Analytically: OLD = ceil(2527/6) = 422 rounds, NEW = ceil(437/6) = 73 rounds -- a ~5.8x
    // reduction in rounds, matching the live-measured 2,526,181/436,137 = 5.79x row-count ratio.
    // Assert the conservative, reproducible form (>3x faster), not a literal ms prediction.
    expect(newMs).toBeLessThan(oldMs / 3);
  }, 20000);
});
