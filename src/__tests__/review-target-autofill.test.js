// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  autoPopulateKPIs, mergedTargetsForLoc, missingReviewTargets,
  REVIEW_METRIC_TARGET_FIELD, DEFAULT_REVIEW_CONFIG,
} from '../engine/review-engine.js';

// Minimal review skeleton for loc 3708 (which carries full DEFAULT_TARGETS).
function blankMonths() {
  const m = {};
  for (let i = 1; i <= 12; i++) m[i] = {};
  return m;
}
const review = () => ({ loc: '3708', year: 2026, half: 'H1', role: 'GM', kpis: { months: blankMonths() } });

describe('mergedTargetsForLoc — monthly wins over yearly wins over default', () => {
  it('layers DEFAULT < yearly < monthly', () => {
    const ds = {
      targets:        { '3708': { tLabor: 0.23 } },          // yearly override
      monthlyTargets: { '3708': { tLabor: 0.215 } },         // monthly override (wins)
    };
    const t = mergedTargetsForLoc(ds, '3708');
    expect(t.tLabor).toBe(0.215);          // monthly wins
    expect(t.tOepe).toBe(140);             // falls through to DEFAULT_TARGETS
  });
});

describe('autoPopulateKPIs target auto-fill (Notes 32 A)', () => {
  it('fills OEPE/R2P/KVS/Labor/Sales/OpSupplies/TPPH targets from official targets', () => {
    const r = autoPopulateKPIs(review(), { loaded: true });
    const jun = r.kpis.months[6];
    expect(jun.oepeTgt).toBe(140);
    expect(jun.r2pTgt).toBe(95);
    expect(jun.kvsTgt).toBe(45);
    expect(jun.laborTgt).toBe(0.22);
    expect(jun.salesVsTgtTgt).toBe(111513.16);
    expect(jun.opSuppliesTgt).toBeCloseTo(2938.76, 1);
    expect(jun.tpphTgt).toBe(5.6);
  });

  it('monthly target overrides the DEFAULT during auto-fill', () => {
    const r = autoPopulateKPIs(review(), { loaded: true, monthlyTargets: { '3708': { tLabor: 0.20 } } });
    expect(r.kpis.months[3].laborTgt).toBe(0.20);
  });

  it('does not override a target already present on the month', () => {
    const rv = review(); rv.kpis.months[6].oepeTgt = 999;
    const r = autoPopulateKPIs(rv, { loaded: true });
    expect(r.kpis.months[6].oepeTgt).toBe(999);
  });

  it('every mapped target field actually exists for a real store', () => {
    const t = mergedTargetsForLoc({}, '3708');
    for (const tf of Object.values(REVIEW_METRIC_TARGET_FIELD)) {
      expect(t[tf], `missing ${tf}`).not.toBeUndefined();
    }
  });
});

describe('missingReviewTargets — flags scored metrics with no resolvable target', () => {
  it('lists metrics that have neither a namespace target nor a per-month target', () => {
    const miss = missingReviewTargets(review(), DEFAULT_REVIEW_CONFIG, {});
    const keys = miss.map(m => m.key);
    // These have no target field in DEFAULT_TARGETS → should be flagged for the user.
    expect(keys).toContain('osat');
    expect(keys).toContain('delivWait');
    expect(keys).toContain('headcount');
    // These resolve from official targets → should NOT be flagged.
    expect(keys).not.toContain('oepe');
    expect(keys).not.toContain('labor');
  });
});

import { deriveTotalProfitVsTarget } from '../engine/review-engine.js';

describe('deriveTotalProfitVsTarget (Notes 32 #5)', () => {
  it('sums favorable/unfavorable controllable variances in dollars', () => {
    const r = deriveTotalProfitVsTarget({
      fobPctActual: 0.05, fobPctTarget: 0.04,     // 1pt OVER → unfavorable
      laborPctActual: 0.21, laborPctTarget: 0.22, // 1pt UNDER → favorable
      opSuppliesActual: 3200, opSuppliesTarget: 3000, // $200 over → unfavorable
      netSales: 100000, prodSales: 100000,
    });
    expect(r.fob$).toBeCloseTo((0.04 - 0.05) * 100000, 5);   // -1000
    expect(r.labor$).toBeCloseTo((0.22 - 0.21) * 100000, 5); // +1000
    expect(r.opSupply$).toBeCloseTo(3000 - 3200, 5);          // -200
    expect(r.total$).toBeCloseTo(-200, 5);
    expect(r.components).toBe(3);
  });

  it('drops only the missing component (partial inputs)', () => {
    const r = deriveTotalProfitVsTarget({
      laborPctActual: 0.21, laborPctTarget: 0.22, netSales: 100000,
    });
    expect(r.fob$).toBeNull();
    expect(r.opSupply$).toBeNull();
    expect(r.labor$).toBeCloseTo(1000, 5);
    expect(r.total$).toBeCloseTo(1000, 5);
    expect(r.components).toBe(1);
  });

  it('returns null total when no component is computable', () => {
    expect(deriveTotalProfitVsTarget({}).total$).toBeNull();
  });
});
