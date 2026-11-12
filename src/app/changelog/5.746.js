// @ts-nocheck
export default {version:'5.746', date:'2026-11-12', changes:[
  '**Panel Manager: the systemwide "🔒 Everyone" kill switch now covers Core panels too.** ' +
  'Owner follow-on: "Do you think the option should be there for the core panels as well? If ' +
  'so, go ahead and wire that up also." Confirmed first, not assumed: the global kill-switch ' +
  'engine (`isPanelGloballyEnabled`, shipped v5.743) already gated core (`kind:\'nav\'`) panels ' +
  'for free — `shell.js`’s sidebar (`navP`/`navPBeta`) and search index (`navIndex`) both ' +
  'call the same `panelOk(id)` with no optional-vs-core distinction. So this is pure UI: the ' +
  'Core panels reference list (Panel Manager, collapsed by default) now shows the same ' +
  'admin/owner-only "🔒 Everyone" toggle per row, reusing `onToggleGlobal`/`globalDisabled` ' +
  'verbatim — no new engine wiring. Honest limit, same as the optional panels’ own: this ' +
  'hides a panel from the sidebar and search, it is a reachability control, not a hard access ' +
  'boundary (real data access stays RLS-gated regardless). 3 new tests ' +
  '(`dispatch-panel-manager-core-section-2026-09-18.test.js`); build clean.',
]};
