---
name: project-inventory-control-redesign
description: Design for consolidating the six inventory/food-cost panels into one shell driven by a shared context, with reports as an output mode rather than separate destinations. Owner design conversation 2026-08-11, decisions signed off. Read before touching any EOM/FOB/inventory surface.
metadata:
  type: project
  status: designed, not built
---

# Inventory Control — one shell, three output modes

Design settled with the owner on 2026-08-11 (Notes 65, second half). Nothing built yet.
Every decision carries an explicit owner answer.

Companion to `project-events-redesign.md` — same underlying move (many panels → one
context), same reason it works: the pattern already exists elsewhere in this codebase.

---

## 1. The problem, stated structurally

Six panels, each with its own period handling and its own data loads:

```
count-cycle-panel.js   eom-dashboard.js   eom-share-view.js
eom-supervisor.js      fob-eom.js         inventory.js
```

The owner's Notes 65 complaint was *"I still think we have some re-designing to do in here
to make more clear the periods."* That is the symptom. The cause is that **every panel
invents its own period semantics**, so there is no single answer to "what period am I
looking at."

The owner arrived at the fix himself:

> *"Why don't we standardize all views to work and behave the same?… I really like the
> District View style and layout and wonder if this (all of the Food cost, fob, inventory
> items) should be brought together into an environment similar in visual layout. Making use
> of shared resources that change function only when date and cycle (maybe class?) change."*

## 2. The precedent — this pattern is already proven here

**`above-store-onepager.js`** is exactly the proposed shape and it already works:

- Two shared selectors: `scope` (All / OK / FL / patch / store) and `period` (MTD / last week
  / last month)
- **Six composable sections** (Scheduling · Labor · FOB · Sales/GC · Controls · Voice) — the
  Notes 49 "build your own"
- Each section is a *view over the same context*; click one to drill into its metrics
- All reuse shared builders: `one-pager-data`, `metric-source`, `vs-ly`
- Print emits one section per enabled panel — same scope and period as the screen

**So this is not a new architecture.** It is applying an existing, working one to a second
domain. That is the single biggest de-risking factor and it should be stated in the PR.

## 3. The six panels are three different KINDS of thing

This is why the area felt tangled — all six were called "panels."

| Kind | Panel | Role |
|---|---|---|
| **Shell** | **EOM Dashboard** (= *Inventory Control Dashboard*, renamed) | the environment; the shared context lives here |
| **Report** | **EOM Supervisor** | owner: *"truly different… a recreation of a monthly reporting mechanism, but could be rolled into a report."* A **print artifact**, not a view |
| **Share** | **EOM Share View** | owner: *"a direct link to MBI for a manager to see EOM notes and act on them. A live link if you will."* **Different audience, outside the app** |

`fob-eom`, `inventory` and `count-cycle-panel` become **views inside the shell**.

## 4. The shared context

```
Shell context:   scope × period × class
Count views:     + week-start  (local only — see §5)
```

- **scope** — which stores. Same vocabulary as the one-pager: All / OK / FL / patch / store.
- **period** — date range.
- **class** — owner: *"Class is reference to Products (Raw) > Food, Condiment, Paper,
  Non Product, Op Supplies."* A grouping axis over items, playing the same role for items
  that `scope` plays for stores.

### ⚠ Build the shell GENERIC — it must host Labor too (owner-approved 2026-08-11)

**Decide this before writing the shell, not after.** Retrofitting a Food-Cost-specific shell
into a generic one is a rewrite.

The owner's economics make this non-optional:

> *"Food Cost and Labor are the 2 single largest line items in our P&L representing ~50% of
> all sales dollars… if I can improve labor by 0.25% - 0.50% or food cost by that or more,
> then I have 2 defined areas to coach and teach and push rather than nickeling and diming
> multiple other small fish."*

**Labor has the identical fragmentation problem this document diagnoses for inventory** —
`labor-tools`, `scheduling`, `labor-analysis`, LifeLenz surfaces, and Store VLH Config each
carry their own period logic, exactly like the six inventory panels in §3.

So build the shell as a **reusable environment** — `scope × period × class` + composable views
+ the three output modes of §7 — and **instantiate it twice: Food Cost and Labor.** Same
architecture, same report renderers, same heatmap, same dollarization.

That covers the full ~50% of P&L instead of half of it, for materially less than twice the
work. Owner: *"also extremely valid and it needs to be included in all of this so I agree with
your assessment."*

Implication for `class`: it is **domain-specific**, not universal. For Food Cost it is the
product classes above; for Labor it will be something else (position / daypart / crew vs
management — to be defined). Model the third axis as **a domain-supplied dimension**, not as a
hardcoded product-class list.

## 5. Week-start: Mon–Sun is LOCAL to count views. Do not globalise it.

The owner reviews on Mon–Sun and has for 30 years. Wed–Tue exists for one reason:

> *"The only reason we have Wed–Tue work weeks is to keep pay days from falling on weekends!"*

**The hazard that was raised and then designed out:** labor hours are *paid* Wed–Tue. Putting
Mon–Sun sales over Wed–Tue hours yields a labor % that is wrong and **does not look wrong** —
same family as the school "yin-yang" in `project-events-redesign.md`, where two windows appear
aligned and are not.

**DECISION (owner):** *"Leave the wed start day of week everywhere in the app. This is just a
preference for me reviewing weekly and daily counts only."*

So week-start is **a setting on the count-window component, not a shell axis.** Labor never
renders in a count view, so there is no cross-window ratio to get wrong — the hazard is
eliminated **by construction, not by discipline.** No labels, no "approximate" warnings.

This supersedes the Notes 65 leaning toward a Wednesday default with a Monday toggle; the
owner revised it once the reasoning was surfaced, and the revised version is better.

Residual rule, satisfied automatically: any ratio computed inside a count view uses the same
window on both sides. FOB % is Σ components ÷ Σ product sales from the same daily rows, so
this holds for free.

## 6. Snapshot dissolves — do not "fix" it

Notes 65 asked for Change Monitor's Snapshot to be made non-destructive, revertable, or
removed, because the owner would not click it: *"I just don't want the confusion or concern
that if I click it it will mess something up that can't be reverted."*

Owner, once the shell design was on the table:

> *"I can't think of why we need it once we have all of our backend rules set up properly. It
> should become irrelevant by allowing to pick date range and count cycle and letting that
> define the parameters of how this gets populated."*

**If the view is parameterised by date range + cycle, a "snapshot" is just setting the
parameters.** No button, nothing that writes, nothing to fear. Snapshot comes OUT of #192 and
is absorbed here.

## 7. Reports are an OUTPUT MODE, not a destination

The owner pushed back on filing EOM Supervisor as "a report": *"I actually like this logic, we
have other reports in these areas too though."* He is right, and the count is higher than it
looks.

**`eom-dashboard.js` alone has 22 print/export call sites**, launching six named artifacts —
none of which live in a report file:

```
FOB Report · FOB Leadership Summary · District EOM Summary
Count Reliability · Chronic Offenders · Rubber-band
```

Meanwhile the app *does* have dedicated report files elsewhere (`one-pager.js`,
`forms-library.js`, `forms-print.js`, `report-subscriptions.js`,
`visit-readiness-report.js`). Two conventions running at once.

The model:

```
        scope × period × class
                 │
    ┌────────────┼────────────┐
 SCREEN        PRINT        LINK
interactive   report      live share
  views      artifacts   (EOM Share View)
```

Every one of those six does the same thing: take the current context, render a print artifact.
Exactly what the one-pager already does.

## 8. Six reports → three templates (verified by reading all six)

| Template | Reports | Shape |
|---|---|---|
| **A. Ranked store report** | FOB Report (`:1467`), FOB Leadership Summary (`:1494`) | header → optional narrative → ranked store tables. Leadership is the same artifact with a narrative and a laggards/achievers split instead of the full roster |
| **B. Per-store item detail** | Count Reliability (`:1752`), Rubber-band (`:1777`), Chronic Offenders (`:1764`) | `<h1>store — grade</h1>` + item table, repeated per store. **Count Reliability and Rubber-band are structurally identical** — same `p[0] → p[last]` subhead, same `wrin / descr / cls / $` columns. Chronic is the same template with grouping **off** |
| **C. District KPI block** | District EOM Summary (`:1724`) | header → one rollup table |

EOM Supervisor becomes a fourth (monthly-shaped), or possibly a preset of C.

**The context is ALREADY shared.** All six call `scopeLabel()` and read the same `period`;
they only hand-roll their own HTML, with a copy-pasted header:

```
<h1>{Title} — {scopeLabel()}</h1>
<p class="sub">{period} · {count} · {note}</p>
```

So this is not "build a reports layer" — it is **three renderers replacing six hand-rolled
builders over a context that already exists.** Same argument that justified
`metric-source.js`: six copies drift, one does not.

Owner on approach: *"we need to verify and check. Worse case harvest and merge where
possible."* Follow the repo's standing convention — **harvest-then-remove, never
delete-on-sight.**

## 9. Two things that already exist (check before building)

- **`count-cycle-panel.js`** — the count-window display the owner likes. Notes 65 asked for
  *"something similar for Weekly."* It does not need building, it needs
  **cycle-parameterising**.
- **The shared context vocabulary** — `scope`/`period` selectors, `metric-source`, `vs-ly`,
  `one-pager-data` are all in place and used by the one-pager.

## 10. Free perf win

One shell = one data load. Today `eom-dashboard.js:1222` independently re-fetches all 13,190
`qsr_fob` rows on panel open — ~30 sequential 400-row pages, **~14 seconds** (#191), on top of
the copy startup already loaded into `ds.qsrFobRows`. Six panels each doing their own loads is
a large part of why this area feels slow.

## 11. Decisions log (owner, 2026-08-11)

| Question | Answer |
|---|---|
| Bring Food Cost / FOB / Inventory into one District-View-style environment? | **Yes** — owner proposed it |
| Class | **Food · Condiment · Paper · Non Product · Op Supplies** |
| EOM Supervisor | **Truly different — a report**, roll into the report layer |
| EOM Share View | **A live share link for GMs** — third output mode, not a panel |
| EOM Dashboard | **= Inventory Control Dashboard (renamed)** — this is the shell |
| Week start | **Wed stays global everywhere.** Mon–Sun is local to weekly/daily **count** views only |
| Change Monitor Snapshot | **Dissolved** — irrelevant once date range + cycle parameterise the view |
| Six reports | **Verify and check; harvest and merge where possible** |

## 12. Still open

- **Do the three templates hold under implementation?** §8 is from reading the builders, not
  from building them. Confirm before committing to three.
- **Where does EOM Supervisor's monthly shape land** — its own template or a preset of C?
- **Does `eom-share-view` need the full context**, or only the notes + a fixed period?
- **Sequencing vs #191.** The shell's single-load property overlaps the `qsr_fob` pagination
  work. Decide whether #191's `qsr_fob` slice waits for the shell or ships first — doing both
  independently risks one reverting the other.

## 13. Related

- `memory/project-events-redesign.md` — companion; same many-panels-to-one-context move
- #191 — startup waterfall, including the duplicate `qsr_fob` fetch in §10
- #192 — Notes 65 triage; Snapshot (§6) and the FOB Report false all-clear came from there
- `above-store-onepager.js` — the working precedent (§2). Read it before designing the shell
