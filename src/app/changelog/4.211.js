// @ts-nocheck
export default {version:'4.211', date:'2026-06-19', changes:[
  'Incognito test confirmed the freeze was a Chrome extension — \'message\' handler violation dropped from 174,745ms to 242ms with extensions disabled. That variable is resolved.',
  'Found the real cause of the remaining IDB error: weatherRows was never in IDB_STORES at all — not a stale-version gap like darRows/pmixRows, a flat-out missing entry from day one',
  'Pinpointed via the exact failure location: Promise.all index 7 in loadDsFromIDB maps directly to idbGetAllRows(\'weatherRows\') — confirmed reproducible even in a guaranteed-fresh Incognito IndexedDB, which ruled out versioning as the cause for this specific store',
  'Fixed: weatherRows added to IDB_STORES. IDB_VERSION bumped 3→4 so a re-download to the same exact filename still gets the store created correctly',
  'Swept every idbGetAllRows/idbPutRows call site in the codebase — all 9 distinct store names now present in the schema, no other mismatches found',
]};
