// @ts-nocheck
export default {version:'4.707', date:'2026-07-31', changes:[
  'Historical logging (longitudinal spine): the nightly cron now writes an eom_count_status_history row per store/period — % counted, on-time vs late timing, count duration, the COUNTER NAMES (primary + all), granted exceptions (+ who approved), integrity-flag counts + who they attribute to, and the FOB result. eom_integrity_flags also gains a person column. Backbone for recurring-pattern detection, manager accountability, and SAGE trend queries. Run the new SQL block to activate.',
  'EOM Summary header now reads "6 Locations with uncounted Food/Condiment (9 Items Total)" — location count plus the item total, on screen and in print (owner QW).',
]};
