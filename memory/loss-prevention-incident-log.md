---
name: loss-prevention-incident-log
description: "Store-level financial loss-prevention incidents the owner has gathered from memory/investigation, for future pattern-finding. Scoped strictly to financial loss (theft, time fraud, embezzlement) — personnel-safety matters are tracked separately, outside this repo, per owner direction 2026-11-02."
metadata:
  type: project
---

# Loss Prevention — Incident Log

**Purpose:** a running record of known/suspected financial-loss incidents by store, gathered from
the owner's own memory and informal investigation (not from a formal system of record), so
patterns can eventually be checked against hard data (cash variance, change-order activity,
payroll hours vs. scheduled hours, etc. — see `plan-security-loss-prevention.md` for the
detection-engine design this could eventually feed).

**Scope note (owner-stated 2026-11-02):** this file tracks financial loss only — theft,
time/payroll fraud, embezzlement. A separate personnel-safety allegation gathered in the same
research pass was **deliberately excluded** from this repo: it is already reported through
law-enforcement/HR/legal channels, and documenting an unproven allegation naming a real person in
a git-tracked file (persistent history, not access-controlled the way an HR/legal file would be)
creates exposure with no analytical upside — it isn't a "loss trend," it's a matter for those
channels. If it needs to be referenced here later, that's a deliberate, separate decision, not a
default.

**Confidence:** everything below is **owner recollection, not verified against source
documents/dates** (the owner's own words: "not sure exactly when"). Treat entries as leads to
check against real data (QSRSoft register audit, cash sheet, payroll), not as established fact.
Dates in brackets are approximate.

---

## Holdenville (loc 35064 — "Mini Yahola")

- **Time-shaving suspected**, approx. **2022–2024** (exact year uncertain). Pattern not yet
  specified (which punches, who).
- **After-close cash removal suspected** — "her and others" (unnamed in the source note) entering
  the store after close and taking money. Same approximate window as above.
- **Change-order theft — Rachel (manager), terminated fall 2025.** Reported as confirmed (manager
  fired for this), not just suspected.

## Lindsay-Wal-Mart (loc 18213)

- **2021 — female manager arrested, ~$30,000 embezzled.** Cash taken.
- **Payroll fraud (same manager/period):** manager's daughter was scheduled/working
  approximately 20 hours per 2-week pay period but was paid for 80 hours — a ~4x overpayment
  pattern, suggesting falsified timecards/manual hour entry rather than a punch-clock error.

---

## Next steps (not yet done)

- Cross-reference both stores' `qsr_register_audit`/cash-variance history against the
  approximate 2022–2024 (Holdenville) and 2021 (Lindsay) windows once this file is acted on —
  `src/utils/register-audit.js`/`analyzeRegisterAudit` and the Cash Variance Pattern panel are the
  existing tools for this.
- Pin down exact dates/names for the Holdenville time-shaving and after-close items before trying
  to correlate against data — "2022-2023-2024" is too wide a window to search efficiently as-is.
- If/when more incidents like this are gathered, add them here in the same per-store, dated
  format rather than a new file per batch.
