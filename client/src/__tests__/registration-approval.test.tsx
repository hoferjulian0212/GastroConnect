import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clerk/react", async () => {
  const React = await import("react");
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    SignIn: ({ forceRedirectUrl }: { forceRedirectUrl?: string }) => React.createElement("div", {
      "data-testid": "clerk-sign-in",
      "data-redirect-url": forceRedirectUrl,
    }),
    SignUp: () => null,
    useAuth: () => ({ isLoaded: true, isSignedIn: true }),
    useClerk: () => ({ signOut: vi.fn(async () => {}), addListener: () => () => {} }),
  };
});
vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => "pk_test_mock" }));

import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import App from "@/App";
import { RegistrationPage } from "@/pages/Registration";
import { queryClient } from "@/lib/queryClient";

const pendingOrg = { id: "org-pending", name: "Pending applicant", companyName: "Pending applicant", role: "restaurant" };

function mockMe(registrationStatus: "pending" | "denied") {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/auth/me")) {
      return Response.json({ authenticated: false, registrationStatus, org: pendingOrg });
    }
    return Response.json([]);
  }));
}

function mockMutableMe(initial: Record<string, unknown>) {
  let response = initial;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/auth/me")) return Response.json(response);
    return Response.json([]);
  }));
  return {
    set(responseBody: Record<string, unknown>) {
      response = responseBody;
    },
  };
}

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/restaurant");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public registration approval UI", () => {
  test("registration keeps the required company fields for both restaurant and supplier roles", async () => {
    const { getByRole, getAllByRole } = render(<RegistrationPage />);

    fireEvent.click(getByRole("button", { name: /Händler/ }));
    fireEvent.click(getByRole("button", { name: "Weiter" }));
    expect(getAllByRole("textbox").filter((field) => field.hasAttribute("required"))).toHaveLength(6);

    cleanup();
    window.history.replaceState({}, "", "/register");
    render(<RegistrationPage />);
    fireEvent.click(screen.getByRole("button", { name: /Betrieb/ }));
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByLabelText("Unternehmensname")).toBeRequired();
    expect(screen.getByLabelText("Ansprechperson")).toBeRequired();
    expect(screen.getByLabelText("Telefon")).toBeRequired();
    expect(screen.getByLabelText("Adresse")).toBeRequired();
    expect(screen.getByLabelText("Ort")).toBeRequired();
    expect(screen.getByLabelText("PLZ")).toBeRequired();
  });

  test("Clerk-verified pending organization sees the waiting screen, not protected app content", async () => {
    mockMe("pending");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Prüfung läuft" })).toBeInTheDocument());
    expect(screen.getByText(/Unser Team prüft sie jetzt für die Freischaltung/)).toBeInTheDocument();
    expect(screen.getByText("Pending applicant")).toBeInTheDocument();
    expect(screen.getByText("E-Mail bestätigt")).toBeInTheDocument();
    expect(screen.getByText("Unternehmen eingereicht")).toBeInTheDocument();
    expect(screen.getByText("Manuelle Prüfung läuft")).toBeInTheDocument();
    expect(screen.queryByTestId("app-header-shell")).not.toBeInTheDocument();
  });

  test("rejected organization stays blocked with the rejection screen", async () => {
    mockMe("denied");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Registrierung abgelehnt" })).toBeInTheDocument());
    expect(screen.getByText(/wurde nicht freigegeben/)).toBeInTheDocument();
    expect(screen.queryByTestId("app-header-shell")).not.toBeInTheDocument();
  });

  test.each([
    ["restaurant", "/restaurant"],
    ["supplier", "/supplier"],
  ])("a refreshed approval opens the %s dashboard without a page reload", async (role, expectedPath) => {
    window.history.replaceState({}, "", "/registration-status");
    const session = mockMutableMe({
      authenticated: false,
      registrationStatus: "pending",
      org: { ...pendingOrg, role },
    });
    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Prüfung läuft" })).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Status jetzt prüfen" })).toBeEnabled());
    session.set({
      authenticated: true,
      member: { id: "member-approved", organizationId: "org-pending", role: "admin", email: "applicant@example.com", name: "Applicant" },
      org: { ...pendingOrg, role },
    });
    fireEvent.click(screen.getByRole("button", { name: "Status jetzt prüfen" }));

    await waitFor(() => expect(window.location.pathname).toBe(expectedPath));
  });

  test("an unauthenticated visitor cannot remain on the registration status route", async () => {
    window.history.replaceState({}, "", "/registration-status");
    mockMutableMe({ authenticated: false });
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe("/sign-in"));
  });

  test("normal sign-in always returns through the registration status route", () => {
    window.history.replaceState({}, "", "/sign-in");
    render(<App />);

    expect(screen.getByTestId("clerk-sign-in")).toHaveAttribute(
      "data-redirect-url",
      "/registration-status",
    );
  });
});