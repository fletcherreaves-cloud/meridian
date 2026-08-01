// @ts-nocheck
// ── Item variance PROGRESSION (Change Monitor v2) ───────────────────────────────────────────────
// Owner vision (Notes 41, 2026-08-01): stop diffing frozen snapshots — reconstruct each item's variance
// journey straight from the raw item ledger, which records every count with its $ variance the instant
// it's submitted. Pick a BASE count (the establishing count for the period; auto by ruleset, overridable),
// then layer each later count as a STEP that either moved the variance toward zero (improved) or away
// (hurt). The owner's example: base −$100 → recount finds +$50 → net −$50 (✅ improved); another recount
// −$75 → net −$175 (⚠️ hurt — verify again). If repeated recounts HOLD a worse value, that's bad for this
// period's number but good for accuracy going forward (the item genuinely is off). A ~$0 variance is
// statistically improbable → flag it (the var-0 lesson). Pure + tested; the Change Monitor renders this.

import { eventTs } from './eom-recount-forensics.js';

const abs = v => Math.abs(Number(v) || 0);
const ZERO = 1;   // |$| < ZERO ≈ a $0 variance (improbable → flag)

// One item's chronological count chain → base + steps + verdict + flags.
// history = qsr_raw_item_detail rows' history: [{ dt, tm, isCount, difference, variance, manager, source }].
// opts.baseIndex overrides which count is the base (the picker); default 0 = first count.
export function itemVarianceProgression(history, { baseIndex = 0 } = {}) {
  const counts = (history || [])
    .filter(h => h && h.isCount && h.dt)
    .map(h => ({
      dt: String(h.dt).slice(0, 10), tm: h.tm || null, when: eventTs(h.dt, h.tm),
      dolVar: Number(h.difference) || 0, unitVar: h.variance != null ? Number(h.variance) : null,
      manager: h.manager || null, source: h.source || 'count', method: h.method || h.entryMethod || null,
    }))
    .sort((a, b) => ((a.when ?? 0) - (b.when ?? 0)) || String(`${a.dt} ${a.tm || ''}`).localeCompare(`${b.dt} ${b.tm || ''}`));

  if (!counts.length) return { counts: [], base: null, steps: [], final: null, nRecounts: 0, verdict: 'none', flags: [] };

  const bi = Math.max(0, Math.min(baseIndex, counts.length - 1));
  const base = { ...counts[bi], index: bi };

  const steps = counts.slice(bi + 1).map((c, k) => {
    const prev = counts[bi + k];   // the count immediately before this one
    return {
      ...c, index: bi + 1 + k,
      dVsBase: c.dolVar - base.dolVar,      // net movement from the base
      dVsPrev: c.dolVar - prev.dolVar,      // step-over-step movement
      towardZero: abs(c.dolVar) < abs(base.dolVar),
      // direction vs the PREVIOUS count (did this specific recount help or hurt?)
      direction: abs(c.dolVar) < abs(prev.dolVar) ? 'improved' : abs(c.dolVar) > abs(prev.dolVar) ? 'hurt' : 'held',
      netImprovedVsBase: abs(base.dolVar) - abs(c.dolVar),   // + = closer to zero than base, − = worse
    };
  });

  const final = counts[counts.length - 1];
  const nRecounts = counts.length - 1 - bi;
  const netVsBase = final.dolVar - base.dolVar;
  const improvedVsBase = abs(final.dolVar) < abs(base.dolVar);
  const worseVsBase = abs(final.dolVar) > abs(base.dolVar) + ZERO;

  const flags = [];
  if (abs(final.dolVar) < ZERO) flags.push('zero-variance');                 // ~$0 → improbable, verify
  if (nRecounts >= 1 && worseVsBase) flags.push('recount-worsened');         // ended worse than the base
  if (nRecounts >= 2 && worseVsBase) flags.push('held-worse');               // multiple recounts hold the worse value

  const verdict = nRecounts === 0 ? 'single-count'
    : improvedVsBase ? 'improved'
    : worseVsBase ? 'worsened'
    : 'held';

  return { counts, base, steps, final, nRecounts, netVsBase, improvedVsBase, worseVsBase, verdict, flags };
}

// Roll the progression across a store's raw items, ranked by |net effect| (base→final), so the biggest
// movers surface first. Each entry carries its item id/desc + the full progression.
export function storeVarianceProgressions(rawItems, { minAbs = 25 } = {}) {
  const out = [];
  for (const it of (rawItems || [])) {
    const p = itemVarianceProgression(it.history);
    if (!p.base) continue;
    const finalVar = p.final ? p.final.dolVar : 0;
    if (abs(finalVar) < minAbs && abs(p.base.dolVar) < minAbs && !p.flags.length) continue;
    out.push({ wrin: it.wrin, descr: it.descr || it.wrin, cls: it.cls, ...p });
  }
  // Rank: flagged (worsened / held-worse) first, then by the larger of |base| / |final|.
  out.sort((a, b) => (b.flags.length - a.flags.length) || (Math.max(abs(b.final?.dolVar), abs(b.base?.dolVar)) - Math.max(abs(a.final?.dolVar), abs(a.base?.dolVar))));
  return out;
}
