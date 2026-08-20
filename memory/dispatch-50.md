---
name: dispatch-50
description: Two owner-reported Security panel items. A is a one-property scroll bug already diagnosed to the exact line - a flex child with overflowY:auto and no minHeight:0. B removes the click-through reveal friction for Developer/Admin/Owner while KEEPING the audit log, on the reasoning that the gate never restrained the owner (who holds service-role access) but the log has real value.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #50 — Security panel: scroll fix + frictionless reveal for privileged roles

Both owner-reported, 2026-08-20, after real use of the shipped panel. Independent; either can ship
alone.

---

## Part A — the modal doesn't scroll (diagnosed, one property)

**Owner: "scroll not working in the modal."** Root cause found, not guessed. The chain:

```
App.js:2854  ModalShell  bodyStyle:{ padding:0, overflow:'hidden', display:'flex', flexDirection:'column' }
             (ModalShell defaults to maxHeight:88vh, so the height IS bounded — that half is fine)
  └─ security-panel.js:431  div { display:'flex', flexDirection:'column', height:'100%' }
       ├─ header rows (domain tabs, scope pills, rule chips, legend)
       └─ security-panel.js:468  div { flex:1, overflowY:'auto' }   ← should scroll, doesn't
```

**A flex item's default `min-height` is `auto`, so it refuses to shrink below its content.** `flex:1`
resolves to content height, the column grows past the card, and `ModalShell`'s `overflow:'hidden'`
clips the overflow instead of the child scrolling. Classic, and invisible until the list is long
enough to exceed 88vh — which is why it shipped.

**Fix: `minHeight: 0` on the body div at `security-panel.js:468`.** Verify whether the root div at
:431 needs it too (it is itself a flex child of `ModalShell`'s body); add only if it does — do not
scatter the property speculatively.

**Verification has to render, not unit-test.** Per the standing rule, a test that only asserts a
style object would pass with the panel's wiring deleted. Load the panel with enough findings to
exceed the viewport and confirm the list scrolls while the header stays fixed. Check both the Cash
and Inventory tabs, and check an expanded finding (the accordion changes content height).

**Look for the same bug elsewhere while you're here.** `flex:1` + `overflowY:'auto'` without
`minHeight:0` is a repeating shape in this codebase. A quick grep across `src/views/` may find
siblings — fix the ones you can verify, list any you cannot.

## Part B — Developer/Admin/Owner see names without clicking

**Owner: "how hard would it be to allow my role to see the names without the reveal."**

**The reasoning matters more than the change, so do not re-derive it:** the reveal gate never
restrained the owner. He holds service-role access and can `select employee_name from
employee_identity_vault` directly. Requiring a click plus a typed reason is friction on the one
person it cannot constrain.

**But the gate and the log are separable, and only the gate is theatre.** Keep the log. Three
reasons it earns its place even for the owner: a second operator is a stated deployment plan and
this is the pattern that ships to them; these findings can lead to employee discipline, where a
record of who looked at what and when is evidence of a fair process (protective of the owner, not a
constraint on him); and it costs nothing once it is not a click.

**So: auto-resolve for the privileged tier, still logged, with a synthetic reason.**

**Scope:**
1. **`reveal_employee_identities_bulk(p_tokens uuid[], p_reason text)`** — mirrors
   `reveal_employee_identity()`'s existing role gate exactly. Returns a token→name map. Privileged
   roles only; every other role continues through the single-token click path.
2. **Panel:** pre-populate `RevealName`'s cache on mount when the viewer is privileged. The cache is
   **already lifted to the parent** (`revealed` / `onReveal`, `security-panel.js:376`), so
   `RevealName` itself needs no change — seed the map and names render directly.
3. **Additive only.** The click-through path stays for GM / Supervisor / DO. This adds a fast path
   for the top tier; it does not remove the gate.

**Log granularity — decide before building.** Auto-resolving on every panel load writes one row per
token per view: a hundred findings means a hundred rows every time the panel opens, and the log
becomes unreadable within a week. **Prefer one row per session-view recording the token count** over
one row per token. Slightly less granular, far more usable, and still answers "who saw names, when."
`identity_reveal_log.person_token` is `not null` and FK-constrained, so a count-style row needs a
schema decision — make it deliberately rather than defaulting to per-token because the column
happens to exist.

**⚠️ MANDATORY, not boilerplate: adversarially probe the new RPC with the anon key before calling it
done.** `reveal_employee_identity()` itself shipped with a NULL-role bypass that anon could exploit,
and the test suite was green
(`incident-reveal-rpc-null-role-bypass-2026-08-20.md`). Any `SECURITY DEFINER` function that returns
names gets a live probe: anon, and a role with no entitlement. A trailing unconditional `ELSE` that
raises is the shape that fixed it last time.

**Never log or return a name in an error message, a console line, or a test fixture.**

---

## Out of scope

- Changing who *may* reveal. The tier is unchanged; only the friction goes.
- Removing the reveal path for non-privileged roles.
- Dispatch #49 (vault re-key). **Note the interaction:** #49 may change what a token keys on, but
  this dispatch only reads token→name through the vault's own RPC, so it should survive. If #49's
  Phase 0 has already run, check before assuming.

## Standing rules that bite here

- **Adversarially probe every `SECURITY DEFINER` change with the anon key.**
- **Verification must render** — a style-object assertion passes with the wiring deleted.
- **Check whether a helper exists before writing one** — the reveal cache is already lifted.
- **Commit every `memory/` file with the work that cites it.**
