// @ts-nocheck
export default {version:'5.247', date:'2026-08-28', changes:[
  'Dispatch #206 -- URL migration batch 3 (closing out the "default to route:true" candidate ' +
  'list): the final seven panels converted to route:true, matching dispatch #192/#205\'s ' +
  'established pattern exactly (swap the panel\'s chrome to RoutePanelShell, wire ' +
  'routePanel===\'<id>\' in App.js, add route:true to the panel-registry.js entry). DT Speed of ' +
  'Service (dt-sos, dt-speedofservice.js), Local News (news, news-panel.js), Inventory ' +
  'Intelligence (inventory, inventory.js), Market Intelligence (loc-intel, location-intel.js), ' +
  'My Reports (my-reports, report-subscriptions.js), SMG VOICE (smg-voice, smg-voice.js) and ' +
  'Task Queue (task-queue, task-queue.js) all now have their own bookmarkable URL.' +
  '\n\n' +
  'Four of the seven hand-rolled their own position:fixed/inset:0/rgba(0,0,0 backdrop and were ' +
  'refactored to RoutePanelShell internally, same treatment as #205\'s StoreOnePager/ ' +
  'GradedVisitsPanel: DTSpeedOfServicePanel and NewsPanel (one hit each -- their date-range/org- ' +
  'filter/export controls and signal-filter chip row moved into headerExtra or the body, the old ' +
  'in-body close button dropped since the header back arrow is now the sole dismiss action); ' +
  'LocationIntelligence (one hit -- its standalone, non-embedded call shape only; the ' +
  'embedded:true inline-tab call shape from store-analytics.js, dispatch #200, is completely ' +
  'unchanged, still no shell of any kind); InventoryIntelligence (TWO hand-rolled backdrops under ' +
  'one component -- an empty-state early return and the main panel body -- the same "two ' +
  'backdrops, one component" shape #205/#188 found in OperatorSummaryPanel/FOBAnalysisPanel). ' +
  'SMGVoicePanel ALSO genuinely hand-rolled two backdrops the same way, but both used ' +
  '`zIndex: 1200,` sitting between `inset: 0,` and `background:`, which breaks ' +
  'ratchet-modal-backdrop-bypass.test.js\'s exact-adjacency regex (the same evasion shape dispatch ' +
  '#160\'s comment records for one-pager.js\'s old zIndex:4000 case) -- real chrome ' +
  'simplification, but it does not move that ratchet\'s CEILING. TaskQueuePanel was never the ' +
  'rgba(0,0,0 backdrop pattern at all (an opaque position:fixed/zIndex:400/background:var(--bg) ' +
  'full-page wrapper that already read like a route); its AddEntrySheet add-entry bottom sheet ' +
  'was left untouched -- a genuine secondary popup stacked on the routed page, not this panel\'s ' +
  'own chrome, same reasoning dispatch #198 used for EOMDashboardPanel\'s sub-modals. ' +
  'ReportSubscriptions (\'my-reports\') was already ModalShell-based -- a pure shell swap ' +
  '(ModalShell -> RoutePanelShell, onClose -> onBack), exactly #205\'s delivery-mix precedent.' +
  '\n\n' +
  'Every existing deep-link/onOpenModal call site for all seven panels was grepped and re-wired ' +
  'to route through goRoute: dt-sos/news/inventory/loc-intel/smg-voice (1 site each), my-reports ' +
  '(2 sites -- the ordinary nav entry AND ReportSubscriptions\' own onLaunch callback, which now ' +
  'calls goRoute(null) before routing elsewhere for the calendar/visit-readiness/above-store ' +
  'branches), task-queue (2 sites -- the ordinary nav entry AND the legacy feature-requests alias ' +
  'from dispatch #194\'s Feature-Requests->Task-Queue merge, which still sets tqInitialType before ' +
  'calling the SAME goRoute(\'task-queue\')). The feature-requests alias itself stays a plain ' +
  'onOpenModal branch, NOT a routing.js LEGACY_PANEL_REDIRECTS entry -- unlike leader-one-pager/ ' +
  'time-punches, \'feature-requests\' was never itself route:true, so there was never a legacy ' +
  '`?panel=feature-requests` URL value to redirect; its only deep-link shape is the ' +
  'onOpenModal(\'feature-requests\') call path, which already resolves correctly (verified with a ' +
  'new source-level pairing test). loc-intel was also folded into lazyPanel() as part of its ' +
  'conversion -- it was a static top-level import in App.js before this dispatch (the other six ' +
  'were already lazy).' +
  '\n\n' +
  'All seven showX useState declarations, their render lines (moved from the position:fixed modal ' +
  'section into the routePanel gates in the main content area) and their entries in anyModalOpen / ' +
  'the universal Escape-key sweep were removed. dispatchIds() in panel-registry.test.js was ' +
  'reading a hard-coded 14,000-char window of the onOpenModal dispatcher to find every modal===\'id\' ' +
  'branch -- already at 13,961 chars before this dispatch\'s own edits, 39 chars of headroom -- and ' +
  'this dispatch\'s comments pushed it over, silently dropping forms-library/metric-lineage out of ' +
  'the scan and failing the registry-completeness test with a misleading "unopenable" message. ' +
  'Fixed by widening the window to 16,000 (real headroom, not a re-measured exact fit) rather than ' +
  'trimming comments to fit a number nobody had budgeted for.' +
  '\n\n' +
  'Both required ratchets re-measured fresh, not by arithmetic: panel-registry.test.js\'s ROUTE_IDS ' +
  'grew from twenty-four to thirty-one (all seven ids added, alphabetically sorted, running ' +
  'narrative comment extended in the same style), plus a new "Dispatch #206: no setShowX(true) ' +
  'call site survives" test mirroring #192/#205\'s own, and a new source-level test pinning the ' +
  'feature-requests alias\'s goRoute(\'task-queue\') pairing. ratchet-modal-backdrop-bypass.test.js\'s ' +
  'CEILING dropped from 47 to 42 -- reproduced the test\'s own exact scan (regex + file-walk over ' +
  'src/views/ + src/features/, excluding *.test.js) on this branch, confirmed per-file (dt-sos/ ' +
  'news/location-intel each lost their file\'s ONLY function, dropping the whole file out of the ' +
  'scan; inventory.js lost 2 of what was previously its only hits) rather than subtracting "5 ' +
  'backdrops removed" by hand -- and confirmed smg-voice.js and task-queue.js genuinely carry zero ' +
  'hits both before and after their conversion, not just "expected zero." shell-nav-snapshot.test.js ' +
  'needed no changes (pure route:true flip; smg-voice\'s NAV_EXTRAS live-count badge is untouched).' +
  '\n\n' +
  'Full suite: 302 files / 3129 tests passing. npm run build clean, eager-payload total 522.34 KB / ' +
  '850 KB gzip budget (327.66 KB headroom) -- down from #205\'s 533.00 KB baseline; loc-intel\'s ' +
  'lazy-wrap is the only change to the eager set (task-queue.js stays a static import, unchanged ' +
  'from before this dispatch -- out of scope, per the dispatch doc\'s own scoping).',
]}
