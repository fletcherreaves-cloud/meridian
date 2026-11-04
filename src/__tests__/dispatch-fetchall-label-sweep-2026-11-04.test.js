// @ts-nocheck
// Owner report (screenshot, 2026-11-04): a "DATA INCOMPLETE ... 1 source(s): a data table"
// banner gave no way to tell which of the ~40+ fetchAll()-backed loaders actually failed.
// `fetchAll()`'s own `label` param exists exactly to name the real table in that banner
// (src/lib/supabase.js); when a caller omits it, fetchAll falls back to the literal string
// 'a data table' (its own `_recordDataError(label || 'a data table', ...)` line) and the
// banner becomes useless for diagnosis. A prior pass (2026-11-02, memory/finding-missing-
// lifelenz-tables-2026-11-02.md) fixed ONE call site this way and explicitly deferred "a
// broader sweep" of the rest -- this dispatch is that sweep: 45 call sites were missing a
// label and now pass their real table name. This test is the regression guard so a NEW
// unlabeled fetchAll() call doesn't quietly reopen the same "a data table" banner later --
// per this repo's "would this verification still pass if the change were reverted" rule, it
// scans the real source text (not a reimplementation), so reverting any one of the 45 fixes
// makes it fail.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const SRC = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../lib/supabase.js'),
  'utf8'
);

// Finds every `fetchAll(...)` call (bracket/string-aware, so commas inside nested calls or
// string literals like '.select(\'loc,date\')' never get mistaken for a top-level arg
// boundary), skipping the function's own definition and its internal log-template reference
// to `label`.
function findFetchAllCalls(src) {
  const calls = [];
  let idx = 0;
  while (true) {
    idx = src.indexOf('fetchAll(', idx);
    if (idx === -1) break;
    const openParen = idx + 'fetchAll'.length;
    let depth = 0, j = openParen, inStr = null, esc = false;
    while (j < src.length) {
      const c = src[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === inStr) inStr = null;
      } else {
        if (c === "'" || c === '"' || c === '`') inStr = c;
        else if (c === '(' || c === '{' || c === '[') depth++;
        else if (c === ')' || c === '}' || c === ']') { depth--; if (depth === 0) break; }
      }
      j++;
    }
    const text = src.slice(idx, j + 1);
    const isDefinition = text.trim() === "fetchAll(builderFn, pageSize = 1000, label = '')";
    const isLogTemplateRef = text.includes('${label');
    const isBareCommentMention = text.trim() === 'fetchAll()'; // no args at all -> not a real call
    if (!isDefinition && !isLogTemplateRef && !isBareCommentMention) calls.push({ start: idx, text });
    idx = j + 1;
  }
  return calls;
}

// Top-level (depth-0, outside strings) comma-separated arguments of a `fetchAll(...)` call.
function topLevelArgs(callText) {
  const inner = callText.slice('fetchAll('.length, -1);
  const args = [];
  let cur = 0, depth = 0, inStr = null, esc = false;
  for (let k = 0; k < inner.length; k++) {
    const c = inner[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') inStr = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) { args.push(inner.slice(cur, k).trim()); cur = k + 1; }
  }
  args.push(inner.slice(cur).trim());
  return args.filter(a => a !== '');
}

describe('dispatch — every fetchAll() call site names a real label (no more "a data table" banners)', () => {
  it('real-call sanity: finds the known population of fetchAll() call sites', () => {
    const calls = findFetchAllCalls(SRC);
    // 82 real call sites measured at the time of this sweep (2026-11-04) -- a generous lower
    // bound, not an exact pin, so new loaders added later don't make this test flaky.
    expect(calls.length).toBeGreaterThanOrEqual(80);
  });

  it('every call site\'s last argument is a real label, not silently defaulting to the generic fallback', () => {
    const calls = findFetchAllCalls(SRC);
    const unlabeled = [];
    for (const { start, text } of calls) {
      const args = topLevelArgs(text);
      const last = args[args.length - 1];
      const isQuotedLabel = /^['"].*['"]$/.test(last);
      // The two generic-helper call sites (loadQsrActSummary's shared paginator and
      // `_loadOpsTable`) correctly pass the table NAME VARIABLE as the label (not a literal,
      // since the same code serves several tables) -- `table` or `label || table`.
      const isVariableLabel = last === 'table' || last === 'label || table';
      if (!isQuotedLabel && !isVariableLabel) {
        const lineNo = SRC.slice(0, start).split('\n').length;
        unlabeled.push(`line ${lineNo}: last arg = ${JSON.stringify(last)}`);
      }
    }
    expect(unlabeled).toEqual([]);
  });
});
