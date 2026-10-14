// @ts-nocheck
export default {version:'5.559', date:'2026-10-14', changes:[
  'Performance Trends -- fixed the sparkline that made October look "horrible" when it wasn\'t. ' +
  'Owner report: "What is the spark line supposed to represent here? It makes it look as though ' +
  'sales were horrible." Root cause: the trend line plotted RAW period totals -- Current MTD ' +
  '("completed days only", always shorter than a full month, e.g. 13 days) next to two FULL ' +
  'calendar months (~30-31 days) -- with no day-count normalization. A 13-day total will nearly ' +
  'always be a smaller raw number than a 30-day total, so the line sloped down and its red/green ' +
  'coloring (which compares the last two points directly) read as "bad" almost every single month, ' +
  'independent of how the business was actually trending.',
  'Fix: engine/trend-report.js\'s computeTrendReport() now returns a `pace` field alongside the ' +
  'existing `combined` -- for a \'sum\' metric (Sales, Guest Count), pace = combined / days-in-' +
  'period, turning every period into a comparable average-$-per-day figure; for a \'rate\' metric ' +
  '(Labor %, FOB %, TPPH, etc.) pace === combined unchanged, since metricRate\'s own Sum/Sum math ' +
  'was already day-count-independent and never had this bug. The headline number and the ' +
  'per-store table both still correctly show the real period total (`combined`, untouched) -- ' +
  'only the sparkline (views/trend-report.js\'s MiniTrend) switched to `pace`. A native SVG ' +
  '<title> tooltip now also says explicitly what the line represents, so this isn\'t silently ' +
  'mis-read as a real decline again.',
  'New regression test renders the real TrendReportPanel with a flat, constant daily sales rate ' +
  'spanning all three periods, switches to the Sales metric, and asserts the sparkline\'s three ' +
  'plotted points land at the same y-coordinate (a flat daily rate must plot as a flat line, not ' +
  'a cliff). Confirmed via a temporary revert that this test genuinely fails on the pre-fix code.',
  'Full suite green (602/602 files, 5635/5635 tests), npm run build clean, within the ' +
  'entry-chunk budget.',
]};
