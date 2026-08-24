// @ts-nocheck
// Dispatch #88 item 2 -- Speed of Service's DT History panel took 15+ seconds to load.
// Measured root cause (src/lib/supabase.js's loadDtHistory): the panel needs HOUR-SLOT
// granularity (dt-speedofservice.js's hourData/daypartData both aggregate by hour_slot, ruling
// out the qsr_daily_activity_daily rollup view), so 90 days x 27 stores x 24 slots ~= 58,000
// candidate rows, and the old fetchAll() pagination is STRICTLY SEQUENTIAL -- one page fetched,
// awaited, then the next requested -- meaning ~58 serial round-trips before the panel could
// render anything. _pagedParallel already exists (used by qsr_fob/labor_rows/peaks_rows/
// audit_rows/ops_rows/ctrl_rows/daily_glimpse_daily/cash_sheet_daily/sales_ledger_daily/
// qsr_product_mix) and fans pages out under the shared _MAX_INFLIGHT=6 concurrency cap instead
// of awaiting each page serially -- this was the one remaining qsr_daily_activity reader still
// on fetchAll. loadDtHistory converted to call it, threading dt_trans_cnt > 0 through the new
// additive `extraFilter` param (the one filter _pagedParallel's existing gteCol/inCol shortcuts
// didn't cover).
//
// This suite is the "before/after, not 'feels faster'" evidence the dispatch's verification bar
// requires. This sandbox has no authenticated production Supabase session (qsr_daily_activity is
// RLS-restricted -- confirmed live: the anon key sees 0 rows on it, unlike public-read tables),
// so a true production wall-clock trace isn't obtainable here, mirroring #191's own qsr_fob
// migration (which shipped the identical fetchAll -> _pagedParallel change with its wall-clock
// improvement explicitly NOT verified live, for the same reason). What IS measured directly:
// (1) the exact page/row counts loadDtHistory now issues, against a mock sized to match its real
// shape (58 pages), (2) that dt_trans_cnt > 0 actually reaches every page query AND the fallback
// path, not just the happy path, (3) that a failed page still surfaces _recordDataError (the
// dispatch's explicit "confirm partial-failure handling still surfaces" ask), and (4) a
// controlled-latency simulation isolating the SCHEDULING change (sequential-await vs
// capped-concurrency fan-out) at the real 58-page/6-inflight shape -- not a prediction of real
// production milliseconds, but a genuine, reproducible measurement of the scheduling difference
// this fix makes, run against the same mock harness #343's own regression test uses.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [] };
  const calls = cfg.calls || (cfg.calls = { gt: [], order: [] });
  const builder = {
    select(_cols, opts) { builder._headMode = !!(opts && opts.head); return builder; },
    gte() { return builder; },
    in() { return builder; },
    gt(col, val) { calls.gt.push([col, val]); return builder; },
    order(col) { calls.order.push(col); return builder; },
    range(from, to) {
      const delay = cfg.delayMs || 0;
      const pageIdx = Math.floor(from / (cfg.pageSize || 1000));
      const failPages = cfg.failPageIndexes || [];
      const run = () => failPages.includes(pageIdx)
        ? { data: null, error: { message: 'simulated page failure' } }
        : { data: cfg.rows.slice(from, to + 1), error: null };
      return delay ? new Promise(r => setTimeout(() => r(run()), delay)) : Promise.resolve(run());
    },
    then(resolve, reject) {
      const delay = cfg.delayMs || 0;
      const run = () => cfg.countError
        ? { count: null, error: cfg.countError, data: null }
        : { count: cfg.rows.length, error: null, data: null };
      return (delay ? new Promise(r => setTimeout(() => r(run()), delay)) : Promise.resolve(run()))
        .then(resolve, reject);
    },
  };
  return builder;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

function activityRow(i) {
  const dt = new Date(2026, 4, 1 + Math.floor(i / (27 * 24)));
  return {
    loc: String(1000 + (i % 27)), dt: dt.toISOString().slice(0, 10),
    hour_slot: String(5 + (i % 24)).padStart(2, '0') + ':00',
    dt_untilserve: 120, dt_trans_cnt: 5, fc_untilserve: 90, fc_trans_cnt: 3,
    mfy1_untilserve: 60, mfy1_trans_cnt: 2, mfy2_untilserve: 0, mfy2_trans_cnt: 0,
    bev_untilserve: 30, bev_trans_cnt: 1,
  };
}

let loadDtHistory;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadDtHistory } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe('loadDtHistory pagination (dispatch #88 item 2)', () => {
  it('fetches the full row set across pages, matching the real ~58-page shape (58,320 rows at pageSize 1000)', async () => {
    const rows = Array.from({ length: 58320 }, (_, i) => activityRow(i));
    __fakeConfig.qsr_daily_activity = { rows, pageSize: 1000 };
    const result = await loadDtHistory(90);
    expect(result.length).toBe(58320);
  });

  it('sends dt_trans_cnt > 0 to the head-count query AND every page query -- not just the happy-path filter shortcut', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => activityRow(i));
    __fakeConfig.qsr_daily_activity = { rows, pageSize: 1000 };
    await loadDtHistory(90);
    const gtCalls = __fakeConfig.qsr_daily_activity.calls.gt;
    expect(gtCalls.length).toBeGreaterThanOrEqual(4); // 1 head + 3 pages (2500 rows / 1000)
    for (const [col, val] of gtCalls) { expect(col).toBe('dt_trans_cnt'); expect(val).toBe(0); }
  });

  it('preserves the original dt asc, loc, hour_slot ordering', async () => {
    __fakeConfig.qsr_daily_activity = { rows: [activityRow(0)], pageSize: 1000 };
    await loadDtHistory(90);
    expect(__fakeConfig.qsr_daily_activity.calls.order).toEqual(['dt', 'loc', 'hour_slot']);
  });

  it('still applies dt_trans_cnt > 0 on the fetchAll FALLBACK path when the head count fails (#343 coverage extended to this caller)', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => activityRow(i));
    __fakeConfig.qsr_daily_activity = {
      rows, pageSize: 1000, countError: { message: 'canceling statement due to statement timeout' },
    };
    const result = await loadDtHistory(90);
    expect(result.length).toBe(1500); // fetchAll's own pagination still returns everything
    const gtCalls = __fakeConfig.qsr_daily_activity.calls.gt;
    expect(gtCalls.length).toBeGreaterThan(0);
    expect(gtCalls.every(([col, val]) => col === 'dt_trans_cnt' && val === 0)).toBe(true);
  });

  it('a failed page still surfaces _recordDataError (dispatch\'s explicit partial-failure ask) -- console.error fires naming dtHistory', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => activityRow(i));
    __fakeConfig.qsr_daily_activity = { rows, pageSize: 1000, failPageIndexes: [1] };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await loadDtHistory(90);
      // Page 0 (1000 rows) succeeded, page 1 failed -- partial data, not a thrown exception.
      expect(result.length).toBe(1000);
      expect(errSpy).toHaveBeenCalled();
      const call = errSpy.mock.calls.find(args => String(args[0]).includes('DATA INCOMPLETE'));
      expect(call).toBeTruthy();
      expect(call.join(' ')).toContain('dtHistory');
      // PR #633 review (post-merge) -- the hint used to hardcode "newest-first keeps the recent
      // days", true for every pre-existing ascending:false caller but backwards for loadDtHistory
      // (ascending:true), where the LATER pages -- more exposed to a partial failure -- hold the
      // NEWEST rows. Pin the corrected, direction-aware wording for this caller.
      expect(call.join(' ')).toContain('oldest-first');
      expect(call.join(' ')).not.toContain('newest-first keeps the recent days');
    } finally { errSpy.mockRestore(); }
  });

  it('scheduling measurement: capped-concurrency fan-out clears a fixed per-request latency in materially fewer sequential rounds than the old strictly-sequential fetchAll, at the real ~58-page shape', async () => {
    // Isolates the SCHEDULING change this fix makes, not a production time prediction: same
    // page count (58) and concurrency cap (_MAX_INFLIGHT=6, supabase.js) the real fix uses,
    // with a small uniform per-request delay standing in for real Supabase round-trip time.
    const LATENCY_MS = 30;
    const PAGES = 58;
    const rows = Array.from({ length: PAGES * 1000 }, (_, i) => activityRow(i));

    // "Before": strictly-sequential await-one-page-then-next, PAGES rounds of LATENCY_MS.
    __fakeConfig.qsr_daily_activity_seq = { rows, pageSize: 1000, delayMs: LATENCY_MS };
    const seqStart = Date.now();
    { // Reproduce fetchAll's own one-page-then-wait loop directly against the same mock builder.
      let from = 0, all = [];
      while (true) {
        const b = mkBuilder('qsr_daily_activity_seq');
        const { data } = await b.range(from, from + 999);
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      expect(all.length).toBe(PAGES * 1000);
    }
    const seqMs = Date.now() - seqStart;

    // "After": _pagedParallel's own real _MAX_INFLIGHT=6 fan-out, exercised through loadDtHistory
    // itself (not reimplemented), against an equally-latent mock.
    __fakeConfig.qsr_daily_activity = { rows, pageSize: 1000, delayMs: LATENCY_MS };
    const parStart = Date.now();
    const parResult = await loadDtHistory(90);
    const parMs = Date.now() - parStart;
    expect(parResult.length).toBe(PAGES * 1000);

    // Analytically: sequential = PAGES rounds; parallel = ceil(PAGES/6) rounds (+1 for the
    // upfront head-count round-trip). At 58 pages / cap 6 that's 58 rounds vs 11 rounds -- a
    // >4x reduction in ROUND-TRIP ROUNDS is the actual claim; wall-clock varies with test-runner
    // scheduling jitter, so assert the conservative, reproducible form of that claim.
    expect(parMs).toBeLessThan(seqMs / 2);
  });
});
