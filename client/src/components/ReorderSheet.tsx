import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { RefreshCw, ShoppingCart, Loader2, Check } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface OrderItemLite { quantity: number; unitPrice: string; }
interface OrderLite {
  id: string;
  supplierId: string;
  status: string;
  createdAt: string;
  totalAmount?: string;
  items?: OrderItemLite[];
  supplier?: { companyName?: string; name?: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentOrderId: string;
  supplierId: string;
  supplierName: string;
  restaurantId: string;
  lang: "de" | "it";
}

function formatOrderShort(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

export function ReorderSheet({
  open, onOpenChange, currentOrderId, supplierId, supplierName, restaurantId, lang,
}: Props) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const dateLocale = lang === "de" ? de : it;

  const { data: orders, isLoading } = useQuery<OrderLite[]>({
    queryKey: [`/api/orders?restaurantId=${restaurantId}`],
    enabled: open && !!restaurantId,
  });

  const candidateOrders = useMemo<OrderLite[]>(() => {
    if (!orders) return [];
    const sameSupplier = orders.filter(o => o.supplierId === supplierId);
    sameSupplier.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const top = sameSupplier.slice(0, 3);
    if (!top.find(o => o.id === currentOrderId)) {
      const current = orders.find(o => o.id === currentOrderId);
      if (current) return [current, ...top].slice(0, 3);
    }
    return top;
  }, [orders, supplierId, currentOrderId]);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setSelected(new Set(candidateOrders.map(o => o.id)));
    }
  }, [open, candidateOrders]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await apiRequest("POST", `/api/orders/${id}/reorder`, { restaurantId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${restaurantId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${restaurantId}`] });
      toast({
        title: lang === "de" ? "In Warenkorb übernommen" : "Aggiunto al carrello",
        description: lang === "de"
          ? `${selected.size} Bestellung(en) in den Warenkorb kopiert.`
          : `${selected.size} ordine/i copiati nel carrello.`,
      });
      onOpenChange(false);
      setLocation("/restaurant/cart");
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const totalEstimate = candidateOrders
    .filter(o => selected.has(o.id))
    .reduce((s, o) => s + (parseFloat(o.totalAmount || "0") || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0" data-testid="sheet-reorder">
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <RefreshCw className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <SheetTitle className="text-base">{lang === "de" ? "Folgebestellung" : "Riordina"}</SheetTitle>
              <SheetDescription className="text-xs truncate">{supplierName}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            {lang === "de"
              ? "Wähle die Bestellungen, die du erneut übernehmen willst. Alle Artikel werden in deinen Warenkorb gelegt."
              : "Seleziona gli ordini da riordinare. Tutti gli articoli verranno aggiunti al tuo carrello."}
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : candidateOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-reorder-candidates">
              {lang === "de" ? "Keine vergangenen Bestellungen gefunden." : "Nessun ordine precedente trovato."}
            </p>
          ) : (
            candidateOrders.map((o, idx) => {
              const isSelected = selected.has(o.id);
              const isCurrent = o.id === currentOrderId;
              const itemCount = o.items?.length ?? 0;
              return (
                <div
                  key={o.id}
                  role="checkbox"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => toggle(o.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(o.id); } }}
                  className={`w-full text-left rounded-lg border p-3 transition-colors hover-elevate active-elevate-2 cursor-pointer ${
                    isSelected ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                  }`}
                  data-testid={`reorder-candidate-${idx}`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox checked={isSelected} tabIndex={-1} aria-hidden="true" className="mt-0.5 pointer-events-none" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" data-testid={`text-reorder-id-${idx}`}>{formatOrderShort(o.id)}</span>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            {lang === "de" ? "Diese" : "Questo"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(o.createdAt), "dd.MM.yyyy", { locale: dateLocale })}
                        {" · "}
                        {itemCount} {lang === "de" ? (itemCount === 1 ? "Artikel" : "Artikel") : (itemCount === 1 ? "articolo" : "articoli")}
                      </p>
                      {o.totalAmount && (
                        <p className="text-xs font-medium mt-1" data-testid={`text-reorder-total-${idx}`}>
                          {parseFloat(o.totalAmount).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <SheetFooter className="border-t px-5 py-4 flex-col gap-2 sm:flex-col sm:space-x-0">
          {selected.size > 0 && totalEstimate > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{lang === "de" ? "Voraussichtlicher Wert" : "Valore stimato"}</span>
              <span className="font-semibold" data-testid="text-reorder-estimate">
                {totalEstimate.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            </div>
          )}
          <Button
            onClick={() => reorderMutation.mutate(Array.from(selected))}
            disabled={selected.size === 0 || reorderMutation.isPending}
            className="w-full"
            data-testid="button-confirm-reorder"
          >
            {reorderMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
            )}
            {lang === "de"
              ? `${selected.size} ${selected.size === 1 ? "Bestellung" : "Bestellungen"} übernehmen`
              : `Riordina ${selected.size} ${selected.size === 1 ? "ordine" : "ordini"}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
