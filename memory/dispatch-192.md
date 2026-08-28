# Dispatch #192 — URL-page migration batch 1 (owner-affirmed default, 2026-08-28)

## Context — the standing policy, now explicit

Dispatch #54 (2026-08-21) established the rule for which panels should be `route:true`
(URL-addressable `RoutePanelShell` pages) vs. stay `ModalShell` interruptions: **`help`/`admin`
section panels are interruptions (modal); everything else is a destination (routed page)** —
falls out of the `routing.js` test *"would I ever want to send someone a link to this?"*. Named
exceptions that stay modal despite being outside `help`/`admin`: **SAGE** (as-is), **Knowledge
Base**, **About**, **Metric Lineage**, **Feature Requests**, **Local News**, plus **Task Queue**
("a personal work list, read alongside other work") and **Settings**/**Panel Manager** (pure
configuration, never a link destination).

**Owner, 2026-08-28: "make sure we are converting pages to urls except where specified or you
have a strong opinion otherwise."** This affirms the above as the standing default — convert to
`route:true` unless a panel is one of the named exceptions above, or you find a specific, stated
reason not to (state it in the PR if so, don't just skip silently).

Current state (measured 2026-08-28): **13 of 101** registered panels are `route:true`. Six of
those were already covered by the named "start with" list in dispatch #54 (`perf-reviews`,
`fob-analysis`, `fob-eom`, `eom-dashboard`, `count-cycle` are all already `route:true`;
`scheduling` is a `hub-tab`, not a standalone candidate the same way). This dispatch is the next
batch, per dispatch #54's own "batch it — five or six at a time, each independently shippable and
revertable" instruction.

**One open classification call, made here rather than re-punted**: dispatch #54 flagged `Data
Manager` as ambiguous and asked the owner. Not yet asked. Leaning on dispatch #54's own reasoning
("uploading files is a task you go and do rather than a thing you glance at") — that leans
destination/route, not interruption/modal. **This dispatch does NOT include Data Manager** — flag
it in your PR as the one still-open case rather than deciding it here, so it can get a quick
explicit answer rather than silently going either way.

## This batch — 6 panels, verified not already touched by any other dispatch running today

Verify each via `App.js`'s actual render logic (not just the registry) before touching — this
codebase's several `showX` boolean-state panels (not yet on the `routePanel` mechanism at all)
look different in code from panels already on `modal===` dispatch but not yet `route:true`; both
are valid starting points for this dispatch, just implemented differently today:

- `attention` — Needs Attention (`AttentionPanel`, from the `analytics.js` lazy group)
- `signals` — Signals (`SignalsPanel`, `src/views/signals.js`)
- `security` — Security (`SecurityPanel`, `src/views/security-panel.js`)
- `ranking` — Rankings (`RankingView`, from the `store-dash` lazy group)
- `promo-roi` — Promo / Discount ROI (`PromoRoiPanel`, `src/views/promo-roi.js` — currently a
  **static** top-level import in `App.js`, not lazy at all; converting to `route:true` via
  `RoutePanelShell` is a good opportunity to also lazy-wrap it per CLAUDE.md's entry-chunk-budget
  rule, since a route panel is rendered on demand anyway — do this if it's a clean, low-risk part
  of the same change, not as a separate detour)
- `morning-brief` — Daily Brief (`MorningBriefPanel`, `src/features/morning-brief.js` — also
  currently a **static** top-level import; same lazy-wrap opportunity as promo-roi)

## Task

For each of the 6 panels:
1. Set `route:true` in `panel-registry.js`.
2. Convert its render site to `RoutePanelShell` (matching the established pattern from any
   already-converted panel, e.g. `fob-eom`/`count-cycle` before dispatches #188/#189 potentially
   touch them — if those land first and change the reference implementation, use whatever the
   current best example is) — no backdrop, no `maxWidth` cap, header + body per
   `memory/dispatch-27.md`'s rule.
3. Keep the old `?modal=<id>` deep link working (redirect into the new route), per every prior
   panel-contract conversion in this codebase.
4. Where noted above (promo-roi, morning-brief), lazy-wrap the previously-static import as part of
   this change and report the entry-chunk size delta (before/after, gzip) in the PR body per
   CLAUDE.md's speed-check standing rule.
5. Do NOT change any panel's actual content/logic — this is presentation/routing only.
6. Do NOT touch any panel from dispatches #188, #189, #190, or #191 (Food Cost/EOM, Inventory
   Control/Count Cycle, One-Pagers, Calendar/Events) — those may be landing in parallel today.

## Verification

- Each of the 6 panels opens as a real URL-addressable page (`?panel=<id>`), old `?modal=<id>`
  deep links still resolve.
- Entry-chunk size before/after (gzip) for the two lazy-wrap conversions.
- Full suite + build. Version bump (check `origin/main` current version first).

## Out of scope

- Data Manager's classification (flag it, don't decide it here).
- Any panel from dispatches #188-191.
- The remaining ~35 route:true candidates beyond this batch — next wave, same pattern.
