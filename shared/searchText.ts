// Umlaut-insensitive search matching shared by client and server.
//
// German users often type "oe" instead of "ö", "ae" instead of "ä",
// "ue" instead of "ü" and "ss" instead of "ß" — and product/company data
// mixes both spellings too. Folding BOTH the query and the haystack to the
// ASCII digraph form ("ö" -> "oe", …) makes "Broetchen" match "Brötchen"
// and "Brötchen" match "Broetchen".

export function foldSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

// Convenience predicate: does `haystack` contain `query`, ignoring case and
// umlaut spelling? Empty queries match everything; null/undefined haystacks
// match nothing.
export function searchIncludes(
  haystack: string | null | undefined,
  query: string,
): boolean {
  if (!query) return true;
  if (!haystack) return false;
  return foldSearchText(haystack).includes(foldSearchText(query));
}
