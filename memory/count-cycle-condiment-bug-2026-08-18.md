# Count Cycle: the "all 27 stores crit" investigation — 2026-08-18

## The dispatch's own discriminator, run for real

#410 surfaced, but correctly did not chase, a striking finding: on 2026-08-18 every one of
27 stores read `status: 'crit'` / `weekly-overdue` in `cycleCompliance()`. Dispatch20 §3
proposed the test: *"re-run the grade against several dates that are not today — every date
crit → logic, only today → stale feed."*

Ran it against the real `qsr_onhand` period-2026-08 pull (7,347 rows) with `asOf` set to
six different dates (08-08 through 08-18): **every date from 08-10 onward read 27/27 crit.**
Only 08-08 showed a mixed picture. That is the "logic" signature, not "stale feed" — a real
bug, not a today-specific data gap.

## Root cause, measured

`detectSessions()`'s `covered` check:

```js
const covered = CLASSES.filter(c =>
  (counts[c] || 0) > 0 && (counts[c] || 0) >= (totals[loc][c] || Infinity) * COVER_FRAC);
```

When a store has **zero active items** in a class, `totals[loc][c]` is `undefined`, falling
through to `Infinity`. No count can ever be `>= Infinity * 0.75`. That class can **never**
be marked covered — permanently, regardless of what the store actually does.

Measured which class this hits: **967 of 978 (98.9%) of ALL Condiment-class `qsr_onhand`
rows district-wide read `active: false`**, and **zero of them** are Topic-6-rescued
(`recipe_item: true`) — the #374 rescue mechanism (memory/374-recipe-item-verification-
2026-08-18.md) simply never fires for Condiment items in this data. Per-store breakdown:

| store | Condiment total | active (counted) | active=false |
|---|---:|---:|---:|
| 10034 (Bonifay) | 36 | 0 | 36 |
| 10422 | 37 | 0 | 37 |
| 10915 | 37 | 0 | 37 |
| 11657 | 36 | 0 | 36 |
| 13113 | 37 | 0 | 37 |
| 18213 | 34 | 0 | 34 |
| 20475 | 37 | 0 | 37 |
| 29760 | 36 | 0 | 36 |
| 32525 | 35 | 0 | 35 |
| 34222 | 35 | 0 | 35 |
| 3708 | 38 | 0 | 38 |
| 37566 | 35 | 0 | 35 |
| 38609 | 35 | 0 | 35 |
| 5183 | 38 | 0 | 38 |
| 6838 | 35 | 0 | 35 |
| 6972 | 37 | 0 | 37 |
| 43380 | 32 | 0 | 32 |

**17 of 27 stores have `totals[loc].Condiment` of exactly 0.** For those stores,
`satisfiesWeekly = has('Food') && has('Condiment')` was mathematically impossible to
satisfy — a store could count every single active item in its universe perfectly, every
week, forever, and still read `crit`. That is not a signal anyone can act on; it is a
permanently-tripped alarm, exactly the kind of false-positive that trains people to ignore
the panel.

**Why Condiment specifically:** not determined here — plausibly a QSRSoft data-modeling
quirk (condiments may not be tied to a single "recipe" the way a sandwich is, so
`active_in_recipe` may structurally never read true for that class) rather than a Meridian
bug. Left as an open question; the fix below is correct regardless of the underlying cause.

## The fix

```js
const covered = CLASSES.filter(c => {
  const universe = totals[loc][c] || 0;
  if (universe === 0) return true; // nothing active to count — trivially covered
  return (counts[c] || 0) > 0 && (counts[c] || 0) >= universe * COVER_FRAC;
});
```

A class with zero active items is trivially "covered" — there is nothing to count, so it
cannot gate compliance. A store WITH real active items in a class still has to count them
(verified by a dedicated test using 2 genuinely-active Condiment items, matching the real
shape at stores like 24471/33222/43701 which each had 1-2 active Condiment rows in the
pull) — this only fixes the zero-item edge case, it does not weaken the rule generally.

## Measured impact (same real 7,347-row pull, `asOf: '2026-08-18'`)

| | before | after |
|---|---|---|
| ok | 0 | 10 |
| warn | 0 | 5 |
| crit | 27 | 12 |
| paperMissing | 11 | 11 (unchanged — separate rule) |

From a uniform, useless "everyone fails everything" to a real, varied, actionable
distribution. The 12 stores still `crit` after the fix (24471, 31357, 33109, 33704, 35064,
5985, 33222, 35242, 43701, 5183, 6178, 37566) either have no `satisfiesWeekly` session
anywhere in the period's data, or their last one is genuinely weeks old — a real
operational gap, not the Condiment artifact. Not chased further here; this is the correct
next thing for whoever owns Count Cycle rollout to look at, now that the signal is real.

## Code change

`src/engine/count-cycle.js`'s `detectSessions()` — the `covered` filter only, per the diff
above. Comment added inline citing this file. 4 new tests in
`src/__tests__/count-cycle.test.js` (`describe('zero-active-item class cannot permanently
block compliance', ...)`), including a real-shape Bonifay fixture and a control case proving
a store with genuinely active Condiment items still has to count them.
