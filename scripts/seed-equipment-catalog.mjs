// Seed equipment_catalog + equipment_catalog_consumables (Equipment Profile project, Phase 1).
// Run AFTER creating the tables (supabase/schema-equipment-catalog.sql).
//   node scripts/seed-equipment-catalog.mjs
// Reads scripts/data/equipment-catalog-seed.json, transcribed from data/equipment-survey/
// Reference Guides/Grill_Toaster_Release_Sheets-Belts_Reference_Guide.pdf -- the one real
// structured model->consumable-WRIN cross-reference document on hand as of 2026-10-19. Every
// other equipment type starts with zero catalog rows and grows via the Phase 2 survey form's
// "type it in, flag for review" path.
// Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } });

const _dir = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(_dir, 'data', 'equipment-catalog-seed.json'), 'utf8'));

console.log(`Seeding ${seed.items.length} equipment_catalog items from ${seed.sourceDoc}...`);

for (const item of seed.items) {
  const { data: existing, error: findErr } = await sb.from('equipment_catalog')
    .select('id').eq('type', item.type).eq('manufacturer', item.manufacturer).eq('model', item.model).maybeSingle();
  if (findErr) { console.error(`lookup error (${item.manufacturer} ${item.model}):`, findErr.message); process.exit(1); }

  let catalogId = existing?.id;
  if (!catalogId) {
    const { data: inserted, error: insErr } = await sb.from('equipment_catalog').insert({
      type: item.type,
      manufacturer: item.manufacturer,
      model: item.model,
      model_aliases: item.modelAliases || [],
      source: 'official',
      source_doc: seed.sourceDoc,
      flagged: false,
    }).select('id').single();
    if (insErr) { console.error(`insert error (${item.manufacturer} ${item.model}):`, insErr.message); process.exit(1); }
    catalogId = inserted.id;
    console.log(`  + ${item.type}: ${item.manufacturer} ${item.model}`);
  } else {
    console.log(`  = ${item.type}: ${item.manufacturer} ${item.model} (already exists)`);
  }

  for (const c of item.consumables) {
    const { data: existingC } = await sb.from('equipment_catalog_consumables')
      .select('id').eq('catalog_item_id', catalogId).eq('consumable_type', c.consumableType).eq('wrin', c.wrin).maybeSingle();
    if (existingC) continue;
    const { error: cErr } = await sb.from('equipment_catalog_consumables').insert({
      catalog_item_id: catalogId,
      consumable_type: c.consumableType,
      wrin: c.wrin,
      label: c.label || null,
      notes: c.notes || null,
      source_doc: seed.sourceDoc,
    });
    if (cErr) { console.error(`consumable insert error (${item.manufacturer} ${item.model} / ${c.wrin}):`, cErr.message); process.exit(1); }
    console.log(`      - ${c.consumableType}: ${c.wrin}`);
  }
}

console.log(`✓ Seeded equipment_catalog + equipment_catalog_consumables.`);
