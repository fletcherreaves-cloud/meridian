# Finding: deactivated-item on-hand staleness, confirmed-vs-weak signal split (2026-08-31)

## What prompted this
Owner reported (live screenshots, Ada-Country Club #6972): our Missing Items report showed **Wht
Pasteurized Process Cheese** (WRIN 19285-008) with **$29.23 on hand, last counted Jul 29/30** —
but QSRSoft's own Variance Stat/Yields drill-down for the same WRIN shows a
**SUBMITTED INVENTORY - MobileApp event on 08/06/2026 that zeroed it to 0.00 Each**. Our data
never picked that up.

## Measurement (service-role Supabase reads, this session)
- `qsr_onhand` for loc `0006972`/wrin `19285-008`: `active: null`, `last_counted: 2026-07-30`,
  `on_hand_amt: 29.234`, `updated_at: 2026-08-06T12:52:10Z` — **hasn't refreshed since Aug 6**,
  25 days behind today (Aug 31).
- The store's OWN freshest pull today (loc 6972, period 2026-08) is full of items with
  `updated_at: 2026-08-31T14:37:07Z` — so the store IS being pulled daily; this one WRIN's row
  specifically stopped updating.
- Same freshest-today batch has several `active:false` items (Halloween/BT21/holiday promo WRINs)
  still carrying **real nonzero balances that persist day over day** — one at $136.78, another at
  $126.59, refreshed as of TODAY. So `active:false` does **not** reliably mean `$0` in practice.

## QSRSoft KB (qsrsoft_kb table, public-read, confirmed queryable)
"On Hand Inventory" article (`support.qsrsoft.com/hc/en-us/articles/34843618887831`) documents the
intended workflow: *"Obsolete WRINs are past the quality date. Please submit a zero inventory for
the Obsolete WRINs... Enter the obsolete WRINs as 'Waste' and discard product. Deactivate the old
WRIN."* — **zero-then-deactivate is the documented best practice, not an enforced system rule.**
The live counter-evidence above (persisting nonzero balances on deactivated items) confirms stores
can and do skip the zero step.

## Fix shipped (same session, follow-up to v5.291)
`diagnoseIncompleteCount()` (`src/engine/eom-inventory.js`) now splits the deactivation signal into
two confidence tiers:
- **`confirmedDeactivated`** — QSRSoft told us directly (`active === false`, or descr text like
  "(Deactivated)"/"(Obsolete)"). A fact.
- **`deactivated`** — `confirmedDeactivated` OR `droppedFromCurrentPull()` (this row alone stopped
  refreshing while the rest of the store kept going) — an INFERENCE, admitted in that heuristic's
  own comment to be only ~85% accurate (6/7 in its original sample).

Caught a real bug while making this split: Ada's own **Fried Apple Pie** (WRIN 00076-126) has
`active: true` in our current data — QSRSoft has NOT deactivated it — yet only
`droppedFromCurrentPull()` had fired (stale since Aug 20), and the v5.291 message text was
asserting *"Deactivated in QSRSoft but still carrying $31 on hand"* — a false claim the data
doesn't support. `recommendationForItem()` now only uses that confident wording when
`confirmedDeactivated` is true; the weak-signal-only case gets an honest, hedged message instead
("Hasn't refreshed from QSRSoft in over a week... may already be deactivated with a stale balance,
or may still be active and just need a fresh count. Verify in QSRSoft.") and stays IN the
actionable item counts (not muted), since we're not confident enough to say it needs no action.

## Still open / not solved
The root problem — our bulk `qsr_onhand`/`qsr_raw_item_detail` pulls simply stop returning a WRIN
once something (deactivation? going stale? something else?) happens to it, so we never learn its
TRUE current state (like that Aug 6 zero-count) — is **not fixed**, only diagnosed and hedged
around in the display text. A real fix would need a targeted per-WRIN re-pull for
`droppedFromCurrentPull()`-flagged items, hitting whatever endpoint backs QSRSoft's own per-item
"Variance Stat/Yields" drill-down screen (the one in the owner's screenshot — takes an explicit
WRIN/description search, appears to return full event history regardless of active status). That
endpoint has NOT been identified/reverse-engineered yet — this session has no QSRSoft credentials
(`QSRSOFT_TOKEN`/`QSRSOFT_USERNAME`/`QSRSOFT_PASSWORD` all absent from env), so it can't be probed
live. Next step needs either the owner capturing the real request (DevTools → Network → the
Variance Stat/Yields per-item call → copy URL) or a session with QSRSoft secrets running
`scripts/qsrsoft-explore.mjs`-style discovery.

## Deferred — Count Swings product reconstruction (owner, 2026-08-31, "for later")
Owner flagged, from a live Pauls Valley-Ballard Rd screenshot: the "Possible product
reconstruction" section (Count Swings report, `src/engine/eom-item-journey.js` or wherever that
lives) suggested **Triple Stack** menu items (McMuffin/McGriddle/Biscuit Triple Stack) as possible
explanations for missing sausage patty/bacon — but this store **doesn't sell Triple Stack items at
all**. The reconstruction logic needs to rule out inactive/not-sold menu items before suggesting
them, not just match on raw-ingredient ratios. Not started — owner said explicitly "for later".
