// @ts-nocheck
export default {version:'5.720', date:'2026-11-09', changes:[
  '**🐛 Fix false "red model health" flag on Lindsay (44689)** (owner-spotted via At A Glance '+
  'screenshot the same day). Every other new/sparse-data store (Ponce de Leon 43701, Tishomingo '+
  '43380, Elgin 33222, Mossy Head 37566) has a `recentOnly:true` entry in `DEFAULT_MODEL_'+
  'ASSIGNMENTS` (`constants.js`) that exempts it from `modelHealthScore()`\'s full scoring '+
  'algorithm. 44689 — added this same day, relocated from 18213, backfilled from a single '+
  'owner-provided LifeLenz export — had no entry at all, so the exemption guard never fired and '+
  'a store with one week of history fell into real scoring and predictably came back red. Added '+
  'the missing entry (DOW fallback, `n:0` across the board, `recentOnly:true`, same shape as '+
  'Ponce de Leon\'s) — Lindsay now correctly shows "New Store" instead of a false red flag.',
]};
