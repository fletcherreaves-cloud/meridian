// @ts-nocheck
export default {version:'4.779', date:'2026-08-03', changes:[
  'At-A-Glance polish: the Sales & Guest Counts, Labor, and Service tiles now show "Loading…" instead of "No … data for this period" during the brief post-reload window before the cloud streams finish loading. The empty-state was reading as "no data exists" when the data was simply still in flight (the blank-tile-on-hard-reload report) — now it only says "no data" once the streams have loaded and the selected period genuinely has none.',
]};
