import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { UserProvider, useUser } from "@/context/UserContext";
import { queryClient } from "@/lib/queryClient";

const signOut = vi.fn(async () => {});

vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  useClerk: () => ({ signOut }),
}));

function Probe() {
  const { isAuthenticated, logout } = useUser();
  return (
    <>
      <output data-testid="auth-state">{String(isAuthenticated)}</output>
      <button onClick={() => void logout()}>Log out</button>
    </>
  );
}

beforeEach(() => {
  queryClient.clear();
  signOut.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    authenticated: true,
    org: { id: "org-1", role: "restaurant", name: "Test", email: "test@example.com" },
    member: { id: "member-1", role: "admin", name: "Test" },
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("logout landing boundary", () => {
  test("stale authenticated me data cannot keep the app authenticated after logout starts", async () => {
    render(
      <UserProvider>
        <Probe />
      </UserProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("auth-state")).toHaveTextContent("true"));
    fireEvent.click(screen.getByText("Log out"));
    await waitFor(() => expect(screen.getByTestId("auth-state")).toHaveTextContent("false"));
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });
});