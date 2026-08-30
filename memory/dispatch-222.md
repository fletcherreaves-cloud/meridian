# Dispatch #222 — Fix GitHub issue #299: FOB Root-Cause Matrix claims to exclude Base Food, doesn't

## Context — owner-filed, fully diagnosed, root cause already verified in the issue

GitHub issue #299 (open, filed by the owner 2026-08-15, `closed_by_pull_requests.total_count: 0`
— confirmed still unfixed today, 2026-08-30). FOB Analysis → Root-Cause Priority Matrix's own
subtitle promises *"Excludes Base Food (largely outside store control). Fix these first to close
FOB fastest."* Live example from the issue: 3 of the top 5 ranked coaching items, including the
**#1 slot**, were Base Food — the exact component the panel says it excludes. This isn't cosmetic:
the panel is literally titled "Top Coaching Opportunities" and tells a GM to act on the ranked
list; a non-actionable item occupying the #1 slot pushes a real, coachable item off the bottom of
a 5-item list.

**Root cause, re-verified live today against current code** (line numbers below are this session's
own fresh read, not the issue's — they've already drifted once, per CLAUDE.md's own "cite anchors
not line numbers" rule, so re-check them yourself before editing rather than trusting either set):
`src/views/analytics.js:2840`'s filter — `FOB_COMP.filter(c=>c.lower&&c.actionable!==false&&
!c.sep&&!c.isTotal&&metrics[c.key])` — is meant to drop non-actionable components from the ranking,
but `FOB_COMP` (`analytics.js:219-230`, confirmed today) has **no entry that sets `actionable` at
all**, so `c.actionable!==false` is always `undefined!==false` → `true`. The guard is a permanent
no-op. The same dead property gates a "— Reference" badge at `analytics.js:2873`
(`if(c.actionable===false) return {label:'— Reference',...}`), which has therefore never rendered
either.

## Task — the fix is exactly what the issue already specifies, apply it as given

In `FOB_COMP` (`analytics.js`, currently line 227), add `actionable:false` to the `baseFoodPct`
entry:
```js
{key:'baseFoodPct',tgt:'tFOBBase',label:'Base Food',icon:'🥗',threshold:0.005,lower:true,
 actionable:false, qsrPage:'fob',qsrField:'Base Food %'},
```
That's the whole fix — it activates both the existing filter (line 2840) and the existing
"— Reference" badge (line 2873) in one line, no other code changes needed.

**Before applying, do the "worth a moment's thought" check the issue itself raises**: verify
whether `discCoupon` (currently `lower:false`) needs the same treatment. Read the filter again —
`c.lower&&c.actionable!==false&&...` — confirm `discCoupon`'s `lower:false` already excludes it
from this specific ranking regardless of `actionable`, so it does NOT need `actionable:false` for
THIS bug. State that check explicitly in your summary rather than silently assuming the issue's
own aside settled it. Do not add `actionable:false` to any other `FOB_COMP` entry unless you find
a live, verified reason to (the issue names Base Food as the only real candidate) — this dispatch
fixes issue #299 as filed, it is not a general audit of which components should be "reference
only."

## Guard test (the issue's own suggestion, implement it)

A one-line-shaped regression test asserting the actual contract, not just re-deriving intent:
`FOB_COMP.find(c => c.key === 'baseFoodPct').actionable === false` (or equivalent). Per this
repo's "would this verification still pass if the change were reverted" rule, also assert the two
real consumers actually honor it, not just the flag's presence in isolation:
- The Root-Cause Priority Matrix's ranked output does NOT include a Base Food entry, for a
  synthetic `metrics` fixture where Base Food's dollar-impact would otherwise rank #1 (i.e. prove
  the filter at line ~2840 actually excludes it now, not just that the data property is set).
- The status badge for the Base Food row renders the "— Reference" label (line ~2873's branch),
  not the normal Over/Watch/OK verdict — render or call the real `statusInfo`/badge function
  (check its exact name/export shape at the current line first, this dispatch doc may have drifted
  from it already), not a hand-rolled reimplementation of the branching logic.

## Verification

- The new guard test(s) above, passing.
- Confirm no existing test currently asserts the OLD (buggy) behavior — i.e. that nothing relies
  on Base Food appearing in the ranked matrix or on the "— Reference" badge never rendering. Check
  `src/__tests__/dispatch-129-fob-print.test.js` (the one existing test file touching this badge
  logic per today's search) specifically, since it reuses `statusInfo`'s Over/Watch/OK branching
  for the print report — confirm it still passes and doesn't quietly encode "Base Food ranks
  normally" as an expectation.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing — do not trust v5.262 as current by the time you commit,
  re-derive it).
- Once merged, this PR should close GitHub issue #299 — reference it in the commit/PR body
  (`Fixes #299` or equivalent) so GitHub closes it automatically on merge; don't close it manually
  as a side action.

## Out of scope

- `discCoupon` or any other `FOB_COMP` entry — covered by the "worth a moment's thought" check
  above, which this dispatch expects to conclude "no change needed," not license to add more
  `actionable:false` flags speculatively.
- Any redesign of the Root-Cause Priority Matrix's ranking/scoring beyond restoring the documented
  exclusion — this is a one-property bug fix, not a matrix redesign.
- The unrelated third `actionable` string match in the SAGE prompt text (`analytics.js`, cited by
  the issue as an unrelated string) — leave untouched, it's not the same property.
