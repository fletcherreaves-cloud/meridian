// @ts-nocheck
// Structural validation for the 8 equipment-catalog seed files added 2026-10-20 (owner: "add
// other equipment to our list as you can"), transcribed by hand from the real manufacturer
// reference PDFs/asset-tag photos in data/equipment-survey/Help Files/. Each item's type/
// manufacturer/model/sourceDoc were read directly off the source document -- none fabricated.
// Most source docs here are vendor contact/service sheets, not model->consumable-WRIN
// cross-references (same honest "zero consumables where none exists" treatment the Fryer seed
// established) -- the exceptions are UHC (KAY SolidSense APSC, WRIN 05890-000) and the Moffat
// Staging Cabinet (KAY Delimer Tablet, WRIN 02722-044), both read off a real per-consumable WRIN
// table in the Simplified Breakfast Combi Oven doc's own "Quick Resources" page.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FILES = [
  { file: 'equipment-catalog-seed-steamers-toasters.json', types: ['steamer', 'toaster'] },
  { file: 'equipment-catalog-seed-combi-ovens.json', types: ['combi_oven'] },
  { file: 'equipment-catalog-seed-uhc.json', types: ['uhc'] },
  { file: 'equipment-catalog-seed-staging-cabinet.json', types: ['staging_cabinet'] },
  { file: 'equipment-catalog-seed-prep-lines.json', types: ['prep_line'] },
  { file: 'equipment-catalog-seed-blended-ice.json', types: ['blended_ice'] },
  {
    file: 'equipment-catalog-seed-beverage-mccafe.json',
    types: ['abs', 'juice_dispenser', 'sweetener_creamer_dispenser', 'espresso_1step', 'espresso_2step'],
  },
  { file: 'equipment-catalog-seed-shake-sundae.json', types: ['shake_sundae'] },
];

const loadSeed = (file) => JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'data', file), 'utf8'
));

describe.each(FILES)('$file', ({ file, types }) => {
  const seed = loadSeed(file);

  it('has a non-empty items array, every item one of the expected types', () => {
    expect(Array.isArray(seed.items)).toBe(true);
    expect(seed.items.length).toBeGreaterThan(0);
    expect(seed.items.every(i => types.includes(i.type))).toBe(true);
  });

  it('every item has manufacturer, model, a sourceDoc, and consumables is an array (may be empty)', () => {
    for (const item of seed.items) {
      expect(typeof item.manufacturer).toBe('string');
      expect(item.manufacturer.length).toBeGreaterThan(0);
      expect(typeof item.model).toBe('string');
      expect(item.model.length).toBeGreaterThan(0);
      expect(typeof item.sourceDoc).toBe('string');
      expect(item.sourceDoc.length).toBeGreaterThan(0);
      expect(Array.isArray(item.consumables)).toBe(true);
    }
  });

  it('has no duplicate (type, manufacturer, model) catalog entries', () => {
    const keys = seed.items.map(i => `${i.type}|${i.manufacturer}|${i.model}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every consumable (where present) has a consumableType, a wrin, and a label', () => {
    for (const item of seed.items) {
      for (const c of item.consumables) {
        expect(typeof c.consumableType).toBe('string');
        expect(c.consumableType.length).toBeGreaterThan(0);
        expect(typeof c.wrin).toBe('string');
        expect(c.wrin.length).toBeGreaterThan(0);
        expect(typeof c.label).toBe('string');
        expect(c.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('equipment-catalog-seed-uhc.json', () => {
  it('every UHC entry carries the real APSC cleaner WRIN (05890-000), a generic cross-brand cabinet consumable', () => {
    const seed = loadSeed('equipment-catalog-seed-uhc.json');
    for (const item of seed.items) {
      expect(item.consumables.some(c => c.wrin === '05890-000')).toBe(true);
    }
  });
});

describe('equipment-catalog-seed-staging-cabinet.json', () => {
  it('the Moffat Staging Cabinet carries the real KAY Delimer Tablet WRIN (02722-044)', () => {
    const seed = loadSeed('equipment-catalog-seed-staging-cabinet.json');
    expect(seed.items[0].consumables.some(c => c.wrin === '02722-044')).toBe(true);
  });
});

describe('no cross-file (type, manufacturer, model) collisions among the 8 new seed files', () => {
  it('every new catalog entry is unique across all 8 files combined', () => {
    const keys = FILES.flatMap(({ file }) => loadSeed(file).items.map(i => `${i.type}|${i.manufacturer}|${i.model}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
