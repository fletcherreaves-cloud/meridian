# Ops Score attribution across #183 / #181 / #164 — a worked example

Requested by the PM review on PR #187: a four-column before/after (baseline · #183 · #181 ·
#164) so a store's Ops Score movement is attributable to a specific fix, not a black box.

**Caveat up front, stated plainly:** this sandbox has no authenticated Supabase session, so
there is no live per-store performance (`p`) data to run through the real `computeOpsScore`.
What follows is a **worked example with representative, synthetic performance numbers**,
computed by reconstructing each of the four stages' actual scoring formula (the pre-fix code,
reconstructed from git history, not guessed) and running the *same* input through all four. The
**targets** are real (`DEFAULT_TARGETS['43701']`, Ponce de Leon); the **performance** numbers are
illustrative, chosen to sit near each target so all three fixes' effects are visible in one
example rather than one metric drowning out the others. The owner should re-run this shape
against real `p` data once available — the mechanism below is exact, the specific store movement
is not.

## Fixture

Ponce de Leon 43701. Targets: `tOepe=210s, tKvst=80s, tKvsu=0.30, tPark=0.24, tTpph=4.8,
tLabor=0.26, tCrewLabor=0.24` — `tCrewLabor` here mirrors issue #164's real reported August
`monthly_targets.crew_labor_pct` figure (24.00% approved vs 26.00% graded), since
`DEFAULT_TARGETS` itself was never hand-updated to diverge — the divergence lives in live cloud
data this sandbox can't read.

Representative daily performance: `oepeWithPark=230s, oepeWoPark=210s (20s held/parked time),
park=28% (over target — a heavy parker, the exact shape #181's quadrant measured), kvst=75s,
kvsu=35%, tpph=5.0, laborPct=25.5%` (chosen between the two possible labor targets so the #164
fix visibly changes which tolerance tier it lands in).

## Result

| stage | Ops Score | what changed |
|---|---|---|
| **baseline** (pre-#183/#181/#164) | **80.0** | OEPE graded on 230s (includes park time) — misses the T1/T2 tiers, lands in the marginal T3 tier (6/15 pts). Park graded on the asymmetric band — full marks (9/9). Labor graded on `tLabor` (26%) — gap 0.5pp, within the 0.5pp T1 tolerance → full marks (9/9). |
| **+#183** (OEPE excludes park) | **95.0** | Same store, same performance — only the OEPE figure changes, from 230s to 210s (the park/held time subtracted). 210s now sits exactly AT target → full marks (15/15) instead of the marginal tier (6/15). **+15.0 points, the single largest movement of the three fixes**, and it's a correction (the store's real flow was always 210s; 230s was double-counting time the parking maneuver was already accounting for). |
| **+#181** (park removed from scoring) | **94.1** | Park was already scoring full marks (9/9) before removal, so removing it isn't erasing a penalty — it's shrinking `max` by 9 while `score` only shrinks by 9 too. Since every OTHER component isn't at 100%, the remaining components' proportional weight increases and the overall percentage moves slightly (**−0.9pts** here) even though nothing about the store's real performance changed. This is the self-normalizing redistribution described in the #181 commit — no separate redistribution code, but a real (small) score shift is an expected side effect for any store not scoring 100% everywhere else. |
| **+#164** (labor uses tCrewLabor) | **88.2** | Same 25.5% actual labor, but now compared against 24% (approved) instead of 26% (legacy) — the gap widens from 0.5pp (full marks, 9/9) to 1.5pp (partial credit, 6/9). **−5.9pts.** This is the correction #164 exists for: the store was being over-credited by the old, unapproved target. A store whose actual labor sits BELOW both targets, or ABOVE both, would see a smaller or zero movement from this fix — the size of the movement depends entirely on where the store's actual value falls relative to each target's tolerance tiers. |

## Reading this table

- The **direction** of each fix's effect is not predictable in general — #183 happened to help
  this store (its real flow was already good, the old metric was just miscounting park time
  against it); #164 happened to hurt this store (it was being flattered by an unapproved,
  looser target). A different store's numbers will move differently depending on where its own
  performance sits relative to each target.
- **#181's effect is structural, not corrective** — it doesn't change whether park itself was
  "good" or "bad" for this store (it was already full marks either way), it changes how much
  weight the OTHER five components carry now that there are five instead of six. Stores that
  were NOT at 100% on park will see a real, larger movement from this one specifically.
- The **script that produced these numbers** is not checked into the app (it deliberately
  duplicates the pre-fix formulas from git history to compute what they used to return — that
  duplication has no reason to exist once this table is written down). It lives at
  `/tmp/.../scratchpad/score-attribution.mjs` in this session's scratch directory and is not
  part of the repo; reproduce with the constants/logic in this file if verification is needed
  later.
