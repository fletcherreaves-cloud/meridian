# Equipment Profile System (Ops Supplies) — captured 2026-10-18, NOT STARTED

Owner request, verbatim (2026-10-18), to be picked up on a future session — this file exists so
the ask survives between now and whenever work actually starts, per CLAUDE.md's "commit every
memory file" rule. **Nothing below has been scoped into a dispatch or built yet.**

## The problem it solves

An interactive equipment profile per store, so the owner can see exactly which Ops Supplies items
each location actually needs — and stop stores from ordering unnecessary/costly items that don't
match their real equipment.

## Requirements, as stated

- **Live, link-based form** — fillable and updatable by anyone with the link. Not locked to
  patches/supervisors; open to "anyone whom can provide the data" (owner's own phrasing — i.e. a
  GM, an AS, a crew trainer doing the walkthrough, whoever is on-site). Patch groupings are wanted
  for organizing/filtering the data, but must not gate who can edit.
- **Per equipment type, a primary options list** the owner will supply (manufacturer, model, etc.)
  — presented as a **dropdown**.
- **Manual-entry escape hatch**: if the real equipment variant isn't in the dropdown, the user can
  type it in. That manually-entered variant must be **flagged for owner review**, but immediately
  becomes selectable by every other user from then on (so the catalog grows organically from real
  walkthroughs instead of needing the owner to pre-populate every variant up front).
- **Serial number + current certification date** fields — but only for the subset of equipment
  types the owner designates as needing them (most equipment won't have these fields at all; this
  is a per-equipment-type flag, not a blanket field).
- **A sensible walkthrough flow** — the form should be built to flow naturally as someone actually
  walks the store, not as a flat alphabetical list.
- **A visual/spatial layout**: equipment placed on something like a floor plan or area map, located
  where it actually sits in the restaurant (e.g. "front counter," "kitchen line," "drive-thru,"
  "back of house") — owner's own words: "a visual system to place the equipment in the area of the
  restaurant it most likely resides."
- Owner is explicitly open to other ideas for making this easy to update/maintain long-term — this
  is a starting spec, not a locked one.
- **Needs a real database** to log results, and should be built **for ongoing/ repeated use** (a
  living record that gets re-walked and updated over time), not a one-time survey.

## Open design questions for whenever this is scoped (not yet answered by the owner)

These are things worth asking before building, not things to guess at:

- **Auth model for the open link.** Every other piece of persistent data in this app goes through
  Supabase with RLS scoped to `accessible_locs`/role (CLAUDE.md's standing rule). An
  edit-by-anyone-with-the-link flow is a genuine departure from that pattern — likely needs its own
  lightweight auth (a shared per-store link/token? name-only attribution with no login?) rather
  than requiring every contributor to have a Meridian account. Worth deciding deliberately, not
  defaulting into it.
- **What counts as "flagged for review"** — a dedicated review queue/panel (mirroring the existing
  Task Queue / Feature Requests pattern already in this app), or something lighter?
- **The floor-plan/visual layout** — a real per-store image users place pins/icons on (needs an
  image-upload affordance, like a generic restaurant template they tag areas on), vs. a simpler
  fixed set of named zones (front counter, kitchen, DT, BOH, dining room) with no actual image.
  The owner said "I am open to other ideas" here specifically — this is the part most worth
  proposing options for rather than assuming.
- **Scope of "Ops Supplies"** — does this only cover the `ops_sub` purchase category (same
  category `qsr_ebos_daily`/`qsr_ebos_line_items` already track), or does "equipment" extend to
  food-prep/kitchen equipment that isn't an Ops Supplies purchase line at all (e.g. a grill, a
  fryer) but still needs a profile? The examples given (manufacturer/model/serial/cert date) sound
  like real kitchen equipment, not consumable ops supplies — worth clarifying the actual intended
  scope before designing the schema, since "prevent unnecessary Ops Supplies orders" implies the
  profile's real PURPOSE is to constrain which consumables/parts a store should be ordering based
  on what equipment it actually has (e.g. don't let a store without a McCafé espresso machine order
  McCafé filters) — i.e. the equipment profile is likely a **gating reference table for the ops-
  supplies ordering/variance side of the app**, not a standalone asset registry. Confirm this
  reading before scoping.
- **Patch groupings** — reuse the existing org/patch hierarchy already live everywhere else in the
  app (`LocationSelector`, `INV_ORG_COORDS`, supervisor patches) rather than inventing a new one.

## Likely natural home in the existing app

- A new Supabase table (equipment catalog: type × manufacturer × model, with a `flagged`/`pending
  review` boolean for owner-added variants) plus a per-store equipment-instance table (store, catalog
  item, serial, cert date, placement/zone). Standard tenant_id + RLS shape like every other new
  table this session has added (`qsr_ebos_line_items`, `qsr_raw_item_info`) — same pattern, once
  the open-link auth question above is resolved.
- A new panel, likely under Inventory or a new "Equipment" section in `panel-registry.js`.
- If it reuses `LocationSelector`'s org/patch hierarchy for grouping/filtering (not gating), that's
  the existing, proven component (`src/components/PanelControls.js`) — no new hierarchy needed.
