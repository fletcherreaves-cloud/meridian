# Dispatch #142 — Performance Review: Sales/Labor bypass the official target cascade, Voice OSAT
# target never wired despite real data, yearly-target decimal display, re-confirm Complaints

**Owner's report (2026-08-25), screenshot of a Performance Review monthly grid attached:**
1. *"Sales not correct"* — screenshot shows actual monthly sales ($2.4M–$2.8M) scored "Exceeds"
   against a target of only $194K–$617K, a target roughly 4-14× too small to be a real monthly
   sales figure for this store.
2. *"Labor should reflect monthly target when present."*
3. *"Monthly targets supercede yearly targets when both have values"* — general restatement of
   the standing precedence rule.
4. *"For all the new yearly targets imported, please round them up or down based on decimal
   value. I did not realize they had decimals until i checked in workbook. If you'd rather i can
   reformat the cells in the workbook and re upload."*
5. *"Voice OSAT still no target > It is in yearly targets, same for customer contacts."*

## Item 1+2+3 — Sales and Labor targets bypass `officialTgts` entirely (real, confirmed bug)

**Root cause, confirmed by reading the code — `src/engine/review-engine.js` around line 927-928**,
inside the per-month loop that already computes `officialTgts = mergedTargetsForLocMonth(ds, loc,
_ry, m)` (the correct DEFAULT < yearly < monthly < override cascade, used correctly by every
other metric via the generic auto-fill loop a few dozen lines below):

```js
const st = sum(lr,'salesTgt')||sum(lr,'tSales');
const lt = avg(lr,'laborTgt')||avg(lr,'tLabor')||avg(lr,'tCombLabor');
if (st!=null) mo.salesVsTgtTgt = st;
if (lt!=null) mo.laborTgt = lt;
```

`lr` is `laborM[m]` — this MONTH's rows from `ds.laborRows` (the manual Excel upload), not
`officialTgts`. `sum(lr,'salesTgt')` sums whatever raw `salesTgt`/`tSales` field each manually-
uploaded daily labor row happens to carry (if any — this predates the yearly/monthly workbook
cascade entirely) across every day in the month; `avg(lr,'laborTgt')` similarly averages a
manual-upload field. **This completely bypasses `officialTgts`, which is computed on the line
directly above and correctly available (`officialTgts.tProdSales` for sales — see
`REVIEW_METRIC_TARGET_FIELD`'s `salesVsTgt: 'tProdSales'` entry, already correctly used by the
generic auto-fill loop below — and `officialTgts.tLabor`/`tCombLabor` for labor).** Two bugs from
one root cause:
- **Explains "Sales not correct"**: whatever `ds.laborRows` rows happen to carry in a `salesTgt`/
  `tSales` field (likely stale, differently-scoped, or simply not the real monthly sales target)
  is what's shown — not the actual monthly target from the yearly/monthly workbook.
- **Explains "Labor should reflect monthly target" and "monthly supersedes yearly"**: these two
  metrics never look at the yearly/monthly workbook cascade at all, so neither precedence rule
  can apply to them — they're stuck on a completely different, legacy source.

**Fix**: delete/stop using the `sum(lr,'salesTgt')`/`avg(lr,'laborTgt')` lines for `mo.
salesVsTgtTgt`/`mo.laborTgt`. Let these two metrics fall through to the SAME generic auto-fill
loop every other metric already uses correctly (`REVIEW_METRIC_TARGET_FIELD`'s `salesVsTgt:
'tProdSales'` and `labor: 'tLabor'` entries already exist — verify `tCombLabor` isn't ALSO needed
as a fallback in that mapping, or if `tLabor` alone is the correct/only field per the yearly
parser's actual column). **Investigate, don't assume, whether ANY legitimate case still needs the
manual-upload fallback** (e.g. a store with zero yearly/monthly workbook coverage but a real
manually-entered labor-row target) — if so, keep it as a fallback AFTER `officialTgts`, not
instead of it (`officialTgts.tProdSales ?? sum(lr,'salesTgt') ?? sum(lr,'tSales')`, same
precedence direction as everywhere else, never the reverse).

## Item 5 — Voice OSAT: real workbook data exists (`tOsat`), never wired into
## `REVIEW_METRIC_TARGET_FIELD` — a genuinely missing one-entry mapping, confirmed

`src/parsers/index.js`'s `parseYearlyTargets()` already correctly parses OSAT into `t.tOsat`
(`osat: fc(h,'VOICE OSAT PACE','Voice OSAT Pace','OSAT PACE','Voice OSAT')` → real column, real
data). But `review-engine.js`'s `osat` metric config (line 38, `field:'osat'`) has **no
`REVIEW_METRIC_TARGET_FIELD` entry at all** — confirmed by reading the full map (dispatch #135's
recent additions are all there; `osat` genuinely isn't). Since the generic auto-fill loop only
fills a metric's target slot when it has an entry in that map, `osatTgt` never gets set even
though `officialTgts.tOsat` is sitting there correctly populated. **Fix: add `osat: 'tOsat'` to
`REVIEW_METRIC_TARGET_FIELD`.** Verify the scale/format matches first (the metric config has
`pctInput:true`; `tOsat` is parsed via `parsePct()` — confirm both land on the same 0-1 or 0-100
convention before wiring, don't assume).

**Also found, not necessarily a bug — flag for the engineer to check**: the parser also captures
`osatB2B: fc(h,'Overall Satisfaction B2B',...)` → `t.tOsatB2B`, but **nothing in review-engine.js
references `tOsatB2B` anywhere** — no metric config, no target mapping. Investigate whether this
is a second, currently-unscored review metric that should exist (a B2B/1-star OSAT threshold,
distinct from the 5-star `osat` metric already scored), or genuinely out of scope for the review
config as it stands today. Do not silently wire it to something if you're not sure it's the same
concept as an existing metric — state what you found.

## Item 5 (continued) — "Customer Contacts" (complaints): already correctly investigated, not a
## new bug — communicate this back, do not re-open

Dispatch #135 already resolved this exact question with evidence: the yearly workbook's "1-800
Contacts" column (`t1800Contacts`) is real and does exist, but it's a raw per-store COUNT, not the
**/100K RATE** the review's `complaints` metric needs (and no guest-count-normalized actual exists
anywhere in the app to divide it by). `complaints` is deliberately override-only
(`tComplaintsTarget` in `target-overrides.js`) with this exact explanation already in its editor
note. **Not part of this dispatch's fix scope** — if the owner wants an interim numeric target
set now (matching Total Profit's own interim-rule precedent), that's a Targets Editor data-entry
action, not new code. State this plainly in the PR so the owner sees the distinction between "a
missing wire" (OSAT, items 1/2/3) and "a real unit mismatch already handled the right way"
(Complaints).

## Item 4 — yearly-target decimal values

`parseYearlyTargets()` uses `parseFloat()`/`parsePct()` uniformly — full decimal precision is
preserved at parse/storage time, nothing is truncated on import. The owner's concern is most
likely about DISPLAY: wherever a yearly-target-sourced number renders with visible decimal
noise (the Targets Editor's raw value display is the most likely spot — screenshot's own
currency cells already render as whole dollars via existing formatting, so the leak is probably
elsewhere). **Investigate where yearly-target values actually display with unwanted decimal
precision** (grep the Targets Editor and Performance Review target-display cells for a raw
`String(v)`/template-literal render with no formatter) and apply a sensible round/format there —
whole dollars for $ fields, 1-2 decimal places for % fields (matching the rest of the app's
existing formatters, e.g. `f$`/`pct` helpers already used elsewhere — reuse, don't invent a new
one). **This is a display fix, not a data fix** — do not round/truncate the stored parsed values
themselves; scoring math should keep full precision. State clearly in the PR which specific
cells you found leaking decimals and fixed, since this is more exploratory than the other items.

## Scope

`src/engine/review-engine.js` (sales/labor target sourcing, `osat` target mapping),
`src/views/targets-editor.js`/`src/views/performance-reviews.js` (decimal display fix, wherever
found). Do not touch `src/parsers/index.js`'s parsing logic (precision is already correct there).
Do not touch `target-overrides.js`'s `complaints`/`tComplaintsTarget` handling — already correct.

## Do NOT

- Do not round/truncate stored target VALUES — only fix visible display formatting.
- Do not silently re-litigate or change the Complaints/`t1800Contacts` unit-mismatch handling —
  it's correct as-is per dispatch #135; just communicate it back to the owner in the PR.
- Do not assume `tOsatB2B` should be wired to anything without confirming what review metric (if
  any) it actually belongs to.

## Verification bar

- Render a real store/month with both a yearly AND monthly sales target on file; confirm
  `salesVsTgt`'s displayed target is the workbook's real monthly (or yearly, if no monthly)
  figure, not a manual-upload leftover — the screenshot's $194K-style numbers should be gone,
  replaced by a plausible monthly sales target for a store doing $2.4-2.8M/month.
  Do the same check for the Labor metric.
- Confirm Voice OSAT now shows a real target sourced from `tOsat` for a store/month where the
  yearly workbook has one.
- Confirm no regression to any metric currently correctly wired (Complaints stays override-only
  with its existing note; Total Profit unchanged).
- Full `npx vitest run --exclude "**/.claude/**"` suite passing at the same or higher count as
  `main`; `npm run build` clean.
