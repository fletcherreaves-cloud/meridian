// @ts-nocheck
// Reports Hub Tier 3 -- new "Cash Variance Pattern" report joins reports-catalog.js's
// DIRECT_PANELS, same direct-launch tile shape every report since Phase 2 uses.
import { describe, it, expect } from 'vitest';
import { reportsCatalog } from '../app/reports-catalog.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

const allowAll = () => true;

describe('reportsCatalog — Tier 3 Cash Variance Pattern report (2026-10-16)', () => {
  it('includes cash-variance-pattern under Financial & Promotions, label/icon/perm pulled live from panel-registry.js', () => {
    const entry = reportsCatalog(allowAll).find(e => e.kind === 'panel' && e.id === 'cash-variance-pattern');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe(PANEL_BY_ID['cash-variance-pattern'].label);
    expect(entry.icon).toBe(PANEL_BY_ID['cash-variance-pattern'].icon);
    expect(entry.perm).toBe('analytics.store');
    expect(entry.category).toBe('Financial & Promotions');
    expect(typeof entry.desc).toBe('string');
    expect(entry.desc.length).toBeGreaterThan(0);
  });

  it('disappears when analytics.store is denied', () => {
    const denyStore = (key) => key !== 'analytics.store';
    expect(reportsCatalog(denyStore).find(e => e.id === 'cash-variance-pattern')).toBeUndefined();
  });
});
