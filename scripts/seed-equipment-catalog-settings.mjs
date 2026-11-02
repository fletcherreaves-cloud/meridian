// Seed equipment_catalog_settings from the PQRG reference data (Equipment Profile project,
// owner request 2026-11-02: "tie in settings for equipment... references based on models
// selected that can be verified"). Matches each seed group against EXISTING equipment_catalog
// rows (never creates new catalog rows -- that stays the Phase 2 "type it in, flag for review"
// path) by type/manufacturer/model, same pattern seed-equipment-catalog.mjs already uses for
// consumables.
//   node scripts/seed-equipment-catalog-settings.mjs [seed-file.json]
// Defaults to scripts/data/equipment-catalog-settings-seed-pqrg.json.
// Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { matchCatalogItems } from './lib/equipment-catalog-settings-match.mjs';

const SB_URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB_URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(SB_URL, KEY, { auth: { persistSession: false } });

const _dir = path.dirname(fileURLToPath(import.meta.url));
const seedFile = process.argv[2] || 'equipment-catalog-settings-seed-pqrg.json';
const seed = JSON.parse(fs.readFileSync(path.join(_dir, 'data', seedFile), 'utf8'));

const { data: catalog, error: catErr } = await sb.from('equipment_catalog').select('id,type,manufacturer,model');
if (catErr) { console.error('catalog fetch error:', catErr.message); process.exit(1); }

let totalInserted = 0, totalSkipped = 0, totalUnmatched = 0;

for (const group of seed.groups) {
  const matched = matchCatalogItems(group, catalog || []);
  if (!matched.length) {
    console.log(`  ✗ UNMATCHED group: type=${group.type} manufacturer=${group.manufacturer || '(any)'} modelContains=${group.modelContains || '(any)'} -- no catalog rows found, ${group.products.length} product(s) skipped`);
    totalUnmatched += group.products.length;
    continue;
  }
  for (const item of matched) {
    console.log(`  = matched: ${item.type} / ${item.manufacturer} / ${item.model}`);
    for (const p of group.products) {
      const { data: existing } = await sb.from('equipment_catalog_settings')
        .select('id').eq('catalog_item_id', item.id).eq('product', p.product).eq('setting_group', p.settingGroup || null).maybeSingle();
      if (existing) { totalSkipped++; continue; }
      const { error: insErr } = await sb.from('equipment_catalog_settings').insert({
        catalog_item_id: item.id,
        product: p.product,
        setting_group: p.settingGroup || null,
        settings: p.settings,
        needs_review: !!group.needsReview,
        review_note: group.reviewNote || null,
        source_doc: seed.sourceDoc,
        source_page: p.sourcePage || null,
      });
      if (insErr) { console.error(`    insert error (${item.model} / ${p.product}):`, insErr.message); process.exit(1); }
      totalInserted++;
    }
  }
}

console.log(`✓ Seeded equipment_catalog_settings: ${totalInserted} inserted, ${totalSkipped} already present, ${totalUnmatched} unmatched (no catalog row).`);
