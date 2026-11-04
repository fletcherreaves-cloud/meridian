// @ts-nocheck
// Owner-requested 2026-11-04: "how we can add settings to the targets so they may be customized
// as needed. Need to be able to add or remove metrics and categories on monthly and yearly."
// src/engine/target-field-config.js is the shared, pure engine both PROJ_FIELDS (Monthly, flat
// array) and YEARLY_CATS (Yearly, nested categories) now run their real field list through.
import { describe, it, expect } from 'vitest';
import { applyFieldConfig, applyCategoryConfig } from '../engine/target-field-config.js';

const FIELDS = [
  { key: 'a', g: 'Group1', l: 'Field A' },
  { key: 'b', g: 'Group1', l: 'Field B' },
  { key: 'c', g: 'Group2', l: 'Field C' },
];

describe('applyFieldConfig', () => {
  it('returns the items unchanged (same content, order, labels) when config is null/undefined/empty', () => {
    expect(applyFieldConfig(FIELDS, null)).toEqual(FIELDS);
    expect(applyFieldConfig(FIELDS, undefined)).toEqual(FIELDS);
    expect(applyFieldConfig(FIELDS, {})).toEqual(FIELDS);
  });

  it('hides a field marked hidden, leaving the rest untouched ("remove a metric")', () => {
    const out = applyFieldConfig(FIELDS, { fields: { b: { hidden: true } } });
    expect(out.map(f => f.key)).toEqual(['a', 'c']);
  });

  it('relabels a field without affecting its key or group', () => {
    const out = applyFieldConfig(FIELDS, { fields: { a: { label: 'Renamed A' } } });
    expect(out.find(f => f.key === 'a').l).toBe('Renamed A');
    expect(out.find(f => f.key === 'a').g).toBe('Group1');
  });

  it('moves a field into a different (possibly new) group ("regroup/recategorize")', () => {
    const out = applyFieldConfig(FIELDS, { fields: { c: { group: 'Group1' } } });
    expect(out.find(f => f.key === 'c').g).toBe('Group1');
    // All three now share Group1 -- grouped together (stable group-order-by-first-seen).
    expect(out.every(f => f.g === 'Group1')).toBe(true);
  });

  it('renames a group label for every field in it, without needing to touch each field', () => {
    const out = applyFieldConfig(FIELDS, { groups: { Group1: { label: 'Renamed Group' } } });
    expect(out.find(f => f.key === 'a').g).toBe('Renamed Group');
    expect(out.find(f => f.key === 'b').g).toBe('Renamed Group');
    expect(out.find(f => f.key === 'c').g).toBe('Group2'); // untouched group unaffected
  });

  it('reorders fields within a group via explicit field order, overriding original position', () => {
    const out = applyFieldConfig(FIELDS, { fields: { b: { order: -1 } } }); // push 'b' before 'a'
    expect(out.map(f => f.key)).toEqual(['b', 'a', 'c']);
  });

  it('reorders whole groups via explicit group order', () => {
    const out = applyFieldConfig(FIELDS, { groups: { Group2: { order: -1 } } }); // Group2 first
    expect(out.map(f => f.key)).toEqual(['c', 'a', 'b']);
  });

  it('never mutates the input array or its items', () => {
    const snapshot = JSON.parse(JSON.stringify(FIELDS));
    applyFieldConfig(FIELDS, { fields: { a: { hidden: true, label: 'x' } }, groups: { Group1: { label: 'y' } } });
    expect(FIELDS).toEqual(snapshot);
  });

  it('passes through non-array input unchanged (defensive, never throws)', () => {
    expect(applyFieldConfig(null, {})).toBeNull();
    expect(applyFieldConfig(undefined, {})).toBeUndefined();
  });

  it('works against Yearly-shaped items (key field is `k`, not `key`)', () => {
    const yearlyShaped = [{ k: 'x', g: 'Cat1', l: 'X' }, { k: 'y', g: 'Cat1', l: 'Y' }];
    const out = applyFieldConfig(yearlyShaped, { fields: { x: { hidden: true } } });
    expect(out.map(f => f.k)).toEqual(['y']);
  });
});

const CATS = [
  { key: 'ops', label: 'Service & Ops', icon: '⚡', fields: [
    { k: 'tOepe', l: 'OEPE PACE' },
    { k: 'tKvst', l: 'KVS PACE' },
  ]},
  { key: 'people', label: 'People', icon: '👥', fields: [
    { k: 'tHeadcount', l: 'Total Headcount' },
  ]},
];

describe('applyCategoryConfig — Yearly\'s nested {key,label,icon,fields} shape', () => {
  it('returns the categories array unchanged when config is empty (identity, not just equal content)', () => {
    expect(applyCategoryConfig(CATS, null)).toBe(CATS);
    expect(applyCategoryConfig(CATS, {})).toBe(CATS);
  });

  it('hides a field, removing it from its category\'s fields list', () => {
    const out = applyCategoryConfig(CATS, { fields: { tKvst: { hidden: true } } });
    const ops = out.find(c => c.key === 'ops');
    expect(ops.fields.map(f => f.k)).toEqual(['tOepe']);
  });

  it('moves a field from one category into another, carrying it along with the destination category\'s own fields', () => {
    const out = applyCategoryConfig(CATS, { fields: { tHeadcount: { group: 'ops' } } });
    const ops = out.find(c => c.key === 'ops');
    expect(ops.fields.map(f => f.k)).toEqual(expect.arrayContaining(['tOepe', 'tKvst', 'tHeadcount']));
    expect(out.find(c => c.key === 'people')).toBeUndefined(); // now empty, dropped
  });

  it('a renamed category keeps a real icon (borrowed from its original category), not a blank one', () => {
    const out = applyCategoryConfig(CATS, { groups: { ops: { label: 'Operations' } } });
    const renamed = out.find(c => c.label === 'Operations');
    expect(renamed.icon).toBe('⚡');
    expect(renamed.fields.map(f => f.k)).toEqual(['tOepe', 'tKvst']);
  });

  it('an entirely emptied category (every field hidden) is dropped from the output, not left as an empty shell', () => {
    const out = applyCategoryConfig(CATS, { fields: { tHeadcount: { hidden: true } } });
    expect(out.find(c => c.key === 'people')).toBeUndefined();
  });
});
