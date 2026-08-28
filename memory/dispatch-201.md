# Dispatch #201 — merge Channel Intel into 3PO Delivery (overview + drill-down)

## Context — owner-approved 2026-08-28, from the panel-merge scoping pass

Owner confirmed this merge live in this session, from a scoping report of unflagged merge
candidates. `channel-intel` (Channel Intel, `ChannelIntelligencePanel` in `src/views/analytics.js`,
`kind:'optional'`, `section:'analytics'`) tracks 5 channels (Drive-Thru/Breakfast/Delivery/MOP/
Kiosk) with Delivery as one slice among several. `delivery-mix` (3PO Delivery, its own file
`src/views/delivery-mix.js`, `kind:'nav'`, `section:'operations'`, 335 lines) is the
platform-level (DoorDash/UberEats/Grubhub) deep-dive on that same Delivery slice. This is an
overview + drill-down pairing — someone looking at overall channel mix naturally wants to drill
into the delivery platforms next, and someone looking at delivery platforms may want the wider
channel context.

**No file-collision risk**: `analytics.js` and `delivery-mix.js` are not touched by any other
dispatch currently in flight this session (#197/#198/#199/#200) — safe to start immediately.

## Task

1. **Read both panels in full before writing anything.** `ChannelIntelligencePanel`
   (`src/views/analytics.js:7364`) and the whole of `delivery-mix.js`. Confirm each channel's
   actual data source and computation — don't assume from the names alone.
2. **Decide the right shape**: `delivery-mix` surviving as `kind:'nav'` with Channel Intel's
   5-channel overview folded in as a first tab/section (drill into Delivery from there), OR the
   other direction if you find `channel-intel`'s broader view is the more natural landing page —
   state which you picked and why. Given 3PO Delivery is already the established `kind:'nav'`
   destination and Channel Intel is `kind:'optional'` (Panel Manager toggle, less prominent),
   default to 3PO Delivery surviving unless you find a concrete reason otherwise.
3. **Retire the losing registry entry** to `kind:'internal'` (harvest-then-remove, keep its `id`
   for `panel-registry.test.js`'s pairing check), redirect its deep link(s) into the merged panel.
4. **Opportunistic panel-contract check** (close button, date picker, `LocationSelector`,
   mobile-scroll) if it doesn't meaningfully widen scope.

## Verification

- Merged panel shows both the wider channel-mix overview and the platform-level delivery
  drill-down, in one coherent flow.
- Old registry id's deep link redirects correctly.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing — several dispatches are landing on `main` concurrently this
  session).

## Out of scope

- Any other panel-merge candidate from this session's scoping passes.
- Redesigning either panel's underlying computation.
