// @ts-nocheck
export default {version:'5.731', date:'2026-11-10', changes:[
  '**📦 On-Hand / Variance pull freshness badges (task #137).** `stream-freshness.js`\'s own '+
  'header comment previously documented `qsr_onhand` as deliberately excluded from STREAMS -- '+
  '"can\'t be freshness-checked from ds until that wiring lands." Closed that gap for both '+
  'qsr_onhand AND qsr_variance_stat (the sibling EOM-diagnosis table, same gap, never '+
  'documented separately) with the same lightweight {date}-only probe pattern already proven '+
  'for qsr_inventory_summary: `loadQsrOnHandFreshness`/`loadQsrVarianceStatFreshness` '+
  '(src/lib/supabase.js) read just the newest `updated_at` off each table, wired into App.js\'s '+
  'eager startup load (`_stOnHandFreshness`/`_stVarianceFreshness`) as `ds.qsrOnHandFreshnessRows`/'+
  '`ds.qsrVarianceFreshnessRows` -- not the full district-wide per-row loaders, which stay '+
  'on-demand/panel-local exactly as before. Two new STREAMS entries (`onHand`/`variance`) '+
  'follow, so both now participate in the Data Manager\'s per-stream table, At-A-Glance\'s '+
  '"Loaded Data" strip and worst-stream checklist, and `scheduled-pull-watchdog.mjs`\'s '+
  'registry, same as every other auto-pulled stream.',
  'Surfaced a small stale-dot badge (same visual language as the Data Manager\'s existing '+
  '`staleDot`, off a new shared `severityColor()`/`streamByKey()` pair in stream-freshness.js '+
  'so every badge reads the identical severity scale) wherever an operator actually looks at '+
  'these numbers: At-A-Glance\'s always-on Count & FOB Pulse tile and the EOM-window Count '+
  'Progress tile (On-Hand), the FOB End-of-Month Troubleshooter\'s auto-pull status row '+
  '(On-Hand + Variance), and the EOM Dashboard\'s 📸 Change Monitor modal subtitle (Variance). '+
  'Renders nothing (not a false stale dot) until a stream\'s probe has actually resolved into '+
  '`ds` this session.',
  '+32 tests across stream-freshness.test.js, the real At-A-Glance/FOBEOMPanel call sites, and '+
  'a dedicated freshBadge() unit suite for the Change Monitor subtitle. Also added the two new '+
  'STREAMS keys to scripts/lib/scheduled-pull-registry.mjs\'s PULL_REGISTRY (table/dateCol/'+
  'workflowFile), which src/__tests__/scheduled-pull-registry.test.js already enforces stays in '+
  'lockstep with STREAMS -- adding the entries without this would have left the watchdog and '+
  'SAGE\'s query_data_health tool silently blind to both new streams.',
]};
