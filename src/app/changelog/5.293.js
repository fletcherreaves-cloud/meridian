// @ts-nocheck
export default {version:'5.293', date:'2026-08-31', changes:[
  'EOM Count Swings -- product-reconstruction candidates now re-rank by real, recent POS sales, not ' +
  'just recipe-ratio fit (owner req, same-day follow-up: a live Pauls Valley report showed "Triple ' +
  'Stack" items surfacing for a 269-unit sausage patty shortage). Measured against real ' +
  'qsr_product_mix data before building anything: Triple Stack items genuinely DO sell there (a few ' +
  'a week, real orders as recent as 2 days before checked) -- the on_pos filter was correct, not a ' +
  'bug. Owner\'s own read once shown the real numbers: "your logic is valid about a low volume item, ' +
  'not likely the cause. more likely high volume items." So candidates aren\'t gated by sales volume ' +
  '(on_pos already correctly gates by whether the item is sold at all) -- they\'re RE-RANKED: a ' +
  'candidate whose implied quantity vastly exceeds what the item has actually sold recently (>3x, ' +
  'generous) now drops below a real, sales-supported explanation, tight recipe fit or not, since a ' +
  'perfectly tight ratio match on a rarely-sold item is a coincidence dressed up as a strong signal.',
  'Each candidate now shows its real recent sales count next to the tight/loose fit badge -- ' +
  '"X sold recently" or, when implausible, "⚠ only X sold recently" -- transparent data so a manager ' +
  'can judge plausibility themselves, same "show the candidates, don\'t hide the loose ones" rule ' +
  'this report already followed for fit quality.',
  'New targeted loader loadPmixSalesByItems() (src/lib/supabase.js) -- deliberately NOT the existing ' +
  'district-wide loadPmixRows() (40-day default, ~436K rows/~24s for every store\'s full item ' +
  'roster), which would have turned this panel\'s normally-fast load slow for a feature that only ' +
  'needs a handful of items at a handful of stores. Fetches sales for exactly the (loc, item_number) ' +
  'pairs the FIRST pass of reconstruction candidates already named, in a second async pass that ' +
  're-ranks the same candidates once real numbers are in -- doesn\'t change what surfaces, only the ' +
  'order.',
]};
