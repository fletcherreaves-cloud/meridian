// @ts-nocheck
export default {version:'5.835', date:'2026-11-20', changes:[
  '**Egress reduction: decided the fate of the stale `peaks_rows` eager load — converted to ' +
  'lazy-fill, not left alone and not ripped out.** Audited every real consumer first (dispatch16\'s ' +
  'own "measure it" rule): the manual "3 Peaks" upload stopped 2026-06-30, so the unconditional ' +
  '15,612-row fetch on every login was returning data that every recency-filtered reader ' +
  '(morning-brief.js\'s 8-week norms, revenue-opportunity.js\'s daypart erosion) already silently ' +
  'treated as empty — zero functional benefit, paid for on every single login regardless. But a ' +
  'few consumers do a plain "any row for this loc" check with no recency filter (graded-visits.js\'s ' +
  'historical visit context, store-dash.js/store-analytics.js\'s 3-Peaks tab + "file loaded but ' +
  'store not found" messaging) — for those, outright deletion would have been a real, silent data ' +
  'loss the first time someone opened an old graded visit. ' +
  'peaksSvcRows/peaksSalesRows now join LAZY_FILL_SOURCES (same mechanism `auditRows`/`wasteRows`/' +
  '`pmixRows`/`qsrSalesQtrHourRows` already use) — both share one `loadPeaksRows()` fetch, split ' +
  'by `_peakSvc`, so triggering either doesn\'t double-fetch. Every real consumer now calls ' +
  '`ensureLazyFill()` on open (graded-visits.js, store-dash.js\'s PeaksTab + autoFirstPeaks, ' +
  'store-analytics.js\'s ShiftAnalysisTab + RevenueIntelligence, analytics.js\'s coverage strip) ' +
  'or defensively (morning-brief.js, forecast.js\'s daypart engine — already no-ops today, this ' +
  'just means they start working again on their own, no code change needed, the day uploads ' +
  'resume). Manual-upload save path (`savePeaksRows`) is untouched. ' +
  'Second half of the same session\'s audit (ops_rows/ctrl_rows) found the opposite verdict: the ' +
  'real consumer set is far wider than first measured — at least a dozen files including ' +
  'At-A-Glance (the login-time default view) and Smart Targets\' production model (which reads up ' +
  'to 2 years back) — so no safe quick lazy-fill exists there without first migrating those raw ' +
  'readers onto metric-source.js\'s resolver, a separate, larger project. Left eager, unchanged. ' +
  'See `memory/plan-egress-reduction-2026-11-20.md` for both findings in full.',
]};
