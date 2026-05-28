import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "@/components/StarRating";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { SupplierRating } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";

interface RatingCardProps {
  orderId: string;
  supplierId: string;
  supplierName?: string;
  compact?: boolean;
}

const EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export default function RatingCard({ orderId, supplierId, supplierName, compact }: RatingCardProps) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const dateLocale = lang === "de" ? de : it;

  const { data: rating, isLoading } = useQuery<SupplierRating | null>({
    queryKey: ["/api/orders", orderId, "rating"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/rating`);
      if (!res.ok) throw new Error("Failed to fetch rating");
      return res.json();
    },
    enabled: !!orderId,
  });

  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState<number>(0);
  const [comment, setComment] = useState<string>("");

  useEffect(() => {
    if (rating) {
      setStars(rating.stars);
      setComment(rating.comment ?? "");
    } else {
      setStars(0);
      setComment("");
    }
  }, [rating?.id, rating?.stars, rating?.comment]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "rating"] });
    queryClient.invalidateQueries({ queryKey: ["/api/suppliers", supplierId, "ratings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/supplier-ratings/summary"] });
  };

  const createMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/ratings", {
        orderId,
        restaurantId: currentUser?.id,
        supplierId,
        stars,
        comment: comment.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setEditing(false);
      toast({ title: lang === "de" ? "Bewertung gespeichert" : "Valutazione salvata" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!rating) return;
      await fetch(`/api/ratings/${rating.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": currentUser?.id ?? "" },
        body: JSON.stringify({ stars, comment: comment.trim() || null }),
      }).then(r => { if (!r.ok) throw new Error("update failed"); });
    },
    onSuccess: () => {
      invalidate();
      setEditing(false);
      toast({ title: lang === "de" ? "Bewertung aktualisiert" : "Valutazione aggiornata" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!rating) return;
      await fetch(`/api/ratings/${rating.id}?restaurantId=${currentUser?.id}`, {
        method: "DELETE",
        headers: { "x-user-id": currentUser?.id ?? "" },
      }).then(r => { if (!r.ok && r.status !== 204) throw new Error("delete failed"); });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: lang === "de" ? "Bewertung gelöscht" : "Valutazione eliminata" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-12 animate-pulse bg-muted/40 rounded" />
        </CardContent>
      </Card>
    );
  }

  const isWithinWindow = rating
    ? Date.now() - new Date(rating.createdAt).getTime() <= EDIT_WINDOW_MS
    : true;
  const remaining = comment.length;
  const canSubmit = stars >= 1 && stars <= 5 && remaining <= 280;
  const isPending = createMut.isPending || updateMut.isPending || deleteMut.isPending;

  // EXISTING RATING — display
  if (rating && !editing) {
    return (
      <Card className="border-yellow-400/40 bg-yellow-50/40 dark:bg-yellow-500/[0.04]" data-testid="rating-card-existing">
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <StarRating value={rating.stars} size="md" data-testid="display-rating-stars" />
              <span className="text-xs text-muted-foreground">
                {lang === "de" ? "vor " : ""}
                {formatDistanceToNow(new Date(rating.createdAt), { locale: dateLocale, addSuffix: lang !== "de" })}
              </span>
            </div>
            {isWithinWindow && (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)} data-testid="button-edit-rating">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(lang === "de" ? "Bewertung löschen?" : "Eliminare valutazione?")) deleteMut.mutate();
                  }}
                  disabled={isPending}
                  data-testid="button-delete-rating"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            )}
          </div>
          {rating.comment && (
            <p className="text-sm text-muted-foreground italic" data-testid="display-rating-comment">
              „{rating.comment}"
            </p>
          )}
          {!isWithinWindow && (
            <p className="text-[11px] text-muted-foreground">
              {lang === "de" ? "Bearbeitung nicht mehr möglich (über 7 Tage)." : "Modifica non più possibile (oltre 7 giorni)."}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // EMPTY / EDITING — form
  return (
    <Card className="border-yellow-400/40" data-testid="rating-card-form">
      <CardContent className="py-4 space-y-3">
        <div>
          <h3 className="font-semibold text-sm" data-testid="rating-card-title">
            {lang === "de" ? "Wie war die Lieferung?" : "Com'è stata la consegna?"}
          </h3>
          {supplierName && !compact && (
            <p className="text-xs text-muted-foreground">
              {lang === "de" ? "Bewerten Sie " : "Valuta "}
              <span className="font-medium text-foreground">{supplierName}</span>
            </p>
          )}
        </div>

        <StarRating value={stars} size="lg" onChange={setStars} data-testid="star-input" />

        <div className="space-y-1">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 280))}
            placeholder={lang === "de" ? "Kurzer Kommentar (optional)" : "Commento breve (opzionale)"}
            rows={2}
            maxLength={280}
            className="resize-none text-sm"
            data-testid="input-rating-comment"
          />
          <div className="flex justify-end text-[11px] text-muted-foreground tabular-nums">
            {remaining}/280
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          {editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                if (rating) {
                  setStars(rating.stars);
                  setComment(rating.comment ?? "");
                }
              }}
              data-testid="button-cancel-rating"
            >
              <X className="h-4 w-4 mr-1" />
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => (rating ? updateMut.mutate() : createMut.mutate())}
            disabled={!canSubmit || isPending}
            data-testid="button-submit-rating"
          >
            <Check className="h-4 w-4 mr-1" />
            {rating
              ? lang === "de" ? "Aktualisieren" : "Aggiorna"
              : lang === "de" ? "Bewertung abgeben" : "Invia valutazione"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
