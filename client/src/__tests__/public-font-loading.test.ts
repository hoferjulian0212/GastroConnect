// Guard the public shell against reintroducing render-blocking font catalogs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("client/index.html", "utf8");
const css = readFileSync("client/src/index.css", "utf8");

describe("public font loading", () => {
  it("preloads only used faces and enables the stylesheet after loading", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const link = doc.querySelector<HTMLLinkElement>('link[as="style"]')!;
    expect(link.rel).toBe("preload");
    expect(link.getAttribute("onload")).toBe("this.onload=null;this.rel='stylesheet'");
    const url = new URL(link.href);
    expect(url.searchParams.getAll("family")).toEqual([
      "DM Serif Display:ital@1",
      "Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400",
    ]);
    expect(url.searchParams.get("display")).toBe("swap");

    const fallback = doc.querySelector<HTMLLinkElement>("noscript link")!;
    expect(fallback.rel).toBe("stylesheet");
    expect(fallback.href).toBe(link.href);
    expect(doc.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
  });

  it("retains preconnect hints and branded font stacks without a blocking CSS import", () => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector('link[rel="preconnect"][href="https://fonts.googleapis.com"]')).not.toBeNull();
    expect(doc.querySelector('link[rel="preconnect"][href="https://fonts.gstatic.com"][crossorigin]')).not.toBeNull();
    expect(css).not.toMatch(/@import\s+url\([^)]*fonts\.googleapis/);
    expect(css).toContain("--font-sans: Inter, system-ui, sans-serif;");
    expect(css).toContain('font-family: "DM Serif Display", Georgia, serif;');
    expect(css).toContain("--font-serif: Georgia, serif;");
    expect(css).toContain("--font-mono: Menlo, monospace;");
  });
});