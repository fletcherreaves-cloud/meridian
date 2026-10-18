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

## Owner's answers (2026-10-18, same day as the original ask)

- **Auth for the open link** — owner: treat it like the existing EOM share-link pattern already
  live in this app (`src/views/count-cycle-panel.js`'s `createWeeklyShare()`, the `eom_share_links`
  Supabase table, `supabase/functions/eom-share/index.ts`, `src/views/eom-share-view.js`). That
  flow is proven: `meridian.js` reads a `?share=<token>` query param and routes straight to a
  standalone public view with no login and no app shell; the edge function validates the token
  server-side with the service-role key and returns/accepts only the scoped data that token is
  for. `count-cycle-panel.js` already shows how to add a second **kind** of link on the SAME table
  without a schema or edge-function change, just a distinguishing `period`-style field
  (`wk:YYYY-MM-DD` vs a real `YYYY-MM` EOM period) — the equipment profile can follow the identical
  trick with its own distinguishing value. **One real gap to design for, not just reuse as-is:**
  every existing share link in this app is read-mostly (the EOM share view's own write surface is
  a single boolean "I've reviewed this" acknowledge). The equipment profile needs genuine
  multi-field writes (adding equipment, flagging a manual variant) from an anonymous token holder —
  the edge function for this link kind needs real write support, not just the acknowledge-flag
  pattern the EOM one has today.
- **Scope of "Ops Supplies" / what this is actually for** — owner confirmed directly: this is a
  **gating reference**, not a general asset registry. Concrete examples given: grills use
  manufacturer-specific Teflon release sheets (expensive — the wrong one is a costly mistake), bun
  toasters are the same, and several other machines have manufacturer-specific cleaning chemicals
  (espresso machines, shake/sundae machines, OJ machines). So knowing exactly which
  grill/toaster/espresso machine/etc. a given store actually has is what lets the app block or
  flag an order for the WRONG consumable/chemical for that store's real equipment. This confirms
  the earlier read: the equipment profile's own purchase-ledger tie-in is real and intentional, not
  incidental — it's meant to cross-reference against ops-supplies ordering (`qsr_ebos_line_items`,
  shipped 2026-10-18, is the natural source for "what did this store actually order" once this
  exists) rather than just being a standalone inventory list.
- **Visual placement** — owner wants a real **pinnable floor plan**, not just named zones. Scope
  given directly: 2-3 primary restaurant layouts cover the fleet, to be worked out together (owner:
  "We can work together to achieve the 2-3 primary restaurant layouts") — i.e. a small number of
  reusable base-layout images/templates (not one per store), with each store's equipment pinned
  onto whichever layout matches its build.
- **Patch groupings** — reuse the existing org/patch hierarchy already live everywhere else in the
  app (`LocationSelector`, `INV_ORG_COORDS`, supervisor patches) rather than inventing a new one.
  (Carried over from the original capture — not re-confirmed separately, but uncontested.)

## Likely natural home in the existing app

- A new Supabase table (equipment catalog: type × manufacturer × model, with a `flagged`/`pending
  review` boolean for owner-added variants) plus a per-store equipment-instance table (store, catalog
  item, serial, cert date, placement/zone). Standard tenant_id + RLS shape like every other new
  table this session has added (`qsr_ebos_line_items`, `qsr_raw_item_info`) — same pattern, once
  the open-link auth question above is resolved.
- A new panel, likely under Inventory or a new "Equipment" section in `panel-registry.js`.
- If it reuses `LocationSelector`'s org/patch hierarchy for grouping/filtering (not gating), that's
  the existing, proven component (`src/components/PanelControls.js`) — no new hierarchy needed.
