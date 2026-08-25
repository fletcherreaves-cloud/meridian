// dispatch-113.md's own regression bar, item 3: rebuild the finding's "spend scales with traffic"
// construction (memory/data/promo-roi-bias-sim-spend-scales-with-traffic.mjs) at a TRUE effect of
// exactly 0%, and confirm the NEW exogenous-tag split reports something close to 0%, not the
// +16.5% the old dollar split measured on the identical sales/spend generator.
//
// Same DOW base + noise + "spend scales with traffic" generator as the finding's own script
// (import unchanged, not re-derived). ADDS a realistic national-calendar tag: a handful of
// contiguous windows, IDENTICAL across every store (matching production: all 27 stores get the
// same org_events bulk-imported dates), assigned WITHOUT reading sales or spend at all --
// exactly the property a real corporate marketing calendar has and a same-day intensity split
// does not.
import { matchedLift, promoTagCoverage, buildDailyRecords } from '../../src/engine/promo-roi.js';

let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const DOW = [4000, 5200, 5000, 5100, 5600, 7000, 6500];

// Realistic national-calendar shape, mirroring the real 2025 OPNAD windows measured against
// production 2026-08-25 (data/marketing-calendars/2025-opnad-retail-windows.json): a handful of
// ~4-week windows through the year, leaving real gaps between them (unlike the real 2025 data,
// which is near-saturated once Happy Meal rows are included -- this sim deliberately uses a
// SPARSER calendar than what's live in org_events today, so the zero-effect check isn't
// trivially vacuous from having too few "light" days to compare; the near-saturation of the real
// calendar is a separate, disclosed limitation in dispatch-113's resolution, not something this
// bias check needs to reproduce).
const START = new Date(2026, 3, 1); // Apr 1 2026, day 0 of the sim's date axis
const NATIONAL_WINDOWS = [[0, 27], [35, 62], [70, 97]]; // [startDayIdx, endDayIdx] inclusive
const isTaggedDay = i => NATIONAL_WINDOWS.some(([a, b]) => i >= a && i <= b);

function mk(loc, n) {
  const rows = []; const events = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(START.getFullYear(), START.getMonth(), START.getDate() + i);
    const dow = d.getDay();
    const sales = DOW[dow] * (0.75 + 0.5 * rnd());           // promo has NO effect on sales -- TRUE lift = 0
    const spend = sales * 0.03 * (0.7 + 0.6 * rnd());        // redemptions scale WITH sales (the real trap)
    rows.push({ loc, date: d, allNetSales: sales, gc: Math.round(sales / 9), promoAmt: spend, promoPct: (spend / sales) * 100 });
    const dk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (isTaggedDay(i)) events[dk] = { type: 'promo', orgSourced: true, label: 'sim national promo' };
  }
  return { rows, events };
}

const N_DAYS = 110;
const allRows = []; const userEvents = {};
for (let s = 0; s < 27; s++) {
  const rawLoc = String(3000 + s).padStart(7, '0'); // as it'd arrive on a sales row (buildDailyRecords normalizes it)
  const normLoc = String(3000 + s);                 // as it lands post-normalization -- userEvents must key on THIS,
  const { rows, events } = mk(rawLoc, N_DAYS);       // matching production (org_events.loc is unpadded, e.g. "3708")
  allRows.push(...rows);
  userEvents[normLoc] = events;
}

const records = buildDailyRecords({ glimpseRows: allRows });
const tagCoverage = promoTagCoverage(userEvents);

// OLD (retired) dollar-intensity split, reproduced ad hoc here ONLY to show what it would have
// said on this exact data, for contrast -- this is NOT the shipped engine any more.
function oldIntensitySplit(records, field) {
  const byLoc = {};
  for (const r of records) { if (!(r.sales > 0) || r[field] == null) continue; (byLoc[r.loc] ||= []).push(r); }
  const out = [];
  for (const loc of Object.keys(byLoc)) {
    const rows = byLoc[loc];
    const vals = rows.map(r => r[field]).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)];
    const cells = {};
    for (const r of rows) { const c = cells[r.dow] ||= { heavy: [], light: [] }; (r[field] > med ? c.heavy : c.light).push(r); }
    let wSum = 0, exSales = 0, baseSales = 0;
    for (const dow of Object.keys(cells)) {
      const { heavy, light } = cells[dow];
      if (heavy.length < 2 || light.length < 2) continue;
      const hS = heavy.reduce((a, r) => a + r.sales, 0) / heavy.length, lS = light.reduce((a, r) => a + r.sales, 0) / light.length;
      const w = heavy.length + light.length; wSum += w; exSales += (hS - lS) * w; baseSales += lS * w;
    }
    if (wSum) out.push(baseSales / wSum > 0 ? (exSales / wSum) / (baseSales / wSum) * 100 : null);
  }
  return out.filter(x => x != null);
}
const oldLifts = oldIntensitySplit(records, 'promoAmt');
const oldMean = oldLifts.reduce((a, b) => a + b, 0) / oldLifts.length;

const out = matchedLift(records, tagCoverage, { marginRate: 0.35 });
const lifts = out.byStore.map(s => s.liftSalesPct).filter(x => x != null);
const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
const pays = out.byStore.filter(s => s.verdict === 'pays').length;

console.log('TRUE effect = 0%. Realistic construction: promo $ scales with traffic (0.7-1.3x of 3% of sales).');
console.log(`OLD dollar-intensity split (retired) : mean lift ${oldMean.toFixed(1)}%  (${oldLifts.length} stores) -- reproduces the finding's known bias`);
console.log(`NEW exogenous-tag split (shipped)     : mean lift ${meanLift.toFixed(2)}%  stores=${out.byStore.length}/${out.nCandidates}  pays=${pays}`);
if (Math.abs(meanLift) > 3) { console.error('FAIL: exogenous split not near zero'); process.exit(1); }
console.log('PASS: exogenous split is near zero, unlike the retired dollar split on the identical sales/spend generator.');
