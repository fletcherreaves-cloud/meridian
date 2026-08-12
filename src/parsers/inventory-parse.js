// @ts-nocheck
// ── Inventory parsing (WRIN master + manual XLSX parser) ───────────────────────
// #214: split out of views/inventory.js so the 76KB panel component can go fully
// lazy (App.js's lazyPanel()) without pipeline.js's static import of
// parseInventoryData (needed to parse an uploaded "Inventory Summary and Usage"
// workbook at file-drop time, synchronously, not lazily) dragging the whole panel
// back into the entry chunk — the exact INEFFECTIVE_DYNAMIC_IMPORT trap #207
// found for one-pager.js/above-store-onepager.js. pipeline.js imports from HERE
// now, never from views/inventory.js. views/inventory.js imports INV_MASTER/
// classifyInvArea back from here for its own use (formatXferQty at render time,
// and to classify the new auto-pulled qsr_inventory_summary rows the same way
// manual-upload rows always were — area was never actually upload-derived, it's
// always this WRIN lookup, so the cloud rows get identical treatment).
import { loadXLSX } from '../lib/xlsx-lazy.js';

// #248 — xlsx lazy-loaded (see lib/xlsx-lazy.js's header for the full rationale). This module's
// only XLSX use, sheet_to_json inside parseInventoryData below, always runs after the caller
// (App.js's handleFiles) has already produced `wb` via XLSX.read() — which itself only happens
// after handleFiles awaited ensureInventoryXLSXReady() below — so XLSX is always populated by
// the time parseInventoryData runs. parseInventoryData itself stays synchronous; no ripple to
// pipeline.js's buildDS/mergeDS callers.
let XLSX = null;
export async function ensureInventoryXLSXReady() {
  if (!XLSX) XLSX = await loadXLSX();
  return XLSX;
}

// ── Inventory Master — 298 items, sourced from Inventory_Master.xlsx ─────
// area: Stock Location (Service/Production/Promotional/Stockroom)
// ipu: Inner packs per case | ipc: Each per inner pack | upc: Each per case
// N/A (Ops Supply) entries excluded — not used in this module currently.
export const INV_MASTER = {
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
export function classifyInvArea(wrin, desc){
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
export function parseInvUOM(uom){
  const s=String(uom||'');
  const m=s.match(/\/\s*(\d+)/);
  return{caseSize:m?parseInt(m[1]):1,unitType:s.split('/')[0].trim()};
}
export function parseInventoryData(wb, filename){
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
