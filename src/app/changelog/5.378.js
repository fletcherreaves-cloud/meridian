// @ts-nocheck
export default {version:'5.378', date:'2026-09-06', changes:[
  'Built 1 more Decisions Panel Inventory salvage item (decisions-panel-inventory-2026-08-10.md, ' +
  '#4 OEPE-dollarization for slow-DT ranking) -- and found the same "orphan" framing error twice ' +
  'more in the same doc while doing it.',
  'Second correction: revintel is not a retired panel either. It is the live "Revenue" panel ' +
  '(panel-registry.js id revintel) rendering RevenueIntelligence (views/store-analytics.js) -- ' +
  'and that panel\'s own subtitle already reads "OEPE dollar value . Unrealized revenue . Daypart ' +
  'erosion . Competitive pressure signals..." Both OEPE-dollarization (item 4) AND the daypart- ' +
  'asymmetry detector (item 5) were already fully built and shipped inside that panel the whole ' +
  'time -- the doc\'s "orphan, needs archaeology" framing was wrong for these two the same way it ' +
  'was wrong for computeTransfers/rollupByWRIN in v5.377.',
  'Extracted computeRevenueOpportunity\'s OEPE-dollar-gap block verbatim to new ' +
  'src/engine/revenue-opportunity.js\'s computeOepeDollarGap(p, t) -- same split pattern as the ' +
  'inventory-transfers extraction. store-analytics.js imports it back; zero behavior change to ' +
  'RevenueIntelligence.',
  'slowDT (engine/attention-feed.js) now accepts an optional `dollars` field per row (default 0, ' +
  'fully backward compatible) instead of hardcoding it -- closing the exact gap that detector\'s ' +
  'own header comment complained about since it was written ("currently reports dollars: 0, so ' +
  'slow drive-thrus cannot rank against FOB or sales items"). Wired live in attention-now.js: the ' +
  'oepe/target VALUES stay exactly what metricRate already computes (preserving dispatch #155\'s ' +
  'freshness fix -- never reverted to store.p.oepe for the threshold comparison itself), only the ' +
  'supporting factors (dtGC/avgCheck/laborPct/tpph) the dollar formula needs come from the ' +
  'matching store\'s own .p object.',
  '8 new tests (revenue-opportunity.test.js + 2 in attention-feed.test.js covering the dollars ' +
  'default and pass-through).',
  'Daypart-asymmetry (item 5) is now the closest remaining item -- its full computation is real, ' +
  'live, and shipped in the same RevenueIntelligence panel, just not extracted+wired to the ' +
  'attention feed in this pass. "This Week\'s Focus" (item 7) may genuinely still be in a retired ' +
  'panel -- unconfirmed, not re-checked this pass.',
  'Bundle: no entry-chunk change.',
]};
