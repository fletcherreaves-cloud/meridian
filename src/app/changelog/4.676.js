// @ts-nocheck
export default {version:'4.676', date:'2026-07-31', changes:[
  'New integrity check — RECOUNT SWING: catches a large same-day count-to-count change on one item (the "counted 24, recounted 413" overshoot) even when there are only two counts. A swing this big with no delivery between is exactly where a third count by a different manager should be required before saving — framed as "verify which count was right," never an accusation. Feeds the recap\'s soft "worth a look" note.',
  'EOM recap now lands the actual uncounted items (with $ on hand) right under the FOB line — Food/Condiment counted-early + never-counted and Paper never-counted, time/class-aware (Non-Product omitted, not due today).',
]};
