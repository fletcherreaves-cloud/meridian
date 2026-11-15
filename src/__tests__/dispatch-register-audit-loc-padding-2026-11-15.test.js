// @ts-nocheck
// `audit_rows` loc-padding regression (2026-11-15, owner-reported live via Register Audit tab).
// scripts/qsrsoft-register-audit-pull.mjs's mapRow() writes `loc` NSN-zero-padded (nsn7()),
// matching qsr_daily_activity/qsr_fob's own convention — but loadAuditRows()/loadAuditRowsWindow()
// (src/lib/supabase.js) passed `r.loc` through raw, with no unpadding, unlike every other
// zero-padded-source loader in this file (loadHmeDtRows/loadSquadleChecklistRecords,
// dispatch-hme-squadle-loc-padding-2026-11-13.test.js; loadQsrSecurityEventsForSubject). Measured
// live against production (SUPABASE_ACCESS_TOKEN Management API, 2026-11-15): 27 of 27 stores had
// a padded ('0006178') and an unpadded ('6178') loc coexisting in audit_rows, 21,929 duplicate
// (date,emp,register_type) pairs between them, and RegisterAuditTab's own `r.loc===loc` filter
// (store-analytics.js) is a strict string match against STORE_NAMES' unpadded loc — so every
// padded row (the only ones with data past 2026-06-30, since the pull was down ~2 months and the
// v5.779/5.781 restore re-pulled/backfilled under the padded format) was invisible to the UI,
// which reported only the old unpadded rows' stale June 30 cutoff as "all data on file".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [] };
  const builder = {
    select(_cols, opts) { builder._headMode = !!(opts && opts.head); return builder; },
    gte() { return builder; },
    lte() { return builder; },
    in() { return builder; },
    order() { return builder; },
    range(from, to) {
      return Promise.resolve({ data: cfg.rows.slice(from, to + 1), error: null });
    },
    then(resolve, reject) {
      return Promise.resolve({ count: cfg.rows.length, error: null, data: null }).then(resolve, reject);
    },
  };
  return builder;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

let loadAuditRows, loadAuditRowsWindow;
beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
  ({ loadAuditRows, loadAuditRowsWindow } = await import('../lib/supabase.js'));
});
afterEach(() => { vi.unstubAllEnvs(); });

const PADDED_ROW = {
  loc: '0006178', date: '2026-11-13', emp: 'Patsy B', register_type: 'cashier', emp_token: 't1',
  drawer_sales: 100, avg_check: 5, drawer_opens: 10, drawer_gc: 20,
};

describe('audit_rows loc-padding fix (2026-11-15)', () => {
  it('loadAuditRows strips the zero-padding — a padded DB row matches STORE_NAMES\' unpadded loc', async () => {
    __fakeConfig.audit_rows = { rows: [PADDED_ROW] };
    const rows = await loadAuditRows(400);
    expect(rows).toHaveLength(1);
    expect(rows[0].loc).toBe('6178');
  });

  it('loadAuditRowsWindow (the drill-down loader) strips it too, same root cause', async () => {
    __fakeConfig.audit_rows = { rows: [PADDED_ROW] };
    const rows = await loadAuditRowsWindow({ start: '2026-11-01', end: '2026-11-14' });
    expect(rows).toHaveLength(1);
    expect(rows[0].loc).toBe('6178');
  });

  it('loadAuditRows leaves an already-unpadded legacy row unchanged', async () => {
    __fakeConfig.audit_rows = { rows: [{ ...PADDED_ROW, loc: '6178' }] };
    const rows = await loadAuditRows(400);
    expect(rows[0].loc).toBe('6178');
  });
});
