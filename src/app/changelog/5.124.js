// @ts-nocheck
export default {version:'5.124', date:'2026-08-23', changes:[
  'Opportunity $ v1 -- the flagship: every performance gap (Labor, Food/FOB, GC/Sales) '
  + 'converted to recoverable dollars vs each store\'s own target, ranked biggest-$ first. '
  + 'memory/design-opportunity-dollars.md has been fully specified since 2026-07-27; this ships '
  + "it. Turned out the pure 3-pillar engine already existed and was already shipped -- "
  + 'engine/opportunity.js, built for the Leadership One-Pager (v4.549-v4.581) -- so this build '
  + "was 'wire a district-wide adapter + headline tile + drill-down + Attention Now feed onto an "
  + "existing, already-tested engine,' not a from-scratch build. Confirmed that by reading the "
  + 'engine\'s own git history before writing a line, rather than duplicating it.\n\n'
  + '1) engine/opportunity-district.js: MTD + trailing-6mo window builders, and '
  + 'districtOpportunity() wiring buildOnePagerInputs() -> computeOpportunity() -> '
  + 'rankByOpportunity() for any locs/range -- reused One-Pager\'s existing ds-adapter directly '
  + "(it was already generic over locs/range despite its name, not week-specific) rather than "
  + 'writing a second one. 2) At-A-Glance headline tile: "$X recoverable this month," MTD, all '
  + 'stores, click opens the drill-down. 3) Opportunity $ drill-down panel (Test Kitchen, '
  + 'section: analytics): MTD/trailing-6mo toggle, by-driver breakdown, by-store ranking, the '
  + 'same pill-style LocationSelector every other panel uses. 4) opportunityAlerts in '
  + 'engine/attention-feed.js: one cross-domain item per store combining all 3 pillars into a '
  + 'single $ figure for Attention Now -- deliberately separate from the existing FOB-only '
  + 'fobOutliers/fobOverTarget detectors, not a duplicate of either.\n\n'
  + 'Every pillar floors at $0 (beating target is $0 opportunity, never a negative "credit"), '
  + 'dollar-weighted throughout (Σ$ ÷ Σsales, never average-of-averages), methodology stated '
  + 'in-UI. 4 new/extended test files (opportunity-district.js wiring, the new attention-feed '
  + 'detector, and a render test against the ACTUAL panel component per this repo\'s '
  + 'revert-sensitive bar -- confirmed by temporarily breaking the window toggle and watching it '
  + 'fail) + the Test Kitchen census ratchet bumped 12->13 (shell-nav-snapshot.test.js) for the '
  + 'new panel. 2129/2129 tests passing, build clean, no entry-chunk impact (the panel and its '
  + 'district tile both live in already-lazy chunks). Full writeup: '
  + 'memory/design-opportunity-dollars.md.',
]};
