// @ts-nocheck
export default {version:'5.493', date:'2026-10-03', changes:[
  'Inventory: fixed Overstock\'s Excess Cases showing implausible figures (owner-reported, ' +
  'e.g. "11091.01 cs" of pepper packets for a believable $54.96 excess value). Confirmed live ' +
  'against qsr_inventory_summary (1000 real rows): uom is never \'Case\' -- only the item\'s own ' +
  'natural unit (Each/Container/Bag/Gallon/Packet/Pouch/Box/Pound), with case size reported ' +
  'separately -- so usagePerDay/startInv/endInv/actualUsage were never in cases to begin with. ' +
  'cloudRowsToPanelShape had this hardcoded eachFmt:false (an explicitly-flagged "UNVERIFIED" ' +
  'guess); flipped to true now that it\'s measured. excessCases now divides by case size for ' +
  'every cloud-sourced Overstock row, same as the manual-upload path already did for "Display ' +
  'as Each" workbooks. excessValue was unaffected either way (it never divided by case size), ' +
  'matching the owner\'s own read that "value looks ok, but cases way high."',
  '4 new tests (dispatch-inventory-eaches-vs-cases-2026-10-03.test.js), including a regression ' +
  'test documenting the old buggy magnitude. Full suite: 5258/5258 passing. Build clean, eager ' +
  'payload 555.58 KB gzip (budget 850 KB).',
]};
