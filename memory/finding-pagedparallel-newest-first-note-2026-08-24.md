---
name: finding-pagedparallel-newest-first-note-2026-08-24
description: _pagedParallel's partial-failure banner hardcodes "newest-first keeps the recent days". True for all ten original callers, which pass ascending:false. loadDtHistory (#633) is the first ascending:true caller, so on a page failure the OLDEST pages survive and the banner tells the user the opposite. Raised on PR #633; not yet fixed.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# `_pagedParallel`'s partial-failure note is backwards for the first ascending caller

**Status: open.** Raised as a comment on PR #633 before it merged; **not fixed there**, and a PR
comment is not a durable record — hence this file.

## The defect

`src/lib/supabase.js`, in `_pagedParallel`'s partial-failure branch:

```js
if (failed) _recordDataError(label || table, failed, pages,
  'egress throttle or server error — newest-first keeps the recent days');
```

That note is **hardcoded**, and it was true for every caller until #633: **all ten pre-existing
callers pass `ascending: false`** (`labor_rows`, `peaks_rows`, `audit_rows`, `qsr_fob`, `ops_rows`,
`ctrl_rows`, `daily_glimpse_daily`, `cash_sheet_daily`, `sales_ledger_daily`, `qsr_product_mix`).

`loadDtHistory` is the **first and only `ascending: true` caller.** So when a page fails on DT
History, the surviving pages are the **oldest**, and the `DATA INCOMPLETE` banner tells the reader
that recent days were preserved — exactly backwards.

## Why it matters more than a wording nit

Speed of Service's DT History is a **history** panel. Losing the newest days is the worst possible
truncation for it, and it is precisely the case the banner exists to warn about. A person
diagnosing a gap would be pointed at the wrong end of the range by the tool meant to help them.

It is also the class of defect this repo spent 2026-08-23/24 on: a claim that was accurate when
written, describing behaviour a later change moved, with nothing tying the two together.

## The fix

Make the note conditional on `ascending`, or let the caller supply it, so the banner names which
end actually survived. Small.

⚠️ Worth doing *because* of the effort already spent: #633 added a test specifically confirming
`_recordDataError` still fires for this caller (the dispatch's explicit partial-failure ask). It
fires — and then says something false. Having gone to the trouble of proving it fires, it should
say something true when it does.

## Not a blocker on #633

The `fetchAll` → `_pagedParallel` conversion itself is correct, and #633's honesty caveat about
mock-vs-production milliseconds was the right call. This is a follow-up, not a regression the
conversion introduced — the note was already hardcoded; #633 is simply the first caller for which
it is wrong.
