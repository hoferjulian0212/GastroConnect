import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, Package, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import QuantityInput from "@/components/QuantityInput";
import type { OrderWithDetails, Product } from "@shared/schema";

interface PartialConfirmationDialogProps {
  order: OrderWithDetails;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: "de" | "it";
  currentUserId?: string;
  productsWithStock?: Product[];
  onSuccess?: () => void;
}

export function PartialConfirmationDialog({
  order,
  open,
  onOpenChange,
  lang,
  currentUserId,
  productsWithStock,
  onSuccess,
}: PartialConfirmationDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [confirmedQuantities, setConfirmedQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const item of order.items) {
      initial[item.id] = item.quantity;
    }
    return initial;
  });

  const confirmMutation = useMutation({
    mutationFn: async (items: { orderItemId: string; confirmedQuantity: number }[]) => {
      return apiRequest("POST", `/api/orders/${order.id}/confirm`, {
        items,
        changedBy: currentUserId,
      });
    },
    onSuccess: () => {
      const isPartial = order.items.some(
        (item) => confirmedQuantities[item.id] < item.quantity
      );
      toast({
        title: lang === "it"
          ? (isPartial ? "Ordine parzialmente confermato" : "Ordine confermato")
          : (isPartial ? "Bestellung teilbestätigt" : "Bestellung bestätigt"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/orders/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/action-required"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/pending-count"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: lang === "it" ? "Errore" : "Fehler",
        description: lang === "it" ? "Impossibile confermare l'ordine" : "Bestellung konnte nicht bestätigt werden",
        variant: "destructive",
      });
    },
  });

  const setQuantity = (itemId: string, qty: number) => {
    setConfirmedQuantities((prev) => ({ ...prev, [itemId]: qty }));
  };

  const setAllFull = () => {
    const full: Record<string, number> = {};
    for (const item of order.items) {
      full[item.id] = item.quantity;
    }
    setConfirmedQuantities(full);
  };

  const originalTotal = order.items.reduce(
    (sum, item) => sum + item.quantity * Number(item.unitPrice),
    0
  );

  const confirmedTotal = useMemo(() => {
    return order.items.reduce(
      (sum, item) => sum + (confirmedQuantities[item.id] ?? item.quantity) * Number(item.unitPrice),
      0
    );
  }, [order.items, confirmedQuantities]);

  const hasChanges = order.items.some(
    (item) => confirmedQuantities[item.id] !== item.quantity
  );

  const allZero = order.items.every(
    (item) => (confirmedQuantities[item.id] ?? 0) === 0
  );

  const handleConfirm = () => {
    const items = order.items.map((item) => ({
      orderItemId: item.id,
      confirmedQuantity: confirmedQuantities[item.id] ?? item.quantity,
    }));
    confirmMutation.mutate(items);
  };

  const getStockForProduct = (productId: string) => {
    if (!productsWithStock) return undefined;
    return productsWithStock.find((p) => p.id === productId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-confirm-order-title">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            {lang === "it" ? "Conferma ordine" : "Bestellung bestätigen"}
            <Badge variant="outline" className="ml-auto text-xs">
              #{order.id.slice(0, 8)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">
            {lang === "it"
              ? "Imposta la quantità confermata per ogni posizione"
              : "Bestätigte Menge pro Position festlegen"}
          </p>
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={setAllFull}
              data-testid="button-confirm-all"
            >
              {lang === "it" ? "Conferma tutto" : "Alle bestätigen"}
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1" data-testid="confirm-items-list">
          {order.items.map((item) => {
            const confirmed = confirmedQuantities[item.id] ?? item.quantity;
            const rejected = item.quantity - confirmed;
            const isReduced = confirmed < item.quantity;
            const isFullyRejected = confirmed === 0;
            const stock = getStockForProduct(item.productId);

            return (
              <div
                key={item.id}
                className={`p-3 rounded-lg border ${
                  isFullyRejected
                    ? "border-red-200 bg-red-50/50"
                    : isReduced
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-border bg-background"
                }`}
                data-testid={`confirm-item-${item.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isFullyRejected ? "line-through text-muted-foreground" : ""}`}>
                      {item.productName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {lang === "it" ? "Ordinato" : "Bestellt"}: {item.quantity}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        @ {Number(item.unitPrice).toFixed(2)}€
                      </span>
                      {stock && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Package className="h-3 w-3" />
                          {lang === "it" ? "Stock" : "Lager"}: {stock.stockQuantity ?? 0}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <QuantityInput
                      value={confirmed}
                      onChange={(val) => setQuantity(item.id, Math.min(val, item.quantity))}
                      min={0}
                      size="sm"
                      testIdPrefix={`confirm-qty-${item.id}`}
                    />
                  </div>
                </div>
                {isReduced && !isFullyRejected && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">
                      {rejected} {lang === "it" ? "non disponibile" : "nicht verfügbar"}
                    </span>
                  </div>
                )}
                {isFullyRejected && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span className="text-xs text-red-600">
                      {lang === "it" ? "Posizione rifiutata" : "Position abgelehnt"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t pt-3 mt-2 space-y-2">
          {hasChanges && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
              <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                {lang === "it"
                  ? "L'azienda verrà informata delle modifiche alle quantità."
                  : "Der Betrieb wird über die Mengenänderungen informiert."}
              </p>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {lang === "it" ? "Totale originale" : "Ursprünglicher Betrag"}
            </span>
            <span className={hasChanges ? "line-through text-muted-foreground" : "font-medium"}>
              {originalTotal.toFixed(2)}€
            </span>
          </div>
          {hasChanges && (
            <div className="flex justify-between text-sm">
              <span className="font-medium">
                {lang === "it" ? "Nuovo totale" : "Neuer Betrag"}
              </span>
              <span className="font-semibold text-primary">
                {confirmedTotal.toFixed(2)}€
              </span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-confirm"
            >
              {lang === "it" ? "Annulla" : "Abbrechen"}
            </Button>
            <Button
              className="flex-1"
              onClick={handleConfirm}
              disabled={confirmMutation.isPending}
              data-testid="button-submit-confirm"
            >
              {confirmMutation.isPending
                ? (lang === "it" ? "Conferma in corso..." : "Wird bestätigt...")
                : allZero
                  ? (lang === "it" ? "Rifiuta ordine" : "Bestellung ablehnen")
                  : hasChanges
                    ? (lang === "it" ? "Conferma parziale" : "Teilbestätigen")
                    : (lang === "it" ? "Conferma ordine" : "Bestätigen")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
