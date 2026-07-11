import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import { foldSearchText } from "@shared/searchText";

// Umlaut-insensitive ILIKE for Postgres. Folds both the column value and the
// user's query to the ASCII digraph form ("ö" -> "oe", "ä" -> "ae",
// "ü" -> "ue", "ß" -> "ss") so that "Broetchen" finds "Brötchen" and vice
// versa. LIKE wildcards in the user input are escaped.
export function foldedIlike(column: AnyColumn | SQL, query: string): SQL {
  const folded = foldSearchText(query).replace(/[\\%_]/g, (m) => "\\" + m);
  const pattern = `%${folded}%`;
  return sql`replace(replace(replace(replace(lower(${column}), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss') LIKE ${pattern} ESCAPE '\\'`;
}
