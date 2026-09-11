# 2026_Restaurant_Targets__Updated__OK__FL.xlsx

Committed 2026-09-11 for the same reason `data/org-structure/`'s file was: it existed only as a
chat upload (owner, 2026-09-11: *"it has before"* — uploaded to a previous session — *"let's save
it to the repo this time"*). A session's uploads do not survive the session; a file everyone
believes is safe and which is in no repository is the exact failure mode the commit-your-
artifacts rule exists to prevent.

## What it is

The owner's per-store yearly targets workbook for **all 27 stores** (7 Emerald Arches/FL + 20
MCDOK/OK) — `Table 1` sheet, one row per store. Parsed by
`src/parsers/index.js`'s `parseYearlyTargets()` (the same parser the in-app yearly-workbook
upload flow uses), which reads ~30 named columns: OEPE/Park/KVS/R2P/TPPH/Labor/FOB targets,
Voice OSAT/OSAT B2B/EAD, Digital App/McDelivery GC-R-D/wait/stars, staffing/headcount/turnover
targets, and 1-800 Contacts.

## Why it was committed now specifically

**Backlog #289** — three target blocks (Customer Satisfaction, Digital Execution, People) were
missing from `DEFAULT_TARGETS` (`src/constants.js`), the static per-store fallback every review
score, VOICE-grading check, and `missingReviewTargets()` banner falls back to when no live
`ds.targets`/`ds.monthlyTargets` entry exists. The real blocker was never code — it was that this
workbook had never landed in the repo, so building the values would have meant fabricating
numbers.

**This file is now the source of truth for that merge.** Parsed with the real production parser
(`ensureParsersXLSXReady()` + `parseYearlyTargets(wb)`, not a reimplementation) and merged into
`DEFAULT_TARGETS` — 16 new fields added to every one of the 27 existing store entries, purely
additive:

| Block | Fields added |
|---|---|
| Customer Satisfaction | `tOsat`, `tOsatB2B`, `tVoiceEAD` |
| Digital Execution | `t1800Contacts`, `tDigAppPct`, `tDigAppGCRD`, `tMcdGCRD`, `tMcdWait`, `tMcdStars` |
| People | `tCrewStaffing`, `tShiftLeaders`, `tManagers`, `tHeadcount`, `tToShiftLeader`, `tToCrew090`, `tToCrewYTD` |

**Nothing pre-existing in `DEFAULT_TARGETS` was touched or overwritten** — the merge only added
keys the store entries didn't already have (verified: zero pre-existing field collisions across
all 27 stores). `REVIEW_METRIC_TARGET_FIELD` (`review-engine.js`) already had the mapping for all
16 fields waiting (dispatch #109/#142/#145) — they had simply never had real data to resolve
against.

**Compared against the same-named file uploaded 2026-08-24** (`41cb6a61-...xlsx`, before this one)
byte-diff on the parsed values: **zero field differences** — same data, just re-uploaded because
the original upload was never committed. No version-reconciliation concern here.

## Store coverage

All 27 locs match `DEFAULT_TARGETS`'s existing key set exactly:
`3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213, 20475, 24471,
29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242, 37566, 38609, 43380, 43701`.

## Re-parsing this file

```js
import { ensureParsersXLSXReady, parseYearlyTargets } from '../src/parsers/index.js';
import * as XLSX from 'xlsx';
await ensureParsersXLSXReady();
const wb = XLSX.read(fs.readFileSync('data/restaurant-targets/2026_Restaurant_Targets__Updated__OK__FL.xlsx'), { type: 'buffer' });
const targets = parseYearlyTargets(wb); // { [loc]: { tOepe, tOsat, ... } }
```

## When this needs updating

Next year's workbook (or a mid-year correction) should be dropped in the app's own yearly-
targets upload flow first (persists to Supabase `yearly_targets`, wins over `DEFAULT_TARGETS` in
the merge chain automatically — no code change needed for that alone). Only re-commit this file
and re-run the `DEFAULT_TARGETS` merge if the owner wants the new numbers to also become the
**static fallback** for a device/user that has never seen the live workbook.
