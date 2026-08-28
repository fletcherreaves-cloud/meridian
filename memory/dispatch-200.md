# Dispatch #200 — Store Analytics (District View store dashboard): three fixes in one area

## Context — owner-reported live, three related items in the same file, batched to avoid a
## same-file collision between engineers

All three items below were raised live by the owner in this session while looking at
`src/views/store-analytics.js`'s District View drill-down (a specific store's tab strip:
Overview / Forecast / Register Audit / Records / etc.). They're batched into one dispatch — not
three — specifically because they all touch `store-analytics.js`, and this session has twice hit
real merge bugs (duplicate imports, silently-combined edits) from independent engineers editing
the same shared file concurrently. One engineer, one PR, three clearly separated task groups
below.

## Task Group A — Location Intelligence renders as a modal instead of inline tab content

Owner, with a screenshot: *"Intelligence inside the district view store dashboard needs to be
converted to on page like the rest of the tabs. it is currently popping up as a separate rendered
panel."*

**Root cause, confirmed by reading the code:**
- `src/views/store-analytics.js:2397` already invokes the component correctly as an inline tab:
  `tab==='intelligence'&&h(LocationIntelligence,{store,allStores,ds,settings,scope:'store',onClose:()=>setTab('overview')})`.
- The bug is inside `LocationIntelligence` itself (`src/features/location-intel.js:364`). Its
  outermost element, unconditionally, is
  `div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,...}}, ...)`
  (line 437) — a full-screen hand-rolled backdrop with no mode check. So even when called intending
  inline tab content, it always paints itself as a modal on top of everything.
- `LocationIntelligence` is used TWO ways and both must keep working: (1) `store-analytics.js`'s
  inline tab (`scope:'store'`, the broken case), (2) `App.js`'s global "Market Intelligence" nav
  panel (`showLocIntel`, registry id `loc-intel`, `scope:'district'`, `App.js:3337`) — this one is
  correctly a full-screen modal today (standalone sidebar destination) and must stay that way.

**Fix:** add an explicit `embedded` prop (e.g. `embedded:true` from `store-analytics.js`'s call
site, defaulting to standalone/modal behavior when absent so `App.js`'s call site needs no
changes) — don't infer the mode from `scope`, which is a separate, legitimate concept (store vs.
district data scope). When `embedded`, render the same content without the outer
`position:'fixed',inset:0,background:rgba(0,0,0,.82)` backdrop and without its own close button
(the host tab strip already has its own way back). Check what the unwrapped content actually looks
like — it may need its own scroll container or width constraint the backdrop wrapper was
implicitly providing; don't assume removing the div is zero-side-effect.

**Verification:** Store Analytics' Intelligence tab renders inline, no backdrop, no double chrome,
switching feels the same as switching to any other tab in that strip. The global "Market
Intelligence" sidebar panel is visually/functionally unchanged. Include a screenshot or clear
before/after description in the PR body — this is a visual bug.

## Task Group B — Register Audit: stop hiding employee names

Owner: *"on the Register Audit tab, no need to hide the employee names here. anyone with access to
register audit on qsrsoft can see names anyway."*

**This is a real architecture change, not a UI-only toggle — scope it properly before writing
code, don't copy dispatch #125's Crew Schedule pattern mechanically.** Confirmed by reading the
code: Register Audit uses a genuine server-side identity vault (dispatch #37/#38), NOT the same
shape as Crew Schedule/Time Punches' un-tokenization. Specifics:

- `src/utils/register-audit.js`'s `analyzeRegisterAudit()` returns employee objects carrying only
  `e.id` (a token, e.g. `empToken`) — by design, "blind mode default, not a data gap" per its own
  comments. The real name is genuinely NOT present client-side.
- `src/views/store-analytics.js`'s `RevealName` component (~line 1167) is the ONLY place that
  resolves a token to a name: a required click, a required typed reason, logged server-side via a
  `reveal_employee_identity()` Supabase RPC. Used across `RegisterAuditNarrative`,
  `RegisterAuditTab`'s table rows, and a `namesList` helper — grep `RevealName` for every call
  site, there are several in this file alone.
- Compare this against how Crew Schedule (dispatch #125) and Time Punches (dispatch #126) were
  un-tokenized: read `memory/dispatch-125.md`/`memory/dispatch-126.md` if they still exist, or the
  merged PRs' diffs, to confirm whether those data sources ever went through an
  RPC-backed/logged reveal step at all, or whether they simply displayed already-present raw
  names behind a UI gate. If Register Audit's underlying data genuinely never carries a raw name
  (only the token), un-tokenizing it means either (a) the parser/pull path needs to start storing
  the real name alongside the audit row instead of only the token, or (b) the display can call the
  reveal RPC automatically/eagerly instead of gating it behind a click+reason+log — these are
  different levels of change with different implications (b keeps the server-side audit-log trail
  of every reveal, a loses it entirely). **State clearly in the PR which approach you took and
  why**, since this table's design (required reason, server-side logging) suggests it may have
  been built for a legitimate loss-prevention/investigation audit-trail reason, not just an
  arbitrary privacy gate — if you find evidence the reveal-logging serves a real purpose beyond
  simple access control (e.g. an existing consumer of the reveal log, a compliance-shaped table
  name), flag that explicitly in the PR rather than silently deleting the whole mechanism.
- Simplest, most conservative fix that satisfies the owner's actual ask ("no need to hide the
  names") while preserving the underlying audit trail if it has independent value: make
  `RevealName` resolve and display the name automatically on render (no click, no reason prompt)
  while still calling the same `reveal_employee_identity` RPC under the hood so any real logging
  value is preserved — check whether the RPC accepts a non-interactive/default reason or whether
  it needs a small server-side change too (out of reach for a client-only PR if so — flag it rather
  than blocking on it). If the RPC's own logging turns out to serve no purpose (e.g. nothing reads
  `identity_reveal_log` anywhere else in the codebase — check), removing the gate entirely and
  rendering the name straight from data (if register-audit's data layer can be widened to carry it)
  is the cleaner long-term fix — your call, but state which you picked and why.

**Verification:** Register Audit tab shows employee names directly, no click-to-reveal friction,
across every place `RevealName` is currently used in this file. State in the PR body exactly which
of the approaches above you took and why.

## Task Group C — merge Store Analytics' "Records" tab with the main-menu "Record Days" panel

Owner: *"why don't we merge the records tab in there with the results from the records panel on
the main menu. It would provide an even more robust records experience for each location in
district view."*

**Confirmed by reading both:**
- `StoreRecordsTab` (`store-analytics.js:2402`, `tab==='records'`) is the current per-store
  Records tab — reads `ds.records[loc]` (Excel-uploaded, one value per record category, ~8
  categories: DT Sales, DT Transactions, KVS Sandwiches, KVS Time, OEPE, R2P, Total Sales, Total
  Transactions), no week/month/day-of-week breakdown.
- `src/views/record-day.js` (registry id `record-day`, label "Record Days", `kind:'optional'`,
  main sidebar) is a much richer, 1283-line panel: computes records from real daily data (not just
  an Excel upload) across day/week/month granularities and day-of-week splits, cross-store
  sortable comparison table, `LocationSelector`/date scoping.
- The owner's framing ("more robust... for each location") suggests the per-store tab should gain
  Record Day's real depth, not that Record Days retires wholesale — Record Days' cross-store
  comparison table is a genuinely different use case (compare all stores at once) from a
  single-store drill-down tab, so a full retire-one-survivor merge may not fit here the way it did
  for e.g. Count Cycle → Inventory Control. Read both fully and use your judgment on the right
  shape: options include (a) `StoreRecordsTab` calling the same underlying record-computation
  engine `record-day.js` uses (if it's separable into a reusable function) scoped to the one
  selected store, so the tab gains week/month/DOW depth without needing the full cross-store UI;
  (b) something else you find reading the code that serves "more robust per-location records" better.
  State your reasoning and chosen shape clearly in the PR body — this one has more legitimate
  design latitude than a mechanical merge, unlike Task Groups A and B above.
- If you extract a shared computation engine, do NOT change `record-day.js`'s own existing
  cross-store panel behavior — it stays live and unchanged at the main-menu level.

**Verification:** Store Analytics' Records tab, for the currently-selected store, shows materially
richer record data than it does today (name the specific new fields/breakdowns in the PR body).
`record-day.js`'s own standalone panel is confirmed unchanged.

## Cross-cutting verification (all three groups)

- Read the actual current code for anything referenced above before changing it — this doc's own
  file/line pointers were correct as of when it was written, but re-confirm, per this repo's
  standing "measure it, don't reason about it" rule.
- Standard suite + build. Version bump — re-check `origin/main`'s current highest changelog version
  immediately before committing (several dispatches have landed on `main` concurrently this
  session; do not trust any number implied by this doc or prior context).
- Panel-registry/nav-snapshot tests updated if Task Group C changes any registry entry.

## Out of scope

- Task Group A: any change to Location Intelligence's actual content (KPIs, growth roadmap, AI
  narrative, correlations) — chrome/wrapping fix only.
- Task Group B: re-litigating whether register-audit data SHOULD be sensitive in general — the
  owner has made the call ("no need to hide... anyone with access... can see names anyway"); your
  job is finding the right mechanical way to implement that call, including flagging (not
  deciding) if you find the reveal-log serves a purpose beyond display-gating.
- Task Group C: changing `record-day.js`'s own cross-store UI/behavior.
- Dispatch #198's separate hand-rolled-backdrop cleanup (`eom-dashboard.js`) — different file, no
  overlap, don't combine.
