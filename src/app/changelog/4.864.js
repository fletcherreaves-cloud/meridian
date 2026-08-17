// @ts-nocheck
export default {version:'4.864', date:'2026-08-07', changes:[
  'The Items Recounted tile was reporting "No ledger detail" for a period that held 695 rows across all 27 stores (54 items recounted, $3,680 net recovered). The read was timing out on a 16 MB request, not coming back empty. Fixed the request size, and the tile now distinguishes a failed load from a genuinely empty one, with a Retry.',
]};
