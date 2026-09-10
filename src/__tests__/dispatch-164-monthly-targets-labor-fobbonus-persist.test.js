// @ts-nocheck
// GH #164's 2026-08-11 triage (comment "Triage of all 69 reads") flagged parseMonthlyTargets()
// as extracting fields saveMonthlyTargets() silently dropped, so a monthly-targets upload's
// values could vanish on the next page reload -- "scores can change between uploading the
// monthly file and refreshing the page." Re-measured against CURRENT code before touching
// anything (per CLAUDE.md's "measure it, don't reason about it" rule): the original 8-field
// list is stale -- parseMonthlyTargets() (src/parsers/index.js) no longer produces
// tOepe/tPark/tKvst/tKvsu/tR2p/tOsat/tOsatB2B at all (those moved to the separate
// parseYearlyTargets()) -- but it DOES still produce t.tLabor and t.tFOBBonusBase, and
// saveMonthlyTargets() genuinely did not persist either one. t.tLabor is the exact field #164's
// larger migration (tLabor -> tCrewLabor) is about, so this is a live gap on the field the
// whole issue is named after. Fixed: two new nullable monthly_targets columns
// (supabase/schema-monthly-targets-labor-fobbonus.sql), wired into save + both load functions.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let _mockRows = [];
let _upsertedRows = null;

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          then: (resolve) => resolve({ data: _mockRows, error: null }),
        };
        return chain;
      },
      upsert: (rows) => { _upsertedRows = rows; return Promise.resolve({ error: null }); },
    }),
  }),
}));

const { saveMonthlyTargets, loadMonthlyTargets, loadAllMonthlyTargets } = await import('../lib/supabase.js');

beforeEach(() => { _mockRows = []; _upsertedRows = null; });

describe('#164 — monthly_targets round-trips tLabor and tFOBBonusBase, not just tCrewLabor', () => {
  it('saveMonthlyTargets writes labor_pct and fob_bonus_base_pct from t.tLabor / t.tFOBBonusBase', async () => {
    await saveMonthlyTargets({ '43701': { tLabor: 0.24, tCrewLabor: 0.2325, tFOBBonusBase: 0.015 } }, 2026, 8);
    expect(_upsertedRows).toHaveLength(1);
    expect(_upsertedRows[0].labor_pct).toBeCloseTo(0.24, 5);
    expect(_upsertedRows[0].fob_bonus_base_pct).toBeCloseTo(0.015, 5);
    // The authoritative field is untouched by this fix.
    expect(_upsertedRows[0].crew_labor_pct).toBeCloseTo(0.2325, 5);
  });

  it('saveMonthlyTargets writes null for labor_pct/fob_bonus_base_pct when the source field is absent (no crash, no undefined leaking to Supabase)', async () => {
    await saveMonthlyTargets({ '43701': { tCrewLabor: 0.2325 } }, 2026, 8);
    expect(_upsertedRows[0].labor_pct).toBeNull();
    expect(_upsertedRows[0].fob_bonus_base_pct).toBeNull();
  });

  it('loadMonthlyTargets maps labor_pct back to tLabor and fob_bonus_base_pct back to tFOBBonusBase', async () => {
    _mockRows = [{ loc: '43701', year: 2026, month: 8, crew_labor_pct: 0.2325, labor_pct: 0.24, fob_bonus_base_pct: 0.015 }];
    const mt = await loadMonthlyTargets(2026, 8);
    expect(mt['43701'].tLabor).toBeCloseTo(0.24, 5);
    expect(mt['43701'].tFOBBonusBase).toBeCloseTo(0.015, 5);
    expect(mt['43701'].tCrewLabor).toBeCloseTo(0.2325, 5);
  });

  it('loadMonthlyTargets strips a null labor_pct/fob_bonus_base_pct to an absent key, same as every other column (#166 behavior preserved)', async () => {
    _mockRows = [{ loc: '43701', year: 2026, month: 8, crew_labor_pct: 0.2325, labor_pct: null, fob_bonus_base_pct: null }];
    const mt = await loadMonthlyTargets(2026, 8);
    expect('tLabor' in mt['43701']).toBe(false);
    expect('tFOBBonusBase' in mt['43701']).toBe(false);
  });

  it('loadMonthlyTargets: a row from BEFORE this migration (columns absent entirely, undefined not null) also strips cleanly, not as a present-undefined key', async () => {
    _mockRows = [{ loc: '43701', year: 2026, month: 8, crew_labor_pct: 0.2325 }];
    const mt = await loadMonthlyTargets(2026, 8);
    expect('tLabor' in mt['43701']).toBe(false);
    expect('tFOBBonusBase' in mt['43701']).toBe(false);
    expect(mt['43701'].tCrewLabor).toBeCloseTo(0.2325, 5);
  });

  it('loadAllMonthlyTargets round-trips tLabor/tFOBBonusBase per period, same as loadMonthlyTargets', async () => {
    _mockRows = [
      { loc: '43701', year: 2026, month: 8, labor_pct: 0.24, fob_bonus_base_pct: 0.015 },
      { loc: '43701', year: 2026, month: 7, labor_pct: 0.26 },
    ];
    const all = await loadAllMonthlyTargets();
    expect(all['2026-8']['43701'].tLabor).toBeCloseTo(0.24, 5);
    expect(all['2026-8']['43701'].tFOBBonusBase).toBeCloseTo(0.015, 5);
    expect(all['2026-7']['43701'].tLabor).toBeCloseTo(0.26, 5);
    expect('tFOBBonusBase' in all['2026-7']['43701']).toBe(false);
  });

  it('the full save-then-load round trip: an uploaded tLabor survives a simulated page reload (the exact defect #164 traced -- upload sets it, reload used to lose it)', async () => {
    await saveMonthlyTargets({ '43701': { tLabor: 0.26, tCrewLabor: 0.24 } }, 2026, 8);
    // Simulate the reload: the loader now reads back what upsert would have written.
    _mockRows = [{ loc: '43701', year: 2026, month: 8, ..._upsertedRows[0] }];
    const reloaded = await loadMonthlyTargets(2026, 8);
    expect(reloaded['43701'].tLabor).toBeCloseTo(0.26, 5);
  });
});
