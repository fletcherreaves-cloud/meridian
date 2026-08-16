// @ts-nocheck
import * as React from 'react';
import { INV_ORG_COORDS, STORE_NAMES, sName, sNameC } from '../constants.js';
import { INV_MASTER, classifyInvArea, parseInvUOM } from '../parsers/inventory-parse.js';
import { loadQsrInventorySummary } from '../lib/supabase.js';

// Local, not imported from attention-now.js (same one-liner as unpad there) — importing a
// React-hook-heavy view module just for this would drag its whole dependency graph into
// this panel's own lazy chunk for one trivial function.
const unpad=(l)=>String(l||'').replace(/^0+/,'')||String(l||'');

const h=React.createElement;
const div=(p,...c)=>h('div',p,...c);
const span=(p,...c)=>h('span',p,...c);
const btn=(p,...c)=>h('button',p,...c);
const tr=(p,...c)=>h('tr',p,...c);
const td=(p,...c)=>h('td',p,...c);
const th=(p,...c)=>h('th',p,...c);
const thead=(p,...c)=>h('thead',p,...c);
const tbody=(p,...c)=>h('tbody',p,...c);

function invDist(locA,locB){
  const a=INV_ORG_COORDS[locA],b=INV_ORG_COORDS[locB];
  if(!a||!b||!a.lat||!b.lat)return Infinity;
  const R=3959,toR=d=>d*Math.PI/180;
  const dLat=toR(b.lat-a.lat),dLon=toR(b.lng-a.lng);
  const x=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLon/2)**2;
  return+(R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))).toFixed(1);
}
function invSameState(locA,locB){
  const a=INV_ORG_COORDS[locA],b=INV_ORG_COORDS[locB];
  return!!(a&&b&&a.state&&a.state===b.state);
}

// ── Inner Pack Framework (replace with user-provided list via upload) ─────
// Format: {wrin: {unit:'Sleeve',count:100,display:'sleeve'}}
// Until user provides WRIN-level list, common UOM keywords are used.
const INV_INNER_PACKS_DEFAULTS={'Sleeve':50,'Case':1,'Bag':1,'Roll':1,'Pack':1,'Each':1};
function formatXferQty(rawQty,wrin,uom,caseSize){
  if(rawQty<0.5)return null;
  const m=wrin?INV_MASTER[wrin]:null;
  const ipu=m&&m.ipu?m.ipu:null; // inner packs per case
  const ipc=m&&m.ipc?m.ipc:null; // each per inner pack
  const upc=m&&m.upc?m.upc:(caseSize||1); // each per case
  const fullCs=Math.floor(rawQty);
  const remFrac=rawQty-fullCs;
  const remEach=Math.round(remFrac*upc);
  // How many full inner packs in the remainder?
  const fullIP=ipc&&ipc>0?Math.floor(remEach/ipc):0;
  const label=m&&m.uom&&m.uom!=='EA'?m.uom:'EA';
  let parts=[];
  if(fullCs>0)parts.push(fullCs+(fullCs===1?' case':' cases'));
  if(fullIP>0)parts.push(fullIP+' inner pack'+(fullIP!==1?'s':'')+' ('+fullIP*ipc+' '+label+')');
  if(!parts.length){
    // No full inner packs — show as half case
    const halfEach=ipc?ipc:Math.round(upc/2);
    return'½ case ('+(ipu&&ipu>0?Math.round(upc/ipu):halfEach)+' '+label+')';
  }
  return parts.join(' + ');
}

// INVENTORY INTELLIGENCE MODULE
// Four-section report: Service items · Production items · Overstock · Transfers
const INV_CLASSES_ALL=['Paper','Food','Condiment','Ops Supplies','Miscellaneous'];
const INV_CLASS_FILTERS=[
  {key:'Paper',label:'Paper'},
  {key:'Food',label:'Food'},
  {key:'Condiment',label:'Condiment'},
  {key:'Food+Condiment',label:'Food + Condiment'},
  {key:'Paper+Food+Condiment',label:'Paper + Food + Cond'},
  {key:'All',label:'All Classes'},
];

// ── #214: qsr_inventory_summary → panel row shape ──────────────────────────────────────
// Trap 1 (per the issue): the auto stream's `cls` vocabulary is not confirmed to match
// INV_CLASSES_ALL exactly — no live Supabase session in this sandbox to check a real row.
// Known QSRSoft synonyms are mapped explicitly; anything else passes through UNCHANGED
// rather than being silently bucketed into 'Miscellaneous' (which would be the Paper-filter
// under-report the issue specifically warns about, just moved from one wrong class to
// another guessed one). An unrecognized value shows up under "All Classes" but not under
// any specific filter — visible as a discrepancy instead of hidden as a false negative.
const INV_CLS_SYNONYMS={'Non Product':'Miscellaneous','Ops Supply':'Ops Supplies'};
export function mapInvClass(cls){
  const c=String(cls||'').trim();
  if(!c) return 'Miscellaneous';
  if(INV_CLASSES_ALL.includes(c)) return c;
  return INV_CLS_SYNONYMS[c]||c;
}

// Average daily transactions per (loc, YYYY-MM), from ds.qsrActSummaryRows (already a daily
// per-store rollup — supabase.js's loadQsrActSummary sums hourly qsr_daily_activity into a
// `txns` field per day). Used to derive usage1000 = usagePerDay ÷ (avgDailyTxns/1000), since
// qsr_inventory_summary carries usagePerDay but not usage-per-1000-transactions directly.
export function avgDailyTxnsByLocMonth(rows){
  const acc={};
  for(const r of (rows||[])){
    if(!r||!r.loc||!r.date) continue;
    const d=r.date instanceof Date?r.date:new Date(r.date);
    if(isNaN(d)) continue;
    const key=unpad(r.loc)+'|'+d.toISOString().slice(0,7);
    if(!acc[key]) acc[key]={sum:0,days:new Set()};
    acc[key].sum+=r.txns||0;
    acc[key].days.add(d.toISOString().slice(0,10));
  }
  const out={};
  for(const[key,v] of Object.entries(acc)) out[key]=v.days.size?v.sum/v.days.size:0;
  return out;
}

// Latest period only, per (loc,wrin) — same "freshest wins" shape as attention-now.js's
// fobByStoreLatest. Returns the mapped rows plus any `cls` values that didn't match
// INV_CLASSES_ALL or a known synonym, so the caller can surface Trap 1 instead of guessing.
export function cloudRowsToPanelShape(cloudRows, txnsByLocMonth){
  const latestByKey=new Map();
  for(const r of (cloudRows||[])){
    const key=unpad(r.loc)+'|'+r.wrin;
    const prev=latestByKey.get(key);
    if(!prev||String(r.period)>String(prev.period)) latestByKey.set(key,r);
  }
  const unrecognizedClasses=new Set();
  const rows=[];
  for(const r of latestByKey.values()){
    const loc=unpad(r.loc);
    const rawCls=String(r.cls||'').trim();
    if(rawCls&&!INV_CLASSES_ALL.includes(rawCls)&&!INV_CLS_SYNONYMS[rawCls]) unrecognizedClasses.add(rawCls);
    const{caseSize:parsedCaseSize,unitType}=parseInvUOM(r.uom);
    const usageDay=r.usagePerDay||0;
    const monthKey=loc+'|'+String(r.period||'').slice(0,7);
    const avgTxns=txnsByLocMonth[monthKey];
    rows.push({
      loc, wrin:r.wrin, description:r.descr||'', class_:mapInvClass(r.cls),
      uom:r.uom||'', caseSize:r.caseSz||parsedCaseSize||1, unitType,
      cost:r.cost||0, usageDay,
      usage1000:avgTxns>0?+(usageDay/(avgTxns/1000)).toFixed(4):0,
      // #214: prefer the source's own daysSupply over recomputing — it's exactly the
      // overstock metric the panel used to derive itself from starting/ending inventory.
      daysSupply:r.daysSupply||0,
      area:classifyInvArea(r.wrin,r.descr),
      inactive:usageDay===0&&(r.daysSupply||0)>0,
      // ⚠️ UNVERIFIED (no live data to confirm): assumes usagePerDay is already in CASES,
      // matching startInv/endInv/purchases. If a live pull shows it's actually in EACHES,
      // flip this to true — it directly changes the Overstock excessCases/excessValue math.
      eachFmt:false,
      actualUsage:r.actualUsage||0, startingInv:r.startInv||0, endingInv:r.endInv||0,
      source:'cloud',
    });
  }
  return{rows,unrecognizedClasses:[...unrecognizedClasses]};
}

function filterByClass(rows, classKey){
  if(classKey==='All') return rows;
  if(classKey==='Food+Condiment') return rows.filter(r=>r.class_==='Food'||r.class_==='Condiment');
  if(classKey==='Paper+Food+Condiment') return rows.filter(r=>['Paper','Food','Condiment'].includes(r.class_));
  return rows.filter(r=>r.class_===classKey);
}

function computeInvSections(rows, threshold, excldWrapPouch, doRollup){
  const exclKw=['wrap','pouch','bagel pouch'];
  const isExcl=d=>excldWrapPouch&&exclKw.some(k=>d.toLowerCase().includes(k));
  // Optionally roll up duplicate WRINs
  const workRows=doRollup?rollupByWRIN(rows):rows;
  const svc=workRows.filter(r=>r.area==='Service'&&r.usageDay>0&&r.usage1000>0)
    .sort((a,b)=>b.usage1000-a.usage1000).slice(0,20);
  const prod=workRows.filter(r=>r.area==='Production'&&!isExcl(r.description)&&r.usageDay>0&&r.usage1000>0)
    .sort((a,b)=>b.usage1000-a.usage1000).slice(0,20);
  // Overstock: > threshold days (active items)
  const overstk=workRows
    .filter(r=>r.daysSupply>threshold&&r.usageDay>0&&!r.negAction)
    .sort((a,b)=>b.daysSupply-a.daysSupply)
    .map(r=>({...r,excessDays:+(r.daysSupply-threshold).toFixed(1),
      excessCases:+(((r.daysSupply-threshold)*r.usageDay)/(r.eachFmt?(r.caseSize||1):1)).toFixed(2),
      excessValue:+(((r.daysSupply-threshold)*r.usageDay*r.cost)).toFixed(2)}));
  // Action items: negative on-hand or negative usage
  const actionItems=workRows.filter(r=>r.daysSupply<0||r.usageDay<0).map(r=>{
    let actionType='',actionMsg='';
    if(r.daysSupply<0&&r.usageDay>0){actionType='neg-count';actionMsg='ACTION: Count in inventory and correct the on-hand amount — a negative on-hand directly affects your MB Order Proposal.';}
    else if(r.daysSupply<0&&r.usageDay<=0){actionType='neg-inactive';actionMsg='ACTION: Item appears inactive/depleted. Please Verify On-Hand Amount. If it is depleted and there is none on-hand, enter a zero (0) count and update in inventory.';}
    else if(r.usageDay<0){actionType='neg-usage';actionMsg='ACTION: Negative usage rate detected. Review and correct this item count in your inventory system.';}
    return{...r,actionType,actionMsg};
  });
  return{svc,prod,overstk,actionItems};
}

// ── WRIN Rollup: group items by first-5-digit base WRIN ────────────────
function rollupByWRIN(rows){
  const groups={};
  rows.forEach(r=>{
    const base=r.wrin.replace('-','').slice(0,5);
    if(!groups[base])groups[base]={items:[]};
    groups[base].items.push(r);
  });
  const result=[];
  Object.values(groups).forEach(g=>{
    if(g.items.length===1){result.push(g.items[0]);return;}
    // Multiple variants — roll up to master (highest usageDay)
    const master=g.items.reduce((b,r)=>r.usageDay>b.usageDay?r:b,g.items[0]);
    // Normalize to eaches for combining different case sizes
    const totalEach=g.items.reduce((a,r)=>a+(r.endingInv||0)*(r.caseSize||1),0);
    const totalUsageEach=g.items.reduce((a,r)=>a+(r.usageDay||0)*(r.caseSize||1),0);
    const combinedDays=totalUsageEach>0?+(totalEach/totalUsageEach).toFixed(2):
      (totalEach>0?9999:0);
    const variants=g.items.filter(r=>r.wrin!==master.wrin);
    const inactiveWithStock=variants.filter(r=>r.usageDay===0&&(r.endingInv||0)>0);
    result.push({...master,
      usageDay:+(totalUsageEach/(master.caseSize||1)).toFixed(4),
      usage1000:+(g.items.reduce((a,r)=>a+(r.usage1000||0),0)).toFixed(4),
      daysSupply:combinedDays,
      endingInv:+(totalEach/(master.caseSize||1)).toFixed(3),
      isRolledUp:true,
      rolledUpCount:variants.length,
      rolledUpWrins:variants.map(r=>r.wrin),
      inactiveVariants:inactiveWithStock,
      rollupNote:variants.length?
        'Usage split across '+g.items.length+' WRINs (base '+g.items[0].wrin.slice(0,8)+'…). Verify manager is using correct WRIN. All variants: '+g.items.map(r=>r.wrin).join(', '):'',
    });
  });
  return result;
}

function computeTransfers(allRows, threshold, recvThreshold, fullCaseOnly){
  const byLocItem={};
  allRows.forEach(r=>{
    if(!byLocItem[r.loc])byLocItem[r.loc]={};
    byLocItem[r.loc][r.wrin]=r;
  });
  const locs=Object.keys(byLocItem);
  const transfers=[];
  locs.forEach(sendLoc=>{
    Object.values(byLocItem[sendLoc]).forEach(item=>{
      if(item.daysSupply<=threshold||item.usageDay<=0) return;
      const excessCases=(item.daysSupply-threshold)*item.usageDay/(item.eachFmt?(item.caseSize||1):1);
      if(excessCases<0.5) return;
      // Find receivers needing this item (same org, < threshold days)
      const recipients=[];
      locs.forEach(recvLoc=>{
        if(recvLoc===sendLoc) return;
        if(!invSameState(sendLoc,recvLoc)) return; // same state only
        const recvItem=byLocItem[recvLoc][item.wrin];
        const _recvT=recvThreshold!=null?recvThreshold:threshold;
        if(!recvItem||recvItem.daysSupply>=_recvT) return; // receiver under recvThreshold
        const dist=invDist(sendLoc,recvLoc);
        const deficit=Math.max(0,(threshold-recvItem.daysSupply)*recvItem.usageDay);
        const xferQty=Math.min(excessCases,Math.max(0.5,deficit));
        const _xQty=fullCaseOnly?Math.floor(xferQty):xferQty; // round to full case if toggle
        if(fullCaseOnly&&_xQty<1) return; // skip sub-case transfers in full-case-only mode
        const xferFmt=formatXferQty(_xQty,item.wrin,item.uom,item.caseSize)||_xQty.toFixed(2)+' cs';
        recipients.push({recvLoc,recvDays:+recvItem.daysSupply.toFixed(1),
          xferQty:+_xQty.toFixed(2),xferDisplay:xferFmt,dist,value:+(_xQty*item.cost).toFixed(2)});
      });
      recipients.sort((a,b)=>a.dist-b.dist);
      if(recipients.length===0){
        // Show with no recipient
        transfers.push({wrin:item.wrin,description:item.description,class_:item.class_,
          sendLoc,recvLoc:null,excessCases:+excessCases.toFixed(2),xferQty:0,
          sendDays:+item.daysSupply.toFixed(1),recvDays:null,dist:null,
          cost:item.cost,value:0,noRecipient:true});
      } else {
        recipients.forEach(r=>{
          transfers.push({wrin:item.wrin,description:item.description,class_:item.class_,
            sendLoc,...r,excessCases:+excessCases.toFixed(2),
            sendDays:+item.daysSupply.toFixed(1),cost:item.cost});
        });
      }
    });
  });
  return transfers.sort((a,b)=>{
    if(a.noRecipient&&!b.noRecipient) return 1;
    if(!a.noRecipient&&b.noRecipient) return -1;
    return (a.dist||999)-(b.dist||999);
  });
}

// ── Bulk Export: all loaded locations in one HTML ─────────────────────────
function generateBulkInventoryReport(allInvRows, threshold, excldWrap, classKey, settings){
  const locs=[...new Set(allInvRows.map(r=>r.loc).filter(Boolean))];
  if(!locs.length){alert('No inventory data loaded.');return;}
  const classRows=loc=>filterByClass(allInvRows.filter(r=>r.loc===loc),classKey);

  const summaryByLevel=(level)=>{
    const allOvs=locs.flatMap(l=>computeInvSections(classRows(l),threshold,excldWrap,true).overstk);
    const totalVal=allOvs.reduce((a,r)=>a+(r.excessValue||0),0);
    const byLoc=locs.map(l=>{
      const{overstk}=computeInvSections(classRows(l),threshold,excldWrap,true);
      const val=overstk.reduce((a,r)=>a+(r.excessValue||0),0);
      return{loc:l,val,count:overstk.length,name:sName(l)};
    }).sort((a,b)=>b.val-a.val);
    const coord=l=>INV_ORG_COORDS[l]||{};
    if(level==='gm')return`<p>This report shows your current inventory status for ${classKey} items. Focus on Section 3 — you have items on hand above the ${threshold}-day threshold that represent tied-up cash and transfer opportunities. Review action items first, then coordinate with your supervisor on any transfers.</p>`;
    if(level==='supervisor'){
      const topLoc=byLoc[0];
      return`<p>Supervisor Summary — ${locs.length} locations analyzed. <strong>Total excess value: $${totalVal.toFixed(2)}</strong> in ${classKey} items above the ${threshold}-day threshold. ${topLoc?'Highest excess: '+topLoc.name+' ($'+topLoc.val.toFixed(2)+')':''} — review transfers within your patch before ordering additional product.</p>`;
    }
    if(level==='operator'){
      const topN=byLoc.slice(0,3).map(l=>l.name+' ($'+l.val.toFixed(2)+')').join(', ');
      return`<p>Operator Summary — District total excess ${classKey} value: <strong>$${totalVal.toFixed(2)}</strong> across ${locs.length} locations. Top overstock: ${topN}. Review transfer opportunities to redistribute product before expiration or waste. Locations with negative on-hand items need immediate count corrections — this affects MB Order Proposals.</p>`;
    }
    // org level
    const okLocs=locs.filter(l=>coord(l).state==='OK');const flLocs=locs.filter(l=>coord(l).state==='FL');
    const okVal=byLoc.filter(l=>coord(l.loc).state==='OK').reduce((a,l)=>a+l.val,0);
    const flVal=byLoc.filter(l=>coord(l.loc).state==='FL').reduce((a,l)=>a+l.val,0);
    return`<p>Organization Summary — ${locs.length} total locations (${okLocs.length} Oklahoma, ${flLocs.length} Florida). Total excess ${classKey} inventory: <strong>$${totalVal.toFixed(2)}</strong> (OK: $${okVal.toFixed(2)} / FL: $${flVal.toFixed(2)}). Locations ranked by overstock value below. Transfer opportunities within each state are identified in individual location reports.</p>`;
  };

  const locSection=(loc)=>{
    const rows=classRows(loc);
    const name=sName(loc);
    const inv=INV_ORG_COORDS[loc]||{};
    const{svc,prod,overstk,actionItems}=computeInvSections(rows,threshold,excldWrap,true);
    const excessVal=overstk.reduce((a,r)=>a+(r.excessValue||0),0);
    const f2=n=>'$'+Number(n||0).toFixed(2);
    const thS='font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#475569;border-bottom:.5px solid rgba(255,255,255,.1);padding:5px 8px;text-align:left;background:#111827;';
    const iR=(r,i)=>`<tr style="${i%2?'background:rgba(255,255,255,.015)':''}"><td style="padding:4px 8px"><span style="font-size:8px;font-family:monospace;color:#64748b;margin-right:5px">${r.wrin||''}</span>${r.description}${r.isRolledUp?'<span style="font-size:7px;padding:1px 4px;border-radius:3px;background:rgba(245,188,0,.12);color:#f5bc00;margin-left:4px">⊕ merged</span>':''}</td><td style="padding:4px 8px;font-family:monospace;text-align:right">${(r.usageDay||0).toFixed(3)}</td><td style="padding:4px 8px;font-family:monospace;text-align:right;color:#60a5fa">${(r.usage1000||0).toFixed(4)}</td><td style="padding:4px 8px;font-family:monospace;text-align:right;color:${r.daysSupply<7?'var(--crit)':r.daysSupply<14?'var(--warn)':'#94a3b8'}">${(r.daysSupply||0).toFixed(1)}d</td><td style="padding:4px 8px;font-family:monospace;text-align:right;color:#10b981">${Math.round((r.usageDay||0)*(r.caseSize||1)*1.1)} ea/day</td></tr>`;
    const oR=(r,i)=>`<tr style="${i%2?'background:rgba(255,255,255,.015)':''}${r.inactive?';opacity:.7':''}"><td style="padding:4px 8px"><span style="font-size:8px;font-family:monospace;color:#64748b;margin-right:5px">${r.wrin||''}</span>${r.description}${r.inactive?' <span style="font-size:7px;color:var(--crit);font-weight:700">🚫 INACTIVE</span>':''}</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#f97316">${(r.daysSupply||0).toFixed(0)}d</td><td style="padding:4px 8px;text-align:right;font-family:monospace">${(r.excessDays||0).toFixed(0)}d</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:var(--warn)">${(r.excessCases||0).toFixed(2)} cs</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#ef4444">${f2(r.excessValue)}</td></tr>`;
    const hdr=(cols)=>`<thead><tr>${cols.map(c=>`<th style="${thS}">${c}</th>`).join('')}</tr></thead>`;
    return`<div style="page-break-before:always;padding:0 0 24px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #f5bc00;padding-bottom:10px;margin-bottom:14px">
        <div><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">Meridian · Inventory</div>
          <h2 style="font-size:18px;font-weight:800;letter-spacing:-.4px;color:#f5bc00">${name}</h2>
          <div style="font-size:9px;color:#64748b">Supervisor: ${inv.sup||'—'} · Operator: ${inv.op||'—'} · Delivery: ${inv.del||'—'} · ${classKey} items</div></div>
        <div style="text-align:right;font-family:monospace;font-size:10px">
          <div style="color:#f97316;font-weight:700;font-size:14px">$${excessVal.toFixed(2)}</div>
          <div style="color:#64748b;font-size:8px">excess value</div></div></div>
      <p style="font-size:9px;color:#94a3b8;margin-bottom:14px;line-height:1.5">${summaryByLevel('gm')}</p>
      ${actionItems&&actionItems.length?`<div style="background:rgba(239,68,68,.08);border:.5px solid rgba(239,68,68,.3);border-radius:6px;padding:10px;margin-bottom:14px"><div style="font-weight:700;color:#ef4444;margin-bottom:6px;font-size:10px">⚠ ${actionItems.length} Item${actionItems.length!==1?'s':''} Require Immediate Action</div>${actionItems.map(r=>`<div style="padding:4px 0;border-bottom:.5px solid rgba(239,68,68,.15);font-size:8.5px"><strong style="color:#f0f4ff">${r.description}</strong> <span style="color:#f59e0b">${(r.daysSupply||0).toFixed(1)}d</span> — <span style="color:#f59e0b">${r.actionMsg}</span></div>`).join('')}</div>`:''}
      ${svc.length?`<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;color:#10b981;margin-bottom:4px">Section 1 — Service Items (Top ${svc.length})</div><table style="width:100%;border-collapse:collapse;font-size:9px">${hdr(['Description','Usage/Day','Usage/$1000','Days Supply','Daily Target'])}
        <tbody>${svc.map(iR).join('')}</tbody></table></div>`:''}
      ${prod.length?`<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;color:#60a5fa;margin-bottom:4px">Section 2 — Production Items (Top ${prod.length})</div><table style="width:100%;border-collapse:collapse;font-size:9px">${hdr(['Description','Usage/Day','Usage/$1000','Days Supply','Daily Target'])}
        <tbody>${prod.map(iR).join('')}</tbody></table></div>`:''}
      ${overstk.length?`<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:700;color:#f97316;margin-bottom:4px">Section 3 — Overstock (${overstk.length} items · $${excessVal.toFixed(2)} excess)</div><table style="width:100%;border-collapse:collapse;font-size:9px">${hdr(['Description','Days Supply','Excess Days','Excess Cases','Excess Value'])}
        <tbody>${overstk.map(oR).join('')}</tbody>
        <tfoot><tr><td colspan="4" style="padding:5px 8px;font-weight:700;color:#f97316">Total Excess Value</td><td style="padding:5px 8px;text-align:right;font-weight:800;color:#ef4444;font-family:monospace">$${excessVal.toFixed(2)}</td></tr></tfoot></table></div>`:''}
    </div>`;
  };

  const allLocs=[...new Set(allInvRows.map(r=>r.loc).filter(Boolean))];
  const allOvs=allLocs.flatMap(l=>computeInvSections(classRows(l),threshold,excldWrap,true).overstk);
  const totalVal=allOvs.reduce((a,r)=>a+(r.excessValue||0),0);
  const byLoc=allLocs.map(l=>{const{overstk}=computeInvSections(classRows(l),threshold,excldWrap,true);return{loc:l,val:overstk.reduce((a,r)=>a+(r.excessValue||0),0),name:sName(l)};}).sort((a,b)=>b.val-a.val);
  const now=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const css=`*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;background:#080c14;color:#f0f4ff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{max-width:1100px;margin:0 auto;padding:32px 36px}@page{margin:12mm}@media print{body{background:#fff;color:#111}h2{color:#111!important}.page{padding:16px 20px}}`;

  const toc=`<div style="page-break-after:always"><div style="border-bottom:2px solid #f5bc00;margin-bottom:20px;padding-bottom:12px"><div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Meridian · Inventory Intelligence</div><h1 style="font-size:22px;font-weight:800;letter-spacing:-.5px">District Inventory Report</h1><div style="font-size:10px;color:#64748b;margin-top:4px">${now} · Class: ${classKey} · Threshold: ${threshold} days · ${allLocs.length} locations</div></div>
  <div style="margin-bottom:16px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px">Organization Overview</div>${summaryByLevel('org')}</div>
  <div style="margin-bottom:14px"><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#f97316;margin-bottom:6px">Locations Ranked by Excess Value</div>
  <table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:.5px solid rgba(255,255,255,.1);color:#64748b">Location</th><th style="text-align:left;padding:4px 8px;border-bottom:.5px solid rgba(255,255,255,.1);color:#64748b">Supervisor</th><th style="text-align:right;padding:4px 8px;border-bottom:.5px solid rgba(255,255,255,.1);color:#64748b">Overstock Items</th><th style="text-align:right;padding:4px 8px;border-bottom:.5px solid rgba(255,255,255,.1);color:#64748b">Excess Value</th></tr></thead><tbody>${byLoc.map((l,i)=>`<tr style="${i%2?'background:rgba(255,255,255,.02)':''}"><td style="padding:4px 8px;font-weight:800;font-size:11px;color:#f5bc00">${l.name}</td><td style="padding:4px 8px;color:#94a3b8">${(INV_ORG_COORDS[l.loc]||{}).sup||'—'}</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#f97316">${computeInvSections(classRows(l.loc),threshold,excldWrap,true).overstk.length}</td><td style="padding:4px 8px;text-align:right;font-family:monospace;font-weight:700;color:#ef4444">$${l.val.toFixed(2)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="3" style="padding:5px 8px;font-weight:700;color:#f97316">District Total</td><td style="padding:5px 8px;text-align:right;font-weight:800;color:#ef4444;font-family:monospace">$${totalVal.toFixed(2)}</td></tr></tfoot></table></div></div>`;

  const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>District Inventory Report</title><style>${css}</style></head><body><div class="page">${toc}${allLocs.map(locSection).join('')}</div></body></html>`;
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download='district_inventory_'+classKey.replace(/[^a-z0-9]/gi,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.html';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
}

function InventoryIntelligence({stores,ds,settings,onClose}){
  // ── #214: auto-first, freshest-wins ──────────────────────────────────────────────────
  // 3-state load (null=loading / []+err=failed / [...]=has rows), matching the FOB panel's
  // fix (analytics.js) for the exact bug this issue calls out: a failed cloud read must not
  // silently look like an empty one and fall back to a stale manual upload with no signal.
  const [cloudRows,setCloudRows]=React.useState(null);
  const [cloudErr,setCloudErr]=React.useState(null);
  React.useEffect(()=>{
    let live=true;
    loadQsrInventorySummary().then(r=>{if(live){setCloudRows(r||[]);setCloudErr(null);}})
      .catch(e=>{
        console.warn('[Inventory] loadQsrInventorySummary failed, falling back to manual upload only:',e?.message||e);
        if(live){setCloudRows([]);setCloudErr(String(e?.message||e));}
      });
    return()=>{live=false;};
  },[]);

  const txnsByLocMonth=React.useMemo(()=>avgDailyTxnsByLocMonth(ds.qsrActSummaryRows),[ds.qsrActSummaryRows]);
  const{rows:cloudInvRows,unrecognizedClasses}=React.useMemo(
    ()=>cloudRows?cloudRowsToPanelShape(cloudRows,txnsByLocMonth):{rows:[],unrecognizedClasses:[]},
    [cloudRows,txnsByLocMonth]);

  // Manual upload is gap-fill ONLY — never overrides a (loc,wrin) the cloud stream covers.
  const effRows=React.useMemo(()=>{
    const cloudKeys=new Set(cloudInvRows.map(r=>r.loc+'|'+r.wrin));
    const manualGapFill=(ds.inventoryRows||[])
      .map(r=>({...r,loc:unpad(r.loc)}))
      .filter(r=>!cloudKeys.has(r.loc+'|'+r.wrin));
    return[...cloudInvRows,...manualGapFill];
  },[cloudInvRows,ds.inventoryRows]);
  const hasCloud=cloudInvRows.length>0;
  const manualFillCount=effRows.length-cloudInvRows.length;

  const locs=React.useMemo(()=>[...new Set(effRows.map(r=>r.loc).filter(Boolean))],[effRows]);
  const [selLoc,setSelLoc]=React.useState(locs[0]||'');
  const [classFilter,setClassFilter]=React.useState('Paper');
  const [threshold,setThreshold]=React.useState(14);          // overstock sender threshold
  const [recvThreshold,setRecvThreshold]=React.useState(14);  // needs-supply receiver threshold
  const [fullCaseOnly,setFullCaseOnly]=React.useState(false);  // restrict to full-case transfers
  const [excldWrap,setExcldWrap]=React.useState(true);
  const [viewTransfers,setViewTransfers]=React.useState(false);
  const [groupByProduct,setGroupByProduct]=React.useState(false);
  const [doRollup,setDoRollup]=React.useState(true);
  const [activeSection,setActiveSection]=React.useState(1);

  const locRows=React.useMemo(()=>{
    const base=effRows.filter(r=>selLoc?r.loc===selLoc:true);
    return filterByClass(base,classFilter);
  },[effRows,selLoc,classFilter]);

  const{svc,prod,overstk,actionItems}=React.useMemo(()=>computeInvSections(locRows,threshold,excldWrap,doRollup),[locRows,threshold,excldWrap,doRollup]);
  const transfers=React.useMemo(()=>viewTransfers?computeTransfers(filterByClass(effRows,classFilter),threshold,recvThreshold,fullCaseOnly):[],[viewTransfers,effRows,classFilter,threshold,recvThreshold,fullCaseOnly]);

  const storeName=selLoc?sName(selLoc):'All Locations';
  const totalExcessVal=overstk.reduce((a,r)=>a+(r.excessValue||0),0);

  const sTag=(col,txt)=>span({style:{fontSize:'8px',padding:'1px 6px',borderRadius:3,fontWeight:700,
    background:col+'22',color:col,border:'.5px solid '+col+'55'}},txt);

  const iRow=(r,i)=>tr({key:r.wrin,style:{borderBottom:'.5px solid var(--bdr)',
    background:i%2?'rgba(255,255,255,.015)':'transparent'}},
    td({style:{padding:'4px 8px',color:'var(--text3)',fontFamily:'var(--mono)',fontSize:'9px'}},(i+1)),
    td({style:{padding:'4px 8px',fontSize:'9px',color:'var(--text)'}},
      div({style:{display:'flex',alignItems:'baseline',gap:5}},
        span({style:{fontSize:'8px',fontFamily:'var(--mono)',color:'var(--text3)',flexShrink:0}},r.wrin),
        r.isRolledUp
          ?div({style:{display:'flex',alignItems:'center',gap:4}},
              r.description,
              span({title:r.rollupNote,style:{fontSize:'7.5px',padding:'1px 5px',borderRadius:3,
                background:'rgba(245,188,0,.1)',color:'var(--gold)',border:'.5px solid rgba(245,188,0,.3)',
                cursor:'help'}},'⊕ '+r.rolledUpCount+' merged'))
          :span(null,r.description))),
    td({style:{padding:'4px 8px',fontSize:'8.5px',color:'var(--text3)',fontFamily:'var(--mono)'}},(r.uom||'').split('/')[0].trim()+'/'+r.caseSize),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,
      color:r.daysSupply<7?'var(--crit)':r.daysSupply<14?'var(--warn)':'var(--text)'}},
      r.daysSupply.toFixed(1)+'d'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px'}},
      r.usageDay.toFixed(3)),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'#60a5fa',fontWeight:600}},
      r.usage1000.toFixed(4)),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'#10b981'}},
      Math.round(r.usageDay*r.caseSize*1.1)+'ea/day')
  );

  const oRow=(r,i)=>tr({key:r.wrin,style:{borderBottom:'.5px solid var(--bdr)',
    background:i%2?'rgba(255,255,255,.015)':'transparent'}},
    td({style:{padding:'4px 8px',fontSize:'9px',color:'var(--text)'}},
      div({style:{display:'flex',alignItems:'baseline',gap:5}},
        span({style:{fontSize:'8px',fontFamily:'var(--mono)',color:'var(--text3)',flexShrink:0}},r.wrin),
        span(null,r.description,r.inactive?' ':' '),
        r.inactive&&sTag('var(--crit)','🚫 INACTIVE'))),
    td({style:{padding:'4px 8px',fontSize:'8.5px',color:'var(--text3)'}},(r.class_||'')),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:'#f97316'}},r.daysSupply.toFixed(0)+'d'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px'}},(r.excessDays||0).toFixed(0)+'d'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:600,color:'#f59e0b'}},(r.excessCases||0).toFixed(2)+' cs'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:'#ef4444'}},'$'+(r.excessValue||0).toFixed(2))
  );

  const tRow=(r,i)=>tr({key:i,style:{borderBottom:'.5px solid var(--bdr)',
    background:r.noRecipient?'rgba(245,158,11,.04)':'transparent'}},
    td({style:{padding:'4px 8px',fontSize:'9px',color:'var(--text)'}},
      div({style:{display:'flex',alignItems:'baseline',gap:5}},
        span({style:{fontSize:'8px',fontFamily:'var(--mono)',color:'var(--text3)',flexShrink:0}},r.wrin),
        span(null,r.description))),
    td({style:{padding:'4px 8px',fontSize:'8.5px',color:'var(--gold)'}},
      r.sendLoc?sNameC(r.sendLoc):'Unknown'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',color:'#f97316'}},
      r.sendDays+'d / '+(r.excessCases||0)+'cs excess'),
    td({style:{padding:'4px 8px',textAlign:'center',fontSize:'10px'}},'→'),
    r.noRecipient
      ?td({colSpan:3,style:{padding:'4px 8px',fontSize:'8.5px',color:'#f59e0b',fontStyle:'italic'}},
          'No Transfer Recipient Found — all other locations at or above threshold')
      :td({style:{padding:'4px 8px',fontSize:'8.5px',color:'#a5b4fc'}},
          r.recvLoc?sNameC(r.recvLoc):'—'),
    !r.noRecipient&&td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'8.5px',color:'#10b981'}},r.recvDays+'d'),
    !r.noRecipient&&td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:'#60a5fa'}},(r.xferDisplay||r.xferQty+' cs')),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text3)'}},
      (r.dist!=null?r.dist+'mi':'—')),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',
      color:r.noRecipient?'#f59e0b':'#10b981'}},
      r.value>0?'$'+r.value.toFixed(2):'—')
  );

  const thStyle={fontSize:'8px',fontWeight:700,textTransform:'uppercase',letterSpacing:'.5px',
    color:'var(--text3)',borderBottom:'.5px solid var(--bdr)',padding:'5px 8px',
    textAlign:'left',background:'var(--mid2)'};

  const secTab=(n,label,count,col)=>btn({
    className:'btn btn-sm'+(activeSection===n?' btn-a':''),
    style:{fontSize:'9px',color:activeSection===n?'#000':(col||'var(--text3)')},
    onClick:()=>setActiveSection(n)},label+(count?' ('+count+')':''));

  // Both branches share the same bottom-sheet chrome (click-catcher strip, header
  // row, ✕ close style) so the close affordance never changes shape between states.
  if(!locs.length) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,display:'flex',flexDirection:'column',paddingTop:24}},
    div({style:{flex:'0 0 24px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',display:'flex',flexDirection:'column',overflow:'hidden',
      maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',
        gap:8,flexShrink:0,background:'var(--surf2)'}},
        div({style:{fontSize:'13px',fontWeight:800,color:'var(--gold)',flex:1}},'📦 Inventory Intelligence'),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      div({style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}},
        cloudRows===null
          ?div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
              div({style:{fontSize:'12px'}},'Loading…'))
          :div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
              div({style:{fontSize:40,marginBottom:12}},'📦'),
              div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Inventory Data'),
              div({style:{fontSize:'11px',color:'var(--text3)',lineHeight:1.6}},
                cloudErr
                  ?('☁ Auto-sync failed: '+cloudErr+'. ')
                  :('☁ No auto data yet for any location this period. '),
                'You can still drop inventory files (e.g. 3708 - Inventory Summary and Usage.xlsx) as a manual fallback.',
                div(null,'Each location needs its own file. Filename must start with the location number.'))))));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,display:'flex',flexDirection:'column',paddingTop:24}},
    div({style:{flex:'0 0 24px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',display:'flex',flexDirection:'column',overflow:'hidden',
      maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // ── Header ──────────────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',
        gap:8,flexShrink:0,background:'var(--surf2)',flexWrap:'wrap'}},
        div({style:{fontSize:'13px',fontWeight:800,color:'var(--gold)',flexShrink:0}},'📦 Inventory Intelligence'),
        // #214: visible (not tooltip-only) data-source state — a failed cloud read must not
        // look like an empty one, same rule the FOB panel's fix established.
        cloudRows===null
          ?span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,color:'var(--text3)',
              border:'.5px solid var(--bdr)'}},'☁ loading…')
          :cloudErr
          ?span({title:cloudErr,style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,
              color:'var(--crit)',background:'rgba(244,63,94,.12)',border:'.5px solid rgba(244,63,94,.4)'}},'⚠ auto-sync failed')
          :hasCloud
          ?span({style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,
              color:'#34d399',background:'rgba(52,211,153,.1)',border:'.5px solid rgba(52,211,153,.35)'}},
              '☁ cloud auto'+(manualFillCount>0?' + '+manualFillCount+' manual gap-fill':''))
          :span({title:'qsr_inventory_summary returned 0 rows — showing manual upload only',
              style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,
              color:'#f59e0b',background:'rgba(245,158,11,.1)',border:'.5px solid rgba(245,158,11,.35)'}},'☁ no cloud data yet'),
        unrecognizedClasses.length>0&&span({
          title:'cls values not matching the expected vocabulary: '+unrecognizedClasses.join(', ')+' — these items only appear under "All Classes", not their specific filter',
          style:{fontSize:'8px',padding:'2px 6px',borderRadius:3,fontWeight:700,color:'#f59e0b',
            background:'rgba(245,158,11,.1)',border:'.5px solid rgba(245,158,11,.35)',cursor:'help'}},
          '⚠ '+unrecognizedClasses.length+' unrecognized class'+(unrecognizedClasses.length!==1?'es':'')),
        h('select',{value:selLoc,onChange:e=>setSelLoc(e.target.value),
          style:{background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
            color:'var(--text)',fontSize:'10px',padding:'3px 6px',maxWidth:180}},
          locs.map(l=>h('option',{key:l,value:l},sNameC(l)))),
        div({style:{display:'flex',gap:2}},
          INV_CLASS_FILTERS.map(f=>btn({key:f.key,className:'btn btn-sm'+(classFilter===f.key?' btn-a':''),
            style:{fontSize:'8.5px',padding:'2px 7px'},onClick:()=>setClassFilter(f.key)},f.label))),
        div({style:{display:'flex',alignItems:'center',gap:6,marginLeft:'auto'}},
          div({style:{fontSize:'8.5px',color:'var(--text3)'}},'Overstock:'),
          h('input',{type:'number',min:1,max:90,value:threshold,onChange:e=>setThreshold(+e.target.value||14),
            style:{width:48,background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
              color:'var(--text)',fontSize:'10px',padding:'2px 5px',textAlign:'center'}}),
          div({style:{fontSize:'8.5px',color:'var(--text3)'}},'day threshold')
        ),
        btn({className:'btn btn-sm',style:{fontSize:'9px',color:'#10b981',borderColor:'rgba(16,185,129,.3)'},
          onClick:()=>generateInventoryReportHTML(selLoc,locRows,svc,prod,overstk,
            // Individual export: only show this location as sender
            (transfers||[]).filter(r=>r.sendLoc===selLoc),
            threshold,excldWrap,settings)},'📄 Export Location'),
        btn({className:'btn btn-sm',style:{fontSize:'9px',color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)'},
          title:'Export all loaded locations in one combined report',
          onClick:()=>generateBulkInventoryReport(effRows,threshold,excldWrap,classFilter,settings)},'📄 Export All Locations'),
        btn({className:'btn btn-sm',style:{color:'var(--text3)'},onClick:onClose},'✕')
      ),
      // ── Section tabs ─────────────────────────────────────────────────────
      div({style:{padding:'7px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:6,flexWrap:'wrap',
        background:'var(--mid2)',flexShrink:0}},
        secTab(1,'📦 Service',svc.length,'#10b981'),
        secTab(2,'🏭 Production',prod.length,'#60a5fa'),
        secTab(3,'⚠ Overstock',overstk.length,'#f97316'),
        secTab(4,'🔄 Transfers',transfers.length,'#a5b4fc'),
        div({style:{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}},
          (activeSection===1||activeSection===2)&&div({style:{display:'flex',alignItems:'center',gap:5,fontSize:'9px',color:'var(--text3)'}},
            h('input',{type:'checkbox',id:'doRollup',checked:doRollup,onChange:e=>setDoRollup(e.target.checked)}),
            h('label',{htmlFor:'doRollup',style:{cursor:'pointer',userSelect:'none'}},'Roll up duplicate WRINs')),
          activeSection===2&&div({style:{display:'flex',alignItems:'center',gap:6,fontSize:'9px',color:'var(--text3)'}},
            h('input',{type:'checkbox',id:'excldWrap',checked:excldWrap,onChange:e=>setExcldWrap(e.target.checked)}),
            h('label',{htmlFor:'excldWrap',style:{cursor:'pointer',userSelect:'none'}},'Exclude wraps/pouches')),
          activeSection===4&&btn({className:'btn btn-sm',style:{fontSize:'9px',color:'#a5b4fc',borderColor:'rgba(165,180,252,.3)'},
            onClick:()=>setViewTransfers(v=>!v)},
            viewTransfers?'Hide Transfers':'Calculate Transfers'),
            viewTransfers&&btn({className:'btn btn-sm',style:{fontSize:'9px',color:groupByProduct?'#f5bc00':'var(--text3)',borderColor:groupByProduct?'rgba(245,188,0,.4)':'var(--bdr)'},
              onClick:()=>setGroupByProduct(v=>!v)},groupByProduct?'↕ By Product':'↕ By Distance'),
            viewTransfers&&div({style:{display:'flex',alignItems:'center',gap:5,fontSize:'9px',color:'var(--text3)'}},
              'Sends >',
              h('input',{type:'number',min:1,max:90,value:threshold,onChange:e=>setThreshold(+e.target.value||14),
                style:{width:40,background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
                  color:'var(--text)',fontSize:'9px',padding:'1px 4px',textAlign:'center'}}),
              'd  Receives <',
              h('input',{type:'number',min:1,max:90,value:recvThreshold,onChange:e=>setRecvThreshold(+e.target.value||14),
                style:{width:40,background:'var(--surf3)',border:'.5px solid var(--bdr)',borderRadius:'var(--r)',
                  color:'var(--text)',fontSize:'9px',padding:'1px 4px',textAlign:'center'}}),
              'd'
            ),
            viewTransfers&&div({style:{display:'flex',alignItems:'center',gap:5,fontSize:'9px',color:'var(--text3)'}},
              h('input',{type:'checkbox',id:'fullCsOnly',checked:fullCaseOnly,onChange:e=>setFullCaseOnly(e.target.checked)}),
              h('label',{htmlFor:'fullCsOnly',style:{cursor:'pointer',userSelect:'none'}},'Full cases only'))
        )
      ),
      // ── Stats strip ──────────────────────────────────────────────────────
      div({style:{padding:'6px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',gap:16,
        background:'var(--surf2)',flexShrink:0,flexWrap:'wrap'}},
        ...[
          ['Items',locRows.length,'var(--text)'],
          ['Service',locRows.filter(r=>r.area==='Service').length,'#10b981'],
          ['Production',locRows.filter(r=>r.area==='Production').length,'#60a5fa'],
          ['Overstock >'+threshold+'d',overstk.length,'#f97316'],
          actionItems&&actionItems.length?['⚠ Needs Action',actionItems.length,'#ef4444']:null,
          ['Excess Value ($)','$'+totalExcessVal.toFixed(2),'#ef4444'],
          activeSection===4&&transfers.length?['Transfers',transfers.length,'#a5b4fc']:null,
        ].filter(Boolean).map(([l,v,c],i)=>div({key:i,style:{textAlign:'center'}},
          div({style:{fontSize:'14px',fontFamily:'var(--mono)',fontWeight:700,color:c}},''+v),
          div({style:{fontSize:'8px',color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}},''+l)))
      ),
      // ── Main content ─────────────────────────────────────────────────────
      div({style:{flex:1,overflowY:'auto',padding:16}},
        // SECTION 1: Service
        activeSection===1&&div(null,
          div({style:{marginBottom:8}},
            div({style:{fontSize:'10px',fontWeight:700,color:'#10b981',marginBottom:2}},'Top Service Items — Usage per $1,000 Net Sales'),
            div({style:{fontSize:'9px',color:'var(--text3)'}},'Top 20 service items by usage per $1,000 net sales — regardless of current stock level. Use as a daily stocking guide. Daily Target includes a 10% safety buffer.')),
          h('table',{style:{width:'100%',borderCollapse:'collapse'}},
            h('thead',null,h('tr',null,...['#','Description','UOM/Case','Days Supply','Usage/Day (cs)','Usage/$1000','Daily Target'].map((h_,i)=>
              th({key:i,style:{...thStyle,textAlign:i>=3?'right':'left'}},h_)))),
            h('tbody',null,svc.map((r,i)=>iRow(r,i))))),
        // SECTION 2: Production
        activeSection===2&&div(null,
          div({style:{marginBottom:8}},
            div({style:{fontSize:'10px',fontWeight:700,color:'#60a5fa',marginBottom:2}},'Top Production Items — Usage per $1,000 Net Sales'),
            div({style:{fontSize:'9px',color:'var(--text3)'}},'Top 20 production items by usage per $1,000 net sales — regardless of current stock level. Use as a daily stocking guide. Wraps/pouches excluded by default.')),
          h('table',{style:{width:'100%',borderCollapse:'collapse'}},
            h('thead',null,h('tr',null,...['#','Description','UOM/Case','Days Supply','Usage/Day (cs)','Usage/$1000','Daily Target'].map((h_,i)=>
              th({key:i,style:{...thStyle,textAlign:i>=3?'right':'left'}},h_)))),
            h('tbody',null,prod.map((r,i)=>iRow(r,i))))),
        // SECTION 3: Overstock
        activeSection===3&&actionItems&&actionItems.length>0&&div({style:{background:'rgba(239,68,68,.08)',border:'.5px solid rgba(239,68,68,.3)',borderRadius:6,padding:'10px 12px',marginBottom:12}},
          div({style:{fontSize:'10px',fontWeight:700,color:'#ef4444',marginBottom:6}},'⚠ Action Required — '+actionItems.length+' Item'+(actionItems.length!==1?'s':'')+' with Data Quality Issues'),
          ...actionItems.map((r,i)=>div({key:i,style:{borderBottom:i<actionItems.length-1?'.5px solid rgba(239,68,68,.15)':'none',padding:'6px 0',display:'flex',gap:10,alignItems:'flex-start'}},
            div({style:{minWidth:200,fontWeight:600,fontSize:'9px',color:'var(--text)'}},r.description),
            div({style:{minWidth:60,fontFamily:'var(--mono)',fontSize:'9px',color:'var(--crit)'}},(r.daysSupply||0).toFixed(1)+'d'),
            div({style:{flex:1,fontSize:'9px',color:'#f59e0b',lineHeight:1.5}},r.actionMsg)
          ))
        ),
        activeSection===3&&div(null,
          div({style:{marginBottom:8}},
            div({style:{fontSize:'10px',fontWeight:700,color:'#f97316',marginBottom:2}},'Overstock On-Hand — Items exceeding '+threshold+'-day supply threshold'),
            div({style:{fontSize:'9px',color:'var(--text3)'}},'Based on current Usage/Day rate. Excess Value = (Days Over Threshold × Usage/Day × Cost). 🚫 INACTIVE = zero usage with stock on hand.')),
          overstk.length===0?div({style:{color:'var(--text3)',textAlign:'center',padding:32}},'✅ No items exceed the '+threshold+'-day threshold'):
          h('table',{style:{width:'100%',borderCollapse:'collapse'}},
            h('thead',null,h('tr',null,...['Description','Class','Days Supply','Excess Days','Excess Cases','Excess Value'].map((h_,i)=>
              th({key:i,style:{...thStyle,textAlign:i>=2?'right':'left'}},h_)))),
            h('tbody',null,overstk.map((r,i)=>oRow(r,i))),
            h('tfoot',null,tr({style:{borderTop:'1px solid rgba(249,115,22,.3)',background:'rgba(249,115,22,.06)'}},
              td({style:{padding:'6px 8px',fontWeight:700,fontSize:'9px',color:'#f97316'},colSpan:5},'Total Excess Value'),
              td({style:{padding:'6px 8px',textAlign:'right',fontWeight:800,fontSize:'11px',color:'#ef4444',fontFamily:'var(--mono)'}},'$'+totalExcessVal.toFixed(2)))))),
        // SECTION 4: Transfers
        activeSection===4&&div(null,
          !viewTransfers?div({style:{textAlign:'center',padding:32,color:'var(--text3)'}},
            div({style:{fontSize:28,marginBottom:8}},'🔄'),
            div({style:{marginBottom:12}},'Click "Calculate Transfers" to find cross-location transfer opportunities.'),
            div({style:{fontSize:'9px',color:'var(--text3)'}},'Requires inventory data from multiple locations. Matches overstock at one store with deficit at another, sorted by distance.')):
          transfers.length===0?div({style:{textAlign:'center',padding:32,color:'#10b981'}},'✅ No transfer opportunities found at current threshold.'):
          div(null,
            div({style:{fontSize:'9px',color:'var(--text3)',marginBottom:8}},'Sending location has >'+threshold+' days supply. Receiving location has <'+(threshold/2).toFixed(0)+' days supply. Same organization only. Min 0.5 case transfer.'),
            h('table',{style:{width:'100%',borderCollapse:'collapse'}},
              h('thead',null,h('tr',null,...['Item','From','From Days','','To','To Days','Qty (cs)','Distance','Est. Value'].map((h_,i)=>
                th({key:i,style:{...thStyle,textAlign:i>=5?'right':'left'}},h_)))),
              h('tbody',null,transfers.map((r,i)=>tRow(r,i))))))
      )
    )
  );
}

// ── Inventory HTML Report Generator ────────────────────────────────────────
function generateInventoryReportHTML(loc, allRows, svc, prod, overstk, transfers, threshold, excldWrap, settings) {
  // Compute action items (negative on-hand) for the report
  const actionItems = (allRows||[]).filter(r=>r.daysSupply<0||r.usageDay<0).map(r=>{
    let msg='';
    if(r.daysSupply<0&&r.usageDay>0) msg='Inventory and correct count — negative on-hand directly affects your MB Order Proposal.';
    else if(r.daysSupply<0&&r.usageDay<=0) msg='Item appears inactive/depleted. Please Verify On-Hand Amount. If it is depleted and there is none on-hand, enter a zero (0) count and update in inventory.';
    else msg='Negative usage rate. Review and correct this item count.';
    return{...r,actionMsg:msg};
  });
  const storeName = loc ? sNameC(loc) : 'District Summary';
  const dateStr = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const totalExcessVal = overstk.reduce((a,r)=>a+(r.excessValue||0),0);
  const f2 = n => ('$'+Number(n||0).toFixed(2));
  const invSvcHeaders = ['#','Description','UOM / Case','Days Supply','Usage/Day (cs)','Usage / $1000','Daily Target (each)'];
  const ovHeaders = ['Description','Class','Days Supply','Excess Days','Excess Cases','Excess Value ($)'];
  const xfrHeaders = ['Item','Sending Location','Days Supply','→','Receiving Location','Days Supply','Qty (cases)','Distance','Est. Value'];

  const itemRow = (r,i) => `<tr class="${i%2?'alt':''}">
    <td class="num">${i+1}</td><td><span style="font-size:8px;font-family:monospace;color:#64748b">${r.wrin}</span> ${r.description}</td>
    <td class="mono dim">${(r.uom||'').split('/')[0].trim()+'/'+(r.caseSize||1)}</td>
    <td class="num ${r.daysSupply<7?'red':r.daysSupply<14?'amber':''}">${(r.daysSupply||0).toFixed(1)}d</td>
    <td class="num">${(r.usageDay||0).toFixed(3)}</td>
    <td class="num blue">${(r.usage1000||0).toFixed(4)}</td>
    <td class="num green">${Math.round((r.usageDay||0)*(r.caseSize||1)*1.1)}</td></tr>`;
  const ovRow = (r,i) => `<tr class="${i%2?'alt':''}">
    <td><span class="mono dim" style="margin-right:4px">${r.wrin}</span>${r.description}${r.inactive?' <span class="badge-red">INACTIVE</span>':''}</td>
    <td class="dim">${r.class_}</td>
    <td class="num orange">${(r.daysSupply||0).toFixed(0)}d</td>
    <td class="num">${(r.excessDays||0).toFixed(0)}d</td>
    <td class="num amber">${(r.excessCases||0).toFixed(2)} cs</td>
    <td class="num red">${f2(r.excessValue)}</td></tr>`;
  const xfrRow = (r,i) => `<tr class="${i%2?'alt':''}">
    <td><span style="font-size:8px;font-family:monospace;color:#64748b">${r.wrin}</span> ${r.description}</td>
    <td class="gold">${r.sendLoc?sNameC(r.sendLoc):'Unknown'}</td>
    <td class="num orange">${r.sendDays}d</td><td class="center">→</td>
    <td class="blue">${r.recvLoc?sNameC(r.recvLoc):'—'}</td>
    <td class="num green">${r.recvDays}d</td>
    <td class="num bold-blue">${r.xferDisplay||r.xferQty+' cs'}</td>
    <td class="num dim">${r.dist}mi</td>
    <td class="num green">${f2(r.value)}</td></tr>`;

  const makeTable = (headers,rows,tbody) => `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${tbody}</tbody></table>`;
  const css = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;background:#080c14;color:#f0f4ff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{max-width:1100px;margin:0 auto;padding:32px 36px}
.cover{padding:40px 0;border-bottom:2px solid #f5bc00;margin-bottom:32px}
.cover h1{font-size:26px;font-weight:800;letter-spacing:-.5px;margin-bottom:4px}
.cover .meta{font-size:11px;color:#64748b;margin-top:4px}
.section{margin-bottom:32px;page-break-inside:avoid}
.section-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;padding-bottom:6px;border-bottom:.5px solid rgba(255,255,255,.1)}
.section-hdr h2{font-size:14px;font-weight:700}
.section-hdr .section-meta{font-size:9px;color:#64748b}
.section-note{font-size:9px;color:#64748b;margin-bottom:8px;line-height:1.5}
table{width:100%;border-collapse:collapse;font-size:9px}
th{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:.5px solid rgba(255,255,255,.1);padding:5px 8px;text-align:left;background:#111827;position:sticky;top:0}
td{padding:5px 8px;border-bottom:.5px solid rgba(255,255,255,.04)}
tr.alt td{background:rgba(255,255,255,.015)}
.num{text-align:right;font-family:'DM Mono',monospace}
.mono{font-family:'DM Mono',monospace}
.dim{color:#64748b}
.center{text-align:center}
.red{color:var(--crit)}.amber{color:var(--warn)}.orange{color:#f97316}
.green{color:#10b981}.blue{color:#60a5fa}.gold{color:#f5bc00}
.bold-blue{color:#60a5fa;font-weight:700}
.badge-red{display:inline-block;background:rgba(244,63,94,.15);color:var(--crit);border:.5px solid rgba(244,63,94,.3);border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;margin-left:4px}
.stats-strip{display:flex;gap:16px;padding:10px 0;border-bottom:.5px solid rgba(255,255,255,.1);margin-bottom:16px}
.stat-item{text-align:center}.stat-val{font-size:18px;font-weight:700;font-family:'DM Mono',monospace}
.stat-lbl{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
tfoot td{font-weight:700;color:#f97316}
@page{margin:12mm}
@media print{body{background:#fff;color:#111}.dim{color:#888}.section{page-break-inside:auto}
  tr.alt td{background:#f9f9f9}th{background:#f0f0f0;color:#666}
  .red{color:#dc2626}.amber{color:#d97706}.green{color:#059669}.blue{color:#2563eb}
  .gold{color:#b45309}.orange{color:#c2410c}.badge-red{background:#fee2e2;color:#dc2626;border-color:#dc2626}}`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Geist:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>Inventory Report — ${storeName}</title><style>${css}</style></head><body><div class="page">
<div class="cover">
  <div style="font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Meridian · Inventory Intelligence</div>
  <h1>Inventory Report — ${storeName}</h1>
  <div class="meta">${dateStr} · Overstock threshold: ${threshold} days · Class: ${allRows.length?allRows[0].class_:'N/A'} · ${allRows.length} items analyzed</div>
</div>
<div class="stats-strip">
  ${[['Total Items',allRows.length,'var(--text)'],['Service',svc.length,'#10b981'],['Production',prod.length,'#60a5fa'],['Overstock >'+threshold+'d',overstk.length,'#f97316'],['Excess Value',f2(totalExcessVal),'#ef4444']].map(([l,v,c])=>`<div class="stat-item"><div class="stat-val" style="color:${c}">${v}</div><div class="stat-lbl">${l}</div></div>`).join('')}
</div>
${actionItems&&actionItems.length?`<div class="section" style="margin-bottom:16px;border:.5px solid rgba(239,68,68,.4);border-radius:6px;padding:12px 16px;background:rgba(239,68,68,.04)">
  <div style="font-weight:700;color:#ef4444;font-size:12px;margin-bottom:8px">⚠ ${actionItems.length} Action Item${actionItems.length!==1?'s':''} Require Immediate Attention</div>
  ${actionItems.map(r=>`<div style="padding:5px 0;border-bottom:.5px solid rgba(239,68,68,.15);font-size:10px">
    <span style="font-family:monospace;color:#64748b;margin-right:5px">${r.wrin}</span>
    <strong style="color:#f0f4ff">${r.description}</strong>
    <span style="color:#f59e0b;margin-left:8px">${(r.daysSupply||0).toFixed(1)}d</span>
    <span style="color:#f59e0b;margin-left:8px">→ ${r.actionMsg}</span>
  </div>`).join('')}
</div>`:''}
<div class="section" style="page-break-before:always">
  <div class="section-hdr"><h2 style="color:#10b981">Section 1 — Service Items &nbsp;<span style="font-size:10px;font-weight:400;color:#64748b">Top 20 by Usage / $1,000 Net Sales</span></h2><div class="section-meta">${svc.length} items</div></div>
  <div class="section-note">Items used in the customer-facing service area. Sorted by usage efficiency relative to sales volume. Daily Target includes a 10% safety buffer and is expressed in individual units (each).</div>
  ${makeTable(invSvcHeaders,svc,svc.map(itemRow).join(''))}
</div>
<div class="section" style="page-break-before:always">
  <div class="section-hdr"><h2 style="color:#60a5fa">Section 2 — Production Items &nbsp;<span style="font-size:10px;font-weight:400;color:#64748b">Top 20 by Usage / $1,000 Net Sales${excldWrap?' (wraps/pouches excluded)':''}</span></h2><div class="section-meta">${prod.length} items</div></div>
  <div class="section-note">Packaging used in food production (cartons, boxes, fry containers, platters). ${excldWrap?'Wraps and pouches are excluded from ranking as their high per-unit volume can skew the list. Toggle the option in the app to include them.':''}</div>
  ${makeTable(invSvcHeaders,prod,prod.map(itemRow).join(''))}
</div>
<div class="section" style="page-break-before:always">
  <div class="section-hdr"><h2 style="color:#f97316">Section 3 — Overstock On-Hand &nbsp;<span style="font-size:10px;font-weight:400;color:#64748b">Items exceeding ${threshold}-day supply</span></h2><div class="section-meta">${overstk.length} items · $${totalExcessVal.toFixed(2)} total excess value</div></div>
  <div class="section-note">Items where current on-hand quantity exceeds ${threshold} days of supply based on current usage rate. Excess Value = (Excess Days × Usage/Day × Cost/Case). INACTIVE = items with on-hand stock but zero current usage.</div>
  ${overstk.length?makeTable(ovHeaders,overstk,overstk.map(ovRow).join('')+`<tr style="background:rgba(249,115,22,.08)"><td colspan="6" style="font-weight:700;padding:6px 8px;color:#f97316">Total Excess Value</td><td style="text-align:right;font-weight:800;font-size:11px;color:#ef4444;font-family:monospace;padding:6px 8px">${f2(totalExcessVal)}</td></tr>`):'<div style="text-align:center;padding:24px;color:#10b981">✅ No items exceed the '+threshold+'-day threshold.</div>'}
</div>
${transfers&&transfers.length?`<div class="section" style="page-break-before:always">
  <div class="section-hdr"><h2 style="color:#a5b4fc">Section 4 — Transfer Opportunities &nbsp;<span style="font-size:10px;font-weight:400;color:#64748b">Cross-location inventory optimization</span></h2><div class="section-meta">${transfers.length} opportunities</div></div>
  <div class="section-note">Locations with overstocked items (>${threshold}d supply) matched with locations needing the same item (<${threshold/2}d supply). Same organization only. Minimum 0.5 case transfer. Sorted by distance between locations.</div>
  ${makeTable(xfrHeaders,transfers,transfers.map(xfrRow).join(''))}
</div>`:''}
<div style="margin-top:24px;padding-top:12px;border-top:.5px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;font-size:9px;color:#64748b">
  <span>Meridian · Inventory Intelligence · ${storeName} · Confidential</span>
  <span style="font-family:monospace;color:#f5bc00;opacity:.5">v5.26</span>
</div></div></body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='inventory_report_'+(loc||'district').replace(/[^a-z0-9]/gi,'_')+'_'+new Date().toISOString().slice(0,10)+'.html';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);document.body.removeChild(a);},1000);
}

export { InventoryIntelligence };
