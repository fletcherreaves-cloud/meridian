// @ts-nocheck
export default {version:'5.700', date:'2026-11-08', changes:[
  '**GM Coaching Letters now name real inventory count near-misses (task #126/#125, owner-'+
  'directed: "Lets start there").** A store\'s most recent count that clearly attempted a real '+
  'cycle but missed full compliance (the exact Holdenville shape task #126 was built around) now '+
  'feeds the coaching-letter prompt directly — real coverage percentages and the specific items '+
  'still not counted (e.g. "Not yet counted: Pour Spouts, Clamshell Boxes"), not a generic '+
  '"finish your count" reminder. Reads from the durable `inv_count_sessions` log, current + '+
  'prior period, so a near-miss just inside a month boundary isn\'t missed. Falls back to no '+
  'block at all when a store has no near-miss on record. Three new pure functions in '+
  '`count-cycle.js` (`classStreak`, `classSave`, `mostRecentNearMiss`) are the shared foundation '+
  'for this and the Huddle "Memory"/"The Save" work that follows — see '+
  '`memory/plan-huddle-phase2-2026-11-08.md` and '+
  '`memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md`.',
]};
