// @ts-nocheck
export default {version:'5.430', date:'2026-09-11', changes:[
  'Visit Readiness -- CFV & RGR graded visits suspended by McDonald\'s through year-end ' +
  '(owner-notified 2026-09-11, effective 09/15/26). The readiness composite (Speed/Accuracy/ ' +
  'Quality/Leadership) predicts CFV/RGRV standards specifically -- EcoSure\'s own criteria are ' +
  'already excluded from it -- so there is no separate CFV-only/RGR-only score to hide instead: ' +
  'while the suspension is active, the whole per-store readiness score/band is replaced with a ' +
  'neutral "Suspended -- no visit scheduled" state (both on-screen and in the printed coaching ' +
  'report + audit report), so nobody coaches a store toward a graded visit that is not happening. ' +
  'EcoSure and the Waste & variance flag are unaffected either way -- neither was ever part of the ' +
  'CFV/RGR composite. Diagnostic depth (topDrivers, the calibration audit, sub-area scores) stays ' +
  'fully reachable per the standing "voice by role" rule -- only the visit-specific headline ' +
  'changes. New `VISIT_SUSPENSIONS` list + `activeVisitSuspension()` in ' +
  'src/engine/visit-readiness.js -- list-shaped so a future suspension or resumption is one new ' +
  'entry, never a rewrite of the date-window logic.',
  '9 new tests (dispatch-visit-suspension-cfv-rgr-2026-09.test.js): pure date-window boundary ' +
  'checks on activeVisitSuspension(), computeVisitReadiness()\'s suspension field, and the ACTUAL ' +
  'VisitReadinessPanel rendered with the system clock faked into (and before) the suspension ' +
  'window -- 8 of 9 confirmed to fail against pre-fix code.',
  'Full suite 504/504 files, build clean, 541.47 KB / 850 KB eager-payload budget.',
]};
