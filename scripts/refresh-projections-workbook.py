#!/usr/bin/env python3
"""Refresh the owner's personal "Restaurant Projections" .xlsm for a new forecast month.

Not part of the deployed app or CI -- a personal utility that re-runs the same manual process
a Claude Code session did by hand for the October 2026 workbook (2026-09-11). The workbook
itself is NOT committed to this repo (it's the owner's local working file); this script is.

What it does
------------
Pulls real sales data from Meridian's own `qsr_daily_activity_rollup` table (the same
auto-synced DAR rollup the app's own sales tiles use -- no QSRSoft re-export needed) and
refreshes ONLY the "Data Input" sheet's data cells:
  - B3                  "Month being forecast:" label
  - Block 1 (rows found dynamically, cols B:N)   13 weekly (Wed-Tue) comp %s per store
  - Block 2 (rows found dynamically, cols B:M)   12 monthly comp %s per store + month labels
  - Block 3 (rows found dynamically, cols B:D)   LY comp % for the forecast month + guest-count
                                                  comp % L6W/L2W per store

"Assumptions" and "Sales Fcst Calc" need no edits -- they already pull from Data Input.

Every other byte in the file (VBA macros, all per-DM chart tabs, the embedded logo, the
"Table 1 (2)" Excel Table, defined names) is left untouched. This is deliberate: a full
read/write round-trip through openpyxl OR SheetJS was tested against this exact file on
2026-09-11 and BOTH silently drop all 15 chart drawings + the embedded image + (SheetJS also)
the Table object. So this script edits the target worksheet's raw XML in place inside the
zip archive and repackages every other part byte-for-byte identical -- verified after every
run (see verify_roundtrip below).

Known caveat -- READ BEFORE TRUSTING DECEMBER'S NUMBER
--------------------------------------------------------
`ly_product_sales` in qsr_daily_activity_rollup is a 364-day-back (52-week, weekday-
preserving) match, not a calendar-year-back match -- confirmed 2026-09-11 by tracing
individual days (Dec 24 2025, a Wednesday, matches to Dec 25 2024, also a Wednesday --
Christmas Day). That's the right choice for an ordinary week, but it means any month whose
calendar boundary sits inside the fixed Dec 24-Jan 1 holiday cluster pairs a normal day this
year against a near-zero (or an unrelated) holiday day last year. Measured impact: December's
calendar-month comp came out +5.2pp too high on AVERAGE, across 26 of 27 stores, when checked
against the owner's own confirmed-correct September 2026 workbook. Every other month checked
was within ~0.2-1.8pp (ordinary noise between this rollup's methodology and whatever exact
QSRSoft export basis the number was originally checked against). This script prints a loud
warning whenever December falls inside the 12-month Block 2 window or is the forecast-month's
LY-comp lookup -- cross-check that one column by hand before trusting it. Nothing else in the
workbook is affected; do not generalize this into distrust of the other 11 months.

Usage
-----
    SUPABASE_SERVICE_ROLE_KEY=... VITE_SUPABASE_URL=... \\
        python3 scripts/refresh-projections-workbook.py \\
            --input "/path/to/Month_YYYY__Restaurant_Projections....xlsm" \\
            --forecast-month 2026-11 \\
            [--output /path/to/output.xlsm]   # defaults to overwriting --input
            [--today 2026-11-03]              # defaults to real today; mainly for testing

Requires only the Python stdlib -- no pip install.
"""
import argparse
import datetime
import json
import re
import sys
import urllib.request
import zipfile
from urllib.parse import quote

MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
EPOCH = datetime.date(1899, 12, 30)  # Excel serial-date epoch


def log(*a):
    print(*a, file=sys.stderr)


# ── Supabase fetch ──────────────────────────────────────────────────────────────────────────

def fetch_rollup_rows(base_url, key, since_iso):
    """All qsr_daily_activity_rollup rows with dt >= since_iso, paginated."""
    rows = []
    page = 0
    page_size = 1000
    fields = 'loc,dt,product_sales,transactions,ly_product_sales,ly_transactions'
    while True:
        offset = page * page_size
        url = (f"{base_url}/rest/v1/qsr_daily_activity_rollup"
               f"?select={fields}&dt=gte.{quote(since_iso)}"
               f"&order=dt.asc&order=loc.asc&offset={offset}&limit={page_size}")
        req = urllib.request.Request(url, headers={
            'apikey': key, 'Authorization': f'Bearer {key}',
        })
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        rows.extend(data)
        log(f"  page {page}: {len(data)} rows (total {len(rows)})")
        if len(data) < page_size:
            break
        page += 1
    return rows


# ── Date / aggregation math ─────────────────────────────────────────────────────────────────

def add_days(d, n):
    return d + datetime.timedelta(days=n)


def compute(rows, today, forecast_year, forecast_month):
    for r in rows:
        r['loc'] = str(int(r['loc']))  # strip zero-padding

    # last complete business week (Wed-Tue) ending on/before today
    last_tue = today
    while last_tue.weekday() != 1:  # Monday=0 .. Tuesday=1
        last_tue -= datetime.timedelta(days=1)
    week_endings = [add_days(last_tue, -7 * i) for i in range(12, -1, -1)]

    # most recently CLOSED calendar month
    closed_y, closed_m = today.year, today.month - 1
    if closed_m == 0:
        closed_m, closed_y = 12, closed_y - 1
    months = []
    for i in range(11, -1, -1):
        y, m = closed_y, closed_m - i
        while m <= 0:
            m += 12
            y -= 1
        months.append((y, m))

    locs = sorted({r['loc'] for r in rows}, key=int)

    by_loc_dt = {}
    for r in rows:
        by_loc_dt.setdefault(r['loc'], {})[r['dt']] = r

    def week_sum(loc, week_end):
        start = add_days(week_end, -6)
        sales = ly_sales = trans = ly_trans = n = 0
        d = start
        drows = by_loc_dt.get(loc, {})
        while d <= week_end:
            row = drows.get(d.isoformat())
            if row:
                sales += row['product_sales'] or 0
                ly_sales += row['ly_product_sales'] or 0
                trans += row['transactions'] or 0
                ly_trans += row['ly_transactions'] or 0
                n += 1
            d = add_days(d, 1)
        return sales, ly_sales, trans, ly_trans, n

    def month_sum(loc, y, m):
        prefix = f"{y}-{m:02d}-"
        sales = ly_sales = trans = ly_trans = n = 0
        for dt_str, row in by_loc_dt.get(loc, {}).items():
            if not dt_str.startswith(prefix):
                continue
            sales += row['product_sales'] or 0
            ly_sales += row['ly_product_sales'] or 0
            trans += row['transactions'] or 0
            ly_trans += row['ly_transactions'] or 0
            n += 1
        return sales, ly_sales, trans, ly_trans, n

    out = {'weekEndings': [w.isoformat() for w in week_endings], 'months': months, 'locs': locs,
           'weekly': {}, 'monthly': {}, 'lyMonth': {}, 'gcL6W': {}, 'gcL2W': {}}

    for loc in locs:
        weekly = []
        for we in week_endings:
            sales, ly_sales, _, _, n = week_sum(loc, we)
            weekly.append(sales / ly_sales - 1 if ly_sales > 0 else None)
        out['weekly'][loc] = weekly

        monthly = []
        for (y, m) in months:
            sales, ly_sales, _, _, n = month_sum(loc, y, m)
            monthly.append(sales / ly_sales - 1 if ly_sales > 0 else None)
        out['monthly'][loc] = monthly

        ly_year = forecast_year - 1
        sales, ly_sales, _, _, n = month_sum(loc, ly_year, forecast_month)
        out['lyMonth'][loc] = sales / ly_sales - 1 if ly_sales > 0 else None

        t6 = lt6 = t2 = lt2 = 0
        for we in week_endings[-6:]:
            _, _, trans, ly_trans, _ = week_sum(loc, we)
            t6 += trans; lt6 += ly_trans
        for we in week_endings[-2:]:
            _, _, trans, ly_trans, _ = week_sum(loc, we)
            t2 += trans; lt2 += ly_trans
        out['gcL6W'][loc] = t6 / lt6 - 1 if lt6 > 0 else None
        out['gcL2W'][loc] = t2 / lt2 - 1 if lt2 > 0 else None

    return out


def warn_if_december(months, forecast_year, forecast_month):
    hit = [f"{MONTH_ABBR[m-1]}-{str(y)[2:]}" for (y, m) in months if m == 12]
    if forecast_month == 12:
        hit.append(f"forecast-month LY lookup ({MONTH_ABBR[11]}-{str(forecast_year-1)[2:]})")
    if hit:
        log("")
        log("⚠️  WARNING: December falls inside this run's window: " + ", ".join(hit))
        log("    qsr_daily_activity_rollup's ly_product_sales is a 364-day (52-week) matched-")
        log("    weekday comparison, not a calendar-year lookback. That pairing lands ON the")
        log("    fixed Dec 24-Jan 1 holiday cluster for one week each December, which measured")
        log("    +5.2pp average bias (26/27 stores) against a known-correct value on 2026-09-11.")
        log("    Cross-check December's column by hand before trusting it. Every other month")
        log("    is normal (~0.2-1.8pp noise, not a bug).")
        log("")


# ── Workbook surgery ─────────────────────────────────────────────────────────────────────────

def cell_regex(addr):
    return re.compile(r'<c r="' + re.escape(addr) + r'"([^>]*?)(?:/>|>(.*?)</c>)', re.DOTALL)


def get_style(addr, xml_text):
    m = cell_regex(addr).search(xml_text)
    if not m:
        raise ValueError(f"cell {addr} not found in worksheet XML")
    sm = re.search(r's="(\d+)"', m.group(1))
    return sm.group(1) if sm else None


def set_numeric(xml_text, addr, value):
    style = get_style(addr, xml_text)
    new = f'<c r="{addr}" s="{style}"/>' if value is None else f'<c r="{addr}" s="{style}"><v>{value!r}</v></c>'
    xml_text, n = cell_regex(addr).subn(new, xml_text, count=1)
    assert n == 1, f"failed to replace {addr}"
    return xml_text


def set_text(xml_text, addr, text):
    style = get_style(addr, xml_text)
    esc = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    new = f'<c r="{addr}" s="{style}" t="inlineStr"><is><t>{esc}</t></is></c>'
    xml_text, n = cell_regex(addr).subn(new, xml_text, count=1)
    assert n == 1, f"failed to replace {addr}"
    return xml_text


def find_data_input_sheet_path(zin):
    wb_xml = zin.read('xl/workbook.xml').decode()
    m = re.search(r'<sheet name="Data Input"[^>]*r:id="(rId\d+)"', wb_xml)
    if not m:
        raise ValueError('"Data Input" sheet not found in xl/workbook.xml')
    rid = m.group(1)
    rels_xml = zin.read('xl/_rels/workbook.xml.rels').decode()
    m2 = re.search(r'Id="' + re.escape(rid) + r'"[^>]*Target="([^"]+)"', rels_xml)
    if not m2:
        raise ValueError(f'{rid} not found in workbook.xml.rels')
    return 'xl/' + m2.group(1)


def resolve_block_starts(sheet_xml, shared_strings):
    """Return {label: first_row_of_per-store_data} for the three Data Input blocks, found by
    matching each block's header text against sharedStrings, then finding the row containing
    that string index, then walking forward to the first row whose A-cell formula matches
    'Table 1 (2)'!AJ<n> (the first per-store data row of that block)."""
    targets = {
        'block1': 'Block 1 — Weekly Comp % by Store',
        'block2': 'Block 2 — Monthly Comp % by Store',
        'block3': 'Block 3 — Two-Year Stack',
    }
    starts = {}
    for key, needle in targets.items():
        idx = None
        for i, s in enumerate(shared_strings):
            if s.startswith(needle):
                idx = i
                break
        if idx is None:
            raise ValueError(f'shared string starting with {needle!r} not found')
        m = re.search(r'<row r="(\d+)"[^>]*><c r="A\d+"[^>]*t="s"><v>' + str(idx) + r'</v></c>', sheet_xml)
        if not m:
            raise ValueError(f'no cell references shared string {idx} ({needle!r})')
        header_row = int(m.group(1))
        # walk forward to the first `'Table 1 (2)'!AJ` formula row
        for r in range(header_row + 1, header_row + 6):
            if re.search(r'<row r="' + str(r) + r'"[^>]*><c r="A' + str(r) + r'"[^>]*><f>\'Table 1 \(2\)\'!AJ', sheet_xml):
                starts[key] = r
                break
        if key not in starts:
            raise ValueError(f'no per-store data row found after header row {header_row} for {needle!r}')
    return starts


def count_loc_rows(sheet_xml, first_row):
    n = 0
    r = first_row
    while re.search(r'<row r="' + str(r) + r'"[^>]*><c r="A' + str(r) + r'"[^>]*><f>\'Table 1 \(2\)\'!AJ\d+</f>', sheet_xml):
        n += 1
        r += 1
    return n


def parse_shared_strings(zin):
    try:
        xml = zin.read('xl/sharedStrings.xml').decode()
    except KeyError:
        return []
    out = []
    for m in re.finditer(r'<si>(.*?)</si>', xml, re.DOTALL):
        text = ''.join(re.findall(r'<t[^>]*>(.*?)</t>', m.group(1), re.DOTALL))
        out.append(text)
    return out


def patch_workbook(input_path, output_path, data, forecast_label):
    with zipfile.ZipFile(input_path, 'r') as zin:
        sheet_path = find_data_input_sheet_path(zin)
        sheet_xml = zin.read(sheet_path).decode()
        shared_strings = parse_shared_strings(zin)
        starts = resolve_block_starts(sheet_xml, shared_strings)
        n_locs = count_loc_rows(sheet_xml, starts['block1'])
        log(f"Data Input sheet: {sheet_path}")
        log(f"Block starts: {starts}  ({n_locs} store rows)")

        if n_locs != len(data['locs']):
            log(f"⚠️  NOTE: workbook has {n_locs} store rows but live data covered "
                f"{len(data['locs'])} locs -- proceeding row-by-row in file order; a mismatch "
                f"here means a store was added/removed and this script's row<->loc mapping "
                f"should be double-checked against 'Table 1 (2)' column AJ.")

        COL13 = list("BCDEFGHIJKLMN")
        COL12 = list("BCDEFGHIJKLM")

        xml = sheet_xml
        xml = set_text(xml, 'B3', forecast_label)

        for i, we in enumerate(data['weekEndings']):
            y, m, d = (int(x) for x in we.split('-'))
            serial = (datetime.date(y, m, d) - EPOCH).days
            xml = set_numeric(xml, COL13[i] + '7', serial)

        for i, loc in enumerate(data['locs'][:n_locs]):
            row = starts['block1'] + i
            for j, comp in enumerate(data['weekly'][loc]):
                xml = set_numeric(xml, COL13[j] + str(row), comp)

        for i, (y, m) in enumerate(data['months']):
            label = f"{MONTH_ABBR[m-1]}-{str(y)[2:]}"
            xml = set_text(xml, COL12[i] + str(starts['block2'] - 2), label)  # header row = block2 start - 2

        for i, loc in enumerate(data['locs'][:n_locs]):
            row = starts['block2'] + i
            for j, comp in enumerate(data['monthly'][loc]):
                xml = set_numeric(xml, COL12[j] + str(row), comp)

        for i, loc in enumerate(data['locs'][:n_locs]):
            row = starts['block3'] + i
            xml = set_numeric(xml, 'B' + str(row), data['lyMonth'][loc])
            xml = set_numeric(xml, 'C' + str(row), data['gcL6W'][loc])
            xml = set_numeric(xml, 'D' + str(row), data['gcL2W'][loc])

        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                content = zin.read(item.filename)
                if item.filename == sheet_path:
                    content = xml.encode()
                zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
                zi.compress_type = item.compress_type
                zi.external_attr = item.external_attr
                zout.writestr(zi, content)

    verify_roundtrip(input_path, output_path, sheet_path)


def verify_roundtrip(input_path, output_path, sheet_path):
    with zipfile.ZipFile(input_path) as zin, zipfile.ZipFile(output_path) as zout:
        names_in, names_out = set(zin.namelist()), set(zout.namelist())
        if names_in != names_out:
            raise AssertionError(f"part list changed! missing={names_in-names_out} extra={names_out-names_in}")
        changed = [n for n in names_in if n != sheet_path and zin.read(n) != zout.read(n)]
        if changed:
            raise AssertionError(f"unexpected parts changed besides {sheet_path}: {changed}")
    log(f"✓ verified: only {sheet_path} changed, all {len(names_in)} other parts byte-identical")


# ── CLI ──────────────────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--input', required=True)
    ap.add_argument('--output', default=None, help='defaults to overwriting --input')
    ap.add_argument('--forecast-month', required=True, help='YYYY-MM, e.g. 2026-11')
    ap.add_argument('--today', default=None, help='ISO date override, default = real today')
    args = ap.parse_args()

    import os
    base_url = os.environ.get('VITE_SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not base_url or not key:
        log("ERROR: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.")
        sys.exit(1)

    fy, fm = (int(x) for x in args.forecast_month.split('-'))
    today = datetime.date.fromisoformat(args.today) if args.today else datetime.date.today()
    output = args.output or args.input

    # window generous enough for 13wk/12mo/target-month-LY-year, plus its own embedded ly_ shadow
    since = min(add_days(today, -400), datetime.date(fy - 2, fm, 1))
    log(f"Fetching qsr_daily_activity_rollup from {since.isoformat()} through {today.isoformat()}...")
    rows = fetch_rollup_rows(base_url, key, since.isoformat())
    log(f"Pulled {len(rows)} rows.")

    data = compute(rows, today, fy, fm)
    warn_if_december(data['months'], fy, fm)

    forecast_label = f"{MONTH_ABBR[fm-1]}-{fy}"
    log(f"Patching {args.input} -> {output} for forecast month {forecast_label}...")
    patch_workbook(args.input, output, data, forecast_label)
    log("Done.")


if __name__ == '__main__':
    main()
