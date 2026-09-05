// @ts-nocheck
export default {version:'5.368', date:'2026-09-05', changes:[
  'Found and fixed the real cause of PEAK bulk-capture\'s 17-vs-27-store gap: Stores/Paged is ' +
  '0-indexed ({"page":0} is the first page), and the capture script started its loop at page=1, ' +
  'always skipping the true first page. Confirmed via a real cURL captured from the PEAK UI\'s own ' +
  'store-list page, and independently verified by the owner calling pages 0/1/2 directly ' +
  '(10+10+7=27, matching the known store count exactly). The entity-scoping fix attempted in ' +
  'v5.367 was a dead end and has been removed -- the real UI call sends nothing beyond {"page":N}.',
  'scripts/browser-peak-visit-detail-bulk-capture.js now starts its Stores/Paged loop at page=0. ' +
  'Next step is one more live run to confirm 27 stores and capture the fuller CFV/RGR visit set.',
]};
