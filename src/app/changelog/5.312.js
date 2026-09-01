// @ts-nocheck
export default {version:'5.312', date:'2026-09-01', changes:[
  'EOM Supervisor Rollup -- "$ Amount" row now reconciles exactly with the +/- % shown right ' +
  'above it (owner report, screenshot: Total Food Cost showed Projection 27.50%, Actual 27.52%, ' +
  '+/- "+0.02%", but $ Amount read $135.02 -- not reproducible by hand as "+0.02% x actual ' +
  'sales" ($123.37) or "x projected sales" ($133.63) either). The base was already correct -- ' +
  'src/views/eom-supervisor.js\'s refSales already preferred actual sales, falling back to ' +
  'projected only when actual is missing. The bug was PRECISION: the $ Amount multiply used the ' +
  'FULL-PRECISION unrounded (actual% - projected%) float, while the +/- row above it only ever ' +
  'displayed that float rounded to 2 decimals -- a raw ~0.0219% diff rounds to "+0.02%" on ' +
  'screen but produces $135.02 when multiplied by the full, un-rounded actual sales figure, a ' +
  'number nobody could reconstruct from what the panel actually shows.',
  'Fix: round the %-point diff to the SAME 0.01-percentage-point precision the +/- row displays ' +
  'BEFORE multiplying by refSales, and reuse that identical rounded value for both the +/- % ' +
  'cell and the $ Amount multiply -- so "displayed % x displayed sales" always reproduces the ' +
  'displayed $ exactly. Applies to all three %-based columns (Total Food Cost, Food Over Base, ' +
  'Crew Labor) in computeStoreEOM, and to the rollup card\'s own +/- % display in computeRollup ' +
  '(display-consistency only -- the rollup\'s $ Amount was already correctly a SUM of each ' +
  'store\'s own already-fixed $ figures, not a separate recompute, so it needed no change beyond ' +
  'inheriting the per-store fix).',
  'Second bug found in the same pass (the owner\'s "fix ... rollups as well" flagged exactly ' +
  'this): the Crew Labor "$ Amount" cell read data.laborVar$ directly, but computeRollup() never ' +
  'set that field on the rollup object -- only laborAdjAmt, which holds the identical value at ' +
  'the per-store level (`const laborAdjAmt = laborVar$` in computeStoreEOM). So the rollup ' +
  'card\'s Crew Labor $ Amount always rendered "--", regardless of everything else, while every ' +
  'per-store card worked fine. Fixed by reading laborAdjAmt uniformly (already present, and ' +
  'already equal, on both store and rollup objects) instead of data.laborVar$.',
  'Print: Supervisor Rollup was the one EOM report tab dispatch #227\'s 9ba5140 (2026-08-31) ' +
  'deliberately left on the old, unreliable in-place body.eom-printing + window.print() ' +
  'mechanism when it migrated Missing Items / Recount Impact / Team Snapshot / Count Swings onto ' +
  'openPrintWindow() -- its own forPrint flag did more than gate a banner (also expanded every ' +
  'row, swapped editable cells for plain text) and had never been confirmed broken at the time. ' +
  'Owner-flagged 2026-09-01: it was broken the same way (reproducibly blank). Migrated onto the ' +
  'SAME isolated openPrintWindow() mechanism via a new formatSupervisorHtml() (pure HTML-string ' +
  'export, same shape as formatMissingItemsHtml/formatRecountImpactHtml), reusing the identical ' +
  'row-value formatters and color helpers the live table uses so print numbers can never drift ' +
  'from the screen. PRINT_STYLE and PrintGeneratingBanner removed entirely -- once Supervisor ' +
  'Rollup stopped using them they had zero remaining callers app-wide (mirrors 9ba5140\'s own ' +
  'removal of ensureEomPrintStyleInjected for the same reason).',
  'Tests: eom-supervisor-dollar-amount-reconciles.test.js (new) -- renders the real ' +
  'EOMSupervisorPanel and confirms Total Food Cost/Food Over Base/Crew Labor $ Amount = displayed ' +
  '+/- % x actual sales for all three columns, at the rollup level (catches both bugs above). ' +
  'eom-supervisor-print-migration.test.js (new) -- mirrors dispatch-227-eom-reports.test.js\'s own ' +
  'pattern: clicks the real Print button, confirms openPrintWindow/window.open receives the real ' +
  'report content (including the $123.37 fix) and that no trace of the old body.eom-printing ' +
  'mechanism remains. dispatch-227-print-bug-repro.test.js (obsolete, deleted) -- its entire ' +
  'subject was Supervisor Rollup\'s now-removed old print mechanism. Full suite 360/360 files, ' +
  '3649/3649 tests; build clean, 530.84 KB gzip eager payload (850 KB budget, unaffected shape).',
]};
