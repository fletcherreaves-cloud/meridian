// @ts-nocheck
export default {version:'5.521', date:'2026-10-12', changes:[
  'Food Cost -> Register Audit cross-reference (owner req 2026-10-12: "cross-reference only, ' +
  'keep named data out of food-cost reports, maybe with a clickable link to go to actionable ' +
  'data where names could then be seen if desired"). The Food Cost panel\'s Emp/Mgr Meals row -- ' +
  'the one FOB component that is also a cash-controls metric (a comp meal is a register ' +
  'override, same family Register Audit already tracks per-named-employee) -- now carries a ' +
  '"-> Register Audit" link, both inline in single-store view and per-store in the district-wide ' +
  'breakdown chips. No employee names or register data are pulled into the Food Cost panel ' +
  'itself; the link navigates out to that store\'s own Register Audit tab, where names were ' +
  'already visible.',
  'New plumbing to make this possible: FOBAnalysisPanel gained an onNav(loc,tab) prop; StoreDash ' +
  'gained an initialTab prop (same lifted-tab pattern as App.js\'s existing schedTab/planningTab/' +
  'crewTab/signalsTab -- set right before navigating, read once by StoreDash\'s own useState ' +
  'initializer on mount); App.js\'s goStore(s,tab) now accepts an optional tab and FOBAnalysisPanel\'s ' +
  'onNav closes its own route panel first (goRoute(null)) before switching into StoreDash\'s ' +
  'separate view/selStore routing system -- the two routing systems do not compose automatically.',
  '6 new tests (fob-register-audit-crossref-2026-10-12.test.js) rendering the real ' +
  'FOBAnalysisPanel and StoreDash: the link is absent with no onNav wired (names stay out by ' +
  'default), clicking it in single-store view calls onNav with that store\'s own loc, each ' +
  'store\'s own chip in the district-wide view calls onNav with ITS loc (not a fixed one), no ' +
  'link renders in an OK/FL market roll-up (no single store to land on), and StoreDash\'s ' +
  'initialTab actually seeds which tab renders on first mount.',
]};
