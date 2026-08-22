// @ts-nocheck
// Guard against the bug class that broke qsrsoft-variance-pull.mjs for two days:
// a refactor (cab407e, dispatch #48) replaced a two-line block with a tokenized version and
// dropped `const rawWaste = await ebosGet(...)` in the process. `rawWaste` was still referenced
// twice below, so every store on every run threw a ReferenceError. Nothing caught it until the
// pull's own 25% failure-rate guard fired -- and that only reports the failure, it cannot
// prevent it.
//
// Why nothing caught it earlier: eslint.config.js scopes its only block to '**/*.{ts,tsx}', and
// this project has no TypeScript outside build config (CLAUDE.md: "No TypeScript -- plain JS with
// // @ts-nocheck"). So `npm run lint` matches zero files and is a silent no-op, and ci.yml runs
// only `npm test` + `npm run build` -- no lint step at all. `node --check` catches syntax, not an
// undefined identifier.
//
// This runs no-undef over scripts/**/*.mjs inside the suite CI already executes. Browser globals
// are allowed because several pulls legitimately reference window/document/location inside
// page.evaluate() callbacks, which run in the browser context, not Node.
//
// Measured when added (2026-08-22): 0 violations across scripts/ with the fix in place; reverting
// the fix produces exactly 2 errors ('rawWaste' is not defined, lines 303 and 306). Revert-
// sensitive by construction -- it fails if the fix is removed.
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import globals from 'globals';

describe('scripts/ have no undefined identifiers', () => {
  it('no-undef is clean across every pull script', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['scripts/**/*.mjs'],
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          // node: these are Node scripts. browser: page.evaluate() callbacks are serialised and
          // run inside Chromium, so window/document/location are genuinely defined there.
          globals: { ...globals.node, ...globals.browser },
        },
        rules: { 'no-undef': 'error' },
      }],
    });
    const results = await eslint.lintFiles(['scripts/**/*.mjs']);
    const problems = results.flatMap(r =>
      r.messages.map(m => `${r.filePath.replace(/.*\/scripts\//, 'scripts/')}:${m.line} ${m.message}`));
    expect(problems).toEqual([]);
  }, 60_000);
});
