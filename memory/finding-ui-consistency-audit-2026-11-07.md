---
name: finding-ui-consistency-audit-2026-11-07
description: "UI/UX consistency audit (Notes 73 #2, task #109) — the hand-rolled native <select> sprawl outside the three already-shared controls, with a concrete standardization plan"
metadata:
  node_type: memory
  type: finding
---

# UI/UX consistency audit — Notes 73 #2 (2026-11-07)

**Owner's own framing (verbatim):** *"You to take a session and act as the final quality control
engineer for searching and finding any and all inconsistencies or issues with UI/UX. Report it
and make a concise plan on how to standardize everything throughout. Consistency is key. All
menu and drop down and selectors driven items should be modeled as close as possible to the same
throughout with the only exceptions of when they have to be different. No differing styles or
ways to accomplish the same tasks."*

Report-only pass, per the request. No code changed in this session.

## What's already standardized — don't re-litigate this

Three control families already have a shared component in `src/components/PanelControls.js`,
with real, documented adoption histories in `memory/panel-contract.md` and
`memory/feedback-selector-ui-standard.md`:

1. **`LocationSelector`** — location/org scope picker. Pills or `variant:'dropdown'`, single or
   `multi:true`. Rollout is essentially complete: every panel with a genuine location/store scope
   filter uses it, with exactly 2 documented, deliberate exceptions (`scheduling.js`'s
   Operator/Patch dual-taxonomy — a real missing 5th tier, not a style gap; `analytics.js`'s Food
   Cost market-shortcut select — a translation-layer conversion flagged out of scope) plus
   `mode:'progressive'` call sites, which keep pill rendering by design.
2. **`DateRangeControl`** — preset/custom date-range picker. `variant:'pills'` or `'dropdown'`.
3. **`ActionMenu`/`ActionMenus`** — grouped action buttons. Low adoption (1/56 panels,
   `eom-dashboard.js`) but explicitly opportunistic by design, not a gap.

**One real inconsistency found in this already-"solved" territory, worth flagging but likely
justified:** `src/app/shell.js`'s top-bar `DatePicker` (the global date-range control in
`AppTopbar`) is a SEPARATE, older implementation from `DateRangeControl` — CSS classes
(`drp-btn`/`drp-popup`/`drp-presets`) instead of inline styles, and a visually different popup
shape (button that expands a dropdown panel with presets + custom date inputs + a mode badge,
vs. `DateRangeControl`'s flat pill row). These likely have a real reason to differ — one is a
**single, global, app-chrome instance** (the whole app's current view window), the other is a
**reusable per-panel component** (dozens of independent instances, one per analysis panel) — so
unifying them may not be worth the risk of breaking the one thing every view depends on. Flagged
for owner awareness, not recommended as an immediate fix.

## The real, uncovered gap: hand-rolled native `<select>` sprawl

No shared component exists for an ordinary "pick one from a short list" dropdown that *isn't*
location or date — a status filter, a type filter, a metric picker, a weeks-back/months-back
picker, an equipment field. **113 `h('select', ...)` call sites across 37 files** in
`src/views/`+`src/features/`, every one hand-rolling its own inline `style` object. This is the
literal shape of the owner's complaint: the same task ("pick one item from a short list") solved
with visibly different styling in different panels, with no stated reason for the difference.

### The inconsistency, with real examples

Three near-identical-but-not-quite style clusters exist, plus outliers. Same visual *intent*
(a bordered, rounded, app-themed select) but different literal values:

| File : line | background | border | borderRadius | fontSize | padding |
|---|---|---|---|---|---|
| `customer-complaints.js:104` | `var(--surf)` | `.5px solid var(--bdr)` | `var(--r)` | `10` | `3px 7px` |
| `graded-visits.js:659` | `var(--surf)` | `.5px solid var(--bdr)` | `var(--r)` | `10` | `3px 7px` |
| `count-timing-report.js:247` | `var(--surf2)` | `.5px solid var(--bdr)` | `6` (literal) | `11` | `4px 8px` |
| `fob-reference-table.js:88` | `var(--surf)` | `.5px solid var(--bdr)` | `6` (literal) | `11px` | `4px 8px` |
| `event-impact.js:96` | `var(--surf3)` | `1px solid var(--bdr2)` | `5` (literal) | `11px` | `4px 7px` |
| `event-impact.js:125` (same file, 29 lines later) | `var(--surf3)` | `1px solid var(--bdr2)` | `4` (literal) | `10px` | `2px 4px` |

`event-impact.js` disagrees with **itself** between two selects 29 lines apart. The two pairs
that DO agree (`customer-complaints.js`/`graded-visits.js`, and loosely `count-timing-report.js`/
`fob-reference-table.js`) read as copy-paste between files rather than a shared source — change
one and the other three silently drift further.

For comparison, `PanelControls.js`'s own internal `_selectStyle` (used by `DateRangeControl`'s
`variant:'dropdown'` and by `LocationSelector`'s dropdown variant) is: `background: var(--surf)`,
`border: .5px solid var(--bdr)`, `borderRadius: var(--r)`, `fontSize: 11px`, `padding: 4px 8px` —
closest to the `count-timing-report.js`/`fob-reference-table.js` cluster, but not exported for
reuse, and not what either of the two file-pairs above actually uses.

### What's NOT a gap (checked, not assumed)

- **Custom absolutely-positioned dropdown menus** (open/close state + floating list, as opposed
  to a native `<select>`) are rare outside the three shared components — only ~6 matches for
  `position:'absolute'...zIndex` outside `LocationSelector`/`ModalShell`/`PanelControls.js`
  itself. Not a second widespread pattern needing its own fix.
- **The *content* of most of these selects necessarily differs** — a weeks-back picker's options
  are not a status filter's options. The fix below standardizes the WRAPPER style, never the
  option list; this is squarely inside the owner's own "exceptions of when they have to be
  different" carve-out for content, while still closing the gap for style.

### A fourth, larger, un-audited category (flagged, not sized)

**Tab/pill-row switchers** (e.g. a panel's own internal "Table / Cards" or multi-tab view
toggle) have **no shared component at all** — every panel with internal tabs hand-rolls its own
pill row, the same way selects do. This is a real second instance of the same complaint, but
tab bars are both more numerous and more visually varied (some are plain text pills, some carry
icons, some carry counts/badges) than the select case, so sizing this accurately needs its own
dedicated grep-and-categorize pass — **not done in this report**, flagged here so it isn't lost.
Recommend a follow-up audit scoped exactly like this one, same owner framing, once the select
fix below is underway.

## Standardization plan

1. **Add one exported style (or tiny wrapper component) to `PanelControls.js`**, e.g. `export
   const simpleSelectStyle = {...}` (or a `SimpleSelect({value, onChange, options, style})`
   component if a consistent `<option>`-mapping helper is also worth sharing) — literally
   promoting the existing, already-closest-to-canonical `_selectStyle` from a private constant to
   a shared export. Zero new design decisions; this is extraction, not invention.
2. **Convert the 113 call sites incrementally, opportunistically** — same standing rule
   `panel-contract.md` already established for close-button/date-picker/`LocationSelector`/
   mobile-scroll: fix a file's selects to the shared style next time that file is touched for
   something else, rather than one mechanical sweep across 37 files in a single pass (the
   dropdown-variant `LocationSelector` rollout already found real test breakage doing a 13-file
   mechanical batch — a 37-file one carries proportionally more risk for a purely cosmetic
   change). A dedicated sweep is reasonable if the owner wants it done sooner, but opportunistic
   is the lower-risk default.
3. **Do not touch option content, value shape, or behavior** — this is a style-only
   standardization. No panel's filtering logic should change.
4. **Leave the global `shell.js` `DatePicker` alone** unless the owner explicitly wants the
   app-chrome control unified with the per-panel one too — flagged above as likely-justified, not
   queued as a to-do.
5. **Scope a dedicated tab/pill-row audit as its own follow-up**, same format as this one, before
   trying to standardize that family — it hasn't been sized yet and may be large enough to need
   its own phased plan.

## Rough sequencing estimate

- Step 1 (shared style export): under an hour, one file, no risk — the cheapest win here.
- Step 2 (113 call sites, opportunistic): spread across many future dispatches, each touching
  1-5 selects while already in that file for its own reason — not a standalone project.
- Step 5 (tab-bar audit): a full session on its own, same shape as this one.
