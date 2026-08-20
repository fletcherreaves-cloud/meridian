// @ts-nocheck
// ── Identity vault write-path helper (dispatch #37, Direction B) ───────────────
// Shared between scripts/qsrsoft-register-audit-pull.mjs (Node, service-role client) and
// src/lib/supabase.js (browser, anon-key client) -- one place this lookup-or-create logic is
// written, not duplicated per caller. Lives in src/engine/ following this repo's existing
// convention for pure logic imported by BOTH a scripts/*.mjs pull and browser src/ code (e.g.
// scripts/qsrsoft-employee-roster-pull.mjs imports src/engine/people-reports.js the same way).
//
// Routes through the get_or_create_employee_token() RPC (supabase/schema-identity-vault.sql)
// rather than a direct table insert -- employee_identity_vault has zero RLS policies by
// design, so a raw insert from the browser's anon-key client would be rejected outright, and
// even the service-role path uses the same RPC to keep exactly one tested code path instead of
// two (a raw upsert server-side, a table insert client-side). Never resolves a token back to a
// name -- that is reveal_employee_identity()'s job, deliberately not exposed here.

// getOrCreateToken(supabase, employeeName) -> uuid | null. `supabase` is any supabase-js
// client (service-role or anon-key -- the RPC works identically either way). Returns null
// (never throws) on a missing client, an empty name, or an RPC error -- callers already treat
// a missing emp_token as "not yet backfilled," a documented, expected state (register-audit.js
// falls back to 'Unknown'), not a fatal condition.
export async function getOrCreateToken(supabase, employeeName) {
  const name = (employeeName || '').trim();
  if (!supabase || !name) return null;
  const { data, error } = await supabase.rpc('get_or_create_employee_token', { p_employee_name: name });
  if (error) {
    console.warn('[identity-vault] getOrCreateToken failed for', JSON.stringify(name), ':', error.message);
    return null;
  }
  return data || null;
}

// tokenizeRows(supabase, rows, empField) -> Map<employeeName, token>. Batches the RPC to ONE
// call per DISTINCT name in `rows`, not one call per row -- a saveAuditRows() batch commonly
// carries the same employee across several days, and this repo's own "measure it" standing
// rule (a paged-parallel egress fix elsewhere in this file's sibling supabase.js) is exactly
// about not multiplying network calls per row when a per-entity call would do.
export async function tokenizeRows(supabase, rows, empField = 'emp') {
  const names = [...new Set((rows || []).map(r => (r[empField] || '').trim()).filter(Boolean))];
  const map = new Map();
  for (const name of names) {
    const token = await getOrCreateToken(supabase, name);
    if (token) map.set(name, token);
  }
  return map;
}
