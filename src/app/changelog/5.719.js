// @ts-nocheck
export default {version:'5.719', date:'2026-11-09', changes:[
  '**🏁 Shift Scoreboard now reachable from any altitude\'s store deep-dive** (owner request '+
  '2026-11-09 — "pass the scoreboard to view to all levels upwards when they deep dive their '+
  'stores"). Shift Scoreboard (task #122) was only ever reachable through Curated Home\'s own '+
  'format picker, gated to altitude===\'store\' — so a district, patch, or supervisor altitude '+
  'drilling into one specific store (Store Dashboard) had no path to it at all. Added a new '+
  '"🏁 Shift Scoreboard" tab to Store Dashboard (`src/views/store-analytics.js`), distinct from '+
  'the pre-existing "⏱ Shift Analysis" tab — reusing the real `ShiftScoreboardFormat` component '+
  'directly rather than re-implementing it, since it already takes a plain `{ds, loc, '+
  'storeName}`. Store Dashboard is the one per-store page every altitude\'s "click a store" '+
  'drill-down already lands on and carries no role gating of its own, so this reaches every '+
  'altitude by construction rather than by listing roles.',
]};
