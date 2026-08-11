// App-mount regression tests for the warehouse routing restriction.
//
// Contract locked in here (task: "Block warehouse staff from restricted pages
// even on direct links"):
//  1. A warehouse-role member who opens a restricted supplier URL directly
//     (e.g. /supplier/orders) is redirected to the warehouse home (/supplier)
//     and sees the warehouse view — the full App is mounted, so this covers
//     what staff actually see on screen, not just the allow-list predicate.
//  2. Allowed paths (e.g. /supplier/inventory) are NOT redirected.
//  3. UserContext derives isWarehouse correctly from currentMember.role.
//
// The session is mocked at the network boundary: fetch("/api/auth/me") returns
// a warehouse (or staff) member of a supplier org, exactly like the real
// server session endpoint would.

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// Mock Clerk before any imports that depend on it. vi.mock() is hoisted
// to the top of the file regardless of where it appears.
vi.mock("@clerk/react", async () => {
  const React = await import("react");
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    SignIn: () => null,
    SignUp: () => null,
    useAuth: () => ({ isLoaded: true, isSignedIn: true }),
    useClerk: () => ({
      signOut: async (_opts?: unknown) => {},
      addListener: (_fn: unknown) => () => {},
    }),
  };
});
vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => "pk_test_mock",
}));

import { render, screen, waitFor, cleanup } from "@testing-library/react";
import App from "@/App";
import { UserProvider, useUser } from "@/context/UserContext";
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { isWarehouseRole } from "@shared/permissions";

const SUPPLIER_ORG = {
  id: "org-supplier-1",
  role: "supplier",
  name: "Hans Huber",
  email: "hans@test-lieferant.de",
  companyName: "Test Lieferant GmbH",
  profileImageUrl: null,
};

function makeMember(role: string) {
  return {
    id: `member-${role}`,
    organizationId: SUPPLIER_ORG.id,
    name: `Test ${role}`,
    email: `${role}@test-lieferant.de`,
    role,
    profileImageUrl: null,
    // Already completed the first-login profile step — these tests cover
    // routing, not the profile-completion gate.
    profileCompletedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Installs a fetch mock that serves the session for the given member role. */
function mockSession(memberRole: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];

      if (path === "/api/auth/me") {
        return Response.json({
          authenticated: true,
          member: makeMember(memberRole),
          org: SUPPLIER_ORG,
          providers: { google: false },
        });
      }
      if (path.endsWith("/members")) {
        return Response.json({ members: [], seatLimit: 5, seatsUsed: 1 });
      }
      // Everything else: generic empty payload — enough for pages to render.
      return Response.json([]);
    }),
  );
}

beforeEach(() => {
  queryClient.clear();
  // The app persists a last-known session snapshot for instant PWA cold
  // starts — clear it so tests don't leak identity into each other.
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("warehouse members are blocked from restricted supplier pages", () => {
  test("direct link to /supplier/orders redirects to the warehouse home", async () => {
    mockSession("warehouse");
    window.history.pushState({}, "", "/supplier/orders");

    render(<App />);

    // The warehouse home must appear...
    await waitFor(
      () => {
        expect(screen.getByTestId("warehouse-home-hero")).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
    // ...and the URL must have been rewritten back to the warehouse home.
    await waitFor(() => {
      expect(window.location.pathname).toBe("/supplier");
    });
  }, 20000);

  test("direct link to /supplier/products also redirects to the warehouse home", async () => {
    mockSession("warehouse");
    window.history.pushState({}, "", "/supplier/products");

    render(<App />);

    await waitFor(
      () => {
        expect(screen.getByTestId("warehouse-home-hero")).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe("/supplier");
    });
  }, 20000);

  test("an allowed path (/supplier/inventory) is NOT redirected", async () => {
    mockSession("warehouse");
    window.history.pushState({}, "", "/supplier/inventory");

    render(<App />);

    // Wait until the inventory page itself has rendered — deterministic proof
    // the route resolved to the target page rather than a redirect.
    await waitFor(
      () => {
        expect(screen.getByTestId("inventory-hero")).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
    expect(window.location.pathname).toBe("/supplier/inventory");
    expect(screen.queryByTestId("warehouse-home-hero")).not.toBeInTheDocument();
  }, 20000);

  test("a regular (manager) member on /supplier/orders is NOT redirected", async () => {
    mockSession("manager");
    window.history.pushState({}, "", "/supplier/orders");

    render(<App />);

    // Wait for the supplier Orders page hero — proves the deep link survived
    // the cold load (guards the UserLoader race fix) and no redirect happened.
    await waitFor(
      () => {
        expect(screen.getByTestId("orders-hero")).toBeInTheDocument();
      },
      { timeout: 10000 },
    );
    expect(window.location.pathname).toBe("/supplier/orders");
    expect(screen.queryByTestId("warehouse-home-hero")).not.toBeInTheDocument();
  }, 20000);
});

describe("UserContext derives isWarehouse from currentMember.role", () => {
  function Probe() {
    const { isWarehouse, currentMember } = useUser();
    return (
      <div>
        <span data-testid="probe-is-warehouse">{String(isWarehouse)}</span>
        <span data-testid="probe-member-role">{currentMember?.role ?? "none"}</span>
      </div>
    );
  }

  function renderProbe() {
    return render(
      <QueryClientProvider client={queryClient}>
        <UserProvider>
          <Probe />
        </UserProvider>
      </QueryClientProvider>,
    );
  }

  test("warehouse member role → isWarehouse=true", async () => {
    mockSession("warehouse");
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("probe-member-role")).toHaveTextContent("warehouse");
    });
    expect(screen.getByTestId("probe-is-warehouse")).toHaveTextContent("true");
  });

  test("staff member role → isWarehouse=false", async () => {
    mockSession("staff");
    renderProbe();
    await waitFor(() => {
      expect(screen.getByTestId("probe-member-role")).toHaveTextContent("staff");
    });
    expect(screen.getByTestId("probe-is-warehouse")).toHaveTextContent("false");
  });

  test("shared isWarehouseRole helper matches the context derivation", () => {
    expect(isWarehouseRole("warehouse" as any)).toBe(true);
    expect(isWarehouseRole("staff" as any)).toBe(false);
    expect(isWarehouseRole("admin" as any)).toBe(false);
    expect(isWarehouseRole(null)).toBe(false);
    expect(isWarehouseRole(undefined)).toBe(false);
  });
});
