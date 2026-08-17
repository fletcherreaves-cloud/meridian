// @ts-nocheck
export default {version:'4.921', date:'2026-08-09', changes:[
  'Fixed the mobile app feeling slow to open menus and panels — a modal-tracking gate had regressed since 4.212, so opening the hamburger menu (or several other panels) forced the whole app to re-render instead of just the panel that opened. Found with a real capture from the interaction tracer, not guessed. Also debounced the startup data loaders so their 32-loader burst no longer coalesces into a visible stall.',
]};
