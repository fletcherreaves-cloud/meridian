// @ts-nocheck
export default {version:'5.546', date:'2026-10-13', changes:[
  'Shift Manager Report -- fixed Healthy Usage 2nd Side silently diluting toward a false 0% for ' +
  'any manager whose shifts included records with no healthyUsePct value. Found live comparing ' +
  'the Shift Manager Report against the owner\'s own MCDOK Hourly Manager Review workbook ' +
  '(04/01/26-09/30/26): 249 of 691 live shift_manager_monthly rows read exactly 0% despite real ' +
  'transactions/OEPE/KVS data, concentrated almost entirely in a handful of stores (two stores ' +
  'at 97-100% of their rows, several others at 0%) -- the signature of qsrsoft-shift-manager-' +
  'pull.mjs\'s aggregate() averaging healthyUsePct over the SAME transaction-weight denominator ' +
  'used by oepe/r2p/kvs, which keeps accruing weight from records whose own healthyUsePct was ' +
  'null. healthyUsePct and oepeNoPark now each track their own weight sum (matching avgCheck\'s ' +
  'existing correct pattern) so a manager with partial healthyUsePct coverage reads the real ' +
  'average of the records that reported it, and a manager with NONE reads null ("no data") ' +
  'instead of a false 0%. Same bug class as #172 (cashOS) and this session\'s own ' +
  'parseDailyGlimpse fix, one level up the pipeline (cross-record aggregation, not field ' +
  'parsing). Go-forward only -- the owner\'s comparison window (Apr-Sep 2026) needs a backfill ' +
  're-pull per month to correct the already-stored history.',
]};
