---
name: dispatch-96
description: The Condiment class' active_in_recipe/recipe_item flags read false/false for 986 of 996 district-wide rows, with ZERO exceptions ever true, in the live 2026-08 pull -- and it's not a data-quality bug, it's structural: McDonald's never ties condiments to a recipe (owner-confirmed -- they're costed by usage-per-1000, not recipe binding). The existing vacuous-coverage bypass (dispatch20) silently no-ops Condiment compliance for 17/27 stores, but 10/27 stores have exactly one stray active:null row that becomes their ENTIRE Condiment universe -- and for Tecumseh that one row is a stale, $0, July-dated phantom, making Condiment weekly compliance permanently impossible for that store all of August despite genuinely thorough real counting (39 real items, real dollars, counted 2026-08-21). Fix: stop gating Condiment-class membership on these flags at all.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #96 — Condiment class isn't recipe-bound at McDonald's; stop gating it on `active_in_recipe`

**Read first:** `memory/count-cycle-condiment-bug-2026-08-18.md` (the vacuous-coverage fix this
dispatch builds on) and `memory/374-recipe-item-verification-2026-08-18.md` (the Topic 6 rescue
mechanism this dispatch does **not** touch for other classes). This is the owner's own follow-up
to both: *"whatever we find, we will need to correct logic to account for condiments correctly."*

**Status:** ready, root cause fully measured and owner-confirmed. This is a scoped fix, not an
open investigation.

---

## The structural fact (owner-confirmed, not a QSRSoft data bug)

> "Condiments for McDonald's are NEVER tied to a recipe. Their calculations are derived simply by
> usage per 1000."

`active_in_recipe` and `recipe_item` both ask "is this item bound to a recipe." For the Condiment
class, McDonald's own accounting model means the honest answer is always "no" — permanently, by
design, not something a QSRSoft data fix or a wait-and-recheck will ever change. Gating Condiment
compliance on either flag is asking the data a question it structurally cannot answer.

## Measured: 100% false/null, zero exceptions, across the whole district

Live pull, `qsr_onhand`, `period=2026-08`, `cls=eq.Condiment`, all 27 stores, 996 rows
(`SUPABASE_SERVICE_ROLE_KEY`):

| `(active, recipe_item)` | rows |
|---|---:|
| `(false, false)` | 986 |
| `(null, null)` | 10 |
| `(true, *)` | **0** |
| `(*, true)` | **0** |

`active` is never `true` and `recipe_item` is never `true` for a single Condiment row, anywhere,
ever, in this pull. This matches — and now explains — `count-cycle-condiment-bug-2026-08-18.md`'s
"zero of them are Topic-6-rescued" finding: the Topic 6 rescue path (`recipeItem === true`) cannot
structurally fire for a class that is never recipe-bound in the first place.

Of the 986 explicit-`false` rows, **980 have `last_counted >= 2026-08-15`** — real, current,
actively-counted inventory (**$68,098.19** total on-hand across those rows, district-wide) that
`isActive()` excludes entirely from both the universe and the counted-numerator.

## The trap this creates — two different failure modes, not one

`src/engine/count-cycle.js`:

```js
const isActive = (r) => r.active !== false || r.recipeItem === true;   // line 100
...
for (const r of (rows || [])) {
  if (!r || !r.cls || !isActive(r)) continue;                          // line 111
  ...
  totals[loc][r.cls] = (totals[loc][r.cls] || 0) + 1;
  ...
}
```

`isActive()` treats `null` as active (`null !== false` → `true`) by design, so a genuinely missing
flag isn't silently dropped. That's correct for classes where the flag sometimes legitimately does
fire true. For Condiment, where it never does, this interacts badly with the 10 stray `null` rows
in the pull (one per store, in exactly 10 of 27 stores — a raw-data completeness gap, not a
per-store QSRSoft config difference):

**17 of 27 stores** — all-`(false,false)` Condiment rows, universe `totals[loc].Condiment` is `0`,
hits the existing vacuous-coverage bypass (dispatch20). Condiment compliance is trivially
satisfied — the requirement currently does **nothing** for these stores. Not broken, just inert.

**10 of 27 stores** — one stray `active:null` row survives the filter and becomes that store's
**entire** Condiment "active universe" (size 1). If that one row happens to be current, the store
gets a real (if absurdly thin) requirement. If it's stale, the requirement becomes **permanently
impossible** for the period, no matter how well the store actually counts.

**Tecumseh (33704) is the second case, measured directly:**

```json
{"loc": "0033704", "active": null, "recipe_item": null, "last_counted": "2026-07-31", "on_hand_amt": 0}
```

That single row — $0 on-hand, last touched **before August's count cycle even started** — is
Tecumseh's *entire* Condiment universe this period (`totals['33704'].Condiment === 1`). It can
never be counted in August, so `covered` for Condiment can never include Tecumseh, so
`satisfiesWeekly` (`has('Food') && has('Condiment')`) can never be true, so Tecumseh reads
Overdue **regardless of real counting activity.**

And the real counting activity is not in question — the owner's own screenshot of QSRSoft's
On-Hand Inventory UI (store 33704, Class=Condiment, 08/24/2026) shows **39 real Condiment rows**
for period 2026-08 (Big Mac Sauce Cup, Hotcake Syrup, Sweetener/Equal, Mighty Hot Sauce Cups,
Salt/Non-Iodized, Jam/Grape, Preserves/Strawberry, Salt Packets, Pepper Packets/Black,
Ketchup/Packets, ...), every one with `last_counted`/`last_submitted` **2026-08-21 or 08-22**, real
dollar `On Hand Amt`, and QSRSoft's own **"Recipe" column reading "No"** on every row — confirming
this is QSRSoft's own data, correctly pulled, not a mapping bug on our side. None of those 39 real
items register, because none of them happen to carry `active:true` or `recipe_item:true` — and
per the measurement above, none ever will.

## Seminole and OKC-I240/Sooner are a *different* thing — not this bug

Neither is among the 10 stores with a non-zero Condiment universe — both are in the 17-store
vacuous-coverage group, so Condiment isn't gating them at all. Their Food-class data (live pull,
same window) shows clear, large, single-date qualifying sessions:

| store | active Food universe | best single-date session |
|---|---:|---|
| Seminole (10915) | 122 | 116 items counted 2026-08-18 |
| OKC-I240/Sooner (20475) | 122 | 115 items counted 2026-08-20 |

Both comfortably clear `COVER_FRAC` (0.75 × 122 ≈ 92). Combined with a vacuously-true Condiment
class, both stores' `satisfiesWeekly` should already read true as of 08-18/08-20 respectively —
matching what I found before this dispatch and had asked the owner to confirm via hard refresh.
**This dispatch's fix does not change anything about Seminole/OKC** — their stale on-screen dates
(8/12, 8/13) look like client-side display/cache staleness, a separate open item, still pending
the owner's hard-refresh check.

## The fix

Stop gating Condiment-class universe/counted-numerator membership on `active`/`recipe_item` at
all — the flag can never carry a real signal for this class, confirmed structurally, not just
empirically. Every Condiment row QSRSoft returns for a store's on-hand pull is real inventory and
should count toward both sides of the ratio.

Suggested shape — make the activity predicate class-aware rather than rewriting `isActive()`
globally:

```js
const isActive = (r) =>
  r.cls === 'Condiment' ? true : (r.active !== false || r.recipeItem === true);
```

(or equivalent — the point is Condiment bypasses the flag check entirely, every other class is
untouched). This:
- Fixes Tecumseh: universe becomes the real ~39 items instead of 1 stale phantom; the 08-21
  session becomes a real, non-vacuous, correctly-computed pass.
- Fixes the 17 vacuous stores too: they get a real, meaningful Condiment coverage percentage
  instead of an always-true bypass that currently measures nothing.
- Leaves Food/Paper/Non-Product and the Topic 6 rescue mechanism completely untouched — that
  mechanism is real and confirmed firing broadly for those classes
  (`374-recipe-item-verification-2026-08-18.md`'s per-store table), just never for Condiment.

**One thing worth a quick, real check before shipping (don't guess, measure):** the earlier
20-item Condiment sample this investigation pulled had one item with `"(Deactivated)"` in its
`descr` — a legitimate, textually-marked exclusion. If that marker appears on a small, identifiable
set of rows, consider excluding on that text signal specifically for Condiment rather than
including literally everything; if it's rare/inconsistent, including everything (the fix above,
unmodified) is the right call — COVER_FRAC=0.75 already tolerates a store not counting every last
SKU. Check real data first; don't add speculative exclusion logic no measurement supports.

## Verification bar

Re-run `detectSessions`/`cycleCompliance` against the live 2026-08 `qsr_onhand` pull with the fix
applied, `asOf` set at or after 2026-08-21:
- Tecumseh's Condiment universe must be the real item count (~39), not 1; its 08-21 session must
  satisfy Condiment coverage on a real percentage basis; its overall status must no longer read
  Overdue purely because of this mechanism.
- The 17 previously-vacuous stores must show real, varied Condiment coverage percentages instead
  of a uniform always-covered bypass — confirm this produces genuine variation, not another
  uniform result (that would mean the fix didn't actually change the comparison basis).
- Confirm 0 regressions on Food/Paper/Non-Product compliance for all 27 stores — same before/after
  diff discipline `count-cycle-condiment-bug-2026-08-18.md` used for its own fix.
- Follow this repo's "would this verification still pass if reverted" bar: assert against the
  actual `cycleCompliance`/`detectSessions` consumer output, not an isolated `isActive()` unit
  test that could pass with the class check never wired into the real filter.

## Do NOT

- **Do not touch `isActive()`'s behavior for Food, Paper, or Non-Product.** The Topic 6 rescue
  (`recipeItem === true`) is real, working, and unrelated to this bug for those classes — don't
  re-litigate or weaken it.
- **Do not re-derive whether `active_in_recipe` is "broken" for Condiment.** It isn't broken —
  it's structurally inapplicable, owner-confirmed. Don't propose fixing it upstream or filing
  anything with QSRSoft about it.
- **Do not fix Seminole/OKC's stale display date as part of this dispatch.** Different mechanism
  (their Condiment gate isn't blocking them at all), still pending the owner's hard-refresh
  confirmation — a separate, smaller follow-up if the refresh doesn't resolve it on its own.
- **Do not add a speculative "(Deactivated)"-text exclusion without checking real data first** —
  see the "worth a quick check" note above; measure the actual rate before deciding whether it's
  worth the extra logic.
- **Do not apply the class-bypass to any class other than Condiment** without the same kind of
  100%-false-forever measurement this dispatch ran — the fix is justified here because the flag
  *never* fires true, at any store, ever; that's not established for any other class.
