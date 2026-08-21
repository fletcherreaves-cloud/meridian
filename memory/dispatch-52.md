---
name: dispatch-52
description: Build dispatch #46 Part C's drill-down, but scoped from a worked example rather than a wish list. The 2026-08-21 store 0013113 investigation took ~8 hand-written queries over an hour and produced the build's first real operational finding; five of those queries did the work, and three of the five are discriminators Part C never named. Automate exactly those.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #52 — the drill-down, specced from a real investigation

**Read first:** `finding-store-13113-packaging-variance-2026-08-21.md` and `dispatch-46.md` Part C.
This does not replace Part C — it **scopes** it from evidence instead of from a list.

## Why now, and why this shape

On 2026-08-21 the security build produced its first genuinely operational finding: store `0013113`
flags TvA variance at 3.5× the pack, and the flags are 82% packaging against a 47% baseline. Getting
there took roughly **eight hand-written queries over about an hour**, and the path included two dead
hypotheses that queries killed.

**That investigation is the specification.** Five of the eight queries did the real work. Three of
those five are discriminators **Part C's own list never mentions** — and they were the ones that
cracked it. Build these, in this order, and the next store like `0013113` is a click instead of an
hour.

**Everything here reads data already in Supabase.** No new source, no new pull.

## The five, in the order they mattered

**1. Normalised flag rate by store — the check that can END an investigation early.**
Flags per store as a *rate over subjects*, not a raw count. Run first, deliberately: `0013113`'s
23.7%-of-all-flags could have been an artefact of carrying more items, and this is what proved it
was not (every store carries 193–208 subjects, a tight band, so the count *is* the rate). **A
drill-down that cannot dissolve its own premise is not an investigation tool.**

**2. `stores_flagging_item` — store-specific, or the estate-wide broken set?** ⭐ *not in Part C*
For each flagged item, how many other stores flag the same item. Mostly 1 → genuinely local, a real
lead. Mostly 15+ → the known broken-`exp_usage` WRINs
(`project-inventory-data-hygiene-2026-08-20.md`) and the store is just noisier. **This single column
is the difference between a lead and noise**, and every inventory finding needs it.

**3. Item-class composition vs the estate.** ⭐ *not in Part C*
Paper/food split of a subject's flags against the estate baseline. This is what actually identified
the problem: 82.1% paper vs 47.0%, ~3.7σ. **A class skew is a mechanism hint** — packaging points at
counting and receiving, food points at portioning, prep and waste. Cheap, and it aimed the whole
investigation.

**4. Period trend — chronic, or datable?** (Part C item 2, confirmed useful)
Median variance by period. `0013113` came back flat-and-improving across four periods, which ruled
out a manager change, remodel or POS build in one query. A step change would have pointed straight
at a date.

**5. Secondary-metric comparison vs the estate.** ⭐ *not in Part C*
The subject's *other* measures beside the flagged one — count completeness (`act_usage = 0`), waste
logged, item count, median variance. This is the "is this store unusual on anything **else**" check,
and it did double duty: it ruled out skipped counts (`uncounted = 0`) **and** produced the
hypothesis that replaced it. **Do not skip this because it looks like context** — it is where
mechanisms come from.

## The lesson that must be built in, not just written down

**Two hypotheses died in one hour, both killed by a query.**

The second one matters most. "This store under-logs packaging waste" explained all four measurements
at once and was wrong: their paper waste logging is **normal** (530 vs a 486 average) and the whole
42% gap is **food**. It survived exactly as long as it took to split one number by class.

**So the drill-down must make its own refutation cheap.** Every comparison shows the estate baseline
beside the subject's value — never the subject's number alone. A figure with nothing to compare
against is how "42% below average" becomes a finding before anyone checks whether it means anything.

**And a panel that displays a number must not imply a cause.** Show the class skew; do not label it
"counting problem." The mechanism at `0013113` is *still unknown* after eight queries, and the
writeup says so. A drill-down that renders a confident cause would have been wrong twice today.

## Ordering and scope

- **1, 2 and 3 first** — together they answer "is this real, is it local, what kind of thing is it,"
  which is most of an investigation.
- **4 and 5 next.**
- Part C's items 1 (per-subject trend), 3 (shift/daypart) and 6 (auto-exoneration) stay in #46 and
  are **not** in scope here. Item 3 in particular is the inferentially dangerous one and deserves
  its own dispatch.
- Works for **both** subject types — an employee token in cash, an item at a store in inventory.
  Today's example is inventory; do not build it inventory-only.
- `emp_token` throughout. Reveal stays deliberate and logged.

## Rider — close the schema-drift class

Found during #510's review: `supabase/schema.sql`'s `audit_rows` was missing `emp_id` while the
migration added it, so the canonical definition was stale. `manual_ref_cnt` (#490) *did* update it,
so this is inconsistent rather than conventional — and **no test guards it**. Third instance of
"nothing checks that two files agree" in three days.

Add a test parsing `ALTER TABLE ... ADD COLUMN` across `supabase/*.sql` and asserting each column
also appears in that table's `CREATE TABLE` in `schema.sql`. Small, mechanical, closes the class.
**Mutation-test it** — remove `emp_id` from `schema.sql` and confirm it fails.

## Standing rules that bite here

- **Show the baseline beside every number.** The refutation must be as cheap as the claim.
- **Display the measurement, never the inferred cause.**
- **A drill-down must be able to dissolve its own premise** (item 1, run first, deliberately).
- **Verification must render** — a test asserting a query's shape passes with the panel unwired.
