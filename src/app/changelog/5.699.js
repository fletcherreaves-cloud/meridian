// @ts-nocheck
export default {version:'5.699', date:'2026-11-08', changes:[
  '**Count Cycle: all-inclusive identification, no volume floor (task #126, owner-directed).** '+
  'Yesterday\'s Cycle-Attempt identification still required a class to be touched past a '+
  '25-item floor (or, for an EOM attempt, the whole session past 50 items) before it earned a '+
  'real percentage instead of a vague "Partial"/"Spot check" bucket. Owner: "It really should '+
  'be all inclusive. That\'s the only true measure... All items must be accounted for." Both '+
  'floors are gone from identification — any real touch (even 1 item) now gets its own honest '+
  'percentage, no minimum session size required. (The SAME 25-item floor stays exactly where '+
  'it already was for a separate, untouched purpose — the overdue/incomplete alert logic that '+
  'tells a GM "count Food and Condiment this week.") The Count Cycle class chip itself now '+
  'shows the real percentage inline, not just in the hover tooltip, and the tooltip\'s missing-'+
  'item list is no longer capped at 10 — every uncounted item is named, every time.',
]};
