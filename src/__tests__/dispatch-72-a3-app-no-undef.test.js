// @ts-nocheck
// Dispatch #72 A3 -- App.js:2532,2534's Universal Escape hatch (the keydown handler that's
// supposed to make "Escape always closes every modal, full stop") called setShowDev(false)
// and setShowInsights(false) -- neither state ever existed anywhere in this file (grep for
// `const [showDev` / `const [showInsights` turns up nothing). Because it's one function body
// with no try/catch, the ReferenceError at setShowDev(false) -- the SECOND statement in the
// sweep -- aborted every setter after it: setShowDialedIn, setShowEvents, ...all the way
// through the ~70 remaining modals in the sweep never ran. Escape was broken for nearly
// everything, not just these two, on every single press.
//
// This mirrors src/__tests__/scripts-no-undef.test.js's method (ESLint's no-undef rule) but
// scoped to App.js alone, ahead of dispatch #72's Class B/C sites and the eventual src/**
// widening the triage explicitly says not to do early. Per the standing "would this
// verification still pass if reverted" rule, this reads the ACTUAL source of the escape
// hatch (not a hand-copied excerpt) so a future edit reintroducing an undefined setShow* call
// anywhere in App.js -- not just these two names -- is caught, not just these two identifiers.
//
// Measured when added (2026-08-22): 0 no-undef violations in App.js with the fix in place;
// reverting to the pre-fix setShowDev/setShowInsights calls produces exactly 2
// ('setShowDev' is not defined / 'setShowInsights' is not defined).
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import globals from 'globals';

describe('App.js has no undefined identifiers (dispatch #72 A3)', () => {
  it('no-undef is clean', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['src/app/App.js'],
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          globals: { ...globals.browser, ...globals.node },
        },
        rules: { 'no-undef': 'error' },
      }],
    });
    const results = await eslint.lintFiles(['src/app/App.js']);
    const problems = results.flatMap(r => r.messages
      .filter(m => m.ruleId === 'no-undef')
      .map(m => `${r.filePath.replace(/.*\/src\//, 'src/')}:${m.line} ${m.message}`));
    expect(problems).toEqual([]);
  }, 60_000);
});
