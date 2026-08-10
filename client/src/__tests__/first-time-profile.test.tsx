// First-login onboarding: a member without profileCompletedAt must see the
// blocking welcome popup (instead of the old silent redirect to the profile
// page), and completing it unlocks the app.

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

function makeMember(profileCompletedAt: string | null) {
  return {
    id: "member-warehouse",
    organizationId: SUPPLIER_ORG.id,
    name: "Test Lager",
    email: "warehouse@test-lieferant.de",
    role: "warehouse",
    phone: null,
    profileImageUrl: null,
    profileCompletedAt,
  };
}

function mockSession(profileCompletedAt: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
      if (path === "/api/auth/me") {
        return Response.json({
          authenticated: true,
          member: makeMember(profileCompletedAt),
          org: SUPPLIER_ORG,
          providers: { google: false },
        });
      }
      if (path === "/api/members/me" && init?.method === "PATCH") {
        return Response.json({
          ...makeMember("2026-08-10T00:00:00.000Z"),
          ...(init.body ? JSON.parse(init.body as string) : {}),
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

describe("first-time profile completion popup", () => {
  test("incomplete profile → blocking dialog appears; saving closes it", async () => {
    mockSession(null);
    window.history.pushState({}, "", "/supplier");

    render(<App />);

    // Popup must appear
    await waitFor(
      () => expect(screen.getByTestId("dialog-first-time-profile")).toBeInTheDocument(),
      { timeout: 10000 },
    );
    // Required marker + explicit CTA are visible
    expect(screen.getByTestId("button-onboarding-finish")).toBeInTheDocument();
    expect(screen.getByTestId("input-onboarding-name")).toHaveValue("Test Lager");
    // No close (X) button rendered
    expect(screen.queryByText("Close")).not.toBeInTheDocument();

    // Submit
    fireEvent.click(screen.getByTestId("button-onboarding-finish"));
    await waitFor(
      () => expect(screen.queryByTestId("dialog-first-time-profile")).not.toBeInTheDocument(),
      { timeout: 10000 },
    );
  }, 30000);

  test("completed profile → no dialog", async () => {
    mockSession("2026-01-01T00:00:00.000Z");
    window.history.pushState({}, "", "/supplier");

    render(<App />);

    await waitFor(
      () => expect(screen.getByTestId("warehouse-home-hero")).toBeInTheDocument(),
      { timeout: 10000 },
    );
    expect(screen.queryByTestId("dialog-first-time-profile")).not.toBeInTheDocument();
  }, 30000);
});
