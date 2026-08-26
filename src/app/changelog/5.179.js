// @ts-nocheck
export default {version:'5.179', date:'2026-08-26', changes:[
  'Fix: Op Supplies vs Budget was labeled src:\'manual\' in Performance Review\'s metric config, '
  + 'hiding the "★auto" indicator and implying a manager needed to type a number in. Not true — '
  + 'autoPopulateKPIs already unconditionally sums the real, auto-pulled eBOS stream '
  + '(qsr_ebos_daily.ops_purchases) into this metric every time; a manual entry was always being '
  + 'silently overwritten. Owner confirmed: "Op supplies we actually already have through the ebos '
  + 'pull." Flipped the config to src:\'auto\', field:\'opSupplies\' to match reality — no behavior '
  + 'change, purely a UI-label correction so the auto indicator shows correctly.\n\n'
  + 'Full suite 2645/2645 passing; build clean, no bundle impact (metadata-only change).',
]};
