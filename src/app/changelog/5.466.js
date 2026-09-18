// @ts-nocheck
export default {version:'5.466', date:'2026-09-18', changes:[
  'SAGE: knows what panel the owner is currently looking at -- no screenshot needed. SAGE ' +
  'renders as a right-anchored drawer over whatever the rest of the app is showing (App.js), so ' +
  '"what is the owner looking at right now" was always real, live state (view/selStore/' +
  'routePanel) that SAGE simply never saw. App.js now builds sageActiveContext from that same ' +
  'state (recomputed every render, so it tracks live navigation while the drawer stays open) and ' +
  'passes it to SagePanel -> buildSystemPrompt\'s new 4th parameter, which adds a "Currently ' +
  'viewing: ..." line -- the store name + loc for Store Dashboard, the registry label for any ' +
  'routed panel (Projections, Signals, etc.), or a friendly name for each of the four plain ' +
  'views (At A Glance / Analytics / Org View / Store Dashboard).',
  'A question phrased without naming a store or panel ("what\'s driving this," "why is this ' +
  'red") can now be answered against the panel actually on screen instead of SAGE guessing or ' +
  'asking the owner to describe it. Optional end-to-end: buildSystemPrompt omits the line ' +
  'entirely when no activeContext is passed (e.g. a future headless/scheduled prompt run).',
  '5 new tests against the real exported buildSystemPrompt() (store-view naming, routePanel-' +
  'wins-over-view, each plain-view label, the no-context omission case, and a store view with ' +
  'an unresolved name not fabricating a line) -- would fail against the old 3-arg signature that ' +
  'silently ignored a 4th argument. Full suite 529/529 files, 5041/5041 tests. Build clean, ' +
  'eager payload 551.33 KB gzip (budget 850 KB).',
]};
