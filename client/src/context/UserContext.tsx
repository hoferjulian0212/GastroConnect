import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { User, Member } from "@shared/schema";
import { isWarehouseRole, isDriverRole } from "@shared/permissions";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

type UserRole = "restaurant" | "supplier";

interface AuthProviders {
  google: boolean;
}

interface MeResponse {
  authenticated: boolean;
  member?: Member;
  org?: User;
  providers?: AuthProviders;
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
  isLoading: boolean;
  providers: AuthProviders;
  refetchMe: () => void;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

// Last-known session snapshot. When the installed PWA is killed by the OS
// (e.g. iOS reclaiming memory while the user switches apps), the app restarts
// cold — instead of blocking on the splash screen until /api/auth/me answers,
// we render immediately from this snapshot and refresh the session in the
// background. If the session turns out to be expired, the background refetch
// redirects to the login page as usual.
const ME_SNAPSHOT_KEY = "gc.me.snapshot";

function readMeSnapshot(): MeResponse | undefined {
  try {
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
    // Storage full/unavailable — snapshot is a pure optimization, ignore.
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);

  const { data: me, isLoading: meLoading, isFetchedAfterMount, refetch } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 30000,
    // Render instantly from the last-known session on a cold start; the real
    // /api/auth/me fetch still runs and replaces it.
    placeholderData: readMeSnapshot,
  });

  // Keep the snapshot up to date with the real session state (only after the
  // server actually answered — never persist the placeholder itself).
  useEffect(() => {
    if (isFetchedAfterMount) writeMeSnapshot(me);
  }, [me, isFetchedAfterMount]);

  // The session is the single source of truth for identity. Seed local state
  // from /api/auth/me; local setters still allow optimistic profile updates.
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

  const currentRole = (currentUser?.role as UserRole) ?? "restaurant";
  const isWarehouse = isWarehouseRole(currentMember?.role);
  const isDriver = isDriverRole(currentMember?.role);
  const isAuthenticated = !!me?.authenticated;
  const providers: AuthProviders = me?.providers ?? { google: false };

  const { data: membersData, isLoading: membersLoading } = useQuery<{ members: Member[]; seatLimit: number; seatsUsed: number }>({
    queryKey: ["/api/orgs", currentUser?.id, "members"],
    enabled: !!currentUser?.id,
  });
  const members = membersData?.members ?? [];

  const refetchMe = useCallback(() => {
    refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // Ignore — clearing local state below logs the user out regardless.
    }
    setCurrentUser(null);
    setCurrentMember(null);
    writeMeSnapshot(undefined);
    queryClient.clear();
  }, []);

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
        // With a snapshot placeholder the query technically still "loads", but
        // we already have renderable session data — don't show the splash.
        isLoading: meLoading && !me,
        providers,
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
