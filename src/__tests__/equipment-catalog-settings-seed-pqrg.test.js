// @vitest-environment node
// @ts-nocheck
// Structural validation for the PQRG equipment-settings seed (owner req 2026-11-02: "tie in
// settings for equipment... references based on models selected that can be verified") and its
// matcher logic, against FIXTURE catalog rows copied verbatim from the real seed files
// (scripts/data/equipment-catalog-seed*.json) -- so a rename/removal of a real catalog model
// that would silently orphan a PQRG settings group is caught here, not discovered live.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { matchCatalogItems } from '../../scripts/lib/equipment-catalog-settings-match.mjs';

const loadSeed = (file) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts', 'data', file), 'utf8'));

// Fixture catalog rows -- the real (type, manufacturer, model) triples from every seed file the
// PQRG settings seed could plausibly match against, each given a fake id for the matcher.
let _id = 0;
const row = (type, manufacturer, model) => ({ id: String(++_id), type, manufacturer, model });
const CATALOG_FIXTURE = [
  // equipment-catalog-seed.json (grills + original toaster family)
  row('grill', 'Garland', '2-platen Electric Grill (MWE-9501/9801, MWG-9501)'),
  row('grill', 'Garland', '3-platen Gas & Electric (MWE3W, MWG3W, MWE3S)'),
  row('grill', 'Garland', '3-platen Gas or Electric, NextGen (2+1 single chassis) M(G/E)-3PX'),
  row('grill', 'Taylor', '3-platen Gas or Electric Intelli-Gap (C842 & C844)'),
  row('grill', 'Taylor', '2-platen Gas or Electric Intelli-Gap (C832 & C835)'),
  row('grill', 'Taylor', '2-platen Gas or Electric (Models 12, 15, 69, 22, 22E, 32 & 35)'),
  row('grill', 'Taylor', '3-platen Gas or Electric NextGen (C850-C860)'),
  row('grill', 'Taylor', '2-platen Gas or Electric (Model 11)'),
  row('toaster', 'A.J. Antunes', 'Horizontal Contact Toaster (HCT-5H / HEBT-5V)'),
  row('toaster', 'A.J. Antunes', 'Universal Toaster (UTX-200/200L)'),
  row('toaster', 'A.J. Antunes', 'Club Toaster (CTX-200/200L)'),
  row('toaster', 'Prince Castle', 'CBT Horizontal Toaster'),
  row('toaster', 'A.J. Antunes', 'Vertical Toaster (VCT-250)'),
  // equipment-catalog-seed-steamers-toasters.json
  row('steamer', 'Antunes', 'SS-400'),
  row('steamer', 'Antunes', 'UCS-2000'),
  row('steamer', 'Prince Castle (Marmon)', '625 Series'),
  row('toaster', 'Antunes', 'MT-12'),
  row('toaster', 'Antunes', 'UTX-200 / CTX-200'),
  row('toaster', 'Antunes', 'HCT-5H / HRT-5H'),
  row('toaster', 'Prince Castle (Marmon)', '340-URTG2L'),
  row('toaster', 'Prince Castle (Marmon)', 'CBT-MCD (Core Bun Toaster, Model CBT-SB-NA-1PS)'),
  row('toaster', 'Prince Castle (Marmon)', 'IRT-MCD (Infrared Toaster, Model IRT-SB-NA-1PS / IRT-SB-NA-3PS)'),
  // equipment-catalog-seed-combi-ovens.json
  row('combi_oven', 'Blodgett', 'BLCT-6E-H-MCD'),
  row('combi_oven', 'Convotherm', 'Generation 1 (gray screen overlay)'),
  row('combi_oven', 'Convotherm', 'Generation 2 (black screen overlay)'),
  // equipment-catalog-seed-fryers.json
  row('fryer', 'Frymaster', 'BIELA — Electric LOV Fryer (M3000 Controller)'),
  row('fryer', 'Frymaster', 'BIELA-T — Electric LOV Fryer (Touch Screen)'),
  row('fryer', 'Frymaster', 'BIGLA — Gas LOV Fryer (M3000 Controller)'),
  row('fryer', 'Frymaster', 'BIGLA-T — Gas LOV Fryer (Touch Screen)'),
  row('fryer', 'Henny Penny', 'LVE Electric 100/200 Series'),
  row('fryer', 'Henny Penny', 'LVE Electric 300 Series (Touchscreen)'),
  row('fryer', 'Henny Penny', 'LVG Gas 100/200 Series'),
  // equipment-catalog-seed-uhc.json
  row('uhc', 'Frymaster', 'UHCHD (Legacy High Density UHC, discontinued globally June 30, 2020)'),
  row('uhc', 'Frymaster', 'UHC Touchscreen (High Density UHC with touchscreen UI)'),
  row('uhc', 'Prince Castle (Marmon)', 'UHC6PT-22MCD'),
  row('uhc', 'Henny Penny', 'UHC-600 (Universal Holding Cabinet)'),
  // equipment-catalog-seed-staging-cabinet.json
  row('staging_cabinet', 'Moffat', 'Simplified Breakfast Staging Cabinet'),
  // equipment-catalog-seed-beverage-mccafe.json (espresso only -- the rows this seed matches against)
  row('espresso_1step', 'Franke', 'SB1200 (obsolete as of 2026, parts through 2029)'),
  row('espresso_1step', 'Franke', 'FM850 (obsolete as of 2019, parts through 2029)'),
  row('espresso_1step', 'Bunn', 'Sure-Tamp (obsolete as of 2/1/2023, parts through 2/1/2028)'),
  row('espresso_1step', 'Melitta', 'CT8 (obsolete as of 2024, parts through 2029)'),
  row('espresso_2step', 'Thermoplan', 'CTS'),
  row('espresso_2step', 'Franke', 'S700'),
  row('espresso_2step', 'WMF (SEB Professional)', '5000 S+'),
];

describe('equipment-catalog-settings-seed-pqrg.json structure', () => {
  const seed = loadSeed('equipment-catalog-settings-seed-pqrg.json');

  it('has a non-empty groups array', () => {
    expect(Array.isArray(seed.groups)).toBe(true);
    expect(seed.groups.length).toBeGreaterThan(0);
  });

  it('every group has a type, a matchType, and a non-empty products array', () => {
    for (const g of seed.groups) {
      expect(typeof g.type).toBe('string');
      expect(['type', 'manufacturer', 'model']).toContain(g.matchType);
      expect(Array.isArray(g.products)).toBe(true);
      expect(g.products.length).toBeGreaterThan(0);
    }
  });

  it('manufacturer/model matchType groups always carry a manufacturer', () => {
    for (const g of seed.groups) {
      if (g.matchType === 'manufacturer' || g.matchType === 'model') expect(typeof g.manufacturer).toBe('string');
      if (g.matchType === 'model') expect(typeof g.modelContains).toBe('string');
    }
  });

  it('every product has a product name and a settings object', () => {
    for (const g of seed.groups) {
      for (const p of g.products) {
        expect(typeof p.product).toBe('string');
        expect(p.product.length).toBeGreaterThan(0);
        expect(typeof p.settings).toBe('object');
        expect(p.settings).not.toBeNull();
      }
    }
  });

  it('a group with needsReview:true always carries a reviewNote explaining why', () => {
    for (const g of seed.groups) {
      if (g.needsReview) {
        expect(typeof g.reviewNote).toBe('string');
        expect(g.reviewNote.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('matchCatalogItems — every PQRG group resolves to at least one real catalog row', () => {
  const seed = loadSeed('equipment-catalog-settings-seed-pqrg.json');

  it.each(seed.groups.map((g, i) => [i, g]))('group %i (%j) matches >= 1 fixture catalog row', (i, g) => {
    const matched = matchCatalogItems(g, CATALOG_FIXTURE);
    expect(matched.length, `type=${g.type} manufacturer=${g.manufacturer} modelContains=${g.modelContains}`).toBeGreaterThan(0);
  });

  it("grill type-match resolves to all 8 grill fixture rows (Garland + Taylor)", () => {
    const grillGroup = seed.groups.find((g) => g.type === 'grill');
    const matched = matchCatalogItems(grillGroup, CATALOG_FIXTURE);
    expect(matched.length).toBe(8);
  });

  it("fryer type-match resolves to all 7 fryer fixture rows (Frymaster + Henny Penny)", () => {
    const fryerGroup = seed.groups.find((g) => g.type === 'fryer');
    const matched = matchCatalogItems(fryerGroup, CATALOG_FIXTURE);
    expect(matched.length).toBe(7);
  });

  it("uhc type-match resolves to all 4 uhc fixture rows regardless of manufacturer", () => {
    const uhcGroup = seed.groups.find((g) => g.type === 'uhc');
    const matched = matchCatalogItems(uhcGroup, CATALOG_FIXTURE);
    expect(matched.length).toBe(4);
  });

  it("Blodgett combi_oven model-match resolves to exactly the Blodgett row, not Convotherm", () => {
    const g = seed.groups.find((x) => x.type === 'combi_oven' && x.manufacturer === 'Blodgett');
    const matched = matchCatalogItems(g, CATALOG_FIXTURE);
    expect(matched.map((m) => m.manufacturer)).toEqual(['Blodgett']);
  });

  it("Convotherm combi_oven model-match resolves to BOTH Gen-1 and Gen-2 rows", () => {
    const g = seed.groups.find((x) => x.type === 'combi_oven' && x.manufacturer === 'Convotherm');
    const matched = matchCatalogItems(g, CATALOG_FIXTURE);
    expect(matched.length).toBe(2);
    expect(matched.every((m) => m.manufacturer === 'Convotherm')).toBe(true);
  });

  it("Antunes MT-12 toaster model-match resolves to exactly the MT-12 row, not other Antunes toasters", () => {
    const g = seed.groups.find((x) => x.type === 'toaster' && x.modelContains === 'MT-12');
    const matched = matchCatalogItems(g, CATALOG_FIXTURE);
    expect(matched.length).toBe(1);
    expect(matched[0].model).toBe('MT-12');
  });

  it("a manufacturer name with punctuation (A.J. Antunes / Prince Castle (Marmon)) still matches a plain-name group", () => {
    const g = { type: 'steamer', matchType: 'model', manufacturer: 'Prince Castle', modelContains: '625' };
    const matched = matchCatalogItems(g, CATALOG_FIXTURE);
    expect(matched.length).toBe(1);
    expect(matched[0].manufacturer).toBe('Prince Castle (Marmon)');
  });
});
