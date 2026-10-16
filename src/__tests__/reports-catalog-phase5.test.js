// @ts-nocheck
// Reports redesign Phase 5 -- six new base reports join reports-catalog.js's DIRECT_PANELS
// under their existing categories (no new category needed), same direct-launch tile shape
// every report since Phase 2 uses (label/icon/perm pulled live from panel-registry.js's
// PANEL_BY_ID).
import { describe, it, expect } from 'vitest';
import { reportsCatalog } from '../app/reports-catalog.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

const allowAll = () => true;

const PHASE5_IDS = [
  ['controls-food-cost-link', 'Financial & Promotions'],
  ['price-change-impact', 'Financial & Promotions'],
  ['weather-impact', 'Sales & Forecasting'],
  ['item-velocity', 'Sales & Forecasting'],
  ['channel-mix', 'Sales & Forecasting'],
  ['labor-opportunity-cost', 'Labor & Payroll'],
];

describe('reportsCatalog — Phase 5 base reports', () => {
  it.each(PHASE5_IDS)('includes %s under %s, label/icon/perm pulled live from panel-registry.js', (id, category) => {
    const entry = reportsCatalog(allowAll).find(e => e.kind === 'panel' && e.id === id);
    expect(entry, `missing catalog entry for "${id}"`).toBeTruthy();
    expect(entry.label).toBe(PANEL_BY_ID[id].label);
    expect(entry.icon).toBe(PANEL_BY_ID[id].icon);
    expect(entry.perm).toBe(PANEL_BY_ID[id].perm);
    expect(entry.category).toBe(category);
    expect(typeof entry.desc).toBe('string');
    expect(entry.desc.length).toBeGreaterThan(0);
  });

  it('all six disappear together when analytics.store is denied, same perm boundary every other store-level report tile respects', () => {
    const denyStore = (key) => key !== 'analytics.store';
    const catalog = reportsCatalog(denyStore);
    for (const [id] of PHASE5_IDS) expect(catalog.find(e => e.id === id)).toBeUndefined();
    // an ungated entry stays, proving this isn't a blanket wipe
    expect(catalog.find(e => e.id === 'report')).toBeTruthy();
  });
});
