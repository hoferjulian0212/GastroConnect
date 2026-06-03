---
name: Cross-supplier product matching
description: How "same product across suppliers" is matched for price comparison, substitution and OCR import
---

Cross-supplier matching lives in `shared/productMatch.ts` (`normalizeGtin`,
`normalizeName`, `normalizeUnit`, `productMatchKey`). `productMatchKey` returns
`gtin:<digits>` when a valid 8–14 digit barcode exists, else `nu:<name>__<unit>`.

**Rule:** GTIN is authoritative when present, but barcode coverage is partial (the
`gtin` column is new and mostly empty). So matching must try **GTIN first, then fall
back to name+unit** — never rely on `productMatchKey` alone for grouping, because a
product *with* a gtin and one *without* (same name+unit) produce different keys and
would wrongly not match.

**How to apply:** In the OCR import upsert (`server/ocrImport.ts`) lookups are
`byGtin → byArticle → byNameUnit`, where `byNameUnit` is keyed with `gtin` omitted
(`productMatchKey({name, unit, gtin: null})`) precisely so partial-coverage rows still
match. Also keep the in-memory lookup maps updated during the import loop (register
newly-inserted rows) so duplicate rows within a single import update instead of
creating duplicates.

**Note:** Client-side grouping in `PriceComparison.tsx` / `ProductDetail.tsx` still
uses `productMatchKey` directly; if/when barcode coverage grows, that grouping may need
the same partial-coverage fallback (e.g. union-find over gtin + name+unit keys).
