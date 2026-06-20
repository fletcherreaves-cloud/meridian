// @ts-nocheck
import { dKey } from './date.js';

// HOLIDAY CALENDAR
// Fixed: hardcoded. Floating: computed algorithmically.
function getEaster(year) {
  // Anonymous Gregorian algorithm
  const a=year%19,b=Math.floor(year/100),cc=year%100;
  const d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25);
  const g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(cc/4),k=cc%4,l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31);
  const day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day,12,0,0);
}
function getNthDow(year,month,nth,dow){
  // nth occurrence of day-of-week (0=Sun) in month (0-indexed)
  const d=new Date(year,month,1,12,0,0);
  const offset=(dow-d.getDay()+7)%7;
  d.setDate(1+offset+(nth-1)*7);
  return d;
}
function getLastDow(year,month,dow){
  const d=new Date(year,month+1,0,12,0,0); // last day of month
  const offset=(d.getDay()-dow+7)%7;
  d.setDate(d.getDate()-offset);
  return d;
}
function buildHolidays(year) {
  var H={};
  // v4.195 holiday model correction (per Fletcher): the OLD model applied a
  // single generic impact multiplier (major=0.50x, moderate=0.80x, etc) to
  // EVERY store equally for major holidays. This was wrong on two counts:
  // (1) Christmas Day is a universal FULL closure, not "50% of normal" — it
  // should be EXCLUDED from calibration entirely once tagged, never
  // adjusted-and-included; (2) Thanksgiving/Christmas Eve/New Year's Eve are
  // open-but-early-close with timing that varies BY LOCATION and is fairly
  // consistent year-over-year for a given store — so the right comparison
  // is "what did THIS store actually do on THIS holiday last year," not a
  // generic multiplier applied to every store the same way.
  // fullClosure: true → exclude entirely from calibration once tagged.
  // partialClosure: true → look up this store's own actual sales on the same
  // calendar holiday in prior years (handled in getHolidayAdj), instead of a
  // flat multiplier.
  var add=function(d,label,impact,opts){if(d&&!isNaN(d)){H[dKey(d)]={label:label,impact:impact||"major",
    fullClosure:!!(opts&&opts.fullClosure), partialClosure:!!(opts&&opts.partialClosure)};}};
  add(new Date(year,0,1,12),"New Year Day","major");
  add(new Date(year,1,14,12),"Valentines Day","minor");
  add(new Date(year,6,4,12),"Independence Day","moderate");
  add(new Date(year,9,31,12),"Halloween","minor");
  add(new Date(year,11,24,12),"Christmas Eve","moderate",{partialClosure:true});
  add(new Date(year,11,25,12),"Christmas Day","major",{fullClosure:true});
  add(new Date(year,11,31,12),"New Year Eve","moderate",{partialClosure:true});
  add(getEaster(year),"Easter Sunday","moderate");
  var easter=getEaster(year);
  var holySat=new Date(easter); holySat.setDate(easter.getDate()-1);
  add(holySat,"Holy Saturday","minor");
  add(getNthDow(year,4,2,0),"Mothers Day","moderate");
  add(getNthDow(year,5,3,0),"Fathers Day","minor");
  add(getLastDow(year,4,1),"Memorial Day","qsr-normal"); // McDonald's: normal to above-normal traffic
  add(getNthDow(year,8,1,1),"Labor Day","qsr-normal");   // McDonald's: normal to above-normal traffic
  add(getNthDow(year,9,2,1),"Columbus Day","minor");
  add(new Date(year,10,11,12),"Veterans Day","minor");
  var tg=getNthDow(year,10,4,4); add(tg,"Thanksgiving","major",{partialClosure:true});
  var bf=new Date(tg); bf.setDate(tg.getDate()+1); add(bf,"Black Friday","minor");
  add(getNthDow(year,0,3,1),"MLK Day","minor");
  add(getNthDow(year,1,3,1),"Presidents Day","minor");
  return H;
}
// Build holiday map for current year ± 2 years
const HOLIDAY_MAP=(()=>{
  const yr=new Date().getFullYear();
  const all={};
  for(let y=yr-7;y<=yr+2;y++) Object.assign(all,buildHolidays(y));
  return all;
})();
function isHoliday(d){ return d?HOLIDAY_MAP[dKey(d)]:null; }

// autoTagHolidays (v4.195) — runs automatically whenever data loads (called
// from both ds.loaded completion points in the file-parsing pipeline),
// instead of only as a side-effect of generating a Review Pack. The old
// version only tagged holidays that happened to already appear in a
// specific store's cached anomaly-scan results — meaning a store that had
// never had a Review Pack generated could go through calibration with its
// holidays never tagged at all (confirmed: this was the root cause behind
// Mossy Head's Dec 24 2025 forecast collapsing toward zero, since its LY
// comparison — Dec 25 2024, Christmas — was never excluded). This version
// scans every distinct loc in laborRows against every entry in HOLIDAY_MAP
// covering that loc's actual date range, and tags any not already present
// in userEvents. Idempotent and cheap to re-run on every load — already-
// tagged dates are skipped, so this never overwrites a person's own
// corrections to an auto-tag (e.g. if a holiday turns out to be a partial
// closure for one specific store and that's been manually adjusted).
function autoTagHolidays(laborRows, userEvents){
  if(!laborRows||!laborRows.length) return {events:userEvents||{}, tagged:0};
  const uev=userEvents||{};
  const locDateRanges={}; // loc -> {min:Date, max:Date}
  for(const r of laborRows){
    if(!r.loc||!r.date) continue;
    if(!locDateRanges[r.loc]) locDateRanges[r.loc]={min:r.date,max:r.date};
    else{
      if(r.date<locDateRanges[r.loc].min) locDateRanges[r.loc].min=r.date;
      if(r.date>locDateRanges[r.loc].max) locDateRanges[r.loc].max=r.date;
    }
  }
  let tagged=0;
  for(const [loc,range] of Object.entries(locDateRanges)){
    for(const [dk,hol] of Object.entries(HOLIDAY_MAP)){
      const hDate=new Date(dk+'T12:00:00');
      if(hDate<range.min||hDate>range.max) continue; // outside this store's actual data range
      if(uev[loc]&&uev[loc][dk]) continue; // already tagged — never overwrite
      if(!uev[loc]) uev[loc]={};
      uev[loc][dk]={label:hol.label,tagLabel:hol.label,type:'holiday',
        source:'Auto-Holiday Scan',aiMatched:false,
        fullClosure:!!hol.fullClosure,partialClosure:!!hol.partialClosure,
        note:'Auto-tagged on data load'};
      tagged++;
    }
  }
  return {events:uev, tagged};
}

function getHolidayAdj(d, loc, laborRows){
  // Returns a forecast multiplier for known holiday impact on QSR (McDonald's context)
  const h=isHoliday(d); if(!h) return 1.0;

  // Full closure (Christmas Day) — should never reach here in practice,
  // since a tagged full-closure day is excluded from calibration entirely
  // upstream (see calibrateStore's eval-row filter and forecastDay's own
  // handling). Defensive fallback only: return a near-zero signal rather
  // than a misleading "50% of normal" guess, since this store/holiday
  // combination is documented as a true closure, not a reduced-traffic day.
  if(h.fullClosure) return 0.02;

  // Partial closure (Thanksgiving, Christmas Eve, New Year's Eve) — early-
  // close timing varies BY LOCATION and is fairly consistent year over year
  // for a given store (confirmed by Fletcher), so use THIS store's own
  // actual sales on the SAME calendar holiday in prior years rather than a
  // generic multiplier. Averages up to 3 prior years when available, falls
  // back to the single most recent prior year, and only falls back to the
  // old generic multiplier if no real prior-year data exists at all (e.g. a
  // brand-new store's first occurrence of this holiday).
  if(h.partialClosure && loc && laborRows && laborRows.length){
    const sameDow=d.getDay();
    const ratios=[];
    for(let yrsBack=1; yrsBack<=3; yrsBack++){
      // Find the SAME holiday label in a prior year (not just -364 days,
      // since holiday dates can shift slightly year to year for floating
      // holidays — though Thanksgiving/Christmas Eve/NYE here are all fixed
      // or fixed-formula dates, this stays correct if ever extended).
      const priorYear=d.getFullYear()-yrsBack;
      const priorMap=buildHolidays(priorYear);
      const priorEntry=Object.entries(priorMap).find(([,v])=>v.label===h.label);
      if(!priorEntry) continue;
      const priorDate=new Date(priorEntry[0]+'T12:00:00');
      const priorRow=(laborRows||[]).find(r=>r.loc===loc&&dKey(r.date)===dKey(priorDate)&&r.sales>0);
      if(!priorRow) continue;
      // Compare against the average of the surrounding non-holiday week for
      // that same prior period, so the ratio reflects "holiday vs normal for
      // this store," not an absolute dollar figure that's since grown/shrunk.
      const surroundDays=[-7,-6,-5,-4,-3,3,4,5,6,7].map(off=>{
        const dd=new Date(priorDate.getTime()+off*864e5);
        return (laborRows||[]).find(r=>r.loc===loc&&dKey(r.date)===dKey(dd)&&r.sales>0);
      }).filter(Boolean);
      if(!surroundDays.length) continue;
      const surroundAvg=surroundDays.reduce((a,r)=>a+r.sales,0)/surroundDays.length;
      if(surroundAvg>0) ratios.push(priorRow.sales/surroundAvg);
    }
    if(ratios.length) return ratios.reduce((a,b)=>a+b,0)/ratios.length;
    // No real prior-year data found for this store/holiday — fall through
    // to the generic multiplier below as a last resort.
  }

  return {major:0.50, moderate:0.80, minor:0.95, 'qsr-normal':1.0}[h.impact]||1.0;
}

export { getEaster, getNthDow, getLastDow, buildHolidays, HOLIDAY_MAP, isHoliday, autoTagHolidays, getHolidayAdj };
