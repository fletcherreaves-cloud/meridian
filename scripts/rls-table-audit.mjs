#!/usr/bin/env node
// @ts-nocheck
// Issue #119 — table-by-table RLS audit.
//
// For every table PostgREST exposes live (enumerated from the OpenAPI root, NOT from
// supabase/*.sql DDL — metric-inventory.mjs's static DDL scan already missed 11 loc-keyed
// tables this exact way, which is how they shipped with no RLS policy at all), this compares
// a normal authenticated-role read against a service-role read (which bypasses RLS entirely)
// and classifies the gap:
//   OK               — counts match, or the table legitimately has zero rows for both
//   RLS-FILTERED     — service-role sees rows the authenticated role does not: the caller is
//                       being denied data they should plausibly see (or the policy is broken)
//   ERROR            — the read itself failed for one role (policy bug, not a visibility gap)
//
// Mints its own short-lived authenticated session via the Supabase Admin API (no interactive
// login needed), so this is safe to re-run any time as a standing repeatable check rather than
// a one-off finding that goes stale.
//
//   node scripts/rls-table-audit.mjs
//
// Required env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// Optional env: AUDIT_USER_EMAIL (defaults to the owner's admin account)

const SB_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.AUDIT_USER_EMAIL || 'fletcher.reaves@mcreaves.com';

if (!SB_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function mintAuthToken(email) {
  const res = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const data = await res.json();
  if (!data.action_link) throw new Error('generate_link failed: ' + JSON.stringify(data));
  const verifyRes = await fetch(data.action_link, { redirect: 'manual' });
  const loc = verifyRes.headers.get('location');
  if (!loc || !loc.includes('access_token=')) throw new Error('verify did not return tokens: ' + loc);
  const frag = loc.split('#')[1];
  const params = Object.fromEntries(frag.split('&').map((kv) => kv.split('=')));
  if (params.error) throw new Error('verify error: ' + frag);
  return params.access_token;
}

async function liveTables() {
  const res = await fetch(`${SB_URL}/rest/v1/`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const doc = await res.json();
  return Object.keys(doc.paths || {})
    .filter((p) => p.startsWith('/') && !p.slice(1).includes('/') && p.slice(1))
    .map((p) => p.slice(1))
    .sort();
}

async function countAs(table, token) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range'); // "0-0/1234" or "*/0"
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.message || res.statusText };
  }
  const total = range ? Number(range.split('/')[1]) : null;
  return { count: total };
}

async function main() {
  console.error(`Auditing as ${EMAIL} ...`);
  const userToken = await mintAuthToken(EMAIL);
  const tables = await liveTables();
  console.error(`${tables.length} live tables discovered via PostgREST OpenAPI root.\n`);

  const rows = [];
  for (const t of tables) {
    const [asAuth, asService] = await Promise.all([countAs(t, userToken), countAs(t, SERVICE_KEY)]);
    let verdict;
    if (asAuth.error || asService.error) verdict = 'ERROR';
    else if (asService.count === 0) verdict = 'empty (no data)';
    else if (asAuth.count === asService.count) verdict = 'OK';
    else if (asAuth.count === 0) verdict = 'RLS-FILTERED (all rows hidden)';
    else verdict = 'RLS-FILTERED (partial)';
    rows.push({
      table: t,
      auth: asAuth.count ?? asAuth.error,
      service: asService.count ?? asService.error,
      verdict,
    });
  }

  const w = (s, n) => String(s).padEnd(n);
  console.log(w('TABLE', 36) + w('AUTH', 12) + w('SERVICE', 12) + 'VERDICT');
  for (const r of rows) console.log(w(r.table, 36) + w(r.auth, 12) + w(r.service, 12) + r.verdict);

  const flagged = rows.filter((r) => r.verdict.includes('RLS-FILTERED') || r.verdict === 'ERROR');
  console.log(`\n${flagged.length} table(s) need attention:`);
  flagged.forEach((r) => console.log(`  - ${r.table}: ${r.verdict} (auth=${r.auth}, service=${r.service})`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
