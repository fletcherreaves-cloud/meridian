// @ts-nocheck
export default {version:'5.774', date:'2026-11-14', changes:[
  '**Fix: Paper Cost % now has a real actual-value source — the one genuine metric-source.js gap ' +
  'daily-review.js\'s own FOB crosswalk flagged (task #152 reconciliation).** Both legs already ' +
  'existed and neither was wired: the manual FOB Excel upload\'s own precomputed `pLPaperPct` ' +
  '(fobRows) and qsr_fob\'s automated P&L paper roll-forward (`pnlPaperCostBegin/Purchases/' +
  'Adjustments/Transfers/Promotions/End` — a physical-count roll-forward, the same shape ' +
  'eom-inventory.js\'s `pLPaperCostFromRow` already computes for the EOM panel, not invented ' +
  'here). New metric-source.js chain `paperCost` (manual-first, auto-derived fallback via new ' +
  '`paperCostAmt`/6 atom legs — same shape its compWaste/rawWaste/statVar siblings already use), ' +
  'wired into daily-review.js\'s FOB_LINES (was `ms: null`, target-only). The 6-leg roll-forward ' +
  'only resolves on a day all 6 legs are captured (a real count day, same as the manual Excel it ' +
  'stands in for) — metricDaily\'s "every input non-null" derive gate is correct behaviour here, ' +
  'not a bug. 5 new tests (rollupCapableMetricKeys ratchet + a dedicated paperCost Sum/Sum ' +
  'describe block, same pattern fobPct/laborPct/discPct use for a non-single-field numerator).',
]};
