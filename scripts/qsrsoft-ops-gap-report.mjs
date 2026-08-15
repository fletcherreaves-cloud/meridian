#!/usr/bin/env node
// scripts/qsrsoft-ops-gap-report.mjs — #312/#322 backfill addendum ("Backfill as much as
// needed to have no gaps" -> "step 1 is a gap report, and it is cheap").
//
// For each of qsrsoft-ops-pull.mjs's 5 tables: min(dt), max(dt), row count, distinct-day
// count vs expected calendar days across [min,max], and the actual missing interior days
// (as compact ranges). Run before AND after a backfill so "no gaps" is a shown count, not
// an assertion, per the addendum's explicit instruction.
//
// Requires SUPABASE_SERVICE_ROLE_KEY, not the anon key — the addendum's own author hit this:
// an anon-key read returning [] is RLS, not evidence of an empty table, and must never be
// reported as a confirmed gap. Only a service-role read (bypasses RLS) is ground truth here.
// Local-dev note: this repo's local .env.local currently has VITE_SUPABASE_ANON_KEY set to
// the SAME value as SUPABASE_SERVICE_ROLE_KEY (both decode to role:service_role) — that is a
// sandbox-only convenience, not representative of the real anon key's RLS-scoped production
// behavior, and must not be relied on as evidence either way about anon-key access.
//
// PostgREST caveat that broke the first version of this script: a `Range` request for MORE
// rows than the project's configured max-rows (1000 here, confirmed via a manual probe) is
// silently capped — the response still comes back with fewer rows than requested, and that
// looks identical to "this was the last page." Do not treat "rows.length < requested" as an
// end-of-data signal; page in fixed PAGE-sized steps and stop only on an EMPTY page.
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const TABLES = ['qsr_labor_summary', 'qsr_cash_sheet', 'qsr_service_stats', 'qsr_sales_mix', 'qsr_peaks_sales'];
const PAGE = 1000;

async function fetchAllDates(table) {
  const dates = new Set();
  let offset = 0, totalRows = 0;
  for (;;) {
    const resp = await fetch(`${URL}/rest/v1/${table}?select=dt&order=dt.asc`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${offset}-${offset + PAGE - 1}` },
    });
    const rows = await resp.json();
    if (!Array.isArray(rows)) { console.error(`[${table}] unexpected response:`, JSON.stringify(rows).slice(0, 300)); break; }
    for (const r of rows) dates.add(r.dt);
    totalRows += rows.length;
    if (rows.length === 0) break;
    offset += PAGE;
  }
  return { dates, totalRows };
}

const addDay = (d, n) => { const r = new Date(d + 'T00:00:00Z'); r.setUTCDate(r.getUTCDate() + n); return r.toISOString().slice(0, 10); };

(async () => {
  for (const table of TABLES) {
    const { dates: dateSet, totalRows } = await fetchAllDates(table);
    if (!dateSet.size) { console.log(`\n=== ${table} ===\nNO ROWS (${totalRows} total rows fetched)`); continue; }
    const sorted = [...dateSet].sort();
    const min = sorted[0], max = sorted[sorted.length - 1];
    let expected = 0; const missing = [];
    for (let d = min; d <= max; d = addDay(d, 1)) { expected++; if (!dateSet.has(d)) missing.push(d); }
    console.log(`\n=== ${table} ===`);
    console.log(`total rows: ${totalRows}`);
    console.log(`min(dt)=${min}  max(dt)=${max}`);
    console.log(`distinct days present: ${sorted.length} / expected calendar days: ${expected}`);
    console.log(`missing interior days: ${missing.length}`);
    if (missing.length) {
      const ranges = [];
      let start = missing[0], prev = missing[0];
      for (let i = 1; i < missing.length; i++) {
        const d = missing[i];
        if (addDay(prev, 1) === d) { prev = d; continue; }
        ranges.push(start === prev ? start : `${start}..${prev}`);
        start = d; prev = d;
      }
      ranges.push(start === prev ? start : `${start}..${prev}`);
      console.log(`missing ranges (${ranges.length}): ${ranges.join(', ')}`);
    }
  }
})();
