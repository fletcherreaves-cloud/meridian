// @ts-nocheck
export default {version:'5.405', date:'2026-09-08', changes:[
  'Fixed a real, live-confirmed bug: the At A Glance "Items Recounted" tile missed a same-item ' +
  'recount when a bad weekly count got fully redone the next day. Found live: Madill (loc 13113) ' +
  'counted weekly on 2026-09-07 (Food 59/114, Condiment 8/37 -- ~7% FOB, a real Partial) and fully ' +
  'recounted on 2026-09-08 (Food 114/114, Condiment 37/38 -- clears Weekly). qsr_onhand upserts on ' +
  '(loc, period, wrin), so by the time it was re-pulled every touched item showed ONLY 09-08 -- ' +
  'the 09-07 date had been overwritten in place, and the recount tile had nothing left to diff ' +
  'against.',
  'inv_count_sessions (an append-only per-store/count-date/class log, already written daily by ' +
  'the on-hand pull script) had BOTH dates preserved as distinct rows the whole time -- it was ' +
  'built for exactly this, but nothing in the app ever read it. count-cycle.js now has ' +
  'sessionsFromLog()/cycleComplianceFromLog()/weeklyRecountWindowsFromLog(), and the tile prefers ' +
  'the log over the live onhand snapshot (onhand stays as a per-store fallback).',
  'Also fixed the window-anchor logic itself: it only ever looked FORWARD from the completed ' +
  'session\'s own date. It now walks backward through any immediately-preceding session within ' +
  'windowDays, so a tight cluster of close-together counts (bad count + quick redo) reads as one ' +
  'cycle -- without reopening the original problem windowDays exists to prevent (a genuinely ' +
  'routine weekly count ~7 days later still gets its own fresh window, not a false "recount").',
  '7 new/changed regression tests using the real captured Madill numbers (count-cycle.test.js, ' +
  'at-a-glance-weekly-recount-tile.test.js). Full suite 4639/4639, build clean, 538.08 KB / 850 KB ' +
  'budget. Full writeup: memory/finding-recount-window-onhand-overwrite-2026-09-08.md.',
]};
