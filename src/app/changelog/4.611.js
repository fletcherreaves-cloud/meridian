// @ts-nocheck
export default {version:'4.611', date:'2026-07-30', changes:[
  'EOM Food-Cost Diagnosis now carries a Decision guide (2×2) grounded in verified fact: because QSRSoft anchors variance at the period boundary, a mid-month COUNT ERROR washes out of the monthly figure — so the report/SAGE now separate a locked, verified one-off ("drop it") from a recurring real loss ("can\'t recover this month, but fix the cause — it comes back") from an early count never re-counted at EOM ("still fixable — recount to protect next month\'s opening").',
  'Added a UOM-sanity check: a variance whose quantity is a clean whole-case multiple (the classic "3 cases entered as 3 eaches" blunder) is now flagged as verify-first — a possible units-entry error, not a confirmed loss — before it corrupts the monthly number and next month\'s baseline.',
]};
