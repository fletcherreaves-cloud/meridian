// @ts-nocheck
export default {version:'5.488', date:'2026-10-02', changes:[
  'Visit Readiness: inferred per-store Operations Process-to-Cure tracking, closing the gap ' +
  'memory/finding-pace-midcycle-update-2026-09-15.md flagged -- McDonald\'s exempts restaurants ' +
  'in Process to Cure from the CFV/RGR suspension, but Meridian applied the suspension to every ' +
  'store uniformly for lack of any per-store Cure signal. computeProcessToCureStatus ' +
  '(engine/visit-readiness.js) infers Cure status from qualifying visits already on file -- an ' +
  'Unacceptable RGR/RGR-HealthSafety visit or an EcoSure visit with a cited critical (never a ' +
  'CFV, which "feeds trend" but carries no remediation). 4 qualifying visits (cumulative, no ' +
  'reset window stated in the source document) triggers inCure; 2 within 90 days triggers ' +
  'mandatorySupportVisitDue. No official Process-to-Cure status field exists in any source ' +
  'checked (Propel, PEAK) -- this is an inference from visit scores, stated as such in its own ' +
  'note, and it cannot see egregious-circumstances, refused-access, or admin-determined ' +
  'triggers that never show up as a qualifying visit. A store inferred in Cure now keeps a real ' +
  'readiness score and a "Process to Cure (inferred)" badge instead of the generic "Suspended" ' +
  'pill, even while the district-wide suspension window is active for every other store. ' +
  'Currently zero stores qualify by any pathway -- no visible effect on the live panel today; ' +
  'this is infrastructure for if/when that changes. A manual override for the standard\'s ' +
  'non-visit-based triggers was deliberately not built this pass (org_events\' day-map ' +
  'collapses a null end date to a single day, so it cannot represent an open-ended status ' +
  'cleanly) -- revisit if a real case ever appears. 22 tests ' +
  '(dispatch-process-to-cure-2026-10-02.test.js), including two React-rendering tests on the ' +
  'real VisitReadinessPanel proving the suspension exemption and badge actually render.',
  'Full suite: 5215/5215 tests passing. Build clean, eager payload 555.03 KB gzip (budget 850 ' +
  'KB) -- unchanged from baseline, no new static imports.',
]};
