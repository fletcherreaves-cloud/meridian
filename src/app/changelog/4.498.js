// @ts-nocheck
export default {version:'4.498', date:'2026-07-24', changes:[
  'Fix: the home "Sales vs Last Year" and "Guest Count vs Last Year" figures were wildly inflated (district +532%, FL +2390%) because they averaged each store\'s year-over-year % — so a brand-new store with a near-zero last-year baseline (e.g. Ponce de Leon, opened 03/2026) dominated the average. They\'re now true comp-store comparisons: dollar/guest-weighted (Σ this year − Σ last year) ÷ Σ last year, including only stores with a real prior-year baseline (last year ≥ 20% of current). New/ramping stores still count in the sales totals, just not in the vs-LY comparison. Tiles relabeled "vs LY (comp)". The Today\'s Movers strip got the same guard so a new store can no longer top it with a nonsense "+2390%".',
]};
