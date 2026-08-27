# Dispatch #177 — EOM diagnosis: implement (or honestly close out) the "Purchases — invoices posted" check

## Owner context (2026-08-27, EOM inventory-count audit, count starts Sat 2026-08-29)

Item #1 from a PM-run audit of pending EOM/inventory items, owner-approved to fix before Saturday.
`src/engine/eom-diagnosis.js`: `{ id:'purchases-posted', label:'Purchases — all invoices posted
(none pending)', order:60, enabled:true, requires:['purchases'], pending:true, run:()=>[] }` — a
registered stub that always returns zero findings. This is step 4 of the owner's own documented
EOM diagnosis flow: *"Verify all invoices are POSTED and nothing is PENDING. Unposted/pending
invoices cause easy-to-fix swings. Rare, but must be verified every time."*
(`memory/project-eom-diagnosis-flow.md`, §4).

**This is genuinely NOT wired to any risk of false confidence today** — confirmed by reading
`runDiagnosis()`: a check with `pending:true` is excluded from the normal run path entirely and
instead surfaced explicitly as "awaiting data" (`eom-diagnosis.js` ~line 727,
`if (!haveData || c.pending) { pending.push(...) }`), shown in both the EOM Dashboard's check list
("(awaiting data)" label, `eom-dashboard.js` ~line 3697) and the report footer ("_Checks awaiting
data: ..._", `eom-diagnosis.js` ~line 1340). So today it honestly tells the owner this check isn't
live — it does not silently report "all clear." Keep that honest-failure behavior if you end up
NOT shipping a real check (see "if the data isn't there" below) — do not flip `pending` to `false`
without the check actually being able to detect something.

## What's actually missing — this needs investigation, not just wiring

Unlike dispatch #176 (a pure wiring bug), **no pulled table currently carries a posted/pending
status per invoice.** Measured live before writing this dispatch:
- `qsr_ebos_daily` (the eBOS purchases pull, `scripts/qsrsoft-ebos-pull.mjs`) only carries
  aggregated daily dollar totals (`food_purchases`, `paper_purchases`, `ops_purchases`,
  `hm_purchases`, `other_purchases`) — no per-invoice rows, no status field.
- `qsr_raw_item_detail` (the per-WRIN forensic ledger, `scripts/qsrsoft-variance-pull.mjs`) carries
  a `history[]` array with `source:'invoice'` entries (invoice number, qty, date) but no visible
  posted/pending indicator in a sampled live row.
- `memory/project-eom-diagnosis-flow.md`'s own original research (§4, table at line ~199) already
  flagged this exact gap: *"✅ have `qsr_ebos_daily`; add posted/pending status check"* — i.e. it
  assumed the STATUS piece specifically would need new capture work, which never happened. This is
  not new information, it's confirming a month-old known gap is still open.

## Task — investigate first, in this order

1. Check whether the EXISTING eBOS Playwright auth session (already working in
   `scripts/qsrsoft-ebos-pull.mjs`, hitting `prod.ebos.qsrsoft.com/api/inv/{nsn}/purchase/
   store_ledger`) returns a posted/pending field in its RAW response that the pull script is
   simply discarding on the way to `qsr_ebos_daily`'s aggregated shape. This is the cheapest,
   lowest-risk possibility — check the raw API response shape directly (capture one real response,
   don't guess from the current mapped/aggregated columns) before assuming new endpoint discovery
   is needed.
2. If not there: check `qsrsoft_kb` (public-read Supabase table, `title`/`body_text` columns) for
   any article describing an eBOS "Purchases" or "Invoices" page's posted/pending status, the way
   earlier dispatches this session found KB articles for "Menu Items - Recipes" and "Inventory
   Usage." If a lead surfaces, check whether it's reachable from the SAME auth session the eBOS
   pull already establishes (same domain, same token) — if so this may be a same-shape addition to
   the existing pull, not a new auth path.
3. If a real, low-risk, well-understood data source is found with time to spare before Saturday:
   wire it in and implement the check for real (flip `pending:false`, remove the `run:()=>[]`
   stub, write real detection logic — e.g. flag invoices whose status reads pending/unposted as of
   `asOf`).
4. **If no viable data source is found, or the remaining time before Saturday doesn't allow a safe,
   tested change to a financial-verification check:** do NOT force it. Leave `pending:true` as-is
   (it already fails safe, per above) and write up what you found — what you checked, why it's not
   there yet, and what a real dispatch to close this would need. This is an acceptable, honest
   outcome, matching this session's own established pattern (dispatches #172/#173/#175's
   investigation-first posture) — a stub that HONESTLY says "awaiting data" is safer than a rushed
   check that might miss a real pending invoice two days before a physical count.

## Verification (only if a real fix ships)

- A test proving the check flags a store with a genuinely pending/unposted invoice in the fixture
  data, and does NOT flag a store where everything is posted.
- Confirm `pending` correctly flips to `false` and the check disappears from the "awaiting data"
  UI/report footer once it has real logic.
- Standard suite + build.

## Out of scope

- The `fob-components` check (separate dispatch, #176 — different, already-diagnosed root cause).
- Any other `pending:true` check in `DEFAULT_CHECKS` if you find more while reading this file —
  flag them in your write-up but don't fix them here, this dispatch is `purchases-posted` only.
