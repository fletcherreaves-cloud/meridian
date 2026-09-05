// @ts-nocheck
export default {version:'5.363', date:'2026-09-05', changes:[
  'Dispatch #230 Task 1: added scripts/browser-peak-visit-detail-bulk-capture.js -- a browser-' +
  'console script (paste into DevTools on a signed-in peak.mcd.com tab) that walks Stores/Paged -> ' +
  'Visit/GetStoreDetails/<storeId> -> Visit/RoipSurvey/<visitId> across all stores, pulling full ' +
  'per-question detail for every CFV/RGR visit (VisitTypeId 3801/3781), and downloads a seed file ' +
  'in the exact shape scripts/import-peak-visit-detail.mjs already consumes -- no changes needed ' +
  'to that script, since it was already bulk-ready. Backfills peak_detail beyond the 2 manually-' +
  'captured visits currently live (PR #1133).',
  'Some response shapes upstream (GetEntities, Stores/Paged store-entry fields) were never closely ' +
  'inspected in the original HAR captures -- the script hunts through several plausible field ' +
  'names and logs the raw first response so a real run is diagnosable without a fresh HAR capture ' +
  'if a guess is wrong. Not yet run against production; the owner runs it and reports scale ' +
  '(dispatch #230 Task 2) before the first full-estate capture.',
]};
