// @ts-nocheck
export default {version:'5.729', date:'2026-11-10', changes:[
  '**🔐 Security Events — "General Drawer Open" wired in; manager-authorization field confirmed '+
  'already mapped (task #131).** A read-only probe added 2026-11-08 to find the real `event_token` '+
  'for the owner\'s KB-reported "General Drawer Open" category had never actually been run and '+
  'its results captured. Re-ran it for real: the token is `drawer_open` (the live API calls these '+
  'rows "Unauthorized Drawer Open") — confirmed frequent across every store/date sampled. Found '+
  'and fixed a real bug this would have shipped: drawer_open rows carry a literal '+
  '`"0000-00-00"`/`"00:00:00"` sentinel for their POS-session fields (not an absent value), which '+
  'a Postgres `date` column rejects outright — nulled before it ever reaches the DB. Confirmed '+
  'the "Manager Authorization Type" field the owner also flagged is `mgr_code`, already mapped '+
  'since the original build — not a gap, though a third real raw value (`"false"`) turned up that '+
  'the original capture never saw.',
  '**New EVENT-004 security rule — drawer-open rate, z-scored against store peers.** A 7-day/28-'+
  'store real backfill (57,641 rows saved, zero errors) measured that the sessions-worked '+
  'denominator genuinely works for this event (every crew member with a flagged drawer-open also '+
  'had other same-day activity to compute a rate from) and that the raw event is common enough '+
  '(45% of shifts) that only a peer-relative outlier, not a flat occurrence count, makes sense — '+
  'matching EVENT-001/002/003\'s real live shape. Shipped inactive pending review.',
]};
