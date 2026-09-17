---
name: notes-peak-oversized-seed-2026-09-17
description: "Open item: PEAK visit-detail bulk-capture produced a 159.3MB seed file on 2026-09-17, too large to hand off for import -- needs investigation before the next weekly refresh"
metadata:
  node_type: memory
  type: notes
---

## What happened (2026-09-17)

Owner ran the weekly PEAK + Propel data-refresh manual procedure
(`memory/standard-deploy-budget.md`-style checklist, see the "Weekly PEAK + Propel Complaints data
refresh reminder" Routine set up this same day). The Propel side worked cleanly: uploaded
`graded-visits-bulk-seed.json` (4.7MB, 229 CFV + 116 RGR + 246 EcoSure) directly to this session
and `node scripts/import-graded-visits-bulk.mjs` (run in-session, credentials already present)
upserted 590 rows (6 new, 585 refreshed) with zero errors.

**The PEAK side did not go the same way.** The owner's own terminal attempt at
`node scripts/import-peak-visit-detail.mjs` "didn't import right" (exact error not captured this
round -- ask for it next time rather than re-diagnosing blind), and the `peak-visit-detail-seed.json`
downloaded from the browser-console capture (`scripts/browser-peak-visit-detail-bulk-capture.js`)
was **159.3 MB** -- far too large to hand off as a chat upload, so it was never actually imported
this session.

## Why this is worth a second look, not just a retry

159.3 MB for a PEAK detail capture is a genuinely open question, not yet diagnosed:
- The earlier successful PEAK import this same session (captured 2026-09-16/17, imported via the
  owner's own terminal) covered **317 raw RoipSurvey responses** and imported without incident --
  no file-size complaint was made about that run. If this new capture covers a similar visit count
  but is dramatically larger, something about the capture itself may have changed (e.g. the
  console script re-run in a tab that still held a prior run's accumulated `visitsOut` array,
  rather than a fresh page load) rather than the underlying data genuinely growing 100x.
- Alternatively, this could be legitimately large: `finding-peak-visit-detail-api-2026-09-05.md`
  documents RGR visits alone at 193 questions each (vs CFV's 26), each question carrying a full
  `AllowableValues` array -- a wider capture window (more stores, more history, or CFV+RGR both at
  volume) could plausibly produce a multi-hundred-MB file from real data, no bug required.
- **Not yet measured either way.** Don't assume a bug; don't assume it's fine. Ask the owner (a)
  how many total visits the capture's console log reported, and (b) whether they re-pasted the
  script into an already-loaded tab or a fresh page load, before proposing a fix.

## Suggested next step, when revisited

1. Get the real number: ask for the browser console's own summary line (`[peak-detail-capture]
   done: N/M CFV/RGR visit detail(s) captured across 27 store(s)`) -- that pins down whether 159MB
   maps to a plausible visit count or is inflated.
2. If it's inflated (bug, not real data), the likely fix is idempotent accumulation in the capture
   script (reset `visitsOut` on each run, or dedupe by `visit.Id` before building the seed) --
   don't assume this without confirming step 1 first.
3. If it's genuinely that large, the import script itself may need a size-aware path -- either
   accept the file via a mechanism that isn't a chat upload (the owner running it locally, as
   originally designed, once whatever blocked their terminal attempt is fixed), or split the seed
   client-side into per-store chunks.
4. Get the owner's terminal error text for the original `import-peak-visit-detail.mjs` failure --
   that may be the more tractable problem and could make the file-size question moot if the
   underlying capture/import pairing has a simpler bug.

Not committed to a fix yet -- this file exists so the thread isn't lost if the session ends before
it's revisited, per this repo's own "commit every memory file in the same commit as the work that
cites it" rule (there is no code work this round, so this is a standalone docs commit).
