// @ts-nocheck
// parsers/index.js's findCol/fcx/parseNum had zero direct test coverage despite being live and
// pervasive: findCol alone appears 100+ times across every report-type parser (labor, ops, cash
// sheet, DAR, etc.), so a regression here has wide blast radius across the whole upload pipeline.
// fcx is exported and used for exact-match header lookups; parseNum (previously unexported) is
// called 60+ times to coerce raw cell values into numbers for every parsed metric.
import { describe, it, expect } from 'vitest';
import { findCol, fcx, parseNum } from '../parsers/index.js';

describe('findCol', () => {
  it('finds an exact (case-insensitive, trimmed) header match first', () => {
    expect(findCol(['Loc', 'Sales', 'GC'], 'sales')).toBe(1);
  });

  it('tries each candidate name in order and returns the first match', () => {
    expect(findCol(['Loc', 'Net Sales'], 'Sales', 'Net Sales')).toBe(1);
  });

  it('normalizes a non-breaking space in the header cell to match a plain-space candidate name', () => {
    const nbspHeader = 'Total' + String.fromCharCode(160) + 'Hrs'; // real QSRSoft exports carry a literal nbsp here
    expect(findCol(['Loc', nbspHeader], 'Total Hrs')).toBe(1);
  });

  it('falls back to a substring match when no exact match exists, for names longer than 3 chars', () => {
    expect(findCol(['Loc', 'Sales (Net)'], 'Sales')).toBe(1);
  });

  it('does not substring-match a name of 3 characters or fewer, even when a real substring exists', () => {
    // 'gctotal' genuinely contains 'gc', but the source's own `if(t.length<=3)continue` skips
    // the substring fallback entirely for short candidate names -- exact match only.
    expect(findCol(['Loc', 'GCTotal'], 'GC')).toBe(-1);
  });

  it('returns -1 when nothing matches any candidate', () => {
    expect(findCol(['Loc', 'Sales'], 'Nonexistent Column')).toBe(-1);
  });

  it('skips null/undefined header cells without throwing', () => {
    expect(findCol(['Loc', null, undefined, 'Sales'], 'sales')).toBe(3);
  });
});

describe('fcx', () => {
  it('finds an exact case-insensitive, trimmed header match', () => {
    expect(fcx(['Loc', ' Sales ', 'GC'], 'sales')).toBe(1);
  });

  it('does NOT substring-match (exact-only, unlike findCol\'s fallback)', () => {
    expect(fcx(['Loc', 'Sales (Net)'], 'Sales')).toBe(-1);
  });

  it('tries multiple candidate names in order', () => {
    expect(fcx(['Loc', 'Net Sales'], 'Sales', 'Net Sales')).toBe(1);
  });

  it('returns -1 when nothing matches', () => {
    expect(fcx(['Loc', 'Sales'], 'Nonexistent')).toBe(-1);
  });

  it('skips falsy header cells without throwing', () => {
    expect(fcx(['Loc', null, 'Sales'], 'sales')).toBe(2);
  });
});

describe('parseNum', () => {
  it('returns 0 for null, undefined, and empty string', () => {
    expect(parseNum(null)).toBe(0);
    expect(parseNum(undefined)).toBe(0);
    expect(parseNum('')).toBe(0);
  });

  it('strips a leading dollar sign and thousands commas before parsing', () => {
    expect(parseNum('$1,234.56')).toBeCloseTo(1234.56, 6);
  });

  it('parses a plain numeric string', () => {
    expect(parseNum('42.5')).toBe(42.5);
  });

  it('passes a raw number through unchanged', () => {
    expect(parseNum(99)).toBe(99);
  });

  it('returns 0 for a non-numeric, unparseable string', () => {
    expect(parseNum('N/A')).toBe(0);
  });

  it('parses a negative dollar amount', () => {
    expect(parseNum('-$5.00')).toBe(-5);
  });
});
