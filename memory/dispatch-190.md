# Dispatch #190 — merge Leadership One-Pager into Above-Store One-Pager (owner-approved 2026-08-10, still open)

## Context

Same source as #188/#189: `memory/decisions-panel-inventory-2026-08-10.md`'s approved merge list:
*"Leadership One-Pager → merge into Above-Store One-Pager with a scope selector. Three
one-pagers → two."* Not yet executed (verified 2026-08-28, both still separate live registry
entries). Same caveat as #188/#189 — this specific item has not been contradicted by any later
dispatch (checked `MEMORY.md`/dispatch #54 family).

**"Three one-pagers → two"** — the doc doesn't name the third explicitly in the excerpt captured
in the decisions file. Before writing any code, grep `panel-registry.js` for every panel with
"One-Pager"/"One Pager" in its label to confirm which two survive and which one folds, and note
in your PR whether a third one-pager exists that this merge doesn't touch (do not silently assume
there are only two candidates just because this dispatch only names two).

## Files (verified 2026-08-28 via App.js's lazyPanel() block)

- Target (survives): registry id `above-store` (label "Above-Store One-Pager") →
  `AboveStoreOnePager`, `src/views/above-store-onepager.js`.
- Source (retires after harvest): registry id `leader-one-pager` (label "Leadership One-Pager") →
  `OnePagerPanel`, `src/views/one-pager.js`.
- Both already `route:true` — no routing-migration work needed.

## Task

1. **Harvest first** (standing retire rule): read `OnePagerPanel` in full, identify what's
   genuinely distinct from `AboveStoreOnePager` (audience framing, metrics chosen, layout) before
   folding it in.
2. **The scope selector is the actual design work here, not incidental** — the owner's own
   instruction names it specifically ("with a scope selector"), implying the merged panel needs to
   let the user pick WHICH scope/audience view they're building the one-pager for (e.g.
   store-level "Leadership" framing vs. district/above-store framing), not just visually
   concatenate both panels' content. Use `LocationSelector` for the location half of scope if the
   two panels differ on that axis (per `memory/panel-contract.md`'s rule: `LocationSelector` owns
   the UI, translate at the boundary if either panel persists a different shape) — but the
   "Leadership vs Above-Store" distinction is a framing/audience choice, which is NOT the same
   thing as a location scope; don't force it through `LocationSelector` if it's actually a
   different axis. State clearly in the PR what "scope" ended up meaning and why.
3. Retire the `leader-one-pager` registry entry and route; redirect the old
   `?panel=leader-one-pager` deep link sensibly.
4. Opportunistic panel-contract check on both panels while you're in them, same standing rule as
   #188/#189, same "don't meaningfully widen blast radius" guard.

## Verification

- Merged panel demonstrably supports both the original Above-Store framing AND the harvested
  Leadership framing via the new scope selector — describe/screenshot both states in the PR.
- Old `?panel=leader-one-pager` deep link redirects sensibly.
- Full suite + build. Version bump (check `origin/main` current version first).

## Out of scope

- Dispatches #188 and #189 (unrelated panel clusters).
- Any third one-pager this dispatch's own investigation surfaces but the owner's original
  decision didn't name — flag it, don't merge it without being asked.
