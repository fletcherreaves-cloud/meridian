# Startup render storm (#184 item 0)

## The measured problem
`?clicktrace=1` on production, 2026-08-07-adjacent measurement cited in the #184 dispatch:
~42 independent async startup loaders in `App.js`, each resolving at its own moment and each
calling its own state setter → 47 full App re-renders during startup, 39 of them with no user
input. 167s of render+commit, 135s of blocked main thread.

## Where the renders actually come from
`App.js` has one giant `React.useEffect(()=>{...},[])` (lines ~2006–2692) that fires on mount and
contains many independent, uncoordinated async chains:
- `loadLaborRows().then(...)` → one `setDs`
- ~6 separate `supabase.from('org_config')...then(...)` chains → `setSettings`/`setLiveStoreNames`/
  `setLiveStoreStaff`/`setUserTargets`/`setUserRole`/`setBetaMode`, one setter call each
- Email-report auto-ingest, VOICE Performance PDF auto-ingest, cross-device manual-upload sync —
  each its own async IIFE with its own `setDs` inside a loop
- **The tiered startup loader** (v4.846, lines ~2296–2711): 28 named `_stXxx()` functions
  organized into 3 concurrency tiers (T1/T2/T3) via `Promise.all`. 22 of the 28 touch `ds`
  directly via their own `setDs(prev => ({...prev, ...}))` call. The v4.846 tiering already made
  *execution* concurrent (fixed a 182.9s serial-fetch problem) but each stage still committed
  independently on its own resolution — that's 22 of the ~42 total renders right there.

Outside this one effect: IDB restore (its own effect, wrapped in `startTransition`), a separate
DAR-refresh effect, and a handful of smaller effects each contribute one or two more commits.

## What this pass fixes (and what it doesn't)
Fixed: the 22 ds-touching stages inside the tiered loader now commit **3 times** (once per tier)
instead of 22. Mechanism — a local queueing stand-in shadows `setDs` for the scope of the tiered
loader's async IIFE only:

```js
const _dsSetterReal = setDs;              // captured OUTSIDE the IIFE — no TDZ issue
(async()=>{
  let _dsQueue = [];
  const setDs = (updater) => { _dsQueue.push(updater); };   // shadows the real setDs for every
                                                              // _stXxx() defined below this line
  const _flushDs = () => {
    if(!_dsQueue.length) return;
    const fns = _dsQueue; _dsQueue = [];
    _dsSetterReal(prev => fns.reduce((acc, fn) => (typeof fn === 'function' ? fn(acc) : acc), prev));
  };
  const _stMonthlyTargets = async () => { ... setDs(prev => ...) ... };   // UNCHANGED
  ...
  await Promise.all([T1 stages]);  _flushDs();
  const _t2 = Promise.all([T2 stages]);
  _t2.then(() => { _flushDs(); ... });
  const _t3 = _t2.then(() => Promise.all([T3 stages]));
  await Promise.allSettled([_t2, _t3]);  _flushDs();
})();
```

Why this is safe: every one of the 22 stages already called `setDs(prev => ...)` with a
**functional updater** (verified — none pass a plain object), so `reduce`-chaining the queued
updaters against the real `prev` (`fn3(fn2(fn1(prev)))`) produces byte-identical final state to
today's code, which already applies them sequentially as each resolves. Zero changes needed to
any `_stXxx` function body — including the ones with `prev`-dependent merge logic
(`_stMonthlyTargets`, `_stQsrsoftActSummary`) — because JS closures resolve `setDs` lexically to
whatever's in scope at *call* time, and the shadow is declared before any `_stXxx` definition.

**Not fixed in this pass** (scope/risk decision — flagged, not silently dropped): the ~20 other
setDs/setSettings/setXxx calls living in the OTHER effects/IIFEs in the same mount block (IDB
restore, the `loadLaborRows` merge, the 6 `org_config` syncs, email/PDF auto-ingest, cross-device
sync). Each is structurally simpler (single call, no tiering) but touches a different variable
name and a different state atom, so batching all of them together would mean either one shared
queue keyed by setter (more moving parts, higher regression risk in one pass) or leaving them
alone. Left alone. This is genuinely a partial fix: it removes ~19 of the ~42 renders (22→3), not
all of them. The remaining renders are enumerated above so a follow-up pass has a concrete list
instead of "cannot verify live".

## Verification
- `npm test -- --run`: 1218/1218 pass, unaffected (no test exercises this effect — no React
  component/hook test harness exists in this repo, confirmed again).
- `npx vite build`: clean. Entry chunk 2,737.29 kB → 2,739.42 kB raw (+2.13 kB), 822.51 → 823.38 kB
  gzip (+0.87 kB) — almost entirely the changelog entry's own text, not a code regression; budget
  is ≤2,800 kB / ≤850 kB gzip.
- **Cannot verify the actual render-count/wall-clock improvement live** — this sandbox has no
  authenticated Supabase session, so the tiered loader never actually runs (no `ds` to build
  against). The owner should re-run `?clicktrace=1` (or watch the console render-count log this
  effect area already produces) after this ships to confirm the T1/T2/T3 commit count actually
  drops from ~22 to 3, and to decide whether the remaining ~19-render surface (listed above) is
  worth a follow-up pass.

## Also corrected
`App.js` (`rawStores` block, ~line 2914) carried a comment claiming "ds gets a new identity a
dozen-plus times" during startup, written before this fix. Updated to say the tiered-loader effect
specifically no longer does that (3 commits, not a dozen-plus) while the other startup effects
listed above still do — so the comment doesn't overstate what's now true.
