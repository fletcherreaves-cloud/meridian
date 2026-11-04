# The release bar — one checklist, not a feeling (2026-11-04)

Owner-requested standing framework: act with autonomy on inconsistency sweeps and ongoing
maintenance, but hold every change to a "would this pass C-level sign-off as a release
candidate" bar before calling it done. This file IS that bar. Every PR — sweep-originated or
not — clears every line below before it's mergeable. If it doesn't clear, it's not done, no
matter how much work went into it.

## The checklist

1. **Measured, not assumed.** The change was verified against the real running code/data, not
   reasoned from memory of how a file "probably" works (CLAUDE.md's own standing rule). A
   finding that triggered the change was reproduced before it was fixed.
2. **`npm run build` is clean.** No warnings treated as acceptable noise.
3. **Full suite green.** `npm test` — every test file, every test. Not "the file I touched."
4. **Eager-payload budget held.** The build's own budget-check output (entry + modulepreload
   chunks, gzip) stays under 850 KB. State both before/after numbers for anything that could move
   it (a new static import, a new panel not lazy-loaded).
5. **Panel contract, if a panel was touched.** `memory/panel-contract.md`'s close button,
   date-picker mode, `LocationSelector`, mobile horizontal-scroll, `route:true` fit — opportunistic
   per that file's own rule, not a forced sweep of every panel on every PR.
6. **Data sourced through the shared helpers.** `memory/data-sourcing-standard.md` — no raw
   `ds.laborRows`/`ctrlRows`/`opsRows` reads for a metric or vs-LY comparison in a panel.
7. **Changelog entry + regenerated latest pointer.** A real `src/app/changelog/<version>.js`
   file, `node scripts/gen-changelog-latest.mjs --write` run after.
8. **Every memory file this PR creates or edits is committed in the same commit** as the code
   that cites it. An uncommitted memory file is a dangling pointer the moment the session ends.
9. **No DDL.** Any real schema change is a named, deferred ask for the owner's own action in the
   Supabase SQL editor — never run by an agent session, never routed around with a workaround
   that avoids naming it.
10. **No PII exposure.** `ssn` never pulled/persisted/logged; `X-Auth-Token` never written to a
    file or commit; `SUPABASE_SERVICE_ROLE_KEY` never in a `VITE_`-prefixed var.
11. **Self-reviewed adversarially before being called mergeable.** Run `/code-review` (or an
    equivalent close read) against the diff as if someone else has to approve it. A review that
    surfaces a real finding means it's not a release candidate yet — fix it or justify it in the
    PR body, don't silently skip the step because the author (me) already "knows" the code is
    right.
12. **The PR body states what was verified**, not just what was built — exact test/file counts,
    the build budget numbers, and anything deliberately out of scope and why.

## What this is NOT

Not a gate that blocks shipping. It's the bar I hold my OWN work to before marking it done — the
same discipline "merge without asking, once verified" already assumes. Nothing here requires
asking the owner first; it requires not calling something finished until it's actually clean.

## Where this plugs in

- `memory/sweep-dimensions.md` — the rotating set of inconsistency sweeps that this bar gates the
  output of (every Tier-A/B fix from a sweep clears this checklist before it ships).
- CLAUDE.md's "Dev Rules" section — this file is the single consolidated version of rules that
  were previously scattered across several bullets there; CLAUDE.md now points here instead of
  restating the checklist inline.
