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

// Upserts `rows` into graded_visits in chunks of `chunkSize` on the table's own
// (loc, visit_date, report_type) conflict key. Throws on the first failed chunk (fail loud, not
// partial-silent) -- matching both older import scripts' own process.exit(1)-on-error behavior.
export async function chunkedUpsertGradedVisits(supabase, rows, chunkSize = 100) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('graded_visits').upsert(chunk, { onConflict: 'loc,visit_date,report_type' });
    if (error) throw new Error(`[graded-visits-upsert] upsert failed at offset ${i}: ${error.message}`);
    saved += chunk.length;
  }
  return saved;
}
