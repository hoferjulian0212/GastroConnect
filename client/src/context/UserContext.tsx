import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { User, Member } from "@shared/schema";
import { isWarehouseRole } from "@shared/permissions";
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
  members: Member[];
  membersLoading: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  providers: AuthProviders;
  refetchMe: () => void;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);

  const { data: me, isLoading: meLoading, refetch } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    retry: false,
    staleTime: 30000,
  });

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
        members,
        membersLoading,
        isAuthenticated,
        isLoading: meLoading,
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
