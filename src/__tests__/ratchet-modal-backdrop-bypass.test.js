// @ts-nocheck
// R7 (dispatch30, 2026-08-19) — panels must not hand-roll ModalShell's own backdrop.
//
// Dispatch #26 (Workstream D) measured ModalShell adoption stuck at 9/55 despite three
// workstreams' worth of merged PRs touching at-a-glance.js/calendar.js since it was written —
// nobody was reaching for the shared shell. Dispatch #30 re-measured it unchanged at 9/56 and
// found the freshest panel in the codebase (labor-allocation.js, merged the SAME session as the
// re-measurement) proving why: it rolled its own backdrop/card/close-button from scratch rather
// than importing ModalShell, in the exact shape ModalShell already standardizes
// (src/components/ModalShell.js's own header: "Measured from src/views/*.js: backdrop
// rgba(0,0,0,.82) is the most common value app-wide"). This ratchets that exact bypass signature
// — a hand-rolled `position:'fixed', inset:0, background:'rgba(0,0,0...` backdrop, the thing
// ModalShell exists to replace — so the count can only go DOWN from here.
//
// SCOPE: src/views/ + src/features/, same two layers dispatch16's R1 already established as
// "panel" layers for this codebase's ratchets. ModalShell.js/RoutePanelShell itself is excluded
// by ROOT (it's in src/components/, not walked) — the pattern legitimately lives there once.
//
// BOTH DIRECTIONS matter (ratchet-raw-metric-rows.test.js's own precedent, cited again here
// since this is a fresh ratchet copying that file's exact shape):
//   - count > CEILING → FAIL, naming the new file:line (a new hand-rolled backdrop crept in)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (stale ceiling = silent loss of
//     protection — the two hand conversions this same dispatch did (report-subscriptions.js,
//     labor-allocation.js's dead standalone-modal path) are exactly why this seed is 78, not 80)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/views', 'src/features'];
// Measured fresh against this dispatch's own branch, 2026-08-19, AFTER converting
// report-subscriptions.js and labor-allocation.js's standalone-modal branch to ModalShell —
// per the standing rule (ratchet-raw-metric-rows.test.js's own header, and dispatch26's own
// explicit instruction) to never copy a number from a dispatch/plan doc into a CEILING.
const CEILING = 78;

const PATTERN = /position:\s*['"]fixed['"]\s*,\s*inset:\s*0\s*,\s*background:\s*['"]rgba\(0,0,0/;

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
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
      lines.forEach((line, i) => { if (PATTERN.test(line)) hits.push(`${file}:${i + 1}`); });
    }
  }
  return hits;
}

describe('R7: panels must not hand-roll ModalShell\'s own backdrop', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — use ModalShell (or RoutePanelShell for a route:true panel) instead of a hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop`, () => {
    const hits = findHits();
    if (hits.length > CEILING) {
      throw new Error(
        `${hits.length} hand-rolled modal backdrops in src/views + src/features, ${hits.length - CEILING} more ` +
        `than the ceiling of ${CEILING}. New site(s):\n${hits.join('\n')}\n\n` +
        `Use ModalShell (src/components/ModalShell.js) instead of hand-rolling the backdrop/card/close ` +
        `pattern it already standardizes — see dispatch #26/#30 (Workstream D).`
      );
    }
    if (hits.length < CEILING) {
      throw new Error(
        `Only ${hits.length} hand-rolled modal backdrops remain (ceiling was ${CEILING}) — some site(s) ` +
        `were converted to ModalShell since the ceiling was last set. Lower CEILING to ${hits.length} in ` +
        `this file so the ratchet doesn't leave slack for the class to regrow into. This is not a bug in ` +
        `your change; it's this ratchet's own upkeep.`
      );
    }
    expect(hits.length).toBe(CEILING);
  });

  it('sanity: the pattern actually matches something (would false-pass if the regex broke)', () => {
    expect(findHits().length).toBeGreaterThan(0);
  });
});
