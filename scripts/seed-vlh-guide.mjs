// Seed vlh_guide_hours with the 2022 VLH Workbook's Drive Thru + In-Store guest-count ->
// labor-hours tables (Task #56). Run AFTER creating the table (supabase/schema-vlh-guide.sql).
//   node scripts/seed-vlh-guide.mjs
// Reads scripts/data/vlh-guide-2022-seed.json, parsed from docs/2022_VLH_Workbook_*.pdf by a
// one-off Python script (pdfplumber, word-coordinate based -- see
// memory/finding-vlh-guide-tables-2026-09-16.md for the extraction method and validation:
// zero structural issues across all 96 config pages, spot-checked against the raw PDF text).
// Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } });

const _dir = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(_dir, 'data', 'vlh-guide-2022-seed.json'), 'utf8'));

const rows = seed.map(r => ({
  guide: r.guide, aot: r.aot, dt_type: r.dtType, in_store: r.inStore, kitchen: r.kitchen,
  position: r.position, daypart: r.daypart, ipo: r.ipo, tier: r.tier,
  guest_start: r.guestStart, guest_end: r.guestEnd,
}));

console.log(`Seeding ${rows.length} vlh_guide_hours rows (${seed.length === rows.length ? 'ok' : 'MISMATCH'})...`);

const CHUNK = 1000;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const { error } = await sb.from('vlh_guide_hours')
    .upsert(chunk, { onConflict: 'guide,aot,dt_type,in_store,kitchen,position,daypart,tier' });
  if (error) { console.error(`seed error at row ${i}:`, error.message); process.exit(1); }
  console.log(`  ✓ rows ${i}-${i + chunk.length - 1}`);
}
console.log(`✓ Seeded ${rows.length} rows into vlh_guide_hours.`);
