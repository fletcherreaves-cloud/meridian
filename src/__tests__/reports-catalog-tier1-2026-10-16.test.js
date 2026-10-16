// @ts-nocheck
// Reports Hub Tier 1 cross-listing (2026-10-16, owner request "go ahead with all of these") --
// eight proven, already-live route:true nav panels that had never been cross-listed into the
// Reports Hub catalog, following the same "cross-list, don't relocate" rule Phase 3 established:
// a desc + category entry in DIRECT_PANELS, label/icon/perm pulled live from panel-registry.js.
// forms-completion needed its own route:true + routePanel rewire first (see its own commit/
// test file) -- the other seven were already route:true.
import { describe, it, expect } from 'vitest';
import { reportsCatalog } from '../app/reports-catalog.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

const allowAll = () => true;

const TIER1_IDS = [
  ['graded-visits', 'Guest Experience'],
  ['customer-complaints', 'Guest Experience'],
  ['pricing-engine', 'Financial & Promotions'],
  ['perf-reviews', 'Labor & Payroll'],
  ['loc-intel', 'Leadership & Above-Store'],
  ['dt-sos', 'Daily & Operations'],
  ['delivery-mix', 'Sales & Forecasting'],
  ['eom-dashboard', 'Financial & Promotions'],
  ['forms-completion', 'Daily & Operations'],
];

describe('reportsCatalog — Tier 1 cross-listed panels (2026-10-16)', () => {
  it.each(TIER1_IDS)('includes %s under %s, label/icon/perm pulled live from panel-registry.js', (id, category) => {
    const entry = reportsCatalog(allowAll).find(e => e.kind === 'panel' && e.id === id);
    expect(entry, `missing catalog entry for "${id}"`).toBeTruthy();
    expect(entry.label).toBe(PANEL_BY_ID[id].label);
    expect(entry.icon).toBe(PANEL_BY_ID[id].icon);
    expect(entry.perm).toBe(PANEL_BY_ID[id].perm);
    expect(entry.category).toBe(category);
    expect(typeof entry.desc).toBe('string');
    expect(entry.desc.length).toBeGreaterThan(0);
  });

  it('each entry disappears when its OWN permission is denied, same perm boundary every other report tile respects', () => {
    for (const [id] of TIER1_IDS) {
      const perm = PANEL_BY_ID[id].perm;
      const denyThisOne = (key) => key !== perm;
      const catalog = reportsCatalog(denyThisOne);
      expect(catalog.find(e => e.id === id), `${id} should be hidden when "${perm}" is denied`).toBeUndefined();
    }
    // an ungated entry stays, proving this isn't a blanket wipe
    const catalog = reportsCatalog((key) => key !== 'analytics.store');
    expect(catalog.find(e => e.id === 'report')).toBeTruthy();
  });

  it('forms-completion is now route:true (was the old modal-state pattern)', () => {
    expect(PANEL_BY_ID['forms-completion'].route).toBe(true);
  });
});
