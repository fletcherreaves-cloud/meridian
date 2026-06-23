// @ts-nocheck
import * as React from 'react';
import { sName, sNameC, DEFAULT_TARGETS, STORE_NAMES } from '../constants.js';
import { dKey, nDays } from '../utils/date.js';
import { gCol } from '../utils/fmt.js';

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const th=(p,...c)=>h('th',p,...c);
const tbl=(p,...c)=>h('table',p,...c);
const inp=(p,...c)=>h('input',p,...c);

// LOCATION INTELLIGENCE — Statistical + AI Deep Dive
function pearsonR(xs,ys){
  var n=xs.length;if(n<5||n!==ys.length)return null;
  var mx=xs.reduce(function(a,b){return a+b;},0)/n;
  var my=ys.reduce(function(a,b){return a+b;},0)/n;
  var num=xs.reduce(function(s,x,i){return s+(x-mx)*(ys[i]-my);},0);
  var dx=xs.reduce(function(s,x){return s+(x-mx)*(x-mx);},0);
  var dy=ys.reduce(function(s,y){return s+(y-my)*(y-my);},0);
  var den=Math.sqrt(dx*dy);
  return den===0?null:+(num/den).toFixed(3);
}
function liDOWPatterns(loc,ds){
  var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var bins=[[],[],[],[],[],[],[]];
  (ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;}).forEach(function(r){bins[r.date.getDay()].push(r.sales);});
  var avgs=bins.map(function(b){return b.length>2?b.reduce(function(a,v){return a+v;},0)/b.length:null;});
  var valid=avgs.filter(function(v){return v!==null;});
  if(!valid.length)return null;
  var grand=valid.reduce(function(a,b){return a+b;},0)/valid.length;
  return{avgs:avgs,days:DAYS,grand:grand,counts:bins.map(function(b){return b.length;})};
}
function liOEPECorr(loc,ds,settings){
  var t=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
  var oepeTgt=t.tOepe||240;
  var pairs=[];
  (ds.opsRows||[]).filter(function(r){return r.loc===loc&&r.oepe>0;}).forEach(function(r){
    var dk=dKey(r.date);
    var lr=(ds.laborRows||[]).find(function(l){return l.loc===loc&&dKey(l.date)===dk&&l.sales>0;});
    if(lr)pairs.push({oepe:r.oepe,sales:lr.sales});
  });
  if(pairs.length<10)return null;
  var r=pearsonR(pairs.map(function(p){return p.oepe;}),pairs.map(function(p){return p.sales;}));
  var above=pairs.filter(function(p){return p.oepe>oepeTgt;}),at=pairs.filter(function(p){return p.oepe<=oepeTgt;});
  var avgAbove=above.length>3?above.reduce(function(s,p){return s+p.sales;},0)/above.length:null;
  var avgAt=at.length>3?at.reduce(function(s,p){return s+p.sales;},0)/at.length:null;
  var pct=avgAbove&&avgAt?(avgAbove-avgAt)/avgAt:null;
  return{r:r,n:pairs.length,pct:pct,avgAbove:avgAbove,avgAt:avgAt,oepeTgt:oepeTgt,above:above.length,at:at.length};
}
function liWeatherCorr(loc,ds){
  if(!ds.wxByDate||!Object.keys(ds.wxByDate).length)return null;
  var pairs=[];
  (ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;}).forEach(function(r){
    var wx=ds.wxByDate[dKey(r.date)];
    if(wx)pairs.push({sales:r.sales,rain:wx.rain||0,rmax:wx.rmax||0,
      tmax:wx.tmax||0,tmin:wx.tmin||0,wspd:wx.wspd||0,wmax:wx.wmax||0,mslp:wx.mslp||0});
  });
  if(pairs.length<20)return null;
  // Bucket helpers
  function split(arr,key,cutHigh,cutLow){
    var hi=arr.filter(function(p){return p[key]>cutHigh;});
    var lo=arr.filter(function(p){return p[key]<=cutLow;});
    var avg=function(a){return a.length>3?a.reduce(function(s,p){return s+p.sales;},0)/a.length:null;};
    var impact=function(a,b){return(a&&b)?(a-b)/b:null;};
    return{hi:avg(hi),lo:avg(lo),impact:impact(avg(hi),avg(lo)),n:hi.length};
  }
  var rainD=pairs.filter(function(p){return p.rain>0.1;}),dryD=pairs.filter(function(p){return p.rain<=0.1;});
  var avgRain=rainD.length>3?rainD.reduce(function(s,p){return s+p.sales;},0)/rainD.length:null;
  var avgDry=dryD.length>3?dryD.reduce(function(s,p){return s+p.sales;},0)/dryD.length:null;
  var rainImpact=avgRain&&avgDry?(avgRain-avgDry)/avgDry:null;
  var coldD=pairs.filter(function(p){return p.tmax<40;}),hotD=pairs.filter(function(p){return p.tmax>95;}),mildD=pairs.filter(function(p){return p.tmax>=40&&p.tmax<=95;});
  var windHeavy=split(pairs,'wmax',30,15);
  var windSpd=split(pairs,'wspd',20,10);
  var highRain=split(pairs,'rmax',0.2,0.05);   // peak 5-min intensity
  var pressure=split(pairs,'mslp',1020,1005);   // high pressure vs low pressure
  return{n:pairs.length,rainDays:rainD.length,dryDays:dryD.length,avgRain:avgRain,avgDry:avgDry,rainImpact:rainImpact,
    avgCold:coldD.length>3?coldD.reduce(function(s,p){return s+p.sales;},0)/coldD.length:null,
    avgHot:hotD.length>3?hotD.reduce(function(s,p){return s+p.sales;},0)/hotD.length:null,
    avgMild:mildD.length>3?mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length:null,
    windHeavy:windHeavy,windSpd:windSpd,highRain:highRain,pressure:pressure,
    // Full variable array for correlation matrix display
    variables:[
      {key:'rain',label:'Rainfall',unit:'in',icon:'🌧',impact:rainImpact,n:rainD.length,group:'Weather'},
      {key:'rmax',label:'Peak 5-min Rain',unit:'in',icon:'⛈',impact:highRain.impact,n:highRain.n,group:'Weather'},
      {key:'wmax',label:'Max Wind Gust',unit:'mph',icon:'💨',impact:windHeavy.impact?-windHeavy.impact:null,n:windHeavy.n,group:'Weather'},
      {key:'wspd',label:'Avg Wind Speed',unit:'mph',icon:'💨',impact:windSpd.impact?-windSpd.impact:null,n:windSpd.n,group:'Weather'},
      {key:'tmax_hot',label:'High Heat (>95°F)',unit:'°F',icon:'🌡',impact:hotD.length>3&&mildD.length>3?(hotD.reduce(function(s,p){return s+p.sales;},0)/hotD.length-mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length)/(mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length):null,n:hotD.length,group:'Weather'},
      {key:'tmax_cold',label:'Cold Days (<40°F)',unit:'°F',icon:'🌨',impact:coldD.length>3&&mildD.length>3?(coldD.reduce(function(s,p){return s+p.sales;},0)/coldD.length-mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length)/(mildD.reduce(function(s,p){return s+p.sales;},0)/mildD.length):null,n:coldD.length,group:'Weather'},
      {key:'mslp',label:'High Pressure',unit:'mb',icon:'📊',impact:pressure.impact,n:pressure.n,group:'Weather'},
    ].filter(function(v){return v.impact!=null&&v.n>=5;})
  };
}
// ── Ops metric correlations (TPPH, DT Parked%, OEPE vs sales) ────────────
function liOpsCorr(loc,ds){
  var result={variables:[]};
  var labMap={};
  (ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;}).forEach(function(r){labMap[dKey(r.date)]=r;});
  var ctrl=(ds.ctrlRows||[]).filter(function(r){return r.loc===loc;});
  var ops=(ds.opsRows||[]).filter(function(r){return r.loc===loc;});
  // TPPH (higher=better → positive correlation with sales)
  var tpphPairs=ctrl.filter(function(r){return r.tpph>0&&labMap[dKey(r.date)];}).map(function(r){return{x:r.tpph,s:labMap[dKey(r.date)].sales};});
  if(tpphPairs.length>=20){
    var med=tpphPairs.map(function(p){return p.x;}).sort(function(a,b){return a-b;})[Math.floor(tpphPairs.length/2)];
    var hi=tpphPairs.filter(function(p){return p.x>=med;}),lo=tpphPairs.filter(function(p){return p.x<med;});
    var avg=function(a){return a.reduce(function(s,p){return s+p.s;},0)/a.length;};
    var imp=hi.length&&lo.length?(avg(hi)-avg(lo))/avg(lo):null;
    if(imp!=null)result.variables.push({key:'tpph',label:'TPPH (Transactions/Person/Hr)',unit:'trans',icon:'⚡',impact:imp,n:tpphPairs.length,group:'Operations',positiveIsGood:true});
  }
  // DT Parked % (higher=worse → negative correlation)
  var parkPairs=ops.filter(function(r){return r.dtParked!=null&&labMap[dKey(r.date)];}).map(function(r){return{x:r.dtParked,s:labMap[dKey(r.date)].sales};});
  if(parkPairs.length>=20){
    var medP=parkPairs.map(function(p){return p.x;}).sort(function(a,b){return a-b;})[Math.floor(parkPairs.length/2)];
    var hiP=parkPairs.filter(function(p){return p.x>=medP;}),loP=parkPairs.filter(function(p){return p.x<medP;});
    var avgP=function(a){return a.reduce(function(s,p){return s+p.s;},0)/a.length;};
    var impP=hiP.length&&loP.length?(avgP(hiP)-avgP(loP))/avgP(loP):null;
    if(impP!=null)result.variables.push({key:'dtParked',label:'DT Parked %',unit:'%',icon:'🚗',impact:impP,n:parkPairs.length,group:'Operations',positiveIsGood:false,invert:true});
  }
  // OEPE (lower=better → negative correlation)
  var oepePairs=ops.filter(function(r){return r.oepeWoP>0&&labMap[dKey(r.date)];}).map(function(r){return{x:r.oepeWoP,s:labMap[dKey(r.date)].sales};});
  if(oepePairs.length>=20){
    var medO=oepePairs.map(function(p){return p.x;}).sort(function(a,b){return a-b;})[Math.floor(oepePairs.length/2)];
    var hiO=oepePairs.filter(function(p){return p.x>=medO;}),loO=oepePairs.filter(function(p){return p.x<medO;});
    var avgO=function(a){return a.reduce(function(s,p){return s+p.s;},0)/a.length;};
    var impO=hiO.length&&loO.length?(avgO(hiO)-avgO(loO))/avgO(loO):null;
    if(impO!=null)result.variables.push({key:'oepe',label:'OEPE Without Parked (sec)',unit:'s',icon:'⏱',impact:impO,n:oepePairs.length,group:'Operations',positiveIsGood:false,invert:true});
  }
  return result.variables.length?result:null;
}
function liOppCost(loc,ds){
  var rows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0&&r.oppCostDollar>0;});
  if(rows.length<5)return null;
  var totalOpp=rows.reduce(function(s,r){return s+r.oppCostDollar;},0);
  var totalSales=rows.reduce(function(s,r){return s+r.sales;},0);
  return{totalOpp:totalOpp,totalSales:totalSales,annualized:totalOpp/rows.length*365,pctRev:totalSales>0?totalOpp/totalSales:0,rows:rows.length};
}
function liLaborCoverage(loc,ds){
  var rows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0&&r.actVsNeed!==0&&r.actVsNeed!=null;});
  if(rows.length<10)return null;
  var under=rows.filter(function(r){return r.actVsNeed<-1;}),ok=rows.filter(function(r){return r.actVsNeed>=-1;});
  var avgUnder=under.length>3?under.reduce(function(s,r){return s+r.sales;},0)/under.length:null;
  var avgOk=ok.length>3?ok.reduce(function(s,r){return s+r.sales;},0)/ok.length:null;
  return{pctUnder:rows.length>0?under.length/rows.length:0,impact:avgUnder&&avgOk?(avgUnder-avgOk)/avgOk:null,avgUnder:avgUnder,avgOk:avgOk,rows:rows.length};
}
function liAvgCheckTrend(loc,ds){
  var rows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0&&r.avgCheck>0&&r.gc>0;}).sort(function(a,b){return a.date-b.date;});
  if(rows.length<10)return null;
  var r=pearsonR(rows.map(function(r){return r.avgCheck;}),rows.map(function(r){return r.gc;}));
  var recent=rows.slice(-14),older=rows.slice(0,Math.min(14,rows.length));
  var recentAvg=recent.reduce(function(s,r){return s+r.avgCheck;},0)/recent.length;
  var olderAvg=older.reduce(function(s,r){return s+r.avgCheck;},0)/older.length;
  return{r:r,trend:(recentAvg-olderAvg)/olderAvg,recentAvg:recentAvg,olderAvg:olderAvg,rows:rows.length};
}
function liComputeAll(loc,ds,settings){
  if(!ds||!ds.loaded)return null;
  var cut6w=new Date(Date.now()-42*864e5);
  var laborRows=(ds.laborRows||[]).filter(function(r){return r.loc===loc&&r.sales>0;});
  var recent6w=laborRows.filter(function(r){return r.date>cut6w;});
  var avgWeeklySales=recent6w.length>0?recent6w.reduce(function(s,r){return s+r.sales;},0)/6:0;
  var avgDailySales=recent6w.length>0?recent6w.reduce(function(s,r){return s+r.sales;},0)/recent6w.length:0;
  var t=(settings.targets&&settings.targets[loc])||DEFAULT_TARGETS[loc]||{};
  return{loc:loc,name:sName(loc),
    annualSales:avgWeeklySales*52,avgDailySales:avgDailySales,avgWeeklySales:avgWeeklySales,
    oepe:liOEPECorr(loc,ds,settings),weather:liWeatherCorr(loc,ds),opsCorr:liOpsCorr(loc,ds),dow:liDOWPatterns(loc,ds),
    labor:liLaborCoverage(loc,ds),opp:liOppCost(loc,ds),avgCheck:liAvgCheckTrend(loc,ds),
    dataRows:laborRows.length,tgt:t};
}
function liBuildRoadmap(stats){
  if(!stats)return[];
  var opps=[],ann=stats.annualSales||0;
  if(stats.oepe&&stats.oepe.pct!=null&&Math.abs(stats.oepe.pct)>0.01){
    opps.push({cat:'Service Speed',icon:'⏱',metric:'OEPE',
      finding:'Drive-thru speed directly correlates with daily revenue at this location.',
      detail:'OEPE above target on '+stats.oepe.above+' days measured. '+(stats.oepe.pct<0?'Faster service days averaged '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% more in sales than slower days.':'Slower service days show '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% lower sales vs. on-target days.'),
      action:'Implement structured car-pull discipline and pre-staging during peak windows. Target: under '+stats.oepe.oepeTgt+'s consistently.',
      dollarOpp:Math.abs(stats.oepe.pct)*ann});
  }
  if(stats.opp&&stats.opp.annualized>500){
    opps.push({cat:'Revenue Capture',icon:'💰',metric:'Opportunity Cost',
      finding:'Measurable OEPE-related lost sales are recoverable with consistent service focus.',
      detail:'Avg $'+Math.round(stats.opp.totalOpp/stats.opp.rows).toLocaleString()+'/day in opportunity cost over '+stats.opp.rows+' measured days. Annualized: $'+Math.round(stats.opp.annualized).toLocaleString()+' ('+( stats.opp.pctRev*100).toFixed(1)+'% of revenue).',
      action:'Target OEPE consistently below '+( stats.tgt.tOepe||240)+'s. Prioritize peak-hour service flow and disciplined car-pull protocol.',
      dollarOpp:stats.opp.annualized});
  }
  if(stats.labor&&stats.labor.impact!=null&&Math.abs(stats.labor.impact)>0.02){
    var dolOpp=Math.abs(stats.labor.impact)*stats.labor.pctUnder*ann;
    opps.push({cat:'Staffing',icon:'👥',metric:'Labor Coverage',
      finding:'Understaffed days are statistically linked to lower sales performance.',
      detail:(stats.labor.pctUnder*100).toFixed(0)+'% of days run more than 1 hour under needed labor. '+(stats.labor.impact<0?'Understaffed days average '+(Math.abs(stats.labor.impact)*100).toFixed(1)+'% less in sales vs. adequately-staffed days.':''),
      action:'Review weekly scheduling templates for recurring gaps. Ensure floor management coverage during all peak dayparts.',
      dollarOpp:dolOpp>0?dolOpp:0});
  }
  if(stats.weather&&stats.weather.rainImpact!=null&&Math.abs(stats.weather.rainImpact)>0.02){
    opps.push({cat:'Weather Awareness',icon:'🌧',metric:'Weather Sensitivity',
      finding:'This location shows measurable weather-related sales variance worth planning around.',
      detail:'Rain days average '+(Math.abs(stats.weather.rainImpact)*100).toFixed(1)+'% '+(stats.weather.rainImpact<0?'lower':'higher')+' sales vs. dry days (based on '+stats.weather.rainDays+' rainy days). '+(stats.weather.avgCold?'Cold-weather (<40°F) days also show distinct patterns.':''),
      action:'Build weather-aware scheduling templates. Adjust staffing and product mix prep based on forecast.',
      dollarOpp:Math.abs(stats.weather.rainImpact)*ann*(stats.weather.rainDays/Math.max(1,stats.weather.n))});
  }
  opps.sort(function(a,b){return b.dollarOpp-a.dollarOpp;});
  return opps.slice(0,5);
}
function liGenerateExportHTML(stats,roadmap,aiContent,mode,districtName){
  var name=stats.name||'Location';
  var now=new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  var dname=districtName||'MCDOK';
  var fmtD=function(v){return v==null?'—':'$'+Math.round(v).toLocaleString();};
  var fmtP=function(v){return v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';};
  var css='*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:-apple-system,Helvetica Neue,Arial,sans-serif;color:#1e293b;background:#fff;font-size:12px}'
    +'.hdr{background:#090e18;color:#fff;padding:20px 28px;display:flex;align-items:center;gap:14px}'
    +'.mark{width:36px;height:36px;background:#f59e0b;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#000;flex-shrink:0}'
    +'.brand{font-size:13px;font-weight:800;color:#f59e0b}.meta{font-size:10px;color:#94a3b8;margin-top:2px}'
    +'.rpt-title{font-size:20px;font-weight:800;padding:18px 28px 10px;border-bottom:2px solid #f59e0b;margin-bottom:0}'
    +'.sec{padding:14px 28px;border-bottom:0.5px solid #e2e8f0}'
    +'.sec-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#f59e0b;margin-bottom:10px}'
    +'.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}'
    +'.kpi{background:#f8fafc;border:0.5px solid #e2e8f0;border-radius:6px;padding:10px 14px}'
    +'.kpi-lbl{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#64748b}'
    +'.kpi-val{font-size:17px;font-weight:700;color:#1e293b;margin-top:3px}.kpi-val.green{color:#10b981}'
    +'.stat{font-size:10px;color:#475569;margin-bottom:5px;line-height:1.5}.stat-lbl{font-weight:700;color:#334155}'
    +'.opp{display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;padding:10px;background:#f8fafc;border-radius:6px;border:0.5px solid #e2e8f0}'
    +'.opp-rank{width:24px;height:24px;border-radius:50%;background:#f59e0b;color:#000;font-weight:900;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}'
    +'.opp-cat{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:2px}'
    +'.opp-title{font-weight:700;font-size:11px;color:#1e293b;margin-bottom:2px}'
    +'.opp-dollar{font-size:14px;font-weight:800;color:#10b981;margin:2px 0}'
    +'.opp-detail{font-size:9px;color:#475569;line-height:1.4;margin-bottom:3px}.opp-action{font-size:9px;color:#1e40af;line-height:1.4}'
    +'.corr-row{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:0.5px solid #f1f5f9;gap:12px}'
    +'.corr-label{font-size:11px;font-weight:700;color:#1e293b;margin-bottom:2px}'
    +'.corr-detail{font-size:9px;color:#64748b;line-height:1.4}'
    +'.corr-val{font-size:11px;font-weight:700;flex-shrink:0;text-align:right}'
    +'.dow-row{display:flex;align-items:center;gap:8px;margin-bottom:4px}'
    +'.dow-lbl{width:28px;font-size:9px;color:#64748b;text-align:right;flex-shrink:0}'
    +'.dow-bar-wrap{flex:1;background:#f1f5f9;border-radius:3px;height:14px;overflow:hidden}'
    +'.dow-bar{height:14px;background:#f59e0b;opacity:.65;border-radius:3px}'
    +'.dow-val{width:72px;font-size:9px;text-align:right;flex-shrink:0;font-weight:700}'
    +'.dow-vs{width:40px;font-size:8px;text-align:right;flex-shrink:0}'
    +'.wx-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}'
    +'.wx-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid #f1f5f9;font-size:10px}'
    +'.ai-txt{font-size:11px;line-height:1.8;color:#1e293b;white-space:pre-wrap}'
    +'.footer{padding:10px 28px;text-align:center;font-size:8px;color:#94a3b8;border-top:0.5px solid #e2e8f0;margin-top:4px}'
    +'@media print{.hdr{background:#000!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}'
    +'.dow-bar{background:#f59e0b!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.kpi-row{display:grid!important}}';

  // Performance overview section
  var kpiHTML='<div class="kpi-row">'
    +'<div class="kpi"><div class="kpi-lbl">Est. Annual Revenue</div><div class="kpi-val">'+fmtD(stats.annualSales)+'</div></div>'
    +'<div class="kpi"><div class="kpi-lbl">Avg Daily Sales</div><div class="kpi-val">'+fmtD(stats.avgDailySales)+'</div></div>'
    +'<div class="kpi"><div class="kpi-lbl">Historical Data Points</div><div class="kpi-val">'+stats.dataRows+'</div></div>'
    +'<div class="kpi"><div class="kpi-lbl">Total Opp / Year</div><div class="kpi-val green">'+fmtD(roadmap.reduce(function(s,o){return s+o.dollarOpp;},0))+'</div></div>'
    +'</div>'
    +(stats.oepe?'<div class="stat"><span class="stat-lbl">OEPE Correlation:</span> '+(stats.oepe.r!=null?'r\u2009=\u2009'+stats.oepe.r+' ('+stats.oepe.n+' paired days)':'insufficient data')+(stats.oepe.pct!=null?' \u2014 '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% sales variance vs. target adherence.':'')+'</div>':'')
    +(stats.weather?'<div class="stat"><span class="stat-lbl">Weather Impact:</span> Rain days '+(stats.weather.rainImpact!=null?fmtP(stats.weather.rainImpact)+' vs. dry-day average':'insufficient data')+'.</div>':'')
    +(stats.opp?'<div class="stat"><span class="stat-lbl">Opportunity Cost:</span> '+fmtD(stats.opp.annualized)+'/yr annualized ('+(stats.opp.pctRev*100).toFixed(1)+'% of revenue, '+stats.opp.rows+' days).</div>':'');

  // Growth Roadmap
  var oppHTML=roadmap.map(function(o,i){
    return '<div class="opp"><div class="opp-rank">'+(i+1)+'</div><div style="flex:1">'
      +'<div class="opp-cat">'+o.icon+' '+o.cat+' \u2014 '+o.metric+'</div>'
      +'<div class="opp-title">'+o.finding+'</div>'
      +'<div class="opp-dollar">'+fmtD(o.dollarOpp)+'/yr opportunity</div>'
      +'<div class="opp-detail">'+o.detail+'</div>'
      +'<div class="opp-action"><strong>Action:</strong> '+o.action+'</div>'
      +'</div></div>';
  }).join('');

  // Operational Correlations
  var corrHTML='';
  if(stats.oepe){
    var oepeColor=stats.oepe.pct!=null?(Math.abs(stats.oepe.pct)>0.03?'#ef4444':'#64748b'):'#64748b';
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\u23f1 OEPE \u2192 Sales</div>'
      +'<div class="corr-detail">'+(stats.oepe.pct!=null?(stats.oepe.pct<0?'Faster service days average '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% more in sales. Target: '+stats.oepe.oepeTgt+'s.':'Slower days show '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% lower sales vs. on-target days.'):'Insufficient paired data.')+'<br><em>'+stats.oepe.n+' paired days analyzed.</em></div>'
      +'</div><div class="corr-val" style="color:'+oepeColor+'">'+(stats.oepe.r!=null?'r\u2009=\u2009'+stats.oepe.r:'—')+'</div></div>';
  }
  if(stats.labor){
    var labColor=stats.labor.impact!=null?(stats.labor.impact<-0.02?'#ef4444':'#10b981'):'#64748b';
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\uD83D\uDC65 Labor Coverage \u2192 Sales</div>'
      +'<div class="corr-detail">Understaffed days (>1hr under needed): '+(stats.labor.pctUnder*100).toFixed(0)+'% of periods. '+(stats.labor.avgUnder&&stats.labor.avgOk?'Understaffed avg: '+fmtD(stats.labor.avgUnder)+' vs. adequate: '+fmtD(stats.labor.avgOk)+'.':'')+'</div>'
      +'</div><div class="corr-val" style="color:'+labColor+'">'+(stats.labor.impact!=null?fmtP(stats.labor.impact):'—')+'</div></div>';
  }
  if(stats.opp){
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\uD83D\uDCB0 Opportunity Cost</div>'
      +'<div class="corr-detail">Avg $'+Math.round(stats.opp.totalOpp/stats.opp.rows).toLocaleString()+'/day over '+stats.opp.rows+' days. '+(stats.opp.pctRev*100).toFixed(1)+'% of revenue.</div>'
      +'</div><div class="corr-val" style="color:#f59e0b">'+fmtD(stats.opp.annualized)+'/yr</div></div>';
  }
  if(stats.avgCheck){
    var acColor=stats.avgCheck.trend!=null?(stats.avgCheck.trend>0.01?'#10b981':stats.avgCheck.trend<-0.01?'#ef4444':'#64748b'):'#64748b';
    corrHTML+='<div class="corr-row"><div style="flex:1"><div class="corr-label">\uD83D\uDCB3 Avg Check Trend</div>'
      +'<div class="corr-detail">Recent avg: $'+(stats.avgCheck.recentAvg||0).toFixed(2)+' vs. older: $'+(stats.avgCheck.olderAvg||0).toFixed(2)+'. Check\u2194GC correlation: r\u2009=\u2009'+(stats.avgCheck.r||'—')+'.</div>'
      +'</div><div class="corr-val" style="color:'+acColor+'">'+(stats.avgCheck.trend!=null?fmtP(stats.avgCheck.trend)+' recent':'—')+'</div></div>';
  }

  // Day-of-Week patterns
  var dowHTML='';
  if(stats.dow){
    var DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var grand=stats.dow.grand||1;
    dowHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 24px">';
    stats.dow.avgs.forEach(function(avg,i){
      if(!avg)return;
      var bar=Math.min(100,avg/grand*100);
      var vsG=(avg-grand)/grand;
      var vc=vsG>0.02?'color:#10b981':vsG<-0.02?'color:#ef4444':'color:#94a3b8';
      dowHTML+='<div class="dow-row">'
        +'<div class="dow-lbl">'+DAYS[i]+'</div>'
        +'<div class="dow-bar-wrap"><div class="dow-bar" style="width:'+bar.toFixed(1)+'%"></div></div>'
        +'<div class="dow-val">'+fmtD(avg)+'</div>'
        +'<div class="dow-vs" style="'+vc+'">'+(vsG>=0?'+':'')+(vsG*100).toFixed(0)+'%</div>'
        +'</div>';
    });
    dowHTML+='</div>';
  }

  // Weather
  var wxHTML='';
  if(stats.weather){
    wxHTML='<div class="wx-grid"><div><div style="font-weight:700;font-size:10px;margin-bottom:6px">Precipitation</div>'
      +(stats.weather.avgDry?'<div class="wx-row"><span>\u2600\ufe0f Dry days ('+stats.weather.dryDays+')</span><span>'+fmtD(stats.weather.avgDry)+'</span></div>':'')
      +(stats.weather.avgRain?'<div class="wx-row"><span>\uD83C\uDF27 Rain days ('+stats.weather.rainDays+')</span><span>'+fmtD(stats.weather.avgRain)+'</span></div>':'')
      +(stats.weather.rainImpact?'<div style="font-size:9px;color:#64748b;margin-top:4px">Impact: '+fmtP(stats.weather.rainImpact)+' vs. dry</div>':'')
      +'</div><div><div style="font-weight:700;font-size:10px;margin-bottom:6px">Temperature Bands</div>'
      +(stats.weather.avgCold?'<div class="wx-row"><span>\uD83E\uDD76 Cold (<40\u00b0F)</span><span>'+fmtD(stats.weather.avgCold)+'</span></div>':'')
      +(stats.weather.avgMild?'<div class="wx-row"><span>\uD83D\uDE0A Mild (40-95\u00b0F)</span><span>'+fmtD(stats.weather.avgMild)+'</span></div>':'')
      +(stats.weather.avgHot?'<div class="wx-row"><span>\uD83E\uDD75 Hot (>95\u00b0F)</span><span>'+fmtD(stats.weather.avgHot)+'</span></div>':'')
      +'</div></div>';
  }

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Location Intelligence \u2014 '+name+'</title>'
    +'<style>'+css+'</style></head><body>'
    +'<div class="hdr"><div class="mark">M</div><div><div class="brand">Meridian</div><div class="meta">'+dname+' \u00b7 Generated '+now+'</div></div></div>'
    +'<div class="rpt-title">\uD83D\uDCCA Location Intelligence Report \u2014 '+name+'</div>'
    +'<div class="sec"><div class="sec-title">Performance Overview</div>'+kpiHTML+'</div>'
    +'<div class="sec"><div class="sec-title">\uD83D\uDCB0 Growth Roadmap \u2014 Ranked Opportunities</div>'
    +(oppHTML||'<div style="color:#94a3b8;font-size:11px">Insufficient data. Load at least 6 weeks of operations data.</div>')+'</div>'
    +(corrHTML?'<div class="sec"><div class="sec-title">\uD83D\uDCC8 Operational Correlations</div>'+corrHTML+'</div>':'')
    +(dowHTML?'<div class="sec"><div class="sec-title">\uD83D\uDCC5 Day-of-Week Sales Patterns</div>'+dowHTML+'</div>':'')
    +(wxHTML?'<div class="sec"><div class="sec-title">\uD83C\uDF26 Weather Impact Analysis</div>'+wxHTML+'</div>':'')
    +(mode==='ai'&&aiContent?'<div class="sec"><div class="sec-title">\uD83E\uDD16 AI Intelligence Brief</div><div class="ai-txt">'+aiContent+'</div></div>':'')
    +'<div class="footer">Meridian \u00b7 Location Intelligence \u00b7 '+now+' \u00b7 Confidential \u2014 For internal use only</div>'
    +'</body></html>';
}
async function liGenerateAI(stats,roadmap,onUpdate){
  var truncStats={location:stats.name,estimatedAnnualRevenue:stats.annualSales,dataPoints:stats.dataRows,
    oepeCorrelation:stats.oepe?{pearsonR:stats.oepe.r,salesVariancePct:stats.oepe.pct,daysAboveTarget:stats.oepe.above,target:stats.oepe.oepeTgt}:null,
    weatherSensitivity:stats.weather?{rainImpactPct:stats.weather.rainImpact,rainDaysMeasured:stats.weather.rainDays}:null,
    laborCoverageImpact:stats.labor?{pctDaysUnderstaffed:stats.labor.pctUnder,salesImpactPct:stats.labor.impact}:null,
    annualizedOppCost:stats.opp?stats.opp.annualized:null,
    topOpportunities:roadmap.slice(0,3).map(function(o){return{category:o.cat,dollarOpp:Math.round(o.dollarOpp),action:o.action};})};
  var prompt="You are a senior McDonald's operations consultant with 30+ years of experience, advising a district manager. Write a Location Intelligence Report for "+stats.name+" in natural, conversational language.\n\nDATA:\n"+JSON.stringify(truncStats,null,2)+"\n\nFORMAT:\n**Executive Summary** (2-3 sentences: where this location stands, one key strength, one key opportunity)\n\n**What's Driving Performance** (3-4 bullets, each tied to a specific number from the data, lead with positives)\n\n**Top Growth Opportunities** (rank top 3 by dollar impact; for each: what the data shows, why it matters, specific action, estimated annual opportunity in dollars)\n\n**90-Day Focus** (single most impactful action, what to measure weekly, what success looks like)\n\nRequirements: Sound like a knowledgeable colleague briefing a peer. Every claim must reference a specific number. Frame opportunities positively. Use dollar amounts not just percentages.";
  try{
    var resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1200,messages:[{role:'user',content:prompt}]})});
    var d=await resp.json();
    var text=(d.content&&d.content.map(function(c){return c.text||'';}).join(''))||'';
    onUpdate(text);
  }catch(e){onUpdate('Error generating AI narrative: '+e.message);}
}
function LocationIntelligence({store,allStores,ds,settings,scope,onClose}){
  var [mode,setMode]=React.useState('statistical');
  var [activeLevel,setActiveLevel]=React.useState(scope||'store');
  var [selLoc,setSelLoc]=React.useState(store?store.loc:(allStores&&allStores[0]&&allStores[0].loc)||'');
  var [aiContent,setAiContent]=React.useState('');
  var [generating,setGenerating]=React.useState(false);
  var [expandedStore,setExpandedStore]=React.useState(null);
  var locs=React.useMemo(function(){return(allStores||[]).filter(function(s){return/^\d+$/.test(s.loc);}).map(function(s){return s.loc;});},
    [allStores]);
  var stats=React.useMemo(function(){
    if(!ds||!ds.loaded)return null;
    if(activeLevel==='store'&&selLoc)return liComputeAll(selLoc,ds,settings);
    var all=locs.map(function(l){return liComputeAll(l,ds,settings);}).filter(Boolean);
    if(!all.length)return null;
    return{loc:'ROLLUP',name:activeLevel==='district'?'District Overview':'Roll-Up View',
      annualSales:all.reduce(function(s,r){return s+(r.annualSales||0);},0),
      avgDailySales:all.reduce(function(s,r){return s+(r.avgDailySales||0);},0)/all.length,
      avgWeeklySales:all.reduce(function(s,r){return s+(r.avgWeeklySales||0);},0),
      dataRows:all.reduce(function(s,r){return s+(r.dataRows||0);},0),
      stores:all,tgt:{}};
  },[ds,settings,activeLevel,selLoc,locs.join(',')]);
  var roadmap=React.useMemo(function(){
    if(!stats||!ds||!ds.loaded)return[];
    if(activeLevel==='store')return liBuildRoadmap(stats);
    var all=(stats.stores||[]).map(function(s){return liBuildRoadmap(s);}).reduce(function(a,b){return a.concat(b);},[]);
    all.sort(function(a,b){return b.dollarOpp-a.dollarOpp;});
    return all.slice(0,5);
  },[stats,activeLevel,ds]);
  var handleGenAI=async function(){
    if(!stats)return;
    // AI API calls are blocked by browser security when running from file:// protocol
    if(window.location.protocol==='file:'){
      setAiContent('AI Narrative is unavailable when running from a local file.\n\nBrowser security blocks API calls from the file:// protocol.\n\nTo enable AI Narrative:\n1. Serve the file through a local web server, OR\n2. Use the Statistical mode above — it contains the same underlying analysis without requiring an internet connection.\n\nYour Growth Roadmap and Operational Correlations below are complete and fully data-driven.');
      return;
    }
    setGenerating(true);setAiContent('');
    await liGenerateAI(stats,roadmap,function(txt){setAiContent(txt);setGenerating(false);});
  };
  var handlePrint=function(){
    if(!stats)return;
    var html=liGenerateExportHTML(stats,roadmap,aiContent,mode,settings.districtName);
    var w=window.open('','_blank');
    if(w){w.document.write(html);w.document.close();w.focus();setTimeout(function(){w.print();},600);}
  };
  var handleDownload=function(){
    if(!stats)return;
    var html=liGenerateExportHTML(stats,roadmap,aiContent,mode,settings.districtName);
    var blob=new Blob([html],{type:'text/html'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='McForecast_LI_'+(stats.name||'report').replace(/[^a-z0-9]/gi,'_')+'_'+new Date().toISOString().slice(0,10)+'.html';
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
  };
  var noData=!ds||!ds.loaded;
  var fmtD=function(v){return v==null?'—':'$'+Math.round(v).toLocaleString();};
  var fmtPct=function(v){return v==null?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';};
  var mapeC=function(v){return v==null?'var(--text3)':Math.abs(v)<0.25?'#10b981':Math.abs(v)<0.5?'#f59e0b':'#ef4444';};
  var S={
    sec:{marginBottom:16,background:'var(--surf2)',borderRadius:'var(--rl)',border:'.5px solid var(--bdr)',overflow:'hidden'},
    secHdr:{padding:'9px 14px',borderBottom:'.5px solid var(--bdr)',fontSize:'9px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px',color:'var(--amber)'},
    secBody:{padding:'12px 14px'},
    kpiRow:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:4},
    kpiBox:{background:'var(--surf3)',borderRadius:'var(--r)',padding:'10px 12px',border:'.5px solid var(--bdr)'},
    kpiLbl:{fontSize:'8px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:3},
    kpiVal:{fontSize:'17px',fontWeight:700,fontFamily:'var(--mono)'},
    oppRow:{display:'flex',gap:10,marginBottom:14,alignItems:'flex-start'},
    oppRank:{width:24,height:24,borderRadius:'50%',background:'var(--amber)',color:'#000',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2},
    oppDollar:{fontSize:'14px',fontWeight:800,color:'#10b981',margin:'3px 0'},
    oppDetail:{fontSize:'10px',color:'var(--text2)',lineHeight:1.5,marginBottom:3},
    oppAction:{fontSize:'10px',color:'#818cf8',lineHeight:1.4},
    findRow:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:'.5px solid rgba(255,255,255,.04)',gap:12},
  };
  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,display:'flex',flexDirection:'column',paddingTop:24}},
    div({style:{flex:'0 0 24px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',display:'flex',flexDirection:'column',overflow:'hidden',maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // HEADER
      div({style:{padding:'11px 18px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',gap:8,flexShrink:0,background:'var(--surf2)',flexWrap:'wrap'}},
        div({style:{fontSize:'13px',fontWeight:800,color:'var(--amber)',flexShrink:0}},'📊 Location Intelligence'),
        div({style:{display:'flex',gap:2}},
          [['store','Store'],['district','District']].map(function(pair){
            return btn({key:pair[0],className:'btn btn-sm'+(activeLevel===pair[0]?' btn-a':''),style:{fontSize:'9px'},onClick:function(){setActiveLevel(pair[0]);}},pair[1]);
          })
        ),
        activeLevel==='store'&&h('select',{value:selLoc,onChange:function(e){setSelLoc(e.target.value);},
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',color:'var(--text)',fontSize:'10px',padding:'3px 6px',maxWidth:180}},
          locs.map(function(l){return h('option',{key:l,value:l},sNameC(l));})
        ),
        div({style:{display:'flex',gap:0,border:'.5px solid var(--bdr)',borderRadius:'var(--r)',overflow:'hidden',marginLeft:'auto'}},
          [['statistical','📊 Statistical'],['ai','🤖 AI Narrative']].map(function(pair){
            return btn({key:pair[0],onClick:function(){setMode(pair[0]);},style:{padding:'4px 11px',fontSize:'9px',fontWeight:600,border:'none',
              background:mode===pair[0]?'var(--amber)':'var(--surf)',color:mode===pair[0]?'#000':'var(--text3)',cursor:'pointer'}},pair[1]);
          })
        ),
        mode==='ai'&&btn({className:'btn btn-sm btn-a',style:{fontSize:'9px'},onClick:handleGenAI,disabled:generating||noData},generating?'⏳ Generating…':'⚡ Generate'),
        btn({className:'btn btn-sm',style:{fontSize:'9px'},onClick:handlePrint,title:'Print / Save as PDF'},'🖨 Print'),
        btn({className:'btn btn-sm',style:{fontSize:'9px'},onClick:handleDownload,title:'Download HTML report'},'⬇ Download'),
        btn({className:'btn btn-sm',onClick:onClose},'✕')
      ),
      // BODY
      div({style:{flex:1,overflowY:'auto',padding:18}},
        noData&&div({style:{textAlign:'center',padding:60,color:'var(--text3)'}},
          div({style:{fontSize:40,marginBottom:12}},'📊'),
          div({style:{fontSize:'13px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Load your data to generate Location Intelligence'),
          div({style:{fontSize:'10px',lineHeight:1.8,color:'var(--text3)'}},
            'Required: Operations Report + Labor Analysis.',
            div(null,'Optional (enriches analysis): Weather data, Register Audit, Voice/CSAT.'))
        ),
        !noData&&mode==='ai'&&div(null,
          !aiContent&&!generating&&div({style:{padding:40,textAlign:'center',color:'var(--text3)',fontSize:'11px'}},'Click ⚡ Generate to create an AI-powered narrative for this location.'),
          generating&&div({style:{padding:40,textAlign:'center'}},
            div({style:{fontSize:'12px',color:'var(--amber)',fontWeight:600}},'⏳ Generating intelligence narrative…'),
            div({style:{fontSize:'10px',color:'var(--text3)',marginTop:8}},'Analyzing historical patterns and building your roadmap. Usually 15-30 seconds.')),
          aiContent&&div({style:S.sec},
            div({style:S.secHdr},'🤖 AI-Generated Intelligence Brief'),
            div({style:{padding:'14px 16px',whiteSpace:'pre-wrap',fontSize:'12px',lineHeight:1.85,color:'var(--text)'}},aiContent)
          ),
          aiContent&&stats&&roadmap.length>0&&div({style:{...S.sec,marginTop:12}},
            div({style:S.secHdr},'💰 Statistical Backing — Growth Roadmap'),
            div({style:S.secBody},roadmap.map(function(o,i){
              return div({key:i,style:S.oppRow},
                div({style:S.oppRank},i+1),
                div({style:{flex:1}},
                  div({style:{fontSize:'9px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},o.icon+' '+o.cat+' — '+o.metric),
                  div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},o.finding),
                  div({style:S.oppDollar},fmtD(o.dollarOpp)+'/yr opportunity'),
                  div({style:S.oppDetail},o.detail),
                  div({style:S.oppAction},'▶ '+o.action)
                )
              );
            }))
          )
        ),
        !noData&&mode==='statistical'&&stats&&(function(){
          var isRollUp=activeLevel!=='store';
          return div(null,
            // KPI summary
            div({style:S.sec},
              div({style:S.secHdr},'Performance Overview — '+(stats.name||'')),
              div({style:S.secBody},
                div({style:S.kpiRow},
                  [{l:'Est. Annual Revenue',v:fmtD(stats.annualSales),s:'based on 6W avg',c:'var(--text)'},{l:'Avg Daily Sales',v:fmtD(stats.avgDailySales),s:'recent 6 weeks',c:'var(--text)'},{l:'Historical Data Points',v:(stats.dataRows||0).toLocaleString(),s:'records loaded',c:'var(--text)'},{l:'Total Opp / Year',v:fmtD(roadmap.reduce(function(s,o){return s+o.dollarOpp;},0)),s:'identified opportunities',c:'#10b981'}]
                  .map(function(k,i){return div({key:i,style:S.kpiBox},div({style:S.kpiLbl},k.l),div({style:{...S.kpiVal,color:k.c}},k.v),div({style:{fontSize:'8px',color:'var(--text3)',marginTop:2}},k.s));})
                )
              )
            ),
            // Growth roadmap
            roadmap.length>0&&div({style:S.sec},
              div({style:S.secHdr},'💰 Growth Roadmap — Ranked by Dollar Opportunity'),
              div({style:S.secBody},roadmap.map(function(o,i){
                return div({key:i,style:S.oppRow},
                  div({style:S.oppRank},i+1),
                  div({style:{flex:1}},
                    div({style:{fontSize:'9px',textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text3)',marginBottom:2}},o.icon+' '+o.cat+' — '+o.metric),
                    div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},o.finding),
                    div({style:S.oppDollar},fmtD(o.dollarOpp)+'/yr opportunity'),
                    div({style:S.oppDetail},o.detail),
                    div({style:S.oppAction},'▶ '+o.action)
                  )
                );
              }))
            ),
            // Operational correlations
            div({style:S.sec},
              div({style:S.secHdr},'📈 Operational Correlations'),
              div({style:S.secBody},
                [stats.oepe&&{label:'OEPE → Sales',icon:'⏱',val:stats.oepe.r!=null?'r = '+stats.oepe.r:'—',
                    detail:stats.oepe.pct!=null?(stats.oepe.pct<0?'Faster service days average '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% more in sales. Target: '+stats.oepe.oepeTgt+'s.':'Slower days show '+(Math.abs(stats.oepe.pct)*100).toFixed(1)+'% lower sales vs. on-target days. Target: '+stats.oepe.oepeTgt+'s.'):'Insufficient paired OEPE + sales data.',
                    sub:(stats.oepe.n||0)+' paired days | '+stats.oepe.above+' above target / '+stats.oepe.at+' at/below',
                    c:stats.oepe.r!=null?mapeC(Math.abs(stats.oepe.r)-0.25):'var(--text3)'},
                  stats.labor&&{label:'Labor Coverage → Sales',icon:'👥',val:stats.labor.impact!=null?fmtPct(stats.labor.impact):'—',
                    detail:'Understaffed days (>1hr under needed): '+(stats.labor.pctUnder*100).toFixed(0)+'% of periods. '+(stats.labor.avgUnder&&stats.labor.avgOk?'Understaffed avg: '+fmtD(stats.labor.avgUnder)+' vs. adequate: '+fmtD(stats.labor.avgOk)+'.':''),
                    sub:(stats.labor.rows||0)+' days with act-vs-need data',
                    c:stats.labor.impact!=null?(stats.labor.impact<-0.02?'#ef4444':'#10b981'):'var(--text3)'},
                  stats.opp&&{label:'Opportunity Cost',icon:'💰',val:fmtD(stats.opp.annualized)+'/yr',
                    detail:'Avg $'+Math.round(stats.opp.totalOpp/stats.opp.rows).toLocaleString()+'/day captured over '+stats.opp.rows+' days. '+(stats.opp.pctRev*100).toFixed(1)+'% of revenue.',
                    sub:'Source: Opportunity Cost $ field in operations data',c:'#f59e0b'},
                  stats.avgCheck&&{label:'Avg Check Trend',icon:'💳',val:stats.avgCheck.trend!=null?fmtPct(stats.avgCheck.trend)+' recent':'—',
                    detail:'Check↔GC correlation: r = '+(stats.avgCheck.r||'—')+'. Recent avg: $'+(stats.avgCheck.recentAvg||0).toFixed(2)+' vs. older: $'+(stats.avgCheck.olderAvg||0).toFixed(2)+'.',
                    sub:(stats.avgCheck.rows||0)+' days analyzed',
                    c:stats.avgCheck.trend!=null?(stats.avgCheck.trend>0.01?'#10b981':stats.avgCheck.trend<-0.01?'#ef4444':'var(--text3)'):'var(--text3)'},
                ].filter(Boolean).map(function(c,i){
                  return div({key:i,style:{...S.findRow,padding:'10px 0'}},
                    div({style:{flex:1}},
                      div({style:{fontSize:'11px',fontWeight:700,color:'var(--text)',marginBottom:2}},c.icon+' '+c.label),
                      div({style:{fontSize:'10px',color:'var(--text2)',lineHeight:1.5}},c.detail),
                      div({style:{fontSize:'8px',color:'var(--text3)',marginTop:3}},c.sub)
                    ),
                    div({style:{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:700,textAlign:'right',flexShrink:0,color:c.c}},c.val)
                  );
                })
              )
            ),
            // Day-of-week
            stats.dow&&div({style:S.sec},
              div({style:S.secHdr},'📅 Day-of-Week Sales Patterns'),
              div({style:{padding:'10px 14px'}},
                div({style:{display:'flex',flexDirection:'column',gap:5}},
                  stats.dow.days.map(function(d,i){
                    var avg=stats.dow.avgs[i],grand=stats.dow.grand||1;
                    if(!avg)return null;
                    var barPct=Math.min(100,avg/grand*100),vsG=(avg-grand)/grand;
                    return div({key:d,style:{display:'flex',alignItems:'center',gap:8}},
                      div({style:{width:28,fontSize:'9px',color:'var(--text2)',flexShrink:0,textAlign:'right'}},d),
                      div({style:{flex:1,background:'rgba(255,255,255,.06)',borderRadius:3,height:16,position:'relative',overflow:'hidden'}},
                        div({style:{position:'absolute',left:0,top:0,bottom:0,width:barPct+'%',background:'var(--amber)',opacity:.65,borderRadius:3}})
                      ),
                      div({style:{width:76,fontFamily:'var(--mono)',fontSize:'10px',textAlign:'right',flexShrink:0}},fmtD(avg)),
                      div({style:{width:44,fontSize:'9px',textAlign:'right',flexShrink:0,color:vsG>0.02?'#10b981':vsG<-0.02?'#ef4444':'var(--text3)'}},
                        (vsG>=0?'+':''+(vsG*100).toFixed(0)+'%'))
                    );
                  })
                )
              )
            ),
            // Weather
            stats.weather&&div({style:S.sec},
              div({style:S.secHdr},'🌦 Weather Impact Analysis'),
              div({style:{padding:'10px 14px'}},
                div({style:{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16}},
                  div(null,
                    div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Precipitation'),
                    div({style:S.findRow},div(null,'☀ Dry days ('+stats.weather.dryDays+')'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgDry))),
                    div({style:S.findRow},div(null,'🌧 Rain days ('+stats.weather.rainDays+')'),div({style:{fontFamily:'var(--mono)',fontSize:'10px',color:stats.weather.rainImpact<-0.02?'#ef4444':stats.weather.rainImpact>0.02?'#10b981':'var(--text)'}},fmtD(stats.weather.avgRain))),
                    stats.weather.rainImpact&&div({style:{marginTop:6,fontSize:'10px',color:'var(--text2)'}},'Rain impact: '+(stats.weather.rainImpact>=0?'+':'')+(stats.weather.rainImpact*100).toFixed(1)+'% vs. dry days')
                  ),
                  div(null,
                    div({style:{fontSize:'10px',fontWeight:700,color:'var(--text)',marginBottom:8}},'Temperature Bands'),
                    stats.weather.avgCold&&div({style:S.findRow},div(null,'🥶 Cold (<40°F)'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgCold))),
                    stats.weather.avgMild&&div({style:S.findRow},div(null,'😊 Mild (40-95°F)'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgMild))),
                    stats.weather.avgHot&&div({style:S.findRow},div(null,'🥵 Hot (>95°F)'),div({style:{fontFamily:'var(--mono)',fontSize:'10px'}},fmtD(stats.weather.avgHot)))
                  )
                )
              )
            ),
            // Roll-up store list
            isRollUp&&stats.stores&&stats.stores.length>0&&div({style:S.sec},
              div({style:S.secHdr},'Store-by-Store Breakdown'),
              div({style:{maxHeight:380,overflowY:'auto'}},
                stats.stores.map(function(s){
                  var sR=liBuildRoadmap(s),top=sR[0],isExp=expandedStore===s.loc;
                  return div({key:s.loc},
                    div({style:{padding:'9px 14px',borderBottom:'.5px solid rgba(255,255,255,.04)',cursor:'pointer',display:'flex',alignItems:'center',gap:10,background:isExp?'var(--adim)':'transparent'},
                      onClick:function(){setExpandedStore(isExp?null:s.loc);}},
                      div({style:{fontSize:'11px',fontWeight:600,flex:1}},s.name),
                      div({style:{fontSize:'10px',color:'var(--text3)'}},fmtD(s.annualSales)+' ann.'),
                      top&&div({style:{fontSize:'9px',color:'#10b981',fontWeight:600}},fmtD(top.dollarOpp)+' opp'),
                      div({style:{color:'var(--text3)',fontSize:11}},isExp?'▼':'▶')
                    ),
                    isExp&&div({style:{padding:'10px 14px 14px 28px',background:'rgba(255,255,255,.02)'}},
                      sR.slice(0,2).map(function(o,i){
                        return div({key:i,style:{marginBottom:8}},
                          div({style:{fontSize:'9px',color:'var(--amber)',fontWeight:700}},o.icon+' '+o.cat),
                          div({style:{fontSize:'10px',color:'var(--text)',marginBottom:2}},o.finding),
                          div({style:{fontSize:'9px',color:'#10b981',fontWeight:700}},fmtD(o.dollarOpp)+'/yr'),
                          div({style:{fontSize:'9px',color:'var(--text3)'}},o.action)
                        );
                      })
                    )
                  );
                })
              )
            )
          );
        })()
      )
    )
  );
}

export { LocationIntelligence };
