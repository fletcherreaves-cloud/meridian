// @ts-nocheck
export default {version:'5.573', date:'2026-10-16', changes:[
  'Reports redesign Phase 3 (owner request, continuing Phase 1\'s metric-catalog reconciliation ' +
  'and Phase 2\'s shared Report Shell): a real categorized Reports Hub, reached from the sidebar ' +
  'entry now labeled "Reports Hub" (was "My Reports"; NOT labeled bare "Reports" -- that string is ' +
  'already this entry\'s own section header, so the two would collide as two identical-looking nav ' +
  'labels). Category tabs (Daily & Operations / Sales & Forecasting / Guest Experience / Labor & ' +
  'Payroll / Financial & Promotions / Leadership & Above-Store) group every report-shaped panel in ' +
  'the app -- including ones that live in OTHER sidebar sections today (Date-Range Report, ' +
  'Performance Trends, Forecast Reports, Pay Rate History, Promo/Discount ROI) alongside the ones ' +
  'already in the Reports section (Above-Store One-Pager, Loss Prevention Summary, Store ' +
  'One-Pager, Org Summary, Leaderboards) -- in one findable place.',
  'Owner decision (2026-10-15): CROSS-LIST, not relocate. Every panel keeps its own existing nav ' +
  'entry and section; the hub is a second, categorized entry point (src/app/reports-catalog.js), ' +
  'not a new home. Clicking a direct-launch tile just routes straight to that panel\'s own existing ' +
  'route -- no pre-scoping needed, since each already owns its own LocationSelector/date controls.',
  '"My Reports" (the saved-subscription picker + build-a-report form) folds into the hub as its ' +
  'own tab instead of staying a separate, narrower panel, per the same decision. Extracted with ' +
  'ZERO behavior change: report-subscriptions.js\'s ReportSubscriptions component now wraps a new ' +
  'exported ReportSubscriptionsBody (no shell of its own), so the Reports Hub embeds that body ' +
  'directly without a second, nested RoutePanelShell -- every pre-existing test against ' +
  '<ReportSubscriptions> still exercises the identical rendered tree.',
  'Catalog is a thin layer over two existing sources, not a third hand-maintained list: direct- ' +
  'launch tiles pull label/icon/perm live from panel-registry.js\'s PANEL_BY_ID (so a future label ' +
  'or permission change there can never drift out of sync here); subscribable tiles pull from ' +
  'report-subscriptions.js\'s own REPORTS array, which just gained a `category` field.',
  '28 new tests (catalog correctness + permission filtering against the REAL registries, full ' +
  'ReportsHub render/tile-click/tab-switch coverage against the real embedded My Reports body), ' +
  'plus the shell-nav-snapshot/panel-registry suites updated for the real label change. Full suite ' +
  'green (620/620 files, 5835/5835 tests), build clean, within budget (563.53 KB eager / 850 KB ' +
  'budget -- reports-hub.js lands in its own real lazy chunk, 11.46 KB / 4.21 KB gzip, confirmed ' +
  'not in the eager preload list -- effectively unchanged from Phase 2\'s own baseline). Full ' +
  'writeup: memory/project-reports-redesign.md.',
]};
