// @ts-nocheck
// Reports redesign Phase 3 -- reportsCatalog(can) merges direct-launch panel tiles (pulled live
// from panel-registry.js's PANEL_BY_ID) with the subscribable report entries (report-
// subscriptions.js's REPORTS), grouped by category, permission-filtered. Verifies against the
// REAL registries, not a mock catalog -- a label/perm drift in either source would fail this.
import { describe, it, expect } from 'vitest';
import { reportsCatalog, REPORT_CATEGORIES } from '../app/reports-catalog.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';
import { REPORTS as SUBSCRIBABLE_REPORTS } from '../views/report-subscriptions.js';

const allowAll = () => true;
const denyNone = allowAll;

describe('reportsCatalog — direct-launch panel tiles', () => {
  it('includes every expected cross-listed panel id, with label/icon/perm pulled live from panel-registry.js', () => {
    const catalog = reportsCatalog(allowAll);
    const ids = ['report', 'forecast-reports', 'trend-report', 'pay-rate-history', 'promo-roi', 'loss-prevention', 'one-pager', 'operator-summary', 'ranking'];
    for (const id of ids) {
      const entry = catalog.find(e => e.kind === 'panel' && e.id === id);
      expect(entry, `missing catalog entry for panel id "${id}"`).toBeTruthy();
      expect(entry.label).toBe(PANEL_BY_ID[id].label);
      expect(entry.icon).toBe(PANEL_BY_ID[id].icon);
      expect(entry.perm).toBe(PANEL_BY_ID[id].perm);
      expect(typeof entry.desc).toBe('string');
      expect(entry.desc.length).toBeGreaterThan(0);
    }
  });

  it('every direct-launch entry\'s category is one of the declared REPORT_CATEGORIES', () => {
    const catalog = reportsCatalog(allowAll);
    for (const e of catalog.filter(e => e.kind === 'panel')) {
      expect(REPORT_CATEGORIES).toContain(e.category);
    }
  });

  it('a panel gated behind a permission disappears when that permission is denied, matching panel-registry.js\'s own canOpen() boundary', () => {
    const denyPayroll = (key) => key !== 'payroll.view';
    const catalog = reportsCatalog(denyPayroll);
    expect(catalog.find(e => e.id === 'pay-rate-history')).toBeUndefined();
    // an unrelated perm-gated entry stays, proving this isn't a blanket wipe
    expect(catalog.find(e => e.id === 'loss-prevention')).toBeTruthy();
  });

  it('an ungated permission denial (unrelated key) changes nothing', () => {
    const denyUnrelated = (key) => key !== 'settings.view';
    expect(reportsCatalog(denyUnrelated).length).toBe(reportsCatalog(allowAll).length);
  });
});

describe('reportsCatalog — subscribable report tiles', () => {
  it('includes every report-subscriptions.js REPORTS entry, label/icon/desc/category pulled from that single source', () => {
    const catalog = reportsCatalog(allowAll);
    for (const r of SUBSCRIBABLE_REPORTS) {
      const entry = catalog.find(e => e.kind === 'subscription' && e.key === r.key);
      expect(entry, `missing catalog entry for subscribable key "${r.key}"`).toBeTruthy();
      expect(entry.label).toBe(r.label);
      expect(entry.category).toBe(r.category);
    }
  });

  it('subscribable entries are never removed by a permission denial (they carry no perm of their own)', () => {
    const denyEverything = () => false;
    const catalog = reportsCatalog(denyEverything);
    expect(catalog.filter(e => e.kind === 'subscription').length).toBe(SUBSCRIBABLE_REPORTS.length);
    // every PERM-GATED direct-launch panel is gone; an ungated one ('report', perm:null) stays,
    // same !p.perm short-circuit panel-registry.js's own canOpen() uses.
    const stillPresent = catalog.filter(e => e.kind === 'panel');
    expect(stillPresent.every(e => !e.perm)).toBe(true);
  });
});

describe('reportsCatalog — category grouping is exhaustive', () => {
  it('every catalog entry (direct + subscribable) lands under a real category, and every category has at least one entry', () => {
    const catalog = reportsCatalog(allowAll);
    const byCategory = {};
    for (const cat of REPORT_CATEGORIES) byCategory[cat] = catalog.filter(e => e.category === cat);
    for (const cat of REPORT_CATEGORIES) {
      expect(byCategory[cat].length, `category "${cat}" has no tiles`).toBeGreaterThan(0);
    }
    const total = Object.values(byCategory).reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(catalog.length);
  });
});
