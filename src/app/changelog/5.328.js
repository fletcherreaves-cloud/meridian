// @ts-nocheck
export default {version:'5.328', date:'2026-09-02', changes:[
  'Signals: new "🎛️ Store Controls" tab -- the first UI consumer of qsr_store_controls ' +
  '(v5.325 shipped the pull only, this is the promised follow-on view). Real per-store QSRSoft ' +
  'config: loss-prevention thresholds (T-Red before/after $, HALO $/qty, skim $, petty cash, ' +
  'cashless sign limit) in a district-wide table, click-through to a per-store detail card ' +
  '(discount %s by type, tax table, weekday/weekend daypart windows, and the owner\'s own ' +
  'QSRSoft-configured metric targets: DTDA/DTPH/KVST/SSPO/STV/SWC).',
  'Deliberately does NOT overwrite DEFAULT_TARGETS or any Signals grading threshold -- ' +
  'constants.js\'s per-store TARGETS (tRedBPct, tKvst, ...) are Smart-Targets-style performance ' +
  'targets derived from trailing history, a different concept from QSRSoft\'s own RFMControls/ ' +
  'UserDefinedMetrics config (the dollar/qty thresholds QSRSoft itself uses to flag a T-Red, or ' +
  'the manager\'s own KVS-time alert setting). Conflating the two would be a product decision, ' +
  'not a display task -- shown side by side for KVST vs tKvst (the one unambiguous match, same ' +
  'abbreviation/domain), always labeled reference-only.',
  'max_drawer_cash/max_storewide_cash shown as raw numbers, not dollars: live sample values ' +
  '(2 / 10) are implausible as standalone dollar limits, and they don\'t match the separate ' +
  'UserDefinedMetrics.SWC threshold (50, same store) the original finding conflated them with -- ' +
  'a real discrepancy, not resolved here, so shown without asserting a unit.',
  'Full suite (3718 tests) and build both clean (532.99 KB / 850 KB eager budget).',
]};
