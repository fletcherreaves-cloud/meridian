# Dispatch #76 — the Forms pull discards ~52% of every batch. Establish whether that is correct.

**Status:** ready to start. **One measurement first — do not change the key until it returns.**
**Reads:** `memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md`, `memory/dispatch-71.md`.

---

## What the successful run shows

Dispatch #71's fix works — run `32597560943` saved **2,993 rows across 27/27 stores**, and the
panel populates. That part is genuinely fixed, verified from the log rather than the exit code.

But the same log says this, twice:

```
[forms-completion] 2482 row(s) shared a (loc, formId, occurrenceKey) with another row
                   in the same batch -- collapsed, last one kept
[forms-completion] 2026-08-19..2026-08-21: 4720 row(s) -> 2238 saved
[forms-completion] 826 row(s) ... collapsed
[forms-completion] 2026-08-22..2026-08-22: 1581 row(s) ->  755 saved
```

| chunk | raw | saved | dropped | ratio |
|---|---|---|---|---|
| 08-19..08-21 | 4,720 | 2,238 | **52.6%** | 2.109 |
| 08-22 | 1,581 | 755 | **52.2%** | 2.094 |

## 🔴 Why this needs answering before anything is built on the table

`memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md` measured the **same 3-day window**
at **4,714 rows**, describes the payload as *"one row per scheduled occurrence"*, and gives the
status split `3,886 MISSED + 599 open + 229 completed = 4,714`.

The pull sees 4,720 for that window — the same data. **It stores 2,238 of them.**

If those 4,714 really are distinct occurrences, then **2,476 scheduled occurrences never reach
Supabase**, and the owner's original ask — *"how many forms completed vs missed per day per store …
completion percent"* — is being computed on half the denominator.

📌 **The ratio is the tell.** 2.109 and 2.094 across two independently-sized chunks is a near-exact
**doubling**. Real-world schedule collisions vary; a stable 2.1× looks systematic. The existing
in-code rationale — *"Travel Path alone is scheduled 27-45x/store/day, so two distinct API rows
landing on the same (loc, formId, occurrenceKey) is a real, expected collision"* — explains *some*
collisions, but it does not explain a **constant** rate, and distinct occurrences of a form
scheduled 27-45×/day should carry **distinct `scheduledAt` values** and therefore not collide at
all.

⚠️ **That rationale may still be right.** It was written against live data and this dispatch is
reasoning from a log. **Do not rewrite the key on my suspicion** — this thread has already cost
several confident-and-wrong diagnoses. Measure first.

## The measurement (do this, and only this, first)

With `QSRSOFT_FORMS_COMPLETION_DEBUG=1` on a single small window, take **one** `(loc, formId,
occurrenceKey)` group that has more than one row and **dump the full raw rows in that group side by
side.** Then:

- **Rows identical on every field** → true duplicates. The dedup is correct, the log line is just
  alarming, and the right fix is to reword it. Close the dispatch.
- **Rows differ** on `status` / `completedBy` / `userId` / `startedAt` / `completedOn` → they are
  **distinct occurrences or distinct submissions** and the conflict key is wrong. Then, and only
  then, widen it.

📌 One specific hypothesis worth checking in the same dump, because it would explain a clean 2×:
the request sends `locations: [...27 NSNs, 'noLocation']`. **If a row is returned once under its
own location and once under `noLocation`, every occurrence appears exactly twice.** Compare the
`location` field across the group — if it differs, that is the answer and the fix is in the
request, not the key.

## If the key is wrong

- Widen the conflict target to whatever actually distinguishes the rows, and **change the table
  constraint to match** — a wider key in the script alone will not stop Postgres collapsing them.
- ⚠️ **Backfill after fixing.** Every row pulled to date went through the narrow key, so the table
  is already missing the dropped occurrences. The pull takes a date range
  (`QSRSOFT_FORMS_COMPLETION_START_DATE`/`END_DATE`), so re-pulling the covered window is routine.
- Re-check the panel's completion percentages before and after. **If they move, the numbers shown
  to date were wrong** — say so plainly rather than quietly correcting them.

## Do NOT

- ⚠️ **Do not delete or soften the collapse log line.** It is the only reason this was findable.
  If the collisions turn out to be legitimate, make the message say *why* they are expected and
  keep the count.
- ⚠️ **Do not treat "the panel populates" as proof the data is right.** It populated with half the
  rows and looked entirely healthy — that is exactly the failure mode #71 was about, one level in.

## Verification bar

Whichever way it resolves, the artifact is a **measurement written down**: the dumped group, and
the conclusion drawn from it. If the key changes, a test must assert that two rows differing only
in the newly-added key field both survive an upsert — an assertion on row *count* alone would pass
with the wrong pair collapsed.
