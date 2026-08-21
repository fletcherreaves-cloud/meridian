---
name: finding-dispatch56-part-e-b-status-2026-08-21
description: Where dispatch #56 Parts E (register + time of event) and B (employee start date) actually stand after PR #534's storeRef correction. Two of event_details' open questions are resolved (storeRef, auth); three are not, and none of them are answerable from inside this coding session -- they all need a live, authenticated QSRSoft DevTools capture, which this environment has no credentials for. Report before building, same discipline Part B's own brief already called for, extended here to Part E's remaining unknowns. No code shipped this pass.
metadata:
  node_type: memory
  type: finding
---

# Dispatch #56 Parts E and B — status after PR #534, and why nothing was built this pass

**2026-08-21**, immediately after Part D (PR #535) and its corroboration-window fix. Picks up
Parts E and B per the owner's own stated sequencing (E next, B folded into the same probe).

## What PR #534 actually resolved for Part E

Read directly from `memory/finding-qsrsoft-event-details-endpoint-2026-08-21.md` on that PR's
branch (not yet merged to `main` — the correction is real, quoted from the live diff, not assumed
from the PR title):

- **`storeRef` is the plain, unpadded NSN.** `29760` = Duncan-Hwy 81 (`src/constants.js:294`), the
  same conversion the DAR pull already performs (`String(Number(loc))`). No `loc → storeRef`
  mapping to hunt — this was a real error in the original finding (asserted without checking
  `STORE_NAMES`), now corrected.
- **Auth is token-only**, confirmed from the DevTools request-header panel (no `Cookie` header
  present in what the browser actually sent) — `api.security.myqsrsoft.com` is NOT the DAR host;
  a plain Node `fetch` with `x-auth-token` should work, no Playwright fallback needed as the
  default design.

Both of these were "settle before designing the pull" gates from `dispatch-56.md` itself. Both are
now closed.

## What is still open, and why none of it can be settled from inside this session

Three more items the finding file itself calls blocking, plus one dispatch-56.md names
separately — and all four require a **live, authenticated call against
`api.security.myqsrsoft.com`** to resolve. This coding environment has no `QSRSOFT_TOKEN` (or
username/password) available — checked `.env.local`, `.env.example`, and the process environment
directly before writing this, per the standing "measure it, don't reason about it" rule; every
`finding-qsrsoft-*.md` file in this repo so far was captured by the owner's own browser session,
none by an agent, and that pattern isn't a coincidence — it's the only way to reach this host.

1. **`event_token` enumeration — the finding file's own "single highest-value unknown."** The one
   capture used `"all_promo"`. `audit_rows` aggregates refunds, POS over-rings, manual
   refunds/discounts, and promo dollars daily; each almost certainly has its own `event_token`.
   Without the vocabulary, a pull can show register+time for promo events only — a real but narrow
   slice of "any other key info such as drawer worked and time of event," not the general case the
   owner asked for. **Needs:** the owner running the Register Audit report's drill-in for a refund,
   a void, an over-ring, a T-Red before/after, and a cash over/short, and capturing each request
   body's `event_token` value the same way `all_promo` was captured.
2. **`remaining_amt` semantics** — unconfirmed. The finding file is explicit: "do not build anything
   on it until someone confirms what it means." No pull field should surface `remaining_amt` as a
   named quantity until that's settled.
3. **`order_key`-vs-`reg_num` mismatch** — the captured sample's `order_key` register prefix
   (`POS0012`/`POS0014`/`POS0015`) never matches the row's own `reg_num` (`POS0013`). The finding
   file's own read ("a Mobile promo originating elsewhere, fulfilled at POS0013") is labelled a
   **hypothesis, not a finding**. Joining `event_details` to `transaction_detail` on the wrong
   register would silently mis-attribute an event to the wrong drawer — exactly the kind of
   confident-sounding wrong answer this repo's standing rules exist to prevent. Needs a second
   sample (ideally a non-mobile event type) to see whether the mismatch is mobile-specific or
   general.
4. **Camera/video linkage — dispatch-56.md's own "still genuinely open."** The one captured call
   (`all_promo`, an ordinary `TRX_Sale`) carried no camera field. That is not an answer — a link
   plausibly only appears on a flagged row type. Needs a captured refund/void/over-ring to settle
   either way.

**Also unresolved, surfaced by dispatch #56 Part E's own PII section, not yet checked:** whether
`event_details`'s `crew` badge number (e.g. `"Aaden W - 91"` → `91`) is the same identifier as
dispatch #51's `emp_id`, or a separate namespace. Getting this wrong would either merge two
different people under one vault key or fail to recognize the same person across two data
sources. The time-punches-matched finding (`finding-qsrsoft-time-punches-endpoint-2026-08-21.md`)
already answered the analogous question for `geid` (matches `audit_rows.emp_id`'s length bands);
the same check has not yet been run for the `event_details` badge, and nothing in either capture
settles it — badges in this sample are two digits, nowhere near the `emp_id`/`geid` length bands,
so **provisionally a separate namespace**, but "provisionally" is doing real work in that sentence
and this should be confirmed, not assumed, before either is used as a vault key.

## Part B — still no hire-date field anywhere, and the `/reporting/v2/people/` lead is a location, not a discovery

Re-checked per the standing "grep before reporting blocked" rule rather than re-asserting from
memory: `finding-qsrsoft-time-punches-endpoint-2026-08-21.md` is the only capture under
`/reporting/v2/people/` this repo has, and its own confirmed field table (`geid`, `storeNum`,
`punchType`, `isPaidBreak`, `startDateTime`/`endDateTime`, `inModified`/`outModified`,
`jobTitleCode`, `timeCardNumber`, `badgeType`) carries **nothing hire-date-shaped**. It is
punch-level transactional data, not a roster.

The owner's own framing — "a path family we'd never touched, which is where an employee-roster
endpoint would live if one exists" — is a reasonable place to look next, but it names a
**neighbourhood, not an address**. `/reporting/v2/people/` could hold several report endpoints
beyond `time-punches-matched` (the QSRSoft "People" report menu almost certainly has more than one
entry). **Still no hire date exists anywhere Meridian pulls today** — the standing finding from
`dispatch-56.md` itself is unchanged, just now with a concrete place to look.

**What would close this:** the owner opening QSRSoft's own People/Roster/New-Hire report screens
(anything under the same report menu `time-punches-matched`'s Referer pointed at —
`v3.myqsrsoft.com/reports/mcd/people/`) and capturing whichever request(s) fire, the same way every
other endpoint in this repo's history was found. If nothing under that menu carries a hire date
either, that is itself a real, useful, reportable answer — not a failure to keep searching.

## What was deliberately NOT built this pass, and why

Per `dispatch-56.md` Part B's own instruction — *"Report before building... do not build the proxy
until the owner has seen whether a real hire date is reachable"* — extended here to Part E's
remaining unknowns for the same underlying reason: **this session cannot verify a pull against a
host it cannot reach.** Writing an Edge Function or a parser against a guessed `event_token`
vocabulary, an unconfirmed `remaining_amt` meaning, or an unresolved `order_key` join would be
exactly the "confident-sounding wrong answer" this repo's standing rules warn against, and there
would be no way to catch the mistake before it shipped — the sandbox has no credentials to run it
against the real endpoint even once.

**What IS safely buildable once the event_token vocabulary lands:** the shape of the work is
already clear from the confirmed response schema and the resolved storeRef/auth questions — a
Tier-B, on-demand fetch (matching the Security panel's existing `loadAuditRowsWindow`/
`loadQsrVarianceStat` pattern, dispatch #43's own discipline, never an eager pull) wired into
`SubjectDrilldown` alongside the existing five measurements, showing register + time + daypart for
a flagged cash finding's own window. `crew`/`mgr` names route through
`get_or_create_employee_token()` on ingest exactly as Register Audit already does — never persisted
plaintext, per the vault rules the finding file itself restates. That design doesn't change once
the remaining unknowns are settled; only the `event_token` parameter and the join key do.

## Next concrete step

One capture round from the owner closes most of this at once: pull the Register Audit drill-in for
one refund, one void, one over-ring, and (if reachable) a T-Red before/after and a cash over/short,
the same way `all_promo` was captured — each gives an `event_token` value AND another data point on
the `order_key`/`reg_num` question AND another shot at the camera-field question. Separately,
opening QSRSoft's People report menu and capturing whatever's there answers Part B. Neither needs
code from this session first.
