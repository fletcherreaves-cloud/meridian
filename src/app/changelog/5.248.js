// @ts-nocheck
export default {version:'5.248', date:'2026-08-28', changes:[
  'Dispatch #207 -- route:true for Planning Hub, closing out the last named holdout from the ' +
  '#192/#205/#206 URL-migration project. Planning (targets/monthly/pace/yearly/smart) now has ' +
  'its own bookmarkable ?panel=planning URL.' +
  '\n\n' +
  'PlanningHubPanel is a module-level function defined inline in App.js, not its own view/' +
  'feature file -- the shape every prior dispatch doc flagged as "materially different" and ' +
  'deferred. It turned out not to be: SchedulingHubPanel, the same "tab array + hub panel" shape ' +
  'immediately above it in App.js, was already converted to route:true (as sched-hub) under ' +
  'dispatch #55 Part B, with zero file extraction. PlanningHubPanel took the identical ' +
  'treatment, used as a literal template: hand-rolled position:fixed/inset:0/rgba(0,0,0,.82) ' +
  'backdrop replaced with h(RoutePanelShell, {title, icon, onBack, headerExtra}, active) in ' +
  'place, tab-strip JSX pulled into a local tabBar variable, render call moved from the "modals ' +
  'at root" bucket into the routePanel gate alongside sched-hub. All six existing open call ' +
  'sites (modal===\'planning\'/\'monthly-proj\'/\'pace-target\'/\'yearly-proj\'/' +
  '\'unified-targets\'/\'smart-targets-v2\') rewired from setShowPlanningHub(true) to ' +
  'goRoute(\'planning\'), each keeping its setPlanningTab(...) companion call unchanged so deep ' +
  'links still land on the right tab. showPlanningHub useState, its anyModalOpen entry and its ' +
  'Escape-sweep call removed.' +
  '\n\n' +
  '\'events\' (Events & Tags), the other named holdout, stays deliberately unconverted -- its ' +
  'chrome lives in two different delegate components rather than the hub itself, a genuinely ' +
  'riskier shape that needs its own dedicated scoping pass.' +
  '\n\n' +
  'ratchet-modal-backdrop-bypass.test.js\'s CEILING is unchanged at 42 -- confirmed by re-running ' +
  'its own scan after the conversion, not assumed: its ROOTS only walk src/views and src/' +
  'features, and PlanningHubPanel lives in src/app/App.js, out of scope. panel-registry.test.js\'s ' +
  'ROUTE_IDS grows 31 -> 32 (\'planning\' added) plus a new "no setShowPlanningHub(true) call ' +
  'site survives" ratchet matching #205/#206\'s pattern.' +
  '\n\n' +
  'Full suite: 302 files / 3130 tests passing. Build clean; eager payload 522.25 KB gzip ' +
  '(budget 850 KB, headroom 327.75 KB) -- essentially flat against #206\'s 522.35 KB baseline, as ' +
  'expected for a pure in-place shell swap with no new imports.',
]};
