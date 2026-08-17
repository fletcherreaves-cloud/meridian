// @ts-nocheck
export default {version:'4.529', date:'2026-07-24', changes:[
  'Under the hood: the "current vs last year" math (auto-first sourcing + matched-day comparison) is now ONE shared helper (engine/vs-ly.js) instead of being re-written separately in each panel — which is exactly why the vs-LY bug kept reappearing in different places. Org Summary and Rankings now call the shared helper; future changes are global. Covered by its own tests.',
]};
