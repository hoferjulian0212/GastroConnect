import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle, AlertTriangle, Package, Info, CalendarDays, Pencil, X, Truck, Flag, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import QuantityInput from "@/components/QuantityInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatOrderNumber, DATE_CHANGE_REASONS, type Member, type OrderWithDetails, type Product } from "@shared/schema";

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

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

  const dateLocale = lang === "it" ? it : de;
  const requestedDate = order.requestedDeliveryDate || null;
  const [editingDate, setEditingDate] = useState(false);
  const [newDate, setNewDate] = useState<string>(requestedDate || "");
  const [dateReasonCode, setDateReasonCode] = useState("");
  const [dateReasonText, setDateReasonText] = useState("");
  const dateChanged = editingDate && !!newDate && newDate !== requestedDate;
  const reasonMissing = dateChanged && (dateReasonCode === "" || (dateReasonCode === "other" && dateReasonText.trim().length === 0));
  const composedDateReason = (() => {
    if (!dateChanged) return undefined;
    const entry = DATE_CHANGE_REASONS.find(r => r.code === dateReasonCode);
    if (!entry) return undefined;
    // Send the language-neutral code; only "other" carries free text.
    if (entry.code === "other") return dateReasonText.trim() || undefined;
    return entry.code;
  })();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const formatDayDate = (d: string) =>
    format(new Date(d + "T00:00:00"), "EEEE, dd. MMMM yyyy", { locale: dateLocale });

  // ── Optional driver assignment (skippable) ────────────────────────────────
  const [driverSectionOpen, setDriverSectionOpen] = useState(false);
  const [driverId, setDriverId] = useState<string>("");
  const [driverDate, setDriverDate] = useState<string>("");
  const [driverTimeWindow, setDriverTimeWindow] = useState("");
  const [driverPriority, setDriverPriority] = useState<"normal" | "high">("normal");

  // Some office members may confirm orders without the deliveries capability;
  // in that case the drivers request fails and the section stays hidden.
  const { data: drivers, isError: driversError } = useQuery<Member[]>({
    queryKey: ["/api/supplier/drivers"],
    enabled: open,
    retry: false,
  });
  const showDriverSection = !driversError && (drivers?.length ?? 0) > 0;

  // Final delivery date: changed date wins over the requested one, never in the past.
  const effectiveDeliveryDate = (() => {
    const base = dateChanged ? newDate : (requestedDate || "");
    const d = base && /^\d{4}-\d{2}-\d{2}/.test(base) ? base.slice(0, 10) : romeToday();
    return d < romeToday() ? romeToday() : d;
  })();
  const driverDateFinal = driverDate || effectiveDeliveryDate;

  const confirmMutation = useMutation({
    mutationFn: async (items: { orderItemId: string; confirmedQuantity: number }[]) => {
      return apiRequest("POST", `/api/orders/${order.id}/confirm`, {
        items,
        changedBy: currentUserId,
        ...(dateChanged ? { deliveryDate: newDate, dateChangeReason: composedDateReason } : {}),
      });
    },
    onSuccess: async () => {
      const isPartial = order.items.some(
        (item) => confirmedQuantities[item.id] < item.quantity
      );
      toast({
        title: lang === "it"
          ? (isPartial ? "Ordine parzialmente confermato" : "Ordine confermato")
          : (isPartial ? "Bestellung teilbestätigt" : "Bestellung bestätigt"),
      });
      // Optional follow-up: assign the chosen driver. A full rejection cancels
      // the order, so no assignment is attempted in that case.
      const wasFullyRejected = order.items.every((item) => (confirmedQuantities[item.id] ?? 0) === 0);
      if (driverId && !wasFullyRejected) {
        try {
          await apiRequest("POST", `/api/orders/${order.id}/assign-driver`, {
            driverMemberId: driverId,
            deliveryDate: driverDateFinal,
            timeWindow: driverTimeWindow.trim() || null,
            priority: driverPriority,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/supplier/deliveries"] });
          queryClient.invalidateQueries({ queryKey: ["/api/orders", order.id, "tracking"] });
          toast({ title: lang === "it" ? "Autista assegnato ✓" : "Fahrer zugewiesen ✓" });
        } catch (err: any) {
          toast({
            title: lang === "it" ? "Assegnazione autista non riuscita" : "Fahrerzuweisung fehlgeschlagen",
            description: lang === "it"
              ? "L'ordine è stato confermato. Assegna l'autista dall'elenco ordini."
              : "Die Bestellung wurde bestätigt. Bitte den Fahrer über die Bestellliste zuweisen.",
            variant: "destructive",
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/orders/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier/action-required"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/pending-count"] });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: async (error: any) => {
      let title = lang === "it" ? "Errore" : "Fehler";
      let description = lang === "it" ? "Impossibile confermare l'ordine" : "Bestellung konnte nicht bestätigt werden";
      try {
        const msg = error?.message || "";
        const jsonStr = msg.includes(": ") ? msg.substring(msg.indexOf(": ") + 2) : msg;
        const parsed = JSON.parse(jsonStr);
        if (parsed.error === "insufficient_stock" && parsed.details) {
          title = lang === "it" ? "Scorte insufficienti" : "Nicht genug Lagerbestand";
          description = parsed.details.join("; ");
        }
      } catch {}
      toast({ title, description, variant: "destructive" });
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
      <DialogContent className="p-0 gap-0 max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="sr-only">
          <DialogTitle data-testid="dialog-confirm-order-title">{lang === "it" ? "Conferma ordine" : "Bestellung bestätigen"}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{lang === "it" ? "Conferma ordine" : "Bestellung bestätigen"}</h3>
            <Badge variant="outline" className="ml-auto text-xs">
              #{formatOrderNumber(order)}
            </Badge>
          </div>
          <div className="flex items-center justify-between mt-1 pl-6">
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
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 px-6" data-testid="confirm-items-list">
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

        <div className="px-6 pb-6 space-y-2">
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2" data-testid="confirm-delivery-date-section">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {lang === "it" ? "Data di consegna richiesta" : "Gewünschtes Lieferdatum"}
                  </p>
                  <p className={`text-sm font-medium truncate ${dateChanged ? "line-through text-muted-foreground" : ""}`} data-testid="text-requested-delivery-date">
                    {requestedDate
                      ? formatDayDate(requestedDate)
                      : (lang === "it" ? "Nessuna data richiesta" : "Kein Wunschtermin angegeben")}
                  </p>
                  {dateChanged && (
                    <p className="text-sm font-medium text-primary" data-testid="text-new-delivery-date">
                      → {formatDayDate(newDate)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs shrink-0"
                onClick={() => {
                  if (editingDate) {
                    setEditingDate(false);
                    setNewDate(requestedDate || "");
                    setDateReasonCode("");
                    setDateReasonText("");
                  } else {
                    setEditingDate(true);
                  }
                }}
                data-testid="button-toggle-change-date"
              >
                {editingDate
                  ? <><X className="h-3.5 w-3.5 mr-1" />{lang === "it" ? "Annulla" : "Verwerfen"}</>
                  : <><Pencil className="h-3.5 w-3.5 mr-1" />{lang === "it" ? "Cambia data" : "Datum ändern"}</>}
              </Button>
            </div>
            {editingDate && (
              <div className="space-y-2">
                <Input
                  type="date"
                  value={newDate}
                  min={todayStr}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="h-9 text-sm"
                  data-testid="input-confirm-delivery-date"
                />
                {dateChanged && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">
                      {lang === "it" ? "Motivo del cambio data (obbligatorio)" : "Grund für die Datumsänderung (Pflicht)"}
                    </label>
                    <Select value={dateReasonCode} onValueChange={setDateReasonCode}>
                      <SelectTrigger className="h-9 text-sm" data-testid="select-date-change-reason">
                        <SelectValue placeholder={lang === "it" ? "Seleziona un motivo…" : "Grund auswählen…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_CHANGE_REASONS.map(r => (
                          <SelectItem key={r.code} value={r.code} data-testid={`reason-option-${r.code}`}>
                            {lang === "it" ? r.it : r.de}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dateReasonCode === "other" && (
                      <Textarea
                        value={dateReasonText}
                        onChange={(e) => setDateReasonText(e.target.value)}
                        placeholder={lang === "it" ? "Descrivi il motivo…" : "Grund beschreiben…"}
                        rows={2}
                        maxLength={500}
                        className="resize-none text-sm"
                        data-testid="textarea-date-change-reason"
                      />
                    )}
                    {reasonMissing && (
                      <p className="text-xs text-destructive" data-testid="text-reason-required">
                        {lang === "it"
                          ? "Inserisci un motivo per la nuova data."
                          : "Bitte gib eine Begründung für das neue Datum an."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {dateChanged && !reasonMissing && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  {lang === "it"
                    ? "Il ristorante verrà informato automaticamente del nuovo appuntamento e del motivo."
                    : "Der Betrieb wird automatisch über den neuen Termin und den Grund informiert."}
                </p>
              </div>
            )}
          </div>

          {showDriverSection && !allZero && (
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2" data-testid="confirm-driver-section">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-2"
                onClick={() => setDriverSectionOpen((v) => !v)}
                data-testid="button-toggle-assign-driver"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Truck className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-left min-w-0">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {lang === "it" ? "Autista (opzionale)" : "Fahrer (optional)"}
                    </span>
                    <span className="block text-sm font-medium truncate" data-testid="text-driver-selection">
                      {driverId
                        ? (drivers ?? []).find((d) => d.id === driverId)?.name
                        : lang === "it" ? "Nessun autista assegnato" : "Kein Fahrer zugewiesen"}
                    </span>
                  </span>
                </span>
                {driverSectionOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>

              {driverSectionOpen && (
                <div className="space-y-2 pt-1">
                  <div className="space-y-1.5">
                    {(drivers ?? []).map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDriverId(driverId === d.id ? "" : d.id)}
                        className={`w-full flex items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                          driverId === d.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40"
                        }`}
                        data-testid={`option-confirm-driver-${d.id}`}
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={d.profileImageUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">{d.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium truncate">{d.name}</span>
                        {driverId === d.id && <CheckCircle className="h-4 w-4 text-primary ml-auto shrink-0" />}
                      </button>
                    ))}
                  </div>
                  {driverId && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            {lang === "it" ? "Data consegna" : "Lieferdatum"}
                          </label>
                          <Input
                            type="date"
                            value={driverDateFinal}
                            min={todayStr}
                            onChange={(e) => setDriverDate(e.target.value)}
                            className="h-9 text-sm"
                            data-testid="input-confirm-driver-date"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-foreground">
                            {lang === "it" ? "Fascia oraria" : "Zeitfenster"}
                          </label>
                          <Input
                            value={driverTimeWindow}
                            onChange={(e) => setDriverTimeWindow(e.target.value)}
                            placeholder="08:00–10:00"
                            className="h-9 text-sm"
                            data-testid="input-confirm-driver-window"
                          />
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDriverPriority("normal")}
                          className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors ${
                            driverPriority === "normal" ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                          }`}
                          data-testid="option-confirm-priority-normal"
                        >
                          Normal
                        </button>
                        <button
                          type="button"
                          onClick={() => setDriverPriority("high")}
                          className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1 ${
                            driverPriority === "high"
                              ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                              : "hover:bg-muted/40"
                          }`}
                          data-testid="option-confirm-priority-high"
                        >
                          <Flag className="h-3 w-3" />
                          {lang === "it" ? "Urgente" : "Dringend"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {hasChanges && (
            <div className="flex items-start gap-2 p-2 rounded-xl bg-amber-50 border border-amber-200">
              <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                {lang === "it"
                  ? "L'azienda verrà informata delle modifiche alle quantità."
                  : "Der Betrieb wird über die Mengenänderungen informiert."}
              </p>
            </div>
          )}

          <div className="rounded-xl bg-muted/30 p-3 space-y-1.5">
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
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 rounded-lg"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-confirm"
            >
              {lang === "it" ? "Annulla" : "Abbrechen"}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              onClick={handleConfirm}
              disabled={confirmMutation.isPending || reasonMissing || (editingDate && !newDate)}
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
