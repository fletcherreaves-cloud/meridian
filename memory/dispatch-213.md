# Dispatch #213 — EOM notification polish: item name+WRIN, FOB section (freshness-gated), real KB links

## Context

Live owner feedback on the shipped EOM count-completion email (dispatch #209/#211), received during
the active 3-day EOM cycle: *"Love the email notification! Can we add the product name alongside
the wrin as well? Also, how hard would it be to show there fob and components as well. Would need
to ensure the data pull is as recent or or newer than the in-hand for it to return the right data."*
Plus two corrected KB links, verbatim:
- Best Counting Practices → `https://support.qsrsoft.com/hc/en-us/search?utf8=✓&query=Best+counting+practices`
- Physical Inventory → `https://v3.myqsrsoft.com/cimt/inventory/inventory?location=3708&tab=itemsToInventory&countFrequency=A&temperatureZone=all&class=all&rangeIndicator=all&duplicatePrefix=false`
  — **this is NOT a KB article**, it's a live link into QSRSoft's own counting tool, parameterized by
  `location=<nsn>`. The `3708` in the owner's example is that store's own NSN — build this per-store,
  substituting the notification's own `loc`, never hardcode 3708.

Three independent, small changes, all in the already-shipped notification pipeline
(`scripts/qsrsoft-onhand-pull.mjs`, `scripts/lib/resend-notify.mjs`). No new tables.

## Task 1 — item name + WRIN together (small, `scripts/lib/resend-notify.mjs`)

`buildEmailContent()`'s uncounted-items list currently renders `it.descr || it.wrin` (one or the
other). Change to show both wherever `descr` exists, WRIN always present since it's the join key:
`` `${it.descr ? `${it.descr} (${it.wrin})` : it.wrin}` ``. Update the existing test in
`src/__tests__/resend-notify.test.js` that asserts on this line's exact output.

## Task 2 — real KB links, Physical Inventory built dynamically per store

In `scripts/qsrsoft-onhand-pull.mjs`:
- `KB_BEST_COUNTING.url` → the search-results URL above (verbatim, including the `utf8=✓` query
  param — don't re-encode or "clean up" it, it's the owner's own copied URL).
- `KB_PHYSICAL_INVENTORY` stops being a static `{title,url}` const. `kbLinksForClasses(classes)`
  gains a required second param, the store's NSN: `kbLinksForClasses(classes, nsn)`. Wherever the
  physical-inventory link would have appeared in `KB_LINKS_BY_CLASS` (currently `food`, `condiment`,
  `paper`), build it inline: `{ title: 'Physical Inventory (this store)', url:
  `https://v3.myqsrsoft.com/cimt/inventory/inventory?location=${nsn}&tab=itemsToInventory&countFrequency=A&temperatureZone=all&class=all&rangeIndicator=all&duplicatePrefix=false` }`
  — use the unpadded NSN (`unpadLoc(loc)`, already imported in this file), matching the owner's own
  example (`location=3708`, not a zero-padded 7-digit form).
- **AMENDMENT (2026-08-29, live mid-build)** — `KB_ON_HAND` is no longer untouched. The owner
  followed up with more direct tool links, including a per-store, per-date, per-class **On-Hand**
  report link: `https://v3.myqsrsoft.com/cimt/inventory/on-hand-inventory?location=3708&class=F&recipe=all&nonzero=true&duplicates=false&date=2026-08-29`
  — `3708`/`F`/`2026-08-29` are that example's own store/class/date, all three substitute per
  notification. Replace `KB_ON_HAND` the same way `KB_PHYSICAL_INVENTORY` was just made dynamic:
  `{ title: 'On-Hand Inventory (this store)', url:
  `https://v3.myqsrsoft.com/cimt/inventory/on-hand-inventory?location=${nsn}&class=${classLetter}&recipe=all&nonzero=true&duplicates=false&date=${dateStr}` }`.
  `nsn` = same unpadded NSN as Physical Inventory. `dateStr` = this run's own `businessDate()`
  value (already computed in `main()`, needs threading down to `kbLinksForClasses`/
  `buildNotificationRow` alongside `nsn`). `classLetter` = the single QSRSoft class code (`F`/`C`/
  `P`/`N`) for the relevant class — this script already uses that exact same F/C/P/N vocabulary
  for `TYPES`/`ONHAND_TYPES` (`food→F, condiment→C, paper→P, nonproduct→N`, matching `CLASS_ORDER`
  in `resend-notify.mjs`'s own order) — confirm that exact mapping against `mapOnHandRow()`'s
  `invty_class` strings ("Food"/"Condiment"/"Paper"/"Non-Product") before trusting it, per this
  repo's measure-don't-reason rule, rather than assuming the order lines up. Build one On-Hand
  link per triggered class (a `food_condiment` trigger gets both an `F` and a `C` on-hand link, not
  one link for an arbitrary single class).
- **Also deferred (2026-08-29 follow-up, NOT this dispatch)**: the owner separately supplied direct
  tool links for **Variance Stat/Yields**, **Transfers**, **Waste**, **Purchases**, **Raw Items**,
  and **Inventory Analysis** (all `v3.myqsrsoft.com/cimt/inventory/...`, same `location=`-param
  pattern, several also date-ranged). These are real and valuable but need their own class-mapping
  design (which trigger class each belongs under, and for the date-ranged ones, what window to
  default to) — explicitly out of scope for #213, tracked as dispatch #214. Do not add them here.
- Update the one call site (`buildNotificationRow()`) to pass the store's NSN through — `loc` is
  already a param there; derive `nsn` from it the same way the rest of this file already does
  (`unpadLoc(loc)`).
- Update `src/__tests__/eom-count-notifications*.test.js` (wherever `kbLinksForClasses` is
  currently tested) for the new signature and the dynamic URL. Grep for `kbLinksForClasses` and
  `KB_PHYSICAL_INVENTORY` before assuming you've found every call/test site.

## Task 3 — FOB + components in the email, gated by a real freshness check

**The freshness rule, exactly as the owner stated it**: only show FOB numbers if the FOB pull is as
recent as, or more recent than, the on-hand count itself. Don't show a stale FOB snapshot that
predates the count someone just finished — that's not "this store's current FOB," it's leftover
data from before they started counting.

**What "as recent as the count" means, concretely**: `qsr_fob` rows already carry a real per-row
pull timestamp — `updated_at`, explicitly set to `new Date().toISOString()` on every upsert in
`scripts/qsrsoft-pull.mjs` (not just a DB default; verified live in that file). On the count side,
QSRSoft itself timestamps each on-hand item's `last_counted`/`last_submitted` — this pull script
already reads both into `ohForEngine` per item. **The freshness check is: does the store's latest
`qsr_fob` row's `updated_at` fall at or after the food+condiment items' own count-completion time
(the max of their `last_counted`/`last_submitted`)?** That's the literal "pull is as recent or newer
than the in-hand [count]" the owner asked for — compare the two real-world timestamps, not run
clocks or guesses.

This only applies when the trigger includes food and/or condiment
(`FOB_CLASSES = ['food','condiment']` in `src/engine/eom-inventory.js` — already the established
link between these two data classes and FOB; don't re-derive that pairing). A `paper`-only or
`nonproduct`-only trigger never gets a FOB section — those classes don't feed FOB.

Steps:
1. In the per-store loop in `qsrsoft-onhand-pull.mjs` (where `ohForEngine`/`detection` are already
   built), when `detection` fires AND its `triggerClasses` includes `food` or `condiment`: compute
   `countCompletedAt` = the max `lastCounted`/`lastSubmitted` across this store's `food`+`condiment`
   items in `ohForEngine` (reuse the same "counted or submitted, whichever is later" logic this file
   already has for individual items — check for an existing helper before writing a new one, per
   this repo's standing rule; `src/engine/eom-inventory.js` has a `countedDate()`-shaped helper doing
   almost exactly this per-row, it's just not exported — either export and reuse it, or write the
   trivial store-level max inline, your call, but don't diverge from its semantics).
2. Query `qsr_fob` for this store's latest row in the current period (reuse
   `fobSnapshotByStore(fobRows, period)` from `src/engine/eom-inventory.js` — it already does the
   "latest snapshot per store, never sum" aggregation correctly and is pure/importable in this Node
   script with no browser deps; don't hand-roll a second FOB aggregation). This means fetching
   `qsr_fob` rows for the relevant loc+period from Supabase — a small new query in this script (there
   isn't one today; check imports before assuming one exists).
3. Freshness check: `fobRow.updated_at >= countCompletedAt` (both real timestamps, compared
   directly — no fudge/grace window unless you find a real reason one is needed, state it if so).
   If fresh: attach the FOB snapshot (`fobSnapshotByStore`'s per-store output — `fobPct`, `fob` $,
   and the six components `comp/raw/cond/emp/statv/unex`) to the notification row's payload (new
   field, e.g. `fob_snapshot` — extend `buildNotificationRow()`'s return shape; this is a new jsonb
   column on `eom_count_notifications`, migration required, see below). If stale or missing:
   **omit the FOB section entirely** rather than showing a caveat-laden guess — the owner asked to
   avoid wrong numbers, not to show wrong numbers with a disclaimer.
4. `resend-notify.mjs`'s `buildEmailContent()`: when `row.fob_snapshot` is present, render a short
   FOB section — the headline `fobPct`/`fob` $ and the six components, each as a dollar figure
   (matching `fob-report.js`'s existing `money()`/`pp()` formatting conventions — don't invent a
   third number format for the same data). No section at all when `fob_snapshot` is absent (not an
   empty placeholder, not "FOB data unavailable" noise — just don't print the header).
5. **Extend `triggerFobPullIfPossible()`'s trigger condition.** Today it only fires on the overall
   ~90%-complete `notified_90` flag (`anyBelievesDoneFired`, only set from `st._fireNow`). A
   food+condiment-only completion (the exact case this task cares about) does NOT currently nudge
   the FOB pull. Add a second flag — fire the same nudge whenever this run's `detection` includes
   `food`/`condiment` in its trigger classes, independent of the overall-90% flag — so a fresh FOB
   pull is actually in flight the moment food+condiment finishes, giving the freshness check in step
   3 a real chance to pass on a later run rather than only ever seeing yesterday's FOB snapshot. (The
   check in step 3 still needs to be real and can still legitimately fail on the very run the count
   just finished, if the FOB pull hasn't landed yet — that's correct behavior per the owner's rule,
   not a bug to work around.)

**Schema**: add `fob_snapshot jsonb` to `eom_count_notifications` via a new
`supabase/schema-eom-fob-snapshot.sql` (idempotent `add column if not exists`, same handoff pattern
as every other new-column migration in this repo — flag clearly in the PR body that the owner needs
to run it before this ships real data, matching `schema-eom-count-notifications.sql`'s own header).

## Verification

- Unit tests: Task 1's rendering change: 2 test cases: `it.descr` + `it.wrin`.
- Unit tests: `kbLinksForClasses(classes, nsn)`'s new signature — assert the Physical Inventory URL
  is built with the given `nsn`, not hardcoded, for at least two different NSNs (catches an
  accidental hardcode of 3708 from the owner's own example).
- Unit tests for the freshness check itself, both directions: FOB `updated_at` after
  `countCompletedAt` → included; FOB `updated_at` before → omitted. Use realistic timestamp fixtures,
  not just booleans.
- A real live measurement (name credential/method) per this repo's "measure it, don't reason about
  it" standing rule: pick one real store with both a recent `qsr_fob` row and recent on-hand count
  activity, hand-compute whether your freshness check would include or omit FOB for it, and confirm
  the code agrees.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing — #212 just landed at v5.253).

## Out of scope

- Any change to `fobSnapshotByStore()`'s aggregation math itself — reuse as-is, already correct and
  load-bearing elsewhere.
- A grace window/tolerance on the freshness check unless you find a concrete reason the exact
  timestamp comparison is too strict in practice (e.g. clock skew) — start with the literal rule the
  owner stated, don't preemptively soften it.
- SMS body changes — the owner's feedback was about the email specifically; leave
  `buildSmsBody()`'s existing 300-char-budget behavior alone (no room for FOB detail in a text
  regardless).
- Any other KB link beyond the two the owner explicitly corrected (`KB_ON_HAND` stays as-is).
