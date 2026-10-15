// @ts-nocheck
export default {version:'5.571', date:'2026-10-15', changes:[
  'Reports redesign Phase 1 (foundation for the new Reports hub + Custom Report Builder, owner ' +
  'request): reconciled metric-source.js\'s resolution chains with signal-registry.js\'s labeled ' +
  'metric catalog. A full-file audit found the "generic metric resolver" the app would need for ' +
  'a report builder basically already exists (signal-registry.js\'s findMetric/extractMetricValues, ' +
  'built for the Signals Scanner) -- so this phase is real bugfixes + completeness, not a new ' +
  'resolver.',
  'Fixed: 16 loss-prevention metrics (discount/promo/cash-over-short/refunds/overrides/T-Reds $ ' +
  'and counts) had no direction in metric-source.js even though signal-registry.js already ' +
  'declared one for every one of them -- a gap dispatch #77\'s migration left open (it only set ' +
  'direction on the rate/% headline metrics). All 16 now agree on direction:\'lower\' across both ' +
  'files.',
  'Fixed: signal-registry.js declared parkPct/glParkedPct as better:\'lower\', directly ' +
  'contradicting metric-source.js\'s own documented, owner-confirmed ruling that park has no ' +
  'single direction (a real 27-store park%×OEPE quadrant measurement refuted "less parking is ' +
  'always better"). Both now read better:null, matching the ruling -- the exact dispatch #77 ' +
  'class of bug its own header warns against reintroducing.',
  'Added: 21 real, resolvable metric-source.js metrics (projected GC/sales, KVS healthy usage, ' +
  'OT dollars, crew hours, scheduling hour categories, opportunity-cost $/%, sales-per-person-hour, ' +
  'employee/manager meal $ and counts, deposit $) had no signal-registry label at all, so a ' +
  'report-builder metric picker could never have offered them. All 21 now resolve through the ' +
  'exact same AUTO_FIRST_KEY_MAP bridge every other labeled metric already uses -- no second ' +
  'resolution path. Signed-gap metrics (actVsNeed, oppCostDollar/Pct, actVsSched/Opp) got ' +
  'better:null deliberately, not an invented direction.',
  'Added metricRowsForRange()/metricValueForRange() to signal-registry.js -- the one genuinely ' +
  'missing primitive: extractMetricValues() has always returned a metric\'s full loaded history ' +
  '(right for the Scanner\'s correlation sweep, useless for "what was metric X for store Y between ' +
  'date A and B," which is the base operation any report needs). Thin wrappers on top of the ' +
  'existing resolver, not a new one.',
  '75 new tests (direction-agreement + newly-labeled-metric + date-range-resolver coverage), full ' +
  'suite green (614/614 files, 5794/5794 tests), build clean, within budget (563.21 KB eager / ' +
  '850 KB budget). Full research + the 4-phase build plan this lands Phase 1 of: ' +
  'memory/project-reports-redesign.md.',
]};
