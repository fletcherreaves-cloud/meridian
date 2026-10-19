// @ts-nocheck
// Structural validation for scripts/data/equipment-catalog-seed.json (Equipment Profile
// project, Phase 1) -- transcribed by hand from data/equipment-survey/Reference Guides/
// Grill_Toaster_Release_Sheets-Belts_Reference_Guide.pdf, so this guards against a typo'd
// WRIN or a missing field reaching the seed script silently.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const seed = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'data', 'equipment-catalog-seed.json'), 'utf8'
));

describe('equipment-catalog-seed.json', () => {
  it('has a sourceDoc and a non-empty items array', () => {
    expect(typeof seed.sourceDoc).toBe('string');
    expect(seed.sourceDoc.length).toBeGreaterThan(0);
    expect(Array.isArray(seed.items)).toBe(true);
    expect(seed.items.length).toBeGreaterThan(0);
  });

  it('every item has type, manufacturer, model, and at least one consumable', () => {
    for (const item of seed.items) {
      expect(typeof item.type).toBe('string');
      expect(item.type.length).toBeGreaterThan(0);
      expect(typeof item.manufacturer).toBe('string');
      expect(item.manufacturer.length).toBeGreaterThan(0);
      expect(typeof item.model).toBe('string');
      expect(item.model.length).toBeGreaterThan(0);
      expect(Array.isArray(item.consumables)).toBe(true);
      expect(item.consumables.length).toBeGreaterThan(0);
    }
  });

  it('every consumable has a consumableType and a WRIN in NNNNN-NNN shape', () => {
    const wrinShape = /^\d{4,5}-\d{3}$/; // WRINs seen in this app are 4 or 5 digits before the dash (e.g. "2174-012", "15737-073")
    for (const item of seed.items) {
      for (const c of item.consumables) {
        expect(typeof c.consumableType).toBe('string');
        expect(c.consumableType.length).toBeGreaterThan(0);
        expect(c.wrin).toMatch(wrinShape);
      }
    }
  });

  it('has no duplicate (type, manufacturer, model) catalog entries', () => {
    const keys = seed.items.map(i => `${i.type}|${i.manufacturer}|${i.model}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has no duplicate (catalog item, consumableType, wrin) consumable rows', () => {
    const keys = [];
    for (const item of seed.items) {
      for (const c of item.consumables) {
        keys.push(`${item.type}|${item.manufacturer}|${item.model}|${c.consumableType}|${c.wrin}`);
      }
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers the grill and toaster types from the source document', () => {
    const types = new Set(seed.items.map(i => i.type));
    expect(types.has('grill')).toBe(true);
    expect(types.has('toaster')).toBe(true);
  });
});
