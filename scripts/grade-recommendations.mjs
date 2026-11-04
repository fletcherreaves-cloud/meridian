#!/usr/bin/env node
// scripts/grade-recommendations.mjs — Recommendation Accuracy Ledger grading job (task #80
// follow-on, Phase 1, owner-approved 2026-11-04). See memory/plan-recommendation-accuracy-
// ledger-2026-11-04.md for the full design. NOT yet wired to a GitHub Action — the owner hasn't
// asked for scheduling, and the ledger table itself isn't created in live Supabase yet (run
// supabase/schema-recommendation-ledger.sql first, per that file's own header). Run manually
// once there's real data to grade.
//
// Required env vars:
//   VITE_SUPABASE_URL          — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (DB reads/writes, bypasses RLS)
//
// Scope note (Phase 1 limitation, documented rather than hidden): this reads the real actual
// through src/engine/metric-source.js's own pure metricSeries/metricAvg functions (never
// hand-rolled math), but only populates `ds.laborRows` from the manual-upload `labor_rows`
// table's own precomputed sales/labor_pct/tpph columns. It does NOT populate glimpseRows/
// ctrlRows/qsrActSummaryRows, so metricSeries falls through to laborRows as its last-resort
// `srcs` tier rather than the full auto-first cascade the live app uses, and grades laborPct/
// tpph via metricAvg (mean-of-daily) rather than metricSumRatio (Sum/Sum) -- the derive path's
// cross-table inputs (opsLaborRows.laborDollar, ctrlRows.actHrs, laborRows.gc) need a live-data
// check this script's author couldn't make. Before relying on this for real grading, verify
// against live Supabase whether labor_rows alone gives an acceptable approximation, or whether
// this needs the fuller ds population (loadLaborRows's sibling loaders) to match the UI exactly.

import { createClient } from '@supabase/supabase-js';
import { metricSeries, metricAvg } from '../src/engine/metric-source.js';
import { gradeOutcome } from '../src/engine/recommendation-ledger.js';

const URL = process.env.VITE_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
function die(msg) { console.error('✗ ' + msg); process.exit(1); }
if (!URL || !SERVICE) die('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

async function loadDueForGrading() {
  const { data, error } = await db.from('recommendation_ledger')
    .select('*').lte('outcome_due_at', new Date().toISOString()).is('outcome_value', null);
  if (error) {
    if ((error.message || '').includes('relation') || error.code === '42P01') {
      console.log('[grade-recommendations] Table missing — run supabase/schema-recommendation-ledger.sql first. Nothing to grade.');
      return [];
    }
    die('loadDueForGrading: ' + error.message);
  }
  return data || [];
}

// Builds a minimal ds-shaped object (see this file's own header for the Phase-1 scope note)
// for one loc over [monthStart, monthEnd) from the real labor_rows table.
async function buildMinimalDs(loc, monthStartISO, monthEndISO) {
  const { data, error } = await db.from('labor_rows').select('loc,report_date,sales,labor_pct,tpph')
    .eq('loc', String(loc)).gte('report_date', monthStartISO).lt('report_date', monthEndISO);
  if (error) { console.warn('[grade-recommendations] labor_rows load error:', error.message); return { laborRows: [] }; }
  return {
    laborRows: (data || []).map(r => ({
      loc: r.loc, date: new Date(r.report_date + 'T00:00:00'),
      sales: r.sales, laborPct: r.labor_pct, tpph: r.tpph,
    })),
  };
}

function monthRange(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 1));
  const e = new Date(Date.UTC(y, m, 1));
  return { s, e, sISO: s.toISOString().slice(0, 10), eISO: e.toISOString().slice(0, 10) };
}

async function gradeOne(row) {
  const { field, period } = row.context || {};
  if (!field || !period) { console.warn('[grade-recommendations] row', row.id, 'missing context.field/period — skipped'); return; }
  const { s, e, sISO, eISO } = monthRange(period);
  const ds = await buildMinimalDs(row.loc, sISO, eISO);
  let outcomeValue = null;
  if (field === 'tProdSales') {
    const series = metricSeries(ds, row.loc, { s, e }, 'sales');
    const vals = Object.values(series).filter(v => typeof v === 'number');
    outcomeValue = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  } else if (field === 'tCrewLabor') {
    outcomeValue = metricAvg(ds, row.loc, { s, e }, 'laborPct');
  } else if (field === 'tTpph') {
    outcomeValue = metricAvg(ds, row.loc, { s, e }, 'tpph');
  } else {
    console.warn('[grade-recommendations] unknown field', field, '— skipped'); return;
  }
  if (outcomeValue == null) { console.log('[grade-recommendations] loc', row.loc, field, period, '— no real data yet, leaving ungraded'); return; }
  const { outcome_error, grade } = gradeOutcome(row.recommendation_value, outcomeValue);
  const { error } = await db.from('recommendation_ledger').update({
    outcome_value: outcomeValue, outcome_error, grade,
    graded_at: new Date().toISOString(), status: 'graded',
  }).eq('id', row.id);
  if (error) console.warn('[grade-recommendations] update error for row', row.id, ':', error.message);
  else console.log('[grade-recommendations] graded', row.source, row.loc, field, period, '→', grade, '(error', outcome_error?.toFixed?.(2) ?? outcome_error, ')');
}

async function main() {
  const rows = await loadDueForGrading();
  console.log('[grade-recommendations] ' + rows.length + ' row(s) due for grading.');
  for (const row of rows) await gradeOne(row);
}

main().catch(e => die(e.stack || e.message));
