// @ts-nocheck
export default {version:'5.367', date:'2026-09-05', changes:[
  'Attempted fix for the PEAK bulk-capture 17-vs-27-store gap: GetEntities\' response is confirmed ' +
  '{EntityTypes:[{EntityList:[{Id,Name,Description1,...}],EntityCount}]}, and the one live account ' +
  'has a single entity (Id "8685", Description1 "1000890759" -- the same org-root hierarchy-node id ' +
  'already hardcoded for Propel in browser-ecosure-bulk-capture.js). scripts/browser-peak-visit-' +
  'detail-bulk-capture.js now sends that entity\'s Id/Description1 into every Stores/Paged call ' +
  'under several plausible key names, since the owner confirmed all 27 stores ARE visible in the ' +
  'PEAK UI under this same login while the unscoped API call only returned 17. Not yet verified ' +
  'against a live run.',
]};
