// @vitest-environment happy-dom
// @ts-nocheck
// Closes the gap memory/finding-security-events-reQuery-deny-2026-11-14.md flagged and left
// open: "this stream has no entry in src/engine/stream-freshness.js's STREAMS array at all" —
// qsr_security_events was invisible to At-A-Glance's "Loaded Data" checklist and the home-screen
// staleness banner, unlike every other watched automated pull (CLAUDE.md's "Adding a new
// automated pull" checklist, item 2). Same lightweight single-{date}-row probe pattern already
// proven for On-Hand/Variance (task #137): loadQsrSecurityEventsFreshness() (src/lib/supabase.js)
// + App.js's _stSecurityEventsFreshness background stage + a real STREAMS entry.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { streamFreshness, STREAMS } from '../engine/stream-freshness.js';

describe('STREAMS registry carries a real QSRSoft Security Events entry', () => {
  it('is present with daily cadence, off its own lightweight-probe ds field, grouped under Controls', () => {
    expect(STREAMS.find(s => s.key === 'securityEvents')).toMatchObject({
      dsField: 'qsrSecurityEventsFreshnessRows', cadenceDays: 1, group: 'controls',
    });
  });

  // securityEvents is one of the 18 streams the 2026-11-16 QSRSoft Operator Security Notice
  // compliance pause marks `paused:true` in STREAMS (added the day after this test file was
  // written), so severity is now always 'paused' regardless of staleness -- see
  // memory/finding-qsrsoft-compliance-pause-watchdog-override-2026-11-17.md. staleDays is still
  // computed correctly from the real date, which these two tests now assert directly.
  it('a healthy ~1-day-behind latest (this pull deliberately never requests "today") computes staleDays:1, reported as paused (compliance pause)', () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const ds = { qsrSecurityEventsFreshnessRows: [{ date: yesterday.toISOString() }] };
    const entry = streamFreshness(ds).find(s => s.key === 'securityEvents');
    expect(entry.staleDays).toBe(1);
    expect(entry.severity).toBe('paused');
  });

  it('a genuinely stale latest (5 days behind) still computes staleDays:5, but is reported as paused, not crit', () => {
    const stale = new Date(); stale.setDate(stale.getDate() - 5);
    const ds = { qsrSecurityEventsFreshnessRows: [{ date: stale.toISOString() }] };
    const entry = streamFreshness(ds).find(s => s.key === 'securityEvents');
    expect(entry.staleDays).toBe(5);
    expect(entry.severity).toBe('paused');
  });

  it('not yet loaded into ds this session reads as no verdict, not a false stale', () => {
    const entry = streamFreshness({}).find(s => s.key === 'securityEvents');
    expect(entry).toBeUndefined();
  });
});

const __fakeConfig = {};
function mkBuilder(table) {
  const cfg = __fakeConfig[table] || { rows: [], error: null };
  return {
    select() { return this; },
    order() { return this; },
    limit() { return Promise.resolve({ data: cfg.rows, error: cfg.error }); },
  };
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table) => mkBuilder(table) }),
}));

describe('loadQsrSecurityEventsFreshness()', () => {
  let loadQsrSecurityEventsFreshness;
  beforeEach(async () => {
    vi.resetModules();
    for (const k of Object.keys(__fakeConfig)) delete __fakeConfig[k];
    vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
    __fakeConfig.qsr_security_events = { rows: [{ event_dt: '2026-11-14' }], error: null };
    ({ loadQsrSecurityEventsFreshness } = await import('../lib/supabase.js'));
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('returns a single {date} row keyed off event_dt, not updated_at', async () => {
    const rows = await loadQsrSecurityEventsFreshness();
    expect(rows).toEqual([{ date: '2026-11-14' }]);
  });

  it('returns [] when the table has no rows yet, never throws', async () => {
    __fakeConfig.qsr_security_events = { rows: [], error: null };
    const rows = await loadQsrSecurityEventsFreshness();
    expect(rows).toEqual([]);
  });

  it('returns [] (not a throw) on a query error', async () => {
    __fakeConfig.qsr_security_events = { rows: null, error: { message: 'boom' } };
    const rows = await loadQsrSecurityEventsFreshness();
    expect(rows).toEqual([]);
  });
});
