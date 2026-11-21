// @ts-nocheck
export default {version:'5.845', date:'2026-11-21', changes:[
  '**Fixed: the Morning Intelligence Brief could silently snap a manually-picked date back to ' +
  'an older one.** Owner report: "viewing yesterday\'s results is still showing 2 days ago ' +
  'actuals." Root cause: `MorningBriefPanel`\'s "re-sync date if `ds` changes" effect called ' +
  '`setBriefDate(getLatestBriefDate(ds))` UNCONDITIONALLY on every `ds` reference change — not ' +
  'just the first time real data arrives after mount. `ds` gets a brand-new object reference on ' +
  'nearly every `setDs(prev=>({...prev,...}))` call anywhere in App.js (background lazy-fills, ' +
  'auto-pull merges, other panels\' writes), so any one of those firing while the user had the ' +
  'date picker set to "yesterday" would silently revert the date (header included) back to ' +
  '`getLatestBriefDate(ds)` — whichever date is the LATEST one with any real labor/controls/ ' +
  '3-Peaks/DAR data, which lags behind "yesterday" whenever that day\'s own sync hasn\'t landed ' +
  'in those specific arrays yet. The user never touched anything; the panel reverted their own ' +
  'selection out from under them. Fixed with a `userPickedDate` ref: the auto-resync still runs ' +
  'for the legitimate case (ds starts empty before hydration, then populates once with no user ' +
  'interaction in between), but never again once the user has made an explicit pick. ' +
  '**Also tightened a related, smaller date-matching bug found while investigating:** ' +
  '`assembleBriefStoreData`\'s labor/controls "nearby" fallback (used when no row exists for the ' +
  'exact viewed date) compared raw millisecond gaps, which its own comment called "±1 day" but ' +
  'which could in fact match a row up to 2 calendar days in the FUTURE of the viewed date (an ' +
  'asymmetry from comparing a noon-anchored picked date against midnight-anchored row dates). ' +
  'Replaced with `_calDayDiff`, which anchors both sides to local midnight before diffing — a ' +
  'true, timezone-safe ±1 calendar day either direction, matching what the comment always ' +
  'claimed. Same fix applied to the LY-comparison fallback a few lines below it. ' +
  '6 new tests across both fixes (`dispatch-morning-brief-date-picker-stays-put-2026-11-21.test.js`, ' +
  '`dispatch-morning-brief-two-day-fallback-2026-11-21.test.js`), each verified to catch a ' +
  'reverted version of its fix. Full suite + build both clean.',
]};
