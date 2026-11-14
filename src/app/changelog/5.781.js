// @ts-nocheck
export default {version:'5.781', date:'2026-11-14', changes:[
  '**QSRSoft Register Audit Pull: resilience fix for a preparer-type upsert collision (GH #1314 ' +
  'follow-up).** After v5.779\'s endpoint migration shipped, a live-dispatched verification run ' +
  'confirmed cashier and manager both save cleanly on the new endpoint -- but the preparer type ' +
  'hit a different Postgres error: two rows in one response sharing the exact same ' +
  '(loc,date,emp,register_type) upsert key, which Postgres cannot resolve within one multi-row ' +
  'statement, failing the ENTIRE preparer window\'s save (0 rows, not just the colliding one). ' +
  'New `dedupeAuditRows()` collapses a collision to one row before the upsert (last-row-wins, ' +
  'the same outcome two separate single-row upserts would produce anyway) and logs every ' +
  'collision loudly with both colliding employees\' IDs, so a future run\'s job log names the ' +
  'exact person/date/store -- real root cause (true API duplicate vs. a same-name-different-' +
  'person collision) is still open; this agent\'s own sandbox is WAF-blocked from re-probing the ' +
  'live endpoint directly, so the next production run\'s debug output is the only path to it. ' +
  'Full findings: memory/finding-register-audit-preparer-duplicate-2026-11-14.md.',
]};
