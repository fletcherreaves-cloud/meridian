// @ts-nocheck
export default {version:'5.598', date:'2026-11-01', changes:[
  '**Fix: EOM Supervisor Rollup "$ Amount" row was shading 5 boxes when `totalShaded` only sums ' +
  '3 of them.** Total Food Cost and OT $ were colored with the same red/amber/green scale as ' +
  'Food Over Base, Crew Labor, and Op Supplies, even though neither dollar figure is folded into ' +
  '"Total of Shaded Boxes" (owner directive, 2026-08-04 — that formula only ever summed those ' +
  'three). The math was already right; the visual was not, and five colored boxes reasonably ' +
  'read as "all five count." Total Food Cost and OT $ now render in the neutral muted color in ' +
  'both the live panel and the printed report, on every store card and the aggregate rollup card ' +
  '(single shared implementation in src/views/eom-supervisor.js).',
]};
