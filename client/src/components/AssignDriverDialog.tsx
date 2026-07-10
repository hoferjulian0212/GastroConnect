import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Truck, Loader2, Flag, UserX } from "lucide-react";
import { formatOrderNumber, type Member, type OrderTrackingInfo, type OrderWithDetails } from "@shared/schema";

function romeToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}

/**
 * Office dialog to assign (or reassign/unassign) a driver to a confirmed order.
 * Reuses the tracking endpoint to show the current assignment state.
 */
export function AssignDriverDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { lang } = useLanguage();
  const { toast } = useToast();

  const [driverId, setDriverId] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState<string>("");
  const [timeWindow, setTimeWindow] = useState("");
  const [packages, setPackages] = useState<string>("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [notes, setNotes] = useState("");

  const { data: drivers, isLoading: driversLoading } = useQuery<Member[]>({
    queryKey: ["/api/supplier/drivers"],
    enabled: open,
  });

  const { data: tracking } = useQuery<OrderTrackingInfo>({
    queryKey: ["/api/orders", order?.id, "tracking"],
    enabled: open && !!order?.id,
  });
  const existing = tracking?.assignment ?? null;

  // Prefill from the order's requested date when the dialog opens.
  useEffect(() => {
    if (!open || !order) return;
    const requested =
      order.requestedDeliveryDate && /^\d{4}-\d{2}-\d{2}/.test(order.requestedDeliveryDate)
        ? order.requestedDeliveryDate.slice(0, 10)
        : romeToday();
    setDeliveryDate(requested < romeToday() ? romeToday() : requested);
    setDriverId("");
    setTimeWindow("");
    setPackages("");
    setPriority("normal");
    setNotes("");
  }, [open, order?.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/supplier/deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders", order?.id, "tracking"] });
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/orders/${order!.id}/assign-driver`, {
        driverMemberId: driverId,
        deliveryDate,
        timeWindow: timeWindow.trim() || null,
        packages: packages.trim() ? parseInt(packages, 10) : null,
        priority,
        notes: notes.trim() || null,
      });
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast({ title: lang === "de" ? "Fahrer zugewiesen ✓" : "Autista assegnato ✓" });
    },
    onError: async (err: any) => {
      toast({
        title: lang === "de" ? "Zuweisung fehlgeschlagen" : "Assegnazione non riuscita",
        description: err?.message?.replace(/^\d+:\s*/, ""),
        variant: "destructive",
      });
    },
  });

  const unassignMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/orders/${order!.id}/assign-driver`);
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      onOpenChange(false);
      toast({ title: lang === "de" ? "Zuweisung entfernt" : "Assegnazione rimossa" });
    },
    onError: () =>
      toast({ title: lang === "de" ? "Aktion fehlgeschlagen" : "Azione non riuscita", variant: "destructive" }),
  });

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-md max-h-[85vh] overflow-y-auto" data-testid="dialog-assign-driver">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {lang === "de" ? "Fahrer zuweisen" : "Assegna autista"}
          </DialogTitle>
          <DialogDescription>
            {lang === "de" ? "Bestellung" : "Ordine"} #{formatOrderNumber(order)} ·{" "}
            {order.restaurant?.companyName || order.restaurant?.name}
          </DialogDescription>
        </DialogHeader>

        {existing && tracking?.driver && (
          <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-sm flex items-center justify-between gap-2" data-testid="current-assignment">
            <span className="text-muted-foreground">
              {lang === "de" ? "Aktuell:" : "Attuale:"}{" "}
              <span className="font-medium text-foreground">{tracking.driver.name}</span>
            </span>
            {existing.status !== "delivered" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                disabled={unassignMutation.isPending}
                onClick={() => unassignMutation.mutate()}
                data-testid="button-unassign-driver"
              >
                <UserX className="h-3.5 w-3.5 mr-1" />
                {lang === "de" ? "Entfernen" : "Rimuovi"}
              </Button>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{lang === "de" ? "Fahrer" : "Autista"}</Label>
            {driversLoading ? (
              <div className="h-12 rounded-xl bg-muted animate-pulse" />
            ) : (drivers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-3">
                {lang === "de"
                  ? "Kein Fahrer im Team. Fügen Sie unter Team ein Mitglied mit der Rolle „Fahrer“ hinzu."
                  : "Nessun autista nel team. Aggiungi un membro con il ruolo \u201eAutista\u201c."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {(drivers ?? []).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDriverId(d.id)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                      driverId === d.id ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40"
                    }`}
                    data-testid={`option-driver-${d.id}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={d.profileImageUrl ?? undefined} />
                      <AvatarFallback className="text-xs">{d.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.name}</p>
                      {d.phone && <p className="text-xs text-muted-foreground truncate">{d.phone}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-date">{lang === "de" ? "Lieferdatum" : "Data consegna"}</Label>
              <Input
                id="assign-date"
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                data-testid="input-assign-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assign-window">{lang === "de" ? "Zeitfenster" : "Fascia oraria"}</Label>
              <Input
                id="assign-window"
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value)}
                placeholder="08:00–10:00"
                data-testid="input-assign-window"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="assign-packages">{lang === "de" ? "Pakete" : "Colli"}</Label>
              <Input
                id="assign-packages"
                type="number"
                min={0}
                value={packages}
                onChange={(e) => setPackages(e.target.value)}
                placeholder="z. B. 4"
                data-testid="input-assign-packages"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{lang === "de" ? "Priorität" : "Priorità"}</Label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPriority("normal")}
                  className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                    priority === "normal" ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                  }`}
                  data-testid="option-priority-normal"
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPriority("high")}
                  className={`flex-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1 ${
                    priority === "high"
                      ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                      : "hover:bg-muted/40"
                  }`}
                  data-testid="option-priority-high"
                >
                  <Flag className="h-3 w-3" />
                  {lang === "de" ? "Dringend" : "Urgente"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assign-notes">{lang === "de" ? "Hinweis für den Fahrer" : "Nota per l'autista"}</Label>
            <Textarea
              id="assign-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={lang === "de" ? "z. B. Lieferung an der Rampe abgeben" : "es. consegnare alla rampa"}
              data-testid="input-assign-notes"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-assign">
            {lang === "de" ? "Abbrechen" : "Annulla"}
          </Button>
          <Button
            disabled={!driverId || !deliveryDate || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
            data-testid="button-confirm-assign"
          >
            {assignMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Truck className="h-4 w-4 mr-2" />
                {existing ? (lang === "de" ? "Neu zuweisen" : "Riassegna") : lang === "de" ? "Zuweisen" : "Assegna"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
