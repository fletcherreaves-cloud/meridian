// @ts-nocheck
export default {version:'4.601', date:'2026-07-29', changes:[
  'EOM Food-Cost Diagnosis now shows actual-vs-standard YIELD (the over-portioning fingerprint) — e.g. "over-portioned 52% of std" — with a "Portioning watch" section listing items running below their recipe yield band, so the fix points at the station\'s portioning, not another recount. Matches the strongest part of QSRSoft CoachQ\'s report. (The variance pull already computed the yield band; it now persists it — the yield_lo/yield_hi columns backfill on the next Variance pull, and need the schema.sql snippet run once.)',
]};
