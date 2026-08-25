# Dispatch #120 — Security panel: mobile-unusable location pills, findings readability

**Owner's ask, verbatim (2026-08-25, mobile screenshot):**
- *"Security > unusable on mobile with all the pulls for locations. Needs to be changed to
  location selector and add date selector while in there as well. Date selector should only
  refine what we are seeing, not affect purpose of the security scan for detecting prior
  events."*
- *"Would also like to see the prior events selectable to go to actual event or maybe a good way
  would be to present findings in a table that's easier to read."*

## Confirmed by reading the actual component — two of the three asks are partially or fully
## already solved; don't redo them

`src/views/security-panel.js`, `SecurityPanel`:

1. **Location scope is hand-rolled, not the shared `LocationSelector`.** Confirmed real: `scope`
   state and the `pill()`-based rows (`states.map`/`orgs.map`/`storeLocs.map`, ~lines 866-879)
   render **every state, every org, and all ~27 stores as one flat wrapped pill row** — exactly
   what the screenshot shows and exactly the reported mobile problem. The shared component,
   `LocationSelector` (`src/components/PanelControls.js:155`), already has a `mode:'progressive'`
   built for precisely this ("dispatch #104 — same All→State→Patch→Store hierarchy and pill
   styling as 'full', staying inside the documented pill-style standard, but revealed one tier at
   a time instead of all 30+ pills flat/simultaneous"). This panel does not use it — a genuine
   `memory/panel-contract.md` violation, not a stale-doc issue.
   - **A real structural mismatch to resolve, not paper over:** this panel's scope levels are
     `'all'|'state'|'org'|'store'` (`scopeMatches`, ~line 165 — `org` maps `state==='FL'` to
     `'emerald'`/else `'mcdok'`), while `LocationSelector`'s hierarchy is `All → State → Patch →
     Store` — no `org` tier, and CLAUDE.md's own canonical mapping says state and org are 1:1 for
     this business (MCDOK=Oklahoma, Emerald Arches=Florida) — so the "Org" pill row you see today
     is functionally redundant with the State row right next to it, not a second independent
     dimension. Decide and document explicitly (don't silently drop functionality): most likely
     resolution is dropping the redundant Org tier in favor of `LocationSelector`'s real Patch
     tier (a genuine capability this panel doesn't have today — supervisor-scoped filtering,
     consistent with how the rest of the app already uses `LocationSelector`), translating
     `LocationSelector`'s `{level, id}` value to/from this panel's `{level, value}` shape at the
     UI boundary per `panel-contract.md`'s §3 rule (in-memory-only state here, not persisted, so
     the translation is cheap — no stored-data migration concern).
2. **The date selector already exists and already behaves the way the owner asked for.**
   `DateRangeControl` (dispatch #100, ~line 905-914, `windowEndInRange`) is already wired in, and
   confirmed by reading the actual data flow: `dateRange` is used ONLY inside the `groups`
   `useMemo` (~line 792) that filters the already-loaded `findings` state for display —
   `loadSecurityFindings()`, the actual scan/fetch (~line 733), takes no date parameter and is
   triggered only by `permState`, never re-run when `dateRange` changes. **The owner's stated
   requirement — "should only refine what we are seeing, not affect purpose of the security scan
   for detecting prior events" — is therefore already satisfied by the current code.** Do not add
   a second date control or duplicate this filtering. The owner most likely didn't notice it (the
   screenshot cuts off right where it renders, buried below ~30 location pills) — which is itself
   an argument for the LocationSelector fix above: once the pill sprawl above it collapses to a
   `mode:'progressive'` selector, this already-correct control becomes visible and reachable
   without scrolling past a wall of store names.
3. **Findings readability — genuinely open, needs investigation before choosing an approach.**
   Findings render via `SubjectRow` (~line 539) as an expandable card list, not a table, and carry
   no transaction-level identifier — they're aggregated at `(subject, rule, window)` grain
   (`windowStart`/`windowEnd`/`computedAt` per verdict), not a single POS-transaction ID. Before
   picking an approach, check whether a genuine navigation target exists for a given finding's
   window (e.g., a Register Audit view scoped to that store + date range, if one is reachable —
   grep for `RegisterAuditTab`'s current import/registration status, since `App.js` has a comment
   suggesting it moved) — if a real target exists, wire a click-through to it; if nothing concrete
   exists to jump to (a real possibility — the owner offered this only as one of two options), a
   clearer table-based layout for `SubjectRow`'s findings (real `<table>`/`<th>`, sortable by
   window/rule/subject) is the fallback per the owner's own "or maybe a good way would be" framing.
   State which you chose and why in the PR.

## Scope

`src/views/security-panel.js` only. Do not touch the underlying detection rules
(`security_rules`, `loadSecurityFindings`), `windowEndInRange`'s basis logic (already correct,
verified above — leave it), or any other panel.

Per `memory/panel-contract.md`'s standing rule, this panel is a good opportunity to also check its
close button (`ModalShell`/`RoutePanelShell` compliance) while you're in here — but don't let that
expand scope beyond a quick check; the location-selector and findings-readability work is the
actual ask.

## Verification bar

- Render the panel at a real mobile viewport (e.g. 390×844) with the full 27-store dataset and
  confirm the location scope no longer renders 30+ pills in one flat wrapped row — the
  progressive/tiered reveal keeps each screen's pill count small and the date-range control
  reachable without excessive scrolling.
- Confirm `scopeMatches`/the filtered `groups` produce identical results for an equivalent
  selection before and after the swap (e.g., selecting "FL" state today vs. selecting "FL" state
  via the new selector scopes to the same store set) — a regression test comparing old vs. new
  scope-derived loc sets for a few real selections.
- Confirm the date-range control's existing behavior (display-only filter, scan unaffected) is
  unchanged — add a test asserting `loadSecurityFindings`/the fetch effect never receives or
  depends on `dateRange` if one doesn't already exist.
- Whichever findings-readability approach is chosen, cover it with a render test.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Do NOT

- Do not add a second/duplicate date-range control — one already exists and is already correct.
- Do not change `loadSecurityFindings`, `security_rules`, or `windowEndInRange`'s filtering basis.
- Do not silently drop the Org/Patch distinction without documenting the decision — state clearly
  in the PR whether Org was dropped as redundant, kept, or mapped onto Patch, and why.
