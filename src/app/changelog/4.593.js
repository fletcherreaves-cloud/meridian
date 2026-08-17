// @ts-nocheck
export default {version:'4.593', date:'2026-07-29', changes:[
  'At-A-Glance tiles no longer get stuck "as of" the last manual-upload date. The date-window logic checked only the manual Operations Report to decide whether the selected range had data — so once manual uploads stopped, it silently fell back to a 30-day window ending on the last manual date (e.g. Jul 15), pinning Sales & Guest Counts, Service, Controls and the district morning brief to that old date even though the auto DAR / Daily Glimpse were current. It now recognizes data from the auto streams too and anchors to the freshest date across all of them.',
]};
