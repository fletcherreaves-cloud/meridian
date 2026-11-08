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

## Status

Concept only. "Operator" is not a login role in `permissions.js` today — building this for real
means first deciding whether operators get their own login tier or a filtered view of an existing
one (same open question noted in the deck's own "why this shape" note). Not scheduled; no task
currently open for a real build.
