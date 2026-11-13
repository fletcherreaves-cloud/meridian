// @ts-nocheck
export default {version:'5.763', date:'2026-11-13', changes:[
  '**Fix: Delivery & Channel Mix — Drive-Thru/Breakfast/MOP/Kiosk/Delivery % was reading ' +
  'nonsense (owner-reported, with screenshots against the real QSRSoft Operations Report).** ' +
  'The Channel Overview tab read the manual Operations Report upload directly for both the ' +
  'channel $ numerators and the total-sales denominator — the same "Drive-Thru % of total ' +
  'sales" read 0.00% (7d), 5.96% (14d), 38.24% (28d), 54.42% (60d) depending only on the date ' +
  'range, against a real 69-77% daily / 72.97% MTD for the same store. Now sourced through ' +
  '**metric-source.js\'s existing auto-first dtMixPct/bfMixPct/mopMixPct/kioskMixPct/' +
  'delivMixPct chains** (emailed Sales Ledger and auto-pulled Sales Mix first, manual Ops ' +
  'Report last-resort fill only) — Drive-Thru through a real Σ$/Σ$ sum-ratio, never a mean of ' +
  'daily percentages; the district total is now dollar-weighted across stores for the same ' +
  'reason. **Live-verified against qsr_sales_mix for the store in the owner\'s screenshot: ' +
  '72.97% MTD, $98,323.22 Drive-Thru sales — exact match to the real QSRSoft figure.** A ' +
  'channel with genuinely no data anywhere now shows "–" instead of a misleading 0.00%. 4 new ' +
  'tests, full suite and build pass clean. See ' +
  'memory/finding-delivery-mix-manual-only-sourcing-2026-11-13.md.',
]};
