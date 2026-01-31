import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { User } from "@shared/schema";

type UserRole = "restaurant" | "supplier";

interface UserContextType {
  currentUser: User | null;
  currentRole: UserRole;
  setCurrentUser: (user: User | null) => void;
  switchRole: (role: UserRole) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>("restaurant");
  const [isLoading, setIsLoading] = useState(true);

  const switchRole = useCallback((role: UserRole) => {
    setCurrentRole(role);
    setCurrentUser(null);
  }, []);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentRole,
        setCurrentUser,
        switchRole,
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
