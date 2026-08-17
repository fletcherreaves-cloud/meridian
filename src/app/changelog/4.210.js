// @ts-nocheck
export default {version:'4.210', date:'2026-06-19', changes:[
  'Found via real console data: the [PERF] instrumentation proved Priority Brief\'s own code is fast (rawStores 418ms, tiered/pulse/render-body all under 1ms) — the freeze was NOT in this code path',
  'Real culprit: IndexedDB schema mismatch. IDB_VERSION was never bumped when IDB_STORES grew (darRows/pmixRows/peaksRows added later) — onupgradeneeded only fires on a version increase, so existing browsers never got those object stores created',
  'Every read/write against a missing store threw "object store not found" — repeatedly, including 16x on a single auto-save, visible directly in console output',
  'Fixed: IDB_VERSION bumped 2→3. The upgrade handler is purely additive (only creates missing stores) so this is safe regardless of how outdated any browser\'s existing copy is',
  'Flagged but not fixed: "listener indicated an asynchronous response" errors in the console are a near-textbook Chrome extension signature, not page code — Meridian has no chrome.runtime API usage. Worth testing in Incognito to rule in/out extension involvement in the remaining freeze time',
]};
