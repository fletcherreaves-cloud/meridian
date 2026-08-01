// @ts-nocheck
// ── EOM "Verify & Clear" — items that should be zeroed before close (task #38) ───────────────────
// KB-grounded pre-close cleanup. Two families of items carry a residual on-hand they shouldn't, which
// inflates inventory value and manufactures unexplained variance when the WRIN's recipe changes:
//   • Deactivated / obsolete WRINs still holding inventory. KB (On-Hand Inventory; Inventory Analysis
//     Topic 3/15): "For WRINs no longer in the restaurant submit a zero inventory … enter obsolete WRINs
//     as Waste and discard product." QSRSoft tags these "(Deactivated)" in the description.
//   • Duplicate WRINs — the SAME item carrying inventory under more than one WRIN (an item re-numbered,
//     old WRIN not zeroed). KB (Inventory Analysis Topic 5): "Recount WRIN and put zero inventory under
//     unused WRIN … all duplicate WRINs must be counted down to zero." Detected by matching the item
//     DESCRIPTION across different WRINs — NOT by leading digits (WRINs share a numeric family prefix
//     across unrelated items, e.g. 20073-004 / 20073-008 are different products, not duplicates).
// Pure + tested; the EOM diagnosis surfaces it as an actionable, verify-first pre-close list.

const abs = v => Math.abs(Number(v) || 0);
const amtOf = r => abs(Number(r.onHandAmt) || (Number(r.unitPrice) || 0) * (Number(r.totalUnits) || 0));
const isoOf = d => (d == null ? null : (typeof d === 'string' ? d.slice(0, 10) : (d.toISOString ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))));
// Normalize a description for same-item matching: drop status tags, collapse whitespace, lowercase.
const normDescr = s => String(s || '').replace(/\((deactiv[^)]*|new)\)/ig, '').replace(/\s+/g, ' ').trim().toLowerCase();

export function verifyClearItems(onHandRows, { minAmt = 1 } = {}) {
  const rows = Array.isArray(onHandRows) ? onHandRows : [];
  const deactivated = [];
  const byDescr = {};
  for (const r of rows) {
    const amt = amtOf(r);
    if (amt < minAmt) continue;
    const descr = r.descr || r.desc || String(r.wrin || '');
    const wrin = String(r.wrin || '');
    if (/\(\s*deactiv/i.test(descr) || /\bobsolete\b/i.test(descr))
      deactivated.push({ wrin, descr, onHandAmt: amt, totalUnits: Number(r.totalUnits) || 0, lastCounted: isoOf(r.lastCounted) });
    const key = normDescr(descr);
    if (key) (byDescr[key] || (byDescr[key] = [])).push({ wrin, descr, onHandAmt: amt });
  }
  // Duplicate = one item description carrying inventory under 2+ distinct WRINs.
  const duplicates = Object.values(byDescr)
    .filter(items => new Set(items.map(i => i.wrin)).size > 1)
    .map(items => ({ descr: items[0].descr, items: items.sort((a, b) => b.onHandAmt - a.onHandAmt), total: items.reduce((s, i) => s + i.onHandAmt, 0) }))
    .sort((a, b) => b.total - a.total);
  deactivated.sort((a, b) => b.onHandAmt - a.onHandAmt);
  return {
    deactivated, duplicates,
    deactivatedTotal: deactivated.reduce((s, i) => s + i.onHandAmt, 0),
    duplicateTotal: duplicates.reduce((s, d) => s + d.total, 0),
    nToClear: deactivated.length + duplicates.length,
  };
}
