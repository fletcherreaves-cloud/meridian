// @ts-nocheck
export default {version:'4.858', date:'2026-08-07', changes:[
  'Watch counts were always zero. The "Watch Flags" tile, the Watch filter on Store Dashboard, and the Watch tab in Needs Attention all filtered for a severity tag the system has never emitted, so all three had silently read zero since they were built. About 12 categories of watch findings were being detected and then dropped. Expect these counts to jump off zero.',
]};
