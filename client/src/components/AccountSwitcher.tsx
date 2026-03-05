import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountSwitcher({ compact = false }: { compact?: boolean }) {
  const { currentUser, currentRole, selectUser, setCurrentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const queryClient = useQueryClient();

  const { data: users } = useQuery<User[]>({
    queryKey: [`/api/users?role=${currentRole}`],
  });

  const roleUsers = users?.filter(u => u.role === currentRole) || [];

  const handleSelect = (user: User) => {
    if (user.id === currentUser?.id) return;
    selectUser(user.id);
    setCurrentUser(user);
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        if (typeof key !== "string") return false;
        if (key.startsWith("/api/users")) return false;
        return true;
      },
    });
  };

  if (!currentUser || roleUsers.length <= 1) return null;

  const getInitials = (user: User) =>
    (user.companyName || user.name || "?").slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-all hover-elevate cursor-pointer ${compact ? "text-xs" : "text-sm"}`}
          data-testid="button-switch-account"
        >
          <Avatar className={compact ? "h-6 w-6" : "h-7 w-7"}>
            {currentUser.profileImageUrl ? (
              <AvatarImage src={currentUser.profileImageUrl} alt={currentUser.name} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
              {getInitials(currentUser)}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate font-medium">
            {currentUser.companyName || currentUser.name}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          {t("common", "switchAccount")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roleUsers.map(user => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => handleSelect(user)}
            className="flex items-center gap-2.5 py-2 cursor-pointer"
            data-testid={`account-option-${user.id}`}
          >
            <Avatar className="h-7 w-7 shrink-0">
              {user.profileImageUrl ? (
                <AvatarImage src={user.profileImageUrl} alt={user.name} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                {getInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.companyName || user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            {user.id === currentUser.id && (
              <Check className="h-4 w-4 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
