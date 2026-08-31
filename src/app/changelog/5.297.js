// @ts-nocheck
export default {version:'5.297', date:'2026-08-31', changes:[
  'EOM Full report — added a "💵 Cash Controls this period" section, linking cash-controls data ' +
  'to food cost/FOB reporting (owner req, verbatim: "at some point we have to link cash controls ' +
  'to food cost and report that as well"). Shows store-level discount % of net sales (the direct ' +
  'FOB-math link -- FOB% = food$ ÷ sales$, so heavy discounting shrinks the denominator and can ' +
  'inflate FOB% without food cost itself rising), cash over/short $, POS overrides $, refunds $, ' +
  'and T-Reds before → after (count + %). Sourced via metric-source.js\'s auto-first per-day ' +
  'helpers (metricSeries for period sums, metricSumRatio for the true Σ/Σ ratios -- avoids the ' +
  'mean-of-daily distortion an in-progress "today" would otherwise cause on a still-open EOM ' +
  'period), never by filtering ctrlRows/cashRows/glimpseRows directly.',
  'Deliberately STORE-LEVEL only -- never a register number or an employee name. Scoped after ' +
  'reviewing a CoachQ competitor sample report that named specific cashiers by drawer number; ' +
  'owner\'s own framing: "generalize it and point managers to research further to identify the ' +
  'person responsible by using the register audit report and managing cash controls on the ' +
  'floor." The existing Register Audit report (src/utils/register-audit.js, store-analytics.js) ' +
  'already does per-employee attribution BY DESIGN (dispatch #200 removed its redaction gate on ' +
  'purpose) -- this new section points there for the person-level dig-in instead of duplicating ' +
  'or re-deriving it. manualRefAmt deliberately excluded from the refunds total, since its own ' +
  'METRIC_SOURCES chain can fall back to the per-employee auditRows table.',
  'Full report only (not Recap, not the new Housekeeping view) -- gated on real signal (near-zero ' +
  'individual lines are omitted, section itself is skipped when there\'s nothing to show).',
]};
