// @ts-nocheck
export default {version:'4.728', date:'2026-08-01', changes:[
  'Faster load / hard refresh: code-split the 11 heaviest secondary panels (EOM Dashboard, Signals, SAGE, One-Pager, SMG Voice, FOB EOM, Delivery Mix, Yearly Projections, Visit Readiness, Graded Visits, Performance Reviews) into on-demand chunks via React.lazy behind a single Suspense boundary. Initial bundle 4.2MB → 3.34MB (~555KB of panel code now loads only when a panel is opened). The home/At-a-Glance view and the Loaded Data strip (incl. Sales) stay in the eager bundle — high-priority, never deferred.',
  'Ops pull (OT source) robustness: when the Operations Report page doesn\'t fire an api.reports request (so the token listener sees nothing), the Playwright fallback now also visits the Daily Activity page to capture the same X-Auth-Token — the likely reason the pull was returning 0 rows. Refresh QSRSOFT_TOKEN or re-run the pull to repopulate qsr_labor_summary → OT.',
]};
