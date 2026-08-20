#!/usr/bin/env node
// scripts/backfill-identity-vault.mjs
// Dispatch #37 (Direction B, memory/dispatch-37.md item 3.4) — one-time backfill: for every
// distinct existing `audit_rows.emp` name that has no `emp_token` yet, look up/create its
// token via the shared get_or_create_employee_token() RPC (supabase/schema-identity-vault.sql)
// and populate emp_token on those rows. Idempotent — safe to re-run, only ever touches rows
// where emp_token IS NULL, so a second run finds nothing left to do.
//
// The owner runs this manually against live Supabase, same as every other schema-*.sql /
// one-time-migration script in this repo — this session has no live Supabase access.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run AFTER supabase/schema-identity-vault.sql has been applied.

import { createClient } from '@supabase/supabase-js';
import { tokenizeRows } from '../src/engine/identity-vault.js';

const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const PAGE = 1000;

// Collects every DISTINCT emp name still missing a token, paging through audit_rows rather
// than relying on a single request (this table has 5+ months of history across 27 stores —
// the same >1000-row cap every other loader in this repo works around).
async function collectUntokenizedNames() {
  const names = new Set();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('audit_rows')
      .select('emp')
      .is('emp_token', null)
      .not('emp', 'is', null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`[backfill-identity-vault] read failed: ${error.message}`);
    if (!data?.length) break;
    for (const r of data) { if (r.emp) names.add(r.emp); }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return [...names];
}

async function main() {
  if (!supabase) { console.error('[backfill-identity-vault] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  const names = await collectUntokenizedNames();
  console.log(`[backfill-identity-vault] ${names.length} distinct untokenized employee name(s) found`);
  if (!names.length) { console.log('[backfill-identity-vault] nothing to do'); process.exit(0); }

  const tokenMap = await tokenizeRows(supabase, names.map(emp => ({ emp })), 'emp');
  console.log(`[backfill-identity-vault] ${tokenMap.size} token(s) resolved via get_or_create_employee_token()`);

  let updated = 0, failed = 0;
  for (const name of names) {
    const token = tokenMap.get(name);
    if (!token) { console.warn(`[backfill-identity-vault] no token resolved for ${JSON.stringify(name)} — skipping`); failed++; continue; }
    const { error, count } = await supabase
      .from('audit_rows')
      .update({ emp_token: token })
      .eq('emp', name)
      .is('emp_token', null)
      .select('*', { count: 'exact', head: true });
    if (error) { console.error(`[backfill-identity-vault] update failed for ${JSON.stringify(name)}: ${error.message}`); failed++; continue; }
    updated += count || 0;
  }

  console.log(`[backfill-identity-vault] done — ${updated} row(s) updated across ${names.length - failed} employee(s), ${failed} failure(s)`);
  process.exit(failed > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[backfill-identity-vault] FATAL:', e); process.exit(1); });
}
