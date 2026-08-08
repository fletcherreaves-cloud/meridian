import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { weekStartOf, weekKeyOf, setWeekStartDay, mwStart } from '../utils/date.js';

// ── The week-start bug class ────────────────────────────────────────────────
// An audit on 2026-08-08 found 23 distinct week-boundary computations across 13 files:
// 8 correct, 1 with the subtraction inverted, 12 hardcoding a day, 2 with no calendar
// alignment at all. The org's setting is WEDNESDAY (DEF_SETTINGS.weekStartDay = 3), so
// every Monday/Sunday-hardcoded site was visibly wrong and every Wednesday-hardcoded one
// was right only by coincidence.
//
// The root cause was structural: src/utils/date.js exported mwStart() — "the week
// containing TODAY" — but nothing for "the week containing an arbitrary date". So 22 call
// sites hand-rolled it. The same defect had already been fixed twice, per-panel, and
// survived both times because no shared helper was extracted.
//
// weekStartOf() is now that helper. These tests pin its behaviour and keep a census of
// the remaining hand-rolled sites so the number can only go DOWN.

const SRC = new URL('../', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p);
  return p.endsWith('.js') ? [p] : [];
});

describe('weekStartOf', () => {
  it('honours each configured week start', () => {
    const fri = new Date('2026-08-07T12:00:00');            // a Friday
    expect(weekKeyOf(fri, 3)).toBe('2026-08-05');           // Wed
    expect(weekKeyOf(fri, 1)).toBe('2026-08-03');           // Mon
    expect(weekKeyOf(fri, 0)).toBe('2026-08-02');           // Sun
  });

  it('returns the date itself when it IS the week start', () => {
    expect(weekKeyOf(new Date('2026-08-05T12:00:00'), 3)).toBe('2026-08-05');
  });

  it('crosses a month boundary correctly', () => {
    // Mon 2026-08-03 with a Wednesday start belongs to the week beginning in JULY.
    expect(weekKeyOf(new Date('2026-08-03T12:00:00'), 3)).toBe('2026-07-29');
  });

  it('is stable across every day of a week — all 7 map to one start', () => {
    const days = ['2026-08-05','2026-08-06','2026-08-07','2026-08-08',
                  '2026-08-09','2026-08-10','2026-08-11'];
    const starts = new Set(days.map(d => weekKeyOf(new Date(d + 'T12:00:00'), 3)));
    expect([...starts]).toEqual(['2026-08-05']);
  });

  it('falls back to the module setting when no override is given', () => {
    setWeekStartDay(1);
    expect(weekKeyOf(new Date('2026-08-07T12:00:00'))).toBe('2026-08-03');
    setWeekStartDay(3);
    expect(weekKeyOf(new Date('2026-08-07T12:00:00'))).toBe('2026-08-05');
  });

  it('mwStart still answers "the week containing today"', () => {
    setWeekStartDay(3);
    expect(weekKeyOf(new Date(), 3)).toBe(mwStart().toISOString().slice(0, 10));
  });

  it('accepts a date string as well as a Date', () => {
    expect(weekKeyOf('2026-08-07T12:00:00', 3)).toBe('2026-08-05');
  });
});

describe('census of hand-rolled week boundaries', () => {
  // Not a ban — several remaining sites are legitimate or not yet migrated. This pins the
  // COUNT so the number can only go down. If you add a new hand-rolled week boundary this
  // fails; use weekStartOf() instead. If you migrate one, lower the number.
  const PATTERNS = [
    /getDay\(\)\s*\+\s*6\)\s*%\s*7/,                 // ISO-Monday idiom
    /setDate\([^)]*getDate\(\)\s*-\s*[a-z]*\.?getDay\(\)/i,  // subtract getDay() → Sunday
    /\(\s*3\s*-\s*[a-z]+\.getDay\(\)\s*\+\s*7\s*\)\s*%\s*7/, // hardcoded Wed
    /while\s*\([a-z]+\.getDay\(\)\s*!==/,            // walk-back-to-day loop
  ];

  it('has not grown', () => {
    const hits = [];
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (line.trim().startsWith('//')) return;
        if (PATTERNS.some(re => re.test(line))) {
          hits.push(`${file.replace(SRC, 'src/')}:${i + 1}`);
        }
      });
    }
    // Baseline MEASURED 2026-08-08 after migrating shell.js and labor-analysis.js — 9,
    // not a round guess. Eight are in analytics.js and use the setting-aware
    // `while (d.getDay() !== wsd)` idiom, so they are correct-but-hand-rolled; the ninth
    // (record-day.js:173) hardcodes Sunday and IS still a live bug.
    // Lower this as sites migrate to weekStartOf(); never raise it.
    expect(hits.length,
      `hand-rolled week boundaries (use weekStartOf instead):\n${hits.join('\n')}`)
      .toBeLessThanOrEqual(9);
  });
});
