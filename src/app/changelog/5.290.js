// @ts-nocheck
export default {version:'5.290', date:'2026-08-31', changes:[
  'EOM Diagnose -- fixed the soft-drink/fountain yield rollup shipped minutes earlier this same day: ' +
  'a THIRD, separate "Do these now" source (the "recount may still help" push, scored ABOVE both the ' +
  'single headline slot and the Top-5 fill -- both of which were already fixed) fed the doNow list, ' +
  'and the Store Message abbreviated recap that renders the same list, with a plain "Recount DR ' +
  'PEPPER /BIB" line completely unfiltered by the fountain-group exclusion. Reproduced from a live ' +
  'Durant Store Message screenshot the owner reported ("durant still shows the same for dr pepper") ' +
  'and fixed with the same exclusion already applied to the other two sources.',
  'EOM Diagnose -- narrowed the fountain-rollup item list to the owner\'s exact set (verbatim: "it ' +
  'should only be coke, dr pepper, powerade, diet coke, sprite, hi c orange, diet dr pepper, and ' +
  'fanta orange"). The rollup now uses its own regex, scoped to those items only, instead of the ' +
  'broader fountain-beverage check the self-serve-tower over-portioning exemption still uses ' +
  'unchanged -- MM OJ100 (a juice) no longer gets netted into or excluded-from-headline-duty by the ' +
  'rollup, though it is untouched everywhere else.',
  'EOM Diagnose -- fountain rollup table now shows a Gallons column beside Cases, with a genuine ' +
  'summed Total row. Every item in the narrowed group is syrup/concentrate counted in "each" = 1 ' +
  'gallon at the raw-item level (confirmed against the owner\'s own "coke (bulk) case is 75 gallons"), ' +
  'so unlike cases -- a case of Bulk Coke syrup and a case of BIB concentrate are physically different ' +
  'container sizes and can\'t be added -- gallons are one real shared unit across the whole group and ' +
  'sum to an actual total.',
]};
