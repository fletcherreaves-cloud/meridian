// @ts-nocheck
// Reports redesign Phase 4 -- 'custom-reports' joins reports-catalog.js's DIRECT_PANELS under a
// new 'Custom Reports' category, same direct-launch tile shape every other report added since
// Phase 3 already uses (label/icon/perm pulled live from panel-registry.js's PANEL_BY_ID).
// reports-catalog-phase3.test.js's own "every category has at least one entry" test already
// covers this category existing; this file verifies the specific entry and its perm-gating.
import { describe, it, expect } from 'vitest';
import { reportsCatalog, REPORT_CATEGORIES } from '../app/reports-catalog.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

const allowAll = () => true;

describe('reportsCatalog — Custom Reports (Phase 4)', () => {
  it('"Custom Reports" is a declared category', () => {
    expect(REPORT_CATEGORIES).toContain('Custom Reports');
  });

  it('includes the custom-reports tile, label/icon/perm pulled live from panel-registry.js', () => {
    const entry = reportsCatalog(allowAll).find(e => e.kind === 'panel' && e.id === 'custom-reports');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe(PANEL_BY_ID['custom-reports'].label);
    expect(entry.icon).toBe(PANEL_BY_ID['custom-reports'].icon);
    expect(entry.perm).toBe(PANEL_BY_ID['custom-reports'].perm);
    expect(entry.category).toBe('Custom Reports');
    expect(typeof entry.desc).toBe('string');
    expect(entry.desc.length).toBeGreaterThan(0);
  });

  it('disappears when analytics.store is denied, same perm boundary every other store-level report tile respects', () => {
    const denyStore = (key) => key !== 'analytics.store';
    const catalog = reportsCatalog(denyStore);
    expect(catalog.find(e => e.id === 'custom-reports')).toBeUndefined();
    // an ungated or differently-gated entry stays, proving this isn't a blanket wipe
    expect(catalog.find(e => e.id === 'report')).toBeTruthy();
  });
});
