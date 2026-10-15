// @ts-nocheck
export default {version:'5.563', date:'2026-10-14', changes:[
  'Fixed "Needs You Today" home-screen tile links opening to a blank page (owner report: ' +
  '"when clicking any link on Needs You Today Tile, it opens to a blank page rather than ' +
  'taking me to the event(s)"). Root cause: App.js passed onNav:v=>setView(v) into AtAGlance, ' +
  'but every home-tile click (NeedsYouTodayTile, VisitReadinessTile\'s "Open Visit Readiness", ' +
  'TrackingToPlanTile\'s "Open Signals", CoachingLoopTile\'s "Needs Attention" link) calls onNav ' +
  'with a ROUTE-PANEL id (\'attention\'/\'visit-readiness\'/\'signals\', each opened elsewhere in ' +
  'App.js via goRoute(id)+a routePanel===id branch), not a top-level view id. setView(\'attention\') ' +
  'set view to a string matching no view===... render branch AND flipped view===\'command\' to ' +
  'false, unmounting AtAGlance with nothing else rendering -- a real blank page, reproduced by ' +
  'reading the code path, not assumed. Fixed by routing every id through goRoute except ' +
  '\'district\' (the one genuine top-level view among these callers), which keeps setView.',
  'Also acted on the other half of the report -- "open to actual context supporting claim, not ' +
  'just hot link to needs attention... at the bottom, that link direct to needs attention is ' +
  'fine": NeedsYouTodayTile item ROWS now open the specific STORE behind the item directly ' +
  '(App.js\'s onOpenStore, extended to accept an optional tab) on the tab that actually backs ' +
  'the claim -- attention-feed.js\'s item.nav field (documented as "the panel/modal id to open ' +
  'on click" since the engine shipped, confirmed via repo-wide grep to have NEVER been read by ' +
  'any consumer before this) now drives a small nav->StoreDash-tab map (fob->Food Cost, ' +
  'forecast-audit->Forecast Table, everything else incl. every brief-finding item like CASH/POS ' +
  'INTEGRITY -> Overview, which already shows that store\'s own findings + KPI vitals + context ' +
  'strip). A coaching-review item (no nav field -- its one real action, logging the verdict, ' +
  'only exists in the full panel) and any loc-less item (staleData, signal decay) still go to ' +
  'Needs Attention, unchanged, exactly as the owner said is fine for the footer link.',
  'Pricing Engine -- fixed a real crash on a cold load (owner: "open the pricing engine and ' +
  'check it"; live-reproduced via a direct ?panel=pricing-engine URL, which hits the panel ' +
  'before App.js\'s own data load resolves ds): PricingEnginePanel read ds.pmixRows directly in ' +
  '4 places with no null guard, throwing "Cannot read properties of null (reading ' +
  '\'pmixRows\')" into the error boundary. Matches the (ds && ds.x) || [] guard every other ' +
  'ds-reading panel in this codebase already uses (e.g. SMGVoicePanel) -- one local `pmixRows` ' +
  'alias now reused at all 4 call sites. Re-verified live post-fix: the panel now renders its ' +
  'normal empty state instead of crashing.',
  'Updated/added tests: home-needs-you-today.test.js now covers a row opening the right store+tab ' +
  '(not the generic panel), a loc-less item still falling back to onNav, and the footer link ' +
  'unchanged. Full suite green (603/603 files, 5645/5645 tests), npm run build clean, within the ' +
  'entry-chunk budget.',
]};
