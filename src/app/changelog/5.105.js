// @ts-nocheck
export default {version:'5.105', date:'2026-08-22', changes:[
  'Dispatch #62 -- makes the register-type dimension #59 collected actually do something. #59 '
  + 'shipped the storage and the collection (Manager/Preparer, alongside the old Cashier-only '
  + "pull); this is the half that makes it visible. Verified by grep before touching anything: "
  + "register_type reached the app (supabase.js) but nothing branched on it -- a daily pull was "
  + 'collecting 49% more audit data than it did a week earlier and not one number on one screen '
  + 'had changed.\n\n'
  + "Step 0's own measurement decided the shape of this dispatch, per its own instruction not to "
  + 'skip it: a live service-role query against 7 days of audit_rows (2026-08-15 to 2026-08-22, '
  + 'all 27 stores) found 321 of 1,611 employee-days span MORE THAN ONE register type -- '
  + 'materially non-zero, not disjoint. That means analyzeRegisterAudit (src/utils/'
  + "register-audit.js), which correctly sums dollars/counts across register types per #59's own "
  + 'audit, was ALREADY blending Cashier/Manager/Preparer authority contexts together on the live '
  + "per-employee risk panel (Store Analytics -> Register Audit), with nothing on screen saying "
  + "so. Part A is therefore a correctness fix, not an enhancement, and shipped first.\n\n"
  + 'Part A: register type is now visible and filterable. analyzeRegisterAudit gained a '
  + "registerTypes field per employee (additive -- every existing total is untouched, reused via "
  + 'an extracted accumulate/finalize pipeline so the per-type breakdown below cannot drift from '
  + 'the combined numbers). A new registerTypeBreakdown() export computes a per-type split for '
  + 'any employee whose rows span more than one type, keyed loc::empToken -- never the raw '
  + 'employee name, preserving the identity-vault invariant (dispatch #37) for the breakdown too; '
  + 'employees with no token are excluded rather than risk merging two different real people '
  + "under the shared 'Unknown' id. The Register Audit panel gained a register-type filter pill "
  + '(All / Cashier / Manager / Preparer, shown only when more than one type is present -- a '
  + 'cashier-only store sees no new UI), a Register column showing a plain "Cashier" for '
  + 'single-type employees or a clickable "Blended (n)" badge for multi-type ones, and a one-line '
  + 'plain-language banner naming the decision ("split by type before flagging") per the '
  + 'voice-by-role standing rule -- not just a column only an analyst could interpret. Clicking '
  + '"Blended" expands a per-register-type split row beneath that employee.\n\n'
  + "Part B (making opportunity_factor a real engine input) is explicitly NOT shipped this "
  + 'dispatch, per its own instruction not to invent a threshold. The measured manager-register '
  + "sample is currently 7 days (406 manager rows, 439 preparer rows, 27 stores) -- far short of "
  + "this project's own bar for setting a threshold (the swing alarm's -10% came from 676 "
  + 'store-weeks). Recommendation, to save the next session a decision: the register-scoped rule '
  + "variant (a CASH-004 sibling whose population is manager-register rows only) over making "
  + 'opportunity_factor a real engine input -- cleaner blast radius, and the codebase already has '
  + 'a security-rules pattern for it. Either backfill first (QSRSOFT_AUDIT_START_DATE/END_DATE, '
  + 'standing authorization, not run this session -- no QSRSoft credentials in this sandbox, only '
  + 'in the scheduled Action) or let the daily pull accumulate a real distribution, then bring the '
  + 'number back for the owner to set. Full writeup: memory/dispatch-62.md.\n\n'
  + 'Revert-sensitive per the standing rule: the new register-audit-type-surface.test.js renders '
  + 'the ACTUAL RegisterAuditTab consumer (not just the engine functions in isolation) and was '
  + 'demonstrated to fail 4 of 5 assertions when the store-analytics.js UI wiring is reverted, '
  + 'then restored to green -- an engine-level test alone could not tell "computed" from '
  + '"computed but never wired into the panel." Cashier-only employees (the common case) render '
  + 'with zero new UI, confirmed by a dedicated test. 2016/2016 tests (11 new). Build clean, '
  + 'entry chunk +0.20 KB gzip (511.64 -> 511.84 KB) for a real net-new filter/breakdown UI, not '
  + 'a refactor.',
]};
