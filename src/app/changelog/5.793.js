// @ts-nocheck
export default {version:'5.793', date:'2026-11-15', changes:[
  '**Fix: Targets vs Actual — Monthly Labor % target was wrong.** Owner report: "labor target ' +
  'monthly. It is not right." v5.792 shipped a redundant "Labor % (Overall)" row hardcoded to ' +
  'the legacy `tLabor` field — the exact field `src/engine/labor-basis.js` exists to retire ' +
  'after issue #153 (the approval cycle only ever populates `tCrewLabor`; every other labor-' +
  'target consumer in the codebase already routes through that file\'s `resolveLaborTarget()`). ' +
  'Removed the duplicate row; the real Crew Labor % row now resolves its target the same way ' +
  'every other panel does. Caught and fixed the identical mistake a second time in this same ' +
  'release\'s new Yearly tab before it shipped (see next entry).',
  '**Targets vs Actual: Food Cost + a Yearly tab.** Same-day owner follow-up on v5.792\'s new ' +
  'report — "wire in the Food cost items on monthly and add a yearly targets as well for the ' +
  'yearly workbook uploaded." Monthly tab gains **FOB Bonus Food Threshold %** (the one real ' +
  'Food-Cost-group field it was missing) — it\'s not a separate measured metric, it\'s a second, ' +
  'stricter target line graded against the exact same real Total Food Cost % actual the Total ' +
  'Food Cost row already uses (confirmed from the owner\'s own Monthly Projections workbook grid, ' +
  'where the two sit back-to-back). New third pill tab, **Yearly Targets**, reads the uploaded ' +
  'yearly targets workbook (`ds.allYearlyTargets`, keyed by the selected range\'s year) for the 8 ' +
  'fields with an already-verified daily/auto actual resolver — Sales $, Labor %, TPPH, OEPE, ' +
  'Parked %, KVS Time, R2P, FOB Target % — reusing the exact same metric-source.js/fob-' +
  'reference.js resolvers the Monthly/Daily tabs already use, never a new one. CSAT (OSAT/OSAT ' +
  'B2B/EAD/1-800 Contacts), Digital (App %/GCRD, McDelivery), and People (staffing, turnover) ' +
  'stay out for now — review-engine.js\'s own target/actual mapping already shows some have no ' +
  'verified actual source anywhere yet and the rest are monthly-cadence rollups at a different ' +
  'grain than this report\'s day-range picker, a real follow-on rather than a guess. 9 new tests.',
]};
