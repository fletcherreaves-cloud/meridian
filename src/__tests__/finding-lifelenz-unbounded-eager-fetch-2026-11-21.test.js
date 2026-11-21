// @ts-nocheck
// Egress finding (2026-11-21) — five of App.js's eager LifeLenz Data Explorer startup stages
// (_stScheduleVariance/_stComplianceAudit/_stEmployeePerformance/_stPayrollReadiness/
// _stLifelenzDar) call their loaders with NO args at all. Each loader's `{start,end,locs}={}`
// signature has no internal default, so `start`/`end` stay undefined and the `.gte`/`.lte`
// filters never get applied — the ENTIRE table history was fetched on every single login,
// unbounded and growing forever. Measured live (service-role, same recipe this repo's other
// "measure it" findings use):
//   lifelenz_schedule_variance:      6,227 rows
//   lifelenz_compliance_audit:       9,727 rows
//   lifelenz_employee_performance:  21,073 rows
//   lifelenz_payroll_readiness:     83,595 rows  (and ZERO consuming panel — pure waste)
//   lifelenz_dar:                    2,884 rows
//   lifelenz_attendance_summary:     1,640 rows (smaller scale, same bug class)
// Fixed by giving each loader a `daysBack` default that only applies when the caller doesn't
// supply `start` — every existing bounded caller (loadLifeLenzDar's two `{start,end}` call sites)
// is byte-identical in behavior. See memory/plan-egress-reduction-2026-11-20.md Section 15.
//
// Pattern follows dispatch-170-pmix-loader-scope.test.js exactly: a mock chainable query builder
// that records `.gte()` calls, verifying the REAL cutoff date each loader computes — not a
// black-box mock of the loader itself.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [] };
  const calls = cfg.calls || (cfg.calls = { gte: [] });
  // Real supabase-js query builders are "thenable", not actual Promises — every filter
  // method (including .range()) returns the SAME chainable builder, and only calling
  // .then() (i.e. awaiting it) executes the query. Production code here relies on that —
  // loadLifeLenzScheduleVariance/etc. call `.order(...).range(from, to)` and THEN apply
  // `.gte()`/`.lte()`/`.in()` on the result, which is only legal if .range() stays
  // chainable. An earlier version of this mock made .range() return a real Promise
  // immediately, which broke chaining after it and masked the real loader behavior
  // behind a mock bug (q.gte is not a function) — fixed by keeping .range() mutate-and-
  // return-builder like every other filter method, with execution deferred to .then().
  let _from = 0, _to = (cfg.rows.length - 1 >= 0 ? cfg.rows.length - 1 : 0);
  const builder = {
    select() { return builder; },
    gte(col, val) { calls.gte.push([col, val]); return builder; },
    lte() { return builder; },
    in() { return builder; },
    order() { return builder; },
    range(from, to) { _from = from; _to = to; return builder; },
    then(resolve, reject) {
      return Promise.resolve({ data: cfg.rows.slice(_from, _to + 1), error: null }).then(resolve, reject);
    },
  };
  return builder;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

let loaders;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  loaders = await import('../lib/supabase.js');
});
afterEach(() => { vi.unstubAllEnvs(); });

function expectCutoffNear(val, daysBack, col) {
  const before = new Date(); before.setDate(before.getDate() - daysBack - 1);
  const after = new Date(); after.setDate(after.getDate() - daysBack + 1);
  const cutoff = new Date(val + 'T00:00:00');
  expect(cutoff.getTime()).toBeGreaterThanOrEqual(before.getTime());
  expect(cutoff.getTime()).toBeLessThanOrEqual(after.getTime());
}

describe('LifeLenz Data Explorer loaders — no-args call now bounded, not the full table', () => {
  it('loadLifeLenzScheduleVariance() with no args requests a ~45-day cutoff on occurred_at', async () => {
    __fakeConfig.lifelenz_schedule_variance = { rows: [] };
    await loaders.loadLifeLenzScheduleVariance();
    const calls = __fakeConfig.lifelenz_schedule_variance.calls.gte;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toBe('occurred_at');
    expectCutoffNear(calls[0][1], 45);
  });

  it('loadLifeLenzComplianceAudit() with no args requests a ~45-day cutoff on shift_date', async () => {
    __fakeConfig.lifelenz_compliance_audit = { rows: [] };
    await loaders.loadLifeLenzComplianceAudit();
    const calls = __fakeConfig.lifelenz_compliance_audit.calls.gte;
    expect(calls[0][0]).toBe('shift_date');
    expectCutoffNear(calls[0][1], 45);
  });

  it('loadLifeLenzEmployeePerformance() with no args requests a ~60-day cutoff on period_end', async () => {
    __fakeConfig.lifelenz_employee_performance = { rows: [] };
    await loaders.loadLifeLenzEmployeePerformance();
    const calls = __fakeConfig.lifelenz_employee_performance.calls.gte;
    expect(calls[0][0]).toBe('period_end');
    expectCutoffNear(calls[0][1], 60);
  });

  it('loadLifeLenzPayrollReadiness() with no args requests a ~14-day cutoff on pay_period_start — the tightest bound, since nothing consumes this stream but a freshness check', async () => {
    __fakeConfig.lifelenz_payroll_readiness = { rows: [] };
    await loaders.loadLifeLenzPayrollReadiness();
    const calls = __fakeConfig.lifelenz_payroll_readiness.calls.gte;
    expect(calls[0][0]).toBe('pay_period_start');
    expectCutoffNear(calls[0][1], 14);
  });

  it('loadLifeLenzDar() with no args requests a ~45-day cutoff on dt', async () => {
    __fakeConfig.lifelenz_dar = { rows: [] };
    await loaders.loadLifeLenzDar();
    const calls = __fakeConfig.lifelenz_dar.calls.gte;
    expect(calls[0][0]).toBe('dt');
    expectCutoffNear(calls[0][1], 45);
  });

  it('loadLifeLenzDar({start,end}) — the already-bounded LiveOps fallback call site — is unaffected: its OWN explicit start wins, not the new default', async () => {
    __fakeConfig.lifelenz_dar = { rows: [] };
    await loaders.loadLifeLenzDar({ start: '2026-11-20', end: '2026-11-20' });
    const calls = __fakeConfig.lifelenz_dar.calls.gte;
    expect(calls[0]).toEqual(['dt', '2026-11-20']);
  });

  it('loadLifeLenzAttendance() with no args requests a ~45-day cutoff on period_end', async () => {
    __fakeConfig.lifelenz_attendance_summary = { rows: [] };
    await loaders.loadLifeLenzAttendance();
    const calls = __fakeConfig.lifelenz_attendance_summary.calls.gte;
    expect(calls[0][0]).toBe('period_end');
    expectCutoffNear(calls[0][1], 45);
  });
});
