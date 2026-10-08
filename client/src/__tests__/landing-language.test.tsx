import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Landing from "@/pages/Landing";
import { PUBLIC_LANGUAGE_KEY } from "@/pages/About";

vi.mock("@/context/UserContext", () => ({
  useUser: () => ({ currentUser: null, currentRole: null }),
}));

vi.mock("framer-motion", async (importOriginal) => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => true,
}));

beforeEach(() => {
  localStorage.clear();
  document.cookie = `${PUBLIC_LANGUAGE_KEY}=; max-age=0; path=/`;
  document.documentElement.lang = "de";
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.cookie = `${PUBLIC_LANGUAGE_KEY}=; max-age=0; path=/`;
  document.documentElement.lang = "de";
});

describe("landing page document language", () => {
  it("keeps German as the static HTML fallback", () => {
    const html = readFileSync("client/index.html", "utf8");
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.documentElement.lang).toBe("de");
  });

  it.each(["de", "it", "en"])("declares the saved %s language on mount", (lang) => {
    localStorage.setItem(PUBLIC_LANGUAGE_KEY, lang);
    render(<Landing />);
    expect(document.documentElement.lang).toBe(lang);
  });

  it("updates the language when switching to Italian, English, and back to German", () => {
    localStorage.setItem(PUBLIC_LANGUAGE_KEY, "de");
    render(<Landing />);
    for (const lang of ["it", "en", "de"]) {
      fireEvent.change(screen.getAllByRole("combobox", { name: "Language / Sprache / Lingua" })[0], {
        target: { value: lang },
      });
      expect(document.documentElement.lang).toBe(lang);
      expect(localStorage.getItem(PUBLIC_LANGUAGE_KEY)).toBe(lang);
    }
  });
});