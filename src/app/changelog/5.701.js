// @ts-nocheck
export default {version:'5.701', date:'2026-11-08', changes:[
  '**The Huddle learns "Memory" and "The Save" from real count-cycle history (task #125/#128, '+
  'owner-directed: "Lets start there and then expand to the others as we can").** The huddle '+
  'note generator now reads each store\'s count-cycle session history (current + prior period) '+
  'and can name two real patterns: a genuine streak of under-90% counts for a class ("Memory" — '+
  'e.g. 3 consecutive Paper counts under 90%), and a streak that just broke ("The Save" — a '+
  'real win, logged to the Recommendation Ledger as `source:\'huddle\'` so the existing grading '+
  'infrastructure has a record of it). Wired into `buildHuddleFacts` as an optional, additive '+
  '`countCycleHighlights` field — every pre-existing caller that omits it gets the exact same '+
  '5-key object as before. All three role voices (GM/Area Supervisor/DO) get one shared '+
  'instruction: treat a streak as a real pattern worth naming, a break as a genuine, specific '+
  'win, never invented or overstated. See `memory/plan-huddle-phase2-2026-11-08.md` and '+
  '`memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md`.',
]};
