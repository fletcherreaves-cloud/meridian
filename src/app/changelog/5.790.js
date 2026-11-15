// @ts-nocheck
export default {version:'5.790', date:'2026-11-15', changes:[
  '**Fix: District View blank screen on reopen.** Owner report: open District View, select a ' +
  'store (or otherwise navigate away without using StoreDash\'s own Back arrow), then click ' +
  'District View in the nav again — the content area stayed completely blank, no error. ' +
  'District View\'s render gate (App.js: `view===\'district\'&&!selStore&&...`) requires ' +
  '`selStore` to be null, but `selStore` was only ever cleared by StoreDash\'s Back button — ' +
  'never by switching views through the nav itself. Leaving a store via any other nav item left ' +
  '`selStore` pointing at the last-viewed store forever, so every later District View click set ' +
  '`view` correctly but failed the `!selStore` half of the gate silently (no error thrown — ' +
  'the component simply never mounted). The District View nav handler (AppSidebar, src/app/' +
  'shell.js) now also clears `selStore`, the same way it already clears `routePanel` ' +
  '(dispatch-home-nav-clears-route-panel-2026-11-02). 2 new tests.',
]};
