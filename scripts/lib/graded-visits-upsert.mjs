// scripts/lib/graded-visits-upsert.mjs
// Shared fetch-existing-by-key + chunked-upsert pattern for graded_visits, extracted after it was
// independently written three times (import-cfv-history.mjs, import-ecosure-history.mjs, and now
// import-graded-visits-bulk.mjs) with identical shape -- same class of drift risk this repo's own
// "check whether a helper exists before writing one" standing rule warns about. The two older
// scripts are left as-is (already shipped, already verified against real data); this is used by
// the new unified bulk importer only.

// Reads every existing graded_visits row for the given report_type(s), keyed by
// "loc|visit_date|report_type", carrying only the PDF/manual-sourced fields a bulk-JSON import
// must never null out on a re-import upsert (Supabase upsert is a full-row replace on conflict,
// not a column-level coalesce -- the same trap both older import scripts guard against).
export async function fetchExistingGradedVisitsByKey(supabase, reportTypes) {
  const types = Array.isArray(reportTypes) ? reportTypes : [reportTypes];
  const byKey = new Map();
  const PAGE = 1000;
  for (const reportType of types) {
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('graded_visits')
        .select('loc,visit_date,report_type,daypart,weekpart,owner,manager,visit_by')
        .eq('report_type', reportType)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`[graded-visits-upsert] failed reading existing ${reportType} rows: ${error.message}`);
      if (!data?.length) break;
      for (const r of data) byKey.set(`${r.loc}|${r.visit_date}|${r.report_type}`, r);
      if (data.length < PAGE) break;
      from += PAGE;
    }
  }
  return byKey;
}

// Postgres rejects an upsert batch that names the same (loc, visit_date, report_type) conflict key
// twice ("ON CONFLICT DO UPDATE command cannot affect row a second time") -- it doesn't matter which
// chunk the two rows land in relative to each other, only whether they're in the SAME statement, so
// this must run before chunking, not per-chunk. Measured live 2026-09-05: a real capture had one
// store with two genuine RGR visits recorded on the same calendar date (scores 100 and 94) -- two
// real visits, but the table's key can only hold one row for that day, so this is a true collision,
// not a capture artifact. Keeps the LAST row per key (matches what running these as separate
// single-row upserts in key order would produce) and warns so a real second-visit-same-day case is
// visible rather than silently dropped.
function dedupeByConflictKey(rows) {
  const byKey = new Map();
  for (const row of rows) byKey.set(`${row.loc}|${row.visit_date}|${row.report_type}`, row);
  if (byKey.size < rows.length) {
    console.warn(`[graded-visits-upsert] ${rows.length - byKey.size} row(s) shared a (loc, visit_date, `
      + `report_type) key with another row in this batch -- only the last-seen row per key is kept.`);
  }
  return [...byKey.values()];
}

// Upserts `rows` into graded_visits in chunks of `chunkSize` on the table's own
// (loc, visit_date, report_type) conflict key. Throws on the first failed chunk (fail loud, not
// partial-silent) -- matching both older import scripts' own process.exit(1)-on-error behavior.
export async function chunkedUpsertGradedVisits(supabase, rows, chunkSize = 100) {
  const deduped = dedupeByConflictKey(rows);
  let saved = 0;
  for (let i = 0; i < deduped.length; i += chunkSize) {
    const chunk = deduped.slice(i, i + chunkSize);
    const { error } = await supabase.from('graded_visits').upsert(chunk, { onConflict: 'loc,visit_date,report_type' });
    if (error) throw new Error(`[graded-visits-upsert] upsert failed at offset ${i}: ${error.message}`);
    saved += chunk.length;
  }
  return saved;
}
