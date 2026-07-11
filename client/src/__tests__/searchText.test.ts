import { describe, test, expect } from "vitest";
import { foldSearchText, searchIncludes } from "@shared/searchText";

describe("umlaut-insensitive search folding", () => {
  test("folds umlauts and ß to ASCII digraphs", () => {
    expect(foldSearchText("Brötchen")).toBe("broetchen");
    expect(foldSearchText("Käse")).toBe("kaese");
    expect(foldSearchText("Gemüse")).toBe("gemuese");
    expect(foldSearchText("Weißbrot")).toBe("weissbrot");
    expect(foldSearchText("ÄÖÜ")).toBe("aeoeue");
  });

  test('typing "oe" finds "ö" (and ae/ä, ue/ü, ss/ß)', () => {
    expect(searchIncludes("Brötchen", "broetchen")).toBe(true);
    expect(searchIncludes("Käse Gouda", "kaese")).toBe(true);
    expect(searchIncludes("Grünkohl", "gruenkohl")).toBe(true);
    expect(searchIncludes("Weißwein", "weisswein")).toBe(true);
  });

  test('typing the umlaut finds "oe"-spelled data too', () => {
    expect(searchIncludes("Broetchen (Baeckerei Mueller)", "brötchen")).toBe(true);
    expect(searchIncludes("Baeckerei Mueller", "müller")).toBe(true);
  });

  test("plain matching still works, case-insensitive", () => {
    expect(searchIncludes("Tomaten", "toma")).toBe(true);
    expect(searchIncludes("Tomaten", "TOMA")).toBe(true);
    expect(searchIncludes("Tomaten", "gurke")).toBe(false);
  });

  test("empty query matches everything, null haystack matches nothing", () => {
    expect(searchIncludes("irgendwas", "")).toBe(true);
    expect(searchIncludes(null, "x")).toBe(false);
    expect(searchIncludes(undefined, "x")).toBe(false);
  });
});
