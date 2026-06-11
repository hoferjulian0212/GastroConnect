import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User, Member } from "@shared/schema";
import { roleLabel } from "@shared/permissions";
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
  const { currentUser, currentRole, selectUser, setCurrentUser, members, currentMember, selectMember } = useUser();
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

  const handleSelectMember = (member: Member) => {
    selectMember(member.id);
  };

  if (!currentUser) return null;
  const hasMultipleAccounts = roleUsers.length > 1;
  const hasMembers = members.length > 0;
  if (!hasMultipleAccounts && !hasMembers) return null;

  const getInitials = (user: User) =>
    (user.companyName || user.name || "?").slice(0, 2).toUpperCase();
  const getMemberInitials = (m: Member) =>
    (m.name || "?").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-2 w-full rounded-full border border-white/20 bg-white/[0.07] py-1.5 text-left transition-all hover:bg-white/15 cursor-pointer text-white ${compact ? "text-xs px-1.5 2xl:px-3" : "text-sm px-3"}`}
          data-testid="button-switch-account"
        >
          <Avatar className={compact ? "h-6 w-6" : "h-7 w-7"}>
            {(currentMember?.profileImageUrl || currentUser.profileImageUrl) ? (
              <AvatarImage src={currentMember?.profileImageUrl || currentUser.profileImageUrl || undefined} alt={currentMember?.name || currentUser.name} />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
              {getInitials(currentUser)}
            </AvatarFallback>
          </Avatar>
          <span className={`flex-1 truncate font-medium ${compact ? "hidden 2xl:block" : ""}`}>
            {currentMember ? currentMember.name : (currentUser.companyName || currentUser.name)}
          </span>
          <ChevronsUpDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 ${compact ? "hidden 2xl:block" : ""}`} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {hasMultipleAccounts && (
          <>
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
          </>
        )}
        {hasMembers && (
          <>
            {hasMultipleAccounts && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {lang === "it" ? "Membro attivo" : "Aktives Mitglied"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {members.map(member => (
              <DropdownMenuItem
                key={member.id}
                onClick={() => handleSelectMember(member)}
                className="flex items-center gap-2.5 py-2 cursor-pointer"
                data-testid={`member-option-${member.id}`}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  {member.profileImageUrl ? (
                    <AvatarImage src={member.profileImageUrl} alt={member.name} />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
                    {getMemberInitials(member)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{roleLabel(member.role, lang)}</p>
                </div>
                {member.id === currentMember?.id && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
