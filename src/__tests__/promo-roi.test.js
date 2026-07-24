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
