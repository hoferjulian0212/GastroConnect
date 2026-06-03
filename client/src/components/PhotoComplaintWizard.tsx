import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Camera, X, ChevronLeft, Check, Loader2, Package } from "lucide-react";
import { COMPLAINT_REASONS, type ComplaintReason, type Order } from "@shared/schema";
import { getComplaintReasonLabel } from "@/lib/complaintReasons";

type Step = "photo" | "delivery" | "products" | "reason";

interface OrderListItem extends Order {
  supplier?: { id: string; name: string; companyName: string | null; profileImageUrl: string | null } | null;
}

interface OrderWithItems extends OrderListItem {
  items?: Array<{ productId: string; productName: string; quantity: number; unitPrice: string }>;
}

interface PhotoComplaintWizardProps {
  open: boolean;
  onClose: () => void;
}

export default function PhotoComplaintWizard({ open, onClose }: PhotoComplaintWizardProps) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("photo");
  const [photos, setPhotos] = useState<{ url: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const cancelledRef = useRef(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<ComplaintReason | "">("");
  const [note, setNote] = useState("");

  const reset = () => {
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    setPhotos([]);
    setStep("photo");
    setSelectedOrderId("");
    setSelectedProductIds(new Set());
    setReason("");
    setNote("");
  };

  useEffect(() => {
    if (!open) {
      cancelledRef.current = true;
      reset();
    } else {
      cancelledRef.current = false;
    }
    /* eslint-disable-next-line */
  }, [open]);

  useEffect(() => () => {
    cancelledRef.current = true;
    photos.forEach(p => URL.revokeObjectURL(p.preview));
    /* eslint-disable-next-line */
  }, []);

  const { data: orders } = useQuery<OrderListItem[]>({
    queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && open,
  });

  const recentDeliveries = useMemo(() => {
    if (!orders) return [];
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return orders
      .filter(o => {
        if (o.status !== "delivered" && o.status !== "in_delivery") return false;
        const t = new Date((o as any).updatedAt || o.createdAt).getTime();
        return t >= cutoff;
      })
      .sort((a, b) => new Date((b as any).updatedAt || b.createdAt).getTime() - new Date((a as any).updatedAt || a.createdAt).getTime())
      .slice(0, 12);
  }, [orders]);

  const { data: orderDetails } = useQuery<OrderWithItems>({
    queryKey: ["/api/orders", selectedOrderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${selectedOrderId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedOrderId && open,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (cancelledRef.current) break;
        const r = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type || "image/jpeg",
          prefix: "complaint-photos",
        });
        const { uploadURL, objectPath } = await r.json();
        const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
        if (!putRes.ok) throw new Error("upload-failed");
        if (cancelledRef.current) break;
        setPhotos(prev => [...prev, { url: objectPath, preview: URL.createObjectURL(file) }]);
      }
    } catch {
      if (!cancelledRef.current) {
        toast({ title: lang === "de" ? "Upload-Fehler" : "Errore upload", variant: "destructive" });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const selectedOrder = useMemo(() => recentDeliveries.find(o => o.id === selectedOrderId), [recentDeliveries, selectedOrderId]);

  const toggleProduct = (productId: string) => {
    setSelectedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id || !selectedOrder || !reason) throw new Error("missing");
      const items = (orderDetails?.items || [])
        .filter(i => selectedProductIds.has(i.productId))
        .map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPrice: String(i.unitPrice) }));
      const reasonLabel = getComplaintReasonLabel(reason as ComplaintReason, lang);
      const title = lang === "de"
        ? `Foto-Reklamation: ${reasonLabel}`
        : `Reclamo con foto: ${reasonLabel}`;
      const description = note.trim() || (lang === "de"
        ? `Reklamation mit ${photos.length} Foto${photos.length === 1 ? "" : "s"} erstellt.`
        : `Reclamo creato con ${photos.length} foto.`);
      const hasAffected = items.length > 0;
      const body = {
        orderId: selectedOrder.id,
        restaurantId: currentUser.id,
        supplierId: selectedOrder.supplierId,
        title: hasAffected ? `[PRIORITY IMMEDIATE] ${title}` : title,
        description,
        mediaUrls: photos.map(p => p.url),
        priorityImmediate: hasAffected,
        reason: reason as ComplaintReason,
        affectedItems: hasAffected ? items : undefined,
      };
      return apiRequest("POST", "/api/complaints", body);
    },
    onSuccess: () => {
      toast({
        title: lang === "de" ? "Reklamation gesendet" : "Reclamo inviato",
        description: lang === "de" ? "Fotos und Details wurden übermittelt." : "Foto e dettagli inviati.",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/complaints?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      onClose();
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler beim Senden" : "Errore invio", variant: "destructive" });
    },
  });

  const formatDate = (d: Date | string) =>
    new Date(d).toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  const goNext = () => {
    if (step === "photo") setStep("delivery");
    else if (step === "delivery") setStep("products");
    else if (step === "products") setStep("reason");
  };
  const goBack = () => {
    if (step === "delivery") setStep("photo");
    else if (step === "products") setStep("delivery");
    else if (step === "reason") setStep("products");
  };

  const canNext =
    (step === "photo" && photos.length > 0 && !uploading) ||
    (step === "delivery" && !!selectedOrderId) ||
    (step === "products");
  const canSubmit = step === "reason" && !!reason && !createMutation.isPending;

  const stepIndex = ["photo", "delivery", "products", "reason"].indexOf(step);

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent className="max-h-[92vh]" data-testid="drawer-photo-complaint">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <button
              onClick={step === "photo" ? onClose : goBack}
              className="h-9 w-9 -ml-2 inline-flex items-center justify-center rounded-full hover-elevate"
              data-testid="button-wizard-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DrawerTitle className="text-base font-semibold">
              {lang === "de" ? "Foto-Reklamation" : "Reclamo con foto"}
            </DrawerTitle>
            <button
              onClick={onClose}
              className="h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-full hover-elevate"
              data-testid="button-wizard-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-1 mt-2">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= stepIndex ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
        </DrawerHeader>

        <div className="px-4 pt-1 pb-5 overflow-y-auto">
          {step === "photo" && (
            <div className="space-y-3" data-testid="step-photo">
              <p className="text-sm text-muted-foreground">
                {lang === "de"
                  ? "Knipse Fotos vom Problem (du kannst mehrere machen)."
                  : "Scatta foto del problema (puoi farne diverse)."}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-photo-capture"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-14 gap-2 rounded-2xl"
                data-testid="button-take-photo"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {uploading
                  ? (lang === "de" ? "Hochladen..." : "Caricamento...")
                  : photos.length === 0
                    ? (lang === "de" ? "Foto aufnehmen" : "Scatta foto")
                    : (lang === "de" ? "Weiteres Foto" : "Altra foto")}
              </Button>

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-muted" data-testid={`photo-thumb-${i}`}>
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white inline-flex items-center justify-center"
                        data-testid={`button-remove-photo-${i}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === "delivery" && (
            <div className="space-y-2" data-testid="step-delivery">
              <p className="text-sm text-muted-foreground">
                {lang === "de"
                  ? "Zu welcher Lieferung gehört das Problem? (letzte 7 Tage)"
                  : "A quale consegna appartiene? (ultimi 7 giorni)"}
              </p>
              {recentDeliveries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {lang === "de" ? "Keine Lieferungen in den letzten 7 Tagen." : "Nessuna consegna negli ultimi 7 giorni."}
                </div>
              ) : (
                <div className="space-y-2">
                  {recentDeliveries.map(o => {
                    const supName = o.supplier?.companyName || o.supplier?.name || "—";
                    const dateStr = formatDate((o as any).updatedAt || o.createdAt);
                    const active = selectedOrderId === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setSelectedOrderId(o.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                        data-testid={`delivery-card-${o.id}`}
                      >
                        <Avatar className="h-10 w-10">
                          {o.supplier?.profileImageUrl ? <AvatarImage src={o.supplier.profileImageUrl} /> : null}
                          <AvatarFallback className="text-xs">{supName.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{supName}</div>
                          <div className="text-xs text-muted-foreground">{dateStr} · {o.status === "delivered" ? (lang === "de" ? "Geliefert" : "Consegnato") : (lang === "de" ? "In Lieferung" : "In consegna")}</div>
                        </div>
                        {active && <Check className="h-5 w-5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "products" && (
            <div className="space-y-2" data-testid="step-products">
              <p className="text-sm text-muted-foreground">
                {lang === "de"
                  ? "Welche Produkte sind betroffen? (optional)"
                  : "Quali prodotti sono interessati? (opzionale)"}
              </p>
              {!orderDetails?.items?.length ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  {lang === "de" ? "Keine Produkte." : "Nessun prodotto."}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {orderDetails.items.map((it) => {
                    const active = selectedProductIds.has(it.productId);
                    return (
                      <button
                        key={it.productId}
                        onClick={() => toggleProduct(it.productId)}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover-elevate"}`}
                        data-testid={`product-card-${it.productId}`}
                      >
                        <div className={`h-5 w-5 rounded-md border-2 inline-flex items-center justify-center shrink-0 ${active ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                          {active && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{it.productName}</div>
                          <div className="text-xs text-muted-foreground">{it.quantity}× · {Number(it.unitPrice).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === "reason" && (
            <div className="space-y-3" data-testid="step-reason">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{lang === "de" ? "Grund" : "Motivo"}</label>
                <Select value={reason || undefined} onValueChange={(v) => setReason(v as ComplaintReason)}>
                  <SelectTrigger className="h-11" data-testid="select-reason"><SelectValue placeholder={lang === "de" ? "Grund wählen" : "Seleziona motivo"} /></SelectTrigger>
                  <SelectContent>
                    {COMPLAINT_REASONS.map(r => (
                      <SelectItem key={r} value={r} data-testid={`reason-${r}`}>{getComplaintReasonLabel(r, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{lang === "de" ? "Notiz (optional)" : "Nota (opzionale)"}</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={lang === "de" ? "Kurze Beschreibung..." : "Breve descrizione..."}
                  data-testid="input-note"
                />
              </div>
              <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1">
                <div><span className="text-muted-foreground">{lang === "de" ? "Fotos:" : "Foto:"}</span> {photos.length}</div>
                <div><span className="text-muted-foreground">{lang === "de" ? "Lieferung:" : "Consegna:"}</span> {selectedOrder?.supplier?.companyName || selectedOrder?.supplier?.name || "—"}</div>
                <div><span className="text-muted-foreground">{lang === "de" ? "Produkte:" : "Prodotti:"}</span> {selectedProductIds.size}</div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-background p-3 pb-[max(env(safe-area-inset-bottom),12px)] flex gap-2">
          {step !== "reason" ? (
            <Button onClick={goNext} disabled={!canNext} className="w-full h-12 rounded-xl" data-testid="button-wizard-next">
              {lang === "de" ? "Weiter" : "Avanti"}
            </Button>
          ) : (
            <Button onClick={() => createMutation.mutate()} disabled={!canSubmit} className="w-full h-12 rounded-xl gap-2" data-testid="button-wizard-submit">
              {createMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {lang === "de" ? "Reklamation senden" : "Invia reclamo"}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
