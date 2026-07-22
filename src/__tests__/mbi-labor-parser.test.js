import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMbiLaborAnalysis, detectType } from '../parsers/index.js';

// Real rows extracted from MBI_Labor_Analysis.xlsx (3 header rows + 5 stores +
// one "Sub Total (OK)" roll-up row that MUST be skipped).
const rows = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/mbi-labor-sample.json', import.meta.url)), 'utf8'));
const parsed = parseMbiLaborAnalysis(rows);
const byLoc = Object.fromEntries(parsed.stores.map(s => [s.loc, s]));

describe('MBI parser — week + roster', () => {
  it('reads the week range from the header', () => {
    expect(parsed.weekStart).toBe('2026-07-15');
    expect(parsed.weekEnd).toBe('2026-07-21');
  });
  it('skips subtotal/roll-up rows, keeps only numeric-loc stores', () => {
    expect(parsed.stores.map(s => s.loc).sort()).toEqual(['18213', '3708', '43701', '5183', '6178']);
    expect(byLoc['Sub Total (OK)']).toBeUndefined();
  });
  it('uses unpadded loc keys (matches STORE_NAMES)', () => {
    expect(byLoc['3708']).toBeTruthy();
  });
});

describe('MBI parser — Band-1 LifeLenz inputs (store 3708)', () => {
  const b = byLoc['3708'].band1;
  it('captures the numeric inputs verbatim', () => {
    expect(b.salesFcst).toBeCloseTo(74379, 0);
    expect(b.laborPctActual).toBeCloseTo(0.2519, 3);
    expect(b.gcFcst).toBe(7443);
    // Hours are [h]:mm durations → converted to real hours (×24): 62.52 → 1500.5
    expect(b.hoursSched).toBeCloseTo(1500.5, 1);
    expect(b.hoursFcst).toBeCloseTo(1109.0, 0);
    expect(b.rate).toBeCloseTo(13.14, 1);
    expect(b.laborTargetOrg).toBeCloseTo(0.215, 3);
  });
});

describe('MBI parser — hours of operation deciphered to 7 weekdays', () => {
  it('3708: Sun-Thu 5a-10p (17h), Fri-Sat 5a-12a (19h)', () => {
    const h = byLoc['3708'].config.hours;
    expect(h.sun.hours).toBeCloseTo(17, 1);
    expect(h.thu.hours).toBeCloseTo(17, 1);
    expect(h.fri.hours).toBeCloseTo(19, 1);
    expect(h.sat.hours).toBeCloseTo(19, 1);
    expect(h.mon.hours).toBeCloseTo(17, 1);
    // open/close resolved from the day bands
    expect(h.fri.open).toBeCloseTo(5 / 24, 3);   // 5:00 AM
  });
  it('43701: 24-hour every day', () => {
    const c = byLoc['43701'].config;
    expect(c.is24hr).toBe(true);
    expect(Object.values(c.hours).every(d => d.hours === 24)).toBe(true);
  });
  it('5183: 24-hr weekend nuance — Fri ~23h, Sat 24h, and note preserved', () => {
    const c = byLoc['5183'].config;
    expect(c.hours.fri.hours).toBeCloseTo(23, 1);
    expect(c.hours.sat.hours).toBeCloseTo(24, 1);
    expect(c.is24Note).toMatch(/W\/E/i);
  });
  it('18213: half-hour open resolves (Mon-Sat 5:30a-10p = 16.5h)', () => {
    const h = byLoc['18213'].config.hours;
    expect(h.mon.hours).toBeCloseTo(16.5, 1);
    expect(h.mon.open).toBeCloseTo(5.5 / 24, 3);
  });
});

describe('MBI parser — config fixed-hours passthrough', () => {
  it('carries 24hr note and defaults missing gathered inputs to null', () => {
    const c = byLoc['3708'].config;
    expect(c.is24hr).toBe(false);
    expect(c).toHaveProperty('maintHours');
    expect(c).toHaveProperty('prepHours');
    expect(c).toHaveProperty('lobbyHours');
  });
});

describe('MBI parser — filename detection', () => {
  it('routes MBI_Labor_Analysis.xlsx to mbi-labor (not generic labor)', () => {
    expect(detectType('MBI_Labor_Analysis.xlsx', {}).type).toBe('mbi-labor');
  });
  it('does not hijack plain Labor Analysis files', () => {
    expect(detectType('Labor_Analysis_2026-07-15_to_2026-07-21.xlsx', {}).type).not.toBe('mbi-labor');
  });
});
