// @ts-nocheck
// Dispatch #132 item 3 — company/state/patch/store target override cascade.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCOPE_TYPES, COMPANY_SCOPE_ID, scopeIdsForLoc, indexTargetOverrides,
  resolveOverride, resolveOverrideWithSource, applyTargetOverrides, TARGET_OVERRIDE_FIELDS,
} from '../engine/target-overrides.js';
import {
  mergedTargetsForLoc, mergedTargetsForLocMonth, rateMetric, autoPopulateKPIs,
  REVIEW_METRIC_TARGET_FIELD, DEFAULT_REVIEW_CONFIG,
} from '../engine/review-engine.js';

// loc '3708' — OK, patch 'Robert Spencer' (constants.js INV_ORG_COORDS), full DEFAULT_TARGETS.
describe('scopeIdsForLoc — reads the SAME INV_ORG_COORDS fields LocationSelector groups by', () => {
  it('resolves state + patch for a known store', () => {
    expect(scopeIdsForLoc('3708')).toEqual({ state: 'OK', patch: 'Robert Spencer' });
  });
  it('returns nulls for an unknown loc rather than throwing', () => {
    expect(scopeIdsForLoc('999999')).toEqual({ state: null, patch: null });
  });
});

describe('indexTargetOverrides + resolveOverride — precedence store > patch > state > company', () => {
  const rows = [
    { scope_type: 'company', scope_id: 'ALL', field: 'tHeadcount', value: 40 },
    { scope_type: 'state', scope_id: 'OK', field: 'tHeadcount', value: 45 },
    { scope_type: 'patch', scope_id: 'Robert Spencer', field: 'tHeadcount', value: 50 },
    { scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: 60 },
  ];

  it('store override wins when all four tiers are set for the same store', () => {
    const idx = indexTargetOverrides(rows);
    expect(resolveOverride(idx, 'tHeadcount', '3708')).toBe(60);
  });
  it('a sibling store in the same patch (no store-level override) gets the patch value', () => {
    const idx = indexTargetOverrides(rows.filter(r => r.scope_type !== 'store'));
    // 6972 is also OK / Robert Spencer per constants.js INV_ORG_COORDS
    expect(resolveOverride(idx, 'tHeadcount', '6972')).toBe(50);
  });
  it('a store in a different patch, same state, gets the state value', () => {
    const idx = indexTargetOverrides(rows.filter(r => r.scope_type === 'company' || r.scope_type === 'state'));
    // 5183 is OK / Krystiana Langford — different patch, same state
    expect(resolveOverride(idx, 'tHeadcount', '5183')).toBe(45);
  });
  it('a store in a different state gets the company-wide default', () => {
    const idx = indexTargetOverrides(rows.filter(r => r.scope_type === 'company'));
    // 6178 is FL
    expect(resolveOverride(idx, 'tHeadcount', '6178')).toBe(40);
  });
  it('no override at any tier resolves to null (never throws, never fabricates a value)', () => {
    expect(resolveOverride(indexTargetOverrides([]), 'tHeadcount', '3708')).toBeNull();
    expect(resolveOverride(null, 'tHeadcount', '3708')).toBeNull();
  });
  it('resolveOverrideWithSource names which tier won', () => {
    const idx = indexTargetOverrides(rows);
    expect(resolveOverrideWithSource(idx, 'tHeadcount', '3708')).toEqual({ value: 60, source: 'store' });
    const idxNoStore = indexTargetOverrides(rows.filter(r => r.scope_type !== 'store'));
    expect(resolveOverrideWithSource(idxNoStore, 'tHeadcount', '3708')).toEqual({ value: 50, source: 'patch' });
  });
  it('rows with a null value or an unrecognized scope_type are dropped when indexing', () => {
    const idx = indexTargetOverrides([
      { scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: null },
      { scope_type: 'bogus', scope_id: '3708', field: 'tHeadcount', value: 99 },
    ]);
    expect(resolveOverride(idx, 'tHeadcount', '3708')).toBeNull();
  });
});

// Dispatch #132's own verification bar, reproduced literally: "set a company-wide default,
// override it at one scope tier (e.g. a specific patch), and confirm a store within that patch
// resolves to the override while a store outside it still resolves to the company default."
describe('end-to-end cascade demonstration (dispatch #132 verification bar)', () => {
  it('company default + one patch override: in-patch store gets the override, out-of-patch store gets the company default', () => {
    const rows = [
      { scope_type: 'company', scope_id: 'ALL', field: 'tHeadcount', value: 40 },
      { scope_type: 'patch', scope_id: 'Robert Spencer', field: 'tHeadcount', value: 55 },
    ];
    const idx = indexTargetOverrides(rows);
    // '3708' and '6972' are both OK / Robert Spencer (constants.js INV_ORG_COORDS) -- IN the patch.
    expect(resolveOverride(idx, 'tHeadcount', '3708')).toBe(55);
    expect(resolveOverride(idx, 'tHeadcount', '6972')).toBe(55);
    // '5183' is OK but a DIFFERENT patch (Krystiana Langford) -- outside the override, falls to company.
    expect(resolveOverride(idx, 'tHeadcount', '5183')).toBe(40);
    // Through the real review-engine.js entry point too, not just the pure resolver:
    const ds = { targetOverrides: idx };
    expect(mergedTargetsForLoc(ds, '3708').tHeadcount).toBe(55);
    expect(mergedTargetsForLoc(ds, '5183').tHeadcount).toBe(40);
  });
});

describe('applyTargetOverrides — overlays resolved override fields onto a base targets object', () => {
  it('overlays only fields the index carries, leaving everything else untouched', () => {
    const idx = indexTargetOverrides([{ scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: 60 }]);
    const base = { tOepe: 140, tHeadcount: 999 };
    expect(applyTargetOverrides(base, idx, '3708')).toEqual({ tOepe: 140, tHeadcount: 60 });
  });
  it('is a pure no-op with no overridesIndex', () => {
    const base = { tOepe: 140 };
    expect(applyTargetOverrides(base, null, '3708')).toBe(base);
  });
});

describe('TARGET_OVERRIDE_FIELDS registry stays in sync with review-engine.js', () => {
  it('every reviewKey maps to the SAME field in REVIEW_METRIC_TARGET_FIELD, except foodOB', () => {
    // foodOB is the one deliberate exception: its actual is DOLLARS but tFOBTarget is a
    // PERCENTAGE, so it's excluded from the generic same-scale map (see that map's own
    // comment) and resolved instead by a bespoke %-times-sales conversion in
    // autoPopulateKPIs — covered separately below ("autoPopulateKPIs FOB $ target").
    for (const f of TARGET_OVERRIDE_FIELDS) {
      if (f.reviewKey === 'foodOB') { expect(REVIEW_METRIC_TARGET_FIELD.foodOB).toBeUndefined(); continue; }
      expect(REVIEW_METRIC_TARGET_FIELD[f.reviewKey], `${f.reviewKey} missing from REVIEW_METRIC_TARGET_FIELD`).toBe(f.field);
    }
  });
  it('every reviewKey is a real, scored metric key somewhere in DEFAULT_REVIEW_CONFIG', () => {
    const allKeys = Object.values(DEFAULT_REVIEW_CONFIG.metrics).flat().map(m => m.key);
    for (const f of TARGET_OVERRIDE_FIELDS) {
      expect(allKeys, `${f.reviewKey} not a real review metric key`).toContain(f.reviewKey);
    }
  });
});

describe('mergedTargetsForLoc / mergedTargetsForLocMonth — override wins over monthly (dispatch #132 item 3)', () => {
  it('an override beats a monthly target for the same field', () => {
    const ds = {
      monthlyTargets: { '3708': { tLabor: 0.20 } },
      targetOverrides: indexTargetOverrides([{ scope_type: 'store', scope_id: '3708', field: 'tLabor', value: 0.18 }]),
    };
    expect(mergedTargetsForLoc(ds, '3708').tLabor).toBe(0.18);
  });
  it('with no override, monthly still wins over yearly (unchanged precedence)', () => {
    const ds = { targets: { '3708': { tLabor: 0.23 } }, monthlyTargets: { '3708': { tLabor: 0.215 } } };
    expect(mergedTargetsForLoc(ds, '3708').tLabor).toBe(0.215);
  });
  it('a state-scoped override applies to every store in that state via mergedTargetsForLocMonth', () => {
    const ds = { targetOverrides: indexTargetOverrides([{ scope_type: 'state', scope_id: 'OK', field: 'tHeadcount', value: 55 }]) };
    expect(mergedTargetsForLocMonth(ds, '3708', 2026, 6).tHeadcount).toBe(55);
    expect(mergedTargetsForLocMonth(ds, '6972', 2026, 6).tHeadcount).toBe(55); // also OK
  });
  it('company override fills a field with no other source at all (Total Profit / Complaints)', () => {
    const ds = { targetOverrides: indexTargetOverrides([{ scope_type: 'company', scope_id: 'ALL', field: 'tTotalProfitTarget', value: 500 }]) };
    expect(mergedTargetsForLoc(ds, '3708').tTotalProfitTarget).toBe(500);
    expect(mergedTargetsForLoc({}, '3708').tTotalProfitTarget).toBeUndefined();
  });
});

describe('rateMetric positiveOnly — Total Profit interim rule (dispatch #132 item 6)', () => {
  const cfg = { better: 'higher', unit: 'pct', t: [0.05, 0, -0.05], positiveOnly: true };
  it('scores 4 (passing) when actual is positive and no real target is resolved', () => {
    expect(rateMetric(500, null, cfg)).toBe(4);
    expect(rateMetric(500, 0, cfg)).toBe(4);   // 0 = autoPopulateKPIs' derived placeholder
  });
  it('scores 1 (failing) when actual is non-positive and no real target is resolved', () => {
    expect(rateMetric(-200, 0, cfg)).toBe(1);
    expect(rateMetric(0, 0, cfg)).toBe(1);
  });
  it('falls through to normal deviation scoring once a REAL (non-zero) target is resolved', () => {
    // actual 550 vs target 500 -> dev = +10% -> better:'higher', t[0]=0.05 -> rating 4
    expect(rateMetric(550, 500, cfg)).toBe(4);
    // actual 400 vs target 500 -> dev = -20% -> below every threshold -> rating 1
    expect(rateMetric(400, 500, cfg)).toBe(1);
  });
  it('a non-positiveOnly metric is completely unaffected (no behavior change for existing metrics)', () => {
    const plain = { better: 'lower', unit: 'abs', t: [-5, 5, 10] };
    expect(rateMetric(100, null, plain)).toBeNull();
    expect(rateMetric(null, 100, plain)).toBeNull();
  });
});

describe('autoPopulateKPIs FOB $ target (dispatch #132 item 5 — FOB target prefers monthly over yearly)', () => {
  function blankMonths() { const m = {}; for (let i = 1; i <= 12; i++) m[i] = {}; return m; }
  const review = () => ({ loc: '3708', year: 2026, half: 'H1', role: 'GM', kpis: { months: blankMonths() } });

  it('foodOBTgt was never auto-filled before this dispatch — confirms the gap is real', () => {
    const ds = { loaded: true, laborRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 100000 }] };
    const r = autoPopulateKPIs(review(), ds);
    // DEFAULT_TARGETS['3708'].tFOBTarget = 0.0385 -> 0.0385 * 100000 = 3850
    expect(r.kpis.months[6].foodOBTgt).toBeCloseTo(3850, 5);
  });
  it('a monthly tFOBTarget overrides the yearly one for the $ conversion', () => {
    const ds = {
      loaded: true,
      laborRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 100000 }],
      targets: { '3708': { tFOBTarget: 0.05 } },        // yearly
      monthlyTargets: { '3708': { tFOBTarget: 0.03 } },  // monthly — should win
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].foodOBTgt).toBeCloseTo(3000, 5); // 0.03 * 100000, not 0.05 * 100000
  });
  it('a store-scoped override beats both yearly and monthly', () => {
    const ds = {
      loaded: true,
      laborRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 100000 }],
      targets: { '3708': { tFOBTarget: 0.05 } },
      monthlyTargets: { '3708': { tFOBTarget: 0.03 } },
      targetOverrides: indexTargetOverrides([{ scope_type: 'store', scope_id: '3708', field: 'tFOBTarget', value: 0.02 }]),
    };
    const r = autoPopulateKPIs(review(), ds);
    expect(r.kpis.months[6].foodOBTgt).toBeCloseTo(2000, 5);
  });
  it('does not overwrite an already-entered foodOBTgt', () => {
    const rv = review(); rv.kpis.months[6].foodOBTgt = 12345;
    const ds = { loaded: true, laborRows: [{ loc: '3708', date: new Date('2026-06-05T00:00:00'), sales: 100000 }] };
    const r = autoPopulateKPIs(rv, ds);
    expect(r.kpis.months[6].foodOBTgt).toBe(12345);
  });
});

// ── Supabase CRUD (mocked client, same technique as yearly-targets-persistence.test.js) ──
let _mockRows = [];
let _lastUpsert = null;
let _lastDelete = null;

vi.stubEnv('VITE_SUPABASE_URL', 'http://fake.test');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-key');

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table) => ({
      select: () => ({ then: (resolve) => resolve({ data: _mockRows, error: null }) }),
      upsert: (row, opts) => { _lastUpsert = { table, row, opts }; return Promise.resolve({ data: row, error: null }); },
      delete: () => ({ eq: (col, val) => { _lastDelete = { table, col, val }; return Promise.resolve({ data: null, error: null }); } }),
    }),
  }),
}));

const { loadTargetOverrides, saveTargetOverride, deleteTargetOverride } = await import('../lib/supabase.js');

beforeEach(() => { _mockRows = []; _lastUpsert = null; _lastDelete = null; });

describe('saveTargetOverride / loadTargetOverrides / deleteTargetOverride', () => {
  it('upserts on the (tenant,scope_type,scope_id,field) unique key', async () => {
    const r = await saveTargetOverride({ scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: 60 });
    expect(r.error).toBeNull();
    expect(_lastUpsert.table).toBe('target_overrides');
    expect(_lastUpsert.opts).toEqual({ onConflict: 'tenant_id,scope_type,scope_id,field' });
    expect(_lastUpsert.row.scope_id).toBe('3708');
    expect(_lastUpsert.row.value).toBe(60);
  });
  it('forces scope_id to the ALL sentinel for company scope, never null', async () => {
    await saveTargetOverride({ scope_type: 'company', scope_id: null, field: 'tTotalProfitTarget', value: 500 });
    expect(_lastUpsert.row.scope_id).toBe('ALL');
  });
  it('rejects a non-numeric value rather than upserting garbage', async () => {
    const r = await saveTargetOverride({ scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: NaN });
    expect(r.error).toBeTruthy();
    expect(_lastUpsert).toBeNull();
  });
  it('rejects an invalid scope_type', async () => {
    const r = await saveTargetOverride({ scope_type: 'district', scope_id: 'x', field: 'tHeadcount', value: 1 });
    expect(r.error).toBeTruthy();
    expect(_lastUpsert).toBeNull();
  });
  it('loadTargetOverrides maps rows to the flat shape indexTargetOverrides expects', async () => {
    _mockRows = [{ id: 'abc', scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: 60, updated_at: '2026-08-25' }];
    const rows = await loadTargetOverrides();
    expect(rows).toEqual([{ id: 'abc', scope_type: 'store', scope_id: '3708', field: 'tHeadcount', value: 60, updated_at: '2026-08-25' }]);
  });
  it('deleteTargetOverride deletes by id', async () => {
    const r = await deleteTargetOverride('abc');
    expect(r.error).toBeNull();
    expect(_lastDelete).toEqual({ table: 'target_overrides', col: 'id', val: 'abc' });
  });
});
