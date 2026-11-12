// @ts-nocheck
export default {version:'5.742', date:'2026-11-12', changes:[
  '**🐛 Fix: an optional panel toggled on in Panel Manager could vanish from the sidebar, and '+
  'was never findable in search, regardless.** Owner-caught live: "I just toggled District Lens '+
  'to on in Panel Manager but I can’t find it... Also, it did not show up in search." Two '+
  'real bugs, found by reading the actual render paths rather than guessing: (1) the Deep Dive '+
  'sidebar block rendered optional panels (kind:\'optional\', e.g. District Lens, Revenue '+
  'Intelligence, Store Compare) with the SAME betaMode-gated helper as the adjacent Test Kitchen '+
  'items, so the whole optional-panel set disappeared whenever Test Kitchen was hidden '+
  '(betaMode:true) — unrelated categories that should never have shared a visibility switch. '+
  '(2) the sidebar’s search index never read the optional-panel list AT ALL — a stale comment '+
  'claimed it did, but the real code only ever indexed nav + Test Kitchen panels, so every '+
  'optional panel was unreachable from search no matter what Panel Manager said. Both fixed in '+
  '`src/app/shell.js`; 4 new tests pin the exact owner-reported scenario (District Lens on in '+
  'panelVis, Test Kitchen hidden) in both classic and v2 nav styles, plus search positive/negative '+
  'coverage.',
]};
