// @ts-nocheck
export default {version:'4.636', date:'2026-07-30', changes:[
  'Inventory-integrity detection (new) — the Food-Cost Diagnosis now flags COUNT MANIPULATION: more than 4 count entries for the same item on one day (2-4 is normal for travel-path counting across multiple storage locations), especially when a later entry walks the variance back toward zero — the tell-tale of a re-count to negate an unfavorable result. When the same negate move shows on 2+ items it escalates to critical (intentional, not a correction). More integrity checks (waste inflation, unrealistic over/gain) to follow.',
  'The "Top 5 — do these now" list is now focused to Food & Condiment items only (the profit-driver classes) per owner; the full all-classes analysis stays below.',
]};
