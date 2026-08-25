// @ts-nocheck
// Dispatch #107 Part 1 — ds.targets (the real yearly-upload workbook: OEPE/CSAT/Digital/
// People/Labor-FOB) had ZERO Supabase persistence, so it was rebuilt from scratch every
// session purely by re-parsing whatever workbook happened to get uploaded that session —
// the root cause of the owner re-uploading "several times". This exercises the real
// saveYearlyTargets/loadYearlyTargets/loadAllYearlyTargets functions in src/lib/supabase.js
// against a mocked supabase-js client (same technique as monthly-targets-null-strip.test.js),
// not a re-derived stand-in.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _mockRows = [];
let _lastUpsert = null; // { table, rows, opts }
let _upsertErrorOnce = null; // { code, message } — injected once, then cleared

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table) => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          then: (resolve) => resolve({ data: _mockRows, error: null }),
        };
        return chain;
      },
      upsert: (rows, opts) => {
        _lastUpsert = { table, rows, opts };
        if (_upsertErrorOnce) {
          const err = _upsertErrorOnce; _upsertErrorOnce = null;
          return Promise.resolve({ data: null, error: err });
        }
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  }),
}));

const { saveYearlyTargets, loadYearlyTargets, loadAllYearlyTargets } = await import('../lib/supabase.js');

beforeEach(() => { _mockRows = []; _lastUpsert = null; _upsertErrorOnce = null; });

describe('saveYearlyTargets — writes to yearly_targets, mapping every parseYearlyTargets() field', () => {
  it('maps ds.targets field names to yearly_targets columns and upserts on (loc,year)', async () => {
    const targets = {
      '3708': {
        tOepe: 140, tPark: 0.03, tKvst: 45, tKvsu: 0.85, tR2p: 95,
        tOsat: 0.62, tOsatB2B: 0.02, tVoiceEAD: 0.9, t1800Contacts: 3,
        tDigAppPct: 0.18, tDigAppGCRD: 1.2, tMcdGCRD: 0.5, tMcdWait: 4.2, tMcdStars: 4.6,
        tCrewStaffing: 40, tShiftLeaders: 8, tManagers: 4, tHeadcount: 52,
        tToShiftLeader: 0.15, tToCrew090: 0.3, tToCrewYTD: 0.45,
        tTpph: 5.6, tLabor: 0.22, tFOBTarget: 0.28,
      },
    };
    const r = await saveYearlyTargets(targets, 2026);
    expect(r.saved).toBe(1);
    expect(r.errors).toEqual([]);
    expect(_lastUpsert.table).toBe('yearly_targets');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'loc,year' });
    const row = _lastUpsert.rows[0];
    expect(row.loc).toBe('3708');
    expect(row.year).toBe(2026);
    expect(row.oepe_pace).toBe(140);
    expect(row.park_pct).toBe(0.03);
    expect(row.kvs_pace).toBe(45);
    expect(row.kvs_usage_pct).toBe(0.85);
    expect(row.r2p_pace).toBe(95);
    expect(row.voice_osat_pct).toBe(0.62);
    expect(row.osat_b2b_pct).toBe(0.02);
    expect(row.voice_ead_pct).toBe(0.9);
    expect(row.contacts_1800).toBe(3);
    expect(row.dig_app_pct).toBe(0.18);
    expect(row.dig_app_gcrd).toBe(1.2);
    expect(row.mcd_gcrd).toBe(0.5);
    expect(row.mcd_wait_time).toBe(4.2);
    expect(row.mcd_star_rating).toBe(4.6);
    expect(row.crew_staffing_target).toBe(40);
    expect(row.shift_leader_target).toBe(8);
    expect(row.manager_target).toBe(4);
    expect(row.headcount_target).toBe(52);
    expect(row.turnover_shift_leader_pct).toBe(0.15);
    expect(row.turnover_crew_090_pct).toBe(0.3);
    expect(row.turnover_crew_ytd_pct).toBe(0.45);
    expect(row.tpph_target).toBe(5.6);
    expect(row.labor_pct).toBe(0.22);
    expect(row.fob_target_pct).toBe(0.28);
    expect(row.source).toBe('upload'); // default provenance for a bulk workbook save
  });

  it('tags a manual override with source:"override" (Part 3 provenance)', async () => {
    await saveYearlyTargets({ '3708': { tOsatB2B: 0.018 } }, 2026, 'override');
    expect(_lastUpsert.rows[0].source).toBe('override');
  });

  it('no-ops without a year (never silently writes a wrong-year row)', async () => {
    const r = await saveYearlyTargets({ '3708': { tOepe: 140 } }, null);
    expect(r.saved).toBe(0);
    expect(_lastUpsert).toBeNull();
  });
});

// Dispatch #142 items 1-3 — parseYearlyTargets() already parses tProdSales/tCrewLabor
// correctly, but the yearly_targets table + this save/load mapping never captured either
// (confirmed against the live production schema, 2026-08-25 — see
// supabase/schema-dispatch-142-sales-labor-targets.sql). This is the fix.
describe('saveYearlyTargets — Product Sales + Crew Labor % (dispatch #142 items 1-3)', () => {
  it('maps tProdSales -> prod_sales and tCrewLabor -> crew_labor_pct', async () => {
    await saveYearlyTargets({ '3708': { tProdSales: 650000.42, tCrewLabor: 0.195 } }, 2026);
    const row = _lastUpsert.rows[0];
    expect(row.prod_sales).toBe(650000.42);
    expect(row.crew_labor_pct).toBe(0.195);
  });

  it('degrades gracefully when the migration has not run yet (42703): retries without the two new columns instead of failing the whole upload', async () => {
    _upsertErrorOnce = { code: '42703', message: 'column "prod_sales" of relation "yearly_targets" does not exist' };
    const r = await saveYearlyTargets({ '3708': { tOepe: 140, tProdSales: 650000 } }, 2026);
    expect(r.saved).toBe(1);
    expect(r.errors).toEqual([]);
    // The retried (fallback) upsert is the one _lastUpsert holds after the call resolves —
    // confirm it dropped prod_sales/crew_labor_pct but kept every other real field.
    const row = _lastUpsert.rows[0];
    expect('prod_sales' in row).toBe(false);
    expect('crew_labor_pct' in row).toBe(false);
    expect(row.oepe_pace).toBe(140);
  });
});

describe('loadYearlyTargets / loadAllYearlyTargets — round-trip + null-stripping (mirrors #166)', () => {
  it('loadYearlyTargets: maps columns back to ds.targets field names for one year', async () => {
    _mockRows = [{ loc: '3708', year: 2026, oepe_pace: 140, osat_b2b_pct: 0.02, kvs_usage_pct: null, source: 'upload' }];
    const t = await loadYearlyTargets(2026);
    expect(t['3708'].tOepe).toBe(140);
    expect(t['3708'].tOsatB2B).toBe(0.02);
    expect('tKvsu' in t['3708']).toBe(false); // null column -> absent key, not a present null (#166 pattern)
  });

  it('loadYearlyTargets: returns {} without a year', async () => {
    expect(await loadYearlyTargets()).toEqual({});
  });

  it('loadYearlyTargets: maps prod_sales/crew_labor_pct back to tProdSales/tCrewLabor (dispatch #142)', async () => {
    _mockRows = [{ loc: '3708', year: 2026, prod_sales: 650000.42, crew_labor_pct: 0.195 }];
    const t = await loadYearlyTargets(2026);
    expect(t['3708'].tProdSales).toBe(650000.42);
    expect(t['3708'].tCrewLabor).toBe(0.195);
  });

  it('loadYearlyTargets: a row from BEFORE the migration ran (no prod_sales/crew_labor_pct column at all) does not crash and leaves those keys absent', async () => {
    _mockRows = [{ loc: '3708', year: 2026, oepe_pace: 140 }]; // no prod_sales/crew_labor_pct key present
    const t = await loadYearlyTargets(2026);
    expect(t['3708'].tOepe).toBe(140);
    expect('tProdSales' in t['3708']).toBe(false);
    expect('tCrewLabor' in t['3708']).toBe(false);
  });

  it('loadAllYearlyTargets: keys the result by year, each store null-stripped independently', async () => {
    _mockRows = [
      { loc: '3708', year: 2026, oepe_pace: 140, osat_b2b_pct: null },
      { loc: '3708', year: 2025, oepe_pace: 135, osat_b2b_pct: 0.025 },
    ];
    const all = await loadAllYearlyTargets();
    expect(all[2026]['3708'].tOepe).toBe(140);
    expect('tOsatB2B' in all[2026]['3708']).toBe(false);
    expect(all[2025]['3708'].tOsatB2B).toBe(0.025);
  });
});
