// @ts-nocheck
export default {version:'4.591', date:'2026-07-29', changes:[
  'Leadership One-Pager now uses the McDonald\'s work week — WEDNESDAY through Tuesday — for its weekly range and label, honoring the Week Start setting instead of assuming Monday–Sunday. The header reads "Week of {Wed date}" and the window shows the correct Wed–Tue span.',
  'Sped up the current-data load: the QSRSoft daily-activity summary (At-A-Glance + One-Pager sales/speed) now fetches its pages in parallel instead of ~39 sequential round-trips — the "took a while" delay before recent data appeared is largely gone — and tolerates a partial read (keeps the newest days) instead of failing.',
]};
