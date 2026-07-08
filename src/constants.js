// @ts-nocheck

const DEFAULT_TARGETS={
  '3708':{tOepe:140,tTpph:5.6,tKvst:45,tKvsu:0.7,tPark:0.15,tAvgCheck:10.52,tProdSales:111513.16,tR2p:95,tLabor:0.22,tCrewLabor:0.21,tBonusLabor:0.2175,tCombLabor:0.2492,tGrowth:0.038,tRedBPct:0.0572,tRedBAvg:2.85,tRedBDollar:6485.62,tRedAPct:0.0033,tRedAAvg:2.58,tRedADollar:379.71,tPromoCnt:899.0,tPromoPct:0.0302,tPromoAmt:3420.74,tDiscCoupPct:0.0135,tDrawer:56.0,tPosOverPct:0.004088,tPosOverAmt:455.91,tRefundCnt:22.0,tRefundPct:0.001635,tRefundAmt:182.32,tRefundCash:49.6,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0006,tCashOSAmt:-66.65,tFOBBase:0.04,tCompWaste:0.002,tRawWaste:0.0035,tCondiment:0.0205,tEmpFood:0.002,tStatLoss:0.0105,tUnex:0.0,tFOBTarget:0.0385,tFOBTotal:0.2795,tFOBBonusBase:0.0375,tPaperCost:0.039,tOpSupply:2938.761005},
  '5183':{tOepe:145,tTpph:5.4,tKvst:60,tKvsu:0.98,tPark:0.14,tAvgCheck:10.56,tProdSales:162267.33,tR2p:85,tLabor:0.2125,tCrewLabor:0.22,tBonusLabor:0.2125,tCombLabor:0.2785,tGrowth:0.038,tRedBPct:0.0341,tRedBAvg:2.0,tRedBDollar:5616.96,tRedAPct:0.0016,tRedAAvg:2.09,tRedADollar:267.54,tPromoCnt:1426.0,tPromoPct:0.0306,tPromoAmt:5038.98,tDiscCoupPct:0.0155,tDrawer:72.0,tPosOverPct:0.003445,tPosOverAmt:558.95,tRefundCnt:27.0,tRefundPct:0.001367,tRefundAmt:221.76,tRefundCash:101.37,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-38.37,tFOBBase:0.041,tCompWaste:0.001,tRawWaste:0.0025,tCondiment:0.0195,tEmpFood:0.003,tStatLoss:0.013,tUnex:0.0,tFOBTarget:0.039,tFOBTotal:0.282,tFOBBonusBase:0.038,tPaperCost:0.037,tOpSupply:3509.44354},
  '5985':{tOepe:115,tTpph:6.1,tKvst:45,tKvsu:0.98,tPark:0.16,tAvgCheck:11.91,tProdSales:221408.74,tR2p:85,tLabor:0.195,tCrewLabor:0.2,tBonusLabor:0.21,tCombLabor:0.2477,tGrowth:0.038,tRedBPct:0.0318,tRedBAvg:2.47,tRedBDollar:7158.05,tRedAPct:0.0016,tRedAAvg:2.87,tRedADollar:350.2,tPromoCnt:1887.0,tPromoPct:0.0312,tPromoAmt:7012.45,tDiscCoupPct:0.015,tDrawer:0.0,tPosOverPct:0.003054,tPosOverAmt:676.13,tRefundCnt:8.0,tRefundPct:0.000238,tRefundAmt:52.77,tRefundCash:33.85,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0004,tCashOSAmt:-89.78,tFOBBase:0.038,tCompWaste:0.0015,tRawWaste:0.0025,tCondiment:0.019,tEmpFood:0.002,tStatLoss:0.013,tUnex:0.0,tFOBTarget:0.038,tFOBTotal:0.278,tFOBBonusBase:0.0385,tPaperCost:0.035,tOpSupply:4801.606758},
  '6178':{tOepe:190,tTpph:6.1,tKvst:75,tKvsu:0.75,tPark:0.12,tAvgCheck:10.88,tProdSales:389464.61,tR2p:90,tLabor:0.23,tCrewLabor:0.23,tBonusLabor:0.21,tCombLabor:0.2477,tGrowth:0.08,tRedBPct:0.0394,tRedBAvg:2.45,tRedBDollar:15494.49,tRedAPct:0.035,tRedAAvg:2.97,tRedADollar:1391.41,tPromoCnt:2897.0,tPromoPct:0.0325,tPromoAmt:12970.6,tDiscCoupPct:0.0134,tDrawer:166.0,tPosOverPct:0.003,tPosOverAmt:833.25,tRefundCnt:56.0,tRefundPct:0.001,tRefundAmt:468.44,tRefundCash:220.86,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0003,tCashOSAmt:-89.78,tFOBBase:0.04,tCompWaste:0.0012,tRawWaste:0.005,tCondiment:0.018,tEmpFood:0.002,tStatLoss:0.0125,tUnex:0.0,tFOBTarget:0.0387,tFOBTotal:0.2621,tFOBBonusBase:0.0385,tPaperCost:0.032,tOpSupply:2749.56},
  '6838':{tOepe:180,tTpph:5.0,tKvst:60,tKvsu:0.6,tPark:0.15,tAvgCheck:12.09,tProdSales:372921.21,tR2p:95,tLabor:0.235,tCrewLabor:0.235,tBonusLabor:0.21,tCombLabor:0.2477,tGrowth:0.08,tRedBPct:0.0447,tRedBAvg:2.73,tRedBDollar:16842.65,tRedAPct:0.044,tRedAAvg:4.02,tRedADollar:1674.39,tPromoCnt:2270.0,tPromoPct:0.027,tPromoAmt:10179.18,tDiscCoupPct:0.0133,tDrawer:177.0,tPosOverPct:0.003,tPosOverAmt:85.15,tRefundCnt:30.0,tRefundPct:0.001,tRefundAmt:352.57,tRefundCash:179.79,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0003,tCashOSAmt:-89.78,tFOBBase:0.04,tCompWaste:0.0015,tRawWaste:0.004,tCondiment:0.018,tEmpFood:0.003,tStatLoss:0.01458,tUnex:0.0,tFOBTarget:0.04108,tFOBTotal:0.26688,tFOBBonusBase:0.0385,tPaperCost:0.0325,tOpSupply:2906.67},
  '6972':{tOepe:125,tTpph:5.5,tKvst:50,tKvsu:0.98,tPark:0.16,tAvgCheck:11.23,tProdSales:194752.07,tR2p:90,tLabor:0.2,tCrewLabor:0.21,tBonusLabor:0.2,tCombLabor:0.2264,tGrowth:0.038,tRedBPct:0.0379,tRedBAvg:2.43,tRedBDollar:7495.06,tRedAPct:0.0018,tRedAAvg:2.77,tRedADollar:363.49,tPromoCnt:1564.0,tPromoPct:0.0302,tPromoAmt:5977.53,tDiscCoupPct:0.013,tDrawer:75.0,tPosOverPct:0.003751,tPosOverAmt:730.61,tRefundCnt:14.0,tRefundPct:0.000992,tRefundAmt:193.15,tRefundCash:351.02,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-46.38,tFOBBase:0.0385,tCompWaste:0.0015,tRawWaste:0.0045,tCondiment:0.019,tEmpFood:0.0035,tStatLoss:0.011,tUnex:0.0,tFOBTarget:0.039498,tFOBTotal:0.274998,tFOBBonusBase:0.0365,tPaperCost:0.0365,tOpSupply:4412.102386},
  '10034':{tOepe:195,tTpph:5.5,tKvst:65,tKvsu:0.18,tPark:0.14,tAvgCheck:11.73,tProdSales:393505.45,tR2p:80,tLabor:0.23,tCrewLabor:0.23,tBonusLabor:0.2,tCombLabor:0.2264,tGrowth:0.08,tRedBPct:0.0469,tRedBAvg:1.93,tRedBDollar:18592.38,tRedAPct:0.046,tRedAAvg:3.84,tRedADollar:1820.92,tPromoCnt:2413.0,tPromoPct:0.0289,tPromoAmt:11457.95,tDiscCoupPct:0.0121,tDrawer:206.0,tPosOverPct:0.003,tPosOverAmt:224.97,tRefundCnt:83.0,tRefundPct:0.001,tRefundAmt:643.31,tRefundCash:132.76,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-46.38,tFOBBase:0.04,tCompWaste:0.0015,tRawWaste:0.005,tCondiment:0.016,tEmpFood:0.003,tStatLoss:0.018,tUnex:0.0,tFOBTarget:0.043498,tFOBTotal:0.268098,tFOBBonusBase:0.0365,tPaperCost:0.0335,tOpSupply:2986.1025},
  '10422':{tOepe:120,tTpph:5.4,tKvst:45,tKvsu:0.96,tPark:0.12,tAvgCheck:11.04,tProdSales:134360.13,tR2p:80,tLabor:0.2125,tCrewLabor:0.2125,tBonusLabor:0.185,tCombLabor:0.2306,tGrowth:0.038,tRedBPct:0.0437,tRedBAvg:2.8,tRedBDollar:5933.25,tRedAPct:0.0022,tRedAAvg:2.66,tRedADollar:298.47,tPromoCnt:888.0,tPromoPct:0.0261,tPromoAmt:3543.96,tDiscCoupPct:0.012,tDrawer:14.0,tPosOverPct:0.003397,tPosOverAmt:456.47,tRefundCnt:1.0,tRefundPct:7.5e-05,tRefundAmt:10.09,tRefundCash:12.78,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0001,tCashOSAmt:8.19,tFOBBase:0.039,tCompWaste:0.002,tRawWaste:0.0025,tCondiment:0.018,tEmpFood:0.0025,tStatLoss:0.0135,tUnex:0.0,tFOBTarget:0.038468,tFOBTotal:0.275468,tFOBBonusBase:0.0365,tPaperCost:0.034,tOpSupply:3303.073507},
  '10915':{tOepe:135,tTpph:5.5,tKvst:45,tKvsu:0.92,tPark:0.12,tAvgCheck:10.43,tProdSales:136434.22,tR2p:65,tLabor:0.215,tCrewLabor:0.215,tBonusLabor:0.1875,tCombLabor:0.2138,tGrowth:0.038,tRedBPct:0.0383,tRedBAvg:2.11,tRedBDollar:5295.6,tRedAPct:0.004,tRedAAvg:3.46,tRedADollar:557.67,tPromoCnt:1438.0,tPromoPct:0.0391,tPromoAmt:5403.15,tDiscCoupPct:0.0155,tDrawer:50.0,tPosOverPct:0.000211,tPosOverAmt:28.85,tRefundCnt:9.0,tRefundPct:0.000542,tRefundAmt:73.92,tRefundCash:52.02,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0,tCashOSAmt:2.21,tFOBBase:0.0415,tCompWaste:0.002,tRawWaste:0.0055,tCondiment:0.019,tEmpFood:0.0045,tStatLoss:0.011,tUnex:0.0,tFOBTarget:0.042,tFOBTotal:0.2875,tFOBBonusBase:0.036,tPaperCost:0.0375,tOpSupply:3321.445598},
  '11657':{tOepe:150,tTpph:6.0,tKvst:60,tKvsu:0.5,tPark:0.12,tAvgCheck:10.06,tProdSales:115478.85,tR2p:90,tLabor:0.22,tCrewLabor:0.22,tBonusLabor:0.1875,tCombLabor:0.2273,tGrowth:0.038,tRedBPct:0.0468,tRedBAvg:2.49,tRedBDollar:5482.62,tRedAPct:0.0021,tRedAAvg:2.39,tRedADollar:244.28,tPromoCnt:1024.0,tPromoPct:0.0313,tPromoAmt:3666.27,tDiscCoupPct:0.0135,tDrawer:60.0,tPosOverPct:0.002958,tPosOverAmt:341.55,tRefundCnt:20.0,tRefundPct:0.000974,tRefundAmt:112.49,tRefundCash:68.88,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0004,tCashOSAmt:-49.78,tFOBBase:0.045,tCompWaste:0.004,tRawWaste:0.0075,tCondiment:0.02,tEmpFood:0.0025,tStatLoss:0.015,tUnex:0.0,tFOBTarget:0.049,tFOBTotal:0.29,tFOBBonusBase:0.037,tPaperCost:0.0375,tOpSupply:2952.991464},
  '13113':{tOepe:130,tTpph:5.7,tKvst:50,tKvsu:0.5,tPark:0.14,tAvgCheck:10.72,tProdSales:101147.22,tR2p:60,tLabor:0.215,tCrewLabor:0.2125,tBonusLabor:0.1875,tCombLabor:0.2281,tGrowth:0.038,tRedBPct:0.0512,tRedBAvg:3.08,tRedBDollar:5243.61,tRedAPct:0.0029,tRedAAvg:3.22,tRedADollar:299.35,tPromoCnt:768.0,tPromoPct:0.0285,tPromoAmt:2922.87,tDiscCoupPct:0.013,tDrawer:49.0,tPosOverPct:0.003317,tPosOverAmt:335.51,tRefundCnt:12.0,tRefundPct:0.001031,tRefundAmt:104.28,tRefundCash:21.38,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.001,tCashOSAmt:-104.92,tFOBBase:0.0435,tCompWaste:0.001,tRawWaste:0.005,tCondiment:0.02,tEmpFood:0.0025,tStatLoss:0.015,tUnex:0.0,tFOBTarget:0.0435,tFOBTotal:0.2865,tFOBBonusBase:0.036,tPaperCost:0.0335,tOpSupply:2546.150372},
  '18213':{tOepe:135,tTpph:5.5,tKvst:50,tKvsu:0.5,tPark:0.12,tAvgCheck:9.79,tProdSales:61438.07,tR2p:100,tLabor:0.225,tCrewLabor:0.225,tBonusLabor:0.2025,tCombLabor:0.2456,tGrowth:0.038,tRedBPct:0.0355,tRedBAvg:2.06,tRedBDollar:2206.83,tRedAPct:0.0025,tRedAAvg:2.4,tRedADollar:158.4,tPromoCnt:445.0,tPromoPct:0.0253,tPromoAmt:1572.38,tDiscCoupPct:0.0125,tDrawer:79.0,tPosOverPct:0.000277,tPosOverAmt:17.01,tRefundCnt:5.0,tRefundPct:0.000566,tRefundAmt:34.79,tRefundCash:35.11,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0001,tCashOSAmt:-3.71,tFOBBase:0.046,tCompWaste:0.0015,tRawWaste:0.008,tCondiment:0.02,tEmpFood:0.003,tStatLoss:0.0125,tUnex:0.0,tFOBTarget:0.045,tFOBTotal:0.2875,tFOBBonusBase:0.037,tPaperCost:0.0335,tOpSupply:1554.442808},
  '20475':{tOepe:135,tTpph:5.8,tKvst:45,tKvsu:0.85,tPark:0.12,tAvgCheck:10.03,tProdSales:109953.72,tR2p:60,tLabor:0.22,tCrewLabor:0.2125,tBonusLabor:0.2275,tCombLabor:0.264,tGrowth:0.038,tRedBPct:0.0375,tRedBAvg:2.3,tRedBDollar:4183.38,tRedAPct:0.0026,tRedAAvg:2.4,tRedADollar:295.32,tPromoCnt:1212.0,tPromoPct:0.0391,tPromoAmt:4367.18,tDiscCoupPct:0.0155,tDrawer:58.0,tPosOverPct:0.001424,tPosOverAmt:156.57,tRefundCnt:14.0,tRefundPct:0.001614,tRefundAmt:177.44,tRefundCash:21.65,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0007,tCashOSAmt:-80.91,tFOBBase:0.038,tCompWaste:0.0015,tRawWaste:0.0025,tCondiment:0.018,tEmpFood:0.003,tStatLoss:0.013,tUnex:0.0,tFOBTarget:0.037961,tFOBTotal:0.280961,tFOBBonusBase:0.0385,tPaperCost:0.0365,tOpSupply:2485.813027},
  '24471':{tOepe:155,tTpph:5.4,tKvst:55,tKvsu:0.6,tPark:0.15,tAvgCheck:10.4,tProdSales:108267.81,tR2p:90,tLabor:0.2175,tCrewLabor:0.215,tBonusLabor:0.225,tCombLabor:0.2549,tGrowth:0.038,tRedBPct:0.05,tRedBAvg:2.76,tRedBDollar:5477.68,tRedAPct:0.0027,tRedAAvg:2.63,tRedADollar:295.0,tPromoCnt:833.0,tPromoPct:0.0301,tPromoAmt:3289.85,tDiscCoupPct:0.014,tDrawer:77.0,tPosOverPct:0.002766,tPosOverAmt:299.42,tRefundCnt:10.0,tRefundPct:0.001066,tRefundAmt:115.37,tRefundCash:7.51,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0005,tCashOSAmt:-53.29,tFOBBase:0.045,tCompWaste:0.0035,tRawWaste:0.007,tCondiment:0.0205,tEmpFood:0.003,tStatLoss:0.012,tUnex:0.0,tFOBTarget:0.046,tFOBTotal:0.2875,tFOBBonusBase:0.0355,tPaperCost:0.035,tOpSupply:2720.468452},
  '29760':{tOepe:120,tTpph:4.9,tKvst:50,tKvsu:0.95,tPark:0.2,tAvgCheck:11.75,tProdSales:172872.92,tR2p:80,tLabor:0.21,tCrewLabor:0.21,tBonusLabor:0.1925,tCombLabor:0.2298,tGrowth:0.038,tRedBPct:0.0341,tRedBAvg:2.03,tRedBDollar:6009.52,tRedAPct:0.0018,tRedAAvg:2.61,tRedADollar:321.11,tPromoCnt:1184.0,tPromoPct:0.0253,tPromoAmt:4458.74,tDiscCoupPct:0.0135,tDrawer:132.0,tPosOverPct:0.003708,tPosOverAmt:640.94,tRefundCnt:18.0,tRefundPct:0.000814,tRefundAmt:140.7,tRefundCash:60.7,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0002,tCashOSAmt:37.54,tFOBBase:0.037,tCompWaste:0.0015,tRawWaste:0.0035,tCondiment:0.02,tEmpFood:0.0035,tStatLoss:0.009,tUnex:0.0,tFOBTarget:0.0375,tFOBTotal:0.2785,tFOBBonusBase:0.036,tPaperCost:0.035,tOpSupply:3809.162379},
  '31357':{tOepe:140,tTpph:6.1,tKvst:65,tKvsu:0.6,tPark:0.15,tAvgCheck:10.44,tProdSales:108780.31,tR2p:75,tLabor:0.2175,tCrewLabor:0.2125,tBonusLabor:0.2075,tCombLabor:0.2388,tGrowth:0.038,tRedBPct:0.0321,tRedBAvg:2.44,tRedBDollar:3535.47,tRedAPct:0.0009,tRedAAvg:2.02,tRedADollar:98.84,tPromoCnt:862.0,tPromoPct:0.0318,tPromoAmt:3494.08,tDiscCoupPct:0.013,tDrawer:81.0,tPosOverPct:0.003364,tPosOverAmt:365.95,tRefundCnt:9.0,tRefundPct:0.00112,tRefundAmt:121.88,tRefundCash:75.52,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-18.83,tFOBBase:0.043,tCompWaste:0.0015,tRawWaste:0.0055,tCondiment:0.02,tEmpFood:0.0025,tStatLoss:0.014,tUnex:0.0,tFOBTarget:0.043475,tFOBTotal:0.283975,tFOBBonusBase:0.038,tPaperCost:0.035,tOpSupply:2753.983094},
  '32525':{tOepe:135,tTpph:5.3,tKvst:40,tKvsu:0.55,tPark:0.15,tAvgCheck:10.48,tProdSales:82653.18,tR2p:85,tLabor:0.215,tCrewLabor:0.22,tBonusLabor:0.1975,tCombLabor:0.2524,tGrowth:0.038,tRedBPct:0.0455,tRedBAvg:2.59,tRedBDollar:3805.14,tRedAPct:0.0019,tRedAAvg:2.42,tRedADollar:154.94,tPromoCnt:676.0,tPromoPct:0.029,tPromoAmt:2426.89,tDiscCoupPct:0.012,tDrawer:67.0,tPosOverPct:0.002032,tPosOverAmt:167.92,tRefundCnt:4.0,tRefundPct:0.000411,tRefundAmt:34.0,tRefundCash:3.71,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-15.14,tFOBBase:0.045,tCompWaste:0.0015,tRawWaste:0.008,tCondiment:0.018,tEmpFood:0.0025,tStatLoss:0.013,tUnex:0.0,tFOBTarget:0.043,tFOBTotal:0.2875,tFOBBonusBase:0.036,tPaperCost:0.036,tOpSupply:2012.66182},
  '33109':{tOepe:75,tTpph:6.2,tKvst:40,tKvsu:0.55,tPark:0.18,tAvgCheck:9.67,tProdSales:91341.32,tR2p:75,tLabor:0.215,tCrewLabor:0.215,tBonusLabor:0.2,tCombLabor:0.2549,tGrowth:0.038,tRedBPct:0.0477,tRedBAvg:2.66,tRedBDollar:4389.89,tRedAPct:0.0025,tRedAAvg:2.14,tRedADollar:228.48,tPromoCnt:709.0,tPromoPct:0.0267,tPromoAmt:2462.44,tDiscCoupPct:0.011,tDrawer:81.0,tPosOverPct:0.000132,tPosOverAmt:12.07,tRefundCnt:2.0,tRefundPct:0.000258,tRefundAmt:23.61,tRefundCash:19.98,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0001,tCashOSAmt:7.82,tFOBBase:0.039,tCompWaste:0.001,tRawWaste:0.004,tCondiment:0.019,tEmpFood:0.002,tStatLoss:0.012,tUnex:0.0,tFOBTarget:0.038,tFOBTotal:0.279,tFOBBonusBase:0.037,tPaperCost:0.0355,tOpSupply:2390.87029},
  '33222':{tOepe:120,tTpph:4.9,tKvst:60,tKvsu:0.6,tPark:0.3,tAvgCheck:11.0,tProdSales:84046.16,tR2p:90,tLabor:0.215,tCrewLabor:0.2325,tBonusLabor:0.195,tCombLabor:0.2363,tGrowth:0.038,tRedBPct:0.0268,tRedBAvg:2.06,tRedBDollar:2278.15,tRedAPct:0.0018,tRedAAvg:2.99,tRedADollar:149.43,tPromoCnt:725.0,tPromoPct:0.0311,tPromoAmt:2649.3,tDiscCoupPct:0.012,tDrawer:46.0,tPosOverPct:0.001107,tPosOverAmt:93.04,tRefundCnt:1.0,tRefundPct:7.6e-05,tRefundAmt:6.41,tRefundCash:24.47,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0001,tCashOSAmt:-11.73,tFOBBase:0.045,tCompWaste:0.0015,tRawWaste:0.0065,tCondiment:0.021,tEmpFood:0.0015,tStatLoss:0.013,tUnex:0.0,tFOBTarget:0.0435,tFOBTotal:0.2855,tFOBBonusBase:0.037,tPaperCost:0.0335,tOpSupply:2093.791559},
  '33704':{tOepe:140,tTpph:5.4,tKvst:60,tKvsu:0.6,tPark:0.13,tAvgCheck:10.45,tProdSales:104408.87,tR2p:80,tLabor:0.215,tCrewLabor:0.215,tBonusLabor:0.195,tCombLabor:0.2324,tGrowth:0.038,tRedBPct:0.0313,tRedBAvg:1.95,tRedBDollar:3304.92,tRedAPct:0.0018,tRedAAvg:2.71,tRedADollar:186.92,tPromoCnt:1107.0,tPromoPct:0.0377,tPromoAmt:3990.26,tDiscCoupPct:0.016,tDrawer:58.0,tPosOverPct:0.001842,tPosOverAmt:192.34,tRefundCnt:10.0,tRefundPct:0.000985,tRefundAmt:102.89,tRefundCash:0.0,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0001,tCashOSAmt:14.49,tFOBBase:0.041,tCompWaste:0.0015,tRawWaste:0.005,tCondiment:0.0185,tEmpFood:0.004,tStatLoss:0.011,tUnex:0.0,tFOBTarget:0.04,tFOBTotal:0.2835,tFOBBonusBase:0.035,tPaperCost:0.0355,tOpSupply:2964.15366},
  '34222':{tOepe:125,tTpph:5.0,tKvst:45,tKvsu:0.55,tPark:0.12,tAvgCheck:11.2,tProdSales:94807.93,tR2p:75,tLabor:0.215,tCrewLabor:0.225,tBonusLabor:0.195,tCombLabor:0.2399,tGrowth:0.038,tRedBPct:0.0273,tRedBAvg:1.98,tRedBDollar:2629.71,tRedAPct:0.0016,tRedAAvg:2.23,tRedADollar:158.33,tPromoCnt:892.0,tPromoPct:0.0347,tPromoAmt:3335.23,tDiscCoupPct:0.0145,tDrawer:36.0,tPosOverPct:0.003207,tPosOverAmt:304.02,tRefundCnt:7.0,tRefundPct:0.000361,tRefundAmt:34.2,tRefundCash:11.47,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0,tCashOSAmt:0.69,tFOBBase:0.038,tCompWaste:0.0015,tRawWaste:0.005,tCondiment:0.019,tEmpFood:0.004,tStatLoss:0.0075,tUnex:0.0,tFOBTarget:0.037,tFOBTotal:0.2815,tFOBBonusBase:0.0375,tPaperCost:0.035,tOpSupply:2531.01357},
  '35064':{tOepe:130,tTpph:4.9,tKvst:45,tKvsu:0.55,tPark:0.15,tAvgCheck:10.06,tProdSales:71728.46,tR2p:60,tLabor:0.22,tCrewLabor:0.23,tBonusLabor:0.2275,tCombLabor:0.2548,tGrowth:0.038,tRedBPct:0.0465,tRedBAvg:2.72,tRedBDollar:3366.71,tRedAPct:0.005,tRedAAvg:4.53,tRedADollar:362.74,tPromoCnt:732.0,tPromoPct:0.0402,tPromoAmt:2909.15,tDiscCoupPct:0.014,tDrawer:85.0,tPosOverPct:0.0,tPosOverAmt:0.0,tRefundCnt:11.0,tRefundPct:0.001124,tRefundAmt:80.62,tRefundCash:16.73,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:0.0,tCashOSAmt:-3.36,tFOBBase:0.046,tCompWaste:0.002,tRawWaste:0.0065,tCondiment:0.02,tEmpFood:0.0035,tStatLoss:0.014,tUnex:0.0,tFOBTarget:0.046,tFOBTotal:0.2975,tFOBBonusBase:0.0355,tPaperCost:0.037,tOpSupply:1725.893122},
  '35242':{tOepe:150,tTpph:5.9,tKvst:50,tKvsu:0.3,tPark:0.12,tAvgCheck:11.53,tProdSales:313111.84,tR2p:100,tLabor:0.23,tCrewLabor:0.23,tBonusLabor:0.2275,tCombLabor:0.2548,tGrowth:0.08,tRedBPct:0.0351,tRedBAvg:2.85,tRedBDollar:11051.85,tRedAPct:0.0041,tRedAAvg:4.27,tRedADollar:1285.65,tPromoCnt:1749.0,tPromoPct:0.0235,tPromoAmt:7414.93,tDiscCoupPct:0.0128,tDrawer:158.0,tPosOverPct:0.003,tPosOverAmt:20.62,tRefundCnt:36.0,tRefundPct:0.001,tRefundAmt:197.64,tRefundCash:235.14,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-49.78,tFOBBase:0.04,tCompWaste:0.001,tRawWaste:0.007,tCondiment:0.017,tEmpFood:0.002,tStatLoss:0.0095,tUnex:0.0,tFOBTarget:0.0365,tFOBTotal:0.2718,tFOBBonusBase:0.0355,tPaperCost:0.0305,tOpSupply:2774.349},
  '37566':{tOepe:165,tTpph:5.7,tKvst:70,tKvsu:0.4,tPark:0.12,tAvgCheck:11.24,tProdSales:372957.72,tR2p:90,tLabor:0.235,tCrewLabor:0.235,tBonusLabor:0.2275,tCombLabor:0.2548,tGrowth:0.08,tRedBPct:0.0372,tRedBAvg:3.13,tRedBDollar:13944.12,tRedAPct:0.0033,tRedAAvg:3.44,tRedADollar:1233.29,tPromoCnt:2264.0,tPromoPct:0.0248,tPromoAmt:9312.28,tDiscCoupPct:0.0137,tDrawer:188.0,tPosOverPct:0.003,tPosOverAmt:512.01,tRefundCnt:41.0,tRefundPct:0.001,tRefundAmt:276.78,tRefundCash:99.53,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0001,tCashOSAmt:-15.14,tFOBBase:0.04,tCompWaste:0.0005,tRawWaste:0.0025,tCondiment:0.0155,tEmpFood:0.0015,tStatLoss:0.018,tUnex:0.0,tFOBTarget:0.038,tFOBTotal:0.2692,tFOBBonusBase:0.0355,tPaperCost:0.032,tOpSupply:2904.0845},
  '38609':{tOepe:150,tTpph:5.7,tKvst:70,tKvsu:0.88,tPark:0.2,tAvgCheck:11.86,tProdSales:379463.39,tR2p:110,tLabor:0.23,tCrewLabor:0.235,tBonusLabor:0.2275,tCombLabor:0.2548,tGrowth:0.08,tRedBPct:0.0284,tRedBAvg:2.71,tRedBDollar:10883.87,tRedAPct:0.0029,tRedAAvg:2.95,tRedADollar:1107.39,tPromoCnt:2715.0,tPromoPct:0.0255,tPromoAmt:9780.48,tDiscCoupPct:0.0122,tDrawer:92.0,tPosOverPct:0.003,tPosOverAmt:1039.45,tRefundCnt:21.0,tRefundPct:0.001,tRefundAmt:223.22,tRefundCash:177.55,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0002,tCashOSAmt:-53.29,tFOBBase:0.04,tCompWaste:0.0005,tRawWaste:0.0025,tCondiment:0.017,tEmpFood:0.002,tStatLoss:0.011,tUnex:0.0,tFOBTarget:0.033,tFOBTotal:0.2602,tFOBBonusBase:0.0355,tPaperCost:0.031,tOpSupply:3329.0335},
  '43380':{tOepe:110,tTpph:5.5,tKvst:55,tKvsu:0.6,tPark:0.12,tAvgCheck:10.05,tProdSales:66087.9,tR2p:85,tLabor:0.225,tCrewLabor:0.215,tBonusLabor:0.2125,tCombLabor:0.2455,tGrowth:0.038,tRedBPct:0.0313,tRedBAvg:3.08,tRedBDollar:2087.59,tRedAPct:0.0037,tRedAAvg:2.8,tRedADollar:243.19,tPromoCnt:649.0,tPromoPct:0.0335,tPromoAmt:2228.33,tDiscCoupPct:0.012,tDrawer:46.0,tPosOverPct:0.00318,tPosOverAmt:210.16,tRefundCnt:0.0,tRefundPct:0.0,tRefundAmt:0.0,tRefundCash:0.0,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0004,tCashOSAmt:-24.01,tFOBBase:0.0405,tCompWaste:0.001,tRawWaste:0.004,tCondiment:0.02,tEmpFood:0.004,tStatLoss:0.011,tUnex:0.0,tFOBTarget:0.04,tFOBTotal:0.2895,tFOBBonusBase:0.0365,tPaperCost:0.034,tOpSupply:1564.229045},
  '43701':{tOepe:210,tTpph:4.8,tKvst:80,tKvsu:0.3,tPark:0.24,tAvgCheck:12.49,tProdSales:141572.93,tR2p:95,tLabor:0.26,tCrewLabor:0.26,tBonusLabor:0.2125,tCombLabor:0.2455,tGrowth:0.08,tRedBPct:0.0458,tRedBAvg:3.43,tRedBDollar:6527.98,tRedAPct:0.029,tRedAAvg:4.0,tRedADollar:415.92,tPromoCnt:585.0,tPromoPct:0.0177,tPromoAmt:2515.1,tDiscCoupPct:0.0088,tDrawer:150.0,tPosOverPct:0.003,tPosOverAmt:118.05,tRefundCnt:28.0,tRefundPct:0.001,tRefundAmt:380.19,tRefundCash:144.16,tManRefPct:0.0,tManRefAmt:0.0,tCashOSPct:-0.0003,tCashOSAmt:-24.01,tFOBBase:0.04,tCompWaste:0.0015,tRawWaste:0.008,tCondiment:0.017,tEmpFood:0.002,tStatLoss:0.02,tUnex:0.0,tFOBTarget:0.0485,tFOBTotal:0.2523,tFOBBonusBase:0.0365,tPaperCost:0.03,tOpSupply:1564.237545},
};

// DEFAULT_MODEL_ASSIGNMENTS (v184) — walk-forward backtest on full data
// Model: 'di'=Dialed-In  'ly'=LY Adjusted  'dow'=DOW Trend
// ── June 2026 projection targets ─────────────────────────────────────
(function(){
  if(DEFAULT_TARGETS['10034']) Object.assign(DEFAULT_TARGETS['10034'],{tJuneProj:390070.57,tQSRSoftProj:0,tJuneLaborPct:0.23,tJuneTpph:5.75});
  if(DEFAULT_TARGETS['10422']) Object.assign(DEFAULT_TARGETS['10422'],{tJuneProj:406772.65,tQSRSoftProj:358513.02,tJuneLaborPct:0.215,tJuneTpph:5.3});
  if(DEFAULT_TARGETS['10915']) Object.assign(DEFAULT_TARGETS['10915'],{tJuneProj:364602.36,tQSRSoftProj:360237.01,tJuneLaborPct:0.215,tJuneTpph:5.4});
  if(DEFAULT_TARGETS['11657']) Object.assign(DEFAULT_TARGETS['11657'],{tJuneProj:349014.0,tQSRSoftProj:314876.92,tJuneLaborPct:0.215,tJuneTpph:5.9});
  if(DEFAULT_TARGETS['13113']) Object.assign(DEFAULT_TARGETS['13113'],{tJuneProj:294588.25,tQSRSoftProj:273041.62,tJuneLaborPct:0.2225,tJuneTpph:5.5});
  if(DEFAULT_TARGETS['18213']) Object.assign(DEFAULT_TARGETS['18213'],{tJuneProj:180548.0,tQSRSoftProj:171881.96,tJuneLaborPct:0.225,tJuneTpph:5.3});
  if(DEFAULT_TARGETS['20475']) Object.assign(DEFAULT_TARGETS['20475'],{tJuneProj:311896.72,tQSRSoftProj:292525.48,tJuneLaborPct:0.2125,tJuneTpph:5.7});
  if(DEFAULT_TARGETS['24471']) Object.assign(DEFAULT_TARGETS['24471'],{tJuneProj:323386.75,tQSRSoftProj:293050.52,tJuneLaborPct:0.215,tJuneTpph:5.4});
  if(DEFAULT_TARGETS['29760']) Object.assign(DEFAULT_TARGETS['29760'],{tJuneProj:517873.65,tQSRSoftProj:470868.02,tJuneLaborPct:0.21,tJuneTpph:5.0});
  if(DEFAULT_TARGETS['31357']) Object.assign(DEFAULT_TARGETS['31357'],{tJuneProj:326730.1,tQSRSoftProj:300406.91,tJuneLaborPct:0.2225,tJuneTpph:6.2});
  if(DEFAULT_TARGETS['32525']) Object.assign(DEFAULT_TARGETS['32525'],{tJuneProj:267795.67,tQSRSoftProj:224481.76,tJuneLaborPct:0.215,tJuneTpph:5.8});
  if(DEFAULT_TARGETS['33109']) Object.assign(DEFAULT_TARGETS['33109'],{tJuneProj:276397.89,tQSRSoftProj:264559.52,tJuneLaborPct:0.21,tJuneTpph:6.35});
  if(DEFAULT_TARGETS['33222']) Object.assign(DEFAULT_TARGETS['33222'],{tJuneProj:242172.88,tQSRSoftProj:231821.43,tJuneLaborPct:0.22,tJuneTpph:5.25});
  if(DEFAULT_TARGETS['33704']) Object.assign(DEFAULT_TARGETS['33704'],{tJuneProj:278186.12,tQSRSoftProj:278958.5,tJuneLaborPct:0.215,tJuneTpph:5.35});
  if(DEFAULT_TARGETS['34222']) Object.assign(DEFAULT_TARGETS['34222'],{tJuneProj:281817.67,tQSRSoftProj:268143.84,tJuneLaborPct:0.21,tJuneTpph:5.3});
  if(DEFAULT_TARGETS['35064']) Object.assign(DEFAULT_TARGETS['35064'],{tJuneProj:200943.78,tQSRSoftProj:194420.27,tJuneLaborPct:0.23,tJuneTpph:4.5});
  if(DEFAULT_TARGETS['35242']) Object.assign(DEFAULT_TARGETS['35242'],{tJuneProj:298328.28,tQSRSoftProj:0,tJuneLaborPct:0.235,tJuneTpph:5.6});
  if(DEFAULT_TARGETS['3708']) Object.assign(DEFAULT_TARGETS['3708'],{tJuneProj:315527.29,tQSRSoftProj:317670.91,tJuneLaborPct:0.215,tJuneTpph:5.5});
  if(DEFAULT_TARGETS['37566']) Object.assign(DEFAULT_TARGETS['37566'],{tJuneProj:363776.25,tQSRSoftProj:0,tJuneLaborPct:0.235,tJuneTpph:5.7});
  if(DEFAULT_TARGETS['38609']) Object.assign(DEFAULT_TARGETS['38609'],{tJuneProj:412655.74,tQSRSoftProj:0,tJuneLaborPct:0.23,tJuneTpph:5.7});
  if(DEFAULT_TARGETS['43380']) Object.assign(DEFAULT_TARGETS['43380'],{tJuneProj:174712.84,tQSRSoftProj:178783.79,tJuneLaborPct:0.215,tJuneTpph:5.25});
  if(DEFAULT_TARGETS['43701']) Object.assign(DEFAULT_TARGETS['43701'],{tJuneProj:202809.0,tQSRSoftProj:0,tJuneLaborPct:0.26,tJuneTpph:4.8});
  if(DEFAULT_TARGETS['5183']) Object.assign(DEFAULT_TARGETS['5183'],{tJuneProj:461920.0,tQSRSoftProj:459256.04,tJuneLaborPct:0.215,tJuneTpph:5.35});
  if(DEFAULT_TARGETS['5985']) Object.assign(DEFAULT_TARGETS['5985'],{tJuneProj:635841.49,tQSRSoftProj:611699.16,tJuneLaborPct:0.2,tJuneTpph:5.9});
  if(DEFAULT_TARGETS['6178']) Object.assign(DEFAULT_TARGETS['6178'],{tJuneProj:368896.07,tQSRSoftProj:0,tJuneLaborPct:0.23,tJuneTpph:6.1});
  if(DEFAULT_TARGETS['6838']) Object.assign(DEFAULT_TARGETS['6838'],{tJuneProj:384958.89,tQSRSoftProj:0,tJuneLaborPct:0.235,tJuneTpph:5.5});
  if(DEFAULT_TARGETS['6972']) Object.assign(DEFAULT_TARGETS['6972'],{tJuneProj:530189.06,tQSRSoftProj:532447.36,tJuneLaborPct:0.21,tJuneTpph:5.35});
})();

const DEFAULT_MODEL_ASSIGNMENTS = {
  '3708':{weekly:{model:'ae',mape:8.1,ref:'🤖 AE 8.1% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:5.7,ref:'6W: DI 5.7% vs DOW 6.5% vs LY 16.0%',n:42},yearly:{model:'di',mape:9.3,ref:'ALL: DI 9.3% vs LY 115%+',n:1580},note:'Highest volume. DOW scheduling; DI monthly+yearly.'},
  '5183':{weekly:{model:'ae',mape:7.6,ref:'🤖 AE 7.6% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:5.0,ref:'6W: DI 5.0% vs DOW 5.6% vs LY 6.4%',n:42},yearly:{model:'di',mape:9.7,ref:'ALL: DI 9.7% vs DOW 12.6%',n:1581},note:'Consistent ops. DOW short-term; DI longer horizons.'},
  '5985':{weekly:{model:'ae',mape:9.4,ref:'🤖 AE 9.4% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:4.4,ref:'6W: DI 4.4% vs DOW 5.3% vs LY 7.2%',n:42},yearly:{model:'di',mape:8.8,ref:'ALL: DI 8.8% vs DOW 18.5%',n:1583},note:'Durant highest volume. DOW 4.7% weekly; DI excellent monthly (4.4%).'},
  '6178':{weekly:{model:'ae',mape:6.6,ref:'🤖 AE 6.6% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:4.9,ref:'6W: DI 4.9% vs DOW 7.2% vs LY 11.5%',n:42},yearly:{model:'di',mape:7.9,ref:'ALL: DI 7.9% vs LY 41.9% vs DOW 42.1%',n:1581},note:'Chipley FL. DI dominates all horizons — interstate travel well-modeled.'},
  '6838':{weekly:{model:'ae',mape:7.6,ref:'🤖 AE 7.6% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:6.5,ref:'6W: DI 6.5% vs DOW 8.1% vs LY 11.3%',n:42},yearly:{model:'di',mape:8.3,ref:'ALL: DI 8.3% vs LY 61.9% vs DOW 65.4%',n:1582},note:'Defuniak Springs FL. DI wins all horizons.'},
  '6972':{weekly:{model:'ae',mape:8.2,ref:'🤖 AE 8.2% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:4.3,ref:'6W: DI 4.3% vs DOW 5.4% vs LY 7.1%',n:42},yearly:{model:'di',mape:9.2,ref:'ALL: DI 9.2% vs DOW 23.8%',n:1581},note:'Ada high-traffic. DOW weekly; DI monthly excellent (4.3%).'},
  '10034':{weekly:{model:'ae',mape:8.2,ref:'🤖 AE 8.2% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:6.1,ref:'6W: DI 6.1% vs DOW 9.4%',n:42},yearly:{model:'di',mape:8.0,ref:'ALL: DI 8.0% vs DOW 22.1%',n:1579},note:'Bonifay FL. DI best all horizons — I-10 travel.'},
  '10422':{weekly:{model:'ae',mape:10.7,ref:'🤖 AE 10.7% (Sep2025-May2026, n=269)',n:269},monthly:{model:'ly',mape:7.3,ref:'6W: LY 7.3% vs DOW 8.2% vs DI 8.9%',n:42},yearly:{model:'di',mape:9.8,ref:'ALL: DI 9.8% vs DOW 19.5%',n:1579},note:'Atoka. DOW weekly; LY monthly (stable YOY); DI annual.'},
  '10915':{weekly:{model:'ae',mape:8.7,ref:'🤖 AE 8.7% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:5.4,ref:'6W: DI 5.4% vs DOW 6.6%',n:42},yearly:{model:'di',mape:9.7,ref:'ALL: DI 9.7% vs DOW 13.9%',n:1580},note:'Seminole very stable. LY best short-term; DI monthly+yearly.'},
  '11657':{weekly:{model:'ae',mape:10.7,ref:'🤖 AE 10.7% (Sep2025-May2026, n=269)',n:269},monthly:{model:'dow',mape:5.6,ref:'6W: DOW 5.6% vs LY 8.0% vs DI 6.1%',n:42},yearly:{model:'di',mape:9.0,ref:'ALL: DI 9.0% vs LY 10.0%',n:1581},note:'Purcell. DOW weekly+monthly. DI annual only (DI degraded short-term).'},
  '13113':{weekly:{model:'ae',mape:12.1,ref:'🤖 AE 12.1% (Sep2025-May2026, n=269)',n:269},monthly:{model:'ly',mape:8.2,ref:'6W: LY 8.2% vs DI 9.4% vs DOW 9.6%',n:42},yearly:{model:'dow',mape:9.6,ref:'ALL: DOW 9.6% vs LY 10.1%',n:1580},note:'Madill elevated MAPE all models. DI weekly (best option). Needs recalibration.'},
  '18213':{weekly:{model:'ae',mape:9.5,ref:'🤖 AE 9.5% (Sep2025-May2026, n=267)',n:267},monthly:{model:'ly',mape:7.5,ref:'6W: LY 7.5% vs DOW 7.8% vs DI 8.0%',n:42},yearly:{model:'di',mape:9.5,ref:'ALL: DI 9.5% vs LY 34.7%',n:1579},note:'Lindsay-Walmart. LY wins short+medium (stable YOY). DI annual. Relocation pending.'},
  '20475':{weekly:{model:'ae',mape:8.1,ref:'🤖 AE 8.1% (Sep2025-May2026, n=269)',n:269},monthly:{model:'dow',mape:5.4,ref:'6W: DOW 5.4% vs LY 5.5% vs DI 7.5%',n:42},yearly:{model:'di',mape:7.7,ref:'ALL: DI 7.7% vs DOW 33.1%',n:1583},note:'OKC-I240. DOW remarkably accurate (3.3% weekly). DI annual.'},
  '24471':{weekly:{model:'ae',mape:10.5,ref:'🤖 AE 10.5% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:6.0,ref:'6W: DI/DOW tied 6.0% — DI preferred',n:42},yearly:{model:'di',mape:9.9,ref:'ALL: DI 9.9% vs LY 17.3%',n:1581},note:'Ardmore-Cooper. DOW 3.9% weekly. DI monthly (tied DOW, DI preferred).'},
  '29760':{weekly:{model:'ae',mape:7.4,ref:'🤖 AE 7.4% (Sep2025-May2026, n=268)',n:268},monthly:{model:'dow',mape:5.5,ref:'6W: DOW 5.5% vs LY 7.5% vs DI 12.1%',n:42},yearly:{model:'ly',mape:7.2,ref:'ALL: LY 7.2% vs DOW 7.2% vs DI 7.8%',n:1582},note:'Duncan DI DEGRADED (12%+). DOW weekly+monthly. LY annual. Re-enable DI after recalibration.'},
  '31357':{weekly:{model:'ae',mape:9.4,ref:'🤖 AE 9.4% (Sep2025-May2026, n=269)',n:269},monthly:{model:'dow',mape:6.6,ref:'6W: DOW 6.6% vs DI 8.6%',n:42},yearly:{model:'di',mape:8.2,ref:'ALL: DI 8.2% vs DOW 9.0%',n:1580},note:'Pauls Valley. DI weekly (tied DOW). DOW monthly. DI annual.'},
  '32525':{weekly:{model:'ae',mape:9.1,ref:'🤖 AE 9.1% (Sep2025-May2026, n=268)',n:268},monthly:{model:'dow',mape:6.9,ref:'6W: DOW 6.9% vs LY 8.6% vs DI 13.0%',n:42},yearly:{model:'di',mape:9.2,ref:'ALL: DI 9.2% vs DOW 33.5%',n:1578},note:'Sulphur DI DEGRADED short-term (13%). LY weekly; DOW monthly; DI annual. Recalibrate.'},
  '33109':{weekly:{model:'ae',mape:9.8,ref:'🤖 AE 9.8% (Sep2025-May2026, n=269)',n:269},monthly:{model:'dow',mape:4.3,ref:'6W: DOW 4.3% vs DI 6.0%',n:42},yearly:{model:'di',mape:9.1,ref:'ALL: DI 9.1% (tied DOW, DI preferred)',n:1572},note:'Marietta. DOW exceptional (3.5% weekly!). DI annual.'},
  '33222':{weekly:{model:'ae',mape:9.7,ref:'🤖 AE 9.7% (Sep2025-May2026, n=267)',n:267},monthly:{model:'dow',mape:5.0,ref:'6W: DOW 5.0% vs LY 8.3% vs DI 12.7%',n:42},yearly:{model:'dow',mape:null,ref:'ALL: was 175%+ full MAPE — root cause found v4.195: Jan 2026 OK snow storm closure (tagged) was never being excluded from calibration due to a separate bug (calibrateStore call sites omitted _userEvents). Fixed; full MAPE now ~13% with the tag correctly applied. recentOnly kept as a safety net, not currently load-bearing.',n:1579},note:'Elgin travel stop. Recent weekly/monthly excellent. Full-history MAPE was misleadingly high due to an unexcluded tagged closure day, not genuine data quality — see yearly.ref.',recentOnly:true},
  '33704':{weekly:{model:'ae',mape:13.7,ref:'🤖 AE 13.7% (Sep2025-May2026, n=269)',n:269},monthly:{model:'dow',mape:7.1,ref:'6W: DOW 7.1% vs DI 8.8%',n:42},yearly:{model:'dow',mape:9.9,ref:'ALL: DOW 9.9% vs DI 11.8% — rare DOW wins all',n:1582},note:'Tecumseh. DOW wins ALL horizons. Very consistent DOW pattern.'},
  '34222':{weekly:{model:'ae',mape:10.9,ref:'🤖 AE 10.9% (Sep2025-May2026, n=269)',n:269},monthly:{model:'dow',mape:5.8,ref:'6W: DOW 5.8% vs DI 7.5%',n:42},yearly:{model:'dow',mape:9.7,ref:'ALL: DOW 9.7% vs DI 10.1%',n:1581},note:'Harrah metric-aware GM. DI best weekly. DOW monthly+yearly.'},
  '35064':{weekly:{model:'ae',mape:10.1,ref:'🤖 AE 10.1% (Sep2025-May2026, n=268)',n:268},monthly:{model:'dow',mape:5.5,ref:'6W: DOW 5.5% vs LY 6.6% vs DI 8.2%',n:42},yearly:{model:'di',mape:10.5,ref:'ALL: DI 10.5% vs DOW 25.7%',n:1578},note:'Holdenville GM-in-training. DOW weekly+monthly (ops in flux). DI annual.'},
  '35242':{weekly:{model:'ae',mape:7.1,ref:'🤖 AE 7.1% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:6.6,ref:'6W: DI 6.6% vs DOW 7.8%',n:42},yearly:{model:'di',mape:8.2,ref:'ALL: DI 8.2% vs DOW 25.0%',n:1583},note:"Cottondale FL. DI dominates all horizons — Love's Travel Stop I-10."},
  '37566':{weekly:{model:'ae',mape:6.5,ref:'🤖 AE 6.5% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:5.8,ref:'6W: DI 5.8% vs DOW 6.9%',n:42},yearly:{model:'dow',mape:null,ref:'ALL: was 354%+ full MAPE — root cause found v4.195: a single tagged anomaly day (Jun 19 2025) was never being excluded from calibration due to a separate bug (calibrateStore call sites omitted _userEvents). Fixed; full MAPE now ~7% with the tag correctly applied. recentOnly kept as a safety net, not currently load-bearing.',n:1584},note:"Mossy Head FL. Weekly/Monthly DI excellent. Full-history MAPE was misleadingly high due to an unexcluded tagged anomaly day, not genuine data quality — see yearly.ref.",recentOnly:true},
  '38609':{weekly:{model:'ae',mape:6.6,ref:'🤖 AE 6.6% (Sep2025-May2026, n=269)',n:269},monthly:{model:'di',mape:6.7,ref:'6W: DI 6.7% vs DOW 7.6%',n:42},yearly:{model:'di',mape:7.8,ref:'ALL: DI 7.8% vs LY 99.5%',n:1581},note:'Freeport FL beach-adjacent. DOW weekly (seasonal DOW strong). DI monthly+yearly.'},
  '43380':{weekly:{model:'ae',mape:14.4,ref:'🤖 AE 14.4% (Sep2025-May2026, n=267)',n:267},monthly:{model:'ly',mape:8.3,ref:'6W: LY 8.3% vs DOW 9.6% vs DI 9.8%',n:42},yearly:{model:'dow',mape:13.7,ref:'ALL: DOW 13.7% vs DI 26.4%',n:503},note:'Tishomingo. Limited history (503 days). LY short+medium. DOW annual. DI not viable yet.',recentOnly:true},
  '43701':{weekly:{model:'ae',mape:10.0,ref:'🤖 AE 10.0% (Sep2025-May2026, n=65)',n:65},monthly:{model:'dow',mape:null,ref:'No LY data',n:0},yearly:{model:'dow',mape:null,ref:'Insufficient data',n:0},note:'Ponce de Leon FL — opened 03/13/26. DOW only until ~Sep 2026.',recentOnly:true},
};


const MODEL_ASSIGNMENT_KEY = 'mf_model_assignments';

const DEF_SETTINGS={
  districtName:'McDOK | Emerald Arches',districtNameShort:'McDOK',userName:'',
  theme:'command',     // 'golden'|'command'|'dualbrand'|'refined'
  colorMode:'light',   // 'light'|'dark'
  weekStartDay:3, // 0=Sun 1=Mon 3=Wed (McDonald's standard)
  lyOutlierThreshold:30, // % deviation from DOW trimmed mean to auto-dampen LY value
  mode:'Projection',cascade:false,plusUp:0,tolerance:5,weeksBack:6,
  // Enhancement 1 — Trend integration in primary forecast
  useTrendInForecast:true,   // blend wTrend into forecast formula
  trendAlpha:0.30,           // how much trend moves the forecast (0=none, 1=full)
  // Enhancement 2 — GC × AvgCheck parallel model
  useGCAModel:false,         // when true, use GC×AvgCheck instead of LY model
  showGCAComparison:true,    // show both models in projection for comparison
  // Enhancement 5 — Event Registry
  useEventRegistry:true,     // apply learned event-impact factors to forecasts
  // Enhancement 6 — Daypart supplement
  showDaypartSupplement:true, // show B/L/D breakdown under projection rows
  plusUpByStore:{},  // {locId: pct}  e.g. {'3708': 2.5}
  plusUpByPatch:{},  // {patchName: pct}  e.g. {'Robert': 1.0}
  trendWeights:{t2:.50,t4:.30,t6:.20},
  // Labor % display thresholds (percentage POINTS from target)
  laborGreenPct:0.5,   // ≤0.5pts from target = green ✓
  laborYellowPct:1.5,  // 0.5–1.5pts = yellow warning
  // above 1.5pts = red flag
  weather:{enabled:true,hotDay:-2,coldDay:-3,niceDay:1,lightRain:-3,heavyRain:-2,highWind:-2,veryHighWind:-1},
  opsMults:{oepeSeverePenalty:-3,oepePenalty:-2,oepeBonus:1,kvstPenalty:-2,kvsuPenalty:-2,parkPenalty:-3,tpphPenalty:-2,tpphBonus:1,shortStaffPenalty:-10,readyStaffBonus:1,opsFactorFloor:85},
  scoring:{
    oepeT1pts:15,oepeT2pts:11,oepeT3pts:6,oepeT2gap:10,oepeT3gap:20,
    kvstMaxPts:9,kvstPartialPts:5,kvstPartialPct:1.2,
    kvsuMaxPts:6,kvsuPartialPts:3,kvsuPartialPct:0.8,
    parkMaxPts:9,parkPartialPts:5,parkPartialPct:1.3,
    tpphMaxPts:12,tpphT2pts:7,tpphT3pts:3,tpphT2pct:.9,tpphT3pct:.8,
    laborMaxPts:9,laborT1pts:6,laborT2pts:3,laborT1gap:.005,laborT2gap:.015,laborT3gap:.03,
    cashT1:.0003,cashT2:.001,cashT3:.003,cashT4:.005,cashPts:[10,7,4,1,0],
    tredT1:.002,tredT2:.004,tredT3:.006,tredPts:[6,4,2,0],
    otT1:0,otT2:1,otT3:2,otT4:5,otPts:[8,7,5,2,0],
    refundT1:1,refundT2:2,refundT3:4,refundPts:[6,4,2,0],
    discT1:.04,discT2:.055,discT3:.07,discPts:[6,4,2,0],
  },
  supervisorGroups:{
    // MCDOK — Oklahoma
    'Robert Spencer':    ['3708','6972','24471','32525'],
    'Krystiana Langford':['5183','18213','29760','33222'],
    'Ashley Podroza':    ['5985','10422','13113','33109','43380'],
    'Steven Vaughn':     ['10915','33704','34222','35064'],
    'Amanda Estrada':    ['11657','20475','31357'],
    // Emerald Arches — Florida
    'Brad Denley':       ['6178','6838','10034','35242','37566','38609','43701']
  },
  operators:{
    // MCDOK — Oklahoma (Ryan + FL stores 10034, 37566, 43380, 43701)
    'Ryan Thorley':       ['3708','6972','10034','10915','24471','29760','31357','32525','33222','37566','43380','43701'],
    'Gary Mornhinweg':    ['5183','11657','18213','20475','33704','34222'],
    'Rick/Kathy Thorley': ['5985','10422','13113','33109','35064'],
    // Emerald Arches — Florida (Jacob)
    'Jacob Thorley':      ['6178','6838','35242','38609']
  },
  // Metric activate/deactivate toggles (true = active in scoring)
  metricActive:{oepe:true,kvst:true,kvsu:true,park:true,tpph:true,labor:true,r2p:true,
    cashOS:true,tRedA:true,ot:true,refund:true,disc:true},
  // Empirical weather — per-store calibrated coefficients (populated by calibrateWeather)
  empiricalWeather:{},  // {loc: {
  dialedIn:{},       // {loc: {t2,t4,t6,opsMult,mape,samples,runDate}}
  dialedInEnabled:false, // must be explicitly turned on
  opsNorm:false,         // use store own metric history as baseline (not targets)
  opsNormByStore:{},     // per-store override: {loc: true/false}rain:coef, hot:coef, cold:coef}}
  useEmpirical:false,   // when true, use empirical coefficients instead of slider values
};

const AE_DI_PARAMS = {
  '3708':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},'5183':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '5985':{w2:0.33,w4:0.25,w6:0.42,alpha:0.20},'6178':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '6838':{w2:0.60,w4:0.33,w6:0.07,alpha:0.15},'6972':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '10034':{w2:0.60,w4:0.33,w6:0.07,alpha:0.35},'10422':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '10915':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},'11657':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '13113':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},'18213':{w2:0.33,w4:0.33,w6:0.34,alpha:0.15},
  '20475':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},'24471':{w2:0.50,w4:0.25,w6:0.25,alpha:0.15},
  '29760':{w2:0.40,w4:0.33,w6:0.27,alpha:0.15},'31357':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '32525':{w2:0.50,w4:0.25,w6:0.25,alpha:0.15},'33109':{w2:0.60,w4:0.25,w6:0.15,alpha:0.15},
  '33222':{w2:0.33,w4:0.25,w6:0.42,alpha:0.35},'33704':{w2:0.33,w4:0.33,w6:0.34,alpha:0.15},
  '34222':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},'35064':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '35242':{w2:0.33,w4:0.33,w6:0.34,alpha:0.35},'37566':{w2:0.33,w4:0.33,w6:0.34,alpha:0.25},
  '38609':{w2:0.33,w4:0.25,w6:0.42,alpha:0.35},'43380':{w2:0.33,w4:0.25,w6:0.42,alpha:0.15},
  '43701':{w2:0.60,w4:0.25,w6:0.15,alpha:0.35},
};

const MODEL_CODE_LABELS={'di':'🎯 Dialed-In','ly':'📅 LY Adj','dow':'📊 DOW Trend','ewma':'📈 EWMA','ae':'🤖 Adaptive Ensemble','addi':'🎯 DI+'};


// ── Store coordinates for weather API (all 27 locations) ─────────────────────
// Used by Open-Meteo fetch — lat/lon/timezone per store
const STORE_COORDS = {
  '3708': {lat:34.1741,lon:-97.1434,tz:'America/Chicago'},   // Ardmore-Broadway
  '5183': {lat:35.0509,lon:-97.9378,tz:'America/Chicago'},   // Chickasha
  '5985': {lat:33.9871,lon:-96.4058,tz:'America/Chicago'},   // Durant
  '6178': {lat:30.7796,lon:-85.5385,tz:'America/Chicago'},   // Chipley FL
  '6838': {lat:30.7213,lon:-86.1245,tz:'America/Chicago'},   // Defuniak Springs FL
  '6972': {lat:34.7741,lon:-96.6786,tz:'America/Chicago'},   // Ada
  '10034':{lat:30.7913,lon:-85.6788,tz:'America/Chicago'},   // Bonifay FL
  '10422':{lat:34.3857,lon:-96.1280,tz:'America/Chicago'},   // Atoka
  '10915':{lat:35.2245,lon:-96.6724,tz:'America/Chicago'},   // Seminole
  '11657':{lat:34.9773,lon:-97.3606,tz:'America/Chicago'},   // Purcell
  '13113':{lat:34.0940,lon:-96.7724,tz:'America/Chicago'},   // Madill
  '18213':{lat:34.8384,lon:-97.6006,tz:'America/Chicago'},   // Lindsay
  '20475':{lat:35.3867,lon:-97.4038,tz:'America/Chicago'},   // OKC-I240
  '24471':{lat:34.1741,lon:-97.1434,tz:'America/Chicago'},   // Ardmore-Cooper
  '29760':{lat:34.5026,lon:-97.9573,tz:'America/Chicago'},   // Duncan
  '31357':{lat:34.7401,lon:-97.2217,tz:'America/Chicago'},   // Pauls Valley
  '32525':{lat:34.5085,lon:-96.9725,tz:'America/Chicago'},   // Sulphur
  '33109':{lat:33.9371,lon:-97.1231,tz:'America/Chicago'},   // Marietta
  '33222':{lat:34.7751,lon:-98.1031,tz:'America/Chicago'},   // Elgin
  '33704':{lat:35.2576,lon:-96.9362,tz:'America/Chicago'},   // Tecumseh
  '34222':{lat:35.4876,lon:-97.1645,tz:'America/Chicago'},   // Harrah
  '35064':{lat:35.0826,lon:-96.3975,tz:'America/Chicago'},   // Holdenville
  '35242':{lat:30.7947,lon:-85.3758,tz:'America/Chicago'},   // Cottondale FL
  '37566':{lat:30.7438,lon:-86.3244,tz:'America/Chicago'},   // Mossy Head FL
  '38609':{lat:30.4988,lon:-86.1372,tz:'America/Chicago'},   // Freeport FL
  '43380':{lat:34.2387,lon:-96.6790,tz:'America/Chicago'},   // Tishomingo
  '43701':{lat:30.7157,lon:-85.9360,tz:'America/Chicago'},   // Ponce de Leon FL
};

// ── Open-Meteo weather fetch (all 27 stores, any date range) ─────────────────
// Free API · No key required · CORS-enabled · ERA5 reanalysis back to 1940
// Rate limit: 1 req/s — fetching all 27 stores takes ~30 seconds
async function fetchOpenMeteoWeather(startDate, endDate, onProgress) {
  const rows = [];
  const locs = Object.keys(STORE_COORDS);
  const fmt = d => d.toISOString().slice(0,10);
  const s = typeof startDate==='string' ? startDate : fmt(startDate);
  const e = typeof endDate==='string'   ? endDate   : fmt(endDate);

  for(let i=0; i<locs.length; i++){
    const loc = locs[i];
    const {lat,lon,tz} = STORE_COORDS[loc];
    if(onProgress) onProgress(i+1, locs.length, STORE_NAMES[loc]||loc);
    const url=`https://archive-api.open-meteo.com/v1/archive`+
      `?latitude=${lat}&longitude=${lon}`+
      `&start_date=${s}&end_date=${e}`+
      `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,`+
      `precipitation_sum,wind_speed_10m_max`+
      `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(tz)}`;
    const RETRY_DELAYS=[0,15000,30000,60000,120000]; // 0, 15s, 30s, 60s, 2min
    let fetched = false;
    for(let attempt=0; attempt<RETRY_DELAYS.length && !fetched; attempt++){
      try{
        if(RETRY_DELAYS[attempt]) await new Promise(r=>setTimeout(r,RETRY_DELAYS[attempt]));
        const res = await fetch(url);
        if(res.status===429){
          console.warn(`Weather 429 for ${loc}, attempt ${attempt+1}/${RETRY_DELAYS.length} — backing off ${(RETRY_DELAYS[attempt+1]||0)/1000}s`);
          continue;
        }
        if(!res.ok) throw new Error('HTTP '+res.status);
        const data = await res.json();
        const {time,temperature_2m_max:tmax,temperature_2m_min:tmin,
               temperature_2m_mean:tavg,precipitation_sum:rain,
               wind_speed_10m_max:wspd} = data.daily;
        for(let j=0;j<time.length;j++){
          rows.push({
            _rk:`${loc}_${time[j]}`,
            loc, date:new Date(time[j]+'T00:00:00'),
            tmax:tmax[j], tmin:tmin[j], tavg:tavg[j],
            rain:rain[j]||0, wspd:wspd[j]||0,
            source:'open-meteo',
          });
        }
        fetched = true;
      }catch(err){
        console.warn(`Weather fetch failed for ${loc}:`,err);
        break;
      }
    }
    await new Promise(r=>setTimeout(r,1100)); // 1 req/sec rate limit — must run even on failure
  }
  return rows;
}

// ── Weather context helper — used by anomaly detection ───────────────────────
// Returns a human-readable weather note if conditions were notable on a given day

const STORE_NAMES={
  // MCDOK — Oklahoma (names from LocNameForDisplay)
  '3708': 'Ardmore-Broadway',
  '5183': 'Chickasha-So 4th',
  '5985': 'Durant-US Hwy 70/22',
  '6972': 'Ada-Country Club',
  '10422':'Atoka-Mississippi',
  '10915':'Seminole-Milt Phillips',
  '11657':'Purcell',
  '13113':'Madill-Hwy 70',
  '18213':'Lindsay-Wal-Mart',
  '20475':'OKC-I240/Sooner',
  '24471':'Ardmore-Cooper/12th',
  '29760':'Duncan-Hwy 81',
  '31357':'Pauls Valley-Ballard Rd',
  '32525':'Sulphur',
  '33109':'Marietta',
  '33222':'Elgin',
  '33704':'Tecumseh',
  '34222':'Harrah',
  '35064':'Holdenville',
  '43380':'Tishomingo-Main & Refuge',
  // Emerald Arches — Florida Panhandle
  '6178': 'Chipley-St Rd 77',
  '6838': 'Defuniak Springs',
  '10034':'Bonifay',
  '35242':'Cottondale',
  '37566':'Mossy Head',
  '38609':'Freeport',
  '43701':'Ponce de Leon-Hwy 81/I-10'
};
const sName  = l => l + ' — ' + (STORE_NAMES[l] || l);
const sNameC = l => STORE_NAMES[l] || l;

const DOW_BASE = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Store Knowledge Base — static notes + user-editable overlay ──────────────
const STORE_KB = {
  '3708':  {notes:'Ardmore-Broadway. Highest-volume OK location, well-run. May be capacity-constrained by physical plant size. Ryan Thorley operator.',         tags:['high-volume','capacity-limited','well-run']},
  '5183':  {notes:'Chickasha-So 4th. Longest-tenured GM — runs consistent, predictable operations. Strong operational baseline.',                              tags:['consistent','experienced-gm']},
  '5985':  {notes:'Durant-US Hwy 70/22. Highest individual volume, very well run. Physical plant capacity may be a ceiling on upside. Reliable benchmark store.',tags:['high-volume','well-run','capacity-limited']},
  '6178':  {notes:'Chipley-St Rd 77 (FL). Interstate highway location. All FL locations except Freeport are interstate. Touristy/travel demographics.',         tags:['interstate','fl','tourist']},
  '6838':  {notes:'Defuniak Springs (FL). Interstate, FL panhandle. Seasonal variability likely. Touristy area.',                                              tags:['interstate','fl','tourist','seasonal']},
  '6972':  {notes:'Ada-Country Club. Consistent, high-traffic location. Fine-tuning management performance. Historically reliable volume — high potential.',    tags:['high-volume','management-development']},
  '10034': {notes:'Bonifay (FL). Interstate location. Touristy travel demographics. Emerald Arches FL territory.',                                             tags:['interstate','fl','tourist']},
  '10422': {notes:'Atoka-Mississippi. Untapped potential — volume below what demographics suggest. Management development opportunity.',                        tags:['growth-opportunity']},
  '10915': {notes:'Seminole-Milt Phillips. Runs well. Consistent, reliable operations.',                                                                       tags:['consistent','well-run']},
  '11657': {notes:'Purcell. Mid-volume. Recent MAPE spike (11.2% 1W). DI skipped pending stable data window. Monitoring closely.',                             tags:['watch','di-skipped']},
  '13113': {notes:'Madill-Hwy 70. DI skipped — calibrating with more data. Elevated MAPE; management stability a factor. Worth re-enabling DI.',              tags:['watch','di-skipped']},
  '18213': {notes:'Lindsay-Wal-Mart. Located in a very old Walmart. New relocation build in progress — transition will affect volume trends.',                  tags:['relocation-pending','walmart-adjacent']},
  '20475': {notes:'OKC-I240/Sooner. Suburban OKC. Standard suburban traffic patterns.',                                                                        tags:[]},
  '24471': {notes:'Ardmore-Cooper/12th. Second Ardmore location. Different traffic profile from Ardmore-Broadway.',                                            tags:[]},
  '29760': {notes:'Duncan-Hwy 81 (Relo). Well-run mid-to-high volume. Model degrading recently (12-14% MAPE). DI skipped — RECOMMEND RE-ENABLING DI.',       tags:['well-run','di-skipped','model-degrading','recalibrate']},
  '31357': {notes:'Pauls Valley-Ballard Rd. DI skipped — improving trend. Monitoring before re-enabling calibration.',                                         tags:['di-skipped','improving']},
  '32525': {notes:'Sulphur. Model degrading recently (12-14% MAPE) — recent worse than full historical. RECOMMEND RECALIBRATION.',                             tags:['model-degrading','recalibrate']},
  '33109': {notes:'Marietta. Near Oklahoma-Texas state line. Traffic includes some interstate and cross-border travelers.',                                     tags:['interstate-adjacent']},
  '33222': {notes:'Elgin. Located inside a travel stop / gas station. Historical data anomaly (190% full MAPE) — recent improving (8-12%). Treat as improving. Ignore full MAPE figure.', tags:['travel-stop','gas-station','improving','historical-anomaly']},
  '33704': {notes:'Tecumseh. Suburban store. Better trend recently — improving MAPE.',                                                                          tags:['improving']},
  '34222': {notes:'Harrah. GM is very metric-aware and runs a good business. Strong operational discipline and data literacy.',                                 tags:['metric-aware-gm','well-run']},
  '35064': {notes:'Holdenville. GM-in-training with no prior management experience. Intentional, slow growth path for operational improvement. Patient development approach needed.', tags:['gm-in-training','growth-path']},
  '35242': {notes:'Cottondale (FL). Located inside a Love\'s Travel Stop. Interstate I-10. Emerald Arches FL territory.',                                      tags:['loves-gas-station','interstate','fl']},
  '37566': {notes:'Mossy Head (FL). Inside Love\'s Travel Stop. Interstate. HISTORICAL ANOMALY: 358% full MAPE from bad early data. Recent MAPE excellent (5-6%). Model working great — ignore full MAPE.', tags:['loves-gas-station','interstate','fl','historical-anomaly','excellent-recent']},
  '38609': {notes:'Freeport (FL). Touristy — 15 miles from beach. NOT an interstate location (only FL store that isn\'t). Beach proximity creates seasonal patterns. Emerald Arches FL.', tags:['tourist','beach-adjacent','seasonal','fl']},
  '43380': {notes:'Tishomingo-Main & Refuge. DI skipped — only 157 rows of history, too sparse for reliable calibration. Recent MAPE 15%+. Monitor as data accumulates.', tags:['di-skipped','data-sparse','watch']},
  '43701': {notes:'Ponce de Leon-Hwy 81/I-10 (FL). Inside Love\'s Travel Stop. Interstate I-10. OPENED 03/13/26 — very new. 0 valid LY rows. DI calibration not viable; needs 6+ months of history first. Tourist/travel demographics.', tags:['loves-gas-station','interstate','fl','new-location','insufficient-history','tourist','ponce']},
};

const STORE_KB_EDIT_KEY = 'mf_store_kb_edits';
function getKBEdits() {
  try { return JSON.parse(localStorage.getItem(STORE_KB_EDIT_KEY)||'{}'); } catch { return {}; }
}
function saveKBEdits(edits) {
  try { localStorage.setItem(STORE_KB_EDIT_KEY, JSON.stringify(edits)); } catch {}
}
function getKB(loc) {
  const base  = STORE_KB[loc] || {notes:'', tags:[]};
  const edits = getKBEdits();
  return edits[loc] ? {...base,...edits[loc]} : base;
}


// Event taxonomy (used by CalendarManager, LifeLenz, EventEntry, etc.)
const EVENT_TYPES={
  // ── Specific Weather ─────────────────────────────────────────────────────
  winter_storm:{label:'Winter Storm',         icon:'❄',   col:'#93c5fd'},
  snow:         {label:'Snow',                 icon:'🌨',  col:'#bfdbfe'},
  ice:          {label:'Ice Storm',            icon:'🧊',  col:'#7dd3fc'},
  tornado:      {label:'Tornado',              icon:'🌪',  col:'#f87171'},
  t_storm:      {label:'Severe T-Storm',       icon:'⛈',  col:'#818cf8'},
  sev_weather:  {label:'Severe Weather',       icon:'⚡',  col:'#fbbf24'},
  high_winds:   {label:'Damaging Winds',       icon:'💨',  col:'#6ee7b7'},
  flood:        {label:'Flooding',             icon:'🌊',  col:'#60a5fa'},
  hurricane:    {label:'Hurricane',            icon:'🌀',  col:'#f87171'},
  weather:      {label:'Weather (General)',    icon:'🌧',  col:'#60a5fa'},
  // ── Store Events ─────────────────────────────────────────────────────────
  tech:         {label:'Store Event — Technology',  icon:'💻', col:'#818cf8'},
  utilities:    {label:'Store Event — Utilities',   icon:'🔌', col:'#f97316'},
  maintenance:  {label:'Store Event — Maintenance', icon:'🔧', col:'#94a3b8'},
  power:        {label:'Power Outage',              icon:'💡', col:'#fbbf24'},
  outage:       {label:'Outage / Issue',            icon:'⚠',  col:'#ef4444'},
  // ── Community / External ─────────────────────────────────────────────────
  pub_emergency:{label:'Public Emergency',     icon:'🚨',  col:'#ef4444'},
  road_closure: {label:'Road Closure',         icon:'🚧',  col:'#f97316'},
  construction: {label:'Construction',         icon:'🏗',   col:'#a3a3a3'},
  event:        {label:'Major Local Event',    icon:'🎪',  col:'#a78bfa'},
  comp:         {label:'Competition (General)', icon:'🏪',  col:'#f87171'},
  comp_new:     {label:'Competitor — New Opening',   icon:'🆕',  col:'#fb923c'},
  comp_promo:   {label:'Competitor — Promo/Deal',    icon:'💸',  col:'#f87171'},
  comp_closure: {label:'Competitor — Closed/Down',   icon:'🔒',  col:'#34d399'},
  comp_pricing: {label:'Competitor — Price Change',  icon:'🏷',  col:'#fbbf24'},
  comp_media:   {label:'Competitor — Media/PR Event',icon:'📺',  col:'#a78bfa'},
  // ── Operations / Scheduled ───────────────────────────────────────────────
  promo:        {label:'LTO / Promo',          icon:'🍔',  col:'#10b981'},
  holiday:      {label:'Holiday',              icon:'🎉',  col:'#f59e0b'},
  staffing:     {label:'Staffing Issue',       icon:'👥',  col:'#34d399'},
  cfv:          {label:'CFV (Unannounced)',     icon:'🔍',  col:'#f97316'},
  ecosure:      {label:'EcoSure Visit',        icon:'🌿',  col:'#22c55e'},
  rgr:          {label:'RGR (Annual Grade)',   icon:'📋',  col:'#818cf8'},
  other:        {label:'Other',                icon:'📌',  col:'#94a3b8'},
  // ── School Calendar (v4.200) ─────────────────────────────────────────────
  school_start:        {label:'School Year Begins',  icon:'🎒', col:'#34d399'},
  school_end:          {label:'School Year Ends',    icon:'🏖', col:'#fbbf24'},
  school_break:        {label:'School Break (Multi-Day)', icon:'📕', col:'#a78bfa'},
  school_no_school:    {label:'No School Day',       icon:'🏫', col:'#fb923c'},
  school_early_release:{label:'Early Release Day',   icon:'⏰', col:'#fb923c'},
};

// Groups for the tag picker UI
const EVENT_TYPE_GROUPS=[
  {label:'⛈ Weather',items:['winter_storm','snow','ice','tornado','t_storm','sev_weather','high_winds','flood','hurricane','weather']},
  {label:'🏪 Store Events',items:['tech','utilities','maintenance','power','outage']},
  {label:'🚨 Community / External',items:['pub_emergency','road_closure','construction','event','comp']},
  {label:'🏪 Competition',items:['comp_new','comp_promo','comp_closure','comp_pricing','comp_media']},
  {label:'📋 Operations',items:['promo','holiday','staffing','cfv','ecosure','rgr','other']},
  {label:'📚 School Calendar',items:['school_start','school_end','school_break','school_no_school','school_early_release']},
];

const INV_ORG_COORDS={
  '3708':{lat:34.1741,lng:-97.1452,state:'OK',sup:'Robert Spencer',op:'Ryan Thorley',del:'Wed/Sun'},
  '5183':{lat:35.0254,lng:-97.9421,state:'OK',sup:'Krystiana Langford',op:'Gary Mornhinweg',del:'Tue/Fri'},
  '5985':{lat:33.9961,lng:-96.4173,state:'OK',sup:'Ashley Podroza',op:'Rick/Kathy Thorley',del:'Wed/Fri'},
  '6972':{lat:34.7831,lng:-96.6572,state:'OK',sup:'Robert Spencer',op:'Ryan Thorley',del:'Tue/Fri'},
  '10422':{lat:34.3755,lng:-96.1332,state:'OK',sup:'Ashley Podroza',op:'Rick/Kathy Thorley',del:'Wed/Sun'},
  '10915':{lat:35.2121,lng:-96.6791,state:'OK',sup:'Steven Vaughn',op:'Ryan Thorley',del:'Thu/Sun'},
  '11657':{lat:35.0012,lng:-97.3715,state:'OK',sup:'Amanda Estrada',op:'Gary Mornhinweg',del:'Tue/Fri'},
  '13113':{lat:34.0853,lng:-96.7724,state:'OK',sup:'Ashley Podroza',op:'Rick/Kathy Thorley',del:'Wed/Sun'},
  '18213':{lat:34.8431,lng:-97.6185,state:'OK',sup:'Krystiana Langford',op:'Gary Mornhinweg',del:'Tue/Fri'},
  '20475':{lat:35.3854,lng:-97.4171,state:'OK',sup:'Amanda Estrada',op:'Gary Mornhinweg',del:'Tue/Fri'},
  '24471':{lat:34.1951,lng:-97.1182,state:'OK',sup:'Robert Spencer',op:'Ryan Thorley',del:'Wed/Sun'},
  '29760':{lat:34.5291,lng:-97.9654,state:'OK',sup:'Krystiana Langford',op:'Ryan Thorley',del:'Tue/Fri'},
  '31357':{lat:34.7352,lng:-97.2511,state:'OK',sup:'Amanda Estrada',op:'Ryan Thorley',del:'Tue/Fri'},
  '32525':{lat:34.5101,lng:-96.9991,state:'OK',sup:'Robert Spencer',op:'Ryan Thorley',del:'Tue/Fri'},
  '33109':{lat:33.9482,lng:-97.1281,state:'OK',sup:'Ashley Podroza',op:'Rick/Kathy Thorley',del:'Wed/Sun'},
  '33222':{lat:34.7863,lng:-98.2912,state:'OK',sup:'Krystiana Langford',op:'Ryan Thorley',del:'Tue/Fri'},
  '33704':{lat:35.2711,lng:-96.9414,state:'OK',sup:'Steven Vaughn',op:'Gary Mornhinweg',del:'Mon/Thu'},
  '34222':{lat:35.4522,lng:-97.1651,state:'OK',sup:'Steven Vaughn',op:'Gary Mornhinweg',del:'Mon/Thu'},
  '35064':{lat:35.0801,lng:-96.3921,state:'OK',sup:'Steven Vaughn',op:'Rick/Kathy Thorley',del:'Mon/Thu'},
  '43380':{lat:34.2382,lng:-96.6624,state:'OK',sup:'Ashley Podroza',op:'Ryan Thorley',del:'Wed/Sun'},
  '6178':{lat:30.7681,lng:-85.4912,state:'FL',sup:'Brad Denley',op:'Jacob Thorley',del:'Tue/Fri'},
  '6838':{lat:30.6942,lng:-86.1163,state:'FL',sup:'Brad Denley',op:'Jacob Thorley',del:'Tue/Fri'},
  '10034':{lat:30.7741,lng:-85.6812,state:'FL',sup:'Brad Denley',op:'Ryan Thorley',del:'Tue/Fri'},
  '35242':{lat:30.7952,lng:-85.3811,state:'FL',sup:'Brad Denley',op:'Jacob Thorley',del:'Wed/Sun'},
  '37566':{lat:30.7183,lng:-86.3262,state:'FL',sup:'Brad Denley',op:'Ryan Thorley',del:'Wed/Sun'},
  '38609':{lat:30.4851,lng:-86.1394,state:'FL',sup:'Brad Denley',op:'Jacob Thorley',del:'Wed/Sun'},
  '43701':{lat:30.7132,lng:-85.9391,state:'FL',sup:'Brad Denley',op:'Ryan Thorley',del:'Wed/Sun'},
};

// Florida stores belong to Emerald Arches; all Oklahoma stores are McDOK
const _FL_STORES = new Set(['6178','6838','10034','35242','37566','38609','43701']);
function getStoreOrg(loc) { return _FL_STORES.has(String(loc)) ? 'emerald' : 'mcdok'; }

// VLH guide configuration options — used in store_vlh_config table and StoreVlhConfigPanel
const VLH_DT_TYPES = [
  {value:'side_tandem',   label:'Side By Side / Tandem'},
  {value:'single_2booth', label:'Single Lane 2 Booth'},
  {value:'single_1booth', label:'Single Lane 1 Booth'},
  {value:'no_dt',         label:'No Drive Thru'},
];
const VLH_IN_STORE = [
  {value:'self_serve', label:'Self Serve'},
  {value:'crew_pour',  label:'Crew Pour'},
];
const VLH_KITCHEN = [
  {value:'fryer_same', label:'Fryer Same Side'},
  {value:'fryer_opp',  label:'Fryer Opposite Side'},
  {value:'opl',        label:'OPL'},
  {value:'copl',       label:'COPL'},
];
const VLH_GUIDE = [
  {value:'standard', label:'Standard'},
  {value:'hpg',      label:'High Productivity (HPG)'},
];

// QSR_DAR_FIELDS — field dictionary for the qsr_daily_activity table.
// Maps each DB column name to a display label, description, and unit.
// Source: QSRSoft Daily Activity Report (DAR) via daily-activity-raw API endpoint.
// Purpose: UI tooltips, SAGE system context, and data documentation.
const QSR_DAR_FIELDS = {
  // ── Identity / Time ────────────────────────────────────────────────────
  loc:                  {label:'Store NSN',         desc:'McDonald\'s National Store Number, zero-padded to 7 digits',            unit:''},
  dt:                   {label:'Date',              desc:'Calendar date of the data row (local time)',                             unit:'YYYY-MM-DD'},
  hour_slot:            {label:'Hour Slot',         desc:'End time of the 1-hour slot (e.g. "11:00" = 10am–11am block). Slots above "24:00" span past midnight: "25:00" = 12am–1am, etc.',  unit:'HH:MM'},

  // ── Sales ──────────────────────────────────────────────────────────────
  product_sales:        {label:'Actual Sales',      desc:'Actual product sales dollars for this hour slot',                       unit:'$'},
  mean_sales:           {label:'Hist Mean Sales',   desc:'QSRSoft rolling historical mean sales for this store/slot/DOW (approx 5-week rolling avg). Used as the system baseline.',  unit:'$'},
  proj_sales_dollars:   {label:'Sched Proj Sales',  desc:'Scheduled sales projection for this slot, sourced from LifeLenz. Represents the sales volume implied by the GM\'s scheduled labor hours — a human-in-the-loop estimate, not a QSRSoft statistical model.',  unit:'$'},
  ly_product_sales:     {label:'LY Sales',          desc:'Last year product sales for the same slot and calendar date',           unit:'$'},

  // ── Transactions ───────────────────────────────────────────────────────
  trans_cnt:            {label:'Trans Count',       desc:'Total transaction count (orders completed) in this hour slot',         unit:'#'},
  ly_trans_cnt:         {label:'LY Trans Count',    desc:'Last year transaction count for this slot',                            unit:'#'},
  mean_trans_cnt:       {label:'Mean Trans Count',  desc:'Historical mean transaction count for this slot',                      unit:'#'},

  // ── Average Check ──────────────────────────────────────────────────────
  avg_check:            {label:'Avg Check',         desc:'Average sales per transaction (product_sales / trans_cnt)',             unit:'$'},
  ly_avg_check:         {label:'LY Avg Check',      desc:'Last year average check for this slot',                                unit:'$'},

  // ── Drive-Thru Speed ───────────────────────────────────────────────────
  dt_untilserve:        {label:'DT Until Serve',    desc:'Cumulative microseconds from car arrival at speaker to food delivery window (OEPE). Divide by 1,000,000 for seconds. Divide by dt_trans_cnt for per-car avg.',  unit:'µs'},
  dt_trans_cnt:         {label:'DT Trans Count',    desc:'Number of drive-thru transactions in this slot. Use as denominator for all DT timing averages.',  unit:'#'},
  dt_pullforward:       {label:'DT Pull-Forward',   desc:'Cumulative µs cars were held in pull-forward queue during this slot',   unit:'µs'},
  dt_greet:             {label:'DT Greet',          desc:'Cumulative µs from car arrival to greeting (speaker activation)',       unit:'µs'},
  dt_menu:              {label:'DT Menu',           desc:'Cumulative µs from greeting to order completion at speaker',           unit:'µs'},
  dt_payment:           {label:'DT Payment',        desc:'Cumulative µs from order completion to payment at window',             unit:'µs'},
  dt_cashier:           {label:'DT Cashier / Pick-Up', desc:'Cumulative µs at the pick-up / cashier window before food delivery', unit:'µs'},
  dt_avgspeed:          {label:'DT Avg Speed',      desc:'QSRSoft computed average DT speed (may duplicate dt_untilserve/dt_trans_cnt calculation)',  unit:'µs'},
  ly_dt_untilserve:     {label:'LY DT Until Serve', desc:'Last year DT Until Serve for this slot',                               unit:'µs'},
  ly_dt_trans_cnt:      {label:'LY DT Trans Count', desc:'Last year drive-thru transaction count for this slot',                  unit:'#'},

  // ── Labor ──────────────────────────────────────────────────────────────
  actual_punched_hours: {label:'Act Hrs',           desc:'Actual labor hours punched (clocked in/out) during this hour slot',   unit:'hrs'},
  total_needed_hours:   {label:'Needed Hrs',        desc:'Labor hours for this slot from LifeLenz — either (a) the algorithmic recommendation ("needed" hours for the projected sales volume) or (b) the actual hours the manager scheduled. Ambiguous without further API investigation; compare against actual_punched_hours to derive over/under-scheduling variance.',  unit:'hrs'},
  ly_actual_punched_hours:{label:'LY Act Hrs',      desc:'Last year actual punched labor hours for this slot',                   unit:'hrs'},

  // ── Order Accuracy ─────────────────────────────────────────────────────
  healthy_cnt:          {label:'Healthy Orders',    desc:'Orders with no reported errors or customer complaints (order accuracy)',  unit:'#'},
  unhealthy_cnt:        {label:'Unhealthy Orders',  desc:'Orders with reported errors, missing items, or customer complaints',   unit:'#'},
  ly_healthy_cnt:       {label:'LY Healthy Orders', desc:'Last year healthy order count for this slot',                          unit:'#'},
  ly_unhealthy_cnt:     {label:'LY Unhealthy Orders',desc:'Last year unhealthy order count for this slot',                      unit:'#'},
};

export { DEFAULT_TARGETS, DEFAULT_MODEL_ASSIGNMENTS, MODEL_ASSIGNMENT_KEY, DEF_SETTINGS, AE_DI_PARAMS, MODEL_CODE_LABELS, STORE_COORDS, STORE_NAMES, sName, sNameC, DOW_BASE, STORE_KB, STORE_KB_EDIT_KEY, getKBEdits, saveKBEdits, getKB, EVENT_TYPES, EVENT_TYPE_GROUPS, INV_ORG_COORDS, fetchOpenMeteoWeather, getStoreOrg, QSR_DAR_FIELDS, VLH_DT_TYPES, VLH_IN_STORE, VLH_KITCHEN, VLH_GUIDE };
