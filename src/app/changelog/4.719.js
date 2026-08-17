// @ts-nocheck
export default {version:'4.719', date:'2026-08-01', changes:[
  'Change Monitor: new "Month-over-month" baseline toggle. Compares each item’s authoritative period variance this period vs last (QSRSoft Variance Stat), flagging improving (variance shrank toward zero / resolved off the list) vs regressing (grew / newly on the list); stores rank by most regressing → laggard detection. KB-grounded framing: variance is a point-to-point reconciliation (Actual Usage = Starting Inv + Purchases ± Transfers − Waste − Ending Inv), and each period already begins from the prior EOM’s ending count, so this compares two reconciliations rather than re-baselining.',
  'Change Monitor drill-down now shows the point-to-point anchor: a "Period start · beginning inventory (carried from last EOM)" row = the first POS Open reading, so the reconciliation window (beginning inventory → binding count = variance) is visible and verifiable right in the ledger table.',
]};
