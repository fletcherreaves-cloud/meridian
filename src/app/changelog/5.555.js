// @ts-nocheck
export default {version:'5.555', date:'2026-10-14', changes:[
  'Security panel -- found the ACTUAL root cause after 3 code-side fixes (v5.552/553/554) each ' +
  'verified live but none fixing the owner\'s symptom (every domain still empty, now "11 ' +
  'page(s) failed"). Every prior measurement used the Supabase SERVICE ROLE key, which bypasses ' +
  'RLS entirely -- so none of them could have revealed an RLS-specific problem. Re-measured with ' +
  'a REAL authenticated admin-role session instead (a throwaway test account, created and deleted ' +
  'via the service-role Admin API, no owner credentials touched): pageSize 300/200/150/100 -- ' +
  'EVERY size -- failed 6/6, all timing out at a consistent ~8.1-8.3s, vs 0/6 failures at the ' +
  'identical offsets under the service-role key. Page size made zero difference; even a 100-row ' +
  'page cost the same ~8s a 1000-row page did. That is the signature of RLS forcing a bad query ' +
  'plan independent of how much data is requested, not a pagination problem.',
  'Root cause: security_findings\' "gated read" RLS policy calls get_my_role() as a BARE function ' +
  'reference inside the USING clause. Despite the function being declared `stable`, Postgres does ' +
  'not reliably treat a bare function call inside an RLS policy as a one-time evaluation -- it can ' +
  're-run it per candidate row, which combined with security_findings_latest\'s own DISTINCT ON ' +
  'materialization turns an index-assisted scan into something the planner can no longer execute ' +
  'cheaply. This is a documented, official Postgres/Supabase RLS performance pattern (wrap a ' +
  'function call in a policy as `(select fn())`, not `fn()` bare, so the planner can evaluate it ' +
  'once per statement instead of once per row) -- not a guess specific to this table.',
  'New migration supabase/schema-security-findings-rls-perf-fix.sql wraps get_my_role() in ' +
  '`(select ...)` on both security_findings\' read policy and security_rules\' write policy (same ' +
  'bare-call shape, fixed proactively before it surfaces on a bigger table) -- no change to WHO ' +
  'can read, same admin/owner/area_supervisor/manager-with-reveal-flag logic, only to how cheaply ' +
  'Postgres can plan around it. UNLIKE v5.552/553/554, this could not be verified end-to-end by ' +
  'Claude before committing -- it requires executing DDL (ALTER POLICY), outside what the ' +
  'service-role REST API key can do in this agent\'s environment (no SQL execution capability, ' +
  'consistent with "no automated migration runner exists in this repo"). Needs the owner to run it ' +
  'in the Supabase SQL editor; not yet confirmed fixed.',
]};
