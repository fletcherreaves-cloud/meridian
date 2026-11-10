// @ts-nocheck
export default {version:'5.737', date:'2026-11-10', changes:[
  '**🔧 Fixed: top bar notification/account dropdowns invisible on some browsers.** The portrait-'+
  'mode scroll fix shipped this afternoon (v5.722) made the top bar\'s right-side action group '+
  'scroll horizontally instead of overflowing — but the Notifications bell and Account menus '+
  'render their dropdowns as regular page elements inside that same scrolling strip, so on '+
  'browsers that clip content strictly (the same failure mode fixed for Inventory Control\'s '+
  'menus a couple days ago) the dropdown opened but couldn\'t be seen. Both menus now pop open '+
  'as an overlay on top of the whole page instead of being boxed inside the scroll strip — same '+
  'fix, same reasoning as the Inventory Control one, just applied here too.',
]};
