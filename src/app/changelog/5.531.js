// @ts-nocheck
export default {version:'5.531', date:'2026-10-12', changes:[
  'Fixed the real cause of "DATA INCOMPLETE ... security findings (security_findings_latest)" ' +
  '(owner report). loadSecurityFindings() was ordering by computed_at ALONE -- not covered by ' +
  'security_findings_latest_support_idx (that index is on tenant_id, loc, subject_key, rule_id, ' +
  'window_end desc, computed_at desc), so every request forced Postgres to re-sort the full ' +
  '~20,721-row result with no index to skip it.',
  'Measured live before touching anything: the same paginated query ordered by computed_at alone ' +
  'took 0.85-1.95s on good runs and hit a real 57014 statement-timeout on another; reordered to ' +
  "match the index's own column list exactly and re-measured -- a consistent 0.5-0.9s across 4 " +
  'repeated runs, no timeouts. groupFindingsBySubject() (security-panel.js) does not depend on ' +
  'what order findings arrives in (it re-sorts each rule\'s own window history by windowEnd/' +
  'computedAt internally), so this is purely a performance fix, not a behavior change.',
  'Confirmed unrelated to the Store VLH Config loc-padding issue flagged in v5.530 -- different ' +
  'table entirely, security_findings vs store_vlh_config.',
]};
