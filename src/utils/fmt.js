// @ts-nocheck
// Escape a value for safe interpolation into print/export HTML built via
// document.write (audit C3). Covers the five HTML-significant chars so it is
// safe in both text and single/double-quoted attribute contexts. null/undefined
// render as an empty string (not the literal "null"/"undefined").
export const escapeHtml = s => (s == null ? '' : String(s))
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const f$   = n => '$' + Math.round(n || 0).toLocaleString();
export const fPct = (n, d=1) => ((n||0) >= 0 ? '+' : '') + (((n||0)*100).toFixed(d)) + '%';
export const fP   = (n, d=2) => (n||0) ? ((n*100).toFixed(d) + '%') : '—';
export const fN   = (n, d=1) => n != null ? n.toFixed(d) : '—';

export const TH = {
  background: 'var(--surf3)', padding: '5px 8px', fontSize: '8px',
  textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--text2)',
  borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap',
};

// Alpha-blend a color for a tinted background/border, without breaking on a CSS custom
// property. Moved here from patch-heatmap.js (#351/#368) — `color + hexSuffix` (e.g.
// `status.color + '18'`) only produces valid CSS when `color` is a hex literal;
// concatenating a hex alpha suffix onto a `var(...)` reference yields the literal invalid
// string "var(--crit)18", which the browser silently drops (no console error), so the
// tinted background/border disappears outright. Shared here (rather than importing across
// view files) so a component split out specifically to stay small in the eager bundle
// (model-health-badge.js's own header, #232) never has to statically import a large view
// file just to reach one small pure function.
export const withAlpha = (color, hexSuffix) => {
  if (!color || !color.startsWith('var(')) return color + hexSuffix;
  const pct = Math.round((parseInt(hexSuffix, 16) / 255) * 100);
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
};

export const grade = s => s>=90?'A':s>=80?'B':s>=70?'C':s>=60?'D':'F';
export const gLbl  = s => s>=90?'Elite':s>=80?'Strong':s>=70?'Solid':s>=60?'Developing':'Needs Attn';
export const gCol  = s => s>=90?'#10b981':s>=80?'#84cc16':s>=70?'#eab308':s>=60?'#f97316':'#ef4444';
export const gBg   = s => s>=90?'rgba(16,185,129,.09)':s>=80?'rgba(132,204,18,.09)':s>=70?'rgba(234,179,8,.09)':s>=60?'rgba(249,115,22,.09)':'rgba(239,68,68,.09)';
export const gBdr  = s => s>=90?'#065f46':s>=80?'#14532d':s>=70?'#78350f':s>=60?'#7c2d12':'#7f1d1d';
