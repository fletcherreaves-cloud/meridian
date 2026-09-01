// @ts-nocheck
export default {version:'5.307', date:'2026-09-01', changes:[
  'EOM Supervisor Rollup -- fixed a false-positive "FOB missing" warning. The ' +
  '"⚠ No FOB report found for this period" banner and the "○ FOB missing" badge (Inventory ' +
  'Control hub -> Supervisor Rollup tab) were flagging stores that actually have real, current ' +
  'AUTO-pulled FOB data (qsr_fob), whenever that period had no MANUAL FOB upload -- even though ' +
  'the displayed actual $/% figures for that same store (Product Net Sales, Total Food Cost, ' +
  'Food Over Base, Crew Labor) were already correctly falling back to the auto stream and ' +
  'showing real numbers.',
  'Root cause (src/views/eom-supervisor.js, computeStoreEOM): hasFOB was set from `!!fobRow` ' +
  '(the manual ds.fobRows upload) only, never checking `autoFob` (the same fobSnapshotByStore ' +
  '/ ds.qsrFobRows lookup the actual-$ fields already read). hasFOB gates three things at once: ' +
  'the warning banner, the "✓ FOB"/"○ FOB missing" badge, and the rollup\'s stores-to-include ' +
  'filter. Verified live (service-role Supabase read) against 3708/Ardmore-Broadway and ' +
  '5183/Chickasha-So 4th -- both have complete August 2026 qsr_fob rows (31/31 days) driving ' +
  'the real displayed actuals, so the "missing" label was flatly wrong for them.',
  'Fixed the same way at both sites that had this gap: `hasFOB: !!(fobRow || autoFob)` ' +
  '(computeStoreEOM), and the header-level `fobLoaded` flag (only checked ds.fobRows?.length) ' +
  'now also checks ds.qsrFobRows?.length. Grepped every other `fobRow` read in the file -- the ' +
  'actual-$ fields (actSales/actFCPct/actFOBPct/actLaborPct) already OR in autoFob correctly; ' +
  'hasFOB and fobLoaded were the only two call sites with the gap.',
  'New src/__tests__/eom-supervisor-fob-auto-flag.test.js renders the real EOMSupervisorPanel ' +
  'with ds.fobRows empty but ds.qsrFobRows populated for the period, asserting the badge reads ' +
  '"✓ FOB" (not "○ FOB missing") and the header reads "✓ FOB data in session" -- plus a ' +
  'no-false-negative case confirming the banner/badge still correctly read "missing" when ' +
  'NEITHER manual nor auto FOB data exists for the period.',
]};
