import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clerk/react", async () => {
  const React = await import("react");
  return {
    ClerkProvider: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
    SignIn: () => null,
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

const pendingOrg = { id: "org-pending", name: "Pending applicant", companyName: "Pending applicant" };

function mockMe(registrationStatus: "pending" | "denied") {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/api/auth/me")) {
      return Response.json({ authenticated: false, registrationStatus, org: pendingOrg });
    }
    return Response.json([]);
  }));
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
    expect(screen.getByText(/Unser Team prüft Ihre Unternehmensdaten/)).toBeInTheDocument();
    expect(screen.queryByTestId("app-header-shell")).not.toBeInTheDocument();
  });

  test("rejected organization stays blocked with the rejection screen", async () => {
    mockMe("denied");
    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Registrierung abgelehnt" })).toBeInTheDocument());
    expect(screen.getByText(/wurde nicht freigegeben/)).toBeInTheDocument();
    expect(screen.queryByTestId("app-header-shell")).not.toBeInTheDocument();
  });
});