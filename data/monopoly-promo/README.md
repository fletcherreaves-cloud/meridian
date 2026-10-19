# Monopoly Promotion Reference

`2026_McD_Monopoly_ExecutionManual_OTC.pdf` — McDonald's USA, LLC's official 2026 US
MONOPOLY Game Piece Card Restaurant Execution Manual. Owner-supplied reference material for
the Oklahoma paper-cost price-vs-controls investigation
(`memory/project-ok-paper-cost-price-vs-controls.md` section 4), which found the recurring
annual Monopoly promotion marks up two packaging items (hash brown bag, 6oz fry carton) at
roughly 2.3–2.5x their regular rate.

Key facts this document confirms, cross-checked against the live `qsr_ebos_line_items` data:

- **Official 2026 program dates**: themed A/B/C bag packaging begins 9/29/26; all other themed
  packaging (McMuffin wrap, biscuit wrap, QPC, Big Mac, 20oz hot cup, 30oz cold cup, 10pc
  nugget carton) begins 10/6/26; Game Piece Card distribution runs **10/6/26 – 11/1/26**
  (while supplies last) — i.e. the promotion's purchasing impact extends about two weeks past
  this analysis's 10/18/26 measurement cutoff, so the dollar figures in the memory file are a
  partial-window snapshot, not the full-promotion total.
- **WRINs match exactly**: the manual's "Themed Only Packaging Element" table (page 13) lists
  A Bag 100% Recyclable = WRIN 10958-962, B Bag 100% Recyclable = WRIN 13229-666, C Bag 100%
  Recyclable = WRIN 15849-199 — all three match the live ledger exactly, independently
  confirming the dataset and the per-store paired-ratio methodology used in the memory file.
- **Hash Browns and (Large) Fries are official program items**, not a vendor-side anomaly: page
  7's "Packaging Products" table (the list of purchases that trigger a Game Piece Card) names
  Hash Browns, Large Fries, 4pc Strips, 10pc Nuggets, McMuffin, Biscuit, QPC, Big Mac, and Large
  Cold Cup/Soft Drink explicitly. The page-6/14 packaging-WRIN tables aren't exhaustive — they
  don't itemize every trigger product's specific packaging WRIN — so the hash-brown-bag and
  6oz-fry-carton WRINs found live but absent from those two tables are still a legitimate part
  of the national program, not an unofficial local substitution.
