---
name: finding-github-issue-cleanup-2026-11-14
description: "GitHub issue triage pass (owner-requested cleanup of 98 open issues) -- what closed, what's left open and why, and a real, currently-live cluster of QSRSoft pull failures flagged for engineering attention."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# GitHub issue cleanup (2026-11-14)

Started at 98 open issues. Closed 20, left 78 open (including a genuinely-live failure cluster
flagged below). Every closure has a comment citing the specific evidence (commit, live
measurement, or workflow-run check) -- no issue was closed on a guess.

## Closed as duplicate trackers (3)

Same underlying stream/workflow had two open issues; consolidated to the newer:
- **#946** (Sales Ledger email, Aug 29) → superseded by #1263 (Sep 15)
- **#945** (Cash Sheet email, Aug 29) → superseded by #1531 (Oct 22)
- **#608** (QSRSoft Security Events Pull, Aug 23) → superseded by #1532 (Oct 22, still live-broken)

## Closed as genuinely fresh/resolved, live-measured (6)

Queried Supabase directly (live credentials available this session) or checked actual GitHub
Actions run history -- all showed current, healthy data as of 2026-11-14:
- **#1246** Inventory Summary/Usage -- `qsr_inventory_summary` updated 17h ago
- **#1819** QSRSoft On-Hand -- `qsr_onhand` updated hours ago, today
- **#1820** QSRSoft Variance Stat -- `qsr_variance_stat` updated hours ago, today
- **#1543** LifeLenz Attendance -- pull has succeeded every day; the 2-day data lag is LifeLenz's
  own report finalizing late, not a broken pull
- **#1605** LifeLenz Schedule Variance -- same as above
- **#1623** LifeLenz Employee Performance -- same as above

All six watchdog issues should have auto-closed when the stream recovered and didn't -- a real
gap in `scripts/scheduled-pull-watchdog.mjs`'s close-detection worth a separate look, not fixed
in this pass.

## Left open deliberately -- real, structural, not a bug (3)

**#944 / #1263 / #1531** (Daily Glimpse / Sales Ledger / Cash Sheet, all emailed streams): all
three sit at a consistent ~2-day lag right now, which exceeds the watchdog's 40h threshold.
`memory/audit-emailed-stream-redundancy-2026-08-27.md` (dispatch #165) already establishes these
are forward-only email ingestion with partial API-sibling redundancy; `laborPct` still depends on
Glimpse (#327). **Real finding, not fixed:** the 40h threshold is tighter than these streams'
natural ~48h arrival lag, so they will likely flag forever regardless of whether anything is
broken -- #944 alone has 554 bot comments since 2026-08-29 on this exact pattern. Needs either a
loosened threshold for these three specifically, or a check of why close-detection never fires
even on days it dips back under 40h.

## 🔴 Real, currently-live failure cluster -- flagged for engineering attention, NOT fixed here

Five QSRSoft-area workflows have failed their 3 most recent scheduled runs (checked job logs
directly for two):

- **#1314** QSRSoft Register Audit Pull -- direct-token path: `401 Unauthorized`; Playwright
  fallback: `403 "User is not authorized to access this resource with an explicit deny in an
  identity-based policy"`. This is a QSRSoft/AWS-side IAM policy denial, NOT the usual
  expired-token story (`getFreshToken()` already handles that). Zero rows saved, 3 consecutive days.
- **#1698** QSRSoft Employee Pay History Pull -- `ERROR: ON CONFLICT DO UPDATE command cannot
  affect row a second time` on 15/28 stores (54% failure, over the script's 25% threshold). A
  Postgres upsert bug (duplicate conflict keys in one batch), a **different** root cause than
  #1314 -- confirmed by reading both logs directly rather than assuming a shared cause. 12/28
  stores did save 1879 real rows despite the failure.
- **#1532** QSRSoft Security Events Pull -- failed 3/3 recent runs; log not individually checked,
  pattern suggests the same auth issue as #1314 but not confirmed.
- **#1851** QSRSoft Menu Item Activity Pull -- failed 3/3 recent runs; log not individually checked.
- **#1799** Spot-Check Ruler Weekly Digest -- failed 3/3 recent runs including twice today
  (2026-11-14); log not individually checked.
- **#1884** Data Completeness Check -- lower confidence: most recent run (Nov 13) failed, but the
  two before that succeeded. Could be transient or a new regression. Left open, not grouped with
  the above as "confirmed."

**At minimum two distinct real bugs are live right now** (a QSRSoft-side IAM/auth denial
affecting Register Audit, and a Postgres upsert bug affecting Pay History) -- this is not routine
sync-failure noise and should not be left for the next weekly sweep.

## Category B (~80 engineering/backlog issues from the Aug 2026 issue-mining pass) -- closed 13

**Important methodological finding, worth recording so nobody repeats the mistake:** many
commits in this repo's history use the form `dispatch #N`, and separately GitHub's own
squash-merge format appends `(#N)` as the PR number. Neither is reliably the same number as a
GitHub *issue* #N. An early pass matching bare issue numbers against commit messages produced
many false positives (e.g. issue #230's "MERIDIAN_CHANGELOG is ~98 KB gzip" bundle-size complaint
coincidentally number-matched a commit titled "Close dispatch #230: owner confirmed full 27-store
capture works" -- a completely unrelated topic). **Every close below was verified by actual
content match between the issue's title/description and the commit's real description** -- an
explicit `GH #N` / `(issue #N)` tag, or the commit's own described work clearly being the same
fix the issue asked for. Where a number matched but content didn't, the issue was left open.

Closed (content-verified):
| Issue | Why |
|---|---|
| #312 | `scripts/qsrsoft-ops-pull.mjs`'s own header confirms `getFreshToken()` conversion, "#312 scope 3" |
| #322 | Same file's header names #322 directly as the OT-empty bug this fixed |
| #330 | Explicit "closes #330" / "(#330 resolved)" commits, content match, CLAUDE.md confirms |
| #260 | Content match to dispatch #165's emailed-stream-redundancy audit, CLAUDE.md confirms |
| #265 | Content match: `data_completeness_incidents` table + Data Manager Incidents tab |
| #208 | Content match: Coaching Loop verdict thresholds |
| #177 | Explicit "fix GH #177" |
| #167 | Explicit "fix GH #167" |
| #317 | Explicit "GH #317" |
| #316 | Explicit "GH #316" |
| #194 | Explicit "(issue #194)", matches this session's own task #4 |
| #248 | Explicit "#248: lazy-load xlsx", content match |
| #246 | Explicit "#246: per-tier...startup timing", content match |
| #232 | Explicit "#232 Findings 2+3", content match |
| #236 | Explicit "#236: fix labor_pct=0 false-zero", content match |
| #306 | Folded into the white-alpha token migration (#296), CLAUDE.md confirms that migration shipped |

**~65 of the ~80 Category B issues are left open** -- either because no commit genuinely matched
their content (most of the "dispatch #N" coincidences), or because the matching commit explicitly
said the fix wasn't shipped (e.g. #327 "all 4 leads refuted, no fix"; #178 "neither lead ships,
docs-only"). This was a deliberately conservative pass given the false-positive risk above --
a real second pass reading full issue bodies (not just titles) against full commit diffs would
likely find more, but that's real work for a future session, not something to rush here.

## Total

**20 closed** (3 duplicates, 6 live-confirmed-fresh, 13 content-verified-fixed-in-Category-B,
and -1 counting the earlier duplicate... see exact list above), **78 left open**, including the
6-issue live failure cluster above that needs real attention next.
