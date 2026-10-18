# Equipment Survey Data

Raw equipment reference material for the Equipment Profile project
(see `memory/project-equipment-profile.md`): McDonald's Planned
Maintenance cards, manufacturer-specific equipment resource sheets,
and a 2026 PM calendar, covering fryers, grills, toasters/steamers,
UHC, beverage/McCafe equipment, blended ice, combi ovens, prep lines,
and the simplified-breakfast staging cabinet.

## `qr-code-inventory.json`

113 unique QR codes decoded from the PDFs and images in this folder
(scanned 2026-10-18 — every PDF rendered page-by-page at 200 DPI and
checked with OpenCV's QR detector). Each entry: `source_file`, `page`,
the decoded `url`, and an inferred `manufacturer` from the URL's
domain. Most QR codes resolve to a manufacturer microsite keyed to a
specific equipment model (e.g. Taylor's `tcmcd.co/C835`, Frymaster's
`frymaster.com/QR-Codes/McD-s-BIELA14-T`) — the trailing path segment
is usually the manufacturer's own model code, directly useful for the
Equipment Profile catalog's manufacturer/model dropdown.

**Resolved 2026-10-18** (once network access was granted): each entry
now also has a `resolved` object — `final_url` (after redirects, which
also resolves the short-link services like `l.ead.me`/`qrs.ly`/`tiny.cc`
to their real destination), `title` (the page's `<title>`), and
`description` (its meta description, where present). 44 of 113 resolved
to a real `title` (e.g. "Universal Holding Cabinet Touch (UHCTHD) |
Frymaster"); the other 69 fetched successfully (no HTTP/network error)
but returned no `<title>` in the raw HTML — likely JS-rendered
microsites whose real content only appears after the page's own script
runs, which a plain `curl` fetch doesn't execute. Those would need a
headless-browser fetch (Playwright) to pull their real content.

## `Floor Plans/`

Real store layout material for the visual floor-plan placement feature:

- **`K-SHEETS.pdf`** (4 pages) — an architectural kitchen equipment
  layout drawing ("K-sheet"): symbol legend, equipment item numbers,
  hood/exhaust and utility routing callouts tied to specific floor
  positions. This is a real, large-format (24"x36") drawing sheet, not
  a simplified diagram — useful as source material for a simplified
  floor-plan template, not necessarily pinnable as-is.
- **`2026 Specialty Beverage Equipment & Technology Playbook.pdf`**
  (54 pages) — covers beverage-station build types (CBB, BDAP,
  Parallel CBB Cell, In-Store/Non-DT, Gas Station/Oil Alliance), each
  with its own "Current Restaurant Layout" section, equipment
  installation notes, a technology overview, and required/optional
  equipment lists. Its "Detailed Plans/Layouts" section (pages 28+)
  has real per-layout-type floor plans for beverage equipment
  specifically.

Owner note (2026-10-18): more documents like these may follow.

## `Reference Guides/`

- **`Grill_Toaster_Release_Sheets-Belts_Reference_Guide.pdf`** (4 pages,
  updated 1/6/2024) — the core cross-reference for the Equipment Profile
  project's actual purpose: a real WRIN table mapping specific grill/
  toaster models (Garland MWE9801/MWE9501, Taylor 11/12/15/69/22/22E/32/35,
  Taylor Intelli-Gap 832/835/842/845, Taylor NextGen C850-C860, Garland
  NextGen/MWE3W/MWG3W/MWE3S) to the correct upper/lower release sheet WRIN
  for each, plus a previous→new WRIN transition table. The Taylor model
  codes here (C835, C842, C845, C850-860, etc.) match the same codes
  found in the `qr-code-inventory.json` QR-code URLs from Taylor's
  `tcmcd.co` microsite — the two sources cross-reference each other.
