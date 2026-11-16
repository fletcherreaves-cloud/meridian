---
description: "Owner-reported operational facts about store 44689's (Lindsay) opening day (2026-11-16) digital/delivery channels — mobile app ordering broken, DoorDash deliberately disabled (tablet still registered to predecessor store 18213), Uber Eats correctly configured and active. Recorded so a future session reading 44689's digital/3PO sales data doesn't mistake these for a real demand signal, a config bug, or a reason to raise a data-pull/sync alarm."
---

# Store 44689 (Lindsay) launch-day channel status — 2026-11-16

Owner, in person at 44689 for its first day open (dine-in only this same day — see
`memory/project-equipment-profile.md`'s field-walkthrough entries for the same visit), reported
three facts about the store's digital/delivery channels:

1. **Mobile app ordering is not working.** Not elaborated further — unclear whether this is an
   app-side config issue, a POS/kitchen integration gap, or something else. Not independently
   diagnosed by this session (no access to the actual ordering system). **Effect on Meridian's
   data**: any `digitalPct`/`digitalGC`/app-channel metric for 44689 on 2026-11-16 (and possibly
   following days, until fixed) will read near-zero because the channel is genuinely broken, not
   because of low adoption — don't flag it as an anomaly or a data-pull problem without first
   checking whether it's been fixed.
2. **DoorDash is deliberately turned OFF**, because the restaurant's DoorDash tablet is still
   registered to **18213** (Lindsay-Walmart, the predecessor store this location replaces — see
   `constants.js`'s `storeLifecycle`/relocation comments and `memory/project-new-store-launch-
   planner.md`). Orders would otherwise misroute to the closed/closing predecessor. **Effect**:
   44689 will show **zero DoorDash 3PO sales** for an unknown period (until the tablet is
   re-registered to 44689 — not yet done as of this note) — this is a deliberate, known,
   temporary state, not a missing-integration bug to chase.
3. **Uber Eats is correctly configured and active.** No issue there.
4. Owner's own framing: *"Don't do a lot of 3rd party delivery here though"* — Lindsay is
   expected to be a low-3PO-volume store generally, so none of this is expected to be a large
   dollar impact regardless of channel status.

**Not yet known / open**: when the DoorDash tablet gets re-registered to 44689, or when mobile
ordering gets fixed. No action item exists in this repo to track that re-registration — if it
becomes relevant to a future data reconciliation (e.g. "why is 3PO channel mix off for 44689"),
check with the owner for current status before assuming either is still broken; this note is a
point-in-time snapshot from 2026-11-16, not a standing config fact.
