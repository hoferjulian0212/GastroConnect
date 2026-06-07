import { useQuery } from "@tanstack/react-query";
import type { Member } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageSquare } from "lucide-react";

interface Party {
  id: string;
  name?: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  profileImageUrl?: string | null;
}

const initialsOf = (name: string) =>
  (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

export function CounterpartyContactCard({
  supplierId,
  restaurantId,
  isSupplier,
  supplier,
  restaurant,
  onMessage,
  lang,
  className,
}: {
  supplierId: string;
  restaurantId: string;
  isSupplier: boolean;
  supplier?: Party | null;
  restaurant?: Party | null;
  onMessage: () => void;
  lang: "de" | "it";
  className?: string;
}) {
  const tt = (de: string, it: string) => (lang === "it" ? it : de);

  const { data } = useQuery<{ member: Member | null }>({
    queryKey: [
      `/api/vertreter-assignments/responsible?supplierId=${supplierId}&restaurantId=${restaurantId}`,
    ],
    enabled: !!supplierId && !!restaurantId,
  });
  const vertreter = data?.member ?? null;

  const counterparty = isSupplier ? restaurant : supplier;
  const counterpartyName = counterparty?.companyName || counterparty?.name || "";

  let name: string;
  let subtitle: string;
  let avatarUrl: string | null | undefined;
  let phone: string | null | undefined;
  let email: string | null | undefined = null;

  if (!isSupplier && vertreter) {
    name = vertreter.name;
    subtitle = `${tt("Ihr Ansprechpartner", "Referente")}${counterpartyName ? ` · ${counterpartyName}` : ""}`;
    avatarUrl = vertreter.profileImageUrl;
    phone = vertreter.phone || counterparty?.phone;
    email = vertreter.email;
  } else {
    name = counterpartyName;
    subtitle = isSupplier ? tt("Betrieb", "Azienda") : tt("Lieferant", "Fornitore");
    avatarUrl = counterparty?.profileImageUrl;
    phone = counterparty?.phone;
    email = counterparty?.email;
  }

  if (!name) return null;

  return (
    <div
      className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${className ?? ""}`}
      data-testid="section-contact"
    >
      <div className="px-4 py-3 border-b border-border/30">
        <p className="text-sm font-semibold">{tt("Ansprechpartner", "Referente")}</p>
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Avatar className="h-11 w-11 shrink-0">
          <AvatarImage src={avatarUrl || undefined} alt={name} />
          <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
            {initialsOf(name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" data-testid="text-contact-name">
            {name}
          </p>
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {phone && (
            <a href={`tel:${phone}`} data-testid="button-contact-call">
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4" />
              </Button>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} data-testid="button-contact-email">
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4" />
              </Button>
            </a>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary"
            onClick={onMessage}
            data-testid="button-contact-message"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
