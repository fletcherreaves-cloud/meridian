// @ts-nocheck
// #242 — pre-emptive guard, no live bug today (see engine/salaried-coverage.js's header for the
// #241 measurement this protects against: only 4 of 27 stores have complete salaried-manager
// data; reading total_hours/gross_dollars/salaried_manager_* naively elsewhere produces numbers
// wrong in an invisible direction, not a missing one). This test asserts no module outside the
// classifier itself reads these fields directly — the same source-parse shape as #231's dead-prop
// guard, which caught a class of bug invisible to behavioural tests. Currently 0 real consumers
// (#241's own "current state, verified" table), so this should stay green until #211's Labor
// instantiation reaches for one of these fields WITHOUT going through salariedCoverage() first —
// exactly the failure this guard exists to catch.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/engine', 'src/views', 'src/lib', 'src/features', 'src/app'];
// changelog-latest.js and everything under src/app/changelog/ are prose DATA files, not code —
// they describe this very guard by name (a changelog entry naming all four fields, or a future
// one), which would otherwise self-trigger. R6 (dispatch16) split the old single
// changelog-data.js into one file per version under src/app/changelog/, so the exclusion is now
// a path prefix rather than one filename.
const ALLOWED_FILES = new Set(['src/engine/salaried-coverage.js', 'src/app/changelog-latest.js']);
const ALLOWED_PREFIX = 'src/app/changelog/';
// \.total_hours\b requires a literal dot immediately before "total_hours" — it does NOT match
// `.over_time_total_hours` (the already-verified-safe OT field, #242's "current state" table),
// since the text right after the dot there is "over_time_total_hours", not "total_hours".
const FORBIDDEN = [
  { name: 'total_hours', re: /\.total_hours\b/g },
  { name: 'gross_dollars', re: /\.gross_dollars\b/g },
  { name: 'salaried_manager_hours', re: /\.salaried_manager_hours\b/g },
  { name: 'salaried_manager_dollars', re: /\.salaried_manager_dollars\b/g },
];

function collectJsFiles(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const entry of entries) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collectJsFiles(p));
    else if (entry.endsWith('.js') && !entry.endsWith('.test.js')) out.push(p);
  }
  return out;
}

describe('salaried-manager fields (total_hours/gross_dollars/salaried_manager_*) stay behind salariedCoverage() (#242)', () => {
  const files = ROOTS.flatMap(collectJsFiles).filter(f => !ALLOWED_FILES.has(f) && !f.startsWith(ALLOWED_PREFIX));

  it('found a non-trivial number of source files to scan (sanity check)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const { name, re } of FORBIDDEN) {
    it(`no file outside salaried-coverage.js reads .${name} directly`, () => {
      const hits = [];
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        re.lastIndex = 0;
        if (re.test(src)) hits.push(f);
      }
      expect(hits, `unguarded .${name} read(s) in: ${hits.join(', ')} — route through salariedCoverage()/deriveIfSalariedComplete() from engine/salaried-coverage.js instead`).toEqual([]);
    });
  }
});
