---
name: review-537-forms-slices-1-2
description: PM review of PR #537 (forms dashboard Slices 1+2). Two reproduced defects with verified fixes - "noLocation" normalizes to the garbage loc "0000NaN", and a hardcoded UTC-5 offset misbuckets late-evening completions by a day for the whole CST half of the year. Both latent today, both cheap. Records what passed review too.
metadata:
  node_type: memory
  type: review
---

# PR #537 review — forms dashboard Slices 1 & 2

Reviewed against the diff, not the summary. Two defects, both **reproduced by execution**, both with
fixes verified to pass. Neither is architectural.

## 🔴 Defect 1 — `"noLocation"` becomes the garbage loc `"0000NaN"`

`src/engine/forms-completion.js`, `normalizeFormsCompletionRow`:

```js
loc: String(parseInt(raw.location, 10)).padStart(7, '0'),
```

`"noLocation"` is a **genuine member of the request's `locations` array** — 28 entries for 27 stores
(`finding-qsrsoft-forms-completion-endpoint-2026-08-21.md`). `parseInt('noLocation')` is `NaN`, and
`isUsableRow` only checks `location != null`, so it passes the guard.

```
location:'noLocation'  ->  loc "0000NaN"
location:'3708'        ->  loc "0003708"
```

Latent — it returned 0 rows in the 3-day capture — but it is in **every** request, so the first
unattached submission creates a phantom store in the panel.

**Do not fix by dropping the row.** Those are real completions with no store attached; the finding
says explicitly they are worth surfacing rather than vanishing. Map to an explicit sentinel:

```js
const normalizeLoc = v => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? String(n).padStart(7, '0') : 'NOLOC';
};
```

Verified: `'3708'→'0003708'` · `'noLocation'→'NOLOC'` · `''→'NOLOC'` · `null→'NOLOC'` ·
`'0003708'→'0003708'`.

## 🔴 Defect 2 — hardcoded UTC-5 misbuckets a day, all winter

```js
const LOCAL_MIDNIGHT_OFFSET_MS = 5 * 60 * 60 * 1000;
```

Correct for CDT, wrong for **CST (early Nov → mid Mar)**. Any completion between 23:00 and midnight
local lands on the following day — so a store shows a **miss on day N and a phantom completion on
N+1**. Silent, and roughly ten weeks out at time of review.

| case | instant | bucketed | expected |
|---|---|---|---|
| CDT 23:30 on Aug 20 | `2026-08-21T04:30:00Z` | `2026-08-20` | ✅ |
| **CST 23:30 on Dec 20** | `2026-12-21T05:30:00Z` | **`2026-12-21`** | ❌ `2026-12-20` |

The comment above the constant is right that this boundary is local midnight and deliberately *not*
the 4am business day. The error is only in expressing it as a fixed offset.

**Fix — a real timezone, no offset arithmetic:**

```js
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
});
const localDayKey = iso => DAY_FMT.format(new Date(iso));   // 'YYYY-MM-DD'
```

`en-CA` yields `YYYY-MM-DD` directly. Verified against six cases including both DST transition days:
CDT 23:30 ✅ · CDT 00:30 ✅ · CST 23:30 ✅ · CST 00:30 ✅ · spring-forward ✅ · fall-back ✅.

**`America/Chicago` is right for the whole estate** — all 27 stores are Central, including the seven
Florida ones, which sit in the Panhandle west of the Apalachicola. Worth a comment saying so, since
"Florida" reads as Eastern to anyone who has not checked.

**Regression tests to add:** the CST 23:30 case is the one that matters; it fails on today's code and
passes on the fix.

## ✅ What passed review

- `open` (`"--"`) excluded from **both** numerator and denominator — correct, and the reason the
  current day does not read red everywhere.
- Rollup accumulates `resolvedCount`/`completedCount` and divides once at the end — Σ/Σ, never
  mean-of-rates, per the standing rule.
- `completedBy` never read and never in the output; `userId` is the sole person key.
- `timeToCompleteMs` taken as-is with an explicit comment against deriving it from
  `completedOn − startedAt` — matches the measured 28.97-day/109-second case.
- Polymorphic `status` handled by branching on `missed`/`hasResponse` first and only then reading
  the number — the order the finding requires.
- The panel test that caught the double-normalize bug is the right kind: an always-empty panel is
  exactly the #366 failure mode that engine-only tests cannot see.
