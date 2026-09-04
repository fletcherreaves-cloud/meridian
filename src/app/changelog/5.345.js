// @ts-nocheck
export default {version:'5.345', date:'2026-09-04', changes:[
  'Added a global search bar to the top of the sidebar (owner req: "a search bar at the top of ' +
  'the menu to find anything in-app"). Type a panel name, get filtered results, click (or press ' +
  'Enter on the top match) to jump straight there.',
  'Indexed from the SAME two sources and the SAME visibility rules the sidebar itself already ' +
  'renders from -- panelsForSection() per real section (the same can(perm) gate renderSection() ' +
  'uses) plus testKitchenPanels() when Test Kitchen is showing (the same !betaMode gate ' +
  'renderTestKitchen() uses) -- so a search result is never something the user could not also ' +
  'have found by scrolling, and can never silently drift from what is actually clickable. ' +
  'kind:\'internal\'/\'orphan\'/\'hub-tab\' panels are excluded by construction.',
  'Hidden when the sidebar is collapsed (no room for a text box in the 48px rail).',
  '5 new render-level tests (dispatch-nav-search.test.js) -- mounts the real AppSidebar component ' +
  '(react-dom/client, not renderToStaticMarkup) and exercises actual typing/filtering/clicking, ' +
  'plus a permission-denial case and the collapsed-hides-search case. shell-nav-snapshot.test.js\'s ' +
  'exact nav-text snapshot (static markup) confirmed unaffected -- the search box\'s placeholder ' +
  'is an attribute, not text content.',
  'Full suite (4331 tests) and build both clean, small expected bump to the eager entry chunk ' +
  '(534.32 -> 534.82 KB gzip, well within the 850 KB budget) -- shell.js is always eagerly ' +
  'loaded, so this small addition lands there rather than in a lazy chunk.',
]};
