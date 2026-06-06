import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { User, Member } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

type UserRole = "restaurant" | "supplier";

interface UserContextType {
  currentUser: User | null;
  currentRole: UserRole;
  setCurrentUser: (user: User | null) => void;
  switchRole: (role: UserRole) => void;
  selectUser: (userId: string) => void;
  selectedUserId: string | null;
  members: Member[];
  membersLoading: boolean;
  currentMember: Member | null;
  selectedMemberId: string | null;
  selectMember: (memberId: string | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

function getStoredUserId(role: UserRole): string | null {
  try {
    return localStorage.getItem(`gastroconnect_selected_${role}_id`);
  } catch {
    return null;
  }
}

function storeUserId(role: UserRole, userId: string) {
  try {
    localStorage.setItem(`gastroconnect_selected_${role}_id`, userId);
  } catch {}
}

function getStoredMemberId(orgId: string): string | null {
  try {
    return localStorage.getItem(`gastroconnect_selected_member_${orgId}`);
  } catch {
    return null;
  }
}

function storeMemberId(orgId: string, memberId: string | null) {
  try {
    const key = `gastroconnect_selected_member_${orgId}`;
    if (memberId) localStorage.setItem(key, memberId);
    else localStorage.removeItem(key);
  } catch {}
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>("restaurant");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    getStoredUserId("restaurant")
  );
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  const switchRole = useCallback((role: UserRole) => {
    setCurrentRole(role);
    setCurrentUser(null);
    setSelectedUserId(getStoredUserId(role));
    setSelectedMemberId(null);
    queryClient.clear();
  }, []);

  const selectUser = useCallback((userId: string) => {
    storeUserId(currentRole, userId);
    setSelectedUserId(userId);
    setSelectedMemberId(getStoredMemberId(userId));
  }, [currentRole]);

  const { data: membersData, isLoading: membersLoading } = useQuery<{ members: Member[]; seatLimit: number; seatsUsed: number }>({
    queryKey: ["/api/orgs", selectedUserId, "members"],
    enabled: !!selectedUserId,
  });
  const members = membersData?.members ?? [];

  const selectMember = useCallback((memberId: string | null) => {
    if (selectedUserId) storeMemberId(selectedUserId, memberId);
    setSelectedMemberId(memberId);
  }, [selectedUserId]);

  // Restore persisted member selection once the org is known.
  useEffect(() => {
    if (selectedUserId) {
      setSelectedMemberId(getStoredMemberId(selectedUserId));
    }
  }, [selectedUserId]);

  // If the persisted member no longer exists, default to the first admin/member.
  useEffect(() => {
    if (!selectedUserId || members.length === 0) return;
    const exists = selectedMemberId && members.some((m) => m.id === selectedMemberId);
    if (!exists) {
      const fallback = members.find((m) => m.role === "admin") ?? members[0];
      if (fallback) {
        setSelectedMemberId(fallback.id);
        storeMemberId(selectedUserId, fallback.id);
      }
    }
  }, [members, selectedMemberId, selectedUserId]);

  const currentMember = members.find((m) => m.id === selectedMemberId) ?? null;

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentRole,
        setCurrentUser,
        switchRole,
        selectUser,
        selectedUserId,
        members,
        membersLoading,
        currentMember,
        selectedMemberId,
        selectMember,
        isLoading,
        setIsLoading,
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
