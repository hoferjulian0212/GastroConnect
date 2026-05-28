import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/StarRating";
import { Flag } from "lucide-react";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";

interface RatingItem {
  id: string;
  stars: number;
  comment: string | null;
  flaggedAt: string | null;
  createdAt: string;
  restaurant: { id: string; name: string; companyName: string | null; profileImageUrl: string | null } | null;
}

interface SummaryResponse {
  avg: number;
  count: number;
  ratings: RatingItem[];
}

interface SupplierRatingsListProps {
  supplierId: string;
  limit?: number;
  /** Show the per-rating Flag button (only when current user IS this supplier). */
  showFlag?: boolean;
  title?: string;
  compact?: boolean;
}

export default function SupplierRatingsList({
  supplierId,
  limit = 5,
  showFlag,
  title,
  compact,
}: SupplierRatingsListProps) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const dateLocale = lang === "de" ? de : it;

  const { data, isLoading } = useQuery<SummaryResponse>({
    queryKey: ["/api/suppliers", supplierId, "ratings", limit],
    queryFn: async () => {
      const res = await fetch(`/api/suppliers/${supplierId}/ratings?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch supplier ratings");
      return res.json();
    },
    enabled: !!supplierId,
  });

  const flagMut = useMutation({
    mutationFn: async (ratingId: string) => {
      const reason = window.prompt(lang === "de" ? "Grund für Meldung (optional)" : "Motivo segnalazione (opzionale)") ?? undefined;
      const res = await fetch(`/api/ratings/${ratingId}/flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": currentUser?.id ?? "" },
        body: JSON.stringify({ supplierId: currentUser?.id, reason }),
      });
      if (!res.ok) throw new Error("flag failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "ratings"] });
      toast({ title: lang === "de" ? "Bewertung gemeldet" : "Valutazione segnalata" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler beim Melden" : "Errore", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="h-20 animate-pulse rounded bg-muted/40" />
        </CardContent>
      </Card>
    );
  }

  const avg = data?.avg ?? 0;
  const count = data?.count ?? 0;
  const ratings = data?.ratings ?? [];

  return (
    <Card data-testid="supplier-ratings-list">
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-base flex items-center justify-between gap-3 flex-wrap">
          <span>{title ?? (lang === "de" ? "Bewertungen" : "Valutazioni")}</span>
          <StarRating value={avg} size="md" showValue count={count} data-testid="ratings-summary" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="ratings-empty">
            {lang === "de" ? "Noch keine Bewertungen." : "Nessuna valutazione."}
          </p>
        )}
        {ratings.map((r) => {
          const restaurantName = r.restaurant?.companyName || r.restaurant?.name || (lang === "de" ? "Anonym" : "Anonimo");
          return (
            <div
              key={r.id}
              className="flex gap-3 items-start border-t border-border/40 first:border-t-0 pt-3 first:pt-0"
              data-testid={`rating-item-${r.id}`}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={r.restaurant?.profileImageUrl ?? undefined} alt={restaurantName} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                  {restaurantName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{restaurantName}</span>
                  <StarRating value={r.stars} size="sm" />
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(r.createdAt), "dd.MM.yyyy", { locale: dateLocale })}
                  </span>
                  {r.flaggedAt && (
                    <span className="text-[10px] uppercase tracking-wide text-orange-600 dark:text-orange-400 font-semibold">
                      {lang === "de" ? "Gemeldet" : "Segnalata"}
                    </span>
                  )}
                </div>
                {r.comment && (
                  <p className="text-sm text-muted-foreground mt-1 italic" data-testid={`rating-comment-${r.id}`}>
                    „{r.comment}"
                  </p>
                )}
              </div>
              {showFlag && !r.flaggedAt && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-orange-500 shrink-0"
                  disabled={flagMut.isPending}
                  onClick={() => flagMut.mutate(r.id)}
                  data-testid={`button-flag-rating-${r.id}`}
                  title={lang === "de" ? "Melden" : "Segnala"}
                >
                  <Flag className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
