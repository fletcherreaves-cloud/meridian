// @ts-nocheck
// Dispatch #72 B2 -- src/features/projections.js:1820 read `r.loc||loc` inside the deep-dive
// table's row-map callback. `loc` there is a free variable: the `loc` bound by the sibling
// store-row flatMap above (`locs.filter(loc=>...).flatMap(loc=>...)`) does not extend into
// this deepStore block -- a SIBLING array element in the same JSX list, not a nested callback,
// so nothing named `loc` is in scope. Short-circuit-guarded by `r.loc||`, so this was silent
// unless r.loc were ever falsy.
//
// Per the triage's explicit instruction ("do not fix by inventing a fallback -- establish
// whether r.loc can ever be empty"): every row in weekData[deepStore] is built by computeWeek's
// `rows.push({...r,date:d,loc,overrideAmt:null,overrideMode:'auto'})` (line ~663), where `loc`
// comes from `for(const loc of ALL_LOCS)` and ALL_LOCS is `stores` filtered through /^\d+$/ --
// never empty. So r.loc can never be falsy for any row this table actually renders; the
// fallback was dead code masking the bug, not a real guard, and was removed rather than given
// a second invented variable to fall back to.
//
// Because the buggy branch is unreachable through the real data pipeline, a render test that
// opens the deep-dive view can't discriminate pre/post-fix (r.loc is always truthy in
// practice, so the free `loc` reference is never actually evaluated at runtime either way).
// A static check is the right tool here -- it's also how this bug was originally found
// (dispatch #563's no-undef sweep). Mirrors dispatch #72 A3's App.js guard, scoped to this file.
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import globals from 'globals';

describe('projections.js has no undefined identifiers (dispatch #72 B1 + B2)', () => {
  it('no-undef is clean', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ['src/features/projections.js'],
        languageOptions: {
          ecmaVersion: 2023,
          sourceType: 'module',
          globals: { ...globals.browser, ...globals.node },
        },
        rules: { 'no-undef': 'error' },
      }],
    });
    const results = await eslint.lintFiles(['src/features/projections.js']);
    const problems = results.flatMap(r => r.messages
      .filter(m => m.ruleId === 'no-undef')
      .map(m => `${r.filePath.replace(/.*\/src\//, 'src/')}:${m.line} ${m.message}`));
    expect(problems).toEqual([]);
  }, 60_000);
});
