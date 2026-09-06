// @ts-nocheck
export default {version:'5.380', date:'2026-09-06', changes:[
  'Fixed the last Decisions Panel Inventory salvage item (item 7, "This Week\'s Focus") -- and, ' +
  'like all 5 before it this session, priority-brief turned out NOT to be a retired/orphaned ' +
  'panel. DistrictPriorityBrief (views/analytics.js) is live, exported, and already computed a ' +
  'district-wide "which issue type appears most?" recommendation -- it just had a real ' +
  'correctness bug in how it counted.',
  'pulse\'s issueCounts used f.m.includes(\'OEPE\')-style substring matching on finding PROSE. That ' +
  'also matched oepeOk ("STRENGTH -- OEPE...", a POSITIVE finding with t:\'ok\'), oepeRecord (a ' +
  'record-achievement callout), and oepeTrend (a leading trend warning, not "currently slow") -- ' +
  'inflating the oepe bucket with non-issues and even positive findings, live in production.',
  'Rebuilt against the structured f.rule field via a new exported ISSUE_RULE_MAP -- finer-grained ' +
  'than f.category (which pools cashOS/tRedAfter/deposit/posOver/discounts all under one ' +
  '\'Controls\' bucket, too coarse for this feature\'s 7 buckets). tred\'s dual match (tRedAfter AND ' +
  'compound, both T-Red-driven) preserved intentionally; confirmed labor does NOT accidentally ' +
  'absorb tpph (tpph\'s message says "THROUGHPUT", never "LABOR").',
  '5 new tests locking in the corrected mapping directly, including negative assertions that ' +
  'oepeOk/oepeRecord/oepeTrend/tpph/laborTrend do NOT map to a bucket -- encoding the bug fix, ' +
  'not just the happy path.',
  'All 6 Decisions Panel Inventory salvage items are now resolved. Every one turned out to already ' +
  'be live/shipped, not orphaned -- the design doc\'s "orphan" framing was wrong across the board. ' +
  'The real work across all 6: two small detector gaps (slowDT\'s hardcoded dollars:0, ' +
  'duplicateWrinFlags not yet wired to a live data source) plus this one counting bug.',
  'Bundle: no entry-chunk change (536.87 KB eager / 850 KB budget, unchanged).',
]};
