# Dispatch #38 — Security build: reveal-UI for the Register Audit panel

**⚠️ Implemented 2026-08-20 — see [dispatch38-reveal-ui.md](dispatch38-reveal-ui.md) for the
actual build.** PM-verified: the implementing session's branch (PR #465) carried a stale copy of
`supabase/schema-identity-vault.sql` and `memory/dispatch37-identity-vault.md` that reverted the
same-day `reveal_employee_identity()` security fix — likely a local checkout that predated that
fix. The genuine dispatch-38 diff (the `RevealName` component, its wiring, the two new test
files, the changelog entry, and the writeup) was independently re-applied on top of the current,
already-fixed `main` instead of merging PR #465 as-is; full suite (1639/1639) and build reverified
clean against that combination. PR #465 itself was left open as a stale draft — do not merge it.

**Board (2026-08-20), at time of writing:** `main` has dispatch #37 (identity vault, PR #459)
merged, and the owner has since run both `supabase/schema-identity-vault.sql` and
`scripts/backfill-identity-vault.mjs` against live Supabase (confirmed live:
`tokenized: 21929, still_untokenized: 0`) — the vault has real token↔name data for this
dispatch's UI to reveal. (Original brief below was written before that ran; kept as-written for
the record.)

**Why this dispatch exists:** dispatch #37's own retrofit of `analyzeRegisterAudit` (§4,
`memory/dispatch37-identity-vault.md`) deliberately strips plaintext names from its output —
"blind mode" working as designed, not a bug. But it left `src/views/store-analytics.js`'s
Register Audit panel showing `'Unknown'`/`'?'` at every site that used to show a name, with no
way for an authorized viewer to see who's actually being flagged. This dispatch closes that gap
the way Direction B's architecture intends: a deliberate, logged, reasoned reveal — not a silent
patch that routes around the vault.

**Read before starting:** `memory/dispatch37-identity-vault.md` (what the vault already provides)
and `memory/plan-security-loss-prevention.md` §5 (the access-tier decision this UI must respect:
admin/supervisor always allowed, manager gated on `org_config.gm_identity_reveal_enabled`).

---

## What's already there — do not rebuild any of this

- `reveal_employee_identity(p_token uuid, p_reason text)` — the RPC, already handles role-gating,
  reason validation, and logging. Call it via `supabase.rpc('reveal_employee_identity', {p_token,
  p_reason})`. It raises (rejects) on an unauthorized role, empty reason, or unknown token — the
  UI needs to handle that rejection gracefully (show an error, don't crash), not re-implement any
  of the gating logic client-side.
- `analyzeRegisterAudit`'s output already carries `e.id` (the token) — nothing to change there.

## 1. A shared `RevealName` component

New, reusable — this is the one piece both the table cells and the narrative paragraphs need.

- **Default (unrevealed) state**: a short, clearly-clickable placeholder — not the raw UUID
  token (jarring, meaningless to a human) and not silently just `'Unknown'` (indistinguishable
  from "no data," which is actively misleading now that there IS an identity behind it, just
  gated). Something like a masked label with a click affordance — implementer's call on exact
  copy/styling, but it must visually read as "click to reveal," not as a data gap.
- **On click**: collect a reason. `window.prompt()` is an established pattern in this codebase
  for exactly this shape of input (`src/views/eom-dashboard.js`'s "Approved by / reason" flow) —
  reasonable default; `src/components/ModalShell.js` exists if a more structured reason-entry UI
  is worth the extra lift. Either is acceptable; don't skip collecting a real reason string
  (the RPC rejects an empty one, but don't rely on that alone — the point is a human giving an
  actual reason, not clicking through a blank prompt).
- **On confirm**: call the RPC. On success, cache the resolved name (keyed by token) in state
  shared across the whole panel (see below) so revealing an employee once doesn't re-prompt for
  the same person elsewhere in the same view. On rejection (wrong role, org toggle off, etc.),
  show the actual error message from the RPC — don't swallow it into a generic failure.
- **Already-revealed state**: show the real name plainly, no further interaction needed.

## 2. Where the reveal-state cache lives

`RegisterAuditTab` (in `store-analytics.js`) is the parent of both `RegisterAuditNarrative` and
the four table sections (Overview/T-Reds/Refunds/Cash) — lift a `revealed` map (`token → name`)
to that component and pass it down, rather than keeping separate caches per section. A name
revealed once in the Overview table should show resolved everywhere else in the same panel
without a second RPC call or a second reason prompt.

## 3. Retrofit the table cells — four sites, mechanical

Each of `RegisterAuditTab`'s four sections (Overview, T-Reds, Refunds & Overrings, Cash &
Discounts) has its own `td(...)` cell currently rendering `e.emp||'Unknown'`. Each row is already
its own DOM node — swap each for `h(RevealName, {token: e.id, cache: revealed, onReveal: ...})`
(or equivalent). No text restructuring needed here — this is the easy half of this dispatch.

## 4. Retrofit the narrative paragraphs — five sites, needs restructuring

`RegisterAuditNarrative`'s paragraph objects currently build `text` as a single template-literal
string with a name baked directly into the middle of a sentence (e.g. `` `The most significant
cash variance belongs to ${worst.emp||'Unknown'}, running...` ``). A `RevealName` component can't
be inserted into the middle of an already-flattened string — **this requires changing the
affected paragraphs' `text` field from a plain string to a mixed array of strings and
`RevealName` elements** (React can render an array of children), and changing the render loop
(currently `div({...}, p2.text)`) to handle that shape alongside the plain-string paragraphs that
don't reference an employee. Five sites need this: the Cash O/S paragraph, the Void & Refund
paragraph, the Discount & Meal paragraph, the Drawer Open Frequency paragraph (currently a
`.map(e=>e.emp||'Unknown').join(', ')` over possibly multiple employees — needs to become an
array of `RevealName` elements interleaved with `', '` separators, not a joined string), and the
Recommended Actions paragraph (same `.map(...).join(', ')` shape over up to 2 employees).

**Do this per-paragraph, not via a generic string-replace-after-render trick** — trying to
find-and-replace a token pattern inside already-rendered text is fragile and this codebase
doesn't have a precedent for it; building the array directly where each paragraph is constructed
is the straightforward, correct approach.

## 5. The AI-insight prompt builder — explicitly NOT in scope for reveal

`RegisterAuditTab`'s `AITabInsight` `buildPrompt` callback (`top3=...map(e=>(e.emp||'?')+...)`)
constructs a plain-text prompt string fed to the AI panel on demand — there's no click target or
rendered DOM to attach a reveal action to, and prompts are generated fresh each time the AI panel
runs, not incrementally revealed. **Leave this reading `e.id` (the token) or a short generic
label like `Employee A`/`Employee B`** — do not wire reveal into this site. If AI-assisted
coaching genuinely needs real names in the prompt later, that's a separate, deliberate decision
(should the AI model see raw names at all, logged how) — not an incidental extension of this
dispatch's table/narrative reveal mechanism.

---

## Verification approach

- `RevealName`'s state machine (unrevealed → prompted → revealed / rejected) is unit-testable
  with a mocked `supabase.rpc()` call, matching dispatch #37's own test pattern for
  `getOrCreateToken()`.
- The narrative-paragraph restructuring is testable by asserting the resulting `text` shape is an
  array containing the expected strings and a `RevealName` element with the right token — not by
  rendering to a live DOM if this repo's test setup doesn't support that already (check existing
  component tests, if any exist, for the established pattern before assuming one).
- **Cannot be verified against a live reveal** — same constraint as every prior dispatch in this
  sequence — this sandbox has no live Supabase session with a real `admin`/`supervisor` role to
  actually call `reveal_employee_identity` end-to-end. State this plainly; the owner or a live
  session should click through the actual reveal flow once before trusting it fully.

## Explicitly not in this dispatch

- Any change to the vault schema, the RPCs, or `analyzeRegisterAudit` — all already correct
  per dispatch #37.
- The AI-insight prompt builder (see §5 above).
- A "reveal all" bulk action, an audit-log viewer UI (browsing `identity_reveal_log`), or any
  admin panel for managing `org_config.gm_identity_reveal_enabled` — all future work, not blocking
  this dispatch's narrower scope (make the existing panel functional again, one employee at a
  time, on purpose).
- Phase 1's actual fraud-detection rules, Phase 4's evidence-chain mechanism — unrelated threads.
