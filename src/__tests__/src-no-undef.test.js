// @ts-nocheck
// Dispatch #563 added a no-undef guard over scripts/**/*.mjs after rawWaste sat undefined for
// two days in qsrsoft-variance-pull.mjs. Running the identical check over src/ (dispatch #72's
// triage) found 25 further sites across 9 files -- all genuine, zero false positives -- plus 3
// more discovered while sequencing the fix (generateReviewPack in analytics.js, _masgnInvalidate
// in labor-tools.js, saveSettings in store-analytics.js), for 28 total. Every one is fixed and
// carries its own dedicated test (see the dispatch-72-*.test.js files in this directory); this
// is the ratchet that keeps a 29th from landing unnoticed.
//
// Why nothing else catches this class of bug: eslint.config.js scopes its only block to
// '**/*.{ts,tsx}' (this project has no TypeScript outside build config -- CLAUDE.md: "No
// TypeScript -- plain JS with // @ts-nocheck"), so `npm run lint` matches zero src/ files and
// is a silent no-op. `node --check` catches syntax, not an undefined identifier. And an
// undefined-identifier ReferenceError inside a try/catch, a short-circuit (`x||fallback`), or
// an unawaited async function's rejected promise -- the shape every one of the 28 sites took --
// throws exactly once, gets swallowed, and becomes "a feature that quietly doesn't work"
// instead of a loud crash that gets fixed fast. That is the recurring signature named across
// dispatch #66, #71, #563, and #72.
//
// The triage's own explicit sequencing: fix every known site first, THEN widen the guard --
// "Do not widen the guard before the list is clear — it would block every merge from that
// moment." This file IS that widening step, added only after all 28 were fixed and verified
// (2026-08-22): 0 violations across src/ with every fix in place.
//
// Browser globals are included since this is UI code (React components using window/document/
// localStorage/fetch throughout); Node globals cover the few src/ files that also run under
// Node (e.g. build-time helpers).
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import globals from 'globals';

describe('src/ has no undefined identifiers', () => {
  it('no-undef is clean across every source file', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['src/**/*.js'],
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          globals: { ...globals.browser, ...globals.node },
        },
        rules: { 'no-undef': 'error' },
      }],
    });
    const results = await eslint.lintFiles(['src/**/*.js']);
    const problems = results.flatMap(r => r.messages
      .filter(m => m.ruleId === 'no-undef')
      .map(m => `${r.filePath.replace(/.*\/src\//, 'src/')}:${m.line} ${m.message}`));
    expect(problems).toEqual([]);
  }, 120_000);
});
