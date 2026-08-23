import { describe, it, expect } from 'vitest';
import { buildDailyRecords, matchedLift, computePromoDiscountRoi } from '../engine/promo-roi.js';

// Build ~12 weeks of daily glimpse rows for one store. Promo-heavy is assigned by
// ALTERNATING WEEK (not by weekday), so every day-of-week has both heavy and light
// weeks to compare within — which is exactly what the matched-day engine needs.
function makeStore(loc, { liftPerHeavyDay, promoSpendHeavy, base = 10000 }) {
  const rows = [];
  for (let i = 0; i < 84; i++) {
    const date = new Date(2026, 3, 1 + i); // Apr 1 2026 + i days
    const heavy = Math.floor(i / 7) % 2 === 0; // even weeks heavy, odd weeks light
    const dowBase = base + date.getDay() * 300; // stable per-DOW base
    const sales = dowBase + (heavy ? liftPerHeavyDay : 0);
    rows.push({
      loc, date,
      allNetSales: sales,
      gc: Math.round(sales / 10),
      promoPct: heavy ? 0.05 : 0.01,
      promoAmt: heavy ? promoSpendHeavy : 200,
    });
  }
  return rows;
}

describe('promo-roi — buildDailyRecords', () => {
  it('merges glimpse sales/promo and ctrl discount by loc+date', () => {
    const date = new Date(2026, 3, 1);
    const ds = {
      glimpseRows: [{ loc: '3708', date, allNetSales: 12000, gc: 1100, promoAmt: 400, promoPct: 0.03 }],
      ctrlRows: [{ loc: '0003708', date, discAmt: 150, discPct: 0.012 }],
    };
    const recs = buildDailyRecords(ds);
    expect(recs.length).toBe(1);
    expect(recs[0].sales).toBe(12000);
    expect(recs[0].promoAmt).toBe(400);
    expect(recs[0].discAmt).toBe(150); // joined despite zero-padded loc
  });
});

describe('promo-roi — matchedLift', () => {
  it('flags a promo that PAYS (big lift, small give-away)', () => {
    const rows = makeStore('100', { heavyDows: [1, 3, 5], liftPerHeavyDay: 3000, promoSpendHeavy: 300 });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), { intensityField: 'promoPct', spendField: 'promoAmt', marginRate: 0.35 });
    const s = res.byStore.find(x => x.loc === '100');
    expect(s).toBeTruthy();
    expect(s.extraSalesPerDay).toBeGreaterThan(2500);      // recovers the injected lift
    expect(s.liftSalesPct).toBeGreaterThan(0);
    // 3000*0.35=1050 gross profit vs +100 extra promo → pays
    expect(s.verdict).toBe('pays');
  });

  it('flags a promo that COSTS (tiny lift, big give-away)', () => {
    const rows = makeStore('200', { heavyDows: [2, 4, 6], liftPerHeavyDay: 100, promoSpendHeavy: 2000 });
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), { intensityField: 'promoPct', spendField: 'promoAmt', marginRate: 0.35 });
    const s = res.byStore.find(x => x.loc === '200');
    expect(s).toBeTruthy();
    // 100*0.35=35 gross profit vs +1800 extra promo → costs
    expect(s.verdict).toBe('costs');
    expect(s.grossProfitDelta).toBeLessThan(0);
  });

  it('skips stores with too few days', () => {
    const few = makeStore('300', { heavyDows: [1], liftPerHeavyDay: 1000, promoSpendHeavy: 100 }).slice(0, 10);
    const res = matchedLift(buildDailyRecords({ glimpseRows: few }), { minDays: 24 });
    expect(res.byStore.find(x => x.loc === '300')).toBeUndefined();
  });

  it('produces a district rollup weighted across stores', () => {
    const rows = [
      ...makeStore('100', { heavyDows: [1, 3, 5], liftPerHeavyDay: 3000, promoSpendHeavy: 300 }),
      ...makeStore('200', { heavyDows: [2, 4, 6], liftPerHeavyDay: 100, promoSpendHeavy: 2000 }),
    ];
    const res = matchedLift(buildDailyRecords({ glimpseRows: rows }), { marginRate: 0.35 });
    expect(res.district).toBeTruthy();
    expect(res.district.nStores).toBe(2);
    expect(['pays', 'costs', 'neutral', 'n/a']).toContain(res.district.verdict);
  });
});

// memory/finding-promo-roi-denominator-bias-2026-08-23.md's own regression bar, ported into the
// suite so a revert is caught by CI rather than requiring someone to remember to re-run a
// standalone script under memory/data/. Same seeded construction as
// memory/data/promo-roi-bias-sim-known-effect.mjs (seed=7, coin-flip promo assignment
// INDEPENDENT of sales, so the true lift is genuinely +10% and known) -- measured directly
// against the shipped default (computePromoDiscountRoi), not matchedLift() with an explicit
// override, so this fails if the default ever regresses back to the percentage field.
describe('promo-roi — denominator-bias fix (finding-promo-roi-denominator-bias-2026-08-23.md)', () => {
  function knownEffectRows() {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const DOW_BASE = [4000, 5200, 5000, 5100, 5600, 7000, 6500];
    const TRUE_LIFT = 0.10;
    const HEAVY_SPEND = 400, LIGHT_SPEND = 100;
    const rows = [];
    for (let s = 0; s < 27; s++) {
      const loc = String(3000 + s).padStart(7, '0');
      for (let i = 0; i < 120; i++) {
        const date = new Date(2026, 3, 1 + i);
        const dow = date.getDay();
        const isPromo = rnd() < 0.5; // promo assigned INDEPENDENTLY of sales -- true lift is known
        const spend = isPromo ? HEAVY_SPEND : LIGHT_SPEND;
        const sales = DOW_BASE[dow] * (0.75 + 0.5 * rnd()) * (isPromo ? 1 + TRUE_LIFT : 1);
        rows.push({ loc, date, allNetSales: sales, gc: Math.round(sales / 9), promoAmt: spend, promoPct: (spend / sales) * 100 });
      }
    }
    return rows;
  }

  it('the percentage split (the bug) attenuates a known +10% effect to ~+5.9% -- proves the mechanism is real', () => {
    const records = buildDailyRecords({ glimpseRows: knownEffectRows() });
    const out = matchedLift(records, { intensityField: 'promoPct', spendField: 'promoAmt', marginRate: 0.35 });
    const lifts = out.byStore.map(s => s.liftSalesPct).filter(x => x != null);
    const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
    expect(out.byStore.length).toBe(27);
    expect(meanLift).toBeLessThan(7); // measured 5.86%, true 10% -- loses ~41% of the real effect
  });

  it('computePromoDiscountRoi (the shipped default) recovers the known +10% effect essentially unbiased', () => {
    const out = computePromoDiscountRoi({ glimpseRows: knownEffectRows() }, { marginRate: 0.35 });
    const lifts = out.promo.byStore.map(s => s.liftSalesPct).filter(x => x != null);
    const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
    // Measured 9.70% against a true 10.00% -- essentially unbiased, a world away from the
    // percentage split's 5.86%. Bound set well clear of both wrong answers (5.86% and 0%).
    expect(meanLift).toBeGreaterThan(8);
    expect(lifts.filter(x => x < 0).length).toBe(0); // measured 0/16 negative
  });

  it('matchedLift defaults to the DOLLAR field, so an omitted intensityField cannot restore the bias', () => {
    // The default used to be 'promoPct'. No caller relied on it, but a future one omitting the
    // option would have silently got the biased split back -- the exact way this bug returns.
    // Revert-sensitive: flip the default to 'promoPct' and this fails.
    const rows = knownEffectRows();
    const recs = buildDailyRecords({ glimpseRows: rows });
    const dflt = matchedLift(recs, { spendField: 'promoAmt', marginRate: 0.35 });
    const explicitAmt = matchedLift(recs, { intensityField: 'promoAmt', spendField: 'promoAmt', marginRate: 0.35 });
    const explicitPct = matchedLift(recs, { intensityField: 'promoPct', spendField: 'promoAmt', marginRate: 0.35 });
    const mean = o => { const L = o.byStore.map(x => x.liftSalesPct).filter(x => x != null);
                        return L.reduce((a, b) => a + b, 0) / L.length; };
    expect(mean(dflt)).toBeCloseTo(mean(explicitAmt), 6);   // default === dollar split
    expect(Math.abs(mean(dflt) - mean(explicitPct))).toBeGreaterThan(1); // and NOT the biased one
  });

  it('exposes nCandidates so the panel can disclose how many stores were actually scored', () => {
    const out = computePromoDiscountRoi({ glimpseRows: knownEffectRows() }, { marginRate: 0.35 });
    // nCandidates = every loc with at least one valid intensity record, BEFORE minDays/
    // minPerCell trim. The panel needs both numbers to say "scored N of M" instead of
    // silently shrinking the table.
    expect(out.promo.nCandidates).toBe(27);
    expect(out.promo.byStore.length).toBeGreaterThan(10);
    expect(out.promo.byStore.length).toBeLessThanOrEqual(out.promo.nCandidates);
  });

  it('does NOT require the dollar split to score fewer stores -- that was a fixture artifact', () => {
    // ⚠️ CORRECTION. The finding originally reported the dollar split scoring "16 of 27" and
    // an earlier version of the test above asserted byStore.length < nCandidates, i.e. it
    // required the fix to score FEWER stores. That is not a property of the dollar split. It
    // came from a fixture with BINARY spend ($400 heavy / $100 light): two distinct values give
    // a median split almost no resolution, so day-of-week cells fall under minPerCell.
    //
    // With spend that varies continuously -- which is what real promo data looks like -- the
    // dollar split scores every store. Measured here, and 27/27 on the finding's own re-run.
    // Asserting the shrink would fail the day the data got more realistic, which is exactly
    // backwards for a regression test.
    const rows = [];
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const DOW = [4000, 5200, 5000, 5100, 5600, 7000, 6500];
    for (let st = 0; st < 27; st++) {
      const loc = String(3000 + st).padStart(7, '0');
      for (let i = 0; i < 120; i++) {
        const d = new Date(2026, 3, 1 + i);
        const spend = 50 + Math.floor(rnd() * 400);   // continuous, promo-independent
        const sales = DOW[d.getDay()] * (0.75 + 0.5 * rnd());
        rows.push({ loc, date: d, allNetSales: sales,
                    gc: Math.round(sales / 9), promoAmt: spend, promoPct: (spend / sales) * 100 });
      }
    }
    const out = computePromoDiscountRoi({ glimpseRows: rows }, { marginRate: 0.35 });
    expect(out.promo.nCandidates).toBe(27);
    expect(out.promo.byStore.length).toBe(27);   // no shrink at all on realistic spend
  });
});

describe('promo-roi — computePromoDiscountRoi', () => {
  it('returns both promo and discount analyses', () => {
    const rows = makeStore('100', { heavyDows: [1, 3, 5], liftPerHeavyDay: 2000, promoSpendHeavy: 300 });
    const out = computePromoDiscountRoi({ glimpseRows: rows });
    expect(out.promo).toBeTruthy();
    expect(out.discount).toBeTruthy();
    expect(out.nRecords).toBe(84);
    expect(out.marginRate).toBe(0.35);
  });
});
