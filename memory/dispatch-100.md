---
name: dispatch-100
description: The Security panel (src/views/security-panel.js) has two real gaps against this repo's own standards -- its location selector only renders All + per-State pills even though the filtering logic (scopeMatches) already supports Org and Store levels too, and there is no date-range control anywhere (loadSecurityFindings() loads everything, unbounded, ordered by computed_at desc, with zero window/date filtering). Owner wants both added: the standard 4-level location selector, and date-range controls.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #100 — Security panel: standard location selector + date-range controls

**Status:** ready, no further owner decision needed. Independent of the in-flight Inventory Control
work (dispatches #97-#99) — different file, safe to run in parallel.

---

## Gap 1 — location selector is missing two of its four levels

`src/views/security-panel.js`'s `scopeMatches()` (~line 160, explicitly citing
`feedback-selector-ui-standard.md`, this repo's documented "All → State → Org/Patch → Store"
selector standard) already implements all four levels:

```js
export function scopeMatches(loc, scope) {
  if (!scope || scope.level === 'all') return true;
  const org = INV_ORG_COORDS[loc] || {};
  if (scope.level === 'state') return org.state === scope.value;
  if (scope.level === 'org') return (org.state === 'FL' ? 'emerald' : 'mcdok') === scope.value;
  if (scope.level === 'store') return loc === scope.value;
  ...
}
```

But the actual rendered pill row (~line 800-802) only ever constructs `all` and `state` pills:

```js
pill('All', scope.level === 'all', () => setScope({ level: 'all' })),
states.map(st => pill(st, scope.level === 'state' && scope.value === st, () => setScope({ level: 'state', value: st }))),
```

**Org and Store are never offered as pills**, even though the filter logic already handles them
correctly. This is a real, measured gap (found by reading the code, not assumed) — not a design
question. Fix: extend the pill row to include Org-level pills (Emerald Arches / MCDOK, matching the
`org.state === 'FL' ? 'emerald' : 'mcdok'` mapping `scopeMatches` already uses) and Store-level
selection, following whatever this repo's other panels already do for the same 4-level standard
(check how other panels citing `feedback-selector-ui-standard.md` render their Org/Store pills or
dropdown — e.g. Analytics/At-A-Glance's location filter — and match that pattern rather than
inventing a new one).

## Gap 2 — no date-range control at all

`loadSecurityFindings({ ruleIds = null })` (`src/lib/supabase.js`, ~line 4103) takes no date
parameter whatsoever — it loads every row, unbounded, ordered by `computed_at desc`. The panel has
no date/window filter UI and no way to scope the findings shown to a specific period.

Add date-range controls (start/end) that filter the displayed findings by their `windowStart`/
`windowEnd` (the security rule's own evaluation window) or `computedAt` (when the batch job
produced the verdict) — check which one makes more sense for how an investigator actually uses this
panel (probably `windowEnd`/the event's own date, not `computedAt`, but verify against how the data
is actually structured and how the panel's existing subject-timeline/drill-down features use dates
before deciding) before implementing. Follow this repo's existing "name the basis explicitly" habit
(dispatch #82/#90/#92's own field-naming discipline) — the control and its filtering must make clear
which date field it's filtering on, not just "date range" with an ambiguous basis.

Decide whether the range filter should be client-side (filter the already-loaded `findings` array,
simplest, fine unless the table is huge) or should be threaded into `loadSecurityFindings()` as a
query param (better if the unbounded load is itself a performance concern — check row count via a
live Supabase pull before deciding this is necessary; don't add server-side date filtering
speculatively if the table is small enough that a client-side filter is simpler and sufficient).

## Verification bar

- Render the actual `SecurityPanel` consumer (not an isolated `scopeMatches`/loader unit test) and
  confirm: selecting an Org pill filters to the right stores (compare against `INV_ORG_COORDS`'
  real state/org mapping), selecting a Store pill filters to exactly that store, and the date-range
  control actually changes which findings render — assert on real filtered output, not just "the
  control renders."
- Confirm `scope.level === 'all'`/`'state'` behavior is unchanged (additive, not a rewrite).
- If the table's row count is large enough to make an unbounded load actually slow, note that
  measurement and consider (but don't feel obligated to build, unless the numbers justify it)
  server-side date filtering as part of this same PR.

## Do NOT

- **Do not invent a new location-selector pattern.** This repo already has a standard
  (`feedback-selector-ui-standard.md`) and other panels already implement it — match an existing
  one, don't design a new pill/dropdown shape from scratch.
- **Do not guess which date field (`windowStart`/`windowEnd`/`computedAt`) the range should filter
  on without checking how the panel's own drill-down/timeline features already use these fields.**
- **Do not touch `src/views/eom-dashboard.js` or anything in the dispatch #97/#98/#99 chain** —
  unrelated file, unrelated panel, no reason to overlap.
