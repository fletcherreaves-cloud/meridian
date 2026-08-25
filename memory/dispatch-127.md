# Dispatch #127 — At A Glance "Projections & Forecasting" tile: chart/badges collide on mobile

**Owner's ask (2026-08-25, mobile screenshot attached):** *"this tile > need to fix chart all
stacked on top of each other."* Screenshot shows the At A Glance "📈 Projections & Forecasting"
card. Two things in that screenshot look wrong and are both real candidates for what "stacked on
top of each other" means — investigate both, reproduce on a real mobile viewport (per CLAUDE.md's
"measure it, don't reason about it" rule — do not guess which one it is from the screenshot alone,
render it), and fix whichever is actually broken (likely both):

1. **The confidence-interval + drift-badges row** (`src/views/at-a-glance.js` ~line 2132-2153,
   the `ciAndDrift` block). `$1694K – $2106K` (the CI text, in a `flex:1` div) sits in the same
   `display:flex, flexWrap:'wrap'` row as up to 4 `driftStores` badges. Each badge's label is
   `sNameC(s.loc).split(' ').pop()+' ⚠'` — i.e. only the LAST WORD of the store name. In the
   screenshot these render as a run of disconnected fragments — "Ardmore-Broadway ⚠", "70/22 ⚠",
   "77 ⚠", "Springs ⚠" — with no visual separation making clear they're 4 distinct store badges,
   not one broken label. On a narrow viewport this row likely wraps in a way that reads as
   "stacked"/jumbled. Check whether `.pop()` is even the right truncation (a store like
   "Chipley-St.Rd.77" or "OKC-I-240/Sooner" may have no space to split on, so `.pop()` returns the
   whole name or a confusing fragment — verify against the real `STORE_NAMES` entries, not an
   assumption) and whether the badges need real wrapping/spacing/line-break behavior on mobile
   instead of running together.
2. **The 6-week sales trend bar chart** (~line 2154-2181). An inline `<svg>` with a fixed
   `viewBox` (`0 0 ${svgW+4} ${svgH}`, `svgW`/`svgH` computed from a **fixed** `bw=34,gap=6` bar
   width/gap regardless of container width) but `style:{width:'100%',height:76,overflow:'visible'}`
   — width is responsive, height and the viewBox aspect ratio are not. No `preserveAspectRatio` is
   set explicitly (defaults to `xMidYMid meet`). Text labels (`$XXXK` above each bar, the date
   below, the vs-LY% below that) are all positioned in SVG user-space coordinates tied to the
   fixed `bw`/`gap`/`svgH` — if the actual rendered box the browser scales this into doesn't match
   assumptions (e.g. a narrow mobile card width forcing extra vertical scale-up under `meet`, or a
   card too short for the *computed* 76px height on some layouts), text baselines can overlap the
   bars or each other. Render this component at real phone widths (375px and narrower — check
   whatever this repo's existing mobile-testing recipe is, `memory/feedback-verification-in-
   sandbox.md` has the Playwright/Chromium approach used elsewhere this session) and see exactly
   what collides, rather than reasoning about the SVG math from reading the code.

## Scope

`src/views/at-a-glance.js`'s "Projections & Forecasting" section only (the `projSec`/`ciAndDrift`/
`weeklyTrend` block, ~lines 2098-2183). Do not touch other AAG sections/tiles.

## Do NOT

- Do not guess a fix from reading the code alone — reproduce the actual overlap on a real mobile
  viewport first, per the standing "measure it, don't reason about it" rule.
- Do not touch other AAG tiles (Sales & Guest Counts, Labor, etc.) even if you notice a similar
  SVG/flex pattern there — flag it in the PR as a possible follow-up, don't fix it here.

## Verification bar

- A screenshot (or Playwright-rendered DOM check) at a real mobile width (375px or narrower)
  showing the CI/drift-badges row and the 6-week bar chart both rendering without any text/badge
  overlap, compared against a "before" repro at the same width showing the actual reported problem.
- Full `npx vitest run` suite passing at the same or higher count as `main`; `npm run build` clean.

## Verification note for the PM

Confirm the "before" repro actually reproduces something visibly broken before trusting the PR's
fix — this dispatch is explicitly uncertain about which of the two candidates (or both) is the
real cause, so the independent review pass should re-render the fixed component at mobile width
and eyeball it directly, not just read the diff.
