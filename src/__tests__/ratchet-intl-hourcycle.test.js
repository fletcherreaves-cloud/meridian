// @ts-nocheck
// Dispatch #60 -- close the trap that broke main for seven commits (see
// memory/dispatch-60-ci-node-parity.md). `Intl.DateTimeFormat` with `hour12: false` (or `hour12`
// omitted entirely while requesting `hour`) does NOT pin which hourCycle a runtime resolves --
// that resolution is ICU/Node-version-dependent, not part of the ECMA-402 spec's guarantee. This
// codebase measured it directly: the SAME options object rendered midnight as "00:00" on the
// sandbox's Node 22 and "24:00" on CI's Node 20.20.2, so a string match like
// `formatted === '00:00'` (forms-completion.js's chicagoMidnightUTC) or a numeric range check
// against the formatted hour (qsrsoft-onhand-pull.mjs's centralHour) silently disagrees across
// environments. Forcing `hourCycle: 'h23'` (or 'h24'/'h11'/'h12' -- whichever the call site
// actually needs) removes the ambiguity outright, because hourCycle IS a spec-guaranteed pin,
// unlike hour12's resolution.
//
// 🔴 Measured (dispatch #60): NO BEHAVIOURAL TEST CAN CATCH A REVERT OF THIS FIX FROM A SINGLE
// NODE VERSION. On the sandbox's Node 22, hour12:false and hourCycle:'h23' produce IDENTICAL
// format() output AND identical resolvedOptions().hourCycle -- the divergence exists only on
// CI's Node 20. That's why this is a SOURCE-level guard (inspects text, not behaviour) rather
// than a runtime assertion -- same shape as light-mode-white-alpha.test.js and
// ratchet-color-alpha-concat.test.js.
//
// Zero-tolerance, not a ratcheting CEILING (unlike R4's color-concat, which has legitimate
// hex-literal cases): there is no call shape in this codebase where requesting `hour` without an
// explicit `hourCycle`, or passing bare `hour12`, is correct. Any hit here is the same footgun
// that broke main, and should be fixed the same way (see forms-completion.js's TIME_FMT and
// qsrsoft-onhand-pull.mjs's centralHour() for the fixed pattern).
//
// Scans BOTH src/ and scripts/ -- the bug shipped once in each (forms-completion.js under src/,
// qsrsoft-onhand-pull.mjs under scripts/), so a guard scoped to only one directory would have
// missed half of what this dispatch's own sweep found.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'scripts'];

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'changelog' || name === 'node_modules') return [];
      return walk(p);
    }
    return (name.endsWith('.js') || name.endsWith('.mjs')) && !name.endsWith('.test.js') ? [p] : [];
  });
}

// Matches a `new Intl.DateTimeFormat(...)` call's options object, non-greedily up to its closing
// paren. Options objects in this codebase are all single-line or span a few lines without nested
// parens of their own (no function calls inside the options literal), so a non-greedy match up to
// the first `)` is sufficient and avoids needing a real parser.
const CTOR_PATTERN = /new\s+Intl\.DateTimeFormat\s*\([^)]*\)/gs;

function findHits() {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      let idx = 0;
      const ctorMatches = text.matchAll(CTOR_PATTERN);
      for (const m of ctorMatches) {
        const call = m[0];
        const requestsHour = /\bhour\s*:/.test(call);
        const hasHourCycle = /\bhourCycle\s*:/.test(call);
        const hasBareHour12 = /\bhour12\s*:/.test(call);
        if ((requestsHour && !hasHourCycle) || hasBareHour12) {
          const upTo = text.slice(0, m.index);
          const line = upTo.split('\n').length;
          hits.push(`${file}:${line}  ${call.replace(/\s+/g, ' ').trim()}`);
        }
      }
      void idx; void lines;
    }
  }
  return hits;
}

describe('no unguarded Intl.DateTimeFormat hourCycle (dispatch #60 -- see memory/dispatch-60-ci-node-parity.md)', () => {
  it('no Intl.DateTimeFormat call requests hour without an explicit hourCycle, and none uses bare hour12', () => {
    const hits = findHits();
    if (hits.length) {
      throw new Error(
        `${hits.length} Intl.DateTimeFormat call(s) request an hour without pinning hourCycle, or ` +
        `use bare hour12 -- the exact footgun that broke main for seven commits (dispatch #60, ` +
        `memory/dispatch-60-ci-node-parity.md). hour12:false (or omitting hour12/hourCycle entirely) ` +
        `does NOT guarantee which hourCycle a runtime resolves for midnight -- it is ICU/Node-` +
        `version-dependent, and this codebase measured "00:00" on one Node and "24:00" on another ` +
        `from the SAME options object. Add an explicit hourCycle (e.g. hourCycle:'h23') instead:\n\n` +
        hits.join('\n')
      );
    }
    expect(hits).toEqual([]);
  });

  it('sanity: the scanner actually flags the known-bad pattern (would false-pass if the regex broke)', () => {
    // Not a real file scan -- just proves CTOR_PATTERN/the hour+hourCycle logic can detect the
    // exact shape that broke CI, applied to an inline synthetic string standing in for source text.
    const badSample = `const t = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false });`;
    const goodSample = `const t = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', hour: '2-digit' });`;
    const check = text => {
      const m = text.match(CTOR_PATTERN);
      if (!m) return false;
      const call = m[0];
      const requestsHour = /\bhour\s*:/.test(call);
      const hasHourCycle = /\bhourCycle\s*:/.test(call);
      const hasBareHour12 = /\bhour12\s*:/.test(call);
      return (requestsHour && !hasHourCycle) || hasBareHour12;
    };
    expect(check(badSample)).toBe(true);
    expect(check(goodSample)).toBe(false);
  });
});
