// @ts-nocheck
import { STORE_NAMES } from '../constants.js';

function analyzeRegisterAudit(auditRows) {
  const byEmp={};
  for(const r of auditRows){
    const key=r.loc+'::'+r.emp;
    if(!byEmp[key])byEmp[key]={emp:r.emp,loc:r.loc,name:STORE_NAMES[r.loc]||('Store '+r.loc),days:0,
      totalSales:0,totalGC:0,avgCheck:0,drawerOpens:0,cashOSTotal:0,cashOSDays:0,
      tRedACnt:0,tRedBCnt:0,tRedADollar:0,tRedBDollar:0,
      manualRef:0,posOver:0,posOverAmt:0,
      refundCnt:0,refundCash:0,refundCashless:0,
      promoAmt:0,flags:[]};
    const e=byEmp[key];
    e.days++;e.totalSales=Math.round((e.totalSales+r.drawerSales)*100)/100;e.totalGC+=r.drawerGC;
    e.drawerOpens+=r.drawerOpens;e.cashOSTotal=Math.round((e.cashOSTotal+(r.cashOSDollar||0))*100)/100;
    if(r.cashOSDollar!==0)e.cashOSDays++;
    e.tRedACnt+=r.tRedACnt;e.tRedBCnt+=r.tRedBCnt;
    e.tRedADollar=Math.round((e.tRedADollar+(r.tRedADollar||0))*100)/100;
    e.tRedBDollar=Math.round((e.tRedBDollar+(r.tRedBDollar||0))*100)/100;
    e.manualRef=Math.round((e.manualRef+(r.manualRefAmt||0))*100)/100;
    e.posOver+=r.posOverCnt;e.posOverAmt=Math.round((e.posOverAmt+(r.posOverAmt||0))*100)/100;
    e.refundCnt+=(r.refundCnt||0)+(r.refundCashless||0);
    e.refundCash=Math.round((e.refundCash+(r.refundCash||0))*100)/100;e.refundCashless=Math.round((e.refundCashless+(r.refundCashless||0))*100)/100;
    e.promoAmt=Math.round((e.promoAmt+(r.promoAmt||0))*100)/100;
  }
  const results=Object.values(byEmp).map(e=>{
    e.avgCheck       = e.totalGC>0 ? Math.round(e.totalSales/e.totalGC*100)/100 : 0;
    e.avgDrawerOpens = e.days>0 ? Math.round(e.drawerOpens/e.days*10)/10 : 0;
    e.avgCashOS      = e.cashOSDays>0 ? Math.round(e.cashOSTotal/e.cashOSDays*100)/100 : 0;
    e.avgTRedA       = e.days>0 ? Math.round(e.tRedACnt/e.days*10)/10 : 0;
    e.avgTRedB       = e.days>0 ? Math.round(e.tRedBCnt/e.days*10)/10 : 0;
    e.avgTRedADollar = e.days>0 ? Math.round(e.tRedADollar/e.days*100)/100 : 0;
    e.avgPosOver     = e.days>0 ? Math.round(e.posOver/e.days*10)/10 : 0;
    e.avgRefundCnt   = e.days>0 ? Math.round(e.refundCnt/e.days*10)/10 : 0;
    let risk=0;
    if(e.avgDrawerOpens>8){risk+=30;e.flags.push('HIGH drawer opens ('+e.avgDrawerOpens.toFixed(1)+'/day)');}
    else if(e.avgDrawerOpens>5){risk+=15;e.flags.push('Elevated drawer opens');}
    if(e.cashOSTotal<-5){risk+=25;e.flags.push('Consistently short $'+Math.abs(e.cashOSTotal).toFixed(2));}
    if(e.avgTRedA>2){risk+=20;e.flags.push('High T-Red After ('+e.avgTRedA.toFixed(1)+'/day)');}
    if(e.avgTRedB>3){risk+=15;e.flags.push('Elevated T-Red Before ('+e.avgTRedB.toFixed(1)+'/day)');}
    if(e.manualRef>50){risk+=20;e.flags.push('High manual refunds ($'+e.manualRef.toFixed(0)+')');}
    if(e.posOver>10){risk+=10;e.flags.push('High POS overrings ('+e.posOver+')');}
    e.riskScore=Math.min(100,risk);
    e.riskLevel=risk>=60?'critical':risk>=30?'high':risk>=15?'watch':'ok';
    e.cashOS   = e.days>0 ? Math.round((e.cashOSTotal/e.days)*100)/100 : 0;
    e.voids    = e.tRedACnt;
    e.discPct  = e.promoAmt>0&&e.totalSales>0 ? Math.round(e.promoAmt/e.totalSales*10000)/10000 : 0;
    e.txCount  = e.days;
    e.id       = e.emp||'Unknown';
    return e;
  });
  const emps = results.sort((a,b)=>b.riskScore-a.riskScore);
  const summary = {
    totalSales:    results.reduce((a,e)=>a+e.totalSales,0),
    totalVoids:    results.reduce((a,e)=>a+e.tRedACnt,0),
    totalManRef:   results.reduce((a,e)=>a+e.manualRef,0),
    totalPosOver:  results.reduce((a,e)=>a+e.posOver,0),
    avgCashOS:     results.length ? results.reduce((a,e)=>a+e.cashOSTotal,0)/results.length : 0,
    highRisk:      results.filter(e=>e.riskScore>=70).length,
    watchCount:    results.filter(e=>e.riskScore>=40&&e.riskScore<70).length,
    employeeCount: results.length,
  };
  return {employees: emps, summary};
}

export { analyzeRegisterAudit };
