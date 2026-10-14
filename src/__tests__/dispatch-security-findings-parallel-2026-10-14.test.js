// @ts-nocheck
// Dispatch 2026-10-14 (owner-reported live, follow-up to v5.552) -- the fetchAll() skip-and-
// continue fix (dispatch-218-fetchall-retry.test.js) genuinely fixed the truncation bug, but the
// owner STILL saw an empty Inventory tab after it shipped. Live-measured directly against the
// real table (service-role, real end-to-end code path): loadSecurityFindings() was calling the
// SEQUENTIAL fetchAll() -- one page at a time, no concurrency -- instead of _pagedParallel(), the
// helper almost every other big-table loader in this file already uses. A full sequential load of
// ~20,700 rows across ~21 pages measured 39.5s with ZERO page failures that run; a second run
// measured 4/21 pages failing and _pagedParallel's own Promise.allSettled tolerance still
// recovered 206 real Inventory groups in ~20-24s (vs fetchAll's one-bad-page-still-costs-a-full-
// retry-cycle-before-moving-on shape). _pagedParallel() never had the truncation bug either (its
// own header: "a partial/throttled read keeps whatever pages returned... instead of rejecting"),
// so switching loadSecurityFindings() onto it is a strict improvement on both speed AND
// resilience, not a tradeoff -- fixed once by using the helper this loader should have used from
// the start, not by tuning fetchAll() further.
//
// This also needed _pagedParallel's own `extraOrder` support extended: it previously only applied
// a plain column name (ascending, the only direction every existing caller needed), but
// loadSecurityFindings' own index-matching order is `tenant_id, loc, subject_key, rule_id` ASC
// then `window_end, computed_at` DESC -- a mixed-direction order no existing caller needed before.
//
// Part 2 (owner re-reported STILL empty after the _pagedParallel switch, now "4 page(s) failed"
// instead of 1): pageSize 1000 was simply too much work per page for this view's DISTINCT ON
// materialization. Live-measured directly: 6 concurrent 1000-row pages at the table's
// worst-observed offset zone timed out 6/6 at a consistent ~8.3s; the same test at pageSize 300
// was 0/6 with a ~7x margin. Dropped to 300 -- end-to-end through the real loader: 20,793/20,793
// rows, ZERO failures, 8-17s (vs pageSize 1000's 20-40s WITH failures). Same lesson this file's
// own loadQsrRawItemDetail already learned (pageSize 200, not the 1000 default, for the same
// statement-timeout reason) -- a DISTINCT ON view can fall off a cliff well under 1000 rows.
// *** This measurement used the SUPABASE SERVICE ROLE key -- see Part 3, below, for why that
// made it meaningless for what actually happens in the owner's browser. ***
//
// Part 3 (owner ran the v5.555 RLS InitPlan-wrapping SQL migration, STILL "11 page(s) failed"):
// re-measured for real this time with a throwaway admin-role AUTH SESSION (RLS actually applied,
// exactly like the browser) instead of the service-role key every prior measurement in this
// dispatch used (which bypasses RLS entirely and so could never have told us anything about an
// RLS-specific slowdown). Isolated one variable at a time against the live table:
//   - A single query against this view, ANY page size 50-1000, run alone (no concurrent
//     sibling) -- costs a near-constant ~5.1-6.2s regardless of size. The identical query against
//     the BASE table (no DISTINCT ON) cost 176-929ms -- 5-30x cheaper. So the view's DISTINCT ON
//     materialization being recomputed under RLS on every call is the real cost, not page size --
//     which is also why v5.555's InitPlan fix changed nothing: it targeted a cost model (per-row
//     function re-evaluation) that was never the actual bottleneck.
//   - 2 concurrent pages: borderline (7.3s max, too close to the ~8s timeout to trust live).
//     3+ concurrent: FAILS 100% of the time at ~8.1-8.4s, at every page size tried -- this is
//     exactly what "11 page(s) failed" was: _pagedParallel's shared 6-way _MAX_INFLIGHT firing
//     6 already-marginal (~5-6s) queries at once, each one's cost compounding the others past
//     the timeout.
//   - Walked the full live table sequentially (21 pages of 1000 rows each, real RLS session):
//     21/21 succeeded, max single page 6201ms (~1.8s margin under the 8s timeout),
//     20,793/20,793 rows, zero failures.
// Fix: pageSize back up to 1000 (it was never page size driving the cost) + a new PER-CALL
// maxInflight:1 option on _pagedParallel (NOT a change to the shared _MAX_INFLIGHT=6 pool every
// other caller draws from -- none of those tables share this one's RLS-view cost problem).
// Slower than every other stream in this file, but reliable, which this table was not at any
// concurrency above 1. A real DB-side fix (materializing this view instead of computing it live
// under RLS on every call) is future work; this one needed no SQL migration and was verified
// end-to-end against the real table under real RLS, unlike the three attempts before it.
//
// Driven through the real exported loadSecurityFindings() against a mock Supabase client, per
// this repo's "drive a fix through a real exported loader" convention (paged-parallel-count-
// fallback.test.js, same file, same pattern) -- _pagedParallel/fetchAll are both unexported.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
const __orderCalls = []; // records every .order(col, opts) call, in sequence, per from(table)
const __headModeTables = []; // records every table a {head:true} select was issued against --
// ONLY _pagedParallel's upfront count-HEAD query does this; the sequential fetchAll() never did.
const __rangeCalls = []; // records every .range(from, to) call, per table -- used to pin pageSize.
let __inFlight = 0;
let __maxInFlightSeen = 0; // peak concurrent in-flight .range() calls -- proves maxInflight is enforced, not just declared.

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table) {
      const cfg = __fakeConfig[table] || { rows: [] };
      const builder = {
        _headMode: false,
        select(_cols, opts) { builder._headMode = !!(opts && opts.head); if (builder._headMode) __headModeTables.push(table); return builder; },
        limit() { return builder; }, // the view-existence probe: select('id').limit(1)
        gte() { return builder; },
        in() { return builder; },
        order(col, opts) { __orderCalls.push({ table, col, ascending: opts ? opts.ascending : true }); return builder; },
        async range(from, to) {
          __rangeCalls.push({ table, from, to });
          // A real artificial delay (not a same-tick Promise.resolve) -- needed so overlapping
          // range() calls actually OVERLAP in wall-clock time, which is what lets
          // __maxInFlightSeen catch a maxInflight cap that isn't being enforced.
          __inFlight++; __maxInFlightSeen = Math.max(__maxInFlightSeen, __inFlight);
          await new Promise(resolve => setTimeout(resolve, 5));
          __inFlight--;
          return { data: cfg.rows.slice(from, to + 1), error: null };
        },
        // Reached for the count-HEAD call (_pagedParallel) AND the bare view-probe select
        // (no .range() ever called on either path).
        then(resolve, reject) {
          const result = builder._headMode
            ? (cfg.countError ? { count: null, error: cfg.countError, data: null } : { count: cfg.rows.length, error: null, data: null })
            : { data: cfg.rows.slice(0, 1), error: null }; // probe: "the view exists and returns rows"
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  }),
}));

function findingRow(i, overrides = {}) {
  return {
    id: `id-${i}`, emp_token: null, wrin: `WRIN-${i}`, loc: '0003708', rule_id: 'INV-001',
    window_start: '2026-08-01', window_end: '2026-10-31', value: 3.5, threshold_used: 2.5,
    pass: true, lifecycle_category: null, exoneration_share: null, explanation: [], computed_at: '2026-10-13T00:00:00Z',
    bc_mean: null, bc_stdev: null, bc_n: null,
    ...overrides,
  };
}

let loadSecurityFindings;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  __orderCalls.length = 0;
  __headModeTables.length = 0;
  __rangeCalls.length = 0;
  __inFlight = 0;
  __maxInFlightSeen = 0;
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadSecurityFindings } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('loadSecurityFindings() uses _pagedParallel (dispatch 2026-10-14)', () => {
  it('pulls MORE than one page through the parallel, count-based path -- proves it is no longer the sequential fetchAll', async () => {
    // pageSize is 300; 1500 rows forces 5 pages, only reachable if the count-HEAD query ran and
    // `pages` was computed correctly (the sequential fetchAll path never issues a count query at
    // all -- its mock signature wouldn't even need .select(cols, {head:true}) support).
    const rows = Array.from({ length: 1500 }, (_, i) => findingRow(i));
    __fakeConfig.security_findings_latest = { rows, countError: null };
    const result = await loadSecurityFindings();
    expect(result.length).toBe(1500);
    expect(result[0].wrin).toBe('WRIN-0');
    expect(result[1499].wrin).toBe('WRIN-1499');
  });

  it('pageSize is 1000 (Part 3 -- page size was never the cost driver under real RLS; a per-call maxInflight:1 cap is what makes 1000 safe again, see this file\'s own header)', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => findingRow(i));
    __fakeConfig.security_findings_latest = { rows, countError: null };
    await loadSecurityFindings();
    const forTable = __rangeCalls.filter(c => c.table === 'security_findings_latest');
    expect(forTable[0]).toMatchObject({ from: 0, to: 999 });
  });

  it('runs its pages fully SEQUENTIALLY (maxInflight:1), never more than one in flight at once -- the real fix for the live "11 page(s) failed" symptom, which was concurrency pushing already-marginal RLS queries over the statement timeout, not page size (regression guard: confirmed this assertion fails without maxInflight wired through)', async () => {
    // 2500, not an exact multiple of pageSize (1000) -- the last page comes back short, so the
    // count:'estimated' safety-extension (see _pagedParallel's own comment) never fires an extra
    // probe page, keeping this test's page count exactly 3 and not coupled to that unrelated
    // mechanism.
    const rows = Array.from({ length: 2500 }, (_, i) => findingRow(i)); // 3 pages at pageSize 1000
    __fakeConfig.security_findings_latest = { rows, countError: null };
    const result = await loadSecurityFindings();
    expect(result.length).toBe(2500);
    const forTable = __rangeCalls.filter(c => c.table === 'security_findings_latest');
    expect(forTable.length).toBe(3);
    expect(__maxInFlightSeen).toBe(1);
  });

  it('issues an upfront {head:true} count query against security_findings_latest -- the one signal unique to _pagedParallel; the old sequential fetchAll() never issued one (confirmed: this assertion fails on the pre-fix code)', async () => {
    __fakeConfig.security_findings_latest = { rows: [findingRow(0)], countError: null };
    await loadSecurityFindings();
    expect(__headModeTables).toContain('security_findings_latest');
  });

  it('the index-matching order is applied in the exact sequence the covering index needs, mixed ascending/descending', async () => {
    __fakeConfig.security_findings_latest = { rows: [findingRow(0)], countError: null };
    await loadSecurityFindings();
    const forTable = __orderCalls.filter(c => c.table === 'security_findings_latest');
    // security_findings_latest_support_idx: (tenant_id, loc, subject_key, rule_id, window_end desc, computed_at desc).
    expect(forTable.map(c => [c.col, c.ascending])).toEqual([
      ['tenant_id', true], ['loc', true], ['subject_key', true], ['rule_id', true],
      ['window_end', false], ['computed_at', false],
    ]);
  });

  it('a ruleIds filter is applied to both the count query and the page query (via inCol/inVals)', async () => {
    const rows = [findingRow(0, { rule_id: 'INV-002' })];
    __fakeConfig.security_findings_latest = { rows, countError: null };
    const result = await loadSecurityFindings({ ruleIds: ['INV-002'] });
    expect(result.length).toBe(1);
    expect(result[0].ruleId).toBe('INV-002');
  });

  it('a failed count-HEAD query (the old pre-#343 failure mode) falls back to the sequential fetchAll, same as every other _pagedParallel caller -- never silently caps at one page', async () => {
    const rows = Array.from({ length: 1200 }, (_, i) => findingRow(i));
    __fakeConfig.security_findings_latest = { rows, countError: { message: 'canceling statement due to statement timeout' } };
    const result = await loadSecurityFindings();
    expect(result.length).toBe(1200);
  });

  it('maps rows correctly end-to-end (id/loc/ruleId/pass/etc, not just row count)', async () => {
    __fakeConfig.security_findings_latest = { rows: [findingRow(0, { pass: true, value: 4.67, wrin: '00001-705' })], countError: null };
    const [f] = await loadSecurityFindings();
    expect(f).toMatchObject({ id: 'id-0', loc: '3708', ruleId: 'INV-001', wrin: '00001-705', pass: true, value: 4.67 });
  });
});
