// @ts-nocheck
export default {version:'4.948', date:'2026-08-10', changes:[
  'Dialed-In calibration now follows you across devices. It used to live only in this browser\'s local storage — calibrating on the desktop did nothing for the phone or iPad, and calibrating on a preview link before it went live never reached production at all, silently. It now syncs the same way Model Assignments and Smart Targets already do: instant on this device, cloud copy follows within moments, newer always wins if you calibrate on two devices close together.',
  'Resetting calibration now clears the cloud copy too, not just this device\'s. Without that, a reset would have appeared to work and then had the old numbers quietly reappear the next time the app loaded — the specific failure mode this change was built to prevent, not one that shipped.',
]};
