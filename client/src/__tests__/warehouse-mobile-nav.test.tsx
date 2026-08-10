// Repro test: does a warehouse member get a working mobile bottom nav?
// Bug report: on mobile, a warehouse (Lager) user cannot switch between pages.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import App from "@/App";
import { queryClient } from "@/lib/queryClient";

const SUPPLIER_ORG = {
  id: "org-supplier-1",
  role: "supplier",
  name: "Hans Huber",
  email: "hans@test-lieferant.de",
  companyName: "Test Lieferant GmbH",
  profileImageUrl: null,
};

function mockSession() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
      if (path === "/api/auth/me") {
        return Response.json({
          authenticated: true,
          member: {
            id: "member-warehouse",
            organizationId: SUPPLIER_ORG.id,
            name: "Test warehouse",
            email: "warehouse@test-lieferant.de",
            role: "warehouse",
            profileImageUrl: null,
            profileCompletedAt: "2026-01-01T00:00:00.000Z",
          },
          org: SUPPLIER_ORG,
          providers: { google: false },
        });
      }
      if (path.endsWith("/members")) {
        return Response.json({ members: [], seatLimit: 5, seatsUsed: 1 });
      }
      return Response.json([]);
    }),
  );
}

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("warehouse mobile bottom nav", () => {
  test("nav renders on warehouse home and its links navigate", async () => {
    mockSession();
    window.history.pushState({}, "", "/supplier");

    render(<App />);

    await waitFor(
      () => expect(screen.getByTestId("warehouse-home-hero")).toBeInTheDocument(),
      { timeout: 10000 },
    );

    // The warehouse mobile nav must be mounted
    const nav = screen.queryByTestId("warehouse-mobile-nav");
    expect(nav).toBeInTheDocument();

    // Nav items exist
    expect(screen.getByTestId("warehouse-mobile-nav-inventory")).toBeInTheDocument();
    expect(screen.getByTestId("warehouse-mobile-nav-inventory-risk")).toBeInTheDocument();

    // Click "Bestand" → should navigate to /supplier/inventory
    fireEvent.click(screen.getByTestId("warehouse-mobile-nav-inventory"));
    await waitFor(
      () => expect(window.location.pathname).toBe("/supplier/inventory"),
      { timeout: 10000 },
    );
  }, 30000);
});
