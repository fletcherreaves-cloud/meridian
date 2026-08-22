// @ts-nocheck
export default {version:'5.103', date:'2026-08-22', changes:[
  'Dispatch #59 -- collects registerType Manager and Preparer (the Register Audit was cashier-'
  + 'only, one third of the report) and completes CASH-004, the rule that already shipped '
  + 'degraded on purpose ("no role/authority column exists in audit_rows to check against yet"). '
  + 'The pull change is one line per call (three calls instead of one); the real work is the '
  + 'GRAIN CHANGE underneath it, on a live, populated table.\n\n'
  + 'audit_rows\' PK moves from (loc, date, emp) to (loc, date, emp, register_type) -- one '
  + 'employee working a Cashier drawer AND a Manager drawer on the same day used to silently '
  + 'overwrite one row with the other. New supabase/schema-audit-rows-register-type.sql migrates '
  + 'the live table (backfilled \'cashier\' via the column default, not a data-migration step -- '
  + 'that IS what every existing row already is). Both writers moved together: '
  + 'scripts/qsrsoft-register-audit-pull.mjs and src/lib/supabase.js\'s client-side twin.\n\n'
  + 'The consumer audit (the actual dispatch, per its own framing) found two of ~40 referencing '
  + 'files that assumed the old one-row-per-employee-day grain: src/utils/register-audit.js\'s '
  + 'days/cashOSDays/avgCashOS were counting ROWS as a proxy for DAYS (now a Set of distinct '
  + 'calendar days -- dollar/count sums were already correct, separate drawers genuinely sum, '
  + 'only the day-count proxy needed fixing); and src/engine/security-baselines.js\'s '
  + 'personalBaseline(), whose own comment states "one rate per qualifying row in the window" -- '
  + 'exactly what multi-register-type rows break. Decision made and pinned by test: COLLAPSE to '
  + 'one row per employee-day before rating (not per-register-type observations), preserving the '
  + 'existing baseline\'s meaning exactly for cashier-only data rather than silently redefining '
  + 'it. Everywhere else that sums audit_rows across rows (evaluateRule\'s own aggregation in '
  + 'security-rules-run.mjs, peerBaseline, storeBaseline) is unchanged and correct as-is -- '
  + 'confirmed empirically through the real computeFindingsForRule() call site, not just by '
  + 'reading. RLS untouched: audit_rows appears only inside generated table lists, a new column '
  + "doesn't touch either policy.\n\n"
  + "CASH-004's opportunity_factor flips to TRUE (schema-security-rules-cash004-authority.sql), "
  + 'examined not assumed: grepped src/engine/security-rules.js (the only interpreter) and '
  + 'confirmed opportunity_factor has ZERO runtime readers today -- it\'s documentation metadata '
  + '("does this rule need an access/authority check to fire meaningfully"), not a behaviour '
  + "gate. So this flip is a metadata correction matching the column's now-met precondition, not "
  + 'a computed-value change; CASH-004\'s logic_expression is untouched.\n\n'
  + 'Meal-signal rules (employee_meal/manager_meal) explicitly deferred, per the dispatch\'s own '
  + "scope: those event tokens' detail arrives free once dispatch #58's pull runs, and #58 is "
  + 'still blocked on an auth question -- a rule against an unpopulated source is untestable.\n\n'
  + 'Revert-sensitive per the standing rule: three fixes (register-audit.js\'s day-Sets, '
  + 'security-baselines.js\'s collapse, the PK-collision proof) were each demonstrated to FAIL '
  + 'against their own pre-fix code and PASS against the shipped fix, not just written and '
  + 'trusted. 2005/2005 tests (16 new). Build clean, no client-bundle change. Full audit: '
  + 'memory/dispatch-59.md.',
]};
