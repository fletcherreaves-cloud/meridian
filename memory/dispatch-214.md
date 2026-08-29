# Dispatch #214 — FOB investigation tool links (Variance/Transfers/Waste/Purchases/Raw Items/Inventory Analysis)

## Context — the last 5 of 7 direct QSRSoft links, deferred twice already

Owner sent 7 real, direct (non-KB-article) QSRSoft tool links in one message (2026-08-29). #213
built the per-store deep-link pattern (`location=<nsn>` param) and used it for **Physical
Inventory**; a same-day amendment added **On-Hand Inventory** (per-store/date/class) the same way.
Both #213 and #215's docs explicitly deferred the other 5 to "dispatch #214" — this is that
dispatch. The owner's own framing for why these matter at all: *"we can use text and context for
QSRSoft kb to include and supplement so that managers get valued feedback where needed... Feel
free to include our own feedback as well."* These 5 are the "where needed" set — variance/waste/
transfer investigation tools, not routine counting how-to.

Verbatim URLs (owner-supplied, `3708`/dates are that example's own store/period — every one
substitutes per notification):
- Variance Stat/Yields: `https://v3.myqsrsoft.com/cimt/inventory/stat-variance?location=3708&tab=varianceStat&start=2026-08-01&period=M&class=F`
- Transfers: `https://v3.myqsrsoft.com/cimt/inventory/transfers?location=3708&tab=transfers&start=2026-08-01&end=2026-08-29`
- Waste: `https://v3.myqsrsoft.com/cimt/inventory/waste?location=3708`
- Purchases: `https://v3.myqsrsoft.com/cimt/inventory/purchases?location=3708&tab=approvePending`
- Raw Items: `https://v3.myqsrsoft.com/cimt/inventory/raw-item-information?location=3708&start=2026-08-01&end=2026-08-29`
- Inventory Analysis: `https://v3.myqsrsoft.com/cimt/inventory/inventory-analysis?location=3708&class=F&start=2026-08-01&end=2026-08-29`

## Design decision — a SEPARATE "Investigate FOB" links block, not more entries in kb_links

**Do not fold these into `kb_links`/`kbLinksForClasses()`.** That list already renders under
"Helpful links" on every fired notification, unconditionally — Best Counting Practices + Physical
Inventory + On-Hand today, up to 3 after dedup. These 6 are diagnostically tied to a FOB number,
not to "how do I count" — cramming them in would turn every routine completion email (including
Paper/Non-Product triggers, where FOB is irrelevant) into a wall of links. Instead:

- Add a new `fob_tool_links` array to the notification row (`eom_count_notifications`, new jsonb
  column — same migration pattern as `fob_snapshot`/`fob_target` before it), built and populated
  **only alongside the FOB section** — i.e. gated by the exact same condition #213/#215 already
  use for `fob_snapshot`/`fob_target` (trigger touches food/condiment AND a fresh FOB snapshot
  resolved this run). A Paper-only or Non-Product-only trigger gets none of these 6 — consistent
  with "only show what's relevant."
- `resend-notify.mjs`'s `fobSectionHtml()` renders them as a short link list directly under the
  FOB components (its own sub-section, e.g. "Investigate further"), not mixed into the existing
  "Helpful links" block at the bottom.

## Per-link scope (class param, date params) — build each with `unpadLoc(loc)` and this run's
`period`/`dateStr` (both already threaded through `buildNotificationRow` since #213's Physical
Inventory / On-Hand work)

Period start = `${period}-01` (period is already `YYYY-MM` everywhere in this file). `dateStr` is
the run's own `businessDate()`, already passed into `kbLinksForClasses`/`buildNotificationRow`.

- **Variance Stat/Yields** — one link PER TRIGGERED CLASS that has a class letter (F/C, same
  `CLASS_LETTER` map #213 built for On-Hand — reuse it, don't redefine it), each:
  `.../stat-variance?location=<nsn>&tab=varianceStat&start=<period>-01&period=M&class=<letter>`.
  Directly investigates `statv`, the component most FOB over-target stories trace back to
  (`fob-report.js`'s own `topDriver` logic already flags `statv` as the most common driver) — the
  single most valuable of the 6.
- **Waste** — one link, no class/date params in the owner's own example, don't invent ones it
  doesn't have: `.../waste?location=<nsn>`. Investigates `comp`/`raw` (Completed/Raw Waste).
- **Transfers** — one link, no class param:
  `.../transfers?location=<nsn>&tab=transfers&start=<period>-01&end=<dateStr>`. Transfers between
  stores are a real, common source of unexplained variance.
- **Raw Items** — one link, no class param:
  `.../raw-item-information?location=<nsn>&start=<period>-01&end=<dateStr>`. Recipe/BOM-level
  drill-down for "why is this item's cost/variance off."
- **Purchases** — one link, no class/date params in the owner's example:
  `.../purchases?location=<nsn>&tab=approvePending`.
- **Inventory Analysis** — one link PER TRIGGERED CLASS with a letter (same as Variance Stat):
  `.../inventory-analysis?location=<nsn>&class=<letter>&start=<period>-01&end=<dateStr>`. The
  broad rollup view — put it last (least specific of the 6).

A `food_condiment` trigger therefore gets: 2 Variance Stat links (F+C) + Waste + Transfers + Raw
Items + Purchases + 2 Inventory Analysis links (F+C) = 8 total under "Investigate further". That's
a lot for one email — consider (your call, state it either way in the PR body) capping to the
single most relevant class per link type (e.g. whichever of food/condiment is the worse offender
this run, via `fobTargetReport.topDriver`/per-class gap, if that's cheaply available) rather than
always both, OR keep both and trust the owner to skim — he asked for these specifically, don't
under-deliver on his own explicit request out of a tidiness guess. **Raise this as an explicit
question in the PR body rather than silently picking one** — this is a real UX call, not a
mechanical one.

## Task — implement in `scripts/qsrsoft-onhand-pull.mjs` + `scripts/lib/resend-notify.mjs`

1. New `fobToolLinks(nsn, triggerClasses, period, dateStr)` function (`qsrsoft-onhand-pull.mjs`,
   alongside `kbLinksForClasses`/`physicalInventoryLink`/`onHandLink` — same file, same
   conventions, reuse `CLASS_LETTER`). Returns the array described above.
2. Wire it into `buildNotificationRow()`: build `fobToolLinks(...)` only when `fobSnapshot` is
   non-null (the same freshness-gate condition already computed for the FOB section — don't
   re-derive it, thread the boolean/result through), attach as `fob_tool_links`.
3. New migration `supabase/schema-eom-fob-tool-links.sql` — `alter table eom_count_notifications
   add column if not exists fob_tool_links jsonb`, same idempotent/handoff-comment pattern as
   `schema-eom-fob-snapshot.sql`.
4. `resend-notify.mjs`'s `fobSectionHtml()`: render `row.fob_tool_links` (if non-empty) as a small
   "Investigate further" list right after the FOB components, styled consistently with the
   existing "Helpful links" block. Nothing renders when the array is empty/absent — same
   no-caveat-no-placeholder discipline as the rest of this feature.

## Verification

- Unit tests: `fobToolLinks()` for a food-only trigger, a food_condiment trigger (assert BOTH
  class-letter variants for Variance Stat and Inventory Analysis, however Task's open question
  above is resolved), a paper-only trigger (assert empty array — these tools are FOB-irrelevant).
  Assert every URL is built from the given `nsn`/`period`/`dateStr`, not hardcoded (same
  two-different-NSNs-produce-two-different-URLs pattern #213's own tests already established —
  follow it here too).
- Unit test: `buildNotificationRow()` only populates `fob_tool_links` when `fobSnapshot` is
  non-null (mirroring the existing `fob_snapshot`/`fob_target` null-when-stale tests).
- `resend-notify.mjs` test: the "Investigate further" block renders when `fob_tool_links` is
  present, renders NOTHING when absent/empty.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing — v5.256 as of this doc, but re-verify).

## Out of scope

- Any change to `KB_BEST_COUNTING`/`KB_PHYSICAL_INVENTORY`/`onHandLink`/`KB_ON_HAND` — untouched,
  already correct.
- Surfacing these 6 links anywhere outside the per-store notification email (e.g. the #215 roll-up
  digest, or an in-app panel) — a future dispatch if wanted, not required here.
- Any change to which classes are FOB-relevant (`FOB_CLASSES`) — reuse as-is.
