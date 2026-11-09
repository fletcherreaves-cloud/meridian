// @ts-nocheck
export default {version:'5.717', date:'2026-11-09', changes:[
  '**🐛 LifeLenz pull — actual TCs column was silently reading the forecast column instead '+
  '(owner-reported 2026-11-09, found while investigating 44689\'s empty forecast).** '+
  '`scripts/lifelenz-pull.mjs`\'s CSV column finder used a pure substring match for `tcs: '+
  'fc(\'TCs\')` — "TCs" is also a substring of "Fcst. TCs", "Adj. TCs.", and "TCs +/-", and '+
  'those sit BEFORE the real "TCs" header in the report\'s own column order, so the FIRST match '+
  'won every time. Every pull was silently writing the forecasted transaction count into the '+
  '`tcs` (actual) column, for every store, not just 44689. Reproduced directly against a real '+
  'exported LifeLenz report before writing the fix, per the standing "measure, don\'t reason" '+
  'rule. Fixed generically — an exact (case-insensitive) header match is now tried before '+
  'falling back to substring matching — so this changes only the one ambiguous field; every '+
  'other column already had an exact match as its own header text.',
]};
