import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { User } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";

type UserRole = "restaurant" | "supplier";

interface UserContextType {
  currentUser: User | null;
  currentRole: UserRole;
  setCurrentUser: (user: User | null) => void;
  switchRole: (role: UserRole) => void;
  selectUser: (userId: string) => void;
  selectedUserId: string | null;
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

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>("restaurant");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    getStoredUserId("restaurant")
  );

  const switchRole = useCallback((role: UserRole) => {
    setCurrentRole(role);
    setCurrentUser(null);
    setSelectedUserId(getStoredUserId(role));
    queryClient.clear();
  }, []);

  const selectUser = useCallback((userId: string) => {
    storeUserId(currentRole, userId);
    setSelectedUserId(userId);
  }, [currentRole]);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentRole,
        setCurrentUser,
        switchRole,
        selectUser,
        selectedUserId,
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
