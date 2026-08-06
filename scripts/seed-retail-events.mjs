// ── Seed the retail/shopping calendar into org_events (Event Lookup v1, Notes 56 #4) ─────────────
// CLI twin of Calendar Manager → "🛍 Retail Events". Same engine, same table, same upsert key.
//
//   node scripts/seed-retail-events.mjs --dry            # print what would be written
//   node scripts/seed-retail-events.mjs                  # write (default year span)
//   node scripts/seed-retail-events.mjs --years 2022-2027
//
// Required env (writes only): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Idempotent: upserts on (loc, date_start, label), so re-running never duplicates.

import { createClient } from '@supabase/supabase-js';
import { expandRetailEvents, defaultRetailYears, RETAIL_EVENT_RULES } from '../src/engine/retail-events.js';
import { INV_ORG_COORDS } from '../src/constants.js';

const DRY = process.argv.includes('--dry');
const yArg = (() => {
  const i = process.argv.indexOf('--years');
  if (i < 0 || !process.argv[i + 1]) return null;
  const m = String(process.argv[i + 1]).match(/^(\d{4})-(\d{4})$/);
  if (!m) { console.error('--years expects YYYY-YYYY'); process.exit(1); }
  const out = []; for (let y = +m[1]; y <= +m[2]; y++) out.push(y); return out;
})();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY && (!URL || !KEY)) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --dry to preview)'); process.exit(1); }

const stores = Object.entries(INV_ORG_COORDS).map(([loc, v]) => ({ loc, state: v.state || 'OK' }));
const years = yArg || defaultRetailYears();
const events = expandRetailEvents(stores, { years });

console.log(`Stores: ${stores.length}  (OK ${stores.filter(s => s.state === 'OK').length} / FL ${stores.filter(s => s.state === 'FL').length})`);
console.log(`Years : ${years[0]}–${years[years.length - 1]}`);
console.log(`Events: ${events.length}\n`);
for (const rule of RETAIL_EVENT_RULES) {
  const mine = events.filter(e => e.ruleKey === rule.key);
  if (!mine.length) { console.log(`  ${rule.key}: (none in range)`); continue; }
  const dates = [...new Set(mine.map(e => e.dateStart + (e.dateEnd !== e.dateStart ? '→' + e.dateEnd.slice(5) : '')))];
  const est = mine.filter(e => e.verification !== 'Confirmed').length;
  console.log(`  ${rule.key.padEnd(18)} [${rule.derivation}] ${mine.length} rows · ${dates.join(', ')}${est ? `  (${est} ESTIMATED)` : ''}`);
}

if (DRY) { console.log('\n[--dry] nothing written.'); process.exit(0); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const nowIso = new Date().toISOString();
const rows = events.map(e => ({
  loc: String(e.loc), date_start: e.dateStart, date_end: e.dateEnd, span: !!e.span,
  category: e.category, event_type: e.type, label: e.label,
  impact_magnitude: e.impact.magnitude, impact_daypart: e.impact.daypart,
  impact_gameday: false, impact_raw: e.impactRaw,
  expected_sales_delta: null, expected_gc_delta: null,
  url: e.url, verification: e.verification, note: e.note,
  entered_by: 'seed-retail-events', entered_at: nowIso, method: 'recurring rule', updated_at: nowIso,
}));
let saved = 0;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const { error, count } = await sb.from('org_events').upsert(chunk, { onConflict: 'loc,date_start,label', count: 'exact' });
  if (error) { console.error('org_events upsert error:', error.message); process.exit(1); }
  saved += count ?? chunk.length;
}
console.log(`\n✓ Upserted ${saved} retail events into org_events.`);
console.log('  They hydrate into the calendar on next app load. Expected impact is Low (=0) by design —');
console.log('  run scripts/measure-retail-impact.mjs to grade them into the Event Impact Registry.');
