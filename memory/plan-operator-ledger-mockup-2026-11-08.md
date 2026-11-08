---
name: plan-operator-ledger-mockup-2026-11-08
description: "The Ledger" — the Operator-tier home-screen mockup (task #121, "dream up" request 2026-11-07), added 2026-11-08 as a 5th deck in the pre-existing "Four/Five Decks" Artifact exploration. Concept only, not built into the real app.
metadata:
  type: project
---

# The Ledger — Operator mockup (2026-11-08)

Owner request 2026-11-07: *"Maybe see if you can dream up a version that is operator specific for
those roles as well. Something that screams here is how MY stores are doing and what I should be
focused on."* Explicitly exploratory ("dream up"), not a build-for-real instruction — task #121.

## Where it lives

Added as a **5th deck** to the pre-existing "Four Decks" Artifact (The Bridge/The Patch/Today's
Game Plan/Shift Scoreboard — built earlier in the same freelance exploration pass, task #118),
renamed **"The Five Decks"** to match. **This Artifact URL was never written down in this repo
before this file** — a real gap (the standing "commit every memory file" rule exists for exactly
this reason) — so recording it here:

**https://claude.ai/artifact/AC6UybfZEgFm7C1Psstejr**

Private, owner-only. Game Plan and The Patch (decks 2 and 3 in spirit — "Today's Game Plan" and
"The Patch") were each separately built for real afterward (v5.687/v5.688, PR #1735) — this deck
and the other two originals (The Bridge, Shift Scoreboard) remain concept-only.

## Design — "The Ledger" (Operator tier)

Worked example: **Ryan Thorley**, the real operator with the most stores (12) and the only one
whose footprint crosses state lines (`operatorGroups()`/`INV_ORG_COORDS`, `src/constants.js`) —
9 Oklahoma stores + 3 Florida Panhandle stores (Bonifay, Mossy Head, Ponce de Leon).

- **Two honest regional clusters, not one fabricated territory.** The Patch's single-blob map
  pattern (one SVG shape, dots normalized into its bounding box) would either erase the ~490-mile
  gap between Ryan's OK and FL stores or stretch a shape across empty territory he doesn't
  operate in. This deck draws two separate regional mini-maps instead — same "never invent a
  shape" discipline The Patch already holds, just applied to a genuinely non-contiguous footprint.
- **Peer-comparison bar** — Ryan's sales-vs-LY ranked against the other 3 real operators (Gary
  Mornhinweg, Rick/Kathy Thorley, Jacob Thorley), deliberately NOT flattering (Rick/Kathy ranks
  ahead of Ryan in the mockup's illustrative numbers) — the one element genuinely unique to this
  tier: a DO doesn't normally see another DO's patch, but an owner comparing against the other
  owners is how this org already talks about performance.
- **Visual identity**: warm dark-walnut "ownership ledger" palette (brass accent, oxblood
  crit/olive good) + Fraunces/Work Sans type pairing — distinct from all 4 existing decks' own
  committed palettes/type pairs, same "each deck is its own world" convention.
- **Real names, illustrative numbers** — same convention every other deck in this exploration
  uses: store names, operator names, and real relative geography are real; dollar/percent figures
  are made up for the mockup, same as Bridge's $14,200 or Patch's +2.4%.

## Owner feedback + revision (2026-11-08)

*"Love the operator!! Only thing I'd change right now is for Ryan to separate labor between
states and show a combined total. Very different goals in the different markets."* — the top-line
"Labor % across your stores" pill was a single blended number; changed to show **OK 25.1% · FL
23.4%**, with the combined 24.6% kept as a secondary line underneath (same pill, split layout).
The per-region cards further down already showed this split — the fix was surfacing it in the
top-line glance pill too, not computing it for the first time.

## Status — built for real, same day (2026-11-08)

Owner: *"great point, we can fix that. You can or I can add."* — resolved the open design
question (new RBAC role vs. a view on existing accounts) in favor of **no DDL**: "Operator" is
NOT a new `profiles.role` value. Any Owner/VP/Admin-tier account can self-service-tag itself with
a real operator identity (`operatorGroups()` key) via a new `curated_home_operator_group`
user_settings key — same self-contained load/save pattern `curated_home_format` already uses, no
schema change, no admin-on-behalf-of write (RLS on `user_settings` only allows a row's own
`auth.uid()` to write it, so this had to be self-service, not admin-assigned). An account that
never sets this gets ZERO behavior change.

Also fixed the mockup's own mileage error the owner caught (*"~490 mi is a bit off, closer to
800-900"*) — the real app version computes the real straight-line (haversine) distance between
each region's own store centroids from `INV_ORG_COORDS`, never a guessed or copy-pasted number;
it reads ~770-870 mi for Ryan Thorley's real OK/FL split depending on which stores anchor each
region's centroid, consistent with the owner's correction.

### Files

- `src/engine/operator-ledger.js` (new) — `operatorStores()`, `operatorRegions()` (groups by
  each store's own real `INV_ORG_COORDS` state, computes `computePatchRollup()`/
  `computePatchMap()` independently per region — reused verbatim from `patch-plan.js`, no second
  implementation), `distanceBetweenRegions()` (real haversine between 2 regions' centroids,
  `null` for any other region count), `operatorPeerComparison()` (every real operator with real
  stores, ranked, viewer flagged). Pure, unit-tested.
- `src/views/operator-ledger-view.js` (new) — `OperatorLedgerFormat`, embeds `GamePlanFormat` for
  the drill-down, reuses `RollupStat`/`TerritoryMap`/`NeedsAttentionList`/`fmtPct`/`fmtDollar`
  exported from `patch-plan-view.js` rather than a second copy.
- `src/views/curated-home.js` — `operatorGroup` state (load/save, self-contained, same pattern as
  the format preference), a self-service "Operator: [dropdown]" picker (district altitude only,
  options straight from `operatorGroups()`, never hardcoded), `'ledger'` added to `FORMATS` with
  its own combined altitude+identity gate in `formatFitsAltitude` (not a plain `FORMAT_ALTITUDE`
  entry, since availability depends on BOTH altitude and the account's own operator identity),
  `defaultFormat` becomes `'ledger'` only when both are true AND no saved preference exists.
- `src/views/patch-plan-view.js` — exported `RollupStat`/`TerritoryMap`/`NeedsAttentionList`/
  `fmtPct`/`fmtDollar` for reuse (were local-only before).
- Tests: `src/__tests__/operator-ledger.test.js` (engine, real seeded locs from `constants.js`,
  not a parallel fixture), `src/__tests__/curated-home-operator-ledger.test.js` (panel-level:
  no default without an identity set, picker reveals + defaults it, saved-pref respected, the
  drill-down + back link, the real peer comparison, never offered outside district altitude).
- `src/app/changelog/5.689.js` + regenerated `changelog-latest.js`.

### Deliberately out of scope for this pass

- No admin-assigned operator identity (would need either a new RLS policy or a service-role Edge
  Function — real scope, not attempted here since self-service already covers the real, small
  set of users).
- 3+ region wording (`distanceBetweenRegions` returns `null` for anything but exactly 2 — no real
  operator currently spans 3+ states).
