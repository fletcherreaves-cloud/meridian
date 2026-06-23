// @ts-nocheck
import * as React from 'react';
import * as XLSX from 'xlsx';
import { INV_ORG_COORDS, STORE_NAMES, sName, sNameC } from '../constants.js';

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

// INVENTORY INTELLIGENCE — parseInventoryData
// Parses "Inventory Summary and Usage" QSRSoft export.

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

// ── Inventory Master — 298 items, sourced from Inventory_Master.xlsx ─────
// area: Stock Location (Service/Production/Promotional/Stockroom)
// ipu: Inner packs per case | ipc: Each per inner pack | upc: Each per case
// N/A (Ops Supply) entries excluded — not used in this module currently.
const INV_MASTER = {
  '00001-705':{area:'Production',ipu:2,ipc:30,upc:60,uom:'EA'},
  '00002-678':{area:'Production',ipu:2,ipc:30,upc:60,uom:'EA'},
  '00003-623':{area:'Production',ipu:1,ipc:30,upc:30,uom:'EA'},
  '00004-849':{area:'Production',ipu:6,ipc:6,upc:36,uom:'LB'},
  '00005-086':{area:'Production',ipu:1,ipc:384,upc:384,uom:'EA'},
  '00006-465':{area:'Production',ipu:4,ipc:15,upc:60,uom:'EA'},
  '00008-044':{area:'Production',ipu:6,ipc:33,upc:198,uom:'EA'},
  '00009-304':{area:'Production',ipu:30,ipc:20,upc:600,uom:'FL OZ'},
  '00013-350':{area:'Production',ipu:8,ipc:176,upc:1408,uom:'EA'},
  '00014-243':{area:'Production',ipu:6,ipc:12,upc:72,uom:'EA'},
  '00015-100':{area:'Production',ipu:8,ipc:39,upc:312,uom:'EA'},
  '00016-160':{area:'Production',ipu:6,ipc:30,upc:180,uom:'EA'},
  '00018-022':{area:'Production',ipu:4,ipc:5,upc:20,uom:'LB'},
  '00019-008':{area:'Stockroom',ipu:1,ipc:75,upc:75,uom:'GAL'},
  '00021-086':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '00023-117':{area:'Service',ipu:36,ipc:20,upc:720,uom:'EA'},
  '00026-041':{area:'Production',ipu:24,ipc:1,upc:24,uom:'LB'},
  '00028-246':{area:'Production',ipu:10,ipc:1,upc:10,uom:'LB'},
  '00029-009':{area:'Production',ipu:12,ipc:4,upc:48,uom:'LB'},
  '00033-079':{area:'Service',ipu:6,ipc:20,upc:120,uom:'EA'},
  '00035-100':{area:'Service',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '00037-021':{area:'Service',ipu:1,ipc:500,upc:500,uom:'EA'},
  '00038-054':{area:'Service',ipu:1,ipc:500,upc:500,uom:'EA'},
  '00042-002':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '00043-126':{area:'Service',ipu:6,ipc:1000,upc:6000,uom:'EA'},
  '00044-026':{area:'Service',ipu:6,ipc:1000,upc:6000,uom:'EA'},
  '00045-237':{area:'Service',ipu:1,ipc:1680,upc:1680,uom:'EA'},
  '00046-048':{area:'Service',ipu:1,ipc:250,upc:250,uom:'EA'},
  '00047-065':{area:'Service',ipu:1,ipc:2000,upc:2000,uom:'EA'},
  '00049-000':{area:'Service',ipu:1,ipc:2000,upc:2000,uom:'EA'},
  '00055-332':{area:'Production',ipu:30,ipc:20,upc:600,uom:'FL OZ'},
  '00056-000':{area:'Production',ipu:32,ipc:12,upc:384,uom:'OZ'},
  '00057-205':{area:'Service',ipu:1,ipc:250,upc:250,uom:'EA'},
  '00060-134':{area:'Service',ipu:4,ipc:1,upc:4,uom:'GAL'},
  '00061-170':{area:'Service',ipu:4,ipc:1,upc:4,uom:'GAL'},
  '00062-190':{area:'Service',ipu:4,ipc:1,upc:4,uom:'GAL'},
  '00063-053':{area:'Production',ipu:6,ipc:7.1,upc:42.6,uom:'LB'},
  '00070-189':{area:'Production',ipu:6,ipc:25,upc:150,uom:'EA'},
  '00071-126':{area:'Production',ipu:3,ipc:108,upc:324,uom:'EA'},
  '00097-271':{area:'Production',ipu:2,ipc:500,upc:1000,uom:'EA'},
  '00116-251':{area:'Service',ipu:15,ipc:140,upc:2100,uom:'EA'},
  '00127-828':{area:'Production',ipu:8,ipc:1000,upc:8000,uom:'EA'},
  '00141-671':{area:'Production',ipu:1,ipc:250,upc:250,uom:'EA'},
  '00168-002':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '00193-522':{area:'Service',ipu:12,ipc:600,upc:7200,uom:'EA'},
  '00223-567':{area:'Service',ipu:16,ipc:450,upc:7200,uom:'EA'},
  '00255-012':{area:'Service',ipu:9,ipc:12,upc:108,uom:'FL OZ'},
  '00258-118':{area:'Production',ipu:4,ipc:125,upc:500,uom:'EA'},
  '00261-266':{area:'Service',ipu:18,ipc:65,upc:1170,uom:'EA'},
  '00268-293':{area:'Production',ipu:4,ipc:205,upc:820,uom:'EA'},
  '00269-005':{area:'Service',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '00284-166':{area:'Production',ipu:3,ipc:1000,upc:3000,uom:'EA'},
  '00285-857':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '00289-624':{area:'Production',ipu:2,ipc:230,upc:460,uom:'EA'},
  '00297-239':{area:'Production',ipu:6,ipc:117,upc:702,uom:'EA'},
  '00311-298':{area:'Production',upc:720,uom:'EA'},
  '00396-103':{area:'Production',uom:'EA'},
  '00397-217':{area:'Service',ipu:6,ipc:50,upc:300,uom:'EA'},
  '00406-031':{area:'Service',ipu:12,ipc:15,upc:180,uom:'OZ'},
  '00407-958':{area:'Production',ipu:18,ipc:48,upc:864,uom:'EA'},
  '00408-280':{area:'Service',ipu:1,ipc:350,upc:350,uom:'EA'},
  '00409-239':{area:'Service',ipu:1,ipc:350,upc:350,uom:'EA'},
  '00410-065':{area:'Service',ipu:1,ipc:250,upc:250,uom:'EA'},
  '00411-012':{area:'Service',ipu:8,ipc:50,upc:400,uom:'EA'},
  '00419-008':{area:'Service',ipu:1,ipc:204,upc:204,uom:'EA'},
  '00486-002':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '00507-009':{area:'Production',ipu:8,ipc:80,upc:640,uom:'EA'},
  '00510-189':{area:'Service',ipu:2,ipc:24,upc:48,uom:'EA'},
  '00555-072':{area:'Service',ipu:8,ipc:4,upc:32,uom:'LB'},
  '00634-128':{area:'Promotional'},
  '00634-131':{area:'Promotional'},
  '00634-134':{area:'Promotional'},
  '00634-137':{area:'Promotional'},
  '00634-140':{area:'Promotional'},
  '00634-143':{area:'Promotional'},
  '00659-311':{area:'Promotional'},
  '00659-314':{area:'Promotional'},
  '00659-317':{area:'Promotional'},
  '00695-036':{area:'Production',ipu:6,ipc:2,upc:12,uom:'LB'},
  '00723-036':{area:'Service',ipu:1,ipc:50,upc:50,uom:'EA'},
  '00968-030':{area:'Production',ipu:10,ipc:6,upc:60,uom:'OZ'},
  '01000-027':{area:'Production',ipu:1,ipc:128,upc:128,uom:'EA'},
  '01004-066':{area:'Production',ipu:8,ipc:16,upc:128,uom:'FL OZ'},
  '01116-366':{area:'Production',ipu:30,ipc:20,upc:600,uom:'FL OZ'},
  '01637-095':{area:'Production',ipu:8,ipc:29,upc:232,uom:'EA'},
  '01665-040':{area:'Service',ipu:12,ipc:117,upc:1404,uom:'EA'},
  '01668-010':{area:'Production',ipu:8,ipc:29,upc:232,uom:'EA'},
  '01835-026':{area:'Production',ipu:1,ipc:2000,upc:2000,uom:'EA'},
  '01945-023':{area:'Service',ipu:2,ipc:1.25,upc:2.5,uom:'GAL'},
  '02113-109':{area:'Service',ipu:30,ipc:71,upc:2130,uom:'EA'},
  '02232-027':{area:'Production',ipu:12,ipc:3,upc:36,uom:'LB'},
  '02335-025':{area:'Production',ipu:1,ipc:100,upc:100,uom:'EA'},
  '02373-015':{area:'Service',ipu:1,ipc:40,upc:40,uom:'EA'},
  '02380-000':{area:'Service',ipu:1,ipc:200,upc:200,uom:'EA'},
  '02391-006':{area:'Production',ipu:2,ipc:1,upc:2,uom:'CONT'},
  '02393-055':{area:'Service',upc:500,uom:'EA'},
  '02400-012':{area:'Production',ipu:1,ipc:86,upc:86,uom:'EA'},
  '02407-015':{area:'Service',upc:750,uom:'EA'},
  '02448-048':{area:'Production',ipu:6,ipc:102,upc:612,uom:'FL OZ'},
  '02545-000':{area:'Service'},
  '02562-036':{area:'Production'},
  '02563-022':{area:'Production'},
  '02589-234':{area:'Production',ipu:1,ipc:35,upc:35,uom:'LB'},
  '02589-240':{area:'Production',ipu:1,ipc:1500,upc:1500,uom:'LB'},
  '02599-060':{area:'Production',ipu:6,ipc:12,upc:72,uom:'EA'},
  '02601-112':{area:'Service',ipu:6,ipc:33,upc:198,uom:'FL OZ'},
  '02601-126':{area:'Service',ipu:6,ipc:33,upc:198,uom:'FL OZ'},
  '02649-016':{area:'Production',ipu:12,ipc:36,upc:432,uom:'EA'},
  '02656-017':{area:'Production',ipu:2,ipc:250,upc:500,uom:'EA'},
  '02679-243':{area:'Production',ipu:12,ipc:27,upc:324,uom:'FL OZ'},
  '02813-084':{area:'Production',ipu:7,ipc:16,upc:112,uom:'EA'},
  '02816-015':{area:'Service',ipu:1,ipc:408,upc:408,uom:'EA'},
  '02861-064':{area:'Service',ipu:1,ipc:350,upc:350,uom:'EA'},
  '02896-051':{area:'Service',ipu:2,ipc:2,upc:4,uom:'GAL'},
  '02913-033':{area:'Production',ipu:4,ipc:48,upc:192,uom:'EA'},
  '03096-000':{area:'Production',ipu:1,ipc:2000,upc:2000,uom:'EA'},
  '03114-143':{area:'Production',ipu:12,ipc:24,upc:288,uom:'EA'},
  '03168-048':{area:'Service',ipu:1,ipc:575,upc:575,uom:'EA'},
  '03210-064':{area:'Production',ipu:2,ipc:120,upc:240,uom:'EA'},
  '03222-000':{area:'Service',ipu:1,ipc:160,upc:160,uom:'EA'},
  '03248-059':{area:'Service',ipu:1,ipc:250,upc:250,uom:'EA'},
  '03268-000':{area:'Service',ipu:1,ipc:84,upc:84,uom:'EA'},
  '03317-084':{area:'Production'},
  '03317-091':{area:'Production'},
  '03360-006':{area:'Production'},
  '03399-015':{area:'Service',ipu:1,ipc:408,upc:408,uom:'EA'},
  '03470-015':{area:'Service',ipu:6,ipc:3,upc:18,uom:'LB'},
  '03471-028':{area:'Service',ipu:12,ipc:1,upc:12,uom:'LB'},
  '03490-087':{area:'Production',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '03492-023':{area:'Service',ipu:10,ipc:100,upc:1000,uom:'EA'},
  '03496-098':{area:'Production',ipu:15,ipc:2,upc:30,uom:'LB'},
  '03561-036':{area:'Service',ipu:1,ipc:204,upc:204,uom:'EA'},
  '03569-093':{area:'Service',ipu:4,ipc:62,upc:248,uom:'FL OZ'},
  '03594-733':{area:'Production',ipu:5,ipc:220,upc:1100,uom:'EA'},
  '03761-164':{area:'Production',ipu:4,ipc:275,upc:1100,uom:'EA'},
  '03761-310':{area:'Production',ipu:4,ipc:275,upc:1100,uom:'EA'},
  '03876-048':{area:'Service',ipu:1,ipc:2.5,upc:2.5,uom:'GAL'},
  '03910-050':{area:'Production',ipu:6,ipc:275,upc:1650,uom:'EA'},
  '03952-102':{area:'Production',ipu:18,ipc:2.2,upc:39.6,uom:'LB'},
  '04170-070':{area:'Service',ipu:2,ipc:1.25,upc:2.5,uom:'GAL'},
  '04331-012':{area:'Service',ipu:1,ipc:2.5,upc:2.5,uom:'GAL'},
  '04334-006':{area:'Service',ipu:1,ipc:2.5,upc:2.5,uom:'GAL'},
  '04393-012':{area:'Service',ipu:2,ipc:2,upc:4,uom:'GAL'},
  '04498-076':{area:'Production',ipu:2,ipc:500,upc:1000,uom:'EA'},
  '04607-143':{area:'Service',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '04645-006':{area:'Service',ipu:6,ipc:1,upc:6,uom:'CONT'},
  '04843-021':{area:'Production',ipu:1,ipc:3,upc:3,uom:'GAL'},
  '05116-063':{area:'Service',ipu:16,ipc:2,upc:32,uom:'LB'},
  '05175-001':{area:'Production',ipu:2,ipc:120,upc:240,uom:'EA'},
  '05255-060':{area:'Service',ipu:2,ipc:2.5,upc:5,uom:'GAL'},
  '05358-013':{area:'Production',ipu:18,ipc:12,upc:216,uom:'EA'},
  '05370-012':{area:'Service',ipu:2,ipc:5,upc:10,uom:'L'},
  '05429-596':{area:'Production',ipu:4,ipc:750,upc:3000,uom:'EA'},
  '05550-142':{area:'Service',ipu:1,ipc:200,upc:200,uom:'EA'},
  '05565-404':{area:'Service',ipu:1,ipc:250,upc:250,uom:'EA'},
  '05582-313':{area:'Production',ipu:6,ipc:165,upc:990,uom:'EA'},
  '05582-315':{area:'Production',ipu:6,ipc:165,upc:990,uom:'EA'},
  '05750-019':{area:'Service',ipu:1,ipc:125,upc:125,uom:'EA'},
  '05776-003':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '05792-103':{area:'Service',ipu:6,ipc:33,upc:198,uom:'FL OZ'},
  '05869-005':{area:'Production',ipu:2,ipc:1000,upc:2000,uom:'EA'},
  '05906-009':{area:'Service',ipu:2,ipc:2,upc:4,uom:'GAL'},
  '06008-009':{area:'Service',ipu:2,ipc:2,upc:4,uom:'GAL'},
  '06043-009':{area:'Production',ipu:1,ipc:920,upc:920,uom:'EA'},
  '06070-080':{area:'Production',ipu:2,ipc:30,upc:60,uom:'EA'},
  '06294-045':{area:'Service',ipu:2,ipc:2.5,upc:5,uom:'GAL'},
  '06373-484':{area:'Service',ipu:20,ipc:40,upc:800,uom:'EA'},
  '06373-641':{area:'Service',ipu:20,ipc:40,upc:800,uom:'EA'},
  '06452-008':{area:'Production',ipu:2,ipc:1000,upc:2000,uom:'EA'},
  '06842-107':{area:'Service',ipu:1,ipc:40,upc:40,uom:'EA'},
  '07312-064':{area:'Production',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '07353-069':{area:'Production',ipu:20,ipc:130,upc:2600,uom:'EA'},
  '07421-079':{area:'Service',ipu:6,ipc:33,upc:198,uom:'FL OZ'},
  '07500-113':{area:'Production',ipu:2,ipc:1000,upc:2000,uom:'EA'},
  '07533-009':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '07554-073':{area:'Production',ipu:4,ipc:160,upc:640,uom:'EA'},
  '07559-107':{area:'Service',ipu:9,ipc:12,upc:108,uom:'FL OZ'},
  '07633-076':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '07634-375':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '07634-418':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '07812-076':{area:'Production',ipu:1,ipc:350,upc:350,uom:'EA'},
  '08200-116':{area:'Production',ipu:6,ipc:117,upc:702,uom:'EA'},
  '08235-106':{area:'Production',ipu:6,ipc:275,upc:1650,uom:'EA'},
  '08235-126':{area:'Production',ipu:6,ipc:275,upc:1650,uom:'EA'},
  '08257-018':{area:'Production',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '08498-022':{area:'Production',ipu:32,ipc:12,upc:384,uom:'EA'},
  '08549-026':{area:'Service',ipu:1,ipc:100,upc:100,uom:'EA'},
  '08551-000':{area:'Stockroom',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '08731-041':{area:'Service',ipu:1,ipc:350,upc:350,uom:'EA'},
  '08759-009':{area:'Service',ipu:1,ipc:2,upc:2,uom:'GAL'},
  '10195-005':{area:'Service'},
  '10454-015':{area:'Production',ipu:2,ipc:1000,upc:2000,uom:'EA'},
  '10537-004':{area:'Production',ipu:12,ipc:24,upc:288,uom:'EA'},
  '10726-000':{area:'Production',ipu:1,ipc:5,upc:5,uom:'GAL'},
  '10958-550':{area:'Service',ipu:2,ipc:500,upc:1000,uom:'EA'},
  '10979-009':{area:'Production',ipu:4,ipc:1,upc:4,uom:'CONT'},
  '10989-014':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '11671-049':{area:'Production',ipu:8,ipc:16,upc:128,uom:'EA'},
  '11765-110':{area:'Service',ipu:20,ipc:42,upc:840,uom:'EA'},
  '11766-121':{area:'Service',ipu:20,ipc:32,upc:640,uom:'EA'},
  '11766-128':{area:'Service',ipu:20,ipc:32,upc:640,uom:'EA'},
  '11767-108':{area:'Service',ipu:20,ipc:30,upc:600,uom:'EA'},
  '11859-013':{area:'Production',upc:450,uom:'EA'},
  '12197-000':{area:'Production',ipu:36,ipc:1,upc:36,uom:'LB'},
  '12206-015':{area:'Production',ipu:6,ipc:75,upc:450,uom:'EA'},
  '12793-001':{area:'Production',ipu:3,ipc:1000,upc:3000,uom:'EA'},
  '12910-005':{area:'Production',ipu:8,ipc:64,upc:512,uom:'EA'},
  '12911-003':{area:'Production',ipu:4,ipc:63,upc:252,uom:'EA'},
  '12911-004':{area:'Production',ipu:8,ipc:64,upc:512,uom:'EA'},
  '12944-006':{area:'Production',ipu:4,ipc:65,upc:260,uom:'EA'},
  '13229-425':{area:'Service',ipu:2,ipc:500,upc:1000,uom:'EA'},
  '13257-001':{area:'Service',ipu:1,ipc:32,upc:32,uom:'EA'},
  '13334-033':{area:'Service',ipu:4,ipc:500,upc:2000,uom:'EA'},
  '13334-035':{area:'Service',ipu:4,ipc:200,upc:800,uom:'EA'},
  '13334-037':{area:'Service',ipu:4,ipc:200,upc:800,uom:'EA'},
  '13480-000':{area:'Production'},
  '13595-001':{area:'Promotional'},
  '13825-006':{area:'Service',ipu:1,ipc:165,upc:165,uom:'EA'},
  '13826-001':{area:'Service',upc:1590,uom:'EA'},
  '13839-003':{area:'Promotional'},
  '14633-000':{area:'Service',ipu:2,ipc:24,upc:48,uom:'EA'},
  '14762-002':{area:'Service',ipu:15,ipc:117,upc:1755,uom:'EA'},
  '15423-010':{area:'Production',ipu:6,ipc:75,upc:450,uom:'EA'},
  '15610-000':{area:'Production',ipu:8,ipc:16,upc:128,uom:'FL OZ'},
  '15635-004':{area:'Production',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '15737-073':{area:'Service',ipu:20,ipc:41,upc:820,uom:'EA'},
  '15831-002':{area:'Service',ipu:20,ipc:80,upc:1600,uom:'EA'},
  '15832-014':{area:'Service',ipu:20,ipc:59,upc:1180,uom:'EA'},
  '15833-032':{area:'Service',ipu:20,ipc:42,upc:840,uom:'EA'},
  '15849-065':{area:'Service',ipu:2,ipc:500,upc:1000,uom:'EA'},
  '15886-003':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '15887-002':{area:'Production',ipu:5,ipc:1000,upc:5000,uom:'EA'},
  '16045-014':{area:'Service',ipu:1,ipc:250,upc:250,uom:'EA'},
  '16631-002':{area:'Promotional'},
  '17161-001':{area:'Promotional'},
  '17168-002':{area:'Promotional'},
  '17451-000':{area:'Production',ipu:8,ipc:16,upc:128,uom:'FL OZ'},
  '17863-000':{area:'Production',ipu:1,ipc:1000,upc:1000,uom:'EA'},
  '17981-001':{area:'Promotional'},
  '18000-001':{area:'Production',ipu:2,ipc:1000,upc:2000,uom:'EA'},
  '18838-000':{area:'Service',ipu:20,ipc:40,upc:800,uom:'EA'},
  '18895-000':{area:'Service',ipu:12,ipc:1,upc:12,uom:'Bag'},
  '18896-000':{area:'Service',ipu:12,ipc:1,upc:12,uom:'Bag'},
  '18985-008':{area:'Service',ipu:12,ipc:18,upc:216,uom:'OZ'},
  '19100-001':{area:'Promotional'},
  '19174-001':{area:'Promotional'},
  '19174-002':{area:'Promotional'},
  '19179-001':{area:'Production',ipu:8,ipc:110,upc:880,uom:'EA'},
  '19199-000':{area:'Promotional'},
  '19199-001':{area:'Promotional'},
  '19199-002':{area:'Promotional'},
  '19256-000':{area:'Promotional'},
  '19256-001':{area:'Promotional'},
  '19265-000':{area:'Promotional'},
  '19265-001':{area:'Promotional'},
  '19265-002':{area:'Promotional'},
  '19265-003':{area:'Promotional'},
  '19281-007':{area:'Production',ipu:2,ipc:20,upc:40,uom:'EA'},
  '19285-008':{area:'Production',ipu:4,ipc:160,upc:640,uom:'EA'},
  '19300-001':{area:'Production',ipu:16,ipc:283.5,upc:4536,uom:'G'},
  '19303-006':{area:'Production',ipu:8,ipc:16,upc:128,uom:'FL OZ'},
  '19308-000':{area:'Promotional'},
  '19309-002':{area:'Promotional'},
  '19315-005':{area:'Promotional'},
  '19358-000':{area:'Promotional'},
  '19471-000':{area:'Service',ipu:2,ipc:250,upc:500,uom:'EA'},
  '19588-000':{area:'Promotional'},
  '19588-002':{area:'Promotional'},
  '19588-003':{area:'Promotional'},
  '19647-000':{area:'Production',ipu:4,ipc:108,upc:432,uom:'EA'},
  '19649-000':{area:'Production',ipu:4,ipc:108,upc:432,uom:'EA'},
  '19651-000':{area:'Service',ipu:350,ipc:1,upc:350,uom:'EA'},
  '19725-000':{area:'Promotional'},
  '19774-001':{area:'Service',ipu:12,ipc:1,upc:12,uom:'Bag'},
  '19804-006':{area:'Service',ipu:6,ipc:32,upc:192,uom:'FL OZ'},
  '19809-002':{area:'Service',ipu:4,ipc:25.36,upc:101.44,uom:'FL OZ'},
  '19811-000':{area:'Service',ipu:4,ipc:64,upc:256,uom:'FL OZ'},
  '19812-000':{area:'Service',ipu:4,ipc:64,upc:256,uom:'FL OZ'},
  '19813-000':{area:'Service',ipu:4,ipc:64,upc:256,uom:'FL OZ'},
  '19844-000':{area:'Promotional'},
  '19868-007':{area:'Promotional'},
  '19872-280':{area:'Promotional',ipu:1,ipc:150,upc:150,uom:'EA'},
  '19872-310':{area:'Promotional'},
  '19872-311':{area:'Promotional'},
  '19872-312':{area:'Promotional'},
  '19872-313':{area:'Promotional'},
  '19872-314':{area:'Promotional',ipu:1,ipc:150,upc:150,uom:'EA'},
  '19872-315':{area:'Promotional',ipu:1,ipc:150,upc:150,uom:'EA'},
  '19872-316':{area:'Promotional',ipu:1,ipc:150,upc:150,uom:'EA'},
  '19966-000':{area:'Promotional'},
  '20105-000':{area:'Service',ipu:5,ipc:2,upc:10,uom:'LB'},
  '20121-000':{area:'Service',ipu:15,ipc:112,upc:1680,uom:'EA'},
  '20122-000':{area:'Service',ipu:10,ipc:112,upc:1120,uom:'EA'},
  '20159-000':{area:'Promotional',ipu:1,ipc:300,upc:300,uom:'EA'},
  '20175-000':{area:'Promotional'},
  '20175-001':{area:'Promotional'},
  '20243-000':{area:'Service'},
  '20286-000':{area:'Promotional'},
};
// Resolve area from INV_MASTER first, then fall back to keyword matching
function classifyInvArea(wrin, desc){
  const m=INV_MASTER[wrin];
  if(m&&(m.area==='Service'||m.area==='Production'))return m.area;
  // Fallback keywords for items not in master
  const d=(desc||'').toLowerCase()+' ';
  if(INV_PROD_KW.some(k=>d.includes(k)))return'Production';
  if(INV_SVC_KW.some(k=>d.includes(k)))return'Service';
  return'Other';
}

const INV_PROD_KW=['wrap','crtn','carton','fry box','label','lbl','bowl','ngt',
  'nugget','platter','pouch','liner','base','4 n 1','generic','con ','strip',
  'container','boat','gravy'];
const INV_SVC_KW=['straw','lid','cup','carrier','drink','napkin','cutlery',
  'spoon','tray','insert','sleeve','fntn','fountain','mccafe','mcfe','bag '];
// classifyInvArea now uses INV_MASTER (see above)
function parseInvUOM(uom){
  const s=String(uom||'');
  const m=s.match(/\/\s*(\d+)/);
  return{caseSize:m?parseInt(m[1]):1,unitType:s.split('/')[0].trim()};
}
function parseInventoryData(wb, filename){
  const fn=filename||'';
  const locMatch=fn.match(/^(\d{4,6})\s*[-\u2013]/);
  const loc=locMatch?locMatch[1]:null;
  // Detect Display as Each vs Display as Case from filename
  // Each-format files have usageDay in eaches/day — must divide by caseSize for cases
  const isEachFmt=fn.toLowerCase().includes('each')||fn.toLowerCase().includes('_ea');
  const sh=wb.SheetNames.find(s=>s.toLowerCase().includes('inventory'))||wb.SheetNames[0];
  if(!sh)return[];
  const raw=XLSX.utils.sheet_to_json(wb.Sheets[sh],{header:1,defval:''});
  // Find header row (contains 'WRIN')
  let hi=0;
  for(let i=0;i<Math.min(raw.length,10);i++){if(String(raw[i][0]||'').toUpperCase().includes('WRIN')){hi=i;break;}}
  const hdrs=raw[hi].map(h=>String(h||'').trim());
  const ci=n=>{const i=hdrs.findIndex(h=>h.toLowerCase().includes(n.toLowerCase()));return i>=0?i:-1;};
  const C={wrin:ci('WRIN'),desc:ci('Desc'),class_:ci('Class'),uom:ci('UOM'),cost:ci('Cost'),
    startInv:ci('Starting'),purch:ci('Purch'),xfer:ci('Transf'),waste:ci('Waste'),endInv:ci('Ending'),
    actualUsage:ci('Actual Usage'),usageDay:ci('Usage /Day'),usage1000:ci('Usage /$1000'),daysSupply:ci('Days')};
  const rows=[];
  for(let i=hi+1;i<raw.length;i++){
    const r=raw[i];
    const wrin=String(r[C.wrin]||'').trim();
    if(!wrin||!wrin.match(/\d/))continue;
    const desc=String(r[C.desc]||'').trim();
    const class_=String(r[C.class_]||'').trim();
    const uomRaw=String(r[C.uom]||'').trim();
    const{caseSize,unitType}=parseInvUOM(uomRaw);
    const usageDay=parseFloat(r[C.usageDay])||0;
    const usage1000=parseFloat(r[C.usage1000])||0;
    const daysSupply=parseFloat(r[C.daysSupply])||0;
    const cost=parseFloat(r[C.cost])||0;
    const area=classifyInvArea(wrin,desc);
    const inactive=usageDay===0&&daysSupply>0;
    rows.push({loc,wrin,description:desc,class_,uom:uomRaw,caseSize,unitType,cost,
      usageDay,usage1000,daysSupply,area,inactive,
      eachFmt:isEachFmt,   // true = usageDay is in eaches/day, false = cases/day
      actualUsage:parseFloat(r[C.actualUsage])||0,
      startingInv:parseFloat(r[C.startInv])||0,
      endingInv:parseFloat(r[C.endInv])||0
    });
  }
  return rows;
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
    const iR=(r,i)=>`<tr style="${i%2?'background:rgba(255,255,255,.015)':''}"><td style="padding:4px 8px"><span style="font-size:8px;font-family:monospace;color:#64748b;margin-right:5px">${r.wrin||''}</span>${r.description}${r.isRolledUp?'<span style="font-size:7px;padding:1px 4px;border-radius:3px;background:rgba(245,188,0,.12);color:#f5bc00;margin-left:4px">⊕ merged</span>':''}</td><td style="padding:4px 8px;font-family:monospace;text-align:right">${(r.usageDay||0).toFixed(3)}</td><td style="padding:4px 8px;font-family:monospace;text-align:right;color:#60a5fa">${(r.usage1000||0).toFixed(4)}</td><td style="padding:4px 8px;font-family:monospace;text-align:right;color:${r.daysSupply<7?'#f87171':r.daysSupply<14?'#f59e0b':'#94a3b8'}">${(r.daysSupply||0).toFixed(1)}d</td><td style="padding:4px 8px;font-family:monospace;text-align:right;color:#10b981">${Math.round((r.usageDay||0)*(r.caseSize||1)*1.1)} ea/day</td></tr>`;
    const oR=(r,i)=>`<tr style="${i%2?'background:rgba(255,255,255,.015)':''}${r.inactive?';opacity:.7':''}"><td style="padding:4px 8px"><span style="font-size:8px;font-family:monospace;color:#64748b;margin-right:5px">${r.wrin||''}</span>${r.description}${r.inactive?' <span style="font-size:7px;color:#f87171;font-weight:700">🚫 INACTIVE</span>':''}</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#f97316">${(r.daysSupply||0).toFixed(0)}d</td><td style="padding:4px 8px;text-align:right;font-family:monospace">${(r.excessDays||0).toFixed(0)}d</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#f59e0b">${(r.excessCases||0).toFixed(2)} cs</td><td style="padding:4px 8px;text-align:right;font-family:monospace;color:#ef4444">${f2(r.excessValue)}</td></tr>`;
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
  const locs=React.useMemo(()=>[...new Set((ds.inventoryRows||[]).map(r=>r.loc).filter(Boolean))],[ds.inventoryRows]);
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
    const base=(ds.inventoryRows||[]).filter(r=>selLoc?r.loc===selLoc:true);
    return filterByClass(base,classFilter);
  },[ds.inventoryRows,selLoc,classFilter]);

  const{svc,prod,overstk,actionItems}=React.useMemo(()=>computeInvSections(locRows,threshold,excldWrap,doRollup),[locRows,threshold,excldWrap,doRollup]);
  const transfers=React.useMemo(()=>viewTransfers?computeTransfers(filterByClass(ds.inventoryRows||[],classFilter),threshold,recvThreshold,fullCaseOnly):[],[viewTransfers,ds.inventoryRows,classFilter,threshold,recvThreshold,fullCaseOnly]);

  const storeName=selLoc?sName(selLoc):'All Locations';
  const totalExcessVal=overstk.reduce((a,r)=>a+(r.excessValue||0),0);

  const sTag=(col,txt)=>span({style:{fontSize:'8px',padding:'1px 6px',borderRadius:3,fontWeight:700,
    background:col+'22',color:col,border:'.5px solid '+col+'55'}},txt);

  const iRow=(r,i)=>tr({key:r.wrin,style:{borderBottom:'.5px solid rgba(255,255,255,.05)',
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
      color:r.daysSupply<7?'#f87171':r.daysSupply<14?'#f59e0b':'var(--text)'}},
      r.daysSupply.toFixed(1)+'d'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px'}},
      r.usageDay.toFixed(3)),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'#60a5fa',fontWeight:600}},
      r.usage1000.toFixed(4)),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',color:'#10b981'}},
      Math.round(r.usageDay*r.caseSize*1.1)+'ea/day')
  );

  const oRow=(r,i)=>tr({key:r.wrin,style:{borderBottom:'.5px solid rgba(255,255,255,.05)',
    background:i%2?'rgba(255,255,255,.015)':'transparent'}},
    td({style:{padding:'4px 8px',fontSize:'9px',color:'var(--text)'}},
      div({style:{display:'flex',alignItems:'baseline',gap:5}},
        span({style:{fontSize:'8px',fontFamily:'var(--mono)',color:'var(--text3)',flexShrink:0}},r.wrin),
        span(null,r.description,r.inactive?' ':' '),
        r.inactive&&sTag('#f87171','🚫 INACTIVE'))),
    td({style:{padding:'4px 8px',fontSize:'8.5px',color:'var(--text3)'}},(r.class_||'')),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:'#f97316'}},r.daysSupply.toFixed(0)+'d'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px'}},(r.excessDays||0).toFixed(0)+'d'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:600,color:'#f59e0b'}},(r.excessCases||0).toFixed(2)+' cs'),
    td({style:{padding:'4px 8px',textAlign:'right',fontFamily:'var(--mono)',fontSize:'9px',fontWeight:700,color:'#ef4444'}},'$'+(r.excessValue||0).toFixed(2))
  );

  const tRow=(r,i)=>tr({key:i,style:{borderBottom:'.5px solid rgba(255,255,255,.05)',
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
    color:'var(--text3)',borderBottom:'.5px solid rgba(255,255,255,.1)',padding:'5px 8px',
    textAlign:'left',background:'var(--mid2)'};

  const secTab=(n,label,count,col)=>btn({
    className:'btn btn-sm'+(activeSection===n?' btn-a':''),
    style:{fontSize:'9px',color:activeSection===n?'#000':(col||'var(--text3)')},
    onClick:()=>setActiveSection(n)},label+(count?' ('+count+')':''));

  if(!locs.length) return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:460,
    display:'flex',alignItems:'center',justifyContent:'center'}},
    div({style:{textAlign:'center',color:'var(--text3)',padding:40}},
      div({style:{fontSize:40,marginBottom:12}},'📦'),
      div({style:{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:8}},'No Inventory Data Loaded'),
      div({style:{fontSize:'11px',color:'var(--text3)',marginBottom:16,lineHeight:1.6}},
        'Drop your inventory files (e.g. 3708 - Inventory Summary and Usage.xlsx) into the app.',div(null,'Each location needs its own file. Filename must start with the location number.')),
      btn({className:'btn btn-sm',onClick:onClose},'Close')));

  return div({style:{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:460,display:'flex',flexDirection:'column',paddingTop:24}},
    div({style:{flex:'0 0 24px',cursor:'pointer'},onClick:onClose}),
    div({style:{flex:1,background:'var(--surf)',display:'flex',flexDirection:'column',overflow:'hidden',
      maxWidth:1200,margin:'0 auto',width:'calc(100% - 32px)',borderRadius:'var(--rl) var(--rl) 0 0',boxShadow:'0 -8px 40px rgba(0,0,0,.4)'}},
      // ── Header ──────────────────────────────────────────────────────────
      div({style:{padding:'10px 16px',borderBottom:'.5px solid var(--bdr)',display:'flex',alignItems:'center',
        gap:8,flexShrink:0,background:'var(--surf2)',flexWrap:'wrap'}},
        div({style:{fontSize:'13px',fontWeight:800,color:'var(--gold)',flexShrink:0}},'📦 Inventory Intelligence'),
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
          onClick:()=>generateBulkInventoryReport(ds.inventoryRows||[],threshold,excldWrap,classFilter,settings)},'📄 Export All Locations'),
        btn({className:'btn btn-sm',onClick:onClose},'✕')
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
            viewTransfers&&btn({className:'btn btn-sm',style:{fontSize:'9px',color:groupByProduct?'#f5bc00':'var(--text3)',borderColor:groupByProduct?'rgba(245,188,0,.4)':'rgba(255,255,255,.1)'},
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
            div({style:{minWidth:60,fontFamily:'var(--mono)',fontSize:'9px',color:'#f87171'}},(r.daysSupply||0).toFixed(1)+'d'),
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
.red{color:#f87171}.amber{color:#f59e0b}.orange{color:#f97316}
.green{color:#10b981}.blue{color:#60a5fa}.gold{color:#f5bc00}
.bold-blue{color:#60a5fa;font-weight:700}
.badge-red{display:inline-block;background:rgba(248,113,113,.15);color:#f87171;border:.5px solid rgba(248,113,113,.3);border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;margin-left:4px}
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

export { parseInventoryData, InventoryIntelligence };
