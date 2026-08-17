// @ts-nocheck
export default {version:'4.505', date:'2026-07-24', changes:[
  'Fix: Weekly Schedule Summary labor % was reading far too high (e.g. a store showing 72% instead of ~24%). The daily labor % is an ACTUAL figure — null on future days and temporarily enormous on the current, partial day (labor has accrued but the day’s sales haven’t landed yet, so a mid-day read can be 400%+). That single partial day was dominating the weekly dollar-weighted average. Now the weekly labor % is dollar-weighted over the completed days only; future/partial/garbage days are dropped and show blank in the daily grid.',
]};
