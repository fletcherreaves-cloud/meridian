// @ts-nocheck
const addD=(d,n)=>new Date(new Date(d).getTime()+n*86400000);
const dKey=d=>{const dt=new Date(d);return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');};
// nDK: normalize ANY date key → YYYY-MM-DD ISO string.
// Handles: Date objects, full ISO datetimes ("2023-11-23T12:00:00.000Z"), date-only strings.
// Used everywhere tag lookups happen so storage format never drifts.
const nDK=dk=>{
  if(!dk) return '';
  if(dk instanceof Date) return dKey(dk);
  const s=String(dk);
  if(s.length>10&&s.includes('T')) return s.slice(0,10); // strip time from full ISO
  return s;
};

const dowOf=d=>new Date(d).getDay();

const addDR=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
function sodOf(d){const r=new Date(d);r.setHours(0,0,0,0);return r;}
function eodOf(d){const r=new Date(d);r.setHours(23,59,59,999);return r;}
// Module-level week start day (updated when settings load/change)
let _weekStartDay = 3; // 0=Sun, 1=Mon, 3=Wed (McDonald's standard)
function setWeekStartDay(d){ _weekStartDay = (d!==undefined?d:3); }

/**
 * The start of the week CONTAINING an arbitrary date, honouring the configured week
 * start (0=Sun, 1=Mon, 3=Wed — McDonald's standard, and this org's setting).
 *
 * THIS EXISTS BECAUSE ITS ABSENCE CAUSED A BUG CLASS. Until 2026-08-08 this module
 * exported only mwStart(), which answers "the week containing TODAY". Every caller that
 * needed the week containing some OTHER date had to hand-roll the arithmetic — and an
 * audit found 23 distinct week-boundary computations across 13 files, of which 12
 * hardcoded a day and one had the subtraction inverted. The same defect had already been
 * fixed twice, per-panel, and survived both times because no shared helper was extracted.
 *
 * Use this instead of writing `getDay()` arithmetic. If you find yourself computing a
 * week boundary by hand, that is the bug.
 */
function weekStartOf(date, wsd){
  const startDay = (wsd!==undefined?wsd:_weekStartDay);
  const d = sodOf(date instanceof Date ? date : new Date(date));
  const diff = (d.getDay() - startDay + 7) % 7;   // days SINCE the week start
  return addD(d, -diff);
}

/** The week start containing a date, as a YYYY-MM-DD key. */
function weekKeyOf(date, wsd){ return dKey(weekStartOf(date, wsd)); }

function mwStart(wsd){
  // wsd = week start day: 0=Sun,1=Mon,3=Wed. Default 3 (Wed) per McDonald's standard.
  return weekStartOf(new Date(), wsd);
}
function nwStart(wsd){return addD(mwStart(wsd),7);}
function fmtDI(d){return dKey(d);}
function fmtRng(s,e){if(dKey(s)===dKey(e))return s.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});return s.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function nDays(s,e){return Math.round((e-s)/86400000)+1;}
function rngMode(s,e){const now=sodOf(new Date());if(sodOf(s)>now)return'future';if(eodOf(e)<now)return'past';return'mixed';}

function dFmt(d,opts){if(!d)return '—';return d.toLocaleDateString('en-US',opts||{month:'short',day:'numeric',year:'numeric'});}
function dFmtShort(d){return d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—';}
function dFmtDow(d){return d?d.toLocaleDateString('en-US',{weekday:'short'}):'—';}
function thisWeek(){const s=mwStart();const e=new Date(s.getTime()+6*86400000);return{s:sodOf(s),e:eodOf(e),label:'This Week'};}

export { addD, addDR, dKey, nDK, dowOf, sodOf, eodOf, setWeekStartDay, weekStartOf, weekKeyOf, mwStart, nwStart, fmtDI, fmtRng, nDays, rngMode, dFmt, dFmtShort, dFmtDow, thisWeek };
