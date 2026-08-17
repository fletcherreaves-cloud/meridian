#!/usr/bin/env node
// scripts/lifelenz-ta-probe.mjs — #350: find the Time & Attendance report slug.
//
// TA_DATA (src/views/scheduling.js) is a hand-transcribed Jun 2026 snapshot with no live
// source. The report endpoint that would replace it is already known (the SAME endpoint
// shape lifelenz-pull.mjs calls daily for labor_analysis_actuals_report) — the only unknown
// is the report-name path segment for Time & Attendance. This script enumerates candidate
// slugs against ONE known schedule (one store, one day) and prints the status for each, so
// the answer is a log line, not a guess and not ten more days waiting on a DevTools capture.
//
// Read-only. No writes, no Supabase, no CSV parsing — status codes only.
//
// Required env: LIFELENZ_TOKEN (reuses the same GitHub Secret lifelenz-pull.mjs uses).
// Optional env: LIFELENZ_TA_STORE — schedule name substring to probe (default: first store
// schedule returned by the discovery endpoint).

const BASE        = 'https://us01-connect.lifelenz.com';
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';

// Candidates from #350 — every one tried, misses reported alongside the hit (or lack of
// one) so a future session doesn't re-probe the same dead ends.
const CANDIDATES = [
  'time_attendance_report',
  'time_and_attendance_report',
  'attendance_report',
  'employee_attendance_report',
  'punch_report',
  'punches_report',
];

const toISO = d => d.toISOString().slice(0, 10);

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

async function getOneStoreSchedule(token, wantSubstr) {
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
  if (!stores.length) throw new Error('no active store schedules found');
  const pick = wantSubstr ? stores.find(s => s.name.includes(wantSubstr)) : null;
  return pick || stores[0];
}

async function probeSlug(token, scheduleId, slug, dateStr) {
  const url = `${BASE}/api/admin/report/businesses/${BUSINESS_ID}/schedules/${scheduleId}/${slug}` +
              `?start_date=${dateStr}&end_date=${dateStr}&type=csv`;
  const resp = await fetch(url, {
    headers: { ...apiHeaders(token, scheduleId), 'X-Page-Module': 'reports-pdf', 'Accept': 'text/csv, application/json, */*' },
  });
  const ct = resp.headers.get('content-type') || '';
  let snippet = '';
  try {
    const text = await resp.text();
    snippet = text.slice(0, 150).replace(/\n/g, ' ');
  } catch { /* ignore */ }
  return { slug, status: resp.status, contentType: ct, snippet };
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) throw new Error('LIFELENZ_TOKEN env var required');

  const store = await getOneStoreSchedule(token, process.env.LIFELENZ_TA_STORE || null);
  console.log(`[probe] using store schedule: ${store.name} (${store.id})`);

  // One recent closed day — a report for "today" may be partial/empty even if the slug is right.
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = toISO(yesterday);
  console.log(`[probe] date: ${dateStr}`);

  const results = [];
  for (const slug of CANDIDATES) {
    try {
      const r = await probeSlug(token, store.id, slug, dateStr);
      results.push(r);
      console.log(`[probe] ${slug} → ${r.status} (${r.contentType}) ${r.status === 200 ? 'HIT — ' + r.snippet : ''}`);
    } catch (e) {
      results.push({ slug, status: 'ERROR', error: e.message });
      console.log(`[probe] ${slug} → ERROR: ${e.message}`);
    }
  }

  console.log('\n[probe] ── summary ──────────────────────────────────────────');
  for (const r of results) console.log(`  ${r.status === 200 ? '✅' : '  '} ${r.slug.padEnd(30)} ${r.status}`);
  const hits = results.filter(r => r.status === 200);
  if (hits.length) {
    console.log(`\n[probe] ${hits.length} candidate(s) returned 200 — this is the report-name slug for #350.`);
  } else {
    console.log('\n[probe] every candidate 404\'d (or errored) — none of the guessed slugs exist. ' +
                'Falls back to an owner DevTools capture (#350 option 1).');
  }
}

main().catch(e => { console.error('[probe] fatal:', e.message); process.exit(1); });
