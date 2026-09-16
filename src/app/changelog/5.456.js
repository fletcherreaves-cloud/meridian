// @ts-nocheck
export default {version:'5.456', date:'2026-09-16', changes:[
  'White-alpha token adoption sweep (Task #71): converted the deferred background/color-role ' +
  'half of #296\'s bug class -- hardcoded rgba(255,255,255,X) values that render invisible or ' +
  'low-contrast on the light themes (white-alpha over a light surface composites to the same ' +
  'pixel at every alpha). 192 of 232 real remaining sites converted to var(--surf2)/' +
  'var(--surf3)/var(--bdr) tokens across 29 files (analytics.js, at-a-glance.js, scheduling.js, ' +
  'inventory.js, labor-tools.js, signals.js, sage.js, morning-brief.js, store-dash.js, ' +
  'store-analytics.js, and 19 more).',
  'signals.js\'s module-level surf2/bdr consts (a hand-rolled pseudo-token pair reused across ' +
  '~50 call sites in that one file) were fixed at the source -- aliased to the real var(--surf2)/' +
  'var(--bdr) -- so far more than the 10 directly-matched sites in that file actually got fixed.',
  '40 sites deliberately left literal, each individually justified: standalone HTML-export ' +
  'template strings (analytics.js\'s Anomaly Report, inventory.js\'s two reports, ' +
  'scheduling-deck.js\'s slide deck, morning-brief.js\'s emailed brief -- none load meridian.css, ' +
  'so a CSS var would not resolve there) and Chart.js canvas config literals (store-dash.js/ ' +
  'dt-speedofservice.js radar charts -- no getComputedStyle precedent to resolve a CSS var at ' +
  'config-build time). Ratchet CEILING lowered 241 → 40 to match.',
  'Full suite 522/522 files, 4997/4997 tests. Build clean, eager payload 550.56 KB / 850 KB -- ' +
  'noise-level change, exactly as expected for a pure string-literal token swap with zero new ' +
  'imports.',
]};
