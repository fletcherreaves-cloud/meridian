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

function mwStart(wsd){
  // wsd = week start day: 0=Sun,1=Mon,3=Wed. Default 3 (Wed) per McDonald's standard.
  const startDay = (wsd!==undefined?wsd:_weekStartDay);
  const t=new Date();const d=t.getDay();
  const diff = (d - startDay + 7) % 7;
  return addD(t, -diff);
}
function nwStart(wsd){return addD(mwStart(wsd),7);}
function fmtDI(d){return dKey(d);}
function fmtRng(s,e){if(dKey(s)===dKey(e))return s.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});return s.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function nDays(s,e){return Math.round((e-s)/86400000)+1;}
function rngMode(s,e){const now=sodOf(new Date());if(sodOf(s)>now)return'future';if(eodOf(e)<now)return'past';return'mixed';}

export { addD, addDR, dKey, nDK, dowOf, sodOf, eodOf, setWeekStartDay, mwStart, nwStart, fmtDI, fmtRng, nDays, rngMode };
