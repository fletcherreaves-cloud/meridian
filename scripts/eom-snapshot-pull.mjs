#!/usr/bin/env node
// scripts/eom-snapshot-pull.mjs
// ── EOM baseline auto-lock ──────────────────────────────────────────────────────
// Freezes every store's FULL EOM state into eom_snapshots so tomorrow's Change Monitor can diff live
// data against it (which moves helped/hurt). Reads what's ALREADY in Supabase — qsr_fob (FOB + 6
// components), qsr_variance_stat (per-item $ variance/yield), qsr_onhand (per-item count qty /
// on-hand $ / last-counted) — and writes one baseline snapshot per store. NO QSRSoft auth needed;
// pure Supabase read → transform → write with the service role. Append-only (owner: "err on saving
// too much"). Meant to run nightly after ~4am CT, before the day's recounting starts.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:     EOM_PERIOD=YYYY-MM (default: current month, CT)   EOM_KIND=baseline|checkpoint
//               EOM_LABEL=auto-4am

import { createClient } from '@supabase/supabase-js';
import { fobSnapshotByStore, computeCountProgress } from '../src/engine/eom-inventory.js';
import { withRetry } from './_retry.mjs';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const KIND_OVERRIDE = process.env.EOM_KIND ? process.env.EOM_KIND.trim() : null;
const LABEL = (process.env.EOM_LABEL || 'auto-4am').trim();

// Paginated select-all for one table (respects Supabase's 1000-row cap).
async function selectAll(table, apply) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await withRetry(() => apply(sb.from(table).select('*')).range(from, from + PAGE - 1),
      { tries: 4, baseMs: 800, label: `${table}[${from}]` });
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const isoDay = (d) => !d ? null : String(d).slice(0, 10);

// The ACTIVE EOM period = the latest `period` present in qsr_onhand (on-hand only populates during
// the count window, so its max period IS the month being closed — correct even in early August when
// the calendar month has rolled but July is still closing). Falls back to CT calendar month.
async function activePeriod() {
  if (process.env.EOM_PERIOD) return process.env.EOM_PERIOD.trim();
  const { data } = await withRetry(() => sb.from('qsr_onhand').select('period').order('period', { ascending: false }).limit(1), { tries: 3, label: 'active-period' });
  if (data?.[0]?.period) return String(data[0].period);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find(x => x.type === 'year').value}-${p.find(x => x.type === 'month').value}`;
}

async function main() {
  const PERIOD = await activePeriod();
  const monthStart = `${PERIOD}-01`;
  const monthEnd = `${PERIOD}-31`;

  const [fobRaw, varRaw, ohRaw] = await Promise.all([
    selectAll('qsr_fob', q => q.gte('date', monthStart).lte('date', monthEnd)),
    selectAll('qsr_variance_stat', q => q.eq('period', PERIOD)),
    selectAll('qsr_onhand', q => q.eq('period', PERIOD)),
  ]);

  // Gate: only snapshot when there's an active count (on-hand rows) — unless a period was forced.
  if (!ohRaw.length && !process.env.EOM_PERIOD) { console.log(`[eom-snapshot] no on-hand rows for ${PERIOD} — no active EOM count window; skipping.`); return; }

  // First lock of the period → 'baseline' (fixed reference); later runs → 'checkpoint'.
  const { data: existing } = await withRetry(() => sb.from('eom_snapshots').select('id').eq('period', PERIOD).eq('kind', 'baseline').limit(1), { tries: 3, label: 'baseline-exists' });
  const KIND = KIND_OVERRIDE || (existing?.length ? 'checkpoint' : 'baseline');
  console.log(`[eom-snapshot] period=${PERIOD} kind=${KIND} label=${LABEL} (baseline ${existing?.length ? 'exists' : 'NEW'})`);
  console.log(`[eom-snapshot] loaded fob=${fobRaw.length} variance=${varRaw.length} onhand=${ohRaw.length}`);

  // FOB per store (LATEST snapshot per store — never a sum; see fobSnapshotByStore).
  const fobRows = fobRaw.map(r => ({
    loc: r.loc, date: r.date, prodSalesAmt: r.prod_sales_amt,
    compWasteAmt: r.comp_waste_amt, rawWasteAmt: r.raw_waste_amt, condimentsAmt: r.condiments_amt,
    empMgrMealsAmt: r.emp_mgr_meals_amt, statVarianceAmt: r.stat_variance_amt, unexplainedAmt: r.unexplained_amt,
  }));
  const fob = fobSnapshotByStore(fobRows, PERIOD);

  // Per-store on-hand + variance, keyed by loc.
  const ohByLoc = {}, varByLoc = {};
  for (const r of ohRaw) (ohByLoc[String(r.loc)] || (ohByLoc[String(r.loc)] = [])).push(r);
  for (const r of varRaw) (varByLoc[String(r.loc)] || (varByLoc[String(r.loc)] = [])).push(r);

  const locs = new Set([...Object.keys(fob), ...Object.keys(ohByLoc), ...Object.keys(varByLoc)]);
  const snaps = [];
  for (const loc of locs) {
    const oh = ohByLoc[loc] || [], vr = varByLoc[loc] || [];
    const vByWrin = {}; for (const v of vr) vByWrin[String(v.wrin)] = v;
    const items = oh.map(o => {
      const v = vByWrin[String(o.wrin)] || {};
      return {
        wrin: String(o.wrin), descr: o.descr || v.descr || '', cls: o.cls || v.cls || '',
        qty: o.total_units ?? null, onHandAmt: o.on_hand_amt ?? null,
        dolDiff: v.dol_diff ?? null, variance: v.variance ?? null,
        lastCounted: isoDay(o.last_counted) || isoDay(o.last_submitted),
      };
    });
    const seen = new Set(items.map(i => i.wrin));
    for (const v of vr) { const w = String(v.wrin); if (!seen.has(w)) items.push({ wrin: w, descr: v.descr || '', cls: v.cls || '', qty: null, onHandAmt: null, dolDiff: v.dol_diff ?? null, variance: v.variance ?? null, lastCounted: null }); }

    // Count progress (per-class %) from on-hand rows mapped into the engine's shape.
    let count = null;
    try {
      const shaped = oh.map(o => ({ cls: o.cls, lastCounted: o.last_counted ? new Date(o.last_counted) : null, lastSubmitted: o.last_submitted ? new Date(o.last_submitted) : null }));
      const prog = computeCountProgress(shaped, { period: PERIOD });
      count = { pctCounted: prog.pctCounted, earlyPctCounted: prog.earlyPctCounted, believesDone: prog.believesDone, byClass: prog.byClass };
    } catch (e) { count = { error: String(e?.message || e) }; }

    const f = fob[loc] || {};
    snaps.push({
      loc: String(loc), period: PERIOD, kind: KIND, label: LABEL,
      taken_at: new Date().toISOString(), taken_by: null,
      fob: { sales: f.sales ?? null, fob: f.fob ?? null, fobPct: f.fobPct ?? null, comp: f.comp ?? null, raw: f.raw ?? null, cond: f.cond ?? null, emp: f.emp ?? null, statv: f.statv ?? null, unex: f.unex ?? null, asOf: f.asOf ?? null },
      count, items,
      meta: { nItems: items.length, source: 'auto-cron' },
    });
  }

  console.log(`[eom-snapshot] built ${snaps.length} store snapshots (${snaps.reduce((s, x) => s + x.items.length, 0)} item rows)`);
  if (!snaps.length) { console.log('[eom-snapshot] nothing to write'); return; }

  let saved = 0;
  for (let i = 0; i < snaps.length; i += 100) {
    const chunk = snaps.slice(i, i + 100);
    const { error } = await withRetry(() => sb.from('eom_snapshots').insert(chunk), { tries: 4, baseMs: 800, label: `insert[${i}]` });
    if (error) { console.error(`[eom-snapshot] insert error: ${error.message}`); process.exitCode = 1; }
    else saved += chunk.length;
  }
  console.log(`[eom-snapshot] ✓ locked ${saved}/${snaps.length} stores for ${PERIOD}`);
}

main().catch(e => { console.error('[eom-snapshot] FATAL', e); process.exit(1); });
