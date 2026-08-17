// @ts-nocheck
export default {version:'4.509', date:'2026-07-24', changes:[
  'Per-station breakdown (v4.507) now uses the verified LifeLenz shift query, so the daily sync can actually pull it. Also excludes rejected/unassigned shifts so a dropped shift no longer adds phantom hours to a station. (No visible change until the data lands after the next LifeLenz sync.)',
]};
