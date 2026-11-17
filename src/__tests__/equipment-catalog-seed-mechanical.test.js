// @ts-nocheck
// Structural validation for scripts/data/equipment-catalog-seed-mechanical.json (owner request
// 2026-11-17: pre-load manufacturer/model options for hvac, remote_condenser,
// exhaust_fan_cooking, exhaust_fan_restroom, plus more walk_in_cooler/walk_in_freezer
// manufacturers, beyond the owner's own photographed table). Unlike the hand-transcribed
// manufacturer-PDF seeds, these real model/series names were found via web research against
// manufacturer/distributor/trade-press sources -- see memory/finding-equipment-catalog-
// mechanical-types-2026-11-17.md for the full source list per line.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const seed = JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'scripts', 'data', 'equipment-catalog-seed-mechanical.json'), 'utf8'
));

const EXPECTED_TYPES = ['hvac', 'walk_in_cooler', 'walk_in_freezer', 'remote_condenser', 'exhaust_fan_cooking', 'exhaust_fan_restroom'];

describe('equipment-catalog-seed-mechanical.json', () => {
  it('has a non-empty items array, every item one of the expected mechanical types', () => {
    expect(Array.isArray(seed.items)).toBe(true);
    expect(seed.items.length).toBeGreaterThan(0);
    expect(seed.items.every(i => EXPECTED_TYPES.includes(i.type))).toBe(true);
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

  it('covers every owner-photographed manufacturer (Lennox/Rheem/Trane, Norlake, Cornelius/Multiplex/Manitowoc/Scotsman, Accurex)', () => {
    const byType = (t) => new Set(seed.items.filter(i => i.type === t).map(i => i.manufacturer));
    const hvac = byType('hvac');
    expect(hvac.has('Lennox')).toBe(true);
    expect(hvac.has('Rheem')).toBe(true);
    expect(hvac.has('Trane')).toBe(true);
    const cooler = byType('walk_in_cooler');
    expect(cooler.has('Norlake')).toBe(true);
    const condenser = byType('remote_condenser');
    expect(condenser.has('Cornelius')).toBe(true);
    expect(condenser.has('Multiplex')).toBe(true);
    expect(condenser.has('Manitowoc')).toBe(true);
    expect(condenser.has('Scotsman')).toBe(true);
    const fan = byType('exhaust_fan_cooking');
    expect(fan.has('Accurex')).toBe(true);
  });

  it('has at least one manufacturer for the restroom exhaust fan type (owner photo left this blank)', () => {
    const mfrs = new Set(seed.items.filter(i => i.type === 'exhaust_fan_restroom').map(i => i.manufacturer));
    expect(mfrs.size).toBeGreaterThan(0);
  });
});
