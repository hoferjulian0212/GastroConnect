import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import type { User, Member } from "@shared/schema";
import { isWarehouseRole, isDriverRole } from "@shared/permissions";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

type UserRole = "restaurant" | "supplier";

interface MeResponse {
  authenticated: boolean;
  registrationStatus?: "pending" | "denied";
  member?: Member;
  org?: User;
}

export interface RegistrationOrganization {
  id: string;
  name: string;
  companyName?: string | null;
  role?: UserRole;
  createdAt?: string | Date;
}

interface UserContextType {
  currentUser: User | null;
  currentRole: UserRole;
  setCurrentUser: (user: User | null) => void;
  currentMember: Member | null;
  setCurrentMember: (member: Member | null) => void;
  isWarehouse: boolean;
  isDriver: boolean;
  members: Member[];
  membersLoading: boolean;
  isAuthenticated: boolean;
  /** True while Clerk or /api/auth/me is still loading. */
  isLoading: boolean;
  /** True when Clerk says the user is signed in but /api/auth/me says not authorized. */
  isClerkSignedInButUnauthorized: boolean;
  registrationStatus?: "pending" | "denied";
  registrationOrganization?: RegistrationOrganization;
  isRefreshingMe: boolean;
  refetchMe: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Last-known session snapshot for cold-start (PWA re-launch). Restored as
// placeholderData so the app is immediately renderable on a cold start; the
// real /api/auth/me fetch replaces it in the background.
const ME_SNAPSHOT_KEY = "gc.me.snapshot";

function readMeSnapshot(): MeResponse | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem(ME_SNAPSHOT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MeResponse;
    return parsed && parsed.authenticated && parsed.org ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function writeMeSnapshot(me: MeResponse | undefined) {
  try {
    if (me?.authenticated && me.org) {
      localStorage.setItem(ME_SNAPSHOT_KEY, JSON.stringify(me));
    } else {
      localStorage.removeItem(ME_SNAPSHOT_KEY);
    }
  } catch {
    // Storage full/unavailable — ignore.
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const [meSnapshot] = useState<MeResponse | undefined>(readMeSnapshot);
  // Prevent the cold-start placeholder from resurrecting the previous
  // dashboard during the short interval between signOut() and Clerk's
  // signed-out state update.
  const [logoutRequested, setLogoutRequested] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(
    () => (meSnapshot?.org as User | undefined) ?? null,
  );
  const [currentMember, setCurrentMember] = useState<Member | null>(
    () => (meSnapshot?.member as Member | undefined) ?? null,
  );

  // Gate the /api/auth/me query on Clerk being loaded and the user being
  // signed in. This prevents transient 401s that would arise from the fetch
  // firing before Clerk attaches its session cookie.
  const { data: me, isLoading: meLoading, isFetching: isRefreshingMe, isFetchedAfterMount, refetch } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 30000,
    enabled: clerkLoaded && !!isSignedIn,
    // Render instantly from the last-known session on a cold start.
    placeholderData: meSnapshot,
    refetchInterval: (query) =>
      (query.state.data as MeResponse | undefined)?.registrationStatus === "pending"
        ? 5000
        : false,
    refetchIntervalInBackground: true,
  });

  // Keep the snapshot up to date (only after a real server response).
  useEffect(() => {
    if (isFetchedAfterMount) writeMeSnapshot(me);
  }, [me, isFetchedAfterMount]);

  // Seed local state from /api/auth/me.
  useEffect(() => {
    if (!me) return;
    if (me.authenticated && me.org) {
      setCurrentUser(me.org as User);
      setCurrentMember((me.member as Member) ?? null);
    } else {
      setCurrentUser(null);
      setCurrentMember(null);
    }
  }, [me]);

  // When Clerk says signed-out, also clear local state and snapshot.
  useEffect(() => {
    if (clerkLoaded && !isSignedIn) {
      setLogoutRequested(false);
      setCurrentUser(null);
      setCurrentMember(null);
      writeMeSnapshot(undefined);
    }
  }, [clerkLoaded, isSignedIn]);

  useEffect(() => {
    if (clerkLoaded && isSignedIn) setLogoutRequested(false);
  }, [clerkLoaded, isSignedIn]);

  const currentRole = (currentUser?.role as UserRole) ?? "restaurant";
  const isWarehouse = isWarehouseRole(currentMember?.role);
  const isDriver = isDriverRole(currentMember?.role);
  // Let a valid last-known session render while Clerk starts and the server
  // refresh runs. This is display-only optimism: once the first real request
  // completes, its result remains authoritative.
  const hasRestorableSession = !!(
    !logoutRequested
    &&
    meSnapshot?.authenticated
    && meSnapshot.org
    && !isFetchedAfterMount
    && (!clerkLoaded || isSignedIn)
  );
  const isAuthenticated = !!me?.authenticated || hasRestorableSession;
  // Clerk is signed in but the server has no member row for this email.
  const isClerkSignedInButUnauthorized = clerkLoaded && !!isSignedIn && !isAuthenticated && !meLoading;

  const { data: membersData, isLoading: membersLoading } = useQuery<{ members: Member[]; seatLimit: number; seatsUsed: number }>({
    queryKey: ["/api/orgs", currentUser?.id, "members"],
    enabled: !!currentUser?.id,
  });
  const members = membersData?.members ?? [];

  const refetchMe = useCallback(() => refetch(), [refetch]);

  const logout = useCallback(async () => {
    setLogoutRequested(true);
    setCurrentUser(null);
    setCurrentMember(null);
    writeMeSnapshot(undefined);
    queryClient.clear();
    await signOut({ redirectUrl: "/" });
  }, [signOut]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentRole,
        setCurrentUser,
        currentMember,
        setCurrentMember,
        isWarehouse,
        isDriver,
        members,
        membersLoading,
        isAuthenticated,
        // Only show the splash when neither the session bootstrap nor the
        // local PWA snapshot can render the shell. A real auth response always
        // replaces the snapshot in the background.
        isLoading: (!clerkLoaded && !hasRestorableSession)
          || (clerkLoaded && !!isSignedIn && meLoading && !me && !hasRestorableSession),
        isClerkSignedInButUnauthorized,
        registrationStatus: me?.registrationStatus,
        registrationOrganization: me?.registrationStatus
          ? (me.org as RegistrationOrganization | undefined)
          : undefined,
        isRefreshingMe,
        refetchMe,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
