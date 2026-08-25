# Dispatch #135 — Targets Editor v2: add missing metric fields, move into Performance Review
# → Customize, re-verify Total Profit/Complaints workbook-source claim

**Owner's ask (2026-08-25), screenshot of the Targets Editor attached, verbatim:** *"several
things here > Please re-read these next lines carefully > The targets you added to the editor
are all found in Monthly and Yearly Targets > I need unlisted ones to be here (EPB2B, FS Audits
Completed, Food Safety EcoSure, FS Completion % T-60, Shift Verifications by GM, Execution of
Retention Prg.) > Also, this does not need it's own panel, should be inside Customize on Perf
Review dashboard."* (Followed by the owner re-pasting the full original dispatch #132 ask list —
Delivery Wait/Complaints/Digital+Delivery GC-R-D/FOB/Total Profit/Shift Cert+Leader/Headcount —
treat that as confirming context, not new asks; #132 already resolved each of those.)

## Item 1 — add the 6 missing metric fields to the Targets Editor

`src/engine/review-engine.js`'s `DEFAULT_REVIEW_CONFIG.metrics` has SIX `src:'manual'` metrics
that dispatch #132 did not add to `target-overrides.js`'s `TARGET_OVERRIDE_FIELDS` (that dispatch
was scoped to the 8 the owner had explicitly named at the time — these 6 are the REST of the
`src:'manual'` list, now explicitly requested):
- `epb2b` — "EPB2B (Pace Portal, %)"
- `fsAudits` — "FS Audits Completed"
- `fsEcoSure` — "Food Safety EcoSure (%)"
- `fsTablet` — "FS Completion T-60 (%)"
- `shiftVerif` — "# Shift Verifications by GM"
- `retention` — "Execution of Retention Prg."

Add each to `TARGET_OVERRIDE_FIELDS` (new `field:` keys, e.g. `tEPB2BTarget`/`tFSAuditsTarget`/
etc. — follow the exact naming convention the existing 8 entries already use) and wire
`review-engine.js`'s matching metric configs (`REVIEW_METRIC_TARGET_FIELD`) the same way #132
wired `totalProfit`/`complaints`. Investigate each one's actual source first, same as #132 did —
some of these MAY already have a real workbook column your predecessor didn't check for these
specific 6 (the yearly-targets parser has broad "Full column capture" coverage per its own
2026-07-30 owner-directed sweep — re-read `src/parsers/index.js`'s yearly/monthly parsers in full
for anything matching EPB2B/FS Audits/EcoSure/FS Tablet/Shift Verifications/Retention before
assuming override-only). State what you found for each of the 6, don't assume all 6 are
override-only just because #132's original 2 were.

## Item 2 — re-verify the Total Profit / Complaints "no workbook source" finding

**The owner is pushing back directly on dispatch #132's finding**, stating all 8 currently-listed
fields (including Total Profit and Complaints) are "found in Monthly and Yearly Targets." Dispatch
#132's engineer investigated `src/parsers/index.js` and found no column matching either concept —
independently re-confirmed by the PM (grepped the current parser: zero hits for "profit"/"Profit"
anywhere in the file; "Complaints" maps only to `t1800Contacts`, a raw count, not a "/100K" rate).
**This is a real, unresolved disagreement between what the code does and what the owner believes
is true — resolve it, don't just re-assert the code's side.** Two real possibilities:
1. The owner's actual, currently-used yearly/monthly targets workbook has a column for one or
   both of these under header text the parser's `fc(h, 'Header A', 'Header B', ...)` matching list
   doesn't recognize (a naming mismatch, not a missing concept) — this is the most likely
   explanation given the owner's confidence. If you have access to a real, current copy of that
   workbook (check whether one is already stored/referenced anywhere accessible, or ask the owner
   directly via the dispatch's own PR if you cannot resolve this from the repo alone), find the
   actual header text and add it to `fc()`'s matching list for `fobT`/whatever field is closest,
   or a new field if genuinely distinct.
2. The owner is thinking of a different, related field (e.g. `tFOBTarget` for profit-adjacent
   FOB%, or `t1800Contacts` for complaints) that isn't literally what `review-engine.js`'s
   `totalProfit`/`complaints` metrics need, and the mismatch is conceptual, not a missing column.

State plainly in the PR which of these it turned out to be, with the evidence (real header text
found, or a clear explanation of why no column exists) — do not silently keep #132's "no source"
conclusion without re-checking it given the owner's explicit correction.

## Item 3 — move the Targets Editor into Performance Review → Customize, not its own panel

*"this does not need it's own panel, should be inside Customize on Perf Review dashboard."*
`src/views/performance-reviews.js` already has a "Customize" panel/tab (referenced in
`review-engine.js`'s own comments — *"Behavioral competency items per role per category (editable
in Customize panel)"*) for editing `DEFAULT_REVIEW_CONFIG`. Move `src/views/targets-editor.js`'s
UI to live as a new section/tab inside that existing Customize surface instead of its own
`route:true` nav entry. Remove the standalone `panel-registry.js` entry
(`kind:'nav'`) dispatch #132 added; the targets-editing UI itself (component logic) can stay in
its own file and just be imported/rendered from within the Customize view, or move entirely —
your call on file organization, state your reasoning.

## Scope

`src/engine/review-engine.js`, `src/engine/target-overrides.js`, `src/views/targets-editor.js`,
`src/views/performance-reviews.js` (Customize integration), `src/parsers/index.js` (only if a
real, confirmed-missing header needs adding). Do not touch scoring math beyond what wiring these
fields requires.

## Verification bar

- Confirm all 6 newly-added fields appear as selectable chips in the Targets Editor, each with an
  accurate note about its actual source (workbook column found, or override-only, stated plainly
  either way, not assumed).
- State clearly what was found for the Total Profit / Complaints re-investigation, with evidence.
- Confirm the Targets Editor renders inside Performance Review → Customize and is no longer a
  separate top-level nav entry; confirm the old standalone route still doesn't 404 unexpectedly if
  anything else could have linked to it (a redirect or simple removal, your call).
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build`
  clean; report before/after entry-chunk size (removing a standalone route + folding into an
  already-lazy panel should be neutral-to-positive).

## Do NOT

- Do not assume all 6 new fields are override-only without checking the parser first.
- Do not silently keep #132's Total Profit/Complaints conclusion unchanged — the owner explicitly
  disputed it; resolve the disagreement with evidence, one way or the other.
