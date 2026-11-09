// @ts-nocheck
export default {version:'5.712', date:'2026-11-09', changes:[
  '**🗓 Monthly Projections now actually uses the New Store Launch Planner\'s real ramp numbers '+
  'for a store that hasn\'t opened yet (owner request 2026-11-09, ahead of December projections '+
  'for 44689/Lindsay).** The Launch Planner (`memory/project-new-store-launch-planner.md`) already '+
  'had real, comparable-store-modeled sales sitting in `new_store_launch_plan` for Lindsay '+
  '(60 days, 2026-11-14 → 2027-01-12, covering all of December) — but the forecast engine '+
  '(`forecastDay()`, `src/engine/forecast.js`) had no idea that table existed. Every forecast '+
  'model (AE/EWMA/Simple/DOW/DI) keys off a store\'s own real trailing sales history, which is '+
  'empty for a store that hasn\'t traded yet, so a brand-new store forecast 0 everywhere — '+
  'Monthly Projections, Forecast Accuracy, Store Dashboard, every consumer of `forecastDay()`. '+
  '`forecastDay()` now short-circuits to the launch plan\'s own effective $ (override wins over '+
  'projected, same convention the Launch Planner UI already uses) whenever a store has a real '+
  'plan row for that exact day AND no usable real history otherwise — gated tightly so every '+
  'other store (no launch plan at all) is unaffected, and a store that starts accumulating real '+
  'trading data stops being short-circuited the moment it has real history to forecast from, even '+
  'inside the plan\'s own date window. New eager loader (`loadAllNewStoreLaunchPlans()`) feeds a '+
  '`ds.launchPlanByLoc` index built at app startup alongside `laborRows`. 7 new tests '+
  '(`dispatch-new-store-launch-plan-forecast-2026-11-09.test.js`), full forecast suite unaffected.',
]};
