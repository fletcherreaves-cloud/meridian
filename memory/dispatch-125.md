# Dispatch #125 — Reverse identity-vault tokenization for Crew Schedule (rework PR #725
# before merge)

**Owner's directive, verbatim (2026-08-25), sent while PR #725 (dispatch #123) was open for
review:** *"I flagged the PII/privacy considerations to you upfront via the scope question, and
both #123 and #124 are built around the existing tokenized-identity-vault pattern rather than
storing raw names > Let's update this > there is no reason to hide names for scheduling and punch
times > everyone can see this data as-is."*

This is a direct policy reversal from the owner, not a PM judgment call — dispatch #123 and #124
were built around the identity-vault tokenization pattern (right call for anonymized security
findings, where the whole point is restricting a name behind an audited reveal) because the
crew-schedule/punch-time work was scoped as PII-adjacent by default. The owner has now said
explicitly: this data does not need to be hidden. **Companion dispatch #126 covers the QSRSoft
punch-times side (PR #724, already merged). This dispatch is the LifeLenz schedule side only —
PR #725, still open, not yet merged.**

## What changes

Everywhere dispatch #123 routed a name through `identity-vault.js` (`getOrCreateToken`/
`tokenizeRows`) to produce an anonymous `emp_token`, replace it with storing the **raw resolved
name directly**. Concretely, in the merged-to-`worktree-agent-ac86066b2834348d0` state of PR #725:

1. **`scripts/lifelenz-pull.mjs`'s `upsertShiftAssignmentRows()`** — currently builds
   `emp_token: r.name ? (tokenMap.get(r.name.trim()) ?? null) : null` and never stores `r.name`
   itself. Change the `lifelenz_shift_assignments` row shape to store the resolved name directly
   (e.g. a new `employee_name text` column) instead of/in addition to `emp_token`. Keep
   `assigned_employment_id` as the stable join key (unrelated to this change — it was never a
   privacy mechanism, just an identifier). Drop the `tokenizeRows()`/`getOrCreateToken()` call for
   this pull entirely unless you find a reason to keep emp_token around too (state your reasoning
   either way — there's no wrong answer here, just document it).
2. **`supabase/schema-lifelenz-shift-assignments.sql`** — add the raw name column; the FK to
   `employee_identity_vault(id)` on `emp_token` can stay if you keep the column, or be dropped if
   you remove it. Update the table comment (it currently documents the tokenized-only design).
3. **`src/views/crew-schedule-panel.js`** — remove the click-to-reveal / `identity_reveal_log`
   gating (`RevealName`'s reused reveal-with-reason flow). Show the resolved name directly in
   search results and the shift list — no reveal step, no audit-log write for viewing a name here.
4. **RBAC re-decision.** PR #725 reused `securityPanelAccess()` (admin/supervisor always; manager
   only with `org_config.gm_identity_reveal_enabled`) specifically *because* the data was
   name-revealing. With names no longer hidden, that specific gate no longer has a reason to
   exist for this panel — a GM asking "who's on shift Tuesday" is normal ops data, not an identity
   investigation. Recommend switching to this app's ordinary panel-access pattern (role-appropriate
   nav visibility + `accessible_locs` RLS scoping, same as e.g. Labor Tools or Calendar Manager) —
   but this is a real decision, not a rubber stamp: think it through and state your reasoning in
   the PR, the same way the original PR did for its own RBAC call. If you land somewhere other
   than "normal panel RBAC," say why.
5. Update `memory/project-lifelenz-schedule-jobs.md` / any other memory file that describes this
   as tokenized, if one exists, so it doesn't read as stale the way several other entries in this
   repo have.

## Do NOT

- Do not touch dispatch #126 / PR #724's punch-times table or pull script — separate dispatch,
  separate PR, kept apart deliberately (same reasoning as the original #123/#124 split).
- Do not remove `assigned_employment_id` as a join key — it's the stable identifier, unrelated to
  the tokenization question.
- Do not silently drop RBAC entirely (i.e. do not make the panel visible with zero role check) —
  "don't hide names" is not the same instruction as "don't scope access to locations/roles at
  all." Every other operational panel in this app still has ordinary role/location scoping; this
  one should too, just not the identity-reveal-specific layer.

## Verification bar

- Grep the final diff and confirm no code path still calls `getOrCreateToken`/`tokenizeRows` for
  this pull, unless you deliberately kept it and explained why.
- Confirm the panel renders a name directly with no reveal click/step, for a synthetic
  multi-employee dataset.
- Confirm the RBAC re-decision is stated plainly with reasoning, mirroring how the original PR
  documented its own RBAC call.
- Full `npx vitest run` suite passing at the same or higher count as `main` (the 30 tests PR #725
  added will need updating — several were specifically testing the reveal-gate/tokenization
  behavior that no longer exists); `npm run build` clean; report before/after chunk size.
- Push the rework to the SAME branch (`worktree-agent-ac86066b2834348d0`) so it updates PR #725 in
  place, rather than opening a new PR.

## Verification note for the PM (independent-review pass, unchanged from #123's original bar)

Everything else in #123's original verification bar still applies once this rework lands: confirm
no raw name lands anywhere it shouldn't (this dispatch makes the *shift-assignment* table's name
column intentional and reviewed, not an accident — the bar is "was this a deliberate, scoped
change," not "zero name columns anywhere"), confirm `route:true` wiring is untouched, confirm
`DateRangeControl`/`LocationSelector` reuse is untouched.
