// @ts-nocheck
// ── Cross-store inventory transfers + duplicate-WRIN rollup ────────────────────
// Extracted from src/views/inventory.js (Decisions Panel Inventory salvage #2/#3,
// decisions-panel-inventory-2026-08-10.md), matching the same split #214 already did for
// INV_MASTER/classifyInvArea (parsers/inventory-parse.js's own header) — pure logic moved to a
// shared layer so a non-view consumer (attention-feed.js) can import it without dragging in the
// 76KB Inventory panel component. views/inventory.js imports these back for its own use;
// behavior is unchanged, this is a pure relocation.
import { INV_ORG_COORDS } from '../constants.js';
import { INV_MASTER } from '../parsers/inventory-parse.js';

// Haversine distance in miles between two stores' INV_ORG_COORDS. Infinity when either store
// has no coords on record (never treat "unknown distance" as "zero distance").
export function invDist(locA, locB) {
  const a = INV_ORG_COORDS[locA], b = INV_ORG_COORDS[locB];
  if (!a || !b || !a.lat || !b.lat) return Infinity;
  const R = 3959, toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLon = toR(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return +(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))).toFixed(1);
}
export function invSameState(locA, locB) {
  const a = INV_ORG_COORDS[locA], b = INV_ORG_COORDS[locB];
  return !!(a && b && a.state && a.state === b.state);
}

// ── Inner Pack Framework (replace with user-provided list via upload) ─────
// Format: {wrin: {unit:'Sleeve',count:100,display:'sleeve'}}
// Until user provides WRIN-level list, common UOM keywords are used.
export function formatXferQty(rawQty, wrin, uom, caseSize) {
  if (rawQty < 0.5) return null;
  const m = wrin ? INV_MASTER[wrin] : null;
  const ipu = m && m.ipu ? m.ipu : null; // inner packs per case
  const ipc = m && m.ipc ? m.ipc : null; // each per inner pack
  const upc = m && m.upc ? m.upc : (caseSize || 1); // each per case
  const fullCs = Math.floor(rawQty);
  const remFrac = rawQty - fullCs;
  const remEach = Math.round(remFrac * upc);
  // How many full inner packs in the remainder?
  const fullIP = ipc && ipc > 0 ? Math.floor(remEach / ipc) : 0;
  const label = m && m.uom && m.uom !== 'EA' ? m.uom : 'EA';
  let parts = [];
  if (fullCs > 0) parts.push(fullCs + (fullCs === 1 ? ' case' : ' cases'));
  if (fullIP > 0) parts.push(fullIP + ' inner pack' + (fullIP !== 1 ? 's' : '') + ' (' + fullIP * ipc + ' ' + label + ')');
  if (!parts.length) {
    // No full inner packs — show as half case
    const halfEach = ipc ? ipc : Math.round(upc / 2);
    return '½ case (' + (ipu && ipu > 0 ? Math.round(upc / ipu) : halfEach) + ' ' + label + ')';
  }
  return parts.join(' + ');
}

// ── WRIN Rollup: group items by first-5-digit base WRIN ────────────────
export function rollupByWRIN(rows) {
  const groups = {};
  rows.forEach(r => {
    const base = r.wrin.replace('-', '').slice(0, 5);
    if (!groups[base]) groups[base] = { items: [] };
    groups[base].items.push(r);
  });
  const result = [];
  Object.values(groups).forEach(g => {
    if (g.items.length === 1) { result.push(g.items[0]); return; }
    // Multiple variants — roll up to master (highest usageDay)
    const master = g.items.reduce((b, r) => r.usageDay > b.usageDay ? r : b, g.items[0]);
    // Normalize to eaches for combining different case sizes
    const totalEach = g.items.reduce((a, r) => a + (r.endingInv || 0) * (r.caseSize || 1), 0);
    const totalUsageEach = g.items.reduce((a, r) => a + (r.usageDay || 0) * (r.caseSize || 1), 0);
    const combinedDays = totalUsageEach > 0 ? +(totalEach / totalUsageEach).toFixed(2) :
      (totalEach > 0 ? 9999 : 0);
    const variants = g.items.filter(r => r.wrin !== master.wrin);
    const inactiveWithStock = variants.filter(r => r.usageDay === 0 && (r.endingInv || 0) > 0);
    result.push({
      ...master,
      usageDay: +(totalUsageEach / (master.caseSize || 1)).toFixed(4),
      usage1000: +(g.items.reduce((a, r) => a + (r.usage1000 || 0), 0)).toFixed(4),
      daysSupply: combinedDays,
      endingInv: +(totalEach / (master.caseSize || 1)).toFixed(3),
      isRolledUp: true,
      rolledUpCount: variants.length,
      rolledUpWrins: variants.map(r => r.wrin),
      inactiveVariants: inactiveWithStock,
      rollupNote: variants.length ?
        'Usage split across ' + g.items.length + ' WRINs (base ' + g.items[0].wrin.slice(0, 8) + '…). Verify manager is using correct WRIN. All variants: ' + g.items.map(r => r.wrin).join(', ') : '',
    });
  });
  return result;
}

export function computeTransfers(allRows, threshold, recvThreshold, fullCaseOnly) {
  const byLocItem = {};
  allRows.forEach(r => {
    if (!byLocItem[r.loc]) byLocItem[r.loc] = {};
    byLocItem[r.loc][r.wrin] = r;
  });
  const locs = Object.keys(byLocItem);
  const transfers = [];
  locs.forEach(sendLoc => {
    Object.values(byLocItem[sendLoc]).forEach(item => {
      if (item.daysSupply <= threshold || item.usageDay <= 0) return;
      const excessCases = (item.daysSupply - threshold) * item.usageDay / (item.eachFmt ? (item.caseSize || 1) : 1);
      if (excessCases < 0.5) return;
      // Find receivers needing this item (same org, < threshold days)
      const recipients = [];
      locs.forEach(recvLoc => {
        if (recvLoc === sendLoc) return;
        if (!invSameState(sendLoc, recvLoc)) return; // same state only
        const recvItem = byLocItem[recvLoc][item.wrin];
        const _recvT = recvThreshold != null ? recvThreshold : threshold;
        if (!recvItem || recvItem.daysSupply >= _recvT) return; // receiver under recvThreshold
        const dist = invDist(sendLoc, recvLoc);
        const deficit = Math.max(0, (threshold - recvItem.daysSupply) * recvItem.usageDay);
        const xferQty = Math.min(excessCases, Math.max(0.5, deficit));
        const _xQty = fullCaseOnly ? Math.floor(xferQty) : xferQty; // round to full case if toggle
        if (fullCaseOnly && _xQty < 1) return; // skip sub-case transfers in full-case-only mode
        const xferFmt = formatXferQty(_xQty, item.wrin, item.uom, item.caseSize) || _xQty.toFixed(2) + ' cs';
        recipients.push({
          recvLoc, recvDays: +recvItem.daysSupply.toFixed(1),
          xferQty: +_xQty.toFixed(2), xferDisplay: xferFmt, dist, value: +(_xQty * item.cost).toFixed(2),
        });
      });
      recipients.sort((a, b) => a.dist - b.dist);
      if (recipients.length === 0) {
        // Show with no recipient
        transfers.push({
          wrin: item.wrin, description: item.description, class_: item.class_,
          sendLoc, recvLoc: null, excessCases: +excessCases.toFixed(2), xferQty: 0,
          sendDays: +item.daysSupply.toFixed(1), recvDays: null, dist: null,
          cost: item.cost, value: 0, noRecipient: true,
        });
      } else {
        recipients.forEach(r => {
          transfers.push({
            wrin: item.wrin, description: item.description, class_: item.class_,
            sendLoc, ...r, excessCases: +excessCases.toFixed(2),
            sendDays: +item.daysSupply.toFixed(1), cost: item.cost,
          });
        });
      }
    });
  });
  return transfers.sort((a, b) => {
    if (a.noRecipient && !b.noRecipient) return 1;
    if (!a.noRecipient && b.noRecipient) return -1;
    return (a.dist || 999) - (b.dist || 999);
  });
}
