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
export const STREAMS = [
  { key: 'dar',         label: 'DAR (QSRSoft daily activity)', dsField: 'qsrActSummaryRows', cadenceDays: 1 },
  { key: 'fob',          label: 'FOB',                          dsField: 'qsrFobRows',        cadenceDays: 1 },
  { key: 'glimpse',      label: 'Daily Glimpse (email)',        dsField: 'glimpseRows',       cadenceDays: 1 },
  { key: 'cashSheet',    label: 'Cash Sheet (email)',           dsField: 'cashRows',          cadenceDays: 1 },
  { key: 'salesLedger',  label: 'Sales Ledger (email)',         dsField: 'salesLedgerRows',   cadenceDays: 1 },
  { key: 'opsCash',      label: 'Ops Cash Sheet',               dsField: 'opsCashRows',       cadenceDays: 1 },
  { key: 'opsLabor',     label: 'Ops Labor Summary',            dsField: 'opsLaborRows',      cadenceDays: 1 },
  { key: 'opsService',   label: 'Ops Service Stats',            dsField: 'opsServiceRows',    cadenceDays: 1 },
  { key: 'opsSalesMix',  label: 'Ops Sales Mix',                dsField: 'opsSalesMixRows',   cadenceDays: 1 },
  // LifeLenz publishes a FORWARD schedule too, so an unfiltered max reads as "fresh"
  // right through an outage — the exact skew that got it dropped from the old pooled
  // array entirely rather than fixed. _latestDateOf clamps every stream to <=asOf, which
  // is the fix for that: filter it in, don't drop it.
  { key: 'lifelenz',     label: 'LifeLenz labor/schedule',      dsField: 'schedRows',         cadenceDays: 1 },
  // lifelenz_attendance_summary rows are keyed by period_end, which advances by one day per
  // daily pull run -- checkable the same way as every other daily stream above, via its
  // `date` field. See scripts/lifelenz-attendance-pull.mjs / supabase/schema-lifelenz-
  // attendance.sql (2026-09-06).
  { key: 'lifelenzAttendance', label: 'LifeLenz Attendance',    dsField: 'lifelenzAttendanceRows', cadenceDays: 1 },
  // Closed 2026-09-13 -- previously a documented gap (memory/backlog-open-2026-09-06.md):
  // QSRSoft Inventory Summary Pull runs daily and is already watched in
  // sync-failure-watch.yml, but the table was fetched panel-locally by InventoryIntelligence
  // only, never loaded into ds at startup like every other STREAMS entry. ds.qsrInventorySummaryRows
  // is now populated by a dedicated lightweight freshness probe (App.js's
  // _stInventorySummaryFreshness / supabase.js's loadQsrInventorySummaryFreshness) -- a single
  // {date} row, not the full ~10.5k-row table, since this check only needs the newest sync time.
  { key: 'inventorySummary', label: 'Inventory Summary/Usage',  dsField: 'qsrInventorySummaryRows', cadenceDays: 1 },
  // ── Added 2026-09-16 (coverage audit) — 8 streams already eager-loaded into ds and consumed
  // by a live panel (Performance Reviews' auto-populate, One Pager, At-A-Glance's forecast) but
  // never covered here. Confirmed via a dedicated agent pass before adding, per this file's own
  // standing pattern of citing why each entry is safe to check, not just that a workflow exists.
  { key: 'ebos', label: 'eBOS Purchases', dsField: 'ebosRows', cadenceDays: 1 },
  // Derived precompute artifact (computed FROM already-covered streams like labor/DAR), not a
  // raw external pull -- "stale" here means a stale forecast cache, still a real thing to catch
  // (At-A-Glance's weekProjections uses it as the PRIMARY current-week source, falling back to
  // live forecastDay() only when missing/incomplete).
  { key: 'forecastWeekCache', label: 'Forecast Week Cache', dsField: 'forecastWeekCache', cadenceDays: 1 },
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
  { key: 'rosterStats', label: 'Roster Statistics', dsField: 'rosterStatsRows', dateField: 'month', cadenceDays: 31 },
  { key: 'rosterRoleCounts', label: 'Employee Roster', dsField: 'rosterRoleCounts', dateField: 'month', cadenceDays: 31 },
  { key: 'turnover', label: 'Turnover', dsField: 'turnoverRows', dateField: 'month', cadenceDays: 31 },
  { key: 'digitalApp', label: 'Digital App', dsField: 'digitalAppRows', dateField: 'month', cadenceDays: 31 },
  { key: 'mcdelivery', label: 'McDelivery', dsField: 'mcdeliveryRows', dateField: 'month', cadenceDays: 31 },
  { key: 'shiftManager', label: 'Shift Manager', dsField: 'shiftManagerRows', dateField: 'month', cadenceDays: 31 },
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
