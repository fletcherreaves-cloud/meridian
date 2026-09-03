// @ts-nocheck
// R3 (dispatch16, 2026-08-18) — panels must not re-derive week/day-of-week arithmetic with a
// bare `.getDay()` call.
//
// CLAUDE.md's "THE BUSINESS DAY RUNS 4:00am -> 4:00am" rule says week-start alignment must go
// through settings.weekStartDay and businessDate()/lastClosedBusinessDay() (src/utils/date.js) —
// never raw getDay() arithmetic re-derived inline. Issue #367 is this exact bug shipping: a "DI
// Compare" panel landed dates on the wrong day because `(3 - getDay() + 7) % 7` used forward
// distance with a doubled subtraction. It recurred more than once before this ratchet existed
// because nothing checkable enforced "use the shared helper" — each occurrence looked like a
// harmless one-off inline calculation until it silently mixed calendar-week and business-week
// boundaries.
//
// EXEMPTION: src/engine/schedule-summary.js's weekStartOf() is NOT a violation — that file IS
// the shared helper itself, not something to ban. (It also lives in src/engine/, which is
// outside this test's ROOT anyway, but the exemption is stated here explicitly so nobody widens
// ROOT to include src/engine/ "to be thorough" and then has to rediscover this.) Note
// src/views/schedule-summary.js is a DIFFERENT file (the panel that renders the summary this
// helper builds) and IS in scope — its own getDay() call is counted below like any other panel.
//
// BOTH DIRECTIONS matter, same as sync-failure-watch.test.js, light-mode-white-alpha.test.js,
// and ratchet-raw-metric-rows.test.js (R1) — the only ratchets in this repo whose bug class has
// never recurred since they shipped:
//   - count > CEILING → FAIL, naming the new file:line (a violation crept in)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (a stale ceiling is silent loss
//     of protection — a check that runs, passes, and cannot fail in the case it exists for)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/views', 'src/features'];
// Measured fresh against origin/main, 2026-08-18 (re-measured per dispatch16's own instruction
// — the dispatch's own estimate ("~60 occurrences across 14 files at v5.034") was explicitly
// flagged as stale; this run landed on the identical number, so no drift occurred between
// v5.034 and this ratchet's seed commit). 60 bare `.getDay()` calls across 14 files. Every hit
// was inspected: none are comments or an unrelated object's `.getDay` — all are genuine Date
// instances (`d`, `r.date`, `dt`, `t`, `w`, `ws`, `evDate`, `date`, or `new Date(...)`).
// Dispatch #68 (2026-08-22): +2 in labor-tools.js's dowStats — bucketing otHrs/actVsNeed
// per-day-of-week the same way the two adjacent, already-counted laborPct/tpph buckets do
// (this is DOW bucketing of an already-resolved metric series, not week-start/business-day
// boundary math — the bug class this ratchet exists to catch — so it is not itself a
// violation; reviewed and added deliberately).
// Dispatch #134 (2026-08-25): +1 in the new src/views/schedule-retention.js — `DOW[d.date.
// getDay()]` in its per-week "Inspect" daily-detail table, copied verbatim from src/views/
// schedule-summary.js's own already-counted identical line (StoreRow's daily grid). Same
// display-only day-name lookup on an already-resolved rollup() `days[].date`, not week-start/
// business-day boundary arithmetic — reviewed and added deliberately, same as dispatch #68.
// Round-8 backlog sweep (2026-09-03): -1 -- removed src/features/projections.js's dead
// loadLockedProjections/saveLockedProjections/getLockedAmount/lockProjectionWeek/weekKey (zero
// callers anywhere; App.js's own comment already documented them as dead imports shadowed by a
// local implementation). weekKey's own `(day - 3 + 7) % 7` was exactly the re-derive-inline
// pattern this ratchet exists to catch, but it was unreachable dead code, not a live boundary bug.
const CEILING = 62;

const PATTERN = /\.getDay\(\)/g;

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    if (name === '__tests__') return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name.endsWith('.js') && !name.endsWith('.test.js') ? [p] : [];
  });
}

function findHits() {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const matches = line.match(PATTERN);
        if (matches) for (const m of matches) hits.push(`${file}:${i + 1}  ${m}`);
      });
    }
  }
  return hits;
}

describe('R3: panels must not re-derive raw week/day arithmetic (.getDay())', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — route week/day boundaries through settings.weekStartDay + businessDate()/lastClosedBusinessDay() (src/utils/date.js) instead`, () => {
    const hits = findHits();
    if (hits.length > CEILING) {
      throw new Error(
        `${hits.length} raw .getDay() call(s) in src/views/ + src/features/, ${hits.length - CEILING} more ` +
        `than the ceiling of ${CEILING}. New site(s):\n${hits.join('\n')}\n\n` +
        `Use businessDate()/lastClosedBusinessDay() and settings.weekStartDay (src/utils/date.js) instead of ` +
        `re-deriving week/day-of-week math from a bare .getDay() — see CLAUDE.md's "THE BUSINESS DAY RUNS ` +
        `4:00am -> 4:00am" standing rule and issue #367.`
      );
    }
    if (hits.length < CEILING) {
      throw new Error(
        `Only ${hits.length} raw .getDay() call(s) remain in src/views/ + src/features/ (ceiling was ` +
        `${CEILING}) — some site(s) were converted since the ceiling was last set. Lower CEILING to ` +
        `${hits.length} in this file so the ratchet doesn't leave slack for the class to regrow into. This ` +
        `is not a bug in your change; it's this ratchet's own upkeep.`
      );
    }
    expect(hits.length).toBe(CEILING);
  });

  it('sanity: the pattern actually matches something (would false-pass if the regex broke)', () => {
    expect(findHits().length).toBeGreaterThan(0);
  });
});
