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

LifeLenz DAR backfill for the QSRSoft compliance-pause gap (added 2026-11-27)
------------------------------------------------------------------------------
`qsrsoft-dar-pull.yml` (which feeds `qsr_daily_activity_rollup`) has been schedule-paused since
2026-11-16 (QSRSoft Operator Security Notice compliance triage -- CLAUDE.md). Rather than widen
that exposure with a manual catch-up run of the same credential-login scraper, any trailing day
missing from `qsr_daily_activity_rollup` for a store is filled from `lifelenz_dar` -- a separate,
non-QSRSoft-credential vendor API that has stayed fresh through the pause and is already the
app's own documented fallback for these fields (`memory/finding-lifelenz-dar-schema-2026-11-17.md`
Phase 3/4). LifeLenz's `net_sales` is the SAME basis as QSRSoft's `product_sales` (measured
28-store/1-day: -0.04% diff, essentially exact); `transactions` runs +1.86% high (measured, same
source) -- both within the error bar this workbook already carries elsewhere. Only days with NO
row at all in `qsr_daily_activity_rollup` are filled this way; a real QSRSoft row is never
overridden. The LY (364-day-back) comparison leg for a backfilled day is NOT taken from LifeLenz
(which has no history that far back) -- it's the store's own real `product_sales`/`transactions`
from the matching date a year earlier, which predates the pause and is unaffected by it.

Monthly comps use genuine calendar-to-calendar sums, not the `ly_` shadow fields
----------------------------------------------------------------------------------
`ly_product_sales`/`ly_transactions` in qsr_daily_activity_rollup are 364-day-back (52-week,
weekday-preserving) matches, not calendar-year-back matches -- confirmed 2026-09-11 by tracing
individual days (Dec 24 2025, a Wednesday, matches to Dec 25 2024, also a Wednesday --
Christmas Day). That's the right, standard convention for a WEEKLY comparison (Block 1's 13
weekly comps and Block 3's guest-count L6W/L2W both correctly use it, via week_sum), but it's
wrong for a MONTHLY one: any calendar month whose boundary sits inside the fixed Dec 24-Jan 1
holiday cluster pairs a normal day this year against a near-zero (or unrelated) holiday day
last year. Measured impact when Block 2/3's monthly comps first used the `ly_` field for a
calendar-month sum: December came out +5.2pp too high on AVERAGE across 26 of 27 stores,
against the owner's own confirmed-correct September 2026 workbook.

Fix (owner's own suggestion, 2026-09-11): for every MONTHLY comp (Block 2, and Block 3's
forecast-month LY comp), sum each store's own `product_sales` independently over the current
calendar month AND over the same calendar month one year earlier (month_own_sum/month_comp
below) -- no `ly_` field involved at all. Re-validated against the confirmed-correct workbook
after the fix: every one of 308 store-months, December included, landed within ~0.1pp (down
from up to +7pp on December specifically). This is strictly more accurate for all 12 months,
not just a December patch.

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


def fetch_lifelenz_dar_rows(base_url, key, since_iso):
    """All lifelenz_dar rows with dt >= since_iso, paginated. Hourly grain (one row per
    (loc, start_time)) -- summed to daily per (loc, dt) by the caller, same straight-sum
    methodology as the app's own aggregateLifelenzDarDaily() (src/engine/lifelenz-dar-daily.js)."""
    rows = []
    page = 0
    page_size = 1000
    fields = 'loc,dt,net_sales,transactions'
    while True:
        offset = page * page_size
        url = (f"{base_url}/rest/v1/lifelenz_dar"
               f"?select={fields}&dt=gte.{quote(since_iso)}"
               f"&order=dt.asc&order=loc.asc&offset={offset}&limit={page_size}")
        req = urllib.request.Request(url, headers={
            'apikey': key, 'Authorization': f'Bearer {key}',
        })
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        rows.extend(data)
        if len(data) < page_size:
            break
        page += 1
    return rows


def aggregate_lifelenz_daily(rows):
    """{loc: {dt_str: {'product_sales': sum(net_sales), 'transactions': sum(transactions)}}} --
    loc unpadded to match qsr_daily_activity_rollup's convention."""
    out = {}
    for r in rows:
        loc = str(int(r['loc']))
        dt_str = r['dt']
        bucket = out.setdefault(loc, {}).setdefault(dt_str, {'product_sales': 0, 'transactions': 0})
        bucket['product_sales'] += r['net_sales'] or 0
        bucket['transactions'] += r['transactions'] or 0
    return out


# ── Date / aggregation math ─────────────────────────────────────────────────────────────────

def add_days(d, n):
    return d + datetime.timedelta(days=n)


def backfill_from_lifelenz(by_loc_dt, lifelenz_daily):
    """Fill any (loc, dt) that qsr_daily_activity_rollup has NO row for at all, using LifeLenz's
    daily-aggregated net_sales/transactions as a same-basis stand-in for product_sales/
    transactions (see module docstring). Never touches a (loc, dt) that already has a real
    QSRSoft row. The LY (364-day-back) leg is read from the store's own REAL historical row
    (by_loc_dt), not from LifeLenz, which has no data that far back -- that historical row
    predates the compliance pause and is unaffected by it. Returns the sorted list of
    (loc, dt_str) pairs actually filled, for logging/audit."""
    filled = []
    for loc, by_dt in lifelenz_daily.items():
        real_days = by_loc_dt.get(loc, {})
        for dt_str, agg in by_dt.items():
            if dt_str in real_days:
                continue  # a real QSRSoft row exists for this day -- never override it
            d = datetime.date.fromisoformat(dt_str)
            ly_row = real_days.get(add_days(d, -364).isoformat())
            by_loc_dt.setdefault(loc, {})[dt_str] = {
                'product_sales': agg['product_sales'],
                'transactions': agg['transactions'],
                'ly_product_sales': (ly_row or {}).get('product_sales'),
                'ly_transactions': (ly_row or {}).get('transactions'),
            }
            filled.append((loc, dt_str))
    filled.sort()
    return filled


def compute(rows, today, forecast_year, forecast_month, lifelenz_daily=None):
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

    lifelenz_filled = backfill_from_lifelenz(by_loc_dt, lifelenz_daily or {})
    if lifelenz_filled:
        gap_locs = sorted({loc for loc, _ in lifelenz_filled}, key=int)
        gap_lo = min(dt for _, dt in lifelenz_filled)
        gap_hi = max(dt for _, dt in lifelenz_filled)
        log(f"Backfilled {len(lifelenz_filled)} (loc,dt) gap(s) from LifeLenz DAR "
            f"({gap_lo}..{gap_hi}, {len(gap_locs)} store(s)) -- product_sales/transactions only, "
            f"approximated via LifeLenz net_sales/transactions (see module docstring for the "
            f"measured ±bias). Not a QSRSoft row; no store/date left silently blank.")

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

    def month_own_sum(loc, y, m):
        """This store's OWN recorded sales for a genuine calendar month -- not QSRSoft's `ly_`
        shadow field. A calendar MONTH comparison must diff two independently-summed calendar
        months, not lean on a 364-day/52-week matched-weekday field: that field is right for a
        week-to-week comparison (see week_sum), but pairs the wrong specific days once a
        calendar-month boundary crosses the fixed Dec 24-Jan 1 holiday cluster. Measured
        2026-09-11: relying on `ly_product_sales` for a calendar-month sum put December +5.2pp
        off (26/27 stores) against a confirmed-correct value; this two-sided calendar sum
        matches it to within 0.05pp, and every other month to within ~0.1pp (down from
        ~0.2-1.8pp of pre-existing noise) -- so this is strictly the more accurate method for
        BOTH the anomalous and the previously "fine" months. See
        memory/finding-dar-ly-holiday-mismatch-2026-09-11.md.
        """
        prefix = f"{y}-{m:02d}-"
        sales = trans = n = 0
        for dt_str, row in by_loc_dt.get(loc, {}).items():
            if not dt_str.startswith(prefix):
                continue
            sales += row['product_sales'] or 0
            trans += row['transactions'] or 0
            n += 1
        return sales, trans, n

    def month_comp(loc, y, m, min_days=25):
        cur_sales, _, cur_n = month_own_sum(loc, y, m)
        ly_sales, _, ly_n = month_own_sum(loc, y - 1, m)
        if cur_n < min_days or ly_n < min_days or ly_sales <= 0:
            return None
        return cur_sales / ly_sales - 1

    out = {'weekEndings': [w.isoformat() for w in week_endings], 'months': months, 'locs': locs,
           'weekly': {}, 'monthly': {}, 'lyMonth': {}, 'gcL6W': {}, 'gcL2W': {}}

    for loc in locs:
        weekly = []
        for we in week_endings:
            sales, ly_sales, _, _, n = week_sum(loc, we)
            weekly.append(sales / ly_sales - 1 if ly_sales > 0 else None)
        out['weekly'][loc] = weekly

        out['monthly'][loc] = [month_comp(loc, y, m) for (y, m) in months]

        out['lyMonth'][loc] = month_comp(loc, forecast_year - 1, forecast_month)

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


def detect_loc_formula_col(sheet_xml):
    """The per-store data rows in each Data Input block key off a column-A formula referencing
    'Table 1 (2)' (its own store-number column) -- e.g. 'Table 1 (2)'!AJ3. That column letter is
    NOT stable across workbook revisions: it shifted from AJ to AK between the workbook versions
    seen 2026-09-11 and 2026-11-27 (the owner added/removed a column in 'Table 1 (2)' upstream of
    it), which broke this script's old hardcoded 'AJ' match outright (ValueError, no silent wrong
    data -- the fail-closed behavior is what caught this). Detect the real column letter from the
    sheet itself instead of hardcoding one, so a future shift doesn't require another manual patch."""
    m = re.search(r"<c r=\"A\d+\"[^>]*><f>'Table 1 \(2\)'!([A-Z]+)\d+</f>", sheet_xml)
    if not m:
        raise ValueError("no column-A formula referencing 'Table 1 (2)' found anywhere in the sheet "
                          "-- the per-store row structure may have changed more than just the column letter")
    return m.group(1)


def resolve_block_starts(sheet_xml, shared_strings, loc_col):
    """Return {label: first_row_of_per-store_data} for the three Data Input blocks, found by
    matching each block's header text against sharedStrings, then finding the row containing
    that string index, then walking forward to the first row whose A-cell formula matches
    'Table 1 (2)'!<loc_col><n> (the first per-store data row of that block)."""
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
        # walk forward to the first `'Table 1 (2)'!<loc_col>` formula row
        for r in range(header_row + 1, header_row + 6):
            if re.search(r'<row r="' + str(r) + r'"[^>]*><c r="A' + str(r) + r'"[^>]*><f>\'Table 1 \(2\)\'!' + loc_col, sheet_xml):
                starts[key] = r
                break
        if key not in starts:
            raise ValueError(f'no per-store data row found after header row {header_row} for {needle!r}')
    return starts


def read_block_rows(sheet_xml, first_row, loc_col):
    """Return [(row, loc_or_None), ...] for every per-store row in a block, starting at
    first_row, until a row whose A-cell has no 'Table 1 (2)' reference at all (the true end of
    the block). A row is included with loc=None, not treated as the end, when its A-cell DOES
    reference 'Table 1 (2)' but as a broken #REF! formula -- confirmed 2026-11-27: the workbook
    keeps a placeholder row for 18213 (the relocated/superseded Lindsay store, replaced by
    44689) at a fixed position in every block, and its 'Table 1 (2)' column got deleted at some
    point, turning a once-valid 'Table 1 (2)'!<col><n> reference into '#REF!'. The OLD version of
    this function (count_loc_rows, a simple count-while-matching loop) stopped dead the instant it
    hit that one broken row, undercounting every block by however many real stores sat beyond it
    (11 of 28 here) -- a silent, serious bug: it didn't crash, it just silently wrote live data
    into the wrong rows for 16 real stores, matching the owner's live data list to the WRONG row
    positions.
    A row's real store number is read directly from its own cached <v> (e.g. 3708), not inferred
    from position in a separately-sorted list of live locs -- this is what makes it fault-tolerant
    to a gap like this one without needing to know in advance how many gaps exist or where."""
    out = []
    r = first_row
    while True:
        row_m = re.search(r'<row r="' + str(r) + r'"[^>]*><c r="A' + str(r) + r'"([^>]*)>(.*?)</c>', sheet_xml, re.DOTALL)
        if not row_m:
            break
        a_attrs, a_body = row_m.group(1), row_m.group(2)
        if f"'Table 1 (2)'!{loc_col}" in a_body:
            v_m = re.search(r'<v>(\d+)</v>', a_body)
            if not v_m:
                raise ValueError(f"row {r}: found a valid 'Table 1 (2)'!{loc_col} formula but no cached numeric <v> to read the store number from")
            out.append((r, v_m.group(1)))
        elif "'Table 1 (2)'!#REF!" in a_body:
            out.append((r, None))
        else:
            break
        r += 1
    return out


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
        loc_col = detect_loc_formula_col(sheet_xml)
        starts = resolve_block_starts(sheet_xml, shared_strings, loc_col)
        block_rows = {key: read_block_rows(sheet_xml, starts[key], loc_col) for key in starts}
        log(f"Data Input sheet: {sheet_path}")
        log(f"'Table 1 (2)' loc-formula column: {loc_col}")
        for key, rows in block_rows.items():
            real = [loc for _, loc in rows if loc is not None]
            placeholders = len(rows) - len(real)
            log(f"{key}: starts row {starts[key]}, {len(rows)} total rows ({len(real)} real stores, "
                f"{placeholders} placeholder/#REF! row(s) left untouched)")

        for key, rows in block_rows.items():
            missing = [loc for _, loc in rows if loc is not None and loc not in data['locs']]
            if missing:
                log(f"⚠️  NOTE: {key} has real store row(s) for loc(s) {missing} with no matching "
                    f"live data -- those rows will be left untouched, not zeroed out.")

        COL13 = list("BCDEFGHIJKLMN")
        COL12 = list("BCDEFGHIJKLM")

        xml = sheet_xml
        xml = set_text(xml, 'B3', forecast_label)

        for i, we in enumerate(data['weekEndings']):
            y, m, d = (int(x) for x in we.split('-'))
            serial = (datetime.date(y, m, d) - EPOCH).days
            xml = set_numeric(xml, COL13[i] + '7', serial)

        for row, loc in block_rows['block1']:
            if loc is None or loc not in data['weekly']:
                continue
            for j, comp in enumerate(data['weekly'][loc]):
                xml = set_numeric(xml, COL13[j] + str(row), comp)

        for i, (y, m) in enumerate(data['months']):
            label = f"{MONTH_ABBR[m-1]}-{str(y)[2:]}"
            xml = set_text(xml, COL12[i] + str(starts['block2'] - 2), label)  # header row = block2 start - 2

        for row, loc in block_rows['block2']:
            if loc is None or loc not in data['monthly']:
                continue
            for j, comp in enumerate(data['monthly'][loc]):
                xml = set_numeric(xml, COL12[j] + str(row), comp)

        for row, loc in block_rows['block3']:
            if loc is None or loc not in data['lyMonth']:
                continue
            xml = set_numeric(xml, 'B' + str(row), data['lyMonth'][loc])
            xml = set_numeric(xml, 'C' + str(row), data['gcL6W'][loc])
            xml = set_numeric(xml, 'D' + str(row), data['gcL2W'][loc])

        # Read every original part into memory NOW, before writing anything -- output_path may be
        # the SAME file as input_path (the documented default: "defaults to overwriting --input").
        # Opening a 'w' ZipFile on that path truncates the file on disk immediately; the old code
        # kept lazily calling zin.read() on other parts AFTER that truncation, which raised
        # `zipfile.BadZipFile: Truncated file header` (reproduced 2026-09-14 running exactly the
        # documented no-`--output` invocation -- this is almost certainly the "did not work
        # properly" the owner hit, not a usage mistake). Capturing every part's bytes here, while
        # zin is still backed by the untouched original file, avoids the self-clobber. It also
        # gives verify_roundtrip a true pre-write snapshot to diff against even when
        # output_path == input_path, where re-reading input_path afterward would just compare the
        # new file to itself and silently prove nothing.
        original_parts = {item.filename: (item, zin.read(item.filename)) for item in zin.infolist()}

    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
        for filename, (item, content) in original_parts.items():
            if filename == sheet_path:
                content = xml.encode()
            zi = zipfile.ZipInfo(filename, date_time=item.date_time)
            zi.compress_type = item.compress_type
            zi.external_attr = item.external_attr
            zout.writestr(zi, content)

    verify_roundtrip(original_parts, output_path, sheet_path)


def verify_roundtrip(original_parts, output_path, sheet_path):
    with zipfile.ZipFile(output_path) as zout:
        names_in, names_out = set(original_parts.keys()), set(zout.namelist())
        if names_in != names_out:
            raise AssertionError(f"part list changed! missing={names_in-names_out} extra={names_out-names_in}")
        changed = [n for n in names_in if n != sheet_path and original_parts[n][1] != zout.read(n)]
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

    # Block 2's oldest month (M-12) and Block 3's forecast-month LY-comp both now need their OWN
    # calendar-matched prior year fetched too (see month_comp) -- roughly 2 years back from
    # whichever of "today" or the forecast month is earlier, plus a day-count buffer.
    closed_m, closed_y = today.month - 1, today.year
    if closed_m == 0:
        closed_m, closed_y = 12, closed_y - 1
    m12_m, m12_y = closed_m - 11, closed_y
    while m12_m <= 0:
        m12_m += 12
        m12_y -= 1
    since = min(
        datetime.date(m12_y - 1, m12_m, 1),
        datetime.date(fy - 2, fm, 1),
        add_days(today, -400),
    )
    log(f"Fetching qsr_daily_activity_rollup from {since.isoformat()} through {today.isoformat()}...")
    rows = fetch_rollup_rows(base_url, key, since.isoformat())
    log(f"Pulled {len(rows)} rows.")

    # LifeLenz DAR only needs to cover the trailing gap (qsr_daily_activity_rollup's pause started
    # 2026-11-16; lifelenz_dar has no history before 2026-11-17 anyway), not the full ~2-year
    # `since` window -- a short fixed lookback keeps this fetch cheap regardless of how far back
    # `since` reaches for the monthly/LY comps above.
    ll_since = add_days(today, -30)
    log(f"Fetching lifelenz_dar from {ll_since.isoformat()} through {today.isoformat()} "
        f"(gap-fill source, not a primary source)...")
    lifelenz_rows = fetch_lifelenz_dar_rows(base_url, key, ll_since.isoformat())
    lifelenz_daily = aggregate_lifelenz_daily(lifelenz_rows)
    log(f"Pulled {len(lifelenz_rows)} lifelenz_dar rows ({sum(len(v) for v in lifelenz_daily.values())} store-days).")

    data = compute(rows, today, fy, fm, lifelenz_daily)

    forecast_label = f"{MONTH_ABBR[fm-1]}-{fy}"
    log(f"Patching {args.input} -> {output} for forecast month {forecast_label}...")
    patch_workbook(args.input, output, data, forecast_label)
    log("Done.")


if __name__ == '__main__':
    main()
