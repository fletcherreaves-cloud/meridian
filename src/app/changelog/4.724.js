// @ts-nocheck
export default {version:'4.724', date:'2026-08-01', changes:[
  'Fountain-yield look-back baselines (task #52). Each store now carries a 3-month baseline of its fountain-beverage short total (mean + sd). The bib-yield check uses it: at a self-serve-tower store, a short WITHIN the store\'s norm stays an info note (structural free refills, not a loss) — but a short ABNORMALLY beyond the store\'s own baseline (≥2σ or ≥1.6×) escalates to a real flag ("check BIB connections / syrup-to-water ratios", tower or not). Notes now cite the store\'s usual $/mo. Engine src/engine/fountain-yield.js, +tests. Validated on real data (e.g. #5183 ~$1,783/mo, #3708 ~$551/mo).',
]};
