#!/usr/bin/env node
// scripts/lifelenz-attendance-pull.mjs — LifeLenz Time & Attendance rollup pull.
//
// Replaces src/views/scheduling.js's hand-transcribed TA_DATA (frozen since Jun 2026, no live
// source -- see that file's own header comment). Report-name slug found live via
// scripts/lifelenz-ta-probe.mjs (2026-09-06, memory/backlog-open-2026-09-06.md §3):
// `attendance_report`, a per-EMPLOYEE CSV export -- confirmed real shape:
//
//   Row 0 (metadata): "","","","",Store,<storeNumber>
//   Row 1 (header):   NAME,SCHEDULED SHIFT #,ACCEPTED SHIFT #,PICK UP #,EXCUSED ABSENCE #,
//                      EXCUSED ABSENCE %,UNEXCUSED ABSENCE #,UNEXCUSED ABSENCE %,
//                      UNFILLED SHIFT #,UNFILLED SHIFT %,LATE SHIFT START #,LATE SHIFT START %,
//                      EARLY SHIFT START #,EARLY SHIFT START %,DROPPED #,DROPPED %,
//                      SWAPPED #,SWAPPED %
//   Row 2+ (data):    one row per employee on that schedule, e.g.
//                      "Adrian Martinez,1,1,0,0,0.0%,0,0.0%,0,0.0%,1,100.0%,0,0.0%,0,0.0%,0,0.0%"
//
// This pull rolls each store's per-employee rows up to ONE store-level summary row per day
// (see supabase/schema-lifelenz-attendance.sql's header for why: no UI need for per-employee
// names here, so storing only the aggregate avoids a PII surface for zero benefit). Only the
// "#" count columns are read -- the "%" columns are re-derived from the rolled-up counts rather
// than summing per-employee percentages, which is not a meaningful operation.
//
// ⚠️ Auth is DIRECT-TOKEN ONLY in this first cut, unlike lifelenz-pull.mjs's full
// direct-REST-then-Playwright ladder. LIFELENZ_TOKEN already works for this exact endpoint
// (proven live by both lifelenz-ta-probe.mjs runs, 2026-09-06). Duplicating ~150 lines of
// lifelenz-pull.mjs's Playwright fallback into a second file risked introducing a second,
// silently-drifting copy of already-fragile working code without being able to validate a
// refactor of the production daily-sync script itself overnight. If LIFELENZ_TOKEN expires,
// this pull fails loudly (sync-failure-watch.yml catches the run) rather than falling back --
// adding a Playwright fallback here is a reasonable, low-risk follow-up, not attempted tonight.
//
// Required env vars:
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN
// Optional:
//   LIFELENZ_ATTENDANCE_WINDOW_DAYS — rolling window size (default: 28, matching the original
//     hand-entered TA_DATA's ~4-week cadence)
//   LIFELENZ_DEBUG — set to '1' to log raw per-store row counts

import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';
import { safeCreateClient } from './lib/safe-supabase-client.mjs';

const BASE          = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID   = '01979dbf-a166-759b-8702-aba9915c578e';
const WINDOW_DAYS   = parseInt(process.env.LIFELENZ_ATTENDANCE_WINDOW_DAYS || '28', 10);
const DEBUG         = process.env.LIFELENZ_DEBUG === '1';

// safeCreateClient (not a bare createClient module-scope const) -- see that helper's own
// header for the real CI incident (a leaked dummy env var from an unrelated test file
// reaching this module's guard and crashing Node's Realtime sub-client) this avoids.
const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

function apiHeaders(token, scheduleId = null) {
  const h = {
    'X-Auth-Token':      token,
    'X-Business-Id':     BUSINESS_ID,
    'X-Lifelenz-Device': 'webadmin',
    'X-Version':         '1.75.21',
    'Accept':            'application/json',
  };
  if (scheduleId) h['X-Schedule-Id'] = scheduleId;
  return h;
}

// Same discovery + store filter as lifelenz-pull.mjs's getStoreSchedules() (kept in sync
// manually -- both scripts filter the same schedule list the same way; not worth a shared
// module for one ~15-line block, per this repo's "small, pure, exported functions, not a
// framework" convention for genuinely tiny shared pieces vs. real duplication risk).
async function getStoreSchedules(token) {
  const resp = await fetch(`${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`, {
    headers: apiHeaders(token),
  });
  console.log('[schedules] discovery →', resp.status);
  if (!resp.ok) throw new Error(`schedules ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const stores = (data?.data || [])
    .filter(s => s.attributes?.schedule_status === 'active')
    .filter(s => /\b\d{4,7}\b/.test(s.attributes?.schedule_name || s.attributes?.code || ''))
    .map(s => ({ id: s.id, name: s.attributes.schedule_name || s.attributes.code || s.id }));
  console.log(`[schedules] ${stores.length} store schedules after filter`);
  return stores;
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; }
    else { cur += c; }
  }
  cells.push(cur);
  return cells.map(c => c.trim().replace(/^"|"$/g, ''));
}

// Parses one store's attendance_report CSV into { loc, employees: [{name, scheduledShifts,
// acceptedShifts, pickupShifts, excusedAbsences, unexcusedAbsences, unfilledShifts,
// lateShiftStarts, earlyShiftStarts, dropped, swapped}] }. Returns null if the CSV doesn't
// match the expected shape (metadata row missing "Store", or too few lines) -- same defensive
// posture as lifelenz-pull.mjs's own parseCSV (return [] / skip rather than throw on a shape
// surprise, since a genuinely empty/malformed report for one store must not abort the run).
function parseAttendanceCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const r0 = parseCsvLine(lines[0]);
  let loc = '';
  for (let i = 0; i < r0.length; i++) {
    if (r0[i].toLowerCase() === 'store' && i + 1 < r0.length) { loc = r0[i + 1].trim(); break; }
  }
  if (!loc) loc = r0.find(v => /^\d{4,7}$/.test(v.trim())) || '';
  if (!loc) return null;
  loc = loc.padStart(7, '0');

  const headers = parseCsvLine(lines[1]).map(h => h.trim().toLowerCase());
  const fc = name => headers.findIndex(h => h === name.toLowerCase());
  const C = {
    name:               fc('NAME'),
    scheduledShifts:    fc('SCHEDULED SHIFT #'),
    acceptedShifts:     fc('ACCEPTED SHIFT #'),
    pickupShifts:       fc('PICK UP #'),
    excusedAbsences:    fc('EXCUSED ABSENCE #'),
    unexcusedAbsences:  fc('UNEXCUSED ABSENCE #'),
    unfilledShifts:     fc('UNFILLED SHIFT #'),
    lateShiftStarts:    fc('LATE SHIFT START #'),
    earlyShiftStarts:   fc('EARLY SHIFT START #'),
    dropped:            fc('DROPPED #'),
    swapped:            fc('SWAPPED #'),
  };
  if (C.name < 0 || C.scheduledShifts < 0) return null; // header shape drifted -- don't guess

  const num = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
  const employees = [];
  for (let i = 2; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    if (!r[C.name]) continue;
    employees.push({
      name:              r[C.name],
      scheduledShifts:   num(r[C.scheduledShifts]),
      acceptedShifts:    num(r[C.acceptedShifts]),
      pickupShifts:      num(r[C.pickupShifts]),
      excusedAbsences:   num(r[C.excusedAbsences]),
      unexcusedAbsences: num(r[C.unexcusedAbsences]),
      unfilledShifts:    num(r[C.unfilledShifts]),
      lateShiftStarts:   num(r[C.lateShiftStarts]),
      earlyShiftStarts:  num(r[C.earlyShiftStarts]),
      dropped:           num(r[C.dropped]),
      swapped:           num(r[C.swapped]),
    });
  }
  return { loc, employees };
}

// Store-level rollup from the parsed per-employee rows. employeeCount counts only employees
// with >=1 scheduled shift in the window (a roster export includes every employee assigned to
// the schedule, most with all-zero rows if they had no shifts that window -- summing those in
// would overstate headcount).
function rollupEmployees(employees) {
  const active = employees.filter(e => e.scheduledShifts > 0);
  const sum = key => employees.reduce((a, e) => a + e[key], 0);
  return {
    employee_count:     active.length,
    scheduled_shifts:   sum('scheduledShifts'),
    accepted_shifts:    sum('acceptedShifts'),
    pickup_shifts:      sum('pickupShifts'),
    excused_absences:   sum('excusedAbsences'),
    unexcused_absences: sum('unexcusedAbsences'),
    unfilled_shifts:    sum('unfilledShifts'),
    late_shift_starts:  sum('lateShiftStarts'),
    early_shift_starts: sum('earlyShiftStarts'),
    dropped_shifts:     sum('dropped'),
    swapped_shifts:     sum('swapped'),
  };
}

async function fetchAttendanceReport(token, scheduleId, startDate, endDate) {
  const url = `${BASE}/api/admin/report/businesses/${BUSINESS_ID}/schedules/${scheduleId}/attendance_report` +
              `?start_date=${toISO(startDate)}&end_date=${toISO(endDate)}&type=csv`;
  const resp = await fetch(url, {
    headers: { ...apiHeaders(token, scheduleId), 'X-Page-Module': 'reports-pdf', 'Accept': 'text/csv, */*' },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('csv') && !ct.includes('text')) throw new Error(`unexpected content-type: ${ct}`);
  const text = await resp.text();
  return text && text.length > 20 ? parseAttendanceCSV(text) : null;
}

async function getLatestPeriodEnd() {
  const { data, error } = await supabase
    .from('lifelenz_attendance_summary')
    .select('period_end')
    .order('period_end', { ascending: false })
    .limit(1);
  if (error) { console.warn('[freshness] could not read latest period_end:', error.message); return null; }
  return data?.[0]?.period_end ? new Date(data[0].period_end + 'T00:00:00') : null;
}

async function upsertSummary(row) {
  const { error } = await supabase
    .from('lifelenz_attendance_summary')
    .upsert([row], { onConflict: 'loc,period_end' });
  if (error) { console.warn('[supabase] upsert error:', error.message); return false; }
  return true;
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) { console.error('[auth] LIFELENZ_TOKEN required (no Playwright fallback in this pull yet).'); process.exit(1); }

  const latestPeriodEnd = await getLatestPeriodEnd();
  const fresh = checkFreshness(latestPeriodEnd, { warnAfterHours: 30, errorAfterHours: 54, label: 'lifelenz-attendance-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const periodEnd   = addDay(new Date(), -1); // yesterday -- "today" may be partial
  const periodStart = addDay(periodEnd, -(WINDOW_DAYS - 1));
  console.log(`[lifelenz-attendance-pull] window: ${toISO(periodStart)} → ${toISO(periodEnd)} (${WINDOW_DAYS}d)`);

  const schedules = await getStoreSchedules(token);
  if (!schedules.length) { console.error('[schedules] no store schedules found.'); process.exit(1); }

  const tracker = makeOutcomeTracker('lifelenz-attendance-pull');
  const requestedUnits = schedules.map(s => s.name);
  const coveredSchedules = new Set();
  const allScheduleIds = schedules.map(s => s.id);
  let totalSaved = 0;

  for (const schedule of schedules) {
    try {
      const parsed = await fetchAttendanceReport(token, schedule.id, periodStart, periodEnd);
      if (!parsed) { console.log(`  ${schedule.name}: no data`); continue; }
      const rollup = rollupEmployees(parsed.employees);
      if (DEBUG) console.log(`  ${schedule.name}: ${parsed.employees.length} employee rows →`, rollup);
      const ok = await upsertSummary({
        loc: parsed.loc,
        period_start: toISO(periodStart),
        period_end: toISO(periodEnd),
        pulled_at: new Date().toISOString(),
        ...rollup,
      });
      if (ok) { totalSaved++; coveredSchedules.add(schedule.id); }
      console.log(`  ${schedule.name} (loc ${parsed.loc}): ${ok ? 'saved' : 'FAILED to save'} — ${rollup.employee_count} active employees, ${rollup.unexcused_absences} unexcused absences`);
    } catch (e) {
      console.warn(`  ${schedule.name}: ${e.message}`);
      tracker.fail(schedule.name, e.message);
    }
  }

  console.log(`[lifelenz-attendance-pull] ✓ done — ${totalSaved}/${schedules.length} stores saved`);
  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-attendance-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits, totalSaved,
    formatRerun: () => `re-run the whole workflow -- no per-store rerun flag exists yet`,
  });
  if (code) process.exit(code);
}

// Exported for src/__tests__/lifelenz-attendance-pull.test.js -- real behavioral tests of the
// CSV parser + rollup against the actual captured attendance_report shape (2026-09-06), not
// just a source-text check. Guarded the same way qsrsoft-variance-pull.mjs/
// qsrsoft-punch-times-pull.mjs already are, so importing this module for its pure functions
// doesn't also fire off a live LifeLenz pull.
export { parseAttendanceCSV, rollupEmployees };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[lifelenz-attendance-pull] fatal error:', err);
    process.exit(1);
  });
}
