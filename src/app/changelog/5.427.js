// @ts-nocheck
export default {version:'5.427', date:'2026-09-11', changes:[
  'Fix: Projections "Confirm Lock" modal was showing 54 stores instead of 27 (every store ' +
  'duplicated as a ghost "0003708 — 0003708" entry with Default model + all dashes) -- and, ' +
  'independently reported same session, the AAG patch heatmap/bullseye loading then reverting ' +
  'to "no data." Same root cause: loadLifeLenzAttendance() (supabase.js, added 2026-09-06 for ' +
  'the live T&A pull) returned r.loc verbatim from lifelenz_attendance_summary, which is ' +
  'written zero-padded ("0003708"). Every other STREAMS loader strips that padding at load ' +
  'time (loadLifeLenzSchedule\'s own 2026-08-04 comment documents this exact bug class); this ' +
  'one new stream never got the same treatment. Once lifelenzAttendanceRows joined STREAMS ' +
  '(stream-freshness.js), dsAutoStoreIds() unioned in the padded loc alongside the real ' +
  'unpadded one from every other stream -- App.js\'s rawStores then built a real store AND a ' +
  'broken "ghost" store (buildStore(\'0003708\', ...) resolves no STORE_NAMES/DEFAULT_TARGETS ' +
  'entry) for all 27 locations. Downstream, anything grouping by unpad(store.loc) (patch-' +
  'heatmap.js, bullseye-tile.js) got two entries colliding on the same key -- whichever sorted ' +
  'in last silently overwrote the real one, intermittently, matching the reported "loads fine ' +
  'then reverts."',
  'Also means the live T&A rollup shipped 2026-09-06 (scheduling.js\'s Opportunity Report) was ' +
  'silently never matching -- liveTA was keyed by padded loc, taFor(loc) looked up bare loc, so ' +
  'it always fell through to the frozen TA_DATA snapshot despite the live pull running daily. ' +
  'One-line fix (loc: String(parseInt(r.loc, 10))) resolves both.',
  'Full suite 4745/4745, build clean, 541.40 KB / 850 KB eager-payload budget.',
]};
