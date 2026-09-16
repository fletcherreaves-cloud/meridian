// @ts-nocheck
// Pure logic for the query_data_health SAGE tool (Task #74). Same per-stream thresholds and
// severity math as src/engine/stream-freshness.js's streamFreshness() -- so SAGE's answer to
// "is my data current?" always agrees with the At-A-Glance data-freshness checklist, the same
// "always agrees with the panel" bar query_eom_recount_impact's own header already states.
//
// Split into a plain-JS module (not inline in index.ts) specifically so it's importable
// directly into the Vitest suite -- this session cannot deploy or exercise the live Deno Edge
// Function at all (memory/finding-sage-metric-resolver-not-a-small-port-2026-09-16.md), so this
// module is the only part of the new tool that can be genuinely verified here. Same precedent
// as labor-summary-agg.js/forecast-snapshots-agg.js/lifelenz-labor-agg.js in this same
// directory -- index.ts does the actual Supabase queries (untestable without a live DB) and
// hands the results to these pure functions.
import { STREAMS, WARN_GRACE_DAYS, CRIT_GRACE_DAYS } from '../../../src/engine/stream-freshness.js';
import { PULL_REGISTRY } from '../../../scripts/lib/scheduled-pull-registry.mjs';

/** One entry per stream this tool checks: STREAMS' label/cadenceDays joined with
 *  PULL_REGISTRY's table/dateCol/clampToToday, by key. A stream present in one but not the
 *  other is silently skipped, not a crash -- src/__tests__/scheduled-pull-registry.test.js
 *  already guards the two staying in lockstep, so this is defensive, not load-bearing. */
export function streamRegistryEntries() {
  return STREAMS
    .map(s => ({ key: s.key, label: s.label, cadenceDays: s.cadenceDays, ...PULL_REGISTRY[s.key] }))
    .filter(s => s.table && s.dateCol);
}

export const DATA_HEALTH_NOTE = 'Same freshness thresholds and stream roster as the in-app ' +
  'At-A-Glance data-freshness checklist -- this never returns store-level figures, only how ' +
  'current each tracked table is as of right now. "warn" = 1+ day past the stream\'s own ' +
  'cadence, "crit" = 3+ days past it.';

/** Given one registry entry and its already-fetched latest date value (string or null/
 *  undefined if no row was found or the query errored), returns the same
 *  {key,label,latest_date,stale_days,severity} shape streamFreshness() computes client-side.
 *  A future-dated value (past `now`) is treated the same as "unusable" -- the exact clamp
 *  stream-freshness.js's own lifelenz-forward-schedule guard exists for; PULL_REGISTRY's
 *  clampToToday flag already filters this at the SQL level for the one stream that needs it
 *  (lifelenz), but this is a second, cheap safety net for any stream that doesn't. */
export function classifyStream(entry, latestDateStr, now = new Date()) {
  const nowMs = now.getTime();
  const latestMs = latestDateStr ? new Date(latestDateStr).getTime() : NaN;
  const usable = latestDateStr != null && !Number.isNaN(latestMs) && latestMs <= nowMs;
  const staleDays = usable ? Math.floor((nowMs - latestMs) / 864e5) : Infinity;
  const warnAt = entry.cadenceDays + WARN_GRACE_DAYS;
  const critAt = entry.cadenceDays + CRIT_GRACE_DAYS;
  const severity = staleDays > critAt ? 'crit' : staleDays > warnAt ? 'warn' : 'ok';
  return {
    key: entry.key,
    label: entry.label,
    latest_date: usable ? latestDateStr : null,
    stale_days: staleDays === Infinity ? null : staleDays,
    severity,
  };
}

/** Rolls a list of classifyStream() results into the tool's final payload -- the worst
 *  (highest stale_days among non-'ok' entries) stream surfaced separately so SAGE can lead
 *  with it, same "name the one stale stream" framing worstStream() uses client-side. */
export function summarizeDataHealth(classified, checkedAt = new Date()) {
  const behind = classified.filter(c => c.severity !== 'ok');
  const worst = behind.length
    ? behind.slice().sort((a, b) => (b.stale_days ?? 1e9) - (a.stale_days ?? 1e9))[0]
    : null;
  return {
    checked_at: checkedAt.toISOString(),
    streams: classified,
    worst_stream: worst,
    note: DATA_HEALTH_NOTE,
  };
}
