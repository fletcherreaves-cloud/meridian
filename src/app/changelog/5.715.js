// @ts-nocheck
export default {version:'5.715', date:'2026-11-09', changes:[
  '**📆 FY Year rail card is live (owner-directed 2026-11-09: "Noticing on Projection Workspace '+
  'that FY Year are still greyed out as not yet available. Need to remedy this soon so i can '+
  'properly forecast next year").** The real work was never missing — the Yearly Targets panel '+
  '(`src/views/yearly-projections.js`, Planning Hub\'s Yearly tab) has existed since dispatch #61. '+
  'What was missing was the link: Projection Workspace\'s "📆 FY Year" rail card was a disabled, '+
  '45%-opacity placeholder with no click handler. It now opens Yearly Targets directly — same '+
  'destination and permission (`analytics.store`) the app\'s own `modal===\'yearly-proj\'` nav '+
  'already uses elsewhere, just reachable from inside Projection Workspace too. Deliberately NOT '+
  'wired as a third `railSelected` state alongside Week/Month (which drive this SAME panel\'s own '+
  'body) — a year\'s worth of targets already lives in its own real panel, so this is an honest '+
  'nav-away action (➜ icon, "Open Yearly Targets →" label), not a fake in-place yearly forecast.',
]};
