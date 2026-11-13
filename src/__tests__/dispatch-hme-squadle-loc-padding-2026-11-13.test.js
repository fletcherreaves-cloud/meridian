// @ts-nocheck
// `loadHmeDtRows`/`loadSquadleChecklistRecords` (src/lib/supabase.js) shipped this session without
// stripping the zero-padding both `hme_dt_daily` and `squadle_checklist_records` store `loc` with
// (verified live, 2026-11-13: both tables return e.g. "0003708", not "3708") — the exact bug class
// memory/finding-lifelenz-loc-padding-store-duplication-2026-11-02.md already found and fixed in
// 6 other loaders. Both stream dsFields feed `dsAutoStoreIds()` (pipeline.js) via `STREAMS`
// (stream-freshness.js), so a padded-and-unpadded pair for the same physical store doubled every
// `allLocs`-derived list app-wide — reproduced live as "54 stores missing this week's projection
// commit" (27 real stores, each counted twice: once unresolved by raw loc, once resolved by name).
import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

function chain(rows) {
  const q = {
    select: () => q, gte: () => q, order: () => q,
    range: () => Promise.resolve({ data: rows, error: null }),
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table) => {
      if (table === 'hme_dt_daily') {
        return chain([{ loc: '0003708', dt: '2026-11-12', store_rank: 1, cars: 40, avg_seconds: 180, pct: 0.9 }]);
      }
      if (table === 'squadle_checklist_records') {
        return chain([{ loc: '0003708', dt: '2026-11-12', squadle_location_id: 'abc', shard: 1, created_on: '2026-11-12', data: {} }]);
      }
      return chain([]);
    },
  }),
}));

const { loadHmeDtRows, loadSquadleChecklistRecords } = await import('../lib/supabase.js');

describe('HME Cloud / Squadle loaders strip zero-padded loc (2026-11-13)', () => {
  it('loadHmeDtRows returns unpadded loc', async () => {
    const rows = await loadHmeDtRows({ daysBack: 90 });
    expect(rows).toHaveLength(1);
    expect(rows[0].loc).toBe('3708');
  });

  it('loadSquadleChecklistRecords returns unpadded loc', async () => {
    const rows = await loadSquadleChecklistRecords({ daysBack: 30 });
    expect(rows).toHaveLength(1);
    expect(rows[0].loc).toBe('3708');
  });
});
