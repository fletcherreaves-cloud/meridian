# Dispatch #38 — Security build: reveal-UI for the Register Audit panel

2026-08-20. `memory/dispatch-38.md`, closing the gap dispatch #37's own `analyzeRegisterAudit`
retrofit deliberately opened (`memory/dispatch37-identity-vault.md` §"a real conflict found and
flagged"). No changes to the vault schema, the RPCs, or `analyzeRegisterAudit` — all already
correct per dispatch #37; this dispatch is UI only.

## What was built

**`RevealName` component** (`src/views/store-analytics.js`) — the one place a token gets
resolved back to a real name:
- **Unrevealed state**: `🔒 reveal`, clearly clickable (amber, underlined), not the raw UUID
  and not indistinguishable from `'Unknown'`.
- **Pre-backfill state** (`e.id === 'Unknown'`, no token yet): renders plain `'Unknown'` text,
  no click target — nothing to reveal.
- **On click**: `window.prompt()` for a required reason, matching `eom-dashboard.js`'s
  established "Approved by / reason" pattern. A cancelled or blank prompt makes no RPC call at
  all — the reason requirement isn't left to the RPC's own rejection alone.
- **On confirm**: calls `reveal_employee_identity(p_token, p_reason)` (dispatch #37's RPC,
  completely unmodified — no role-gating or logging logic duplicated client-side) and reports
  the resolved name up via `onReveal(token, name)`.
- **On rejection**: shows the RPC's own error message as the element's `title` and as visible
  text (`⚠ reveal failed`) — never a swallowed generic failure.

**Cache placement**: lifted to `RegisterAuditTab` (`revealed` state, `token -> name`, plus a
memoized `onReveal` callback) — declared before any early return, since React's rules of hooks
don't allow a conditional hook call and this component has two early returns (loading / no-data)
above where the table renders. Passed down to both the four table sections and
`RegisterAuditNarrative`, so revealing one employee once resolves them everywhere else in the
same panel view without a second prompt or RPC call — verified directly by the integration test
below, not just asserted.

## The two retrofit halves

**Table cells (4 sites, mechanical)** — Overview, T-Reds, Refunds & Overrings, Cash & Discounts.
Each `td(...)` cell's `e.emp||'Unknown'` swapped for `h(RevealName,{token:e.id,cache:revealed,
onReveal})`. No text restructuring needed.

**Narrative paragraphs (5 sites, needed real restructuring)** — Cash O/S, Void & Refund,
Discount & Meal, Drawer Open Frequency, Recommended Actions. Each paragraph's `text` field
changed from a flat template-literal string to a mixed array of strings and `RevealName`
elements, since a React component can't be inserted into an already-flattened string. Two of
the five (Drawer Open Frequency, Recommended Actions) previously built a joined list via
`.map(e=>e.emp||'Unknown').join(', ')` — rewritten as a shared `namesList()` helper that
interleaves `RevealName` elements with `', '` separators as an array, since a name literally
can't be joined into a string until it's been revealed. **No change was needed to the render
loop itself** (`div({...}, p2.text)`) — passing an array as a single children argument is
already how this codebase renders `.map()` results elsewhere (e.g. the `SECTIONS.map(...)` tab
strip a few lines above), so React already handles a mixed string/element array the same way.

**Recommended Actions** needed one more layer: `actions` itself is now an array of entries that
are either a plain string or an array of (string|element) — the "pull video" action embeds up
to 2 employee names — then flattened into one `text` array with `'<n>. '` prefixes and `'\n'`
separators between actions, reproducing the old `.map((a,i)=>(i+1)+'. '+a).join('\n')` shape
exactly, just as an array of children instead of one joined string.

## A real, separate bug found and fixed while reading the AI prompt builder

`RegisterAuditTab`'s `AITabInsight.buildPrompt` still read `e.emp||'?'` — a field dispatch #37
already removed from `analyzeRegisterAudit`'s return value. This had silently gone stale to
always render `'?'` for every employee since PR #459 merged; nobody had reason to notice since
the prompt only feeds an on-demand AI call, not a persistently-visible UI element. Per the
dispatch's own §5 guidance ("leave this reading `e.id` ... or a short generic label"), changed
it to read `e.id` (the token) instead — deliberately **not** wired into the reveal mechanism
(no click target/rendered DOM to attach one to, and prompts regenerate fresh on every run, so
there's nothing to cache a reveal against).

## Verification approach (matches dispatch #35/#36/#37's pattern)

- `src/__tests__/reveal-name.test.js` — `RevealName`'s state machine in isolation, mocked
  `supabase.rpc()` (`vi.mock('../lib/supabase.js', ...)`, the exact pattern
  `blob-sync.test.js`/`insight-ledger-measure.test.js` already established for this repo) +
  React's own `createRoot`/`act` render-testing pattern (`at-a-glance-checklist-freshness.
  test.js`'s established precedent — this repo has no `@testing-library/react`, mounting via
  `react-dom/client` directly is the house style). Covers: null/pre-backfill tokens render
  plain `'Unknown'` with no click target; an unrevealed real token shows a masked affordance
  (never the raw token, never bare `'Unknown'`); a cached token shows the name directly; the
  full click → prompt → RPC → `onReveal` path with the exact `{p_token, p_reason}` args; a
  cancelled or blank-reason prompt makes no RPC call; an RPC rejection surfaces its own message
  verbatim.
- `src/__tests__/register-audit-tab-reveal.test.js` — an **integration** smoke test mounting
  the actual `RegisterAuditTab` consumer (not `RevealName` standalone), per CLAUDE.md's
  "would this verification still pass if the change were reverted" rule: a `RevealName`-only
  test can't tell "wired into the panel" from "wired into the panel but the prop got dropped at
  one of the 9 call sites." Confirms one real click on the Overview table's cell resolves the
  name in **both** the table cell and the narrative's Cash Over/Short paragraph from the one
  shared `revealed` cache, and that `window.prompt` was called exactly once (no second prompt
  for the second appearance).
- **Cannot be verified against a live reveal** — same constraint as every prior dispatch in
  this sequence: no live Supabase session with a real `admin`/`supervisor` role in this
  sandbox. An owner or live session should click through the actual reveal flow once (correct
  name resolves, a rejected reveal shows a sensible message) before this is trusted end-to-end.

## Explicitly not in this dispatch

Any change to the vault schema, the RPCs, or `analyzeRegisterAudit` — all untouched, already
correct. The AI-insight prompt builder's reveal-wiring (only its stale `.emp` reference was
fixed, not wired to reveal). A "reveal all" bulk action, an `identity_reveal_log` viewer UI, or
an admin panel for `org_config.gm_identity_reveal_enabled` — all future work. Phase 1's actual
fraud-detection rules, Phase 4's evidence-chain mechanism — unrelated threads.

## Verified

- `node --check src/views/store-analytics.js`: clean.
- 9 new tests (7 `reveal-name.test.js` + 2 `register-audit-tab-reveal.test.js`). 1639/1639 full
  suite passes (156 files). `npm run build` clean, unaffected — `store-analytics.js` is not
  eagerly bundled, entry chunk unchanged.
