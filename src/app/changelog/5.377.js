// @ts-nocheck
export default {version:'5.377', date:'2026-09-06', changes:[
  'Built 2 more Decisions Panel Inventory salvage items (decisions-panel-inventory-2026-08-10.md, ' +
  '#2 cross-store transfer matcher and #3 duplicate-WRIN detector) -- correcting v5.376\'s framing ' +
  'that all 5 remaining items needed archaeology out of a retired panel. computeTransfers/' +
  'rollupByWRIN were never orphaned: both are live, tested, in active use today in ' +
  'views/inventory.js\'s real Transfers view.',
  'Extracted computeTransfers/rollupByWRIN/invDist/invSameState/formatXferQty verbatim to new ' +
  'src/engine/inventory-transfers.js -- the exact destination that design doc named, and the ' +
  'same split #214 already did for INV_MASTER/classifyInvArea (parsers/inventory-parse.js). Zero ' +
  'behavior change to the live Inventory panel, which now imports these back; ' +
  'inventory-transfer-helpers.test.js\'s import path updated, still passing unchanged.',
  'Two new attention-feed.js detectors reuse them. transferOpportunities() rolls ' +
  'computeTransfers\' per-item rows up to one item per SENDING store and gives it the natural ' +
  '`dollars` value computeTransfers already produces -- the exact gap slowDT\'s own comment names ' +
  '(currently reports dollars:0). duplicateWrinFlags() adapts rollupByWRIN\'s rollup output ' +
  '("usage split across N WRINs, verify manager is using correct one") into integrityFlags()\'s ' +
  'existing input shape, reusing that pipeline instead of inventing a parallel one.',
  'transferOpportunities is wired into buildAttentionFeed (new transferRows param). ' +
  'duplicateWrinFlags is NOT live-wired into attention-now.js -- unlike forecastCalibrationGap\'s ' +
  'simple DEFAULT_MODEL_ASSIGNMENTS source, real live wiring needs the SAME row-transformation ' +
  'inventory.js\'s own load effect does inline (mapInvClass/classifyInvArea/usage1000 from ' +
  'avg-transactions-by-month) -- extracting that cleanly is its own task, not risked here as a ' +
  'guess.',
  '12 new tests across both detectors in attention-feed.test.js.',
  'Bundle: no entry-chunk change.',
]};
