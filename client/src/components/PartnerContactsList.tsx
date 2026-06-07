import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Member } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { roleLabel } from "@shared/permissions";
import { ChevronDown, Phone, Mail, MessageSquare, Users } from "lucide-react";

type MembersResponse = { members: Member[]; seatLimit: number; seatsUsed: number };

const initialsOf = (name: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export function PartnerContactsList({
  orgId,
  orgPhone,
  onMessage,
  lang,
}: {
  orgId: string;
  orgPhone?: string | null;
  onMessage: () => void;
  lang: "de" | "it";
}) {
  const [open, setOpen] = useState(false);
  const tt = (de: string, it: string) => (lang === "it" ? it : de);

  const { data } = useQuery<MembersResponse>({
    queryKey: ["/api/orgs", orgId, "members"],
    enabled: !!orgId,
  });
  const members = data?.members ?? [];
  if (members.length === 0) return null;

  return (
    <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        data-testid={`button-toggle-contacts-${orgId}`}
      >
        <Users className="h-3 w-3" />
        {tt("Kontakte", "Contatti")} ({members.length})
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5" data-testid={`list-contacts-${orgId}`}>
          {members.map((m) => {
            const phone = m.phone || orgPhone;
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-lg bg-muted/40 p-1.5"
                data-testid={`contact-${m.id}`}
              >
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={m.profileImageUrl || undefined} alt={m.name} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-semibold">
                    {initialsOf(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate" data-testid={`text-contact-name-${m.id}`}>
                    {m.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {roleLabel(m.role, lang)}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {phone && (
                    <a href={`tel:${phone}`} data-testid={`button-contact-call-${m.id}`}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  {m.email && (
                    <a href={`mailto:${m.email}`} data-testid={`button-contact-email-${m.id}`}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-primary"
                    onClick={onMessage}
                    data-testid={`button-contact-message-${m.id}`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
