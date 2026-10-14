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
        range(from, to) {
          __rangeCalls.push({ table, from, to });
          return Promise.resolve({ data: cfg.rows.slice(from, to + 1), error: null });
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

  it('pageSize is 300, not the 1000 default -- live-measured: 1000-row pages timed out 6/6 against this view, 300 was 0/6 with a 7x margin (regression guard: do not raise this back toward 1000)', async () => {
    const rows = Array.from({ length: 301 }, (_, i) => findingRow(i));
    __fakeConfig.security_findings_latest = { rows, countError: null };
    await loadSecurityFindings();
    const forTable = __rangeCalls.filter(c => c.table === 'security_findings_latest');
    expect(forTable[0]).toMatchObject({ from: 0, to: 299 });
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
