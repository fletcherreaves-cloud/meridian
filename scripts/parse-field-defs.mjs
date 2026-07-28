#!/usr/bin/env node
// scripts/parse-field-defs.mjs
// Parse raw QSRSoft field-discovery.json blobs into structured field definitions
// and upsert to Supabase qsr_field_definitions table.
//
// Run: node scripts/parse-field-defs.mjs
// With Supabase: export VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
//                node scripts/parse-field-defs.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const INPUT  = path.join(__dir, '..', 'screenshots', 'field-discovery.json');
const OUTPUT = path.join(__dir, '..', 'screenshots', 'field-definitions-parsed.json');

// ── Known field names per page ────────────────────────────────────────────────
// Sorted longest-first so regex matches most-specific first.

const DAR_FIELDS = [
  'Act Hrs vs Need', 'Act Hrs vs Sch', 'Act Hrs', 'Act Punch Hrs',
  'All Net Avg Check', 'All Net Sales +/- %', 'All Net Sales +/-', 'All Net Sales',
  'Avg CTP', 'Avg DT TTL', 'Avg Win TTL',
  'Bev Items Per Order', 'Bev Items', 'Bev Run Time', 'Bev TTL',
  'DT GC +/-', 'DT GC vs Proj', 'DT GC', 'DT Pull Forward %', 'DT Pulled Forward Count',
  'In-Store GC +/-', 'In-Store GC vs Proj', 'In-Store GC',
  'KVS Time Per GC', 'OEPE W/O Parked', 'Prod Net Sales', 'Prod Sales vs Proj',
  'Punch Labor', 'R2P', 'STW GC vs Proj', 'STW GC',
];

const FOB_FIELDS = [
  'Avg Days on Hand',
  'Base Food %', 'Base Food $',
  'Comp Waste %', 'Comp Waste $',
  'Condiment %', 'Condiment $',
  'Disc Coupon %', 'Disc Coupon $',
  'Emp Meal %', 'Emp Meal $',
  'FOB W/ Disc & W/O Unexp %', 'FOB W/ Disc & W/O Unexp $',
  'FOB W/ Disc %', 'FOB W/ Disc $',
  'FOB W/O Unexp %', 'FOB W/O Unexp $',
  'FOB %', 'FOB $',
  'P & L Food Cost %', 'P & L Food Cost $',
  'P & L Food Promo %', 'P & L Food Promo $',
];

// Cash dialog 1: Breakfast / Delivery / Drive Thru sections
const CASH_FIELDS_1 = [
  'Breakfast: Breakfast % of Total Sales',
  'Breakfast: Breakfast All Net Sales LY',
  'Breakfast: Breakfast All Net Sales',
  'Breakfast: Breakfast Average Check LY',
  'Breakfast: Breakfast Average Check',
  'Breakfast: Breakfast GC +/- %',
  'Breakfast: Breakfast GC +/-',
  'Breakfast: Breakfast GC LY',
  'Breakfast: Breakfast GC',
  'Breakfast: Breakfast Sales +/- %',
  'Breakfast: Breakfast Sales +/-',
  'Delivery: McDelivery % of Total Sales',
  'Delivery: McDelivery Average Check LY',
  'Delivery: McDelivery Average Check',
  'Delivery: McDelivery GC +/- %',
  'Delivery: McDelivery GC +/-',
  'Delivery: McDelivery GC LY',
  'Delivery: McDelivery GC',
  'Delivery: McDelivery Net Sales LY',
  'Delivery: McDelivery Net Sales',
  'Delivery: McDelivery Sales +/- %',
  'Delivery: McDelivery Sales +/-',
  'Drive Thru: DT % of Total Sales',
];

// Cash dialog 2: Beverage Time / DT Line / Drive Thru timing
const CASH_FIELDS_2 = [
  'Beverage Time: Beverage GC +/-',
  'Beverage Time: Beverage GC',
  'Beverage Time: Beverage Order Time +/-',
  'Beverage Time: Beverage Order Time',
  'Beverage Time: Beverage Run Masked QtrHrs',
  'Beverage Time: Beverage Run Time +/-',
  'Beverage Time: Beverage Run Time',
  'Beverage Time: Beverage Total Time +/-',
  'Beverage Time: Beverage Total Time',
  'DT Line: DT Line Time Masked QtrHrs',
  'DT Line: DT Line Time +/-',
  'DT Line: DT Line Time',
  'DT Line: DT Order Time +/-',
  'DT Line: DT Order Time',
  'DT Line: DT Win1 Masked QtrHrs',
  'DT Line: DT Win1 Time +/-',
  'DT Line: DT Win1 Time',
  'DT Line: DT Win2 Masked QtrHrs',
  'DT Line: DT Win2 Time +/-',
  'DT Line: DT Win2 Time',
  'Drive Thru: Avg CTP +/-',
  'Drive Thru: Avg CTP',
  'Drive Thru: Avg DT TTL',
];

// Cash dialog 3: standalone labor/controls + category transactions
const CASH_FIELDS_3 = [
  'Act Hrs', 'Act vs Need', 'Actual Labor %', 'Avg Rate',
  'Billable Sales: Billable Sales Cnt',
  'Billable Sales: Billable Sales Amt',
  'Cash Refund: Cash Refund Cnt',
  'Cash Refund: Cash Refund Amt',
  'Cashless Refund: Cashless Refund Cnt',
  'Cashless Refund: Cashless Refund Amt',
  'Coupon Cnt', 'Crew Labor %', 'Crew Labor Hours', 'Deposit Amt',
  'Discount: Discount Pct',
  'Discount: Discount Cnt',
  'Discount: Discount Amt',
  'Drawer Opens',
  'Emp Meal: Emp Meal Cnt',
  'Emp Meal: Emp Meal Amt',
  'Mgr Meal: Manager Meal Cnt',
  'Mgr Meal: Manager Meal Amt',
  'OT: OT $',
];

// Cash dialog 4: FOB/food cost breakdown (same field names as standalone FOB + paper)
const CASH_FIELDS_4 = [
  'Base Food %', 'Base Food $',
  'Condiment %', 'Condiment $',
  'Disc Coupon %', 'Disc Coupon $',
  'Emp Meal %', 'Emp Meal $',
  'FOB W/O Unexp %', 'FOB W/O Unexp $',
  'FOB %', 'FOB $',
  'P & L Food Cost %', 'P & L Food Cost $',
  'P & L Food Promo %', 'P & L Food Promo $',
  'P & L Paper Cost %', 'P & L Paper Cost $',
  'P & L Paper Promo $',
  'Prod Net Sales',
  'Stat Var %', 'Stat Var $',
  'Unexplained %', 'Unexplained $',
];

// Cash dialog 5 / Cash Sheet page: DoorDash and cash amounts
const CASHSHEET_FIELDS = [
  '(+/-) Penny Order Rounding',
  '3PO Delivery Gross Amt', '3PO Delivery Qty',
  'AC Balance Redeemed Amt', 'AC Balance Redeemed Qty',
  'Actual Deposit Amt', 'Average Check', 'Cash For Next Day Deposit',
  'Cashless Sales Amt', 'Cashless Sales Qty', 'Crime Loss Amt',
  'Delivery Total Amt', 'Delivery Total Qty', 'Delivery Total Tax',
  'Deposit 1 Amt', 'Deposit 2 Amt', 'Discount Amt',
  'DoorDash 1AD Delivery Amt', 'DoorDash 1AD Delivery Qty', 'DoorDash 1AD Tax',
  'DoorDash Delivery Amt Total', 'DoorDash Delivery Amt', 'DoorDash Delivery Qty',
];

// Operations Report — Sales section
const OPS_SALES_FIELDS = [
  'All Net Sales LY', 'All Net Sales +/- %', 'All Net Sales +/-', 'All Net Sales',
  'Product Sales LY', 'Product Sales +/- %', 'Product Sales +/-', 'Product Sales',
  'STW GC +/- %', 'STW GC +/-', 'STW GC LY', 'STW GC',
  'In-Store GC LY', 'In-Store GC +/- %', 'In-Store GC +/-', 'In-Store GC vs Proj', 'In-Store GC',
  'DT GC LY', 'DT GC +/- %', 'DT GC +/-', 'DT GC vs Proj', 'DT GC',
  'All Net Avg Check',
];

// Operations Report — Service section
const OPS_SERVICE_FIELDS = [
  'Avg CTP +/-', 'Avg CTP', 'OEPE W/O Parked', 'Avg DT TTL +/-', 'Avg DT TTL',
  'DT Order Time +/-', 'DT Order Time',
  'DT Line Time +/-', 'DT Line Time',
  'DT Win1 Time +/-', 'DT Win1 Time',
  'DT Win2 Time +/-', 'DT Win2 Time',
  'DT Parked Count', 'DT Parked %',
];

// Operations Report — Controls section
const OPS_CONTROLS_FIELDS = [
  'OT Hrs', 'OT $',
  'Promo Cnt', 'Promo Pct', 'Promo Amt',
  'Drawer Opens',
  'Cash Over/Short %', 'Cash Over/Short',
  'T-Red Before %', 'T-Red Before Cnt',
];

// Sales Ledger (truncated after "Eat in GC" — more fields exist)
const LEDGER_FIELDS = [
  'All Net Sales +/- %', 'All Net Sales +/-', 'All Net Sales',
  'Average Check +/- %', 'Average Check +/-', 'Average Check',
  'Breakfast % of Total Sales', 'Breakfast All Net Sales',
  'Breakfast Average Check',
  'Breakfast GC +/- %', 'Breakfast GC +/-', 'Breakfast GC',
  'Breakfast Sales +/- %', 'Breakfast Sales +/-',
  'DT % of Total Sales', 'DT Average Check',
  'DT GC +/- %', 'DT GC +/-', 'DT GC',
  'DT Sales +/- %', 'DT Sales +/-', 'DT Sales',
  'Eat in GC',
];

// 3 Peaks dialog 1: channel breakdown (3PO / DT where ordered / FC)
const PEAKS_FIELDS_1 = [
  '3PO McDelivery % of Total GC', '3PO McDelivery % of Total Sales',
  '3PO McDelivery Average Check',
  '3PO McDelivery GC +/- %', '3PO McDelivery GC',
  '3PO McDelivery Net Sales', '3PO McDelivery Sales +/- %',
  'All Net Sales', 'Average Check',
  'DT Where Ordered % of Total GC', 'DT Where Ordered % of Total Sales',
  'DT Where Ordered Avg Chk', 'DT Where Ordered GC +/- %',
  'DT Where Ordered GCs', 'DT Where Ordered Sales +/- %', 'DT Where Ordered Sales',
  'FC % of Total GC', 'FC % of Total Sales', 'FC All Net Sales',
  'FC Average Check', 'FC GC +/- %', 'FC GC', 'FC Sales +/- %',
];

// 3 Peaks dialog 2: timing (truncated after "DT Parked % +/-" — more fields exist)
const PEAKS_FIELDS_2 = [
  'Avg CTP +/-', 'Avg CTP', 'Avg DT TTL +/-', 'Avg DT TTL',
  'Beverage GC +/-', 'Beverage GC',
  'Beverage Order Time +/-', 'Beverage Order Time',
  'Beverage Run Masked QtrHrs',
  'Beverage Run Time +/-', 'Beverage Run Time',
  'Beverage Total Time +/-', 'Beverage Total Time',
  'CTP Masked QtrHrs',
  'DT GC +/-', 'DT GC',
  'DT Line Time Masked QtrHrs', 'DT Line Time +/-', 'DT Line Time',
  'DT Order Time +/-', 'DT Order Time',
  'DT Parked % +/-', 'DT Parked %',
];

// Shift Manager Summary (truncated after "FC GC" — more fields exist)
const SHIFTMGR_FIELDS = [
  '# of Shifts', 'Act Hrs', 'Act vs Need', 'Act vs Sched',
  'All Net Sales +/-', 'All Net Sales',
  'Average Check +/-', 'Average Check',
  'Avg CTP +/-', 'Avg CTP',
  'Avg DT TTL +/-', 'Avg DT TTL',
  'DT Average Check +/-', 'DT Average Check',
  'DT GC +/-', 'DT GC',
  'DT Pulled Forward %',
  'DT Sales +/-', 'DT Sales',
  'FC All Net Sales', 'FC Average Check +/-', 'FC Average Check', 'FC GC',
];

// Trends
const TRENDS_FIELDS = [
  'All Net Sales +/- %', 'All Net Sales',
  'Average Check +/- %', 'Average Check',
  'Product Sales +/- %', 'Product Sales',
  'STW GC +/- %', 'STW GC',
];

// Product Mix
const PMIX_FIELDS = [
  '% Total (Net Sales)', '% Total (Product Sales)',
  '$ Sold',
  'Adj PMIX Sales',
  'Avg F&P Cost %', 'Avg Food Cost %', 'Avg Paper Cost %',
  'Bundle Discount $', 'Bundle Units', 'Desc', 'Disc Qty',
  'F&P % of Total Sales', 'Family Group', 'Margin %', 'Menu Item #',
  'Offer Discount $', 'Price', 'Promo $',
  'Total F&P Cost', 'Total Food Cost', 'Total Margin $', 'Total Paper Cost',
  'Unit F&P Cost',
];

// Records
const RECORDS_FIELDS = [
  'DT Sales: Date', 'DT Sales: Value',
  'DT Transactions: Date', 'DT Transactions: Value',
  'KVS Sandwiches: Date', 'KVS Sandwiches: Value',
  'KVS Time: Date', 'KVS Time: Value',
  'OEPE No Parked: Date', 'OEPE No Parked: Value',
  'R2P: Date', 'R2P: Value',
  'Total Sales: Date', 'Total Sales: Value',
  'Total Transactions: Date', 'Total Transactions: Value',
];

// Register Audit
const REGAUDIT_FIELDS = [
  'Average Check', 'Drawer GC', 'Drawer Opens', 'Drawer Sales',
  'Emp Meal Disc $', 'Emp Meal Disc Cnt', 'Emp Name',
  'Manual Refund/Overring $',
  'Mgr Meal #', 'Mgr Meal $',
  'Over/Short $', 'Over/Short %',
  'POS Overrings $', 'POS Overrings',
  'Promo #', 'Promo Amt', 'Promo Pct',
  'Refund Cash $', 'Refund Cashless $', 'Refund Cashless Cnt', 'Refund Cnt',
  'T-Red After $', 'T-Red After Avg',
];

// Labor Analysis (truncated after "In-Store Average Check" — more fields exist)
const LABOR_FIELDS = [
  'Act $', 'Act GC vs Proj', 'Act Hrs', 'Act Sales vs Proj',
  'Act vs Need FCH', 'Act vs Need Scd', 'Act vs Need', 'Act vs Sched',
  'Actual GC', 'All Net Sales', 'Average Check', 'Avg Rate',
  'Crew Labor $', 'Crew Labor %', 'Crew Labor Hours',
  'DT Average Check', 'DT Sales',
  'Fixed Contract Hours', 'Fixed Labor Hours Scheduled',
  'Floor Hours Sched', 'Floor Management Hours Needed',
  'In-Store All Net Sales', 'In-Store Average Check',
];

// ── Manual overrides ───────────────────────────────────────────────────────────
// Needed when a field name appears inside another field's description,
// causing the regex splitter to truncate the description prematurely.
const MANUAL_OVERRIDES = {
  dar: {
    'All Net Avg Check':   'All Net Sales divided by GC',
    'All Net Sales':       'Storewide All Net Sales',
    'All Net Sales +/-':   'All Net Sales compared to last year (trading or calendar day)',
    'All Net Sales +/- %': '(All Net Sales for this year minus All Net Sales for last year) divided by All Net Sales for last year (trading or calendar day depending on filter selection)',
    'In-Store GC vs Proj': 'In-Store GC compared to the projected In-Store GC from the scheduling software',
  },
  fob: {
    'FOB %':                     'FOB $ divided by Product Net Sales',
    'FOB W/ Disc %':             'FOB W/ Disc $ divided by Product Net Sales',
    'FOB W/ Disc & W/O Unexp %': 'FOB W/ Disc & W/O Unexp $ divided by Product Net Sales',
    'FOB W/O Unexp %':           'FOB W/O Unexp $ divided by Product Net Sales',
    'P & L Food Cost %':         'P & L Food Cost $ divided by Product Net Sales',
    'P & L Food Promo %':        'P & L Food Promo $ divided by Product Net Sales',
  },
  cash: {
    'FOB %':              'FOB $ divided by Product Net Sales',
    'FOB W/O Unexp %':    'FOB W/O Unexp $ divided by Product Net Sales',
    'P & L Food Cost %':  'P & L Food Cost $ divided by Product Net Sales',
    'P & L Food Promo %': 'P & L Food Promo $ divided by Product Net Sales',
    'P & L Paper Cost %': 'P & L Paper Cost $ divided by Product Net Sales',
    'Stat Var %':         'Stat variance amount divided by Product Net Sales',
    'Unexplained %':      'Unexplained amount divided by Product Net Sales',
    'Avg Rate':           'Crew Labor Dollars divided by Crew Labor Hours',
    'Crew Labor Hours':   'All Punched Hours for Job Title Codes classified as "crew"',
  },
  ledger: {
    'All Net Sales':          'Storewide All Net Sales',
    'All Net Sales +/-':      'All Net Sales compared to last year (trading or calendar day)',
    'All Net Sales +/- %':    'All Net Sales +/- divided by last year\'s sales, trading day or calendar day depending on what is selected',
    'Average Check':          'Storewide All Net Sales divided by Storewide GC',
    'Average Check +/-':      'Average Check compared to last year',
    'Average Check +/- %':    'Average Check increase or decrease percent compared to last year ((This Year minus Last Year) divided by Last Year)',
    'Breakfast Average Check': 'Breakfast All Net Sales divided by breakfast GC',
    'Breakfast GC':           'Breakfast GC, determined by the times set for breakfast start and end in RFM',
    'Breakfast GC +/-':       'Breakfast GC compared to last year',
    'Breakfast GC +/- %':     'Breakfast GC increase or decrease percent compared to last year ((This Year minus Last Year) divided by Last Year)',
    'DT % of Total Sales':    'DT Sales divided by all net sales',
    'DT Average Check':       'Drive Thru All Net Sales divided by Drive Thru GC',
    'DT GC':                  'Drive Thru Guest Count',
    'DT GC +/-':              'DT GC compared to last year',
    'DT GC +/- %':            'DT GC +/- divided by DT GC last year',
    'DT Sales':               'Drive Thru All Net Sales',
    'DT Sales +/-':           'DT Sales compared to last year',
    'DT Sales +/- %':         'DT Sales +/- divided by DT sales last year',
    'Eat in GC':              'GC for orders that are consumed at the restaurant',
  },
  peaks: {
    // Dialog 1: channel fields
    'All Net Sales':                   'Storewide All Net Sales',
    'Average Check':                   'Storewide All Net Sales divided by Storewide GC',
    '3PO McDelivery % of Total GC':    '3PO McDelivery GC divided by Total GC',
    '3PO McDelivery % of Total Sales': '3PO McDelivery Sales divided by All Net Sales',
    '3PO McDelivery Average Check':    '3PO McDelivery Net Sales divided by 3PO McDelivery GC',
    '3PO McDelivery GC +/- %':         '3PO McDelivery GC comp percent, ((3PO McDelivery GC this year minus 3PO McDelivery GC last year) divided by 3PO McDelivery GC last year',
    'FC % of Total GC':                'FC GC divided by Total GC',
    'DT Where Ordered Avg Chk':        'Drive Thru All Net Sales divided by Drive Thru GC',
    'DT Where Ordered Sales +/- %':    'Drive Thru All Net Sales compared to last year',
    // Dialog 2: timing fields
    'Avg CTP +/-':          'Avg CTP compared to last year',
    'Avg DT TTL +/-':       'Avg DT TTL compared to last year',
    'Beverage GC +/-':      'Beverage GC compared to last year',
    'Beverage Order Time +/-': 'Beverage Order Time compared to last year',
    'Beverage Run Time +/-':  'Beverage Run Time compared to last year',
    'Beverage Total Time +/-': 'Beverage Total Time compared to last year',
    'DT GC +/-':            'DT GC compared to last year',
    'DT Line Time +/-':     'Drive Thru Line Time compared to last year',
    'DT Order Time +/-':    'DT Order Time compared to last year',
    'DT Parked % +/-':      'DT Parked % compared to last year',
  },
  shiftmgr: {
    'All Net Sales':        'Storewide All Net Sales',
    'Average Check':        'Storewide All Net Sales divided by Storewide GC',
    'Average Check +/-':    'Average Check compared to last year',
    'Avg CTP +/-':          'Avg CTP compared to last year',
    'Avg DT TTL +/-':       'Avg DT TTL compared to last year',
    'DT Average Check':     'Drive Thru All Net Sales divided by Drive Thru GC',
    'DT GC +/-':            'DT GC compared to last year',
    'DT Sales':             'Drive Thru All Net Sales',
    'DT Sales +/-':         'DT Sales compared to last year',
    'FC Average Check':     'FC All Net Sales divided by FC GC',
    'FC Average Check +/-': 'FC Average Check this year minus FC Average Check last year',
  },
  trends: {
    'All Net Sales':        'Storewide All Net Sales',
    'All Net Sales +/- %':  'All Net Sales +/- divided by last year\'s sales, trading day or calendar day depending on what is selected',
    'Average Check':        'Storewide All Net Sales divided by Storewide GC',
    'Average Check +/- %':  'Average Check increase or decrease percent compared to last year ((This Year minus Last Year) divided by Last Year)',
    'Product Sales +/- %':  '(Product sales for this year minus product sales for last year) divided by product sales for last year',
    'STW GC +/- %':         'GC Comparison to last year - trading day or calendar day depending on filter selection',
  },
  pmix: {
    '$ Sold':        'Price times Number Sold - discounts are not subtracted',
    'Avg F&P Cost %': 'Total F&P divided by $ Sold',
    'Avg Food Cost %': 'Total Food Cost divided by $ Sold',
    'Avg Paper Cost %': 'Total Paper Cost divided by $ Sold',
    'Price':         'The individual price or range of prices that a menu item was sold for through the POS',
    'Promo $':       'Units Promo * Price',
    'Total F&P Cost':  'Unit Food & Paper times units sold',
    'Total Food Cost': 'Unit Food Cost times units sold',
    'Total Margin $':  '$ Sold minus Total F&P Cost',
    'Total Paper Cost': 'Unit Paper Cost times units sold',
  },
  regaudit: {
    'Average Check':  'Drawer Sales divided by GC',
    'Over/Short %':   'Over/Short $ divided by All Net sales',
    'POS Overrings':  'Orders where the order was voided on the POS',
    'POS Overrings $': 'Dollar amount where the order was voided on the POS',
    'Promo Pct':      'Promo Amt divided by Product sales',
    'T-Red After Avg': 'T-Red After $ divided by T-Red After Cnt',
  },
  labor: {
    'Act GC vs Proj':      'Actual GC minus GC that were projected in the scheduling software',
    'Act vs Need FCH':     'Actual Hours minus (Fixed Contract plus Floor Management Hours Needed plus Variable Needed)',
    'All Net Sales':       'Storewide All Net Sales',
    'Average Check':       'Storewide All Net Sales divided by Storewide GC',
    'Avg Rate':            'Crew Labor Dollars divided by Crew Labor Hours',
    'Crew Labor Hours':    'All Punched Hours for Job Title Codes classified as "crew"',
    'DT Average Check':    'Drive Thru All Net Sales divided by Drive Thru GC',
    'DT Sales':            'Drive Thru All Net Sales',
    'In-Store Average Check': 'In-Store All Net Sales divided by In Store GC',
  },
};

// ── Parser ─────────────────────────────────────────────────────────────────────

function stripBoilerplate(text) {
  return text
    .replace(/^Column Descriptions\s+Column\s+Column Description\s*/i, '')
    .replace(/\s*CLOSE\s*$/i, '')
    .trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

// Parse using a list of known field names as delimiters.
// text.split(/(field1|field2|...)) returns alternating [before, field, desc, field, desc, ...]
function parseWithKnownFields(text, fieldNames) {
  const sorted = [...fieldNames].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sorted.map(escapeRegex).join('|')})`, 'g');
  const parts = text.split(pattern).map(s => s.trim()).filter(Boolean);

  const results = [];
  const fieldSet = new Set(sorted.map(f => f.toLowerCase()));

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (fieldSet.has(part.toLowerCase())) {
      const desc = parts[i + 1];
      if (desc && !fieldSet.has(desc.toLowerCase())) {
        results.push({ label: part, description: desc });
        i++;
      } else {
        results.push({ label: part, description: '' });
      }
    }
  }
  return results;
}

function pickCashFields(text) {
  if (/Breakfast:/.test(text))            return CASH_FIELDS_1;
  if (/Beverage Time:/.test(text))        return CASH_FIELDS_2;
  if (/Billable Sales:/.test(text))       return CASH_FIELDS_3;
  if (/DoorDash|3PO Delivery/.test(text)) return CASHSHEET_FIELDS;
  return CASH_FIELDS_4;
}

function pickOpsFields(text) {
  if (/Breakfast:/.test(text))               return CASH_FIELDS_1;
  if (/Beverage Time:/.test(text))           return CASH_FIELDS_2;  // must precede DT Win check
  if (/OEPE|DT Parked/.test(text))           return OPS_SERVICE_FIELDS;
  if (/Promo|T-Red|Over\/Short/.test(text))  return OPS_CONTROLS_FIELDS;
  if (/Base Food|FOB %|Stat Var/.test(text)) return CASH_FIELDS_4;
  return OPS_SALES_FIELDS;
}

function pickPeaksFields(text) {
  if (/Avg CTP|Beverage GC|DT Parked/.test(text)) return PEAKS_FIELDS_2;
  return PEAKS_FIELDS_1;
}

function parseEntry(entry) {
  const text = stripBoilerplate(entry.description || '');
  if (!text) return [];

  // Schedule symbols are already structured (label + short description) — pass through
  if (entry.page === 'schedule') return [{ label: entry.label || '', description: text }];

  if (entry.page === 'dar')       return parseWithKnownFields(text, DAR_FIELDS);
  if (entry.page === 'fob')       return parseWithKnownFields(text, FOB_FIELDS);
  if (entry.page === 'cash')      return parseWithKnownFields(text, pickCashFields(text));
  if (entry.page === 'ops')       return parseWithKnownFields(text, pickOpsFields(text));
  if (entry.page === 'ledger')    return parseWithKnownFields(text, LEDGER_FIELDS);
  if (entry.page === 'cashsheet') return parseWithKnownFields(text, CASHSHEET_FIELDS);
  if (entry.page === 'peaks')     return parseWithKnownFields(text, pickPeaksFields(text));
  if (entry.page === 'shiftmgr')  return parseWithKnownFields(text, SHIFTMGR_FIELDS);
  if (entry.page === 'trends')    return parseWithKnownFields(text, TRENDS_FIELDS);
  if (entry.page === 'pmix')      return parseWithKnownFields(text, PMIX_FIELDS);
  if (entry.page === 'records')   return parseWithKnownFields(text, RECORDS_FIELDS);
  if (entry.page === 'regaudit')  return parseWithKnownFields(text, REGAUDIT_FIELDS);
  if (entry.page === 'labor')     return parseWithKnownFields(text, LABOR_FIELDS);

  // Unknown pages: store as raw blob
  return [{ label: entry.label || '', description: text }];
}

function applyOverrides(rows) {
  return rows.map(r => {
    const overrides = MANUAL_OVERRIDES[r.page];
    if (overrides && overrides[r.label]) {
      return { ...r, description: overrides[r.label] };
    }
    return r;
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  console.log(`[parse] ${raw.length} raw entries from ${INPUT}`);

  const structured = [];
  for (const entry of raw) {
    const parsed = parseEntry(entry);
    parsed.forEach(r => structured.push({ page: entry.page, ...r }));
  }

  // Deduplicate by (page, label), keeping longest description.
  // Many field names appear inside other fields' descriptions, producing short
  // garbage first-occurrences; the correct description (from the field's actual
  // position in text) is usually longer.
  const seen = new Map();
  for (const r of structured) {
    const key = `${r.page}::${r.label}`;
    const prev = seen.get(key);
    if (!prev || (r.description || '').length > (prev.description || '').length) {
      seen.set(key, r);
    }
  }
  const deduped = applyOverrides([...seen.values()]);

  console.log(`[parse] ${deduped.length} structured definitions after dedup + overrides`);
  deduped.forEach(r => console.log(`  [${r.page}] "${r.label}" → "${r.description?.slice(0, 70)}"`));

  fs.writeFileSync(OUTPUT, JSON.stringify(deduped, null, 2));
  console.log(`\n[parse] saved to ${OUTPUT}`);

  // Upsert to Supabase
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('[parse] set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to upsert to Supabase');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key);

  const rows = deduped
    .filter(r => r.label && r.description)
    .map(r => ({ page_key: r.page, field_label: r.label, description: r.description }));

  console.log(`\n[supabase] upserting ${rows.length} rows…`);
  const { error } = await sb.from('qsr_field_definitions')
    .upsert(rows, { onConflict: 'page_key,field_label' });

  if (error) console.error('[supabase] error:', error.message);
  else console.log('[supabase] done');
}

main().catch(e => { console.error(e); process.exit(1); });
