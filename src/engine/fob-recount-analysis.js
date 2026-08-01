// @ts-nocheck
// ── FOB root-cause analysis: recount impact + FOB consistency ────────────────────────────────────
// The reusable, verifiable engine behind the "why does FOB worsen from count to month-end?" riddle
// (Notes 41). Same math the CI scan uses, so the in-app modal and the batch run agree to the dollar.
//   • recountImpactByStore — per store, the $ that recounts moved TOWARD zero (helpful) vs AWAY
//     (harmful, i.e. the recount added apparent loss). Net-negative stores are the coaching opportunities.
//   • fobConsistencyByStore — per store, the mean + variability (std dev) of the monthly-FINAL FOB%,
//     from the daily qsr_fob snapshots. Low sd = repeatable; that's the "who's dialed in" read.
// Every number is decomposable (toward/away, per-month finals) so it's auditable, not a black box.

import { storeVarianceProgressions } from './eom-variance-progression.js';

const abs = v => Math.abs(Number(v) || 0);
const monthOf = d => String(d || '').slice(0, 7);

// Per-store recount impact from the raw item ledgers. rawByLoc = { loc: [ {wrin, descr, cls, history} ] }.
export function recountImpactByStore(rawByLoc, { minAbs = 0 } = {}) {
  const out = [];
  for (const loc of Object.keys(rawByLoc || {})) {
    const progs = storeVarianceProgressions(rawByLoc[loc], { minAbs });
    let toward = 0, away = 0, nRecounted = 0;
    const items = [];
    for (const p of progs) {
      if (p.nRecounts <= 0) continue;
      nRecounted++;
      const eff = abs(p.base.dolVar) - abs(p.final.dolVar);   // + = recount moved toward zero, − = away
      if (eff >= 0) toward += eff; else away += -eff;
      items.push({ wrin: p.wrin, descr: p.descr, baseVar: p.base.dolVar, finalVar: p.final.dolVar, effect: eff, verdict: p.verdict });
    }
    if (nRecounted) {
      items.sort((a, b) => a.effect - b.effect);   // most harmful item first
      out.push({ loc, toward, away, net: toward - away, nRecounted, items });
    }
  }
  out.sort((a, b) => a.net - b.net);   // most harmful store first (the opportunities)
  return out;
}

// Per-store FOB consistency (monthly-final FOB% mean + std dev) from the daily qsr_fob rows.
// fobRows = loadQsrFob() shape: { loc, date, prodSalesAmt, compWasteAmt, rawWasteAmt, condimentsAmt,
// empMgrMealsAmt, statVarianceAmt, unexplainedAmt }.
export function fobConsistencyByStore(fobRows) {
  // 1) one row per loc/day (last wins). 2) per loc/month, month-final = the last day's FOB%.
  const byDay = {};
  for (const r of (fobRows || [])) {
    const day = (typeof r.date === 'string' ? r.date : (r.date?.toISOString?.() || '')).slice(0, 10);
    if (!day) continue;
    byDay[`${r.loc}|${day}`] = { ...r, day };
  }
  const finals = {};   // loc -> month -> { day, pct }
  for (const r of Object.values(byDay)) {
    const parts = (r.compWasteAmt || 0) + (r.rawWasteAmt || 0) + (r.condimentsAmt || 0) + (r.empMgrMealsAmt || 0) + (r.statVarianceAmt || 0) + (r.unexplainedAmt || 0);
    const pct = r.prodSalesAmt ? parts / r.prodSalesAmt : null;
    if (pct == null) continue;
    const mo = monthOf(r.day);
    const cur = (finals[r.loc] || (finals[r.loc] = {}))[mo];
    if (!cur || r.day > cur.day) finals[r.loc][mo] = { day: r.day, pct };
  }
  const out = [];
  for (const loc of Object.keys(finals)) {
    const vals = Object.values(finals[loc]).map(x => x.pct * 100);
    if (vals.length < 2) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
    out.push({ loc, n: vals.length, mean, sd, monthly: finals[loc] });
  }
  out.sort((a, b) => a.sd - b.sd);   // steadiest first
  return out;
}
