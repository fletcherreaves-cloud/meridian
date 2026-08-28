// @ts-nocheck
export default {version:'5.241', date:'2026-08-28', changes:[
  'Dispatch #200 -- three fixes in Store Analytics\' District View drill-down, batched into one ' +
  'PR to avoid a same-file collision (all three touch src/views/store-analytics.js).\n\n' +
  'Task Group A -- Location Intelligence rendered as a full-screen modal even when opened as an ' +
  'inline tab. Root cause: src/features/location-intel.js\'s LocationIntelligence always painted ' +
  'its own position:fixed/inset:0/rgba(0,0,0,.82) backdrop, with no mode check, regardless of ' +
  'caller. Added an `embedded` prop (default false/standalone, so App.js\'s "Market Intelligence" ' +
  'global nav panel -- the other, correctly-modal caller -- needs no changes at all); when true ' +
  'the component renders the same header + body inside a plain bordered card (no backdrop, no ' +
  'spacer-click-to-close div, no ✕ button -- the host tab strip already has its own way back) ' +
  'instead of the fixed-position wrapper. store-analytics.js\'s call site now passes ' +
  '`embedded:true`. Before: opening the Intelligence tab from a store\'s District View drill-down ' +
  'popped a dark full-screen overlay on top of the page, with its own close button, breaking the ' +
  'tab-switching feel of every other tab in that strip. After: it renders inline, same padding/' +
  'scroll behavior as Overview/Forecast/etc., switching tabs feels identical across the whole ' +
  'strip. ratchet-modal-backdrop-bypass.test.js stays at its existing ceiling unchanged -- the ' +
  'backdrop line still exists (App.js\'s standalone caller still needs it), just gated behind ' +
  '`embedded?card:...` on the same line, so the regex-based ratchet still counts it once.\n\n' +
  'Task Group B -- Register Audit stopped hiding employee names, per live owner direction: "no ' +
  'need to hide the employee names here. anyone with access to register audit on qsrsoft can see ' +
  'names anyway." Investigated before writing code, per the dispatch\'s own instruction not to ' +
  'copy dispatch #125\'s Crew Schedule un-tokenization pattern mechanically: measured that ' +
  'audit_rows.emp (the plaintext name) was ALREADY present, unredacted, on every row this app ' +
  'loads into ds.auditRows -- loadAuditRows() (src/lib/supabase.js) has always mapped it straight ' +
  'through as `emp`, additive alongside emp_token since dispatch #37/5.076. So ' +
  'analyzeRegisterAudit() (src/utils/register-audit.js) was discarding a name the browser already ' +
  'had, and the click/required-reason/reveal_employee_identity()-RPC/identity_reveal_log gate ' +
  '(dispatch #37/#38\'s RevealName) was withholding the name from RENDERING only, never from this ' +
  'app\'s own already-loaded client state -- unlike Crew Schedule\'s original shape, no parser/' +
  'pull-path change or RPC change was needed. Fix: newAccumulator() now carries `empName:r.emp` ' +
  '(identical across a group\'s rows already, since r.emp is literally part of the grouping key); ' +
  'store-analytics.js\'s RegisterAuditTab/RegisterAuditNarrative render `e.empName` directly in ' +
  'all four table sections and all narrative paragraphs, no click/prompt/RPC. Also checked ' +
  'whether identity_reveal_log serves a purpose beyond display-gating for THIS surface: grepped ' +
  'the full repo for any reader of that table -- none exists anywhere in-app (write-only, ' +
  '"evidence-grade" per the owner\'s 2026-08-20 decision, per its own schema comment) -- so ' +
  'removing Register Audit\'s reveal step doesn\'t silence a consumed audit trail. RevealName ' +
  'itself is UNCHANGED and stays load-bearing: security-panel.js still imports and calls it for ' +
  'Security Findings, whose underlying data genuinely has no raw name alongside the token (a ' +
  'different shape from audit_rows), so its reveal-with-reason/logging is a real confidentiality ' +
  'boundary there, not a redundant one -- explicitly out of this dispatch\'s scope, confirmed ' +
  'unaffected (security-panel.test.js: 101/101 still passing). Tests: register-audit-identity.test.js ' +
  'and register-audit-breakdown.test.js updated (both previously asserted "never exposes a ' +
  'plaintext name," now the opposite, by design); register-audit-tab-reveal.test.js rewritten to ' +
  'assert the new direct-render behavior (name visible immediately, zero RPC calls, zero prompts) ' +
  'instead of the removed click-through flow, same "render the actual consumer" bar dispatch #38\'s ' +
  'original version used.\n\n' +
  'Task Group C -- merged the per-store "Records" tab (StoreRecordsTab) with the richer main-menu ' +
  '"Record Days" panel (src/views/record-day.js), per: "why don\'t we merge the records tab in ' +
  'there with the results from the records panel on the main menu. It would provide an even more ' +
  'robust records experience for each location in district view." Read both fully before choosing ' +
  'a shape (this dispatch left real design latitude here, unlike A/B above). record-day.js\'s own ' +
  'React components (HeroGrid, SalesVolumeTab, DOWTab, SpeedTab, RecentBreakersTab, TopDaysTab) ' +
  'are all built around a cross-store SORTABLE TABLE -- one row per store, click-to-sort by column ' +
  '-- the wrong shape for a single-store drill-down tab; they also turned out to style themselves ' +
  'entirely through CSS custom properties (--txt/--txt2/--txt3/--acc/--rm/--rs) that are never ' +
  'DEFINED anywhere in meridian.css, a real pre-existing bug discovered while reading the file, ' +
  'left unfixed per the dispatch\'s own "do not change record-day.js\'s cross-store UI/behavior" ' +
  'instruction (flagged here rather than silently reused). Chosen shape: StoreRecordsTab now ' +
  'reuses ONLY the pure computation -- computeRecords()/scopeRecordData(data,[loc]), both newly ' +
  'exported, UNCHANGED (matches dispatch #136 Part 2\'s own "do not touch computeRecords()\'s ' +
  'scoring logic beyond location filtering" precedent) -- plus its plain-string formatters ' +
  '(fDate/fWeekLabel/fMonthLabel/fSec/fGC/f$2/DOW_SHORT, also newly exported), then renders a ' +
  'fresh, single-store-shaped view in store-analytics.js\'s own established card/table idiom (the ' +
  'same one LocationIntelligence/RegisterAuditTab already use) rather than any of record-day.js\'s ' +
  'own components. The two record sources are DELIBERATELY KEPT SEPARATE, not collapsed into one ' +
  'number per metric: the Excel-uploaded "Records - Total Day - Sun-Sat - Total.xlsx" section ' +
  '(unchanged) can carry history predating this app\'s daily cloud streams -- silently overwriting ' +
  'it with the live engine\'s number would regress a store whose real all-time best predates ' +
  'Meridian\'s own data. The live section is purely ADDITIVE depth, computed from data already ' +
  'loaded (computeRecords() sources through metricSeries(), this app\'s auto-first shared helper), ' +
  'no upload required: Best Day/Week/Month Sales, Best Day GC, Best Avg Check, Best Breakfast ' +
  'Sales, Best OEPE/KVS/R2P (speed, lower=better), a full Day-of-Week Bests table (7 rows, sales ' +
  'and GC), a Recent Record Breaks table scoped to this one store with the same 30/60/90/180-day ' +
  'window selector the main panel has, and a Top Days table (this store\'s own top 10, not the ' +
  'district\'s). record-day.js\'s own main-menu "Record Days" panel is unchanged -- still live, ' +
  'still the cross-store comparison view, confirmed by its existing tests passing unmodified ' +
  '(dispatch-130-record-day-export.test.js, dispatch-103-record-day-provisional.test.js). No ' +
  'panel-registry.js change (StoreRecordsTab is not a registry entry), so shell-nav-snapshot.test.js ' +
  'needed no re-capture. New test: dispatch-200-store-records-merge.test.js renders the ACTUAL ' +
  'StoreRecordsTab consumer (mocking metric-source.js the same way dispatch #103\'s own record-day ' +
  'test does), proving week/month/day-of-week/speed records render from daily data with no ' +
  'upload, that the Excel and live sections both render together (additive, not replaced), the ' +
  'empty-state fallback when neither source has data, and that the window selector re-scopes to ' +
  'this one store.\n\n' +
  'Cross-cutting: full vitest suite + build clean (counts/budget in the PR body). No changes to ' +
  'panel-registry.js, so no nav-snapshot recapture needed for any of the three groups. Version ' +
  'bumped 5.238 -> 5.239 (5.238 landed concurrently on origin/main by dispatch #197\'s merge, #908 ' +
  '-- re-checked fresh immediately before this commit per the standing "several dispatches landing ' +
  'concurrently this session" instruction, not trusted from any prior number in context).',
]}
