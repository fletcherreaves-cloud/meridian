// @ts-nocheck
export default {version:'5.711', date:'2026-11-09', changes:[
  '**🗓 Count Cycle now recognizes a real, substantial Food+Condiment count as "the weekly '+
  'count," even when it finishes across 2-4 days or misses the exact 100% bar (owner-directed '+
  '2026-11-09) — fixing a false "no complete count on record" at 15+ stores.** Re-measuring the '+
  'batch that followed the Condiment "(Deactivated)" fix (Seminole, Madill, Durant, Ardmore-'+
  'Broadway, OKC-I240, and more) found every one had the SAME shape: a real, substantial count '+
  'on one date, plus a handful of make-up/correction items landing 1-4 days later — normal crew '+
  'behavior, not a data problem (the On-Hand pull itself was independently re-confirmed current '+
  'for all of them). Requiring every item on one exact calendar date made every one of those '+
  'real counts invisible, reading as critical "go count now" alerts. Owner\'s framing: "we need '+
  'to be ok with dropping the 100% requirement, at least as it pertains to determining a count '+
  'status... acknowledge the count for what it is. An attempt to count... but a count '+
  'nonetheless that should be recognized." `cycleCompliance()`\'s overdue/weekly-overdue gate '+
  'now also qualifies on a genuine count ATTEMPT (Food+Condiment both touched, real session '+
  'volume) — not just the exact 100% bar. The 100% coverage check is NOT removed: it still '+
  'drives a "verify what\'s left" nudge (`weekly-incomplete`, unchanged severity) whenever a '+
  'real attempt falls short — Bonifay\'s genuine 2-item gap (mustard packets, bulk sugar, never '+
  'recounted since October) still surfaces exactly as before, just correctly distinguished from '+
  'a store that simply hasn\'t counted at all. 6 new/updated tests in `count-cycle.js`\'s suite.',
]};
