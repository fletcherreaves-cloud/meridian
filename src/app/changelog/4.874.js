// @ts-nocheck
export default {version:'4.874', date:'2026-08-07', changes:[
  'A manual report that is too large to sync (one 12.37 MB file) was being re-fetched and failing on EVERY load. It now stops retrying after two attempts and names the file so a report that never synced is visible instead of silently absent.',
]};
