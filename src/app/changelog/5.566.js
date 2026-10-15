// @ts-nocheck
export default {version:'5.566', date:'2026-10-15', changes:[
  'Store Dashboard -- the Food Cost and Labor & Scheduling cockpit tabs\' "COACH" callout boxes ' +
  'now carry a "🎯 Coach" button (owner, live, 2026-10-14, looking at the Food Cost tab\'s COACH ' +
  'box: "great opportunity to wire this to add to coaching as well. Along with any other like ' +
  'items"). Previously a GM-facing coaching finding (FOB % variance driver, Crew Labor % drift) ' +
  'was diagnosis-only -- starting an actual coaching cycle meant leaving the store tab and finding ' +
  'the same store again in Patch Heatmap.',
  'VerdictBand() (store-cockpit.js) takes an optional 4th "action" node, rendered inline next to ' +
  'the verdict text. The two existing VerdictBand(\'Coach\', ...) call sites -- Food Cost\'s ' +
  'fob_total_pct and Labor\'s labor_pct -- are the only ones in the file (grepped, not guessed), ' +
  'so both and only both got the button.',
  'New CoachThisButton component opens the SAME CoachingModal (mode:\'start\') Patch Heatmap\'s own ' +
  '"Coach this" already uses, pre-filled with this store\'s loc and the right metric key -- no new ' +
  'modal, no new write path, just a second, more contextual entry point into #208/v5.564\'s ' +
  'existing cycle-start flow (including its backdating date field).',
  'onCoachingSaved threaded App.js -> StoreDash -> FoodCostCockpitTab/LaborCockpitTab, so starting ' +
  'a cycle from the cockpit refreshes the Needs Attention panel\'s Open Coaching section (v5.565) ' +
  'the same way starting one from Patch Heatmap already does.',
  '3 new tests (store-cockpit-coach-button.test.js) rendering the real exported tabs, not a mock ' +
  'of VerdictBand/CoachThisButton in isolation -- a test that only checked those in isolation ' +
  'could not tell "wired into the real tab" from "built but never connected." Covers both tabs\' ' +
  'buttons opening the modal with the right metric, plus a no-crash/no-button regression guard ' +
  'during the loading state. Full suite green (606/606 files, 5661/5661 tests), npm run build ' +
  'clean, within the entry-chunk budget.',
]};
