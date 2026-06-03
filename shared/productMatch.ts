// Shared product-matching helpers used to compare/equate the "same" product
// across suppliers (price comparison, smart substitution, OCR import).
//
// Cross-supplier matching is fundamentally fuzzy because each supplier names
// and packages products differently. We use a barcode (GTIN/EAN) as the
// authoritative key when present, and otherwise fall back to a normalized
// name + unit key that ignores case, accents, punctuation and unit synonyms.

const UNIT_SYNONYMS: Record<string, string> = {
  // weight
  kg: "kg", kilogramm: "kg", kilogram: "kg", kilo: "kg", chilogrammo: "kg", chilo: "kg",
  g: "g", gr: "g", gramm: "g", gram: "g", grammi: "g", grammo: "g",
  mg: "mg",
  // volume
  l: "l", lt: "l", liter: "l", litre: "l", litro: "l", litri: "l",
  ml: "ml", milliliter: "ml", millilitro: "ml",
  cl: "cl",
  // count / packaging
  stk: "stück", stck: "stück", "stück": "stück", stueck: "stück", piece: "stück", pieces: "stück",
  pezzo: "stück", pezzi: "stück", pz: "stück", pc: "stück", pcs: "stück", "st.": "stück",
  bund: "bund", bd: "bund", mazzo: "bund",
  pack: "pack", packung: "pack", pkg: "pack", confezione: "pack", conf: "pack",
  karton: "karton", kart: "karton", box: "karton", cartone: "karton",
  kiste: "kiste", crate: "kiste", cassa: "kiste",
  dose: "dose", can: "dose", lattina: "dose",
  flasche: "flasche", fl: "flasche", bottle: "flasche", bottiglia: "flasche",
  schale: "schale", tray: "schale", vaschetta: "schale",
  beutel: "beutel", bag: "beutel", sacchetto: "beutel",
  glas: "glas", jar: "glas", vasetto: "glas",
};

/** Lowercase, strip diacritics, drop punctuation, collapse whitespace. */
export function normalizeName(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

/** Map a unit string to a canonical token (kg, g, l, stück, ...). */
export function normalizeUnit(unit: string): string {
  const cleaned = (unit || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .trim();
  const reaccented = cleaned === "stuck" ? "stück" : cleaned;
  return UNIT_SYNONYMS[cleaned] || UNIT_SYNONYMS[reaccented] || reaccented;
}

/** Normalize a barcode: keep digits only, ignore obviously-invalid lengths. */
export function normalizeGtin(gtin?: string | null): string | null {
  if (!gtin) return null;
  const digits = gtin.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return null;
  return digits;
}

/**
 * Authoritative grouping key for "the same product across suppliers".
 * Prefers a valid GTIN; otherwise normalized name + unit.
 */
export function productMatchKey(opts: { name: string; unit: string; gtin?: string | null }): string {
  const g = normalizeGtin(opts.gtin);
  if (g) return `gtin:${g}`;
  return `nu:${normalizeName(opts.name)}__${normalizeUnit(opts.unit)}`;
}
