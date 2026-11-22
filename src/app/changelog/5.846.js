// @ts-nocheck
export default {version:'5.846', date:'2026-11-22', changes:[
  '**Egress Phase 1.5: the 9 LifeLenz Data Explorer / HME / Squadle startup stages now join the ' +
  'OPFS cache-first-render pattern.** Found while scoping Wave 1 delta-sync (task #190): none of ' +
  '`_stLifelenzJobHours`/`_stLifelenzAttendance`/`_stScheduleVariance`/`_stComplianceAudit`/ ' +
  '`_stEmployeePerformance`/`_stPayrollReadiness`/`_stLifelenzDar`/`_stHmeDt`/`_stSquadle` wrote ' +
  'back to the device-local OPFS snapshot at all — every login rendered these panels blank until ' +
  'the live Supabase fetch landed, the same "blank until the network call lands" gap sched/ ' +
  'qsrActSummaryRows/salesLedgerRows already closed in their own pilots (#1-3). Now each stage ' +
  'writes its freshly-fetched rows into the same OPFS blob via `opfsSave()`, and ' +
  '`performFullIDBRestore()` renders last session\'s cached rows immediately on login, before the ' +
  'live T2 fetch even starts. ' +
  '**Deliberately NOT routed through the shared `strip()`/`toRow()` pair every other cached ' +
  'stream uses:** `strip()` assumes a row\'s `date` is either a Date instance or safe to re-derive ' +
  'via `new Date(date)` + LOCAL Y/M/D components — but `lifelenzAttendanceRows.date` is a plain ' +
  '"YYYY-MM-DD" STRING (`period_end`), and feeding a plain date string through `new Date(date)` ' +
  'parses it as UTC midnight; reading local calendar components back off that shifts the day by ' +
  'one in any negative-UTC-offset timezone (America/Chicago included — the exact trap ' +
  '`src/utils/date.js`\'s own `dKey()` header comment warns about). Checked every one of the 9 ' +
  'loaders\' real return shapes in `src/lib/supabase.js` before writing any caching code: 7 of ' +
  'the 9 streams (jobHours/lifelenzAttendance/scheduleVariance/complianceAudit/ ' +
  'employeePerformance/payrollReadiness/lifelenzDar) carry NO Date-OBJECT field at all and cache ' +
  'byte-for-byte; `hmeDt`/`squadle` do carry real Date objects (plus `hmeDt`\'s own `pulledAt`) ' +
  'and get a dedicated reconstruction on read, mirroring the existing `qsrAct`/`refreshedAt` ' +
  'wrapper pilot #2 already built for the same reason. OPFS format bumped to v7 (additive-only — ' +
  'a reader on an older cached file just gets `[]` for the 9 new fields). The two daily-aggregate ' +
  'derived views (`scheduleVarianceDailyRows`/`complianceAuditDailyRows`/`lifelenzDarDailyRows`) ' +
  'are recomputed from the cached RAW rows at restore time (cheap pure functions, already ' +
  'imported) rather than cached twice. 7 new tests ' +
  '(`dispatch-egress-phase1.5-lifelenz-opfs-cache-2026-11-22.test.js`), including a direct check ' +
  'that `lifelenzAttendance.date` round-trips as the exact same string (never silently promoted ' +
  'to a Date or shifted a day) and that `hmeDt`/`squadle` restore real Date objects — verified to ' +
  'catch a reverted `hmeDt` reconstruction before shipping. See ' +
  '`memory/plan-egress-reduction-2026-11-20.md` Section 16. Full suite + build both clean.',
]};
