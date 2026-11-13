// @ts-nocheck
export default {version:'5.752', date:'2026-11-13', changes:[
  '**Why Engine: cause-to-remedy coaching (Notes 73 #4, part 1).** Every real cause ' +
  '`diagnoseMiss()` can produce — a tagged event, cross-store/regional correlation, weather ' +
  'mismatch, ops drag or outperformance, trend divergence, a new-store missing-LY gap, an ' +
  'isolated store-specific anomaly, or the unexplained fallback — now carries a practical ' +
  '`remedy` line alongside its existing diagnosis, shown as a green "→" line under the cause ' +
  'in both places this renders (Store Dashboard\'s Biggest Miss card, Analytics\' Why Engine ' +
  'miss list). Not "what happened" again — what to actually DO about it: check staffing against ' +
  'punches, recognize a crew that beat a tough day, tag a recurring event, or explicitly "no ' +
  'action needed" for ordinary variance so a manager isn\'t sent chasing noise. Reuses the ' +
  'exact diagnosis the UI already trusted; no new engine, no parallel coaching mechanism. HME ' +
  'Cloud/Squadle pulls (task #105) confirmed live this same day — 24 real hme_dt_daily rows, ' +
  '42 real squadle_checklist_records rows, measured via service-role query. 9 new tests, full ' +
  'suite (7935 tests) and build pass clean.',
]};
