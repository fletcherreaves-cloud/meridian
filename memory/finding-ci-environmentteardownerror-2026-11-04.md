---
name: finding-ci-environmentteardownerror-2026-11-04
description: "Root cause + fix for the intermittent CI EnvironmentTeardownError on the verify job -- an unawaited top-level dynamic-import prefetch racing a fast test file's teardown."
metadata:
  type: finding
---

# CI's intermittent `EnvironmentTeardownError` -- root cause and fix (2026-11-04)

## The symptom

`.github/workflows/ci.yml`'s `verify` job (Node 20/22 matrix) failed twice in one day, on two
unrelated PRs (#1657, #1658), with the identical error:

```
EnvironmentTeardownError: Cannot load '/src/engine/weekly-cadence.js' imported from
src/engine/count-cycle.js after the environment was torn down.
```

Call stack both times: `weekly-cadence.js` ← `count-cycle.js:53` ← `src/views/at-a-glance.js:25`
← `src/app/App.js` ← `src/__tests__/dispatch-workflow-guide-kb-staleness-2026-11-02.test.js`.
Every real assertion passed both times (6645-6646/6646-6648 tests, only skip-count varied by a
test or two across runs) -- only this one unhandled rejection failed the job. A `rerun_failed_jobs`
re-run came back fully green both times, with zero code changes. Neither failing PR touched any
file in that import chain.

## Root cause (measured, not guessed)

`src/app/App.js` has an unconditional, unawaited prefetch right where `_ataglance` (the lazy
loader for `AtAGlance`, the app's default landing view) is defined:

```js
const _ataglance = () => import('../views/at-a-glance.js');
_ataglance();
```

This is deliberate, documented production behavior (comment right above it): fire the dynamic
`import()` at module-eval time so the `AtAGlance` chunk is already loading -- often already
resolved -- well before the app's real startup data finishes loading and this view gets its
first paint. In a real browser this is harmless: the Promise just resolves whenever and warms
the module cache; nothing awaits it.

Under Vitest, though, `App.js` is imported directly by several test files (this one imports
`WorkflowGuidePanel` from it). Every such import re-evaluates this top-level side effect and
fires the SAME unawaited dynamic import, kicking off the `at-a-glance.js` → `count-cycle.js` →
`weekly-cadence.js` module chain in the background. `dispatch-workflow-guide-kb-staleness-
2026-11-02.test.js` itself never renders `AtAGlance` (it mounts `KnowledgeBasePanel`/
`WorkflowGuidePanel` directly) and has no `await` on anything async -- its 14 assertions are all
synchronous `act()` calls, so the whole file typically finishes in well under a second. On a
slower CI runner (cold disk cache, no local module resolution warm-up the way this sandbox's
repeated local runs had), the prefetch's module graph can still be resolving when this test
file's own run completes and Vitest's happy-dom environment gets torn down -- hence
`EnvironmentTeardownError`, a classic unawaited-background-task-outlives-its-environment race,
not a bug in the tested code or in `count-cycle.js`/`weekly-cadence.js` themselves.

This explains every observed property: intermittent (a wall-clock race, more likely to lose on a
loaded/cold CI runner than this session's own warm local sandbox, which never reproduced it even
after several repeated local runs of the same file), always the identical test file+stack (it's
specifically the first/fastest test file in a given Vitest worker to import `App.js` and finish
before the one shared prefetch settles), and always resolved by a bare re-run (a re-run gets
either a warmer module-resolution cache or a timing roll that lets the import settle first --
nothing about the code is actually nondeterministic).

## The fix

Guard the prefetch so it never fires under test, using `import.meta.env.MODE` (not
`process.env.VITEST`, since `App.js` is Vite-bundled browser code and the shipped production
build has no `process` polyfill -- `import.meta.env.MODE` is replaced with a literal at build
time by Vite itself, so it's safe in both the real browser bundle and under Vitest, which sets
`MODE` to `'test'` by default; confirmed directly, not assumed, via a throwaway probe test run
under this exact suite before writing the fix):

```js
const _ataglance = () => import('../views/at-a-glance.js');
if (import.meta.env.MODE !== 'test') _ataglance();
```

Grepped every other `const _xxx = () => import(...)` lazy-panel definition in `App.js` (6 total)
for the same bare-call-right-after-definition pattern -- `_ataglance` was the only one with an
eager top-level invocation; the other five (`_laborTools`/`_storeAnalytics`/`_analytics`/
`_projections`/`_storeDash`) are only invoked from inside their own `React.lazy(...)` factory,
which React itself only calls on actual Suspense, so none of them carry this race.

**Not removed:** the prefetch itself, its placement, or its rationale -- all unchanged for real
builds (`MODE` is `'production'`/`'development'` under `vite build`/`vite dev`, never `'test'`),
so the documented perceived-performance benefit (AtAGlance's chunk already warm by first paint)
is untouched.

## Verification

- Ran `dispatch-workflow-guide-kb-staleness-2026-11-02.test.js` standalone 3x after the fix --
  clean every time (it also never reproduced the failure locally before the fix, consistent with
  this being a CI-runner-speed-dependent race, not a deterministic local repro).
- Full local suite green both before and after (this fix doesn't change local behavior at all,
  since the race never lost locally) -- see this dispatch's commit body for the exact numbers.
- Confirmed via a throwaway probe test (`expect(...).toBe('FORCE_FAIL_TO_SHOW')` to surface the
  assertion message) that `import.meta.env.MODE === 'test'` and `process.env.VITEST === 'true'`
  both hold under this exact `npx vitest run` invocation, before picking which guard to use.
