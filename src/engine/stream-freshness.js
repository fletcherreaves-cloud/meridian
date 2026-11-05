// @ts-nocheck
// ── Per-stream data freshness (#171) ─────────────────────────────────────────
// at-a-glance.js pooled every auto-synced feed into one array and took Math.max of the
// dates, so a staleness alert fired only when EVERY stream was stale at once. Two real
// outages proved this invisible for days: lifelenz_schedules dark 6 days (Aug 6-11,
// surfaced when someone noticed stale labor data) and sales_ledger_daily dark 5 days
// (Aug 12-16, surfaced only while debugging an unrelated blank tile, #346). #171's own
// body (written Aug 11) named sales_ledger_daily as the NEXT victim of the exact same
// pooling gap — it went dark five days later and nothing said a word.
//
// This module checks EACH stream independently and reports the worst one BY NAME, so
// "LifeLenz labor data is 6 days old" replaces a hardcoded "QSRSoft auto-sync may be
// down" that was already wrong (the array spans manual uploads and two email pipelines,
// not just QSRSoft).
//
// Streams enumerated from the LOADERS (App.js's setDs call sites), not from #171's own
// table — that table is stale by its own admission. As of this writing App.js has ALSO
// gained opsSalesMixRows/opsCashRows/opsLaborRows/opsServiceRows since #171 was filed.
// qsr_onhand (loadQsrOnHand) is pulled daily too but still has zero call sites in App.js —
// it can't be freshness-checked from ds until that wiring lands, so it stays out of STREAMS
// below rather than being silently assumed fresh. qsr_product_mix (loadPmixRows) IS now
// wired into ds (dispatch17/#292), but as a LAZY_FILL_SOURCES entry (metric-source.js) —
// ds.pmixRows stays absent until a consumer calls ensureLazyFill('pmixRows'), same as
// auditRows/wasteRows above. That's why it's not in STREAMS either: this function already
// treats "field absent from ds" as "not loaded this session, no verdict" rather than an
// incident (see streamFreshness()'s Array.isArray guard below), which is the correct
// reading for a source that's lazy by design, not a gap to close here.
//
// qsrSalesQtrHourRows (Record Hour's quarter-hour stream) IS the exception -- added
// 2026-10-13 specifically so scheduled-pull-watchdog.mjs can retrigger its cron (checkStream
// requires a STREAMS entry; see scheduled-pull-registry.mjs's own comment on why the two
// stay in lockstep). This is SAFE for the client checklist too, not just tolerated: traced
// metric-source.js's lazy-fill setter directly -- ds[src] is never initialized to `[]`, it
// stays `undefined` until the loader resolves, so streamFreshness()'s own Array.isArray
// guard already skips this stream with "no verdict" for every session that hasn't opened
// Record Hour, exactly like pmixRows/auditRows/wasteRows would if they were added. The
// original note on THIS entry (pre-2026-10-13) claimed adding it "would misread every user
// who hasn't opened Record Hour as a stale/broken stream" -- that was never actually true of
// the guard above; it was an unverified extrapolation from the pmixRows precedent, not a
// measurement. Corrected here rather than left to mislead the next read.
//
// Manual `laborRows` is deliberately EXCLUDED — under the auto-first rule (CLAUDE.md)
// and #362, a stale device-local upload making the app look healthy is exactly
// backwards. A manual upload can mask staleness; it must never mask it FOR ITS OWN sake.
// opsPeaksRows is excluded too — #347/#345 dropped its eager load (zero consumers), so
// it's no longer in ds to check.

/** Grace beyond a stream's own cadence before it's flagged. Tuned to the owner's own
 *  framing ("a daily stream silent 2 days is an incident") — NOT the old hardcoded 14. */
export const WARN_GRACE_DAYS = 1;
export const CRIT_GRACE_DAYS = 3;

// key/label/dsField drive the check; cadenceDays sets the per-stream threshold — every
// current stream here is pulled daily (see CLAUDE.md's workflow table), but the shape
// supports a slower stream without borrowing a daily one's threshold, which is exactly
// the bug: a hardcoded 14-day window that was too loose for daily streams AND (had a
// slower stream ever been added) too tight for one paced weeks apart.
// `group` (added task #94, 2026-11-05) — the one place a stream's high-level category lives,
// so At-A-Glance's "Loaded Data" strip (groupFreshness() below) can summarize by category
// without a second, hand-maintained array mapping to drift out of sync the way the strip's own
// pre-existing 5-bucket union did (missing ~15 of these streams entirely, and masking a dead
// stream behind a fresh sibling within the same bucket — see groupFreshness()'s own header).
// Adding a new STREAMS entry should set a real `group`, not leave it undefined — an ungrouped
// stream is invisible to the strip, same silent-gap failure mode this field exists to close.
export const STREAMS = [
  { key: 'dar',         label: 'DAR (QSRSoft daily activity)', dsField: 'qsrActSummaryRows', cadenceDays: 1, group: 'sales' },
  { key: 'fob',          label: 'FOB',                          dsField: 'qsrFobRows',        cadenceDays: 1, group: 'foodcost' },
  { key: 'glimpse',      label: 'Daily Glimpse (email)',        dsField: 'glimpseRows',       cadenceDays: 1, group: 'service' },
  { key: 'cashSheet',    label: 'Cash Sheet (email)',           dsField: 'cashRows',          cadenceDays: 1, group: 'controls' },
  { key: 'salesLedger',  label: 'Sales Ledger (email)',         dsField: 'salesLedgerRows',   cadenceDays: 1, group: 'sales' },
  { key: 'opsCash',      label: 'Ops Cash Sheet',               dsField: 'opsCashRows',       cadenceDays: 1, group: 'controls' },
  { key: 'opsLabor',     label: 'Ops Labor Summary',            dsField: 'opsLaborRows',      cadenceDays: 1, group: 'scheduling' },
  { key: 'opsService',   label: 'Ops Service Stats',            dsField: 'opsServiceRows',    cadenceDays: 1, group: 'service' },
  { key: 'opsSalesMix',  label: 'Ops Sales Mix',                dsField: 'opsSalesMixRows',   cadenceDays: 1, group: 'sales' },
  // LifeLenz publishes a FORWARD schedule too, so an unfiltered max reads as "fresh"
  // right through an outage — the exact skew that got it dropped from the old pooled
  // array entirely rather than fixed. _latestDateOf clamps every stream to <=asOf, which
  // is the fix for that: filter it in, don't drop it.
  { key: 'lifelenz',     label: 'LifeLenz labor/schedule',      dsField: 'schedRows',         cadenceDays: 1, group: 'scheduling' },
  // lifelenz_attendance_summary rows are keyed by period_end, which advances by one day per
  // daily pull run -- checkable the same way as every other daily stream above, via its
  // `date` field. See scripts/lifelenz-attendance-pull.mjs / supabase/schema-lifelenz-
  // attendance.sql (2026-09-06).
  { key: 'lifelenzAttendance', label: 'LifeLenz Attendance',    dsField: 'lifelenzAttendanceRows', cadenceDays: 1, group: 'people' },
  // New Data Explorer "Schedule Variance" pull (2026-11-01) -- rows key on `occurredAt`
  // (camelCased from occurred_at), not 'date', hence the dateField override. A store with
  // zero edits in the pull window legitimately has no new rows that day, same as every other
  // event-log-shaped stream here -- staleDays reads off the MOST RECENT edit across all
  // stores, not a per-store completeness check.
  { key: 'scheduleVariance', label: 'LifeLenz Schedule Variance', dsField: 'scheduleVarianceRows', dateField: 'occurredAt', cadenceDays: 1, group: 'scheduling' },
  { key: 'complianceAudit', label: 'LifeLenz Compliance Audit', dsField: 'complianceAuditRows', dateField: 'shiftDate', cadenceDays: 1, group: 'people' },
  { key: 'employeePerformance', label: 'LifeLenz Employee Performance', dsField: 'employeePerformanceRows', dateField: 'periodEnd', cadenceDays: 1, group: 'people' },
  // ⚠️ LifeLenz Payroll Readiness (task #85, 2026-11-04) is DELIBERATELY NOT added to this
  // array yet. This file's own standing invariant test (stream-freshness.test.js's "thresholds
  // are per-stream cadence + grace, not the old hardcoded 14 days") requires cadenceDays to be
  // exactly 1 (daily) unless dateField==='month' (cadenceDays 31) -- a strict binary with no
  // middle tier. Payroll Readiness posts bi-weekly (~14-16 days), which fits neither bucket
  // correctly: cadenceDays:1 would false-alarm "critical" on every normal pay-period gap (a real
  // bug, not a test-passing nuisance), and cadenceDays:31/dateField:'month' doesn't match this
  // stream's real per-row date shape either. Rather than force a wrong value into a real
  // operational alert or loosen this invariant test unilaterally (outside this task's scope,
  // and the kind of change that deserves the owner's own call), the entry is left out until
  // either a third cadence tier is added here deliberately, or the real posting cadence is
  // confirmed live and this gets revisited. ds.payrollReadinessRows is still loaded at startup
  // (App.js) so a future freshness entry (or any other consumer) has real data to read.
  //   { key: 'payrollReadiness', label: 'LifeLenz Payroll Readiness', dsField: 'payrollReadinessRows', dateField: 'payPeriodStart', cadenceDays: 16 },
  // Closed 2026-09-13 -- previously a documented gap (memory/backlog-open-2026-09-06.md):
  // QSRSoft Inventory Summary Pull runs daily and is already watched in
  // sync-failure-watch.yml, but the table was fetched panel-locally by InventoryIntelligence
  // only, never loaded into ds at startup like every other STREAMS entry. ds.qsrInventorySummaryRows
  // is now populated by a dedicated lightweight freshness probe (App.js's
  // _stInventorySummaryFreshness / supabase.js's loadQsrInventorySummaryFreshness) -- a single
  // {date} row, not the full ~10.5k-row table, since this check only needs the newest sync time.
  { key: 'inventorySummary', label: 'Inventory Summary/Usage',  dsField: 'qsrInventorySummaryRows', cadenceDays: 1, group: 'foodcost' },
  // ── Added 2026-09-16 (coverage audit) — 8 streams already eager-loaded into ds and consumed
  // by a live panel (Performance Reviews' auto-populate, One Pager, At-A-Glance's forecast) but
  // never covered here. Confirmed via a dedicated agent pass before adding, per this file's own
  // standing pattern of citing why each entry is safe to check, not just that a workflow exists.
  { key: 'ebos', label: 'eBOS Purchases', dsField: 'ebosRows', cadenceDays: 1, group: 'foodcost' },
  // Derived precompute artifact (computed FROM already-covered streams like labor/DAR), not a
  // raw external pull -- "stale" here means a stale forecast cache, still a real thing to catch
  // (At-A-Glance's weekProjections uses it as the PRIMARY current-week source, falling back to
  // live forecastDay() only when missing/incomplete).
  { key: 'forecastWeekCache', label: 'Forecast Week Cache', dsField: 'forecastWeekCache', cadenceDays: 1, group: 'sales' },
  // The 6 "monthly" Performance-Review streams below all pull DAILY (workflows run on a daily
  // cron) but the pulled row is keyed by `month` ('YYYY-MM', from the DB's period_month column),
  // not a daily date -- new Date('2026-08') parses as that month's 1st. A daily-cadence
  // threshold against a value that only CHANGES once a month would false-alarm every single day
  // after the month's first ~4 days, even while the underlying daily pull is running fine and
  // refreshing that same row's other fields -- the exact trap the coverage audit flagged.
  // cadenceDays:31 means this only fires if the month value itself hasn't rolled over across a
  // full month boundary, i.e. the pull has been dead long enough to miss an entire period, not
  // "hasn't updated today" (which this row shape can't distinguish from "updated today, same
  // month as yesterday"). A coarser, monthly-grained signal, not a daily one -- correct for what
  // these rows actually are.
  { key: 'rosterStats', label: 'Roster Statistics', dsField: 'rosterStatsRows', dateField: 'month', cadenceDays: 31, group: 'people' },
  { key: 'rosterRoleCounts', label: 'Employee Roster', dsField: 'rosterRoleCounts', dateField: 'month', cadenceDays: 31, group: 'people' },
  { key: 'turnover', label: 'Turnover', dsField: 'turnoverRows', dateField: 'month', cadenceDays: 31, group: 'people' },
  { key: 'digitalApp', label: 'Digital App', dsField: 'digitalAppRows', dateField: 'month', cadenceDays: 31, group: 'sales' },
  { key: 'mcdelivery', label: 'McDelivery', dsField: 'mcdeliveryRows', dateField: 'month', cadenceDays: 31, group: 'sales' },
  { key: 'shiftManager', label: 'Shift Manager', dsField: 'shiftManagerRows', dateField: 'month', cadenceDays: 31, group: 'scheduling' },
  // Added 2026-10-13 so scheduled-pull-watchdog.mjs can cover this cron -- see this file's
  // own comment above (near the pmixRows/auditRows/wasteRows exclusion note) for why this
  // is safe for the client checklist too. dateField defaults to 'date', which already
  // matches loadQsrSalesQuarterHour's row shape (src/lib/supabase.js) -- no override needed.
  { key: 'qsrSalesQtrHour', label: 'Record Hour (Quarter-Hour Sales)', dsField: 'qsrSalesQtrHourRows', cadenceDays: 1, group: 'sales' },
];

// Display metadata for groupFreshness() -- icon/label per group, in the strip's render order.
// 'people' is new (2026-11-05): the LifeLenz HR-adjacent streams (attendance, compliance audit,
// employee performance, roster/turnover) never fit Sales/Scheduling/Service/Controls/FOB
// cleanly, and forcing them into one of those would just recreate the "doesn't actually belong
// here" problem the strip existed to fix.
export const GROUPS = [
  { key: 'sales',      label: 'Sales',      icon: '💰' },
  { key: 'scheduling',  label: 'Scheduling', icon: '📅' },
  { key: 'service',     label: 'Service',    icon: '⚡' },
  { key: 'controls',    label: 'Controls',   icon: '🔒' },
  { key: 'foodcost',    label: 'FOB',        icon: '🍟' },
  { key: 'people',      label: 'People',     icon: '👥' },
];

const _toMs = d => {
  if (d == null) return NaN;
  const ms = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return ms;
};

/** Latest date in `rows` that is <= asOf (ms), or null if none. `dateField` defaults to
 *  'date' -- override for a stream whose rows carry a different field (e.g. 'month' for
 *  the roster/turnover/digital-app family below, which key by a 'YYYY-MM' period_month
 *  rather than a daily date; new Date('2026-08') parses fine as the first of that month). */
function _latestDateOf(rows, asOfMs, dateField = 'date') {
  let best = null;
  for (const r of rows || []) {
    const ms = _toMs(r && r[dateField]);
    if (isNaN(ms) || ms > asOfMs) continue;
    if (best === null || ms > best) best = ms;
  }
  return best === null ? null : new Date(best);
}

/**
 * Per-stream freshness as of `asOf` (Date, defaults to now).
 * Returns one entry per STREAMS row: { key, label, latestDate, staleDays, severity }.
 *   severity: 'ok' | 'warn' | 'crit'
 *   staleDays: Infinity when the stream has never resolved a date in `ds` at all —
 *              distinguished from "ds[dsField] isn't loaded yet" by only counting a
 *              stream that HAS an array present (even if every row's date is unusable);
 *              a field that's simply absent from ds (not yet loaded this session) is
 *              skipped, not reported as an incident.
 */
export function streamFreshness(ds, asOf = new Date()) {
  const asOfMs = asOf.getTime();
  const out = [];
  for (const s of STREAMS) {
    const rows = ds ? ds[s.dsField] : undefined;
    if (!Array.isArray(rows)) continue; // not loaded into ds this session — no verdict
    const latestDate = _latestDateOf(rows, asOfMs, s.dateField);
    const staleDays = latestDate ? Math.floor((asOfMs - latestDate.getTime()) / 864e5) : Infinity;
    const warnAt = s.cadenceDays + WARN_GRACE_DAYS;
    const critAt = s.cadenceDays + CRIT_GRACE_DAYS;
    const severity = staleDays > critAt ? 'crit' : staleDays > warnAt ? 'warn' : 'ok';
    out.push({ key: s.key, label: s.label, latestDate, staleDays, severity });
  }
  return out;
}

const _SEV_RANK = { crit: 2, warn: 1, ok: 0 };

/**
 * The single worst stream, or null if every loaded stream is 'ok' (or none are loaded
 * yet — same as the old code's "no data" being a separate, already-handled case).
 * Ties broken by staleDays (most stale first), then by STREAMS order.
 */
export function worstStream(ds, asOf = new Date()) {
  const all = streamFreshness(ds, asOf);
  let worst = null;
  for (const s of all) {
    if (s.severity === 'ok') continue;
    if (!worst || _SEV_RANK[s.severity] > _SEV_RANK[worst.severity] ||
        (_SEV_RANK[s.severity] === _SEV_RANK[worst.severity] && s.staleDays > worst.staleDays)) {
      worst = s;
    }
  }
  return worst;
}

// Normalize a row's loc the same way every other cross-stream store count in this app does --
// a zero-padded "0003708" and bare "3708" must count as one store, not two.
const _normLoc = (loc) => { const n = parseInt(loc, 10); return isNaN(n) ? String(loc) : String(n); };

/**
 * One entry per GROUPS category that has at least one loaded stream, driving At-A-Glance's
 * "Loaded Data" strip (task #94, 2026-11-05). Replaces that strip's own pre-existing 5-bucket
 * hand union of raw ds arrays, which had two real bugs: (1) ~15 of the streams above were never
 * represented in ANY bucket at all (everything added since the strip was first built), and (2)
 * unioning several streams' rows into one date range let a fresh sibling hide a dead stream
 * within the same bucket -- the exact #171 pooling bug this file's own STREAMS-level check
 * already exists to prevent, just reintroduced one layer up. Driving the strip off this
 * function instead means every STREAMS entry (present and future, as long as it's given a
 * `group`) is automatically covered, and a stale stream's severity survives being grouped with
 * fresher siblings -- `worstSeverity` is the WORST of the group's members, never masked by one
 * good one, while `minDate`/`maxDate`/`rowCount`/`storeCount` still describe the union (the
 * useful "what's actually in here" info the old strip showed), computed once here instead of
 * copy-pasted into the view.
 *
 * Returns: { group, label, icon, minDate, maxDate, rowCount, storeCount, worstSeverity }[].
 * A group with no loaded stream this session is omitted entirely (same "not yet loaded, no
 * verdict" reading streamFreshness() itself uses) rather than rendered as a false "Not loaded"
 * for a stream nobody has opened yet.
 */
export function groupFreshness(ds, asOf = new Date()) {
  const perStream = new Map(streamFreshness(ds, asOf).map(s => [s.key, s]));
  const out = [];
  for (const g of GROUPS) {
    const members = STREAMS.filter(s => s.group === g.key);
    let minMs = null, maxMs = null, rowCount = 0;
    const locs = new Set();
    let worstSeverity = null;
    let anyLoaded = false;
    for (const s of members) {
      const rows = ds ? ds[s.dsField] : undefined;
      if (!Array.isArray(rows)) continue;
      anyLoaded = true;
      rowCount += rows.length;
      const dateField = s.dateField || 'date';
      for (const r of rows) {
        const ms = _toMs(r && r[dateField]);
        if (!isNaN(ms)) {
          if (minMs === null || ms < minMs) minMs = ms;
          if (maxMs === null || ms > maxMs) maxMs = ms;
        }
        if (r && r.loc != null) locs.add(_normLoc(r.loc));
      }
      const sev = perStream.get(s.key)?.severity;
      if (sev && (!worstSeverity || _SEV_RANK[sev] > _SEV_RANK[worstSeverity])) worstSeverity = sev;
    }
    if (!anyLoaded) continue;
    out.push({
      group: g.key, label: g.label, icon: g.icon,
      minDate: minMs !== null ? new Date(minMs) : null,
      maxDate: maxMs !== null ? new Date(maxMs) : null,
      rowCount, storeCount: locs.size, worstSeverity: worstSeverity || 'ok',
    });
  }
  return out;
}
