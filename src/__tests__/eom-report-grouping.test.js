import { describe, it, expect } from 'vitest';
import { groupRowsByLocationThenKey } from '../views/eom-report-grouping.js';

describe('groupRowsByLocationThenKey', () => {
  it('groups rows by location, then by the given key within each location', () => {
    const rows = [
      { loc: 'a', storeName: 'Store A', org: 'mcdok', recommendation: 'Recount now', wrin: '1' },
      { loc: 'a', storeName: 'Store A', org: 'mcdok', recommendation: 'Recount now', wrin: '2' },
      { loc: 'a', storeName: 'Store A', org: 'mcdok', recommendation: 'Verify & clear', wrin: '3' },
      { loc: 'b', storeName: 'Store B', org: 'emerald', recommendation: 'Recount now', wrin: '4' },
    ];
    const out = groupRowsByLocationThenKey(rows);
    expect(out).toHaveLength(2);
    const a = out.find(o => o.loc === 'a');
    expect(a.storeName).toBe('Store A');
    expect(a.groups).toHaveLength(2);
    expect(a.groups[0].label).toBe('Recount now');
    expect(a.groups[0].items.map(i => i.wrin)).toEqual(['1', '2']);
    expect(a.groups[1].label).toBe('Verify & clear');
    expect(a.groups[1].items.map(i => i.wrin)).toEqual(['3']);
    const b = out.find(o => o.loc === 'b');
    expect(b.groups).toHaveLength(1);
  });

  it('preserves the caller\'s existing row order within each group (no re-sorting)', () => {
    const rows = [
      { loc: 'a', storeName: 'A', recommendation: 'X', wrin: 'z' },
      { loc: 'a', storeName: 'A', recommendation: 'X', wrin: 'a' },
    ];
    const out = groupRowsByLocationThenKey(rows);
    expect(out[0].groups[0].items.map(i => i.wrin)).toEqual(['z', 'a']);
  });

  it('supports a custom key field (e.g. verdictText for Recount Impact)', () => {
    const rows = [
      { loc: 'a', storeName: 'A', verdictText: 'Helped', wrin: '1' },
      { loc: 'a', storeName: 'A', verdictText: 'Hurt', wrin: '2' },
    ];
    const out = groupRowsByLocationThenKey(rows, { key: 'verdictText' });
    expect(out[0].groups.map(g => g.label)).toEqual(['Helped', 'Hurt']);
  });

  it('never throws on empty/missing input', () => {
    expect(groupRowsByLocationThenKey(null)).toEqual([]);
    expect(groupRowsByLocationThenKey([])).toEqual([]);
  });
});
