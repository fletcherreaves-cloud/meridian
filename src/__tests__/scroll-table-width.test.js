// @ts-nocheck
// Guards against the table-cut-off variant of the #192 P1 modal/scroll defect class.
//
// WHY: `div({style:{overflowX:'auto'}}, h('table',{style:{width:'100%',...}}))` looks like it
// should scroll horizontally when the table gets too wide for its wrapper — but `width:'100%'`
// caps the table AT the wrapper's width, so there is never anything to scroll. The browser's
// table auto-layout compresses/shrinks columns instead, and fields visually cut off with no
// escape hatch — exactly the symptom reported against the EOM FOB/District-Summary tables
// (#192, 2026-08-11), and it recurred four times in the same file before anyone noticed.
//
// The fix that actually works, already used correctly elsewhere in this codebase
// (analytics.js's MonthlyProjectionsPanel table): give the table `width:'max-content'` (grow to
// natural content width, never squeezed) plus a `minWidth` floor (`'100%'` or a px value) so it
// still fills the container when there's room. A table with `width:'100%'` and no `minWidth` at
// all is the broken shape.
//
// This is a textual scan, not an AST — it approximates "a <table> style block inside an
// overflowX:'auto' wrapper" by windowing forward from each overflowX:'auto' to the next table's
// style object. False negatives are possible (an unusual layout could dodge the window); a false
// positive is caught immediately by whoever touches that file next. Same tradeoff as the loader
// field map and sync-failure-watch tests — a hand-written check beats no check.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIRS = ['src/views', 'src/features'];
const WINDOW = 600; // chars scanned forward from each overflowX:'auto' for a table's style block

/** Sites where a wide table intentionally has no minWidth on the TABLE itself (documented, not
 * an oversight) — the scan only checks the table's own style block, so it can't see a minWidth
 * expressed per-column instead. */
const EXEMPT = {
  'src/views/scheduling.js:179': 'StoreScheduleTable — each column already carries its own ' +
    'minWidth (cols[].w, summing to 734px), which forces the table past width:100% exactly like ' +
    'a table-level minWidth would; there is nothing to fix here.',
};

function jsFiles(dir) {
  return readdirSync(dir).filter(f => f.endsWith('.js')).map(f => join(dir, f));
}

/** Extract the balanced {...} starting at the '{' found at or after `from`. Null if unbalanced. */
function extractBraces(text, from) {
  const start = text.indexOf('{', from);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** Every `overflowX: 'auto'` site in a file's text, as 1-based line numbers. */
function overflowXSites(text) {
  const sites = [];
  const re = /overflowX:\s*['"]auto['"]/g;
  let m;
  while ((m = re.exec(text))) sites.push(m.index);
  return sites;
}

function lineOf(text, idx) {
  return text.slice(0, idx).split('\n').length;
}

/** For each overflowX:'auto' site, find the next table's style block within WINDOW chars. */
function violationsIn(file, text) {
  const out = [];
  for (const idx of overflowXSites(text)) {
    const window = text.slice(idx, idx + WINDOW);
    const tableAt = window.search(/['"]table['"]/);
    if (tableAt === -1) continue; // no table follows closely — not this pattern
    const styleAt = window.indexOf('style:', tableAt);
    if (styleAt === -1) continue;
    const styleBlock = extractBraces(window, styleAt);
    if (!styleBlock) continue;
    const hasFullWidth = /width:\s*['"]100%['"]/.test(styleBlock);
    const hasMinWidth = /minWidth/.test(styleBlock);
    if (hasFullWidth && !hasMinWidth) {
      out.push(`${file}:${lineOf(text, idx)}`);
    }
  }
  return out;
}

describe('a table inside an overflowX:auto wrapper always has a minWidth', () => {
  it('finds no table that width:100% locks to its wrapper with nothing to scroll to', () => {
    const found = [];
    for (const dir of DIRS) {
      for (const file of jsFiles(dir)) {
        const text = readFileSync(file, 'utf8');
        for (const site of violationsIn(file, text)) {
          if (!(site in EXEMPT)) found.push(site);
        }
      }
    }
    expect(found,
      'Table(s) with width:\'100%\' and no minWidth inside an overflowX:\'auto\' wrapper — this ' +
      'can never actually scroll; the browser shrinks/cuts off columns instead (#192). Fix: ' +
      'width:\'max-content\', minWidth:\'100%\' (or a px minWidth), matching analytics.js\'s ' +
      'MonthlyProjectionsPanel table. To exempt a genuine exception, add it to EXEMPT with a reason.',
    ).toEqual([]);
  });

  it('finds a non-trivial number of overflowX:auto sites — guards the scan itself', () => {
    let total = 0;
    for (const dir of DIRS) for (const file of jsFiles(dir)) total += overflowXSites(readFileSync(file, 'utf8')).length;
    expect(total).toBeGreaterThanOrEqual(30);
  });
});
