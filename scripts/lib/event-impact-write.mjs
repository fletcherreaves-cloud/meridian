// ── Shared helpers for the Event Impact Registry measurement scripts (Dispatch #108) ───────────────
// Used by measure-retail-impact.mjs, measure-holiday-impact.mjs, measure-tagged-event-impact.mjs so
// the GC-lift plumbing (loading qsr_daily_activity_rollup, merging sales+GC shrunk lifts into one
// upsert row, and the graceful pre-migration fallback) lives in exactly one place.

// GC source: qsr_daily_activity_rollup.transactions — the app's already-established canonical `gc`
// metric (src/engine/metric-source.js's `gc` chain leads with qsrActSummaryRows, which reads this
// table). Confirmed backfilled to 2024-01-01 in production (measured 2026-08-24 — see
// memory/dispatch-108.md Resolution), cross-validated exact-match against
// qsr_sales_mix.metrics.gross_sales_qty. Returns rows shaped { loc, date, gc } for measureEventLift's
// opts.valueKey:'gc' path.
export async function loadGcRows(sb) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('qsr_daily_activity_rollup')
      .select('loc,dt,transactions').order('dt').range(from, from + 999);
    if (error) { console.error('qsr_daily_activity_rollup read error:', error.message); process.exit(1); }
    if (!data || !data.length) break;
    for (const r of data) if (r.transactions > 0) rows.push({ loc: r.loc, date: r.dt, gc: +r.transactions });
    if (data.length < 1000) break;
  }
  return rows;
}

// Upsert to event_impact, tolerating a production database that hasn't had
// supabase/schema-event-impact-gc.sql run yet: PostgREST returns PGRST204 ("Could not find the
// 'gc_home_impact' column…") for the whole batch in that case, so this strips the gc_* keys and
// retries once — sales lift still lands, GC lift is silently skipped rather than blocking everything
// (dispatch #108's schema migration is a manual owner step, same as every other supabase/schema-*.sql
// file in this repo — see the schema file's own header).
export async function upsertEventImpact(sb, writes, { dry = false, label = 'event_impact rows' } = {}) {
  if (!writes.length) { console.log('Nothing meets the minimum-n bar — nothing to write.'); return { written: 0, gcSkipped: false }; }
  if (dry) { console.log(`[--dry] would upsert ${writes.length} ${label}.`); return { written: 0, gcSkipped: false, dry: true }; }

  let { error } = await sb.from('event_impact').upsert(writes, { onConflict: 'loc,event_type' });
  if (error && error.code === 'PGRST204' && /gc_|_gc_/.test(error.message || '')) {
    console.warn('⚠ GC-lift columns not present yet in production event_impact (run supabase/schema-event-impact-gc.sql');
    console.warn('  in the Supabase SQL editor, then re-run this script to also land GC lift). Writing sales-lift-only rows now.');
    const salesOnly = writes.map(({ gc_home_impact, gc_away_impact, measured_gc_home, measured_gc_away, n_gc_home, n_gc_away, ...rest }) => rest);
    ({ error } = await sb.from('event_impact').upsert(salesOnly, { onConflict: 'loc,event_type' }));
    if (error) { console.error('event_impact upsert error (sales-only retry):', error.message); process.exit(1); }
    console.log(`✓ Upserted ${salesOnly.length} ${label} (sales lift only — GC columns pending migration).`);
    return { written: salesOnly.length, gcSkipped: true };
  }
  if (error) { console.error('event_impact upsert error:', error.message); process.exit(1); }
  console.log(`✓ Upserted ${writes.length} ${label}.`);
  return { written: writes.length, gcSkipped: false };
}

// Merge a sales-lift shrunk-result map and a GC-lift shrunk-result map (both from shrinkLifts(),
// keyed by unpadded loc) into one event_impact row per loc that appears in EITHER map — a store can
// carry sales lift without GC lift or vice versa depending on which source actually covers its dates
// (dispatch #108 verification bar). minN gates each metric independently.
export function mergeSalesAndGcWrites({ loc, eventType, salesShrunk, gcShrunk, minN, note }) {
  const s = salesShrunk && salesShrunk[loc];
  const g = gcShrunk && gcShrunk[loc];
  const sOk = s && s.n >= minN;
  const gOk = g && g.n >= minN;
  if (!sOk && !gOk) return null;
  return {
    loc, event_type: eventType,
    home_impact: sOk ? s.shrunk : null, away_impact: null,
    measured_home: sOk ? s.measured : null, measured_away: null,
    n_home: sOk ? s.n : null, n_away: null,
    gc_home_impact: gOk ? g.shrunk : null, gc_away_impact: null,
    measured_gc_home: gOk ? g.measured : null, measured_gc_away: null,
    n_gc_home: gOk ? g.n : null, n_gc_away: null,
    source: 'measured', note,
    updated_at: new Date().toISOString(),
  };
}
