// @ts-nocheck
export default {version:'5.818', date:'2026-11-17', changes:[
  '**Added a pinnable Quick Upload screen for iPhone** (`?quickupload=1`) — iOS Safari does not ' +
  'implement the Web Share Target API at all (v5.816\'s finding), so there is no way to make ' +
  'Meridian appear in the native Share Sheet the way it already does on Android. Rather than a ' +
  'per-user iOS Shortcut (which needs a personalized auth token and a brand-new backend per ' +
  'person — a real support burden as more users come on), this is the option that scales to ' +
  'every future user with zero setup on our end: open the link once, "Share → Add to Home ' +
  'Screen," and that icon opens straight into a minimal, low-chrome, one-tap upload screen — ' +
  'the exact same upload pipeline and confirmation summary the sidebar\'s "Load" button already ' +
  'uses, just without the rest of the dashboard mounted. A "Copy link" callout now lives at the ' +
  'top of Data Manager\'s overview tab. Also added the same link as a manifest `shortcuts` ' +
  'entry, so Android users get a bonus long-press home-screen jump-list shortcut too.',
]};
