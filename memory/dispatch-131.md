# Dispatch #131 — Performance Review monthly grid: stop truncating rating labels to 3 letters

**Owner's ask (2026-08-25), screenshot attached:** *"Performance Review > need better clarity on
'nee' and 'bel' and all the others > appear to be abbreviations, maybe just spell it out."*

## Root cause, confirmed by reading the exact line

This is not a data/labeling problem — the real words are already correct
(`RATING_LABELS` in `src/engine/review-engine.js`, imported into `src/views/performance-reviews.js`)
and were never actually abbreviated at the source. The monthly-metric-grid renderer
(`performance-reviews.js:1079-1080`) hard-truncates them for display:
```js
rating!=null&&span({style:{fontSize:9,color:ratingColor(rating),fontWeight:700}},
  RATING_LABELS[rating]?.slice(0,3)||rating)
```
`.slice(0,3)` on `'Needs Improvement'` → `'Nee'`, on `'Below'` → `'Bel'`, on `'Exceeds'` →
`'Exc'` — exactly what the owner's screenshot shows. This cell sits inside a narrow
`COL_W = 78`px month column (`performance-reviews.js:1016`) alongside two stacked number
inputs (Actual/Target), which is presumably why `.slice(0,3)` was used — but it makes the
label unreadable rather than compact.

## Scope — fix

Remove the `.slice(0,3)` truncation and make the full label actually legible in that 78px-wide
cell. This is a real layout constraint, not just "delete the slice call" — pick whichever of these
fits the existing grid with the least disruption, and state your reasoning:
- Allow the label to wrap onto 2 lines at a smaller font size (the cell already stacks
  Actual/Target inputs vertically with `gap:2`, so vertical room exists).
- Widen `COL_W` slightly if wrapping still clips on the longest label (`'Needs Improvement'`).
- Any other approach that results in the FULL word being readable on-screen without relying on
  a hover tooltip as the only way to see it (a tooltip-only fix doesn't satisfy "spell it out" —
  hover doesn't work on the mobile/touch use this app is built for).

Also check the two other rating-scale legend renders in the same file (lines ~1122 and ~2090,
`${r} = ${RATING_LABELS[r]}`, and line 170) — these already render the FULL label, not truncated,
so they're already correct; just confirm while you're in the file, don't change them.

## Scope limits

`src/views/performance-reviews.js`'s monthly-metric-grid renderer only (the function containing
line ~1030-1097). Do not touch `RATING_LABELS`'s actual text in `review-engine.js`, and do not
touch the scoring/rating math (`rateMetric`) — this is a display-only fix.

## Verification bar

- Render the monthly grid with a realistic dataset producing all 4 rating tiers across several
  months and confirm each cell shows the FULL word ("Needs Improvement"/"Below"/"On Target"/
  "Exceeds"), not a 3-letter fragment, at the actual column width used in production.
- Confirm the grid still fits without horizontal overflow/breaking other columns.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Do NOT

- Do not touch `RATING_LABELS`'s definitions or the 1-4 scoring math.
- Do not change the two already-correct full-label legend renders elsewhere in the file.
