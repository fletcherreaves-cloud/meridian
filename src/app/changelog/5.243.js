// @ts-nocheck
export default {version:'5.243', date:'2026-08-28', changes:[
  'Dispatch #202 -- folded EOM Supervisor Summary (the standalone district-level monthly P&L ' +
  'variance rollup by store/supervisor/operator, src/views/eom-supervisor.js) into the Inventory ' +
  'Control hub (eom-dashboard.js, already hosting Scoreboard/EOM Count/Cadence/Count Cycle) as a ' +
  'new "Supervisor Rollup" tab/mode, matching the "detail hub + cross-store rollup tab" precedent ' +
  'schedule-retention.js already established (dispatch #141, ScheduleRetentionRollupSection) ' +
  'rather than inventing a new pattern. EOMSupervisorPanel itself is unchanged in substance -- it ' +
  'was already content-only (no ModalShell/backdrop of its own), so it slots into ' +
  'EOMDashboardPanel\'s RoutePanelShell body exactly like it slotted into the old standalone modal.' +
  '\n\n' +
  'Permission-scoping question (measured, not assumed, per the dispatch\'s explicit ask): ' +
  'eom-summary was ALREADY perm:\'analytics.district\', identical to eom-dashboard\'s own ' +
  'registry-level perm -- there is no privilege mismatch to gate around here, unlike ' +
  'SchedulingHubPanel\'s sched-hub (perm analytics.store) hosting one stricter tab (labor-analytics, ' +
  'analytics.labor) that IS internally gated via SCHED_TABS\' own perm filter in App.js. Folding ' +
  'this tab in widens nothing and narrows nothing -- confirmed by reading panel-registry.js\'s two ' +
  'entries directly, not by assumption, and asserted by a new test (below).' +
  '\n\n' +
  'Supervisor mode brings its own period/group filters (EOMSupervisorPanel\'s internal ' +
  'month+year+groupType pickers), an entirely different filter dimension from the shared scope/ ' +
  'patch/oneStore + period controls every other Inventory Control mode reads -- PanelChrome\'s ' +
  'location/date/export/action bands are hidden for this mode (kept only the tab strip) rather ' +
  'than showing two unrelated location/period pickers at once, same reasoning ' +
  'ScheduleRetentionRollupSection uses relative to its own sibling tab. SummaryTiles and the EOM- ' +
  'completion/scoreboard table chain are short-circuited for this mode, same shape Count Cycle ' +
  'already established (dispatch #189).' +
  '\n\n' +
  'Print preserved: EOMSupervisorPanel\'s own in-page print mechanism (body.eom-printing CSS class ' +
  'scoping, unique to this panel among the app\'s print patterns) previously keyed off a standalone ' +
  'ModalShell\'s backdropClassName/cardClassName/headerClassName. RoutePanelShell (ModalShell.js) ' +
  'gained the same className/headerClassName hooks (optional, additive, every other caller ' +
  'unaffected) so the identical class names now come from EOMDashboardPanel\'s own RoutePanelShell ' +
  'instance -- the print CSS itself needed no changes.' +
  '\n\n' +
  'eom-summary retired to kind:\'internal\' (harvest-then-remove, kept its id so panel-registry.' +
  'test.js\'s dispatch<->registry pairing still passes; section: corrected to ' +
  '\'inventory-food-cost\', its real new home, not left at the stale \'operations\'). ' +
  'onOpenModal(\'eom-summary\') (App.js) now redirects into eom-dashboard\'s Supervisor Rollup tab ' +
  'via the existing eomInitialMode one-shot state (dispatch #189\'s mechanism, reused not ' +
  'duplicated) -- eom-summary never had its own ?panel= URL route, so only the live call path ' +
  'needed redirecting, no legacy-URL branch. Old showEOMSummary state + its standalone ModalShell ' +
  'render block removed outright, along with the now-dead EOMSupervisorPanel lazyPanel() entry in ' +
  'App.js (it\'s imported directly by eom-dashboard.js now, same "absorbed into the hub" pattern ' +
  'CountCyclePanel/count-cycle-panel.js already uses).' +
  '\n\n' +
  'shell-nav-snapshot.test.js EXPECTED array + permission tables re-captured fresh by running the ' +
  'test and reading its real failure output (not hand-guessed): "EOM Supervisor"/📊 drop out of the ' +
  'default nav render (Operations is now just 3PO Delivery/Graded Visits/Promo/Guest Voice/Visit ' +
  'Readiness, all analytics.store) -- a real, measured second-order effect: with EOM Supervisor ' +
  'gone, ALL Operations members are now analytics.store, so denying that permission empties the ' +
  'section entirely and its header vanishes too (same behavior "Scheduling & Labor" already ' +
  'demonstrated). The test\'s own "header survives a fully-store denial" contrast case moved from ' +
  'Operations/EOM Supervisor to Inventory & Food Cost/Inventory Control (eom-dashboard, still the ' +
  'section\'s one analytics.district member) -- a real registry section, not invented for the test.' +
  '\n\n' +
  'ratchet-modal-backdrop-bypass.test.js re-measured fresh by running its own exact scan (not by ' +
  'arithmetic): unaffected, stays at CEILING 52 -- this change never touches a hand-rolled ' +
  '`position:fixed,inset:0,background:rgba(0,0,0` backdrop pattern (App.js\'s removed ModalShell ' +
  'block used the shared component, not a hand-rolled one, and it lives outside this ratchet\'s ' +
  'src/views + src/features scope regardless).' +
  '\n\n' +
  'New test: dispatch-202-eom-supervisor-rollup.test.js renders the REAL EOMDashboardPanel -> ' +
  'EOMSupervisorPanel chain (not an isolated helper, per this repo\'s "would this verification ' +
  'still pass if reverted?" rule) via both the initialMode redirect prop and an actual tab click, ' +
  'asserts real Supervisor Rollup content renders (and EOM/Cadence content does not leak in), the ' +
  'shared location/date/action controls are hidden for this mode, and the registry\'s perm-parity ' +
  'claim holds by direct read.' +
  '\n\n' +
  'Verification: full suite passing, npm run build clean. See commit body for exact counts.',
]}
