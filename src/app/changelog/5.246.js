// @ts-nocheck
export default {version:'5.246', date:'2026-08-28', changes:[
  'Dispatch #205 -- URL migration batch 2: six more panels converted to route:true, matching ' +
  'dispatch #192\'s established pattern exactly (swap the panel\'s chrome to RoutePanelShell, ' +
  'wire routePanel===\'<id>\' in App.js, add route:true to the panel-registry.js entry). ' +
  'Store One-Pager (one-pager, StoreOnePager in analytics.js), Forecast Brief (brief, ' +
  'LocationBrief in analytics.js), Visit Readiness (visit-readiness.js), Graded Visits ' +
  '(graded-visits.js), Org Summary (operator-summary, labor-tools.js) and 3PO Delivery ' +
  '(delivery-mix, delivery-mix.js) all now have their own bookmarkable URL.' +
  '\n\n' +
  'Four of the six hand-rolled their own position:fixed/inset:0/rgba(0,0,0 backdrop and were ' +
  'refactored to RoutePanelShell internally, same treatment AttentionPanel/RankingView got under ' +
  'dispatch #192: StoreOnePager and GradedVisitsPanel (one hit each -- their filter/action ' +
  'controls moved into RoutePanelShell\'s headerExtra slot, the old in-body close button ' +
  'dropped since the header back arrow is now the sole dismiss action); VisitReadinessPanel and ' +
  'OperatorSummaryPanel (whose Scope/Controls bars had no subHeader slot to live in, so they ' +
  'moved to be the first body child instead, same move AttentionPanel\'s severity chips made). ' +
  'OperatorSummaryPanel specifically carried TWO hand-rolled backdrops under one component -- an ' +
  'empty-state early return and the main panel body -- the same "two backdrops, one component" ' +
  'shape dispatch #188 found in FOBAnalysisPanel. LocationBrief (\'brief\') had no internal ' +
  'chrome of its own (previously wrapped in an external ModalShell at the App.js call site) and ' +
  'is now wrapped in an external RoutePanelShell instead, same treatment as #192\'s security/ ' +
  'signals. DeliveryMixPanel (\'delivery-mix\') was already ModalShell-based, confirmed to have ' +
  'no hand-rolled backdrop -- a pure shell swap (ModalShell -> RoutePanelShell, onClose -> ' +
  'onBack), no ratchet interaction, exactly the lower-risk conversion the dispatch called out.' +
  '\n\n' +
  'Every existing deep-link/onOpenModal call site for all six panels was grepped and re-wired ' +
  'to route through goRoute, not just each panel\'s primary nav entry: one-pager (1 site), ' +
  'graded-visits (1 site), operator-summary (1 site), visit-readiness (2 sites -- the ordinary ' +
  'nav entry AND ReportSubscriptions\' onLaunch callback, which now calls goRoute(\'visit-' +
  'readiness\') after setting visitReadyInit), brief (2 sites -- the ordinary nav entry, now a ' +
  'single-line handler using the comma operator so goRoute(\'brief\') stays on the same source ' +
  'line as the modal===\'brief\' check per panel-registry.test.js\'s deep-link pairing test, AND ' +
  'AtAGlance\'s onOpenBrief prop), delivery-mix (2 sites -- the ordinary nav entry AND the ' +
  'retired channel-intel redirect, which now calls goRoute(\'delivery-mix\') instead of the ' +
  'deleted setShowDeliveryMix(true)). All six showX useState declarations, their render lines ' +
  '(moved from the position:fixed modal section into the routePanel gates in the main content ' +
  'area, same location as every other route:true panel) and their entries in anyModalOpen / the ' +
  'universal Escape-key sweep were removed -- the Escape sweep\'s early routePanel return already ' +
  'covers them, so nothing needed adding there, only removing the stale setShowX(false) calls. ' +
  'visitReadyInit and briefScope stay as local App state, same "initialX prop" shape every other ' +
  'routed panel with a one-shot deep-link target already uses (eomInitialMode, aboveStoreInit, etc).' +
  '\n\n' +
  'Both required ratchets re-measured fresh, not by arithmetic: panel-registry.test.js\'s ' +
  'ROUTE_IDS grew from eighteen to twenty-four (all six ids added, alphabetically sorted, running ' +
  'narrative comment extended in the same style), plus a new "Dispatch #205: no setShowX(true) ' +
  'call site survives" test mirroring #192\'s own. ratchet-modal-backdrop-bypass.test.js\'s ' +
  'CEILING dropped from 52 to 47 -- reproduced the test\'s own exact scan (regex + file-walk over ' +
  'src/views/ + src/features/, excluding *.test.js) on this branch rather than subtracting "5 ' +
  'backdrops removed" by hand, since analytics.js and labor-tools.js each host several OTHER ' +
  'components and a hit could easily have belonged to a different panel sharing the file -- ' +
  'verified per-file against real function boundaries: analytics.js\'s :1023 hit was inside ' +
  'StoreOnePager (755-1081), not any of its seven siblings in that file; labor-tools.js\'s :1732/ ' +
  ':1739 hits were both inside OperatorSummaryPanel (1535-1929), not its seven siblings; graded-' +
  'visits.js\'s :568 and visit-readiness.js\'s :572 were each their file\'s only function, so both ' +
  'files drop out of the scan entirely. shell-nav-snapshot.test.js needed no changes (pure ' +
  'route:true flip, no label/section/kind touched).' +
  '\n\n' +
  'Full suite: 302 files / 3127 tests passing (includes the new "Dispatch #205: no setShowX(true) ' +
  'call site survives" test added to panel-registry.test.js). npm run build clean, eager-payload ' +
  'total 533.02 KB / 850 KB gzip budget (316.98 KB headroom) -- all six panels were already ' +
  'lazy-loaded via lazyPanel() before this dispatch and still are; no static import was added to ' +
  'App.js.',
]}
