// dispatch-113.md's verification bar, second half: a KNOWN non-zero effect must be RECOVERED, not
// just "near zero on a null case" (a method that always reports ~0% regardless of input isn't a
// fix either). Same national-calendar shape and "spend scales with traffic" construction as
// promo-roi-bias-sim-exogenous-tag-zero-effect.mjs, but promo TRUE_LIFT applies on the exogenously
// tagged days -- the tag assignment itself is still independent of sales (a fixed calendar, same
// as production), only the OUTCOME on tagged days is now genuinely higher.
import { matchedLift, promoTagCoverage, buildDailyRecords } from '../../src/engine/promo-roi.js';

let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const DOW = [4000, 5200, 5000, 5100, 5600, 7000, 6500];
const TRUE_LIFT = 0.08; // promo days genuinely sell 8% more

const START = new Date(2026, 3, 1);
const NATIONAL_WINDOWS = [[0, 27], [35, 62], [70, 97]];
const isTaggedDay = i => NATIONAL_WINDOWS.some(([a, b]) => i >= a && i <= b);

function mk(loc, n) {
  const rows = []; const events = {};
  for (let i = 0; i < n; i++) {
    const d = new Date(START.getFullYear(), START.getMonth(), START.getDate() + i);
    const dow = d.getDay();
    const tagged = isTaggedDay(i);
    const sales = DOW[dow] * (0.75 + 0.5 * rnd()) * (tagged ? 1 + TRUE_LIFT : 1);
    const spend = sales * 0.03 * (0.7 + 0.6 * rnd()); // still scales with traffic -- realism preserved
    rows.push({ loc, date: d, allNetSales: sales, gc: Math.round(sales / 9), promoAmt: spend, promoPct: (spend / sales) * 100 });
    const dk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (tagged) events[dk] = { type: 'promo', orgSourced: true, label: 'sim national promo' };
  }
  return { rows, events };
}

const N_DAYS = 110;
const allRows = []; const userEvents = {};
for (let s = 0; s < 27; s++) {
  const rawLoc = String(3000 + s).padStart(7, '0');
  const normLoc = String(3000 + s);
  const { rows, events } = mk(rawLoc, N_DAYS);
  allRows.push(...rows);
  userEvents[normLoc] = events;
}

const records = buildDailyRecords({ glimpseRows: allRows });
const tagCoverage = promoTagCoverage(userEvents);
const out = matchedLift(records, tagCoverage, { marginRate: 0.35 });
const lifts = out.byStore.map(s => s.liftSalesPct).filter(x => x != null);
const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
const pays = out.byStore.filter(s => s.verdict === 'pays').length;
const negative = lifts.filter(x => x < 0).length;

console.log(`TRUE effect = +${(TRUE_LIFT * 100).toFixed(0)}%.`);
console.log(`stores scored : ${out.byStore.length}/${out.nCandidates}`);
console.log(`mean lift     : ${meanLift.toFixed(2)}%   (true ${(TRUE_LIFT * 100).toFixed(0)}%)`);
console.log(`negative      : ${negative}/${lifts.length}`);
console.log(`verdict pays  : ${pays}/${out.byStore.length}`);
if (out.byStore.length < 20) { console.error('FAIL: too few stores scored'); process.exit(1); }
if (Math.abs(meanLift - TRUE_LIFT * 100) > 3) { console.error('FAIL: recovered lift too far from true effect'); process.exit(1); }
console.log('PASS: recovers the known effect within 3pp, not just near-zero regardless of input.');
