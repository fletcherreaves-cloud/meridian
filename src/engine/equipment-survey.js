// @ts-nocheck
// Equipment Profile project, Phase 2 — shared resolution logic for the append-only survey log.
// Imported both by the client (future admin views) and by supabase/functions/equipment-survey
// via a relative path outside supabase/functions/ (the same pattern sage-chat/index.ts already
// uses for eom-ledger-baseline.js/forms-completion.js/stream-freshness.js) so the one real piece
// of business logic here — "what does a store currently have" — is tested against the actual
// algorithm, not a reimplementation of it.

// equipment_survey_entries is append-only: every add/edit/correction is a new row sharing the
// same instance_id as the physical item it describes, with a later submitted_at. "Current state"
// for a store is the latest row per instance_id, excluding any instance whose latest action is
// 'removed'. Rows must already be sorted newest-first by submitted_at (both the edge function's
// query and this function itself assume that — this function does not re-sort).
export function latestEntriesByInstance(rowsNewestFirst) {
  const latest = new Map();
  for (const r of (rowsNewestFirst || [])) {
    if (!r || !r.instance_id) continue;
    if (!latest.has(r.instance_id)) latest.set(r.instance_id, r);
  }
  return [...latest.values()].filter(r => r.action !== 'removed');
}
