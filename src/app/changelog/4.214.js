// @ts-nocheck
export default {version:'4.214', date:'2026-06-19', changes:[
  'Critical finding: fully quitting Chrome (not just closing tabs) and the freeze STILL happened in the regular profile — that ruled out every stale-tab/blocked-connection theory, since nothing could survive a full quit',
  'Re-examined every Incognito test with that ruled out: Incognito ALWAYS starts with empty IndexedDB, meaning every "fast in Incognito" result was also a "nothing to restore" result — the same confound from the very first extension test, missed a second time',
  'Found the real bug: openIDB() only cached the RESOLVED value, not the in-flight request. loadDsFromIDB() fires 8 idbGetAllRows() calls simultaneously via Promise.all — every one of them called openIDB() before any had resolved, so all 8 independently fired their own indexedDB.open() against the same database instead of sharing one connection',
  'This is a within-tab, within-session bug — explains why it persisted through a full Chrome quit, and why it only manifests with substantial existing data (Incognito\'s always-empty DB has nothing for 8 racing connections to meaningfully contend over)',
  'Fixed: cache the in-flight promise itself, not just the eventual value — every concurrent caller now awaits the same single open() instead of starting 8 redundant ones',
]};
