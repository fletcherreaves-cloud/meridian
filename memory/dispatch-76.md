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

---

## Resolution (2026-08-23)

**Measured, not guessed — a third outcome the dispatch's two branches didn't quite name.**

Ran the prescribed measurement, but widened it from "one group" to **every** colliding group in a
real 27-store/1-day pull (2026-08-22), because the first single-group sample (byte-identical) was
too small to generalize from given how much this thread has already cost in confident-wrong
diagnoses. 612 groups collided that day.

**1. The noLocation hypothesis is REFUTED.** Checked `location` across every sampled colliding
row (117 differing groups + the identical ones) — never once `noLocation`. Every collision is two
or three rows sharing the SAME real store NSN. `LOCATIONS = [...STORE_NSNS, 'noLocation']` is not
the cause; not touched.

**2. 65% (398/612) are byte-identical true duplicates.** Dedup was already correct for these —
no data lost, order doesn't matter, collapsing is a pure win.

**3. The real finding, in the other 35%: the KEY is right, but the OLD SELECTION RULE was not.**
Of 117 differing groups sampled in full, 14 (~12%) carry a genuine conflict — not a "distinct
occurrence" in the sense of two different real-world events (the dispatch's second branch), but
the SAME scheduled occurrence (identical loc/formId/scheduledAt) reported by the API as one or two
stale `MISSED` role-group placeholders (`missed:true`, no `completedBy`/`userId`/`startedAt`/
`completedOn`) **alongside** one genuine completion row (`missed:false`, `hasResponse:true`, a
real `completedBy`/`userId`/`startedAt`/`completedOn`/`timeToComplete`). Example, real data:

```
row[0] missed:true,  completedBy:"--",              scheduledAt:"2026-08-22T11:00:00Z"
row[1] missed:true,  completedBy:"--",              scheduledAt:"2026-08-22T11:00:00Z"
row[2] missed:false, completedBy:"austin cheyenne",  scheduledAt:"2026-08-22T11:00:00.000Z" (same instant)
```

`dedupeByConflictKey`'s old rule was **"last one kept"** — a plain `Map` overwrite in whatever
order the API's array happened to return the rows. In all 14 measured cases the completed row
was last, so production data for this window is (by luck) already correct — but nothing in the
code guaranteed that ordering. A future response-order change, or a different form/window, could
silently discard a real completion in favour of a stale miss with **zero error thrown** — the same
failure shape dispatch #71 was about one layer in: a green-looking run quietly holding wrong data.

**Neither of the dispatch's two prescribed outcomes fits cleanly.** "True duplicates, reword the
log" is right for 65% of collisions but wrong for the 14 that carry a real status conflict.
"Distinct occurrences, widen the key" is wrong outright — the key correctly says these rows are
the same occurrence; they are. What was missing was a deterministic **choice** among them.

### Fix

`dedupeByConflictKey` now ranks colliding rows by outcome instead of array position: a genuine
completion (`has_response === true`) always outranks a `missed`/`open` row for the same
occurrence key. Ties — the common case, either true duplicates or two stale placeholders with no
completion anywhere — still keep the last one, matching the exact prior tie-break behaviour, so
all 4 of dispatch #71's original tests pass **unchanged** under the new logic.

The collapse log line is **reworded, not deleted**, per the dispatch's own explicit instruction —
it now states what the collapse resolves (completed status always kept over a stale duplicate)
rather than a bare, alarming count with no explanation.

### Verification

- 5 new tests pin the fix at every array position — completion first, middle, last — plus the
  no-completion tie-break case, built from the real captured shape (not synthetic guesses at what
  the API might return).
- **Revert-sensitive, confirmed by measurement**: stashed the fix and re-ran the suite. The
  FIRST- and MIDDLE-position tests failed exactly as predicted (the stale `missed` row survived
  instead of the completion); the LAST-position and tie-break tests still passed, matching the old
  code's "correct by luck" cases. Restored and re-confirmed green.
- **Live re-pull after the fix**: re-ran the real (non-debug) pull over the entire currently-covered
  window (2026-08-19 → 2026-08-23) with the corrected dedup, to guarantee every already-stored row
  now reflects the deterministic rule rather than accidental API ordering — the closest equivalent
  to the dispatch's "backfill after fixing" instruction, scoped to a selection-rule fix rather than
  a key change.

### Does the panel's completion percent move?

**No, not from this fix** — production data for the measured window already had the completed
rows landed correctly (the lucky ordering held). What changes is that this is now **guaranteed**
rather than **coincidental**. Saying so plainly per the dispatch's own instruction: the numbers
shown to date were not wrong, but they were unverified-correct rather than verified-correct, and
now they're the latter.

### What this means for the original ~52% collapse rate

**Still real, still expected, and no longer alarming without explanation.** The ratio is high
because Travel Path alone schedules 27-45×/store/day and the API's own response duplicates a
meaningful share of occurrences (mostly harmless exact copies, occasionally a stale-miss-plus-real-
completion pair) — not because real occurrences are being lost from the denominator. The finding
file's "4,714 rows = one row per scheduled occurrence" description does not hold at face value;
the raw feed itself already contains the duplication this dispatch measured.

5 new tests in `qsrsoft-forms-completion-pull.test.js` (14/14 passing in that file), full suite
and build clean (see commit body for exact counts). No table constraint change, no key widening,
no backfill beyond the routine re-pull already described above.
