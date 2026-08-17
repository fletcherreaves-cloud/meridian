// @ts-nocheck
export default {version:'4.589', date:'2026-07-29', changes:[
  'FIXED the real "data reverts to an old date" bug. At-A-Glance sales used an all-or-nothing rule: if ANY manual Operations-Report day fell in the range, it used ONLY the manual data and ignored the auto QSRSoft sync entirely — so the moment the (older) manual upload finished loading, the tile flipped from current back to the last upload date, and any range spanning that date dropped every newer day. It now merges freshest-per-day: the auto DAR fills every day, a manual upload only overrides the specific day it covers. Sales & Guest Counts, its channel mix, vs-LY, and the "as of" date now stay current.',
  'The "Loaded Data" strip now reflects the freshest date across BOTH manual and auto/emailed streams per category (Sales, Service, Controls, FOB), instead of showing only the manual-upload coverage — so it no longer reads weeks-stale while the app is actually running on current cloud data.',
]};
