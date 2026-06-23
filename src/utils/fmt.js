// @ts-nocheck
export const f$   = n => '$' + Math.round(n || 0).toLocaleString();
export const fPct = (n, d=1) => ((n||0) >= 0 ? '+' : '') + (((n||0)*100).toFixed(d)) + '%';
export const fP   = (n, d=2) => (n||0) ? ((n*100).toFixed(d) + '%') : '—';
export const fN   = (n, d=1) => n != null ? n.toFixed(d) : '—';

export const TH = {
  background: 'var(--surf3)', padding: '5px 8px', fontSize: '8px',
  textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--text2)',
  borderBottom: '.5px solid var(--bdr)', whiteSpace: 'nowrap',
};

export const grade = s => s>=90?'A':s>=80?'B':s>=70?'C':s>=60?'D':'F';
export const gLbl  = s => s>=90?'Elite':s>=80?'Strong':s>=70?'Solid':s>=60?'Developing':'Needs Attn';
export const gCol  = s => s>=90?'#10b981':s>=80?'#84cc16':s>=70?'#eab308':s>=60?'#f97316':'#ef4444';
export const gBg   = s => s>=90?'rgba(16,185,129,.09)':s>=80?'rgba(132,204,18,.09)':s>=70?'rgba(234,179,8,.09)':s>=60?'rgba(249,115,22,.09)':'rgba(239,68,68,.09)';
export const gBdr  = s => s>=90?'#065f46':s>=80?'#14532d':s>=70?'#78350f':s>=60?'#7c2d12':'#7f1d1d';
