#!/usr/bin/env node
// scripts/recount-forensics-scan.mjs
// ── Recount-swing TIMING forensics — district scan ──────────────────────────────────────────────
// Reads qsr_raw_item_detail (service role — RLS blocks anon), reconstructs same-day offsetting count
// swings per item, groups the same-manager offsetting swings per store×day, and runs the physical-
// recount-time plausibility test (src/engine/eom-recount-forensics.js). Reports the batches whose
// corrections landed in a window too short to have physically recounted them. Read-only.
//
// Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Optional: PERIOD=YYYY-MM  MIN_SWING=150

import { createClient } from '@supabase/supabase-js';
import { eventTs, recountBatchTiming } from '../src/engine/eom-recount-forensics.js';

const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const PERIOD = process.env.PERIOD || new Date().toISOString().slice(0, 7);
const MIN_SWING = Number(process.env.MIN_SWING) || 150;

async function selectAll(table, apply) {
  const out = []; const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select('*').range(from, from + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) { console.error(`${table}:`, error.message); process.exit(1); }
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Largest same-day consecutive variance swing for one item's count history → { swing, crossZero, from, to }.
function biggestSwing(history) {
  const counts = (history || []).filter(h => h && h.isCount && h.dt && h.difference != null);
  const byDay = {};
  for (const c of counts) (byDay[String(c.dt).slice(0, 10)] || (byDay[String(c.dt).slice(0, 10)] = [])).push(c);
  const swings = [];
  for (const day of Object.keys(byDay)) {
    const dc = byDay[day].slice().sort((a, b) => `${a.dt} ${a.tm || ''}`.localeCompare(`${b.dt} ${b.tm || ''}`));
    let best = null;
    for (let i = 1; i < dc.length; i++) {
      const a = Number(dc[i - 1].difference) || 0, b = Number(dc[i].difference) || 0, sw = Math.abs(b - a);
      if (!best || sw > best.swing) best = { swing: sw, a, b, from: dc[i - 1], to: dc[i], crossZero: (a < 0) !== (b < 0) && a !== 0 && b !== 0, day };
    }
    if (best && best.swing >= MIN_SWING) swings.push(best);
  }
  return swings;
}

async function main() {
  console.log(`[recount-scan] period=${PERIOD} minSwing=$${MIN_SWING}`);
  const rows = await selectAll('qsr_raw_item_detail', q => q.eq('period', PERIOD));
  console.log(`[recount-scan] ${rows.length} raw-item rows`);

  const byLoc = {};
  for (const r of rows) (byLoc[String(r.loc)] || (byLoc[String(r.loc)] = [])).push(r);

  const flagged = [], tested = [];
  for (const loc of Object.keys(byLoc)) {
    // Collect all offsetting (crossZero) swings for this store, tagged with manager + timestamps.
    const swings = [];
    for (const item of byLoc[loc]) {
      for (const s of biggestSwing(item.history)) {
        if (!s.crossZero) continue;
        const mgrA = s.from.manager, mgrB = s.to.manager;
        swings.push({
          wrin: item.wrin, descr: item.descr, day: s.day, swing: s.swing,
          manager: (mgrA && mgrA === mgrB) ? mgrA : null,
          origTs: eventTs(s.from.dt, s.from.tm), corrTs: eventTs(s.to.dt, s.to.tm),
          a: Number(s.from.difference) || 0, b: Number(s.to.difference) || 0,   // pre / post correction variance
        });
      }
    }
    // Batch same-manager offsetting swings per day, test the timing.
    const byMgrDay = {};
    for (const s of swings) { if (!s.manager) continue; const k = `${s.manager}|${s.day}`; (byMgrDay[k] || (byMgrDay[k] = [])).push(s); }
    for (const k of Object.keys(byMgrDay)) {
      const batch = byMgrDay[k];
      if (batch.length < 3) continue;
      const t = recountBatchTiming(batch);
      const [mgr, day] = k.split('|');
      // Pre- vs post-correction NET variance. The padding concern is a real SHORTAGE (net negative)
      // erased toward zero by the "corrections" (owner). preNet<0 + corrections raising it = masked loss.
      const preNet = Math.round(batch.reduce((s, x) => s + x.a, 0));
      const postNet = Math.round(batch.reduce((s, x) => s + x.b, 0));
      const maskedShortage = preNet < -200 && postNet > preNet + 200;   // started net-short, corrections lifted it
      const rec = { loc, mgr, day, verdict: t.verdict, n: t.n || batch.length, windowSec: t.windowSec, requiredSec: t.requiredSec, cadenceSec: t.cadenceSec, totalSwing: Math.round(batch.reduce((s, x) => s + x.swing, 0)), preNet, postNet, maskedShortage, hasTimes: t.verdict !== 'no-times' && t.verdict !== 'insufficient' };
      tested.push(rec);
      if (t.verdict === 'implausible') flagged.push(rec);
    }
  }

  flagged.sort((a, b) => b.n - a.n || a.windowSec - b.windowSec);
  console.log(`\n[recount-scan] ${flagged.length} implausible same-manager offsetting batch(es):\n`);
  for (const f of flagged) {
    const mm = (s) => s >= 90 ? `${(s / 60).toFixed(1)}min` : `${s}s`;
    console.log(`  loc ${f.loc} · ${f.mgr} · ${f.day} — ${f.n} offsetting corrections in ${mm(f.windowSec)} (needs ≥ ${mm(f.requiredSec)}; ~${mm(f.cadenceSec)}/entry) · $${f.totalSwing.toLocaleString()} swung · net $${f.preNet.toLocaleString()} → $${f.postNet.toLocaleString()}${f.maskedShortage ? '  ⚠ MASKED A REAL SHORTAGE' : ''}`);
  }
  if (!flagged.length) console.log('  (none — no batch cleared the padding-timing threshold)');

  // Persist the implausible batches so the Needs-Attention panel surfaces them (legwork up-front). Idempotent.
  if (!process.env.NO_WRITE) {
    const mmw = (s) => s >= 90 ? `${(s / 60).toFixed(1)}min` : `${s}s`;
    const rows = flagged.map(f => ({
      loc: f.loc, period: PERIOD, kind: 'recount-timing', ref: `${f.mgr}|${f.day}`,
      severity: f.maskedShortage ? 'crit' : 'warn',
      title: `implausible recount batch (${f.mgr})`,
      detail: `${f.n} offsetting corrections in ${mmw(f.windowSec)} on ${f.day} — recounting ${f.n} scattered items needs ≥ ${mmw(f.requiredSec)}; the timing doesn't support a physical recount. Net $${f.preNet.toLocaleString()}→$${f.postNet.toLocaleString()}${f.maskedShortage ? ' — MASKED A REAL SHORTAGE' : ''}. Walk the manager through these before accepting the count.`,
      dollars: f.totalSwing, meta: f,
    }));
    if (rows.length) {
      const { error } = await sb.from('eom_integrity_flags').upsert(rows, { onConflict: 'loc,period,kind,ref' });
      console.log(error ? `\n[recount-scan] flag write skipped: ${error.message}` : `\n[recount-scan] ✓ wrote ${rows.length} integrity flag(s) to eom_integrity_flags`);
    }
  }

  // Verbose: every same-manager offsetting batch tested (≥3 items), so 0-flagged can be trusted (not a
  // missing-timestamp artifact). hasTimes=false means the counts carried no time-of-day → can't judge.
  const mm = (s) => s == null ? '?' : (s >= 90 ? `${(s / 60).toFixed(1)}min` : `${s}s`);
  tested.sort((a, b) => b.n - a.n || a.windowSec - b.windowSec);
  console.log(`\n[recount-scan] all ${tested.length} same-manager offsetting batches tested (≥3 items):`);
  for (const t of tested.slice(0, 30)) {
    console.log(`  loc ${t.loc} · ${t.mgr} · ${t.day} — ${t.n} items, window ${mm(t.windowSec)} vs need ${mm(t.requiredSec)} → ${t.verdict.toUpperCase()}${t.hasTimes ? '' : ' [NO TIMES ON COUNTS]'} · $${t.totalSwing.toLocaleString()} swung · net $${t.preNet.toLocaleString()}→$${t.postNet.toLocaleString()}${t.maskedShortage ? ' ⚠MASKED-SHORTAGE' : ''}`);
  }
  const noTimes = tested.filter(t => !t.hasTimes).length;
  if (noTimes) console.log(`\n[recount-scan] ⚠ ${noTimes}/${tested.length} batches had counts with NO time-of-day — timing can't be judged for those (data gap, not a clean bill).`);
}

main().catch(e => { console.error('[recount-scan] fatal:', e); process.exit(1); });
