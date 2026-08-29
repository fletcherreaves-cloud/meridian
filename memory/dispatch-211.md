# Dispatch #211 — wire real email + SMS delivery for EOM count notifications

## Context — the hook point exists, the credential now exists, wire it

Dispatch #209 built the detection engine and in-app notification system, and deliberately left ONE
named hook point (`scripts/qsrsoft-onhand-pull.mjs`, right after the `eom_count_notifications`
insert succeeds) for a future email/SMS send — explicitly out of scope for that dispatch pending
the owner providing a provider + recipient. The owner has now:
- Added `RESEND_API_KEY` as a GitHub Actions repo secret (confirmed by the owner, not yet
  independently verified by a real send — Task 3 below is that verification).
- Chosen the delivery targets: **email** to `fletcher.reaves@mcreaves.com`, and **"SMS"** via the
  AT&T email-to-SMS gateway (`3346722598@txt.att.net`) — sent as a second, plain-text-formatted
  email through the SAME Resend integration. No Twilio, no second provider. This means "email and
  SMS" is really "two Resend sends with different recipients and formatting," not two integrations.

## Task 1 — Send functions (new, in `scripts/qsrsoft-onhand-pull.mjs` or a small new
`scripts/lib/resend-notify.mjs` if that keeps the main script cleaner — your call)

1. `sendEmailNotification(row, storeInfo)` — POSTs to `https://api.resend.com/emails`
   (`Authorization: Bearer ${process.env.RESEND_API_KEY}`), `from: 'Meridian <onboarding@resend.dev>'`
   (Resend's shared sender — no domain verification exists yet, don't assume one), `to:
   'fletcher.reaves@mcreaves.com'`. Build a real, readable HTML (or well-formatted plain-text, your
   call) body from the `eom_count_notifications` row shape dispatch #209 already built:
   `trigger_kind`, `class_statuses` (all four classes' status/pct per rule 3 — always show every
   relevant class, not just the trigger), `uncounted_items` (`{items, totalCount, totalValue,
   truncated}` — show a reasonable inline list, e.g. top 5-10 by `valueAtRisk`, plus the total
   count/$ so nothing reads as silently truncated), `kb_links`. Include the store's name/loc
   (`storeInfo` — read from wherever `qsrsoft-onhand-pull.mjs` already has store name lookup, e.g.
   `STORE_NAMES`/similar already imported elsewhere in this repo — check before adding a new
   lookup).
2. `sendSmsViaCarrierGateway(row, storeInfo)` — same Resend API call, `to:
   '3346722598@txt.att.net'`, but the body must be SHORT plain text (carrier email-to-SMS gateways
   often truncate or reject long/HTML content) — one or two sentences: store name, trigger
   class(es), a one-line status summary for the classes that matter most (don't try to cram all
   four classes' detail into a text — pick what's most decision-relevant, e.g. "Purcell: Food+Cond
   complete (99%). Paper not started. 12 items left ($430)." — use your judgment on exact wording,
   keep it under ~300 characters), and skip KB links in the SMS body entirely (not useful in a
   text, adds length for no benefit).
3. Both functions: on a non-2xx Resend response or a thrown fetch error, log a warning (matching
   this file's existing error-handling pattern for Supabase insert failures — don't crash the
   whole pull run over a failed notification send) and continue; do not retry within the same run
   (the next scheduled run's own fire-once guard already prevents duplicate detection, but a
   failed SEND for an already-fired notification currently has no retry path — note this as a
   known gap in the PR body rather than building a retry queue, which is out of scope here).

## Task 2 — Wire into the pull script

At the exact hook point dispatch #209 left (search for "FUTURE HOOK" in
`scripts/qsrsoft-onhand-pull.mjs`), after the `eom_count_notifications` insert succeeds, call both
`sendEmailNotification(row, ...)` and `sendSmsViaCarrierGateway(row, ...)` once per row in
`notificationRows`. Both sends should happen for every fired notification (the owner asked for
"in app notifications or ... text updates and our email updates" — not one-or-the-other, both).

## Task 3 — Real, live verification (do not skip — this is a live external credential)

Per this repo's "measure it, don't reason about it" standing rule: a mocked-fetch unit test proves
your code calls the Resend API correctly, but does NOT prove the `RESEND_API_KEY` secret is valid,
that `onboarding@resend.dev` can actually deliver to an arbitrary recipient without domain
verification, or that the AT&T gateway address actually delivers as a text. All three are real
unknowns until measured. Build a small, owner-triggerable smoke test:
1. A `workflow_dispatch`-only step or a tiny standalone script (e.g.
   `scripts/test-eom-notification-send.mjs`, invoked via a small addition to an existing workflow's
   `workflow_dispatch` inputs, or its own minimal workflow file — your call on the cleanest shape)
   that sends ONE real test email and ONE real test text using the actual send functions from Task
   1, with clearly-fake/obviously-test content (e.g. "Meridian test send — ignore, dispatch #211
   verification").
2. You will not be able to run this yourself with the real secret (GitHub Actions secrets aren't
   available in your local/sandboxed environment) — that's expected. Build it, verify it's
   correctly wired via a mocked-fetch unit test, and say clearly in the PR body that live delivery
   still needs to be confirmed by an actual triggered run post-merge (the PM will do this and ask
   the owner to confirm both messages actually arrived).

## Verification

- Unit tests (mocked `fetch`, no real network calls) for both send functions: correct Resend API
  shape, correct recipients, correct handling of a non-2xx/thrown-error response (warns, doesn't
  throw).
- Confirm the hook-point wiring fires both sends for every row in `notificationRows`, in a scoped
  integration-style test mirroring dispatch #209's own `eom-count-notifications-pull.test.js`
  pattern.
- The smoke-test script/step itself: at minimum a mocked-fetch test proving it constructs correct
  requests; real delivery confirmation is explicitly a post-merge PM+owner step, say so.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- Any retry/queue mechanism for a failed send — log and move on, per Task 1.3.
- Per-class-scoped delivery preferences (e.g. "only email me for Paper, text me for everything") —
  every fired notification gets both channels, no configurability, per the owner's own "in app...
  or... I can give you info to send text updates and our email updates" framing (both, not a
  choice menu).
- Setting up a verified sending domain for Resend — `onboarding@resend.dev` is fine for now; a
  custom domain is a future polish item if `onboarding@resend.dev`'s delivery or spam-folder
  behavior proves unreliable in practice.
