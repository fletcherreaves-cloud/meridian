// @ts-nocheck
export default {version:'5.287', date:'2026-08-31', changes:[
  'EOM Diagnosis -- v5.286 fixed the Decision Guide table\'s grid-line CONTRAST, but the owner still ' +
  'saw no borders at all under Draft > Store Message > Full Report specifically. Root cause was ' +
  'structural, not color: the <style> tag defining .md-rpt\'s table/th/td border rules lived INSIDE ' +
  'the Diagnose modal\'s own JSX, so it only existed in the DOM while that specific modal happened to ' +
  'be open. The Draft/Store-Message modal uses the SAME className for its own markdown body but is a ' +
  'separate, mutually-exclusive modal -- its table never had ANY of these rules, borders included, no ' +
  'matter what color they were set to. Hoisted the style block to the panel\'s top level so it applies ' +
  'to every .md-rpt consumer regardless of which modal is open. New regression test renders the REAL ' +
  'panel, opens ONLY the Draft modal (Diagnose never opened), and asserts the border rule is present ' +
  '-- a test that only opened the Diagnose modal, or only checked the CSS text in isolation, could not ' +
  'have caught this.'
]};
