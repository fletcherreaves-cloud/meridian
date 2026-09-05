# Dispatch #230 — PEAK per-visit detail: bulk backfill across all stores/visits, not just the two manually captured

**Origin:** live-caught, same day as the fix. PR #1133 fixed `loadGradedVisits()` silently dropping
`peak_detail` (`memory/finding-peak-visit-detail-api-2026-09-05.md`), and the owner confirmed live
in the app that the 🔎 PEAK Visit Detail section "did show up on a few" rows. "A few" is correct
and expected, not a residual bug: `peak_detail` is currently populated on exactly the **two** rows
manually enriched this session (one CFV, one RGR — see that finding file's resolved item #5), via
`scripts/import-peak-visit-detail.mjs` reading a hand-captured local seed file. Every other CFV/RGR
row across all ~27 stores and however many years of history PEAK holds has no `peak_detail` at all.
This dispatch is the backfill that gets it onto every row PEAK can supply, matching the
**"data depth is never the limiter — backfill it"** standing rule in `CLAUDE.md`'s Dev Rules.

## What already exists (measured, not assumed)

- **The import script is already bulk-ready.** `scripts/import-peak-visit-detail.mjs` reads
  `seed.visits` — an **array** of raw `RoipSurvey` response envelopes — and loops over every entry,
  matching each to an existing `graded_visits` row by `(loc, visit_date, report_type)` and applying
  a targeted `UPDATE ... peak_detail` only (never an upsert, never an insert). It already handles
  N visits in one run; nothing about it is scoped to "one visit at a time." **The only missing
  piece is the CAPTURE step** — producing a seed file with more than 2 entries in it.
- **`parsePeakRoipVisit()` (`src/parsers/graded-visits.js`) needs no store-ID cross-reference at
  parse time.** Unlike Propel/EcoSure, PEAK's own `RoipSurvey` response carries
  `RestaurantInfo.LocalCode` — the plain NSN — directly in the envelope. So a bulk capture script
  doesn't need the hierarchy-node → NSN map at all for this step; it only needs `visitId`s to feed
  into `RoipSurvey/<visitId>`.
- **The enumeration chain to find every visitId is already fully documented and confirmed working**
  (`memory/finding-peak-visit-detail-api-2026-09-05.md`):
  `GetEntities` → `Stores/Paged` (all stores, paginated) → `GetStoreDetails/<storeId>?isChecked=true`
  (that store's full visit history, every visit type, years back) → filter for
  `VisitTypeId 3801` (CFV) / `3781` (RGR) → `RoipSurvey/<visitId>` per matching visit. One real
  store's `GetStoreDetails` call returned **83 historical visits back to 2012** in the one capture
  measured — the per-store history is not shallow.
- **This repo already has the exact right pattern for this situation**, used twice for Propel/
  EcoSure (`scripts/browser-graded-visits-bulk-capture.js`, superseding
  `browser-ecosure-bulk-capture.js`): a **browser-console capture script**, not a server-side pull.
  PEAK is corporate SSO-gated the same way Propel is (`finding-peak-visit-detail-api-2026-09-05.md`
  item #3 — `__RequestVerificationToken` header pattern, no visible cookie in HAR captures, MFA
  almost certainly in front of it) — there is no unattended-token path, so this can never become a
  GitHub Actions pull. The console script automates the *capture* for a human who is already signed
  in, using `fetch(..., {credentials:'include'})` so the browser tab's own session auth attaches
  automatically. **Do not attempt a Playwright/Node auth path for PEAK** — same reasoning that
  already ruled it out for Propel/EcoSure applies unchanged.

## What's missing

1. **No browser-console capture script for PEAK.** `import-peak-visit-detail.mjs`'s seed file was
   built from two individually-captured HARs, by hand — there is no script that walks all stores ×
   all CFV/RGR visits and produces a `{visits:[...]}` seed automatically.
2. **No estimate of real scale.** One store showed 83 total visits (all types) back to 2012; how
   many of those are CFV/RGR specifically, and across ~27 stores, is unmeasured. This affects
   pacing (politeness delay × request count) and whether `RoipSurvey` calls should be batched/
   throttled more conservatively than the existing Propel scripts' `250ms` delay.

## Task 1 — build the browser-console capture script

New file, e.g. `scripts/browser-peak-visit-detail-bulk-capture.js`, modeled directly on
`browser-graded-visits-bulk-capture.js`'s structure and header conventions (NOT a Node script;
paste-into-DevTools-Console on a signed-in `peak.mcd.com` tab; downloads a seed file; extensive
header comment on why a console script and not a pull, matching that file's own security framing
verbatim where it still applies).

Chain to implement, in order, with a polite delay between calls (start at the same `250ms` the
Propel scripts use unless Task 2's scale measurement says otherwise):
1. `POST /API/Entity/GetEntities {"Pagedata":0}` → the org entity ID.
2. `POST /API/Stores/Paged/ {"page":N}` → paginate until all stores are collected.
3. Per store: `POST /API/Visit/GetStoreDetails/<storeId>?isChecked=true` → filter the returned
   visit list for `VisitTypeId` `3801` (CFV) and `3781` (RGR) only — do not pull every visit type,
   only the two this repo's `graded_visits` table tracks.
4. Per matching visit: `POST /API/Visit/RoipSurvey/<visitId>` → push the **raw, unmodified**
   response envelope into the output array.

Output shape must be exactly what `import-peak-visit-detail.mjs` already reads:
`{_source, _captured, visits: [<raw RoipSurvey response>, ...]}` — do not invent a different
wrapper; this is what makes Task 1 a pure capture-side addition with zero changes needed to the
existing, already-tested import script.

Same security posture as every other bulk-capture script in this repo, restated because it's
load-bearing: never log/record a cookie, token, or header value; never commit a seed file
populated with real captures (the committed `memory/data/peak-visit-detail-seed.json` stays the
empty shell); point `PEAK_VISIT_DETAIL_SEED_PATH` at a local, gitignored path for the real run.

## Task 2 — measure real scale before the first full run

Before asking the owner to run this across all ~27 stores, either reason from the one already-
captured `GetStoreDetails` response (83 visits, one store, all types — filter it locally for
3801/3781 to get a real per-store CFV+RGR count) or have the owner do one small real run (a handful
of stores) and report: total CFV/RGR visits found, total `RoipSurvey` calls that implies at full
scale, and total wall-clock time at the `250ms` pacing. This determines whether the full-estate
capture is a "run it once, done in a few minutes" task or something that needs chunking (e.g.
one region/state at a time) to stay comfortable for a live browser session to sit through.

## Task 3 — run it, import it, verify it

1. Owner runs the finished script in DevTools Console against a signed-in `peak.mcd.com` tab, gets
   a downloaded seed file.
2. Owner points `PEAK_VISIT_DETAIL_SEED_PATH` at wherever they saved it (never committed) and runs
   `scripts/import-peak-visit-detail.mjs` exactly as done for the first two visits.
3. Verify: row count enriched vs. total CFV/RGR rows in `graded_visits` (some rows will legitimately
   have no PEAK match — pre-PEAK-era visits, or visit types PEAK doesn't carry — the script's own
   `noMatch` reporting already surfaces these, don't treat every unmatched row as a bug).
4. Spot-check a few newly-enriched rows in the Graded Visits panel UI (the same
   `PeakDetailBlock`/🔎-badge path PR #1130/#1133 already shipped) to confirm rendering, not just
   the database write.

## Explicitly out of scope

- Any server-side/Playwright/GitHub-Actions automation for PEAK — ruled out, see above (SSO+MFA,
  same as Propel/EcoSure).
- EcoSure-in-PEAK investigation (`finding-peak-visit-detail-api-2026-09-05.md`'s open item #2) —
  unrelated question, separate dispatch if ever pursued.
- Any change to `import-peak-visit-detail.mjs` itself, unless Task 1's real capture output reveals
  a shape mismatch against what the parser expects — it is already bulk-capable and already tested;
  this dispatch is capture-side only.
- A recurring/scheduled re-capture — this is a backfill for existing history. Whether PEAK detail
  should be captured going forward for *new* visits (as they happen) is a separate, later question
  once the backfill proves the pipeline end-to-end at scale.

## Verification (required)

1. `scripts/browser-peak-visit-detail-bulk-capture.js` exists, follows the established
   browser-console-script header conventions, and produces output in the exact shape
   `import-peak-visit-detail.mjs` already consumes (no changes needed to that file).
2. Task 2's real scale numbers, stated plainly (visit count, call count, wall-clock estimate).
3. A real bulk import run's enriched/noMatch counts, reported honestly (not just "it worked").
4. Live UI spot-check on at least one newly-enriched row beyond the original two.
5. Full test suite + `npm run build` clean if any test coverage is added for the new script (a
   source-inspection test on its header/shape claims, matching this repo's established pattern for
   non-Node-testable scripts, is reasonable but not mandatory if the script is purely a capture
   tool with no logic worth unit-testing beyond what `import-peak-visit-detail.mjs` already covers).

## ✅ Task 1/3 substantially DONE (2026-09-05, same day) — real numbers, not "it worked"

The script needed two live-run fix-forward passes before it worked (both shipped same day, PRs
#1138/#1139), each caught by the owner's own console log, not guessed in advance:
- **First run:** 0 stores usable — `Stores/Paged` entries use `ID` (all-caps), not `Id`/`id`/
  `StoreId` as `pickId()` originally checked. Fixed (PR #1138).
- **Second run:** stores resolved but every one reported "0 total visit(s)" — `GetStoreDetails`'
  response carries its visit array under a key `firstArray()` didn't have in its candidate list.
  Fixed by broadening the candidates AND adding a fallback that accepts any array-valued property
  on the response object, so a future unguessed key doesn't need another round-trip (PR #1139).
- **Third run (real, full capture): 190 raw `RoipSurvey` responses captured, 189 enriched into
  `graded_visits`, 1 no-match** (`loc=33109 date=2026-09-04 type=CFV peakVisitId=8755946` — a visit
  too recent to have a row yet from the separate CFV bulk-import pipeline; expected, not a bug,
  matching this dispatch's own Task 3 note that some visits will legitimately have no match).
  This is far beyond the original 2 manually-captured visits — Task 1/3 are functionally done.

**Sharpened again same day, still OPEN — pagination itself is clean, but 17 is confirmed NOT the
real total.** A per-page-logged re-run measured `Stores/Paged` page-by-page — page 1 → 10 stores,
page 2 → 7 stores, **page 3 → 0 stores under the identical `{stores:[...]}` shape that worked on
pages 1-2** (genuinely empty, not an unrecognized shape the extractor missed). `10 + 7 + 0 = 17`,
pagination terminated cleanly with no dropped/misread page — so this specific failure mode (the
class PRs #1138/#1139 fixed) is ruled out. **But the owner directly checked the PEAK UI itself
under this same login and confirmed all 27 stores are visible there.** So `Stores/Paged` as this
script currently calls it (`{page:N}`, no entity scoping) is returning a real subset, not the full
org — most likely because it needs an entity/franchise id from `GetEntities` that the script
currently only logs and never uses (see the script header's own long-standing caveat on this).
`finding-peak-visit-detail-api-2026-09-05.md`'s old "27 stores / 3 pages" line has still been
corrected (it was never actually measured that way) — but the underlying open question it gestured
at (is `Stores/Paged` scoped correctly?) turns out to be real, just for a different reason than
originally guessed. **Next step:** inspect `GetEntities`'s full response for an entity/franchise id
and pass it into `Stores/Paged`; if fixed, expect 17 → 27. Task 1/3's real numbers stand regardless
(190 visits captured / 189 enriched across the 17 stores this scoping did reach) — Task 2's scale
estimate should be revisited once the entity-scoping fix is confirmed, since the real per-run call
count will be larger across the full 27.

**Fix attempted same day, NOT YET verified against a real run.** `GetEntities`' real shape is now
confirmed: `{EntityTypes:[{EntityList:[{Id,Name,Description1,...}],EntityCount}]}`. The one live
account measured has `EntityCount:1` — a single entity, `Id:"8685"`, `Description1:"1000890759"`.
That `Description1` value is not a coincidence: it is byte-identical to `ORG_ROOT_NODE` already
hardcoded in this repo's Propel scripts (`browser-ecosure-bulk-capture.js`) for the SAME
organization — strong cross-system corroboration that `1000890759` is a real, meaningful scope id,
not a random guess. The capture script now extracts this entity and sends its `Id`/`Description1`
into every `Stores/Paged` call under several plausible key-casings (`entityId`/`EntityId`/
`entityID`/`hierarchyNode`/`HierarchyNode`) alongside `page` — unrecognized extra JSON keys are
normally ignored server-side, so sending several costs nothing if all are wrong. **UNCONFIRMED
until the next live run shows the store count actually reach 27** (or doesn't, in which case the
per-page log will show what each key attempt's response looked like, same diagnostic discipline as
the last three rounds).
