// @ts-nocheck
export default {version:'5.723', date:'2026-11-10', changes:[
  '**🛡 Security panel: Phase 1 of the Health/Briefing redesign — a real score, a district '+
  'grid, and narrative incident cards, built on the data that went live this week '+
  '(`qsr_security_events`, EVENT-001/002/003, case tracking).** Two design concepts the owner '+
  'commissioned ("The Loss Prevention Briefing," "Security Health Dashboard") finally get a '+
  'real, working first slice rather than staying mockups: a new 🩺 Briefing view (toggle next '+
  'to the existing 🗂 Table, which stays the default — see below for why) adds a district '+
  'health-score grid (tap a store to focus) and severity-striped, headline-first cards per '+
  'flagged signal — plain-English decision sentence, a who/what/where/window fact strip, a '+
  '"Rule out first" drawer pulling the rule\'s own real `false_positives`, a "Show the math" '+
  'drawer with the real value/threshold/baseline numbers, and the same case-tracking buttons '+
  '(Mark investigated / Escalate) the Table view already has.',
  '**The score itself (`src/engine/security-health.js`) is deliberately the minimal half of the '+
  'owner\'s own two-phase scoring model** — `severity × magnitude`, summed per store, with '+
  '"dollar exposure" honestly swapped for a real z-score/ratio magnitude (no dollar-weighting '+
  'convention exists anywhere in this codebase — checked, not assumed) and '+
  '`persistence`/`convergence` multipliers left for a later phase, since those need multi-window '+
  'trend history this slice doesn\'t touch. A real data-quality guard routes any finding whose '+
  'baseline population is too thin (below the same `MIN_BASELINE_N` floor the rules engine '+
  'itself z-scores against) to a separate "insufficient data" count, never blended into the '+
  'score. Verified against real rows pulled live from this project\'s own Supabase (a real '+
  'INV-003/LABOR-001 finding, not a synthetic fixture) before any test was written.',
  '18 new engine tests (`security-health.test.js`) + 6 new panel-level tests rendering the real '+
  '`SecurityPanel` component (district grid ranking + click-to-filter, decision-sentence '+
  'rendering, both drawers, case tracking) — the "would this verification still pass if '+
  'reverted" bar, not just the engine in isolation. Briefing defaults OFF (Table stays the '+
  'landing view) specifically so this panel\'s existing 128-test Table-view coverage — real, '+
  'still-correct behavior — needed zero rewrites; flipping the default is next phase\'s call, '+
  'informed by actual use. Full suite + build both pass clean; this panel is already lazy-'+
  'loaded, so its growth doesn\'t touch the eager-payload budget at all.',
]};
