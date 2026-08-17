// @ts-nocheck
export default {version:'4.556', date:'2026-07-27', changes:[
  'Precautionary hardening batch: fixed a data-completeness bug where the Daily Glimpse / Cash / Sales-Ledger loaders could silently drop the newest ~3 weeks of data on large date ranges (Supabase 1000-row cap) — At-A-Glance tiles now always see the full window. Fixed the Calendar Manager Florida/Oklahoma pills (FL pill was empty). Refreshed this version/changelog and removed stale debug logging.',
  'EOM: Item Journey visual guide (per-item count-cycle timeline with verified-fact vs likely-inference signals, qty + $ variance, reconciled exactly to the Variance Stat report, click-through flow chips), two modes (EOM count-completion + year-round progress), FOB multi-location variance matrix, and the comms draft now carries the full food-cost action plan.',
  'New: "What Needs My Attention Now" (🎯) — one ranked cross-domain triage fusing FOB outliers, behind-last-year, sync health, drive-thru speed, visit-readiness/food-safety risk, and fading saved signals.',
  'FOB Analysis is now cloud-first (works with no upload). Graded Visits shows a most-likely daypart/channel bar. EOM Supervisor exports OP Supplies per store. Signals Scanner supports multi-select bulk-tracking.',
  'Performance Reviews: named, savable, org-shared templates with hard 100%-weight enforcement, plus template-snapshot isolation so changing a template never re-scores finished reviews. (More coming: drag-reorder + editable job titles.)',
]};
