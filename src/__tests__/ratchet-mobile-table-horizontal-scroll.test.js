// @ts-nocheck
// R-mobile-scroll (dispatch119, 2026-08-25) — a wide table's scroll wrapper must not leave the
// horizontal axis effectively `hidden`.
//
// Owner-reported real bug, verbatim: "Throughout environment > need to add side scroll to be
// able to see all data on mobile. > Reference Promo Discount ROI." src/views/promo-roi.js's
// results table wrapper was `{ overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }` directly
// wrapping `h('table', { style: { width: '100%' } }, ...)`. The `overflow` SHORTHAND sets both
// axes to `hidden`; overriding only `overflowY` leaves the horizontal axis at the shorthand's
// `hidden` value — on a narrow viewport, table columns that don't fit are clipped with NO way to
// reach them (no scrollbar, no swipe, confirmed with a real wheel-scroll simulation: `scrollLeft`
// stayed at 0 after a horizontal wheel event pre-fix, and moved to the container's max after).
// Fixed by adding `overflowX: 'auto'` alongside the existing `overflowY: 'auto'`, and letting the
// table size to its content (`width:'max-content', minWidth:'100%'`) instead of `width:'100%'`
// (which was masking the fact the row content needed more room than the container had).
//
// SCOPE: src/views/ + src/features/, same two layers dispatch16's R1 / R7 already established as
// "panel" layers for this codebase's ratchets.
//
// ⚠️ THE DISPATCH'S OWN INVESTIGATION NUMBER IS NOT TRUSTWORTHY — DO NOT REUSE IT. dispatch-119.md
// records a same-FILE co-occurrence grep (`overflow:'hidden'` anywhere in a file that also
// contains `h('table'` anywhere in the same file) finding 13 files, and explicitly flags that
// count as "a rough same-file co-occurrence heuristic, not a verified live-bug count" — most of
// those 243 raw `overflow:'hidden'` sites in src/views+src/features (measured 2026-08-25) are
// unrelated to any table (badges, borders, image/avatar clipping, modal-shell cards); the loose
// heuristic even MISSED promo-roi.js's own confirmed bug (its `overflow:'hidden'` and `h('table'`
// happen to be far enough apart in bytes that some greps of that shape skip it, and simple
// same-file co-occurrence proves nothing about which container actually wraps which table
// anyway). This file's detector instead: (1) finds each shorthand `overflow:'hidden'` style
// value via brace-matching (not line-regex, since these span multiple lines), (2) confirms no
// `overflowX` sits in that same style object, (3) walks that element's own sibling argument list
// at paren/brace/bracket depth 0 (i.e. DIRECT children of the same call, not descendants buried
// inside another child element) for the start of an `h('table'`/`h("table"` call. Depth-0 sibling
// scan (not "must be the literal first argument") is deliberate — dt-speedofservice.js's two real
// hits below have a header `div` before the table as a sibling, which is still "this container
// directly wraps a table" in the sense that matters (nothing between them re-scopes overflow).
//
// Verified against the real bug, not just reasoned about: run against `git show
// HEAD~1:src/views/promo-roi.js` (the pre-fix commit) the detector below reports exactly 1 hit,
// at the pre-fix results-table line; run against the post-fix file it reports 0. Both self-tests
// further down encode that as fixtures so the detector's own correctness doesn't depend on the
// live tree.
//
// BOTH DIRECTIONS matter (ratchet-modal-backdrop-bypass.test.js's precedent, itself citing
// ratchet-raw-metric-rows.test.js — never copy a number from a dispatch/plan doc into a CEILING;
// this one was measured fresh on this branch, AFTER promo-roi.js's fix, not copied from
// dispatch-119.md):
//   - count > CEILING → FAIL, naming the new file:line (a new hidden-horizontal-axis table wrap)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (stale ceiling = silent loss of
//     protection — this is exactly the shape of bug this ratchet exists to catch if a future fix
//     removes one of the two known dt-speedofservice.js instances)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/views', 'src/features'];

// Measured fresh on this dispatch's own branch, 2026-08-25, AFTER fixing promo-roi.js's results
// table (the only file this dispatch's scope permits changing — see dispatch-119.md item 3, "fix
// Promo/Discount ROI only"). The two remaining hits are src/views/dt-speedofservice.js's Store
// Ranking and By Hour tables (~line 511, ~554) — real instances of the same shape, left for
// opportunistic fixing next time that panel is touched (memory/panel-contract.md's standing
// rule), not fixed here per this dispatch's explicit "do not fix all candidate files" scope.
const CEILING = 2;

function enclosingBraces(text, pos) {
  let depth = 0, start = -1;
  for (let i = pos; i >= 0; i--) {
    const c = text[i];
    if (c === '}') depth++;
    else if (c === '{') { if (depth === 0) { start = i; break; } depth--; }
  }
  if (start === -1) return null;
  depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return [start, i]; }
  }
  return null;
}

// From `startPos` (just after a container's props-object closes), scan its remaining sibling
// arguments at paren/brace/bracket depth 0 — i.e. direct children of that same call, not
// descendants nested inside another child element — for the start of an `h('table'`/`h("table"`
// call. Stops (returns false) once depth goes negative, i.e. the outer call itself has closed.
function directChildIsTable(text, startPos) {
  let depth = 0;
  const limit = Math.min(text.length, startPos + 8000);
  for (let i = startPos; i < limit; i++) {
    if (depth === 0 && (text.startsWith("h('table'", i) || text.startsWith('h("table"', i))) return true;
    const c = text[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') { depth--; if (depth < 0) return false; }
  }
  return false;
}

// Exported shape so both the live-tree scan and the fixture self-tests share one implementation.
function findHitsInSource(text, label) {
  const hits = [];
  const re = /overflow:\s*['"]hidden['"]/g;
  let m;
  while ((m = re.exec(text))) {
    // "overflow:" exactly — not a match landing inside "overflowY:"/"overflowX:" (defensive;
    // the regex already requires the literal string "overflow:", but guard the char before it).
    const before = text[m.index - 1];
    if (before && /[A-Za-z0-9_]/.test(before)) continue;

    const styleBounds = enclosingBraces(text, m.index);
    if (!styleBounds) continue;
    const [sStart, sEnd] = styleBounds;
    const styleSrc = text.slice(sStart, sEnd + 1);
    // The horizontal axis must be left un-overridden — an explicit overflowX anywhere in this
    // same style object means the container is NOT the anti-pattern, regardless of its value.
    if (/overflowX\s*:/.test(styleSrc)) continue;

    // Walk out to the element's props object (`{ style: {...}, ... }`) this style value lives in.
    const outerBounds = enclosingBraces(text, sStart - 1);
    const oEnd = outerBounds ? outerBounds[1] : sEnd;

    if (directChildIsTable(text, oEnd + 1)) {
      const line = text.slice(0, m.index).split('\n').length;
      hits.push(`${label}:${line}`);
    }
  }
  return hits;
}

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
      hits.push(...findHitsInSource(readFileSync(file, 'utf8'), file));
    }
  }
  return hits;
}

describe('R-mobile-scroll: a table\'s scroll wrapper must not leave overflowX at the shorthand\'s hidden', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — add overflowX:'auto' alongside overflowY (and size the table to its content, not width:'100%') instead of leaving the overflow shorthand's hidden on the horizontal axis`, () => {
    const hits = findHits();
    if (hits.length > CEILING) {
      throw new Error(
        `${hits.length} table wrapper(s) with the horizontal axis left effectively hidden in ` +
        `src/views + src/features, ${hits.length - CEILING} more than the ceiling of ${CEILING}. ` +
        `New site(s):\n${hits.join('\n')}\n\n` +
        `Give the scroll container overflowX:'auto' alongside its overflowY, and let the table ` +
        `size to its content (minWidth:'100%' + natural column sizing, not width:'100%') so wide ` +
        `columns become horizontally scrollable instead of clipped — see dispatch #119 / ` +
        `src/views/promo-roi.js for the reference fix.`
      );
    }
    if (hits.length < CEILING) {
      throw new Error(
        `Only ${hits.length} such table wrapper(s) remain (ceiling was ${CEILING}) — some site(s) ` +
        `were fixed since the ceiling was last set. Lower CEILING to ${hits.length} in this file ` +
        `so the ratchet doesn't leave slack for the class to regrow into. This is not a bug in ` +
        `your change; it's this ratchet's own upkeep.`
      );
    }
    expect(hits.length).toBe(CEILING);
  });

  it('sanity: the live count matches the two known dt-speedofservice.js instances (would false-pass if the detector broke)', () => {
    const hits = findHits();
    expect(hits.filter(h => h.startsWith('src/views/dt-speedofservice.js:')).length).toBe(2);
  });

  // Detector self-tests — fixture-based, so the detector's own correctness doesn't depend on the
  // live tree ever containing (or continuing to contain) a real instance. The first fixture is
  // promo-roi.js's actual pre-fix results-table line (verified: this detector reports exactly 1
  // hit against `git show HEAD~1:src/views/promo-roi.js`, the real pre-fix commit, at its real
  // line — this string is that same shape, not a synthetic invention).
  it('detects the confirmed pre-fix promo-roi.js shape', () => {
    const fixture = `
    rows.length ? h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, th('Store')))))
    : null,`;
    expect(findHitsInSource(fixture, 'fixture').length).toBe(1);
  });

  it('does NOT flag the same shape once overflowX is set (the actual promo-roi.js fix)', () => {
    const fixture = `
    rows.length ? h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto', overflowX: 'auto' } },
      h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, th('Store')))))
    : null,`;
    expect(findHitsInSource(fixture, 'fixture').length).toBe(0);
  });

  it('detects a table one sibling over from a header (the real dt-speedofservice.js shape)', () => {
    const fixture = `
      div({ style:{ flex:'3 1 380px', background:'var(--surf2)', border:'.5px solid var(--bdr)',
        borderRadius:'var(--r)', overflow:'hidden' }},
        div({ style:{ padding:'8px 12px' }}, 'Store Ranking'),
        h('table', { style:{ width:'100%', borderCollapse:'collapse' }},
          h('thead', null, h('tr', null, h('th', null, 'Store')))))`;
    expect(findHitsInSource(fixture, 'fixture').length).toBe(1);
  });

  it('does NOT flag a table nested inside another child element (not a direct sibling)', () => {
    const fixture = `
      div({ style:{ overflow:'hidden' }},
        div({ style:{ padding:8 }},
          h('table', { style:{ width:'100%' }}, h('thead', null))))`;
    expect(findHitsInSource(fixture, 'fixture').length).toBe(0);
  });

  it('does NOT flag overflow:hidden containers unrelated to any table', () => {
    const fixture = `
      div({ style:{ display:'flex', height:8, borderRadius:4, overflow:'hidden' }},
        div({ style:{ width: pct + '%', background: '#10b981' }}))`;
    expect(findHitsInSource(fixture, 'fixture').length).toBe(0);
  });
});
