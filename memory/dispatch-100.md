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

## Gap 3 — rule-filter pills carry no short descriptor (owner, added 2026-08-24, after this
dispatch was already in progress)

*"In the pills that label the policy (Cash-001, cash-002, etc.) Add a small brief descriptor to
the pill such as Cash +/-, Overring, Refund, Promo, etc. Do this for Cash and Inv pills."*

The rule-filter pill row (`SecurityPanel`, search `pill('All', !ruleFilter` — a different pill row
than Gap 1's location selector) currently renders each pill as just the bare rule ID
(`r.ruleId + (r.active ? '' : ' ⏸')`, e.g. "CASH-001"). The fuller plain-language `description`
(from `security_rules.description`, dispatch #46's rewrite) only shows separately, below the row,
for whichever single rule is currently selected/first. The owner wants a short (1-3 word) descriptor
visible on every pill, for both Cash (`CASH-001/002/003/004`) and Inventory (`INV-001/002`) rules —
the full rule set, named in `RULE_UNITS` (~line 175).

**Derive each tag from the rule's own already-loaded `description`, don't guess a mapping.** The
owner's examples ("Cash +/-", "Overring", "Refund", "Promo") illustrate the desired *style* — short,
plain, scannable — not a confirmed rule-ID-to-label mapping. Every rule already has a real
plain-language description in the database; summarize that accurately into 1-3 words per rule
rather than assigning one of the owner's example labels to whichever rule ID seems closest.

Keep this additive to the existing description line below the row (which still shows the fuller
text for the selected rule) — the inline pill tag is a shorter, always-visible summary, not a
replacement.

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

## Resolution (shipped, v5.140, PR #676)

**Both gaps closed additively — `scope.level === 'all'`/`'state'` behavior is unchanged**: all 58
pre-existing `security-panel.test.js` tests pass unmodified against the new code.

### Gap 1 — Org and Store pills

Added to the SAME pill row `scopeMatches` already fed (`SecurityPanel`, extending the block that
builds `All`/`State` pills), reusing the file's own local `pill()` helper and the existing
`{level, value}` scope shape — no new UI pattern, matching the "don't invent one" instruction.

- **Org pills:** `Emerald Arches` / `MCDOK`, derived from `INV_ORG_COORDS` through the exact
  `org.state === 'FL' ? 'emerald' : 'mcdok'` mapping `scopeMatches` already used (not a hardcoded
  2-item list), so a third org/state added to `INV_ORG_COORDS` in the future needs no code change
  here.
- **Store pills:** all 27 real `INV_ORG_COORDS` locs, numeric-sorted, labeled `loc — StoreName`
  (`STORE_NAMES`) — the identical flat wrapped-pill pattern `OpportunityDollars`' shared
  `LocationSelector` (`src/components/PanelControls.js`) already ships in production for the same
  27-store list, so a 27-pill row is a proven pattern here, not a new risk. **Deliberately not**
  swapped to the shared `LocationSelector` component itself — that component's tier is `patch`
  (supervisor territory, from `INV_ORG_COORDS[loc].sup`), a different concept from this panel's
  `org` (Emerald Arches/MCDOK), so reusing it would have meant either renaming `scopeMatches`'
  levels or silently changing what "Org" means here. Matched the established *pattern* (pill
  style, All→State→Org→Store hierarchy, store label format), not forced the exact component.

Render-based tests (real `INV_ORG_COORDS` locs, not synthetic fixture ids) confirm: the `MCDOK`
pill filters to real stores `3708`/`5183`, excluding real FL store `6178`; `Emerald Arches` does
the inverse; the Store pill `3708 — Ardmore-Broadway` filters to exactly that store, excluding a
same-org sibling (`5183`); `All`/`OK` (state) pills produce the same result as before.

### Gap 2 — date-range control

**Measured before choosing client- vs. server-side filtering**, per the dispatch's own
instruction — live pull against `security_findings` via the `SUPABASE_SERVICE_ROLE_KEY`
credential (`apikey`+`Authorization: Bearer`, `Prefer: count=exact`, `Range: 0-0`, reading
`content-range`):

| measurement | result |
|---|---|
| total rows | `content-range: 0-0/29866` — **29,866 rows** |
| `min(window_end)` | `2026-08-20` |
| `max(window_end)` | `2026-08-31` |
| `min(computed_at)` | `2026-08-20T18:28:34Z` |
| `max(computed_at)` | `2026-08-24T11:18:50Z` |
| rows with `window_end >= 2026-07-25` (a 30-day-back probe) | `0-0/29866` — i.e. **all 29,866 rows** already fall inside the last 30 days |

The batch job is young: every row's `window_end` already sits inside an 11-day span. **Chose
client-side filtering** of the already-loaded `findings` array — the dispatch's own "simpler, fine
unless the table is huge" default — since a date-range filter over that shape buys nothing a
server-side query would improve today. (The 29,866-row unbounded *load* itself, via `fetchAll`'s
sequential 1000-row pagination — ~30 round trips — is a separate, pre-existing concern the
dispatch didn't ask this PR to fix; noted here rather than silently expanded into scope.)

**Basis: `windowEnd`, not `computedAt`** — checked against how the panel's own subject-timeline/
trend features already order a subject's history before picking one: `groupFindingsBySubject`
sorts each rule's own window history by `windowEnd` (`computedAt` only the tiebreaker), and
`buildSubjectTimeline()`/`classifySubjectShape()` (`security-drilldown.js`) consume that same
`windowEnd`-ordered history. The new control follows that already-established basis and names it
explicitly in the UI ("Findings with a window ending:"), per this repo's "name the basis" habit.

Reuses the shared `DateRangeControl` (`src/components/PanelControls.js`, issue #126 — built, but
adopted by no view before this PR) plus a local "All dates" reset pill — the shared component has
no built-in unbounded state, and adding one there would touch a file other panels may adopt later,
so the reset stayed local rather than editing that shared file speculatively.

Render-based tests use `resolveDatePreset()` (the same function the control's own preset buttons
call) to compute a real, wall-clock-anchored `{s,e}`, rather than a hardcoded date that would go
stale: a same-day fixture finding and a 400-real-days-old one, clicking `90D` keeps the former and
excludes the latter, and `All dates` resets both back into view.

### Owner follow-up, folded into the same PR (not a separate dispatch)

Mid-session, the owner asked for a short descriptor on each rule-filter pill (`CASH-001` etc.),
illustrated with examples like "Cash +/-, Overring, Refund, Promo." Added `ruleShortTag()`,
mechanically derived from the rule's own already-loaded `security_rules.method` — never a
hardcoded `ruleId -> tag` table, matching this file's own `RuleDirectory` anti-hardcode
discipline. Two mechanical trims, both at real word/clause boundaries: cut everything from the
word "rate" onward (every real seeded method's qualifying clause lives after it), then if what
remains reads "X / Y" (the same concept stated twice, e.g. "Manual refund / self-authorized
refund"), keep only the first clause. Checked against the real seeded methods
(`supabase/schema-security-rules*.sql`), not the test-fixture placeholders:

| ruleId | real `method` | `ruleShortTag()` output |
|---|---|---|
| CASH-001 | Cash drawer over/short rate | Cash drawer over/short |
| CASH-002 | POS over-ring rate | POS over-ring |
| CASH-003 | Manual refund / self-authorized refund rate | Manual refund |
| CASH-004 | Promo/discount rate | Promo/discount |
| INV-001 | Item TvA variance rate vs. expected usage | Item TvA variance |
| INV-002 | Dollar-variance rate vs. store sales | Dollar-variance |

Renders as `CASH-002 · POS over-ring` etc. on every pill, both domains; inactive `CASH-003` still
carries its `⏸` marker (appended last, unchanged position); the fuller `description` line that
already rendered below for the selected rule is untouched — additive, not a replacement.

### Verification bar (dispatch's own bar, met)

- Rendered the actual `SecurityPanel` consumer for every assertion above — no test asserts on
  `scopeMatches`/`loadSecurityFindings`/`windowEndInRange`/`ruleShortTag` in isolation as a stand-
  in for "it works."
- `scope.level === 'all'`/`'state'` behavior confirmed unchanged: 58 pre-existing tests pass with
  zero edits to their assertions.
- 21 new tests (pure: `windowEndInRange`, `ruleShortTag`, 3 new `scopeMatches` org assertions;
  render-based: Org/Store pills against real `INV_ORG_COORDS`, date-range against a wall-clock-
  anchored fixture pair, rule-pill descriptors for both domains).

`npm test`: **2279/2279** (217 files). `npm run build`: clean. `security-panel.js` chunk (lazy,
not in the entry budget): 34.37 KB / gzip 11.62 KB (was 33.18 KB / gzip 11.25 KB). Entry chunk
unaffected: gzip 519.63 KB (was 519.62 KB); eager total 521.49 KB of the 850 KB budget, headroom
328.51 KB. `node scripts/gen-changelog-latest.mjs --write` run for `v5.140`. `npx eslint` clean on
all changed files.
