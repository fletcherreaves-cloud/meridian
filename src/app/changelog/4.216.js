// @ts-nocheck
export default {version:'4.216', date:'2026-06-19', changes:[
  'Fixed the triple-redundant read found while reviewing the restore path: performFullIDBRestore() was reading the same large stores from IndexedDB up to 3 times — once in loadDsFromIDB(), again in idbGetCoverage() just for date ranges, a third time for the weather cache bridge',
  'Added coverageFromLoadedRows() — computes the identical coverage stats from data already in memory, zero additional IndexedDB reads. Weather cache now reuses the already-loaded weather array directly',
  'Net effect: Restore Session now reads your data once instead of up to three times',
]};
