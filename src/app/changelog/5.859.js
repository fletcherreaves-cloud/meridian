// @ts-nocheck
export default {version:'5.859', date:'2026-11-24', changes:[
  '**Closes #369 — the real remaining instance of the "moves the problem up one level" trap its ' +
  'own writeup warned about.** #369 (2026-08-17) flagged ~20 unmemoized `allLocs` recomputes in ' +
  '`at-a-glance.js`; re-checking live code found all 6 in-file occurrences already fixed (now ' +
  'real `useMemo(...,[stores])`), but the `AtAGlance` call site in `App.js` was still rebuilding ' +
  'its own `stores` PROP via an unmemoized inline IIFE on every single App.js render — which ' +
  'defeats every one of those downstream `useMemo` wrappers regardless of how well-memoized they ' +
  'are internally, exactly the parent-level trap #369 explicitly called out as worth checking. ' +
  'It also re-derived the `aagAllowedLocs` (View As Role) filter a second time instead of reusing ' +
  'the existing `scopedStores` memo, whose own comment already asks every call site to do that. ' +
  'New `aagStores` memo (`[scopedStores, locScope]`) replaces the inline IIFE: starts from ' +
  '`scopedStores` (no duplicate aagAllowedLocs filter) and applies the FL/OK locScope pill on top ' +
  '(filter order doesn\'t change the result -- both are set-intersections). Full suite 940 files / ' +
  '8580 tests green, build clean, 722.71 KB gzipped eager payload (unchanged -- no new static ' +
  'import, pure memoization). Not independently re-measured via a live click-trace capture (no ' +
  'browser session in this environment) -- verified by code-level referential-stability reasoning ' +
  'and the full suite, matching the same useMemo pattern already proven correct for every other ' +
  'allLocs occurrence #369 itself fixed.',
]};
