// @ts-nocheck
export default {version:'5.273', date:'2026-08-30', changes:[
  'Dispatch #227 -- three new EOM report tabs in the Inventory Control hub, all owner-requested ' +
  'in one back-to-back burst: **Missing Items** (district-wide missing/uncounted items, sorted by ' +
  'location then class, with last-count date and a plain-language recommendation per row), ' +
  '**Team Snapshot** (the Scoreboard tab\'s own Store/State/Count%/FOB%/FOB$ columns, with ' +
  'Diagnosis/Communication dropped -- a read-only view to hand or print for a store team, with a ' +
  'dollar-weighted FOB chip strip rolled up to whatever\'s in scope), and **Recount Impact** ' +
  '(every item recounted in the EOM close window, sorted by class, with a plain-language ' +
  '"helped: corrected a $X undercount" / "hurt: moved further from expected usage" verdict).' +
  '\n\n' +
  'All three are pure presentation over data this hub already computes -- no new pulls, no second ' +
  'diagnosis run, no second grading of helped/hurt. Missing Items reuses `rows[].uncountedByClass` ' +
  '(the SAME diagnoseIncompleteCount() call the Scoreboard/EOM Count tabs already make per store) ' +
  'and a new recommendationForState() helper carrying buildIncompleteCountMessage()\'s own proven ' +
  'never/early/stale phrasing. Team Snapshot reads a new scoreboardRowFields() helper ' +
  '(eom-inventory.js) that the Scoreboard tab\'s own CSV export now also calls, so the two views ' +
  'can never drift on these 5 numbers. Recount Impact reuses ledgerBaselineDiff()/' +
  'itemCloseWindowRecount() (eom-ledger-baseline.js) -- the SAME engine dispatch #226\'s SAGE tool ' +
  '(query_eom_recount_impact) was asked to reuse; #226 had not merged to main as of this dispatch ' +
  '(only its doc commit was live), so there was no shared formatting helper yet to point at -- a ' +
  'new recountVerdictText() lives in eom-ledger-baseline.js itself for exactly that reason, so a ' +
  'later dedup pass has one place to look. Chip style: FobStripLite\'s percent-primary convention ' +
  '(matching the EOM Share view\'s plain, printable purpose), not the older $-primary FobStrip.' +
  '\n\n' +
  'Print: all three reuse eom-supervisor.js\'s PRINT_STYLE verbatim (now exported), plus a new ' +
  'ensureEomPrintStyleInjected() so whichever tab mounts first injects the one shared <style> tag ' +
  '-- same class hooks, same body.eom-printing scoping, no second print mechanism.' +
  '\n\n' +
  'New tests render the real EOMDashboardPanel -> tab-click -> report-panel chain (not the engine ' +
  'functions in isolation), including a two-panels-disagree guard proving Team Snapshot\'s FOB $ ' +
  'matches the EOM Count tab\'s own number for the same store, and a dollar-weighted-vs-averaged ' +
  'rollup check. Gzip eager payload: 527.58 KB (baseline 527.31 KB, budget 850 KB).'
]};
