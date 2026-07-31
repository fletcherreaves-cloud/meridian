// @ts-nocheck
// ── District Waste Scan (Notes 40 #2) ───────────────────────────────────────────────────────────
// Runs the Second-Look waste rules across a WHOLE scope on demand (the diagnosis runs them per store).
// Surfaces the same non-accusatory patterns, ranked, so the owner can sweep waste behavior in one view:
//   • uniform/static value — the exact same $ logged on many days = estimated, not weighed (Allen-W 20s)
//   • high-$ session — one manager, one day, far above that store's typical session
//   • manager concentration — one manager owns an outsized share of a store's waste
//   • EOM-window spike — a day's total far above the store's median, in the count window
// Pure + unit-tested. wasteRows = qsr_waste: { loc, dt, tm, type, amount, manager, edited }.

import { countWindowStart } from './eom-inventory.js';

const num = v => Number(v) || 0;
const day = d => String(d || '').slice(0, 10);

// countWindowStart returns a Date; get its ms (or null).
function windowStartTs(period) {
  try { const d = countWindowStart(period); return d instanceof Date ? d.getTime() : null; } catch { return null; }
}

export function scanWaste(wasteRows, { period, staticRepeats = 4, sessionFactor = 2.5, sessionMin = 75, shareFlag = 0.4, shareMin = 100, spikeFactor = 2.5, spikeMin = 50 } = {}) {
  const byLoc = {};
  for (const w of (wasteRows || [])) {
    if (!w || !w.dt || num(w.amount) <= 0) continue;
    (byLoc[String(w.loc)] || (byLoc[String(w.loc)] = [])).push(w);
  }
  const winStart = windowStartTs(period);
  const stores = [];

  for (const loc of Object.keys(byLoc)) {
    const events = byLoc[loc];
    const total = events.reduce((s, w) => s + num(w.amount), 0);
    const flags = [];

    // 1) Uniform/static value: exact same amount on ≥ staticRepeats distinct days.
    const amtDays = {};
    for (const w of events) { const a = num(w.amount).toFixed(2); (amtDays[a] || (amtDays[a] = new Set())).add(day(w.dt)); }
    for (const a of Object.keys(amtDays)) {
      if (Number(a) > 0 && amtDays[a].size >= staticRepeats) {
        flags.push({ kind: 'uniform', label: `Same $${a} logged on ${amtDays[a].size} days`, amount: Number(a), nDays: amtDays[a].size, dollars: Number(a) * amtDays[a].size, sev: 2 });
      }
    }

    // 2) High-$ session (manager × day) vs the store's typical session.
    const sess = {};
    for (const w of events) { const k = `${w.manager || '?'}|${day(w.dt)}`; const s = sess[k] || (sess[k] = { manager: w.manager || '?', d: day(w.dt), total: 0, n: 0 }); s.total += num(w.amount); s.n++; }
    const sessions = Object.values(sess);
    if (sessions.length >= 3) {
      const totals = sessions.map(s => s.total).sort((x, y) => x - y);
      const med = totals[Math.floor(totals.length / 2)] || 0;
      for (const s of sessions) {
        if (med > 0 && s.total >= med * sessionFactor && s.total >= sessionMin) {
          const nearEOM = winStart != null && Date.parse(s.d) >= winStart;
          flags.push({ kind: 'session', label: `${s.manager} logged $${Math.round(s.total)} on ${s.d} (${(s.total / med).toFixed(1)}× typical)${nearEOM ? ' · in count window' : ''}`, dollars: s.total, manager: s.manager, day: s.d, nearEOM, sev: nearEOM ? 3 : 2 });
        }
      }
    }

    // 3) Manager concentration (one manager owns an outsized share).
    const byMgr = {};
    for (const w of events) { const m = w.manager || '?'; byMgr[m] = (byMgr[m] || 0) + num(w.amount); }
    const mgrs = Object.keys(byMgr);
    if (mgrs.length > 1) {
      for (const m of mgrs) {
        const share = total ? byMgr[m] / total : 0;
        if (share >= shareFlag && byMgr[m] >= shareMin) flags.push({ kind: 'concentration', label: `${m} = ${Math.round(share * 100)}% of this store's waste ($${Math.round(byMgr[m])})`, dollars: byMgr[m], manager: m, share, sev: 1 });
      }
    }

    // 4) EOM-window daily spike vs the store's median day.
    const byDay = {};
    for (const w of events) { const d = day(w.dt); byDay[d] = (byDay[d] || 0) + num(w.amount); }
    const days = Object.keys(byDay);
    if (days.length >= 6) {
      const srt = days.map(d => byDay[d]).sort((a, b) => a - b);
      const med = srt[Math.floor(srt.length / 2)] || 0;
      for (const d of days) {
        if (med > 0 && byDay[d] >= med * spikeFactor && byDay[d] >= spikeMin) {
          const nearEOM = winStart != null && Date.parse(d) >= winStart;
          if (nearEOM) flags.push({ kind: 'spike', label: `$${Math.round(byDay[d])} on ${d} vs $${Math.round(med)} median (${(byDay[d] / med).toFixed(1)}×) — in count window`, dollars: byDay[d], day: d, sev: 2 });
        }
      }
    }

    if (flags.length) {
      flags.sort((a, b) => (b.sev - a.sev) || (b.dollars - a.dollars));
      stores.push({ loc, total, nEvents: events.length, flags });
    }
  }

  stores.sort((a, b) => Math.max(...b.flags.map(f => f.sev)) - Math.max(...a.flags.map(f => f.sev)) || b.total - a.total);
  return { stores, nStores: stores.length, nFlags: stores.reduce((s, x) => s + x.flags.length, 0) };
}
