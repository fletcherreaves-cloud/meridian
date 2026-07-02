// Paste this entire block into the browser console while Meridian is open.
// It populates a complete H1 2026 GM review for Ronald McDonald.

(function () {
  const KEY = 'mf_perf_reviews_v1';
  const reviewId = 'ronald_mcdonald_2026_H1';

  // Preserve loc from existing review if one exists
  const existing = JSON.parse(localStorage.getItem(KEY) || '{}');
  const existingLoc = existing[reviewId]?.loc || 'store01';

  // ── Monthly KPI data (Jan–Jun 2026) ────────────────────────────────
  // Targets are consistent; actuals show gradual improvement over H1.
  const months = {
    1: { // January
      year:2026, month:1,
      oepe:152,       oepeTgt:155,
      osat:0.91,      osatTgt:0.90,
      epb2b:0.033,    epb2bTgt:0.040,
      r2p:63,         r2pTgt:65,
      delivWait:225,  delivWaitTgt:240,
      kvs:48,         kvsTgt:50,
      secondSide:0.87,secondSideTgt:0.85,
      complaints:4,   complaintsTgt:5,
      fsAudits:1.00,  fsAuditsTgt:1.00,
      fsEcoSure:0.92, fsEcoSureTgt:0.90,
      fsTablet:0.97,  fsTabletTgt:0.95,
      salesVsTgt:755000,  salesVsTgtTgt:750000,
      digitalGC:0.17, digitalGCTgt:0.15,
      delivGC:0.10,   delivGCTgt:0.10,
      foodOB:4300,    foodOBTgt:4500,
      labor:0.231,    laborTgt:0.235,
      opSupplies:0.024,opSuppliesTgt:0.025,
      totalProfit:0.155,totalProfitTgt:0.150,
      shiftCert:0.85, shiftCertTgt:0.85,
      shiftVerif:1.00,shiftVerifTgt:1.00,
      headcount:71,   headcountTgt:70,
      turnover90:0.32,turnover90Tgt:0.30,
      retention:0.86, retentionTgt:0.85,
    },
    2: { // February
      year:2026, month:2,
      oepe:149,       oepeTgt:155,
      osat:0.92,      osatTgt:0.90,
      epb2b:0.031,    epb2bTgt:0.040,
      r2p:61,         r2pTgt:65,
      delivWait:218,  delivWaitTgt:240,
      kvs:47,         kvsTgt:50,
      secondSide:0.88,secondSideTgt:0.85,
      complaints:3,   complaintsTgt:5,
      fsAudits:1.00,  fsAuditsTgt:1.00,
      fsEcoSure:0.94, fsEcoSureTgt:0.90,
      fsTablet:0.98,  fsTabletTgt:0.95,
      salesVsTgt:762000,  salesVsTgtTgt:750000,
      digitalGC:0.18, digitalGCTgt:0.15,
      delivGC:0.11,   delivGCTgt:0.10,
      foodOB:4250,    foodOBTgt:4500,
      labor:0.228,    laborTgt:0.235,
      opSupplies:0.023,opSuppliesTgt:0.025,
      totalProfit:0.158,totalProfitTgt:0.150,
      shiftCert:0.87, shiftCertTgt:0.85,
      shiftVerif:1.05,shiftVerifTgt:1.00,
      headcount:71,   headcountTgt:70,
      turnover90:0.30,turnover90Tgt:0.30,
      retention:0.87, retentionTgt:0.85,
    },
    3: { // March
      year:2026, month:3,
      oepe:147,       oepeTgt:155,
      osat:0.91,      osatTgt:0.90,
      epb2b:0.030,    epb2bTgt:0.040,
      r2p:62,         r2pTgt:65,
      delivWait:222,  delivWaitTgt:240,
      kvs:47,         kvsTgt:50,
      secondSide:0.89,secondSideTgt:0.85,
      complaints:4,   complaintsTgt:5,
      fsAudits:1.00,  fsAuditsTgt:1.00,
      fsEcoSure:0.91, fsEcoSureTgt:0.90,
      fsTablet:0.96,  fsTabletTgt:0.95,
      salesVsTgt:778000,  salesVsTgtTgt:750000,
      digitalGC:0.18, digitalGCTgt:0.15,
      delivGC:0.11,   delivGCTgt:0.10,
      foodOB:4180,    foodOBTgt:4500,
      labor:0.226,    laborTgt:0.235,
      opSupplies:0.024,opSuppliesTgt:0.025,
      totalProfit:0.161,totalProfitTgt:0.150,
      shiftCert:0.88, shiftCertTgt:0.85,
      shiftVerif:1.05,shiftVerifTgt:1.00,
      headcount:72,   headcountTgt:70,
      turnover90:0.29,turnover90Tgt:0.30,
      retention:0.87, retentionTgt:0.85,
    },
    4: { // April
      year:2026, month:4,
      oepe:145,       oepeTgt:155,
      osat:0.93,      osatTgt:0.90,
      epb2b:0.029,    epb2bTgt:0.040,
      r2p:61,         r2pTgt:65,
      delivWait:220,  delivWaitTgt:240,
      kvs:46,         kvsTgt:50,
      secondSide:0.90,secondSideTgt:0.85,
      complaints:3,   complaintsTgt:5,
      fsAudits:1.00,  fsAuditsTgt:1.00,
      fsEcoSure:0.95, fsEcoSureTgt:0.90,
      fsTablet:0.97,  fsTabletTgt:0.95,
      salesVsTgt:775000,  salesVsTgtTgt:750000,
      digitalGC:0.19, digitalGCTgt:0.15,
      delivGC:0.11,   delivGCTgt:0.10,
      foodOB:4150,    foodOBTgt:4500,
      labor:0.225,    laborTgt:0.235,
      opSupplies:0.022,opSuppliesTgt:0.025,
      totalProfit:0.162,totalProfitTgt:0.150,
      shiftCert:0.90, shiftCertTgt:0.85,
      shiftVerif:1.10,shiftVerifTgt:1.00,
      headcount:73,   headcountTgt:70,
      turnover90:0.28,turnover90Tgt:0.30,
      retention:0.88, retentionTgt:0.85,
    },
    5: { // May
      year:2026, month:5,
      oepe:144,       oepeTgt:155,
      osat:0.93,      osatTgt:0.90,
      epb2b:0.028,    epb2bTgt:0.040,
      r2p:60,         r2pTgt:65,
      delivWait:218,  delivWaitTgt:240,
      kvs:45,         kvsTgt:50,
      secondSide:0.91,secondSideTgt:0.85,
      complaints:3,   complaintsTgt:5,
      fsAudits:1.00,  fsAuditsTgt:1.00,
      fsEcoSure:0.96, fsEcoSureTgt:0.90,
      fsTablet:0.98,  fsTabletTgt:0.95,
      salesVsTgt:790000,  salesVsTgtTgt:750000,
      digitalGC:0.19, digitalGCTgt:0.15,
      delivGC:0.12,   delivGCTgt:0.10,
      foodOB:4100,    foodOBTgt:4500,
      labor:0.224,    laborTgt:0.235,
      opSupplies:0.022,opSuppliesTgt:0.025,
      totalProfit:0.165,totalProfitTgt:0.150,
      shiftCert:0.90, shiftCertTgt:0.85,
      shiftVerif:1.10,shiftVerifTgt:1.00,
      headcount:73,   headcountTgt:70,
      turnover90:0.27,turnover90Tgt:0.30,
      retention:0.89, retentionTgt:0.85,
    },
    6: { // June — strongest month of H1
      year:2026, month:6,
      oepe:143,       oepeTgt:155,
      osat:0.94,      osatTgt:0.90,
      epb2b:0.027,    epb2bTgt:0.040,
      r2p:59,         r2pTgt:65,
      delivWait:215,  delivWaitTgt:240,
      kvs:45,         kvsTgt:50,
      secondSide:0.91,secondSideTgt:0.85,
      complaints:2,   complaintsTgt:5,
      fsAudits:1.00,  fsAuditsTgt:1.00,
      fsEcoSure:0.96, fsEcoSureTgt:0.90,
      fsTablet:0.99,  fsTabletTgt:0.95,
      salesVsTgt:802000,  salesVsTgtTgt:750000,
      digitalGC:0.20, digitalGCTgt:0.15,
      delivGC:0.12,   delivGCTgt:0.10,
      foodOB:4080,    foodOBTgt:4500,
      labor:0.223,    laborTgt:0.235,
      opSupplies:0.021,opSuppliesTgt:0.025,
      totalProfit:0.167,totalProfitTgt:0.150,
      shiftCert:0.92, shiftCertTgt:0.85,
      shiftVerif:1.15,shiftVerifTgt:1.00,
      headcount:74,   headcountTgt:70,
      turnover90:0.26,turnover90Tgt:0.30,
      retention:0.89, retentionTgt:0.85,
    },
  };

  // ── Behavioral ratings ──────────────────────────────────────────────
  // Arrays must match competency counts: rgr×6, sales×4, profit×5, people×14, admin×6
  const behavioralRatings = {
    q1: {
      rgr:    [4, 4, 4, 3, 3, 4],         // PACE planning, FS, DT culture, shift mgmt, cleanliness, preparedness
      sales:  [3, 4, 4, 3],               // Marketing plans, new products, POP, customer counts
      profit: [3, 4, 3, 4, 4],            // P&L ownership, reports, routines, security, cash controls
      people: [4, 3, 4, 3, 3, 4, 4, 3, 4, 3, 4, 4, 3, 3], // 14 people items
      admin:  [4, 4, 3, 4, 3, 4],         // Deposits, petty cash, systems cleanup, schedule, routines, mail
    },
    q2: {
      rgr:    [4, 4, 4, 4, 3, 4],
      sales:  [4, 4, 4, 3],
      profit: [3, 4, 3, 4, 4],
      people: [4, 3, 4, 4, 3, 4, 4, 3, 4, 3, 4, 4, 4, 3], // 14 people items
      admin:  [4, 4, 4, 4, 4, 4],
    },
  };

  // ── Narrative comments ──────────────────────────────────────────────
  const comments = {
    q1: {
      rgr: 'Ronald consistently delivers strong speed of service. Q1 OEPE averaged 149s against a 155s target, improving month over month. Food safety culture is evident — all three FS audits completed, EcoSure scoring 91–94% across the quarter. Shift management execution has improved significantly since Q4 2025. Cleanliness scores from mystery shops have been consistently above threshold.',
      sales: 'Sales tracked above target in all three months, averaging $765K vs. $750K target (+2.0%). Digital GC push during breakfast is working — averaging 18% digital vs. 15% target. Delivery GC reached 11% in February and March, above the 10% target.',
      profit: 'Labor management is a standout — averaging 22.8% against a 23.5% target throughout Q1. FOB running below budget at $4,243 vs. $4,500 target. Op supplies trending favorably at 2.4% vs. 2.5% target. Total profit came in at 15.8% vs. 15.0% target.',
      people: 'Headcount holding at 71–72 against a 70 target — well staffed entering spring. Shift certification at 85–88% with a clear path to 100% by Q3. Turnover was slightly elevated in January at 32% (30% target) but improved through the quarter. Management meeting held every month on schedule.',
      admin: 'All admin routines executed without exception. Deposits verified and reconciled monthly. Petty cash clean. Schedule completed on time each period. eRestaurant and CIT fully maintained. No outstanding issues.',
    },
    q2: {
      rgr: 'Speed improvements continued strongly into Q2. OEPE averaged 144s — a new half-year best for this restaurant. May and June both hit 144–143s. EcoSure scored 95–96% on both Q2 inspections. FS tablet completion hit 97–99%. Cleanliness and shift management remain strengths with no coaching needed.',
      sales: 'Q2 was the strongest quarter of H1. June finished at $802K, +6.9% above target — the best single month this restaurant has seen in the dataset. Digital GC reached 20% in June against a 15% target. Delivery growing steadily to 12% GC.',
      profit: 'Profitability strong across all four metrics. Labor improved further to 22.3–22.5% in Q2 — outstanding scheduling discipline. FOB ended the quarter at $4,080–$4,150 vs. $4,500 target. Op supplies under control at 2.1–2.2%. Total profit hit 16.5–16.7% in Q2.',
      people: 'Two crew members promoted to Swing Manager in Q2 — a tangible result of Ronald\'s development focus. Retention program completion at 88–89%. Turnover improved each month: 28%, 27%, 26% — on track for H2 goal of under 25%. Headcount climbed to 73–74 against a 70 target.',
      admin: 'Zero admin issues in Q2. CIT cleanup completed April 15 — all terminated employees removed on time. Schedule posted on time every period. Mail scanning 100% compliant.',
    },
    q3: { rgr:'', sales:'', profit:'', people:'', admin:'' },
    q4: { rgr:'', sales:'', profit:'', people:'', admin:'' },
    midYear: {
      summary: 'Ronald McDonald delivered an outstanding H1 2026. Speed of service improved every single month — OEPE went from 152s in January to 143s in June, finishing the half 12 seconds below target. Sales averaged 3.7% above target with June as the strongest month on record for this location. Labor management was exceptional at 22.7% vs. 23.5% target, and FOB finished the half $400 below budget. People metrics are trending well — two Swing Manager promotions and turnover declining each month.\n\nOverall H1 Score is tracking in the Strong range (~82–85). Ronald is performing at the top of the district by composite score. Primary development focus for H2 is sustaining and building on digital GC share as national promotions roll off, completing the final shift certifications, and maintaining the food safety discipline that produced strong EcoSure results in Q2.',
      devPlan: 'H2 Focus Areas:\n1. EcoSure Consistency — maintain 95%+ on both Q3 and Q4 inspections. Conduct monthly internal mock audits with AM leading.\n2. Digital GC — hold 18%+ digital GC share through breakfast-focused mobile order push in daily kickoff huddles. Target 20% by Q4.\n3. Shift Certifications — complete remaining two certifications by September 30 to reach 100%.\n4. P&L Habit — build structured monthly P&L review with AM on the 5th of each month using eRestaurant reports. Goal: AM can own the food cost conversation independently by Q4.',
    },
    eoy: { summary:'', achievements:'', nextYear:'' },
  };

  // ── Dev plan (structured action items) ──────────────────────────────
  const devPlan = [
    {
      area: 'Food Safety',
      action: 'Conduct monthly internal mock EcoSure audits with AM leading checklist review; discuss results in monthly management meeting',
      targetDate: '2026-09-30',
      status: 'in-progress',
      note: 'First mock audit completed June 12 — score 96%. On track.',
    },
    {
      area: 'Digital Growth',
      action: 'Maintain 18%+ digital GC share — reinforce mobile order upsell during daily breakfast kickoff huddle; track weekly with AM',
      targetDate: '2026-12-31',
      status: 'in-progress',
      note: 'Sitting at 20% digital GC in June. Continue push through Q3 promo gap.',
    },
    {
      area: 'People Development',
      action: 'Complete final 2 Shift Certifications (Maria R. and Darius T.) — both on schedule for September',
      targetDate: '2026-09-30',
      status: 'in-progress',
      note: 'Maria on track — completing modules 4–6 in July. Darius starting module 3.',
    },
    {
      area: 'Profitability',
      action: 'Institute monthly P&L review meeting with AM on the 5th — use eRestaurant reports to build AM\'s ownership of food cost line',
      targetDate: '2026-12-31',
      status: 'not-started',
      note: 'Will begin with July close. Ronald to lead July, AM co-leads August onward.',
    },
  ];

  // ── Wage information ─────────────────────────────────────────────────
  const wage = {
    current: 62000,
    recommended: 65000,
    approved: null,
    effectiveDate: '2027-01-01',
    notes: 'Strong H1 performance — top-third composite score in the district. Speed of service, labor management, and sales above target all half-year. Two Swing Manager promotions demonstrate development commitment. Recommend $3,000 merit increase effective January 1, 2027, pending strong H2 continuation.',
  };

  // ── Build and save the review ────────────────────────────────────────
  const review = {
    id: reviewId,
    name: 'Ronald McDonald',
    role: 'GM',
    loc: existingLoc,
    year: 2026,
    half: 'H1',
    status: 'complete',
    kpis: { months },
    behavioralRatings,
    comments,
    devPlan,
    wage,
    createdAt: '2026-01-15',
    updatedAt: '2026-06-27',
  };

  existing[reviewId] = review;
  localStorage.setItem(KEY, JSON.stringify(existing));

  console.log('✅ Ronald McDonald H1 2026 GM review populated.');
  console.log('   Review ID:', reviewId);
  console.log('   Open Performance Reviews → select Ronald McDonald to view.');
})();
