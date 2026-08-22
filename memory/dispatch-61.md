# Dispatch #61 — derive the Test Kitchen block from `panel.kind`

**Status:** ready to start. No external input needed, no blocked dependency.
**Why now:** the two lists agree *today*. That is the window — see "The measurement" below.

---

## The goal, in one sentence

Make `⚗ TEST KITCHEN` in `src/app/shell.js` render from `panel.kind === 'test-kitchen'`
instead of a hand-maintained list of literal `navPBeta('id')` calls, so that **promoting a panel
is the one-field flip CLAUDE.md's standing rule already describes it as.**

Today it is two edits, and getting it wrong duplicates the panel. From CLAUDE.md, measured
2026-08-21: flipping `fcst-accuracy` to `kind:'nav'` renders it **twice** — once under its own
section, once still under Test Kitchen, header and all. That is the defect. The registry is
supposed to be "ONE source of truth for every panel in the app"
(`panel-registry.js:2`); for this one block it is not.

## The measurement — why this is a pure refactor right now

Verified against the code this morning, not recalled:

| | count |
|---|---|
| `navPBeta('…')` call sites in `shell.js` (uncommented) | **11** |
| `kind:'test-kitchen'` panels in `panel-registry.js` | **11** |
| set difference, either direction | **0** |

`dialedin · dicompare · fcst-accuracy · fcst-ref · forecast-audit · forms-completion · lfz-gap ·
lifelenz-bridge · model-assign · proj · pvsa`

Corroborated independently by `shell-nav-snapshot.test.js:221`, whose ratchet asserts the
promotion test "covers all eleven current Test Kitchen panels."

**So membership has not drifted yet.** Derivation is therefore behaviour-preserving and provable,
rather than a refactor that also silently changes what renders. Do it before the two lists
disagree — at that point the same change becomes a product decision about which list was right.

⚠️ A raw `grep -c "kind:'test-kitchen'"` returns **14**, not 11. Three of those are **comment
mentions** (`panel-registry.js:80,102,124`), not declarations. Match `id:'…'[^}]*kind:'…'`
per object; a window-based regex mis-associates ids across object boundaries and produced a
completely wrong list on the first attempt here.

## The blocker that deferred this from dispatch #55 Part A — ORDER

This was not deferred for effort. Part A's bar was that **nothing about today's nav may move**,
and naive derivation moves all eleven items. The two orders are unrelated:

| # | shell.js (as rendered) | registry (declaration order) |
|---|---|---|
| 1 | proj | dialedin |
| 2 | pvsa | dicompare |
| 3 | model-assign | fcst-accuracy |
| 4 | dialedin | fcst-ref |
| 5 | fcst-accuracy | forecast-audit |
| 6 | lfz-gap | forms-completion |
| 7 | dicompare | lfz-gap |
| 8 | fcst-ref | lifelenz-bridge |
| 9 | forms-completion | model-assign |
| 10 | forecast-audit | proj |
| 11 | lifelenz-bridge | pvsa |

The registry is alphabetical; `shell.js` is curated. **Deriving membership without also deriving
order fails the bar.**

### Recommended design

Derive **both** from the registry: add an explicit order field (`tkOrder`, or a generic
`navOrder` if you prefer it reusable) to the eleven `test-kitchen` entries, numbered to reproduce
today's rendered order exactly. Then:

- membership → `kind === 'test-kitchen'`
- order → the new field
- promotion → flip `kind:`, and the entry leaves Test Kitchen and appears under its `section:`
  **with no second edit and no duplicate**

Rejected alternative, and why: *keep an explicit order array in `shell.js`, derive only
membership.* It looks lighter but preserves the two-edit problem it exists to remove — a new
Test Kitchen panel would still need a registry entry **and** an array entry, which is the same
drift with a different shape.

### The one real wrinkle

`shell.js:289` is `navPBeta('forecast-audit', { disabled: !selStore })` — a per-item option that
must survive derivation. It is the only one. Represent it declaratively
(`disabledWhen:'noStore'`, mapped to the predicate in `shell.js`) rather than special-casing that
id in the derived loop; a special case here is how the literal list started.

Also `shell.js:281` is a **commented-out** `navPBeta('proj')`, a deliberate prune record for an
exact duplicate ("Recall: uncomment"). Derivation deletes the line, so **move that recall note to
`memory/panel-catalog.md`** — do not silently drop it. `shell.js:272-276` says the recall list is
kept there already.

## Also update

`panel-registry.test.js:93` — *"navPBeta is used only for test-kitchen panels or the named
beta-gated exceptions"* — is a one-way guard over call sites that this change removes. It needs
rewriting, not deleting: the invariant it protects (nothing sneaks into Test Kitchen that is not
`kind:'test-kitchen'`) becomes **true by construction**, and the test should assert the derived
membership equals the registry filter instead. Note the current test's set of eleven has **no**
beta-gated exceptions in play — verified; every uncommented `navPBeta` today is a
`kind:'test-kitchen'` panel.

## Verification bar

1. **`shell-nav-snapshot.test.js:62` — "produces the exact post-regroup text content, in order" —
   must pass UNCHANGED.** This is the revert-sensitive bar and the reason the dispatch is safe:
   it renders the real sidebar and compares full ordered text, so any membership or ordering
   change fails it. Do not edit this test to accommodate the refactor. If it fails, the refactor
   is wrong, not the test.
2. **The promotion test (`shell-nav-snapshot.test.js:202`) and its eleven-panel ratchet (`:221`)
   must still pass.**
3. **New test — the actual defect.** Simulate flipping one panel to `kind:'nav'` and assert it
   renders **exactly once**, under its `section:` header and *not* under `⚗ TEST KITCHEN`.
   Today that assertion fails (it renders twice). Per the standing revert rule this must render
   through the real sidebar, not assert over the registry object — a registry-level test cannot
   tell "derived" from "derived but still also hardcoded".
4. `⚗ TEST KITCHEN` panels still vanish under `betaMode:true`, per `:182`.
5. `npm run build` clean. **Check `node -v` against `ci.yml`'s matrix before trusting a local
   green** (dispatch #60).
6. Entry-chunk numbers before/after in the commit body, per the standing performance rule. This
   should be net-neutral or slightly negative; if it grows, say why.

## Out of scope

- Any change to which panels are in Test Kitchen, or to any panel's `section:`. Membership is
  frozen at today's eleven; this dispatch changes **how the block is computed, not what it
  contains.**
- Promoting anything. The point is to make promotion cheap, not to spend it.
