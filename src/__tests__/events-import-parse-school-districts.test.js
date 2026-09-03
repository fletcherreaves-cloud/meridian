// @ts-nocheck
// events-import.js's parseSchoolDistricts had zero direct test coverage despite being live:
// called from src/features/calendar.js's bulk-import flow and directly from the live seed
// script scripts/seed-org-events.mjs. urlByRowIndex is keyed by the FILTERED row index (skipped
// rows don't consume a slot) -- verified this matches how both call sites build that map
// (calendar.js's _urlMap / seed-org-events.mjs's urlMapFor both increment a filtered counter),
// so this isn't a hidden mismatch, just a convention the test locks in.
import { describe, it, expect } from 'vitest';
import { parseSchoolDistricts } from '../engine/events-import.js';

const HEADER = ['Store#', 'City', 'State', 'District', 'First Day', 'Last Day', 'Start', 'Stop', 'Status', 'URL'];

describe('parseSchoolDistricts', () => {
  it('returns [] for missing rows or a header-only sheet', () => {
    expect(parseSchoolDistricts(null)).toEqual([]);
    expect(parseSchoolDistricts([HEADER])).toEqual([]);
  });

  it('skips the header row and parses a data row', () => {
    const rows = [HEADER, ['3708', 'Ada', 'OK', 'Ada Public Schools', '2026-08-15', '2027-05-22', '8:00', '3:15', 'Confirmed', 'ignored']];
    const out = parseSchoolDistricts(rows);
    expect(out).toEqual([{
      loc: '3708', city: 'Ada', state: 'OK', district: 'Ada Public Schools',
      firstDay: '2026-08-15', lastDay: '2027-05-22', startTime: '8:00', stopTime: '3:15',
      verification: 'Confirmed', url: null,
    }]);
  });

  it('strips non-digit characters from the store number', () => {
    const rows = [HEADER, ['#3708', 'Ada', 'OK', 'D', '', '', '', '', '', '']];
    expect(parseSchoolDistricts(rows)[0].loc).toBe('3708');
  });

  it('extracts a YYYY-MM-DD date out of a noisier date cell and returns null when absent', () => {
    const rows = [HEADER, ['3708', 'Ada', 'OK', 'D', 'Mon 2026-08-15 (est)', 'TBD', '', '', '', '']];
    const out = parseSchoolDistricts(rows)[0];
    expect(out.firstDay).toBe('2026-08-15');
    expect(out.lastDay).toBeNull();
  });

  it('normalizes verification to "Confirmed" case-insensitively, else passes the raw value through', () => {
    const rows = [HEADER,
      ['1', 'A', 'OK', 'D', '', '', '', '', 'CONFIRMED', ''],
      ['2', 'A', 'OK', 'D', '', '', '', '', 'Pending', ''],
      ['3', 'A', 'OK', 'D', '', '', '', '', '', ''],
    ];
    const out = parseSchoolDistricts(rows);
    expect(out[0].verification).toBe('Confirmed');
    expect(out[1].verification).toBe('Pending');
    expect(out[2].verification).toBeNull();
  });

  it('filters out rows with an empty or null store number, without breaking the filtered url index', () => {
    const rows = [HEADER,
      ['', 'skip', 'OK', 'D', '', '', '', '', '', ''],
      ['3708', 'Ada', 'OK', 'D', '', '', '', '', '', ''],
      ['3709', 'Holdenville', 'OK', 'D', '', '', '', '', '', ''],
    ];
    // filtered index 0 -> the first surviving row (3708), not the skipped blank row.
    const out = parseSchoolDistricts(rows, { 0: 'https://example.com/3708', 1: 'https://example.com/3709' });
    expect(out.map(d => d.loc)).toEqual(['3708', '3709']);
    expect(out[0].url).toBe('https://example.com/3708');
    expect(out[1].url).toBe('https://example.com/3709');
  });
});
