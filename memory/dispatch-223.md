# Dispatch #223 — Fix GitHub issue #362: `labInRange`/`channelRows` invert the auto-first standing rule

## Context — owner-filed, flagged three times before being filed, still live in code today

GitHub issue #362 (open, owner-filed, `closed_by_pull_requests.total_count: 0`). CLAUDE.md's
standing rule: *"Manual uploads (`laborRows`/`ctrlRows`/`opsRows`/FOB Excel) are last-resort fill
only — they may fill a loc/date the cloud doesn't cover yet but must **never override** auto/
emailed data or be a tile's primary source."* Two places in `src/views/at-a-glance.js` do the
opposite, confirmed still present today (2026-08-30, fresh read, not assumed from the issue text):

1. **`labInRange`** (currently line ~663-678) — its own inline comment states the inversion as
   deliberate: `for(const r of manual) m.set(k(r),r); // a manual upload intentionally overrides
   its own day`. The `auto` loop runs FIRST, `manual` runs SECOND (last-write-wins on the shared
   `Map`), so a stale manual row beats a fresh auto row for the same `(loc,date)`.
2. **`channelRows`** (currently line ~932-938) — `mergeFresh(lab, mergeFresh(led, mix))`, where
   `lab` (manual `laborRows`, filtered to rows carrying channel-mix fields) is `mergeFresh`'s
   `primary` argument, i.e. the winner on a shared day.

`mergeFresh` itself (currently line ~806-812, also confirmed today) is a small, generic
`(primary, secondary)` helper — `primary` always wins on a shared `(loc,date)`, `secondary` fills
every day `primary` doesn't cover. Its own doc comment currently states *"the primary (manual
upload) overrides the secondary (auto pull/email)"* as if that's the function's fixed meaning —
it isn't; `primary`/`secondary` are just argument names, and this dispatch flips WHICH real array
gets passed as which, at exactly the two call sites the issue names.

**Real-world impact, per the issue**: manual data is device-local IndexedDB — blank on every other
device, frozen at the last upload. So a stale manual row silently displacing a fresh cloud row is
wrong on every device except the one that uploaded it, and indistinguishable from a real data
problem when someone eventually notices. The issue notes this changes nothing TODAY only because no
manual rows currently exist in the affected window — it's a live, dormant risk, not a hypothetical.

## Task 1 — invert `labInRange`'s merge order

Swap the two loops so `manual` fills the map FIRST and `auto` runs SECOND (auto wins on a shared
key, exactly mirroring `mergeFresh`'s own last-write-wins mechanism):
```js
for(const r of manual) m.set(k(r),r);   // manual fills any day auto doesn't cover
for(const r of auto)   m.set(k(r),r);   // auto wins on any day it also covers
```
Update the block's own comment — it currently narrates the OLD behavior as intentional design
("Now: auto fills every day, manual overrides the same day it covers (an intentional upload)").
Per the issue's own instruction: *"Read `labInRange`'s comment before changing it... if there's a
real reason behind it that predates the standing rule, that reason needs to be stated and
reconciled, not silently overwritten. If there isn't one, delete the comment along with the
behaviour."* Do that check — read the comment's own reasoning (the Jul-2026 "reverts to old date"
bug it references) and confirm that historical fix doesn't actually depend on manual winning
before deleting/rewriting it. State your conclusion either way.

## Task 2 — invert `channelRows`'s `mergeFresh` call order, fix `mergeFresh`'s own comment

Swap `channelRows`'s call from `mergeFresh(lab, mergeFresh(led, mix))` to
`mergeFresh(mergeFresh(led, mix), lab)` — the auto-combined layer (`led`/`mix`, whose OWN relative
precedence is unrelated to this issue and stays unchanged) becomes `primary` (wins), `lab` (manual)
becomes `secondary` (gap-fill only).

Update `mergeFresh`'s own doc comment (currently line ~801-805) so it no longer hard-codes "primary
= manual, secondary = auto" as the function's meaning — it's a generic first-wins-on-shared-key
merge; say that plainly and let each call site's own comment state which real array it's passing
as which.

**Judgment call — flag, don't silently act on it**: `mergeFresh` has one more caller in this file,
`ctrlEffective` (currently line ~876): `mergeFresh(ds?.ctrlRows, ctrlAuto)` — manual `ctrlRows` as
`primary`, i.e. the identical standing-rule violation, but the issue does NOT name it. Look at it,
decide whether it's genuinely the same bug (state why or why not — check whether `ctrlAuto`'s own
surrounding comment, currently ~line 814-823, documents a reason manual-wins is intentional here
specifically), and either fix it in this same dispatch if it's clearly the same unflagged instance
of the exact bug the issue describes, or leave it untouched and say so explicitly for a follow-up
issue — don't silently widen scope, and don't silently leave an identical live bug unmentioned
either.

## Verification (the issue's own bar — implement these as the guard tests)

- A `(loc, date)` covered by BOTH a stale manual row and a fresh auto row resolves to the AUTO
  value, for both `labInRange` and `channelRows` — as tests, each run against the CURRENT (unfixed)
  code first to confirm it goes red (per this repo's "would this verification still pass if the
  change were reverted" rule), matching the issue's own explicit ask ("each run against the
  unfixed merge once to watch it go red").
- A `(loc, date)` covered ONLY by manual still resolves to manual (gap-fill still works) — for
  both functions.
- If Task 2's `ctrlEffective` judgment call results in a code change, the same two-case bar applies
  to it too.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing — do not trust any version number cited in this doc, another
  dispatch may have landed since it was written).
- Once merged, this PR should close GitHub issue #362 (`Fixes #362` in the commit/PR body).

## Out of scope

- Routing `labInRange`/`channelRows` through `metric-source.js`/`vs-ly.js`'s resolver instead of
  `mergeFresh` — the issue mentions this as a possible cleaner long-term shape ("prefer routing
  through... rather than hand-rolling the precedence a third time"), but that's a materially larger
  refactor (replumbing every field these two functions carry through metric-chain resolution) than
  fixing the precedence bug itself. This dispatch fixes the bug with the smallest correct change;
  a resolver-based rewrite is a separate, larger follow-on if wanted later.
- `mergeFresh`'s OTHER existing caller (`ctrlEffective`) beyond the judgment call in Task 2 — don't
  restructure it speculatively.
- Any other manual-vs-auto precedence site elsewhere in the codebase — this dispatch is scoped to
  exactly what issue #362 names (plus the one flagged judgment call).
