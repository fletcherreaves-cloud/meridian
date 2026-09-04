// ── One-time migration: collapse org_events' flat per-store duplicate rows into scoped rows ──
// Phase 1 of memory/project-events-calendar-redesign-2026-09-04.md. Every multi-store write to
// org_events (the "Auto-Tag Holidays" writers Phase 0 retired, applyEventToStores' multi-store
// tagging, bulk imports) materializes ONE row PER STORE for what is really one fact — e.g. a
// districtwide Thanksgiving becomes 27 identical rows. The schema (scope/scope_state/scope_locs,
// supabase/schema-org-events-scope.sql) and both halves of the machinery to fix this
// (collapseScopedEvents write-side, orgEventsToDayMap read-side expansion — src/engine/
// events-import.js, dispatch24/#388) have been live for weeks; this is the migration that was
// never run over the EXISTING rows. Measured live 2026-09-04: 2,708 total rows, all scope='store',
// 483 distinct (date_start,date_end,label,event_type,category) groups -- a 5.61:1 collapse ratio.
//
// SAFETY: collapseScopedEvents() keeps only the FIRST row's note/impact/opponent/kickoff/status/
// expectedSalesDelta/expectedGcDelta/url/verification when it collapses a group -- the rest of the
// group's copies of those fields are discarded. If duplicate rows ever actually differ on one of
// those (e.g. a hand-edited per-store impact override that never got un-duplicated), collapsing
// them would silently lose that difference. This script checks group homogeneity on those exact
// fields BEFORE collapsing and SKIPS (leaves untouched) any group that fails it, rather than
// assuming duplicates are always byte-identical. Divergent groups are reported for manual review,
// never silently resolved either way.
//
// Write order: new scoped rows are inserted FIRST and verified, THEN (and only then) are the old
// per-store rows deleted — a failure partway through never leaves a gap where an event vanishes.
// Already-scoped rows (scope !== 'store') are left completely alone, so re-running this script is
// idempotent by construction (a second run finds nothing left to collapse), not just by luck.
//
//   node scripts/collapse-scoped-events.mjs --dry     # report only (start here)
//   node scripts/collapse-scoped-events.mjs           # write
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both, even for --dry — unlike the
// holiday cleanup script there is no static-data preview mode here; the collapse depends on the
// live row set).

import { createClient } from '@supabase/supabase-js';
import { collapseScopedEvents } from '../src/engine/events-import.js';
import { STORE_NAMES, INV_ORG_COORDS } from '../src/constants.js';

const DRY = process.argv.includes('--dry');

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const ALL_LOCS = Object.keys(STORE_NAMES);
const stateOfLoc = loc => INV_ORG_COORDS[loc]?.state || null;

// ── 1. Read every org_events row ────────────────────────────────────────────────────────────
const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('org_events').select('*').range(from, from + 999);
  if (error) { console.error('org_events read error:', error.message); process.exit(1); }
  if (!data || !data.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`org_events total rows: ${rows.length}`);

// ── 2. Candidates are rows still shaped flat (scope missing or 'store'). Already-scoped rows
//    are left completely alone.
const candidates = rows.filter(r => !r.scope || r.scope === 'store');
const alreadyScoped = rows.length - candidates.length;
console.log(`candidates (scope missing/'store'): ${candidates.length}`);
if (alreadyScoped) console.log(`already scoped, left alone: ${alreadyScoped}`);

// ── 3. Map to the flat app-shaped event object collapseScopedEvents() expects — SAME mapping
//    loadOrgEvents() uses (src/lib/supabase.js), plus `id` kept alongside for the delete pass.
const flat = candidates.map(r => ({
  id: r.id, loc: String(r.loc), dateStart: r.date_start, dateEnd: r.date_end, span: !!r.span,
  category: r.category, type: r.event_type, label: r.label, note: r.note,
  impact: { magnitude: r.impact_magnitude, daypart: r.impact_daypart, gameDay: !!r.impact_gameday, raw: r.impact_raw },
  opponent: r.opponent ?? null, kickoff: r.kickoff ?? null, status: r.status ?? null,
  expectedSalesDelta: r.expected_sales_delta, expectedGcDelta: r.expected_gc_delta,
  url: r.url, verification: r.verification,
  enteredBy: r.entered_by, enteredAt: r.entered_at, method: r.method,
}));

// ── 4. Group by collapseScopedEvents' own key, then verify homogeneity on every field that
//    survives a collapse (see the SAFETY note above) before trusting it.
const groupKeyOf = e => [e.dateStart, e.dateEnd || e.dateStart, e.label, e.type || '', e.category || ''].join('|');
const CONTENT_FIELDS = ['note', 'opponent', 'kickoff', 'status', 'expectedSalesDelta', 'expectedGcDelta', 'url', 'verification'];
const IMPACT_FIELDS = ['magnitude', 'daypart', 'gameDay', 'raw'];
const contentKeyOf = e => JSON.stringify([
  ...CONTENT_FIELDS.map(f => e[f] ?? null),
  ...IMPACT_FIELDS.map(f => e.impact?.[f] ?? null),
]);

const groups = new Map();
for (const e of flat) {
  const k = groupKeyOf(e);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(e);
}

const divergentGroups = [];
const collapsibleRows = [];
for (const members of groups.values()) {
  if (members.length === 1) { collapsibleRows.push(...members); continue; }
  const distinctContent = new Set(members.map(contentKeyOf));
  if (distinctContent.size === 1) collapsibleRows.push(...members);
  else divergentGroups.push(members);
}

console.log(`groups: ${groups.size} total`);
console.log(`  homogeneous (collapsible): ${groups.size - divergentGroups.length}`);
console.log(`  divergent (left as-is, needs manual review): ${divergentGroups.length}`);
if (divergentGroups.length) {
  console.log('\nDivergent groups:');
  for (const members of divergentGroups.slice(0, 20)) {
    const k = groupKeyOf(members[0]);
    console.log(`  ${k}  (${members.length} rows, ids: ${members.map(m => m.id).join(',')})`);
  }
  if (divergentGroups.length > 20) console.log(`  ... and ${divergentGroups.length - 20} more`);
}

// ── 5. Run the real collapse over just the verified-homogeneous rows ───────────────────────
const collapsed = collapseScopedEvents(collapsibleRows, { allLocs: ALL_LOCS, stateOfLoc });
const newScopedRows = collapsed.filter(c => c.scope !== 'store');       // net-new rows to insert
const unchangedSingle = collapsed.filter(c => c.scope === 'store').length; // groups of 1, already correct

const idsToDelete = collapsibleRows
  .filter(e => groups.get(groupKeyOf(e)).length > 1) // only members of a group that actually collapsed
  .map(e => e.id);

const finalRowCount = rows.length - idsToDelete.length + newScopedRows.length;
console.log(`\ncollapseScopedEvents output: ${newScopedRows.length} new scoped row(s), ${unchangedSingle} single-store row(s) unchanged`);
console.log(`Summary: ${rows.length} rows -> ${finalRowCount} rows after collapse`);
console.log(`  ${idsToDelete.length} old per-store rows to delete, ${newScopedRows.length} new scoped rows to write`);
console.log(`  ${alreadyScoped + divergentGroups.reduce((s, g) => s + g.length, 0) + unchangedSingle} rows untouched (already scoped, divergent, or single-store)`);

if (!idsToDelete.length && !newScopedRows.length) { console.log('\nNothing to collapse.'); process.exit(0); }
if (DRY) { console.log('\n[--dry] no writes performed. Re-run without --dry to apply.'); process.exit(0); }

// ── 6. Write: insert the new scoped rows FIRST, verify, THEN delete the old per-store rows ──
const nowIso = new Date().toISOString();
const insertRows = newScopedRows.map(e => ({
  loc: e.loc, date_start: e.dateStart, date_end: e.dateEnd || e.dateStart, span: !!e.span,
  category: e.category ?? null, event_type: e.type ?? null, label: e.label,
  impact_magnitude: e.impact?.magnitude ?? null, impact_daypart: e.impact?.daypart ?? null,
  impact_gameday: !!e.impact?.gameDay, impact_raw: e.impact?.raw ?? null,
  opponent: e.opponent ?? null, kickoff: e.kickoff ?? null, status: e.status ?? null,
  expected_sales_delta: e.expectedSalesDelta ?? null, expected_gc_delta: e.expectedGcDelta ?? null,
  url: e.url ?? null, verification: e.verification ?? null, note: e.note ?? null,
  entered_by: e.enteredBy ?? null, entered_at: e.enteredAt ?? nowIso, method: e.method ?? 'migration:collapse-scoped-events',
  updated_at: nowIso,
  scope: e.scope, scope_state: e.scopeState ?? null, scope_locs: e.scopeLocs ?? null,
}));

let inserted = 0;
for (let i = 0; i < insertRows.length; i += 500) {
  const chunk = insertRows.slice(i, i + 500);
  const { error, count } = await sb.from('org_events').upsert(chunk, { onConflict: 'loc,date_start,label', count: 'exact' });
  if (error) { console.error(`Insert error at offset ${i}:`, error.message); console.error('Aborting before any deletes — no rows were removed.'); process.exit(1); }
  inserted += count ?? chunk.length;
}
console.log(`✓ Inserted ${inserted} new scoped row(s).`);

let deleted = 0;
for (let i = 0; i < idsToDelete.length; i += 500) {
  const chunk = idsToDelete.slice(i, i + 500);
  const { error } = await sb.from('org_events').delete().in('id', chunk);
  if (error) { console.error(`Delete error at offset ${i}:`, error.message); console.error(`${deleted} of ${idsToDelete.length} old rows deleted before this error — the new scoped rows above are already in place, so nothing is lost; re-run to finish the deletes.`); process.exit(1); }
  deleted += chunk.length;
}
console.log(`✓ Deleted ${deleted} old per-store rows.`);
console.log(`\norg_events: ${rows.length} -> ${rows.length - deleted + inserted} rows.`);
