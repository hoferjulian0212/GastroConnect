// Pluralization of (German) product unit names for quantity displays.
//
// Units are stored as free-text German words (e.g. "Kiste", "Flasche", "kg").
// When a quantity greater than 1 is shown together with its unit, the unit
// should appear in the plural ("13 Kisten" instead of "13 Kiste").
//
// IMPORTANT: only use this for QUANTITY displays (a count of N units).
// Do NOT use it for per-unit / price-rate displays like "4,50 €/Kiste" or
// "pro Kiste" — those stay singular.

const UNIT_PLURALS: Record<string, string> = {
  // feminine containers / countables → real plural
  Flasche: "Flaschen",
  Kiste: "Kisten",
  Dose: "Dosen",
  Schale: "Schalen",
  Packung: "Packungen",
  Tube: "Tuben",
  Tasse: "Tassen",
  Palette: "Paletten",
  Rolle: "Rollen",
  Kanne: "Kannen",
  Portion: "Portionen",
  Einheit: "Einheiten",
  // masculine / neuter countables with -s or umlaut plural
  Karton: "Kartons",
  Sack: "Säcke",
  Topf: "Töpfe",
  Glas: "Gläser",
  // invariant measure words (kept singular by listing them explicitly so the
  // intent is clear and they never accidentally get an -s)
  Stück: "Stück",
  Beutel: "Beutel",
  Kanister: "Kanister",
  Eimer: "Eimer",
  Bund: "Bund",
  Paar: "Paar",
  // metric units never change
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  Liter: "Liter",
  Litri: "Litri",
};

/**
 * Returns the plural form of a unit when `quantity` is greater than 1.
 * Falls back to the original unit for quantity === 1 or unknown units.
 * Uses plural for 0 (German convention: "0 Kisten", not "0 Kiste").
 */
export function pluralizeUnit(unit: string | null | undefined, quantity: number): string {
  const u = (unit ?? "").trim();
  if (!u) return u;
  if (quantity === 1) return u;
  return UNIT_PLURALS[u] ?? u;
}
