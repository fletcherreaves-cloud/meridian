// @ts-nocheck
export default {version:'5.576', date:'2026-10-16', changes:[
  '**Lifelenz Scheduling Gap Report fixed** (owner-reported: live panel showed Lifelenz at a ' +
  '202.70% avg MAPE / 27-0 sweep, wildly off the 9.51% / 16-27 validated backtest result in ' +
  'the codebase\'s own header comment). Root cause: Meridian\'s side read a FROZEN number from ' +
  'the original Sep2025-May2026 backtest while Lifelenz\'s side was always live-recomputed from ' +
  'whatever Labor Analysis file happens to be loaded — once a newer file moved onto a different, ' +
  'more recent window, the panel kept comparing two different time periods under a hardcoded ' +
  '"same Sep 2025-May 2026 window" subtitle. Both sides now compute live, on the exact same ' +
  'matched dates (forecastDay in leak-free Back Test mode, forced onto the AE model). Also ' +
  'fixed: selecting a period with zero matched rows used to render a silent blank table with no ' +
  'summary cards and no explanation — now shows a real empty-state message.',
  '**Reports Hub Tier 1** (owner request, "go ahead with all of these"): eight proven, already-' +
  'live route:true nav panels cross-listed into the Reports Hub catalog for the first time — ' +
  'Graded Visits, Customer Complaints, Pricing Engine, Performance Reviews, Market Intelligence, ' +
  'DT Speed of Service, 3PO Delivery, and Inventory Control (EOM Dashboard). Fills Guest ' +
  'Experience, which previously had zero direct-panel tiles. Form Completions needed its own ' +
  'fix first — it was still wired through the old modal-state pattern — so it got route:true ' +
  'and a routePanel rewire (wrapped directly in RoutePanelShell, same "no internal chrome to ' +
  'strip" case signals/security already set the precedent for) before being cross-listed too.',
  '**Reports Hub Tier 2**: verified the "Recount visibility report" item in memory/' +
  'project-backlog.md (logged 2026-10-02, "for later") against the real code. All 4 of its own ' +
  'open questions were already answered the very next day (2026-10-03) — dollar AND percent, ' +
  'before/after FOB side by side, a per-location recounted-yes/no roll-up, and an EOM/Weekly ' +
  'mode toggle — in EOMRecountImpactPanel. No code changes needed; backlog entry corrected.',
  '**Reports Hub Tier 3**: new Cash Variance Pattern report — the other half of the owner\'s ' +
  '2026-08-31 "link cash controls to food cost" ask (a CoachQ sample showed a register/cashier-' +
  'level variance table naming individuals, deliberately not built then per this repo\'s ' +
  '"verify, don\'t accuse" convention). Measured first: Meridian\'s own Register Audit import is ' +
  'keyed by EMPLOYEE, not register number — there is no register-number field in this app\'s ' +
  'data model at all. Built privacy-safe by construction instead: the same cash O/S / POS ' +
  'override / refund / T-Reds-After signal, aggregated by STORE x DAY-OF-WEEK, never by ' +
  'register or person. No synthetic "flagged" threshold (no measured backtest exists yet to ' +
  'validate one) — real averages, sortable, same posture Weather Impact and Channel Mix take.',
  '36 new tests (Lifelenz Gap live-recompute + empty-state, Reports Hub Tier 1 catalog entries, ' +
  'Cash Variance Pattern engine math + real panel render + privacy-safe-by-construction check) ' +
  'plus shell-nav-snapshot/panel-registry updated for the new nav entry (route count fifty -> ' +
  'fifty-one). Full suite green, build clean, within budget — Cash Variance Pattern lands in ' +
  'its own lazy chunk.',
]};
