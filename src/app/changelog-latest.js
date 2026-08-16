// @ts-nocheck
// #230 — the ONE changelog entry App.js needs synchronously: the latest version+date, for the
// footer text ('Meridian. v'+MERIDIAN_VERSION) and window.__MERIDIAN_VERSION__. Deliberately
// standalone — does NOT import from changelog-data.js, and is not imported by it — so App.js's
// static import of this file stays tiny regardless of how large the full changelog grows. The
// full history (including this same entry, duplicated) lives in changelog-data.js, read only by
// the lazy-loaded changelog-panel.js. See changelog-data.js's header for why the two must not
// share a module. Keeping this in sync with changelog-data.js's newest entry is mechanical —
// update both in the same commit — and guarded by src/__tests__/changelog-version.test.js.
export const LATEST_CHANGELOG_ENTRY = {version:'5.029', date:'2026-08-16', changes:[
  'Issue #348 -- Scheduling (Opportunity) and Schedule Summary computed Scheduled/Forecast hours and Labor % from the same schedRows with different formulas, and disagreed. Opportunity\'s private formula omitted Floor hours from both hour totals and read the wrong field (needVLH instead of projVLH) for the forecast leg, plus a plain unweighted/unbanded mean for Labor % that let one partial-day 400%+ reading dominate a 7-day average. Real reproduction, Duncan (0029760) week of Aug 12: Need 705 vs correct 1541, Scheduled 2204 vs 2329, Labor % 655.24% vs 23.35% -- pulled directly from lifelenz_schedule.\n\nFix: schedHrsOf / fcstHrsOf / normLaborPct exported from engine/schedule-summary.js and imported into scheduling.js -- one definition, not three patched lines. wAvgLaborPct now also runs each day through normLaborPct\'s 3-70% band before dollar-weighting. distTot and scheduling-deck.js read straight through the corrected totals, no separate fix needed there.\n\nRegression test uses the real Duncan/Aug-12 rows, reproduces the OLD formulas inline, and was confirmed to go red against a stash of the pre-fix code before being restored.\n\n1393/1393 tests pass (3 new), build clean (507.68 KB gzip eager, 342.32 KB headroom).',
  ]};
