import { matchedLift } from '/home/user/meridian/src/engine/promo-roi.js';

// Deterministic PRNG so this is reproducible.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// GROUND TRUTH: promo has ZERO effect on sales. Promo DOLLARS are constant every day.
// Sales vary only by day-of-week plus noise. So promo_pct = promo_amt / sales is high
// EXACTLY when sales happens to be low -- purely mechanically.
const DOW_BASE = [4000, 5200, 5000, 5100, 5600, 7000, 6500];
const PROMO_AMT = 200;

function mkRows(loc, nDays) {
  const rows = [];
  const start = new Date('2026-04-01T00:00:00');
  for (let i = 0; i < nDays; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const dow = d.getDay();
    const sales = DOW_BASE[dow] * (0.75 + 0.5 * rnd());   // +/-25% noise, promo-independent
    rows.push({
      loc, date: d.toISOString().slice(0, 10), dow,
      sales,
      gc: Math.round(sales / 9),
      promoAmt: PROMO_AMT,                 // CONSTANT -- no real promo variation at all
      promoPct: (PROMO_AMT / sales) * 100, // therefore purely a function of 1/sales
    });
  }
  return rows;
}

const recs = [];
for (let s = 0; s < 27; s++) recs.push(...mkRows(String(3000 + s).padStart(7, '0'), 120));

const out = matchedLift(recs, { intensityField: 'promoPct', spendField: 'promoAmt', marginRate: 0.35 });
const stores = out.byStore || [];
console.log('district:', JSON.stringify(out.district));
console.log('sample store:', JSON.stringify(stores[0], null, 1));
const key = stores[0] && Object.keys(stores[0]).find(k => /lift/i.test(k));
console.log('lift key =', key);
const lifts = stores.map(s => s[key]).filter(x => x != null);
console.log('stores scored :', stores.length);
console.log('NEGATIVE lift :', lifts.filter(x=>x<0).length, '/', lifts.length);
if (lifts.length) console.log('lift range    :', Math.min(...lifts).toFixed(2)+'%', '..', Math.max(...lifts).toFixed(2)+'%');
console.log('TRUE effect   : exactly zero, by construction');
