// @ts-nocheck
export default {version:'5.305', date:'2026-09-01', changes:[
  'EOM Supervisor Rollup (Inventory Control hub -> Supervisor Rollup tab) -- fixed inconsistent ' +
  'decimal formatting in the "Op Supplies" column, reported by the owner from a screenshot: ' +
  'Projection showed $78,130 and Actual showed $72,261 (no decimals) while the +/- and $ Amount ' +
  'rows of the SAME column correctly showed 2 decimals (e.g. ($5,869.67)). Owner\'s rule, ' +
  'verbatim: "make target format to 2 decimals please. All dollars and percents should always ' +
  'show 2 decimals for reference."',
  'Root cause (src/views/eom-supervisor.js EOMBlock): every other money cell in this table ' +
  '(Product Net Sales, the +/- row, the $ Amount row) already goes through a formatter with ' +
  '{minimumFractionDigits:2, maximumFractionDigits:2}. Only the Op Supplies Projection cell and ' +
  'the Actual cell\'s print-mode branch instead did `\'$\' + Math.round(v).toLocaleString()` -- ' +
  'Math.round strips to whole dollars and a bare toLocaleString() defaults to 0 decimals.',
  'Fix: both cells now route through the same local `salesStr` helper every other dollar cell in ' +
  'this table already uses -- two call sites, no new formatter. All of eom-supervisor.js\'s money/ ' +
  'percent helpers (fmtD/fmtMoney/fmtPct/salesStr/pctStr/varMoneyStr/varPctStr) are local to this ' +
  'file, not shared with any other panel, so this is scoped to the Supervisor Rollup table only -- ' +
  'no other panel\'s formatting is affected. Swept the rest of the table\'s render for the same ' +
  '`Math.round(...).toLocaleString()`/bare-toFixed pattern: the header\'s "$XXXK actual" chip and ' +
  'OT Hours are deliberately left as-is (a compact thousands-abbreviated glance chip and a plain ' +
  'hours figure, neither is "dollars formatted without decimals" -- forcing 2 decimals onto the ' +
  '$XXXK chip would read as false precision, e.g. "$81.23K"); "X.XX% P&L impact" was already ' +
  'correct.',
  'New src/__tests__/eom-supervisor-formatting-and-fob-flag.test.js renders the REAL ' +
  'EOMSupervisorPanel (not an isolated formatter) via its rollup block, which the component ' +
  'always renders with forPrint:true -- exercising both the always-on Projection cell and the ' +
  'forPrint-gated Actual cell without needing window.print(). Asserts the exact rendered cell ' +
  'text ($78,130.40 / $72,261.35 in the fixture), which fails if the fix is reverted. Full suite ' +
  'passes (one pre-existing failure in shell-nav-snapshot.test.js is unrelated -- caused by a ' +
  'concurrent session\'s in-progress nav changes in this shared workspace, confirmed by ' +
  'reproducing it with this fix stashed out), build clean.',
]};
