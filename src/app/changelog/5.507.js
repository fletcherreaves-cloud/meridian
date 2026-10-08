// @ts-nocheck
export default {version:'5.507', date:'2026-10-08', changes:[
  'Home-screen widgets Phase 2: "Visit Readiness" (weakest store, sub-score breakdown, real ' +
  'coaching verdict -- no scoring changes, same engine the Visit Readiness panel uses) and ' +
  '"Tracking to Plan" (hourly/daily/weekly/monthly/YTD $ pacing vs plan -- hourly/daily reuse ' +
  'the exact intraday calc Signals\' LiveOps tab already ships, now extracted into one shared ' +
  'function; weekly/monthly/YTD are newly derived from each store\'s own official monthly $ ' +
  'target since no separately-uploaded weekly/YTD budget exists, with the derivation stated ' +
  'plainly in the widget). Both toggleable via the existing Sections config, same as every ' +
  'other home-screen tile.',
  'Found and routed around a latent bug while building the above: vs-ly.js\'s autoFirstDaily ' +
  'let a stale MANUAL sales row win over a fresher AUTO one for the same date (backwards from ' +
  'the auto-first standing rule) -- the Tracking to Plan widget sources its actual $ totals ' +
  'through metric-source.js\'s already-correct per-day auto-first sourcing instead. The bug ' +
  'itself is NOT fixed here (vs-LY comparisons across the app depend on autoFirstDaily\'s ' +
  'current behavior; fixing it needs its own dedicated audit of every caller).',
]};
