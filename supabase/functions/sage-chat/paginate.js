// Shared, Deno/Node-agnostic pagination helper for SAGE's data-aggregation tools (dispatch #85).
// Imported directly by supabase/functions/sage-chat/index.ts and by its Vitest test in
// src/__tests__/, so the SAME code that runs in production is what the test exercises -- not a
// re-implementation of it. Plain JS, no TypeScript, per repo convention. See memory/dispatch-85.md.
//
// The bug this fixes: every data-aggregation tool in index.ts set a client-side `.limit(100000)`
// (or 50000) -- which does nothing, because PostgREST's server-side `max-rows` setting (1000 on
// this project) overrides a client-requested limit. A 14-day query_daily_activity pull across 27
// stores (27 * 24 hour_slots = 648 rows/day) silently truncated to ~1.5 days; a 5-week pull scoped
// to 7 stores (7 * 24 = 168 rows/day) truncated to ~6 of 35 days. Same cap, two different symptom
// shapes depending on which axis the truncated page happened to cut across -- which is why it read
// as two unrelated problems until both were traced to the same arithmetic.
//
// Fixes the class, not one call site: pages with offset-based `.range()` (matches
// scripts/qsrsoft-ops-gap-report.mjs's identical fix for the same PostgREST behavior) until a page
// returns fewer than `pageSize` rows -- the only reliable "that was the last page" signal (an
// empty page AND a partial page both mean "no more data"; only a full page means "there might be
// more").

// `buildQuery` must return a FRESH, un-awaited Supabase query builder on every call (same filters
// each time, no `.range()`/`.limit()` of its own) -- an already-awaited builder can't be re-ranged.
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) return { data: all, error };
    if (!data?.length) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return { data: all, error: null };
}
