// ── One-time cleanup: purge the auto-materialized holiday rows from org_events (#197 Slice 1) ──
// autoTagHolidays() (src/utils/holidays.js) used to run automatically on every single data load
// and write one org_events row per (loc, HOLIDAY_MAP date) — 27 stores x ~19 holidays/year,
// compounding across months of uploads. That's the mechanism the #197 design doc traced 25,783
// org_events rows to. v4.983 stopped the automatic writes (verified redundant: every actual
// forecast exclusion/adjustment site already calls isHoliday()/HOLIDAY_MAP directly, never a
// materialized tag — see the comment above autoTagHolidays() for the grep that confirmed it).
// This script is the other half: purging the rows that already accumulated before that fix.
//
// Scoped precisely to what autoTagHolidays() actually wrote — event_type='holiday' AND label
// matching a HOLIDAY_MAP entry (src/utils/holidays.js buildHolidays()). This does NOT touch:
//   - retail-events.js rows (event_type is 'tax_free'/'black_friday'/'small_biz_sat'/'cyber_monday',
//     never 'holiday' — see src/engine/retail-events.js RETAIL_EVENT_TYPES)
//   - any Type B/C row a human entered by hand, regardless of type
//   - a holiday-type row whose label does NOT match a HOLIDAY_MAP label (a real manual entry
//     that happens to share the 'holiday' type but not the auto-tag's exact label set)
//
//   node scripts/cleanup-materialized-holiday-events.mjs --dry     # report only (start here)
//   node scripts/cleanup-materialized-holiday-events.mjs           # delete
//
// Required env (delete only): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { buildHolidays } from '../src/utils/holidays.js';

const DRY = process.argv.includes('--dry');

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!URL || !KEY)) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --dry to preview without them)'); process.exit(1); }

// HOLIDAY_MAP itself only spans yr-7..yr+2, but the ledger may hold rows from further back
// (uploads have run since 2022) — widen the label set generously rather than the date window,
// since matching is by LABEL not date (a label is stable across years; a date range isn't).
const LABELS = new Set();
for (let y = new Date().getFullYear() - 10; y <= new Date().getFullYear() + 3; y++) {
  for (const h of Object.values(buildHolidays(y))) LABELS.add(h.label);
}
console.log(`Matching against ${LABELS.size} known holiday labels: ${[...LABELS].join(', ')}\n`);

if (DRY) {
  if (!URL || !KEY) { console.log('[--dry] No Supabase credentials in this environment — showing the label set only, not a live count.'); process.exit(0); }
}

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('org_events').select('id,loc,date_start,label').eq('event_type', 'holiday').range(from, from + 999);
  if (error) { console.error('org_events read error:', error.message); process.exit(1); }
  if (!data || !data.length) break;
  rows.push(...data);
  if (data.length < 1000) break;
}
console.log(`org_events rows with event_type='holiday': ${rows.length}`);

const toDelete = rows.filter(r => LABELS.has(r.label));
const kept = rows.length - toDelete.length;
console.log(`  matching a known holiday label (auto-materialized): ${toDelete.length}`);
console.log(`  NOT matching (left alone — likely a real manual entry): ${kept}`);

const byLabel = {};
for (const r of toDelete) byLabel[r.label] = (byLabel[r.label] || 0) + 1;
for (const [label, n] of Object.entries(byLabel).sort((a, b) => b[1] - a[1])) console.log(`    ${label.padEnd(20)} ${n}`);

if (!toDelete.length) { console.log('\nNothing to delete.'); process.exit(0); }
if (DRY) { console.log(`\n[--dry] would delete ${toDelete.length} rows. Re-run without --dry to actually delete.`); process.exit(0); }

const ids = toDelete.map(r => r.id);
let deleted = 0;
for (let i = 0; i < ids.length; i += 500) {
  const chunk = ids.slice(i, i + 500);
  const { error } = await sb.from('org_events').delete().in('id', chunk);
  if (error) { console.error(`Delete error at offset ${i}:`, error.message); process.exit(1); }
  deleted += chunk.length;
}
console.log(`\n✓ Deleted ${deleted} auto-materialized holiday rows from org_events.`);
console.log('  Local mf_events/userEvents in each browser still has them until that device\'s next');
console.log('  Calendar Manager save/edit cycle re-syncs from the cloud — harmless, they\'ll just');
console.log('  look like normal local tags until then and are unaffected by this cleanup.');
