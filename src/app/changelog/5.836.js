// @ts-nocheck
export default {version:'5.836', date:'2026-11-20', changes:[
  '**Bonifay (loc 10034): confirmed and acted on the Hardee\'s reopening impact.** A `comp_new` event ' +
  '(Hardee\'s reopened 2026-09-22 at 2111 S Waukesha St) was already logged in `org_events` on ' +
  '2026-11-17, flagged "Estimated" pending the impact review its own note called for. That review is ' +
  'now done, against real `qsr_daily_activity_rollup` data: a real, sustained structural break starts ' +
  'Mon 2026-09-21 (one day before the logged reopen date) -- every day from the 21st on reads negative ' +
  'vs LY, none before it did. Pre-break (Jun1-Sep20, 112 days): sales +3.5% / transactions +0.5% vs LY ' +
  '-- healthy. Post-break (Sep21-Nov17, 58 days): sales -11.0% / transactions -14.5% vs LY -- ' +
  'transactions fell MORE than sales, consistent with real guest-count diversion (traffic loss), not a ' +
  'pricing/mix shift. October actual ($296,956) missed its pre-break-baseline target ($388,342) by ' +
  '-23.5%. The `org_events` row\'s `verification` is now "Confirmed" (was "Estimated") with the full ' +
  'measurement in its note. ' +
  'Two corrective actions taken: (1) `monthly_targets` for Bonifay Nov/Dec 2026 corrected to $263,151 / ' +
  '$288,150 (post-break trailing daily rate x matched-LY seasonal shape -- same method the district\'s ' +
  'proven "simple" trailing model already uses, not a re-use of the stale pre-break baseline; ' +
  '`data_source: "corrected_post_hardees_opening_2026-09-21"`); (2) `DEFAULT_MODEL_ASSIGNMENTS`\' note ' +
  'for loc 10034 (`constants.js`) flagged for recalibration -- its Sep2025-May2026 backtest predates the ' +
  'break, and DI\'s own live bias (from `forecast_snapshots`) flipped from -3.8% pre-break to +13.4% ' +
  'post-break, not yet self-corrected despite being well past its own 14/28/42-day EWMA windows. ' +
  'Re-run the Model Assignment backtest for this store once there\'s 90+ days of post-break history ' +
  '(~2026-12-20+). Full suite (8450 tests) + build both clean.',
]};
