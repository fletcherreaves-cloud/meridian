# Scoping: generalize SAGE's McNuggets cross-store finding?

**Owner ask (2026-08-31):** apply whatever Meridian should learn from SAGE's July
`query_eom_recount_impact` response — which surfaced a McNuggets pattern across stores — to other
data analysis. Deferred from earlier in this session pending scope; owner confirmed "yes, let's
scope the SAGE learning."

**Status: scoping + a direct measurement, UPDATED after the redeploy (below). No code changed by
this document (the underlying bug it measures was already fixed and merged in PR #987 / v5.282,
separately from this doc).**

---

## ⚠️ UPDATE 2026-08-31, post-redeploy — the pattern is REAL, not bug noise. Recommendation reversed.

`sage-chat` was redeployed (confirmed live: `supabase functions list` showed v26, updated
2026-08-31 14:36:09 UTC, after the fix merged). The owner re-ran the July recount-impact query
against the fixed engine. **Independently cross-checked its numbers against this doc's own
pre-computed "NEW" (post-fix) column, without re-querying Supabase — they match exactly:**

| Store | SAGE's report | This doc's NEW column | Match |
|---|---|---|---|
| Defuniak (6838) | −$15 → −$792, damage −$777 | −$15.18 → −$791.81, damage $776.63 | ✅ |
| Bonifay (10034) | +$109 → −$664, damage −$556 | $108.78 → −$664.48, damage $555.70 | ✅ |
| Tecumseh (33704) | +$13 → −$271, damage −$258 | $13.10 → −$271.42, damage $258.32 | ✅ |
| Atoka (10422) | −$370 → +$428, damage −$58 | −$369.83 → $427.74, damage $57.91 (unchanged old vs new) | ✅ |
| **Total** | **$1,649** | **$1,648.56** | ✅ |

This is two independent confirmations the redeploy is live and correct (the deployment timestamp,
and now SAGE's own arithmetic matching a number computed here before SAGE ever ran).

**The headline finding above — "the pattern was substantially the bug" — was WRONG, or at least
incomplete, and this correction supersedes it.** The original section below measured that the raw
July numbers were badly distorted by the netting bug (true, and the fix was still correct and
necessary). But it did NOT follow that the *pattern itself* was fake. With the corrected numbers,
SAGE still finds a real, smaller, more precise version of the same shape: **the same WRIN
(McNuggets, 00407-958), a sign-flip-plus-magnitude-explosion recount, at four specific stores
(Defuniak, Bonifay, Tecumseh, Atoka) — while two other stores (Ardmore-Broadway, Ardmore-Cooper)
recounted the identical item correctly and helped.** That contrast — same item, same period, some
stores clean, some stores broken — is exactly the shape of a real crew-technique/UOM gap, not
noise. It just needed the bug out of the way to see clearly (the bug's distortion was large enough
to swamp the real signal underneath it — Duncan/#29760's raw entry alone swung $3,228, an order of
magnitude past the real story).

**Revised recommendation: this now IS worth generalizing.** See "design sketch" below — a
cross-store diagnosis finding (same WRIN, inconsistent recount direction across stores in one
period) is the natural next step, not a maybe. Scoped further, not built, pending the owner's call
on priority — the original section's design sketch stands as the starting point.

---

## The headline finding: the pattern was substantially the bug, not a real signal

SAGE's `query_eom_recount_impact` tool is a thin passthrough over `ledgerScopeDiff()` /
`ledgerBaselineDiff()` in `eom-ledger-baseline.js` — **the exact engine PR #987 fixed** for the
same-session netting bug (multiple area-by-area count entries on one day were read as the RAW
final entry's own $ value instead of the NET of all entries that day). SAGE's July answer about
McNuggets was generated against the **pre-fix** version of this engine.

To check whether the "cross-store McNuggets" pattern SAGE reported was real or an artifact, I
pulled the live July raw count ledger (`qsr_raw_item_detail`, WRIN `00407-958`, period `2026-07`)
for every store that carries the item, and ran the OLD (pre-fix, raw-last-entry) logic side by
side with the NEW (fixed, netted) logic through the real close-window date range
(`closeWindowStartFor('2026-07', 3)` = 2026-07-29).

**11 of 23 stores (48%) show a material difference (>$25) between old and new baseVar/curVar** —
several of them large:

| loc | OLD base → cur | NEW base → cur | Δ (bug's distortion) |
|---|---:|---:|---:|
| 0029760 | -$3,426.37 → -$3,426.37 | -$197.73 → -$197.73 | **$3,228.64** |
| 0033704 | $13.10 → -$1,920.79 | $13.10 → -$271.42 | **$1,649.37** |
| 0003708 | -$2,151.44 → $18.72 | $57.92 → $18.72 | **$2,209.36** (base only) |
| 0010034 | $108.78 → -$451.23 | $108.78 → -$664.48 | $213.25 |
| 0006838 | -$15.18 → -$892.72 | -$15.18 → -$791.81 | $100.91 |
| 0018213 | -$66.96 → -$66.96 | $77.75 → $77.75 | $144.70 |
| 0031357 | -$123.95 → -$123.95 | $77.84 → $77.84 | $201.79 |
| 0010915 | -$168.40 → -$168.40 | $0.55 → $0.55 | $168.96 |
| 0013113 | -$135.02 → -$135.02 | $100.34 → $100.34 | $235.36 |
| 0005985 (Durant) | -$109.01 → -$109.01 | -$80.61 → -$80.61 | $28.41 |
| 0033222 | -$72.86 → -$72.86 | -$39.84 → -$39.84 | $33.02 |

Store 0029760 alone moved by **$3,228** on this single item from the fix — more than an order of
magnitude larger than the "materiality floor" ($25) the whole grading system uses to decide
helped/hurt/flat. Several rows flip from a large apparent loss (old) to a small, unremarkable
number (new) once netted correctly.

**Read:** the "same WRIN recounted at multiple stores with inconsistent outcomes" pattern SAGE
described in July was, for roughly half the stores carrying this item, a direct readout of the
netting bug — not evidence of a genuine cross-store UOM or count-instruction ambiguity. Once
corrected, McNuggets doesn't show an alarming or obviously-systemic cross-store pattern in the
close window; the post-fix numbers look like ordinary per-store variance, no outlier pattern
jumping out.

## What this means for "generalize the learning"

**Recommendation: don't design a new cross-store-inconsistency signal from the July McNuggets
data as-is** — the data it would be built on was measurably wrong for nearly half the sample.
Building a generalized check on top of a result that turns out to be mostly a data bug would
repeat the exact mistake CLAUDE.md's own standing rule warns about ("measure it, don't reason
about it" / never build on an unverified live-data claim).

**Two concrete next steps, in order:**

1. **Redeploy `sage-chat`** (already a known pending step from PR #987 — `supabase functions
   deploy sage-chat --no-verify-jwt`) so SAGE's *live* answers reflect the fix going forward. Not
   done yet as of this doc.
2. **After redeploy, re-ask SAGE the same July question** (or any other period/item it flagged a
   similar pattern for) and compare against this doc's numbers. If SAGE's new answer roughly
   matches the "NEW" column above, that confirms the fix is live and this specific pattern is
   closed — no further action needed on McNuggets specifically.

**If the owner still has a specific memory of something in SAGE's original response that looks
like a real signal even after seeing these corrected numbers** — a detail this document can't
reconstruct on its own, since the original SAGE response text is no longer in this session's
context after a compaction — that's worth pointing me back to directly; I'd rather build the right
check from the actual original text than guess at what "the McNuggets learning" meant.

## If a real pattern DOES survive the fix (design sketch, not built)

For completeness, in case a genuine cross-store WRIN-level pattern turns up on a *different* item
once the corrected data is examined: two natural homes for a systematic version of this, both
existing infrastructure rather than a new subsystem —

- **A new `eom-diagnosis.js` finding**, parallel to the existing `count-accumulation` /
  `recount-swing` checks, but cross-store: same WRIN, same period, recounted at N≥2 stores with
  inconsistent helped/hurt direction net of noise — flagged as "worth checking the count
  instructions for this item," non-accusatory, matching this file's existing tone.
- **The Signals panel's Scanner / Signal Lab** (`src/engine/signal-registry.js`) — if the pattern
  is really about correlation/consistency across stores rather than a single-store diagnosis, this
  is the framework already built for "does X move together with Y across the district," and would
  fit its existing metric-pair + FDR-guardrail machinery better than a bespoke check.

Which of these (if either) is right is a product-shape call for the owner, not something to guess
at without a confirmed real pattern to design against first.

## Effort

- Steps above (redeploy + re-ask): near-zero — administrative, already-scoped.
- A new generalized check, if warranted: small-to-medium, depending on which home (diagnosis
  finding vs. Signal Lab) — not scoped further here since it depends on confirming a real pattern
  exists first.
