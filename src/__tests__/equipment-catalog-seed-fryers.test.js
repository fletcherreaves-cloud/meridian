// @ts-nocheck
// Structural validation for scripts/data/equipment-catalog-seed-fryers.json (owner feedback
// 2026-10-19: "I notice at the moment only Grill and Toaster available"). Transcribed by hand
// from the Frymaster/Henny Penny manufacturer reference sheets in data/equipment-survey/Help
// Files/Fryers/ -- unlike the Grill/Toaster seed, NEITHER source doc has a model->consumable-WRIN
// cross-reference table (confirmed by reading both PDFs directly), so every item here
// legitimately has zero consumables -- that's the honest state, not a gap in transcription.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const seed = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'data', 'equipment-catalog-seed-fryers.json'), 'utf8'
));

describe('equipment-catalog-seed-fryers.json', () => {
  it('has a non-empty items array, all type "fryer"', () => {
    expect(Array.isArray(seed.items)).toBe(true);
    expect(seed.items.length).toBeGreaterThan(0);
    expect(seed.items.every(i => i.type === 'fryer')).toBe(true);
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

  it('covers both Frymaster and Henny Penny', () => {
    const mfrs = new Set(seed.items.map(i => i.manufacturer));
    expect(mfrs.has('Frymaster')).toBe(true);
    expect(mfrs.has('Henny Penny')).toBe(true);
  });
});
