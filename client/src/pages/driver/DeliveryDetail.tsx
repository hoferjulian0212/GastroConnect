import { useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/context/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Navigation,
  Phone,
  MessageCircle,
  MapPin,
  Package,
  Clock,
  Flag,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Camera,
  Loader2,
  X,
} from "lucide-react";
import { formatOrderNumber, type DeliveryAssignmentWithDetails } from "@shared/schema";
import { DELIVERY_STATUS_META, PROBLEM_TYPE_LABELS, StatusPill, mapsDirectionsUrl } from "./DeliveryStatus";

const PROBLEM_OPTIONS = ["not_reachable", "refused", "damaged", "wrong_address", "traffic", "other"] as const;
const REJECT_OPTIONS = ["no_time", "not_reachable", "refused", "damaged", "wrong_address", "traffic", "other"] as const;

export default function DriverDeliveryDetail() {
  const [, params] = useRoute("/supplier/delivery/:id");
  const [, setLocation] = useLocation();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const id = params?.id ?? "";

  const [completeOpen, setCompleteOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);
  const [podRecipient, setPodRecipient] = useState("");
  const [podNote, setPodNote] = useState("");
  const [podPhoto, setPodPhoto] = useState<{ url: string; preview: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problemType, setProblemType] = useState<string>("not_reachable");
  const [problemNote, setProblemNote] = useState("");
  const [problemMode, setProblemMode] = useState<"problem" | "delay" | "reject">("problem");
  const [delayMinutes, setDelayMinutes] = useState<number>(15);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: delivery, isLoading } = useQuery<DeliveryAssignmentWithDetails>({
    queryKey: ["/api/driver/deliveries", id],
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/driver/deliveries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/driver/deliveries", id] });
  };

  const statusMutation = useMutation({
    mutationFn: async (status: "picked_up" | "en_route" | "arriving") => {
      const r = await apiRequest("PATCH", `/api/driver/deliveries/${id}/status`, { status });
      return r.json();
    },
    onSuccess: invalidate,
    onError: () =>
      toast({ title: lang === "de" ? "Aktion fehlgeschlagen" : "Azione non riuscita", variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/driver/deliveries/${id}/complete`, {
        podRecipient: podRecipient.trim() || null,
        podNote: podNote.trim() || null,
        podPhotoUrl: podPhoto?.url ?? null,
      });
      return r.json();
    },
    onSuccess: () => {
      setCompleteOpen(false);
      invalidate();
      toast({ title: lang === "de" ? "Lieferung zugestellt ✓" : "Consegna completata ✓" });
    },
    onError: () =>
      toast({ title: lang === "de" ? "Aktion fehlgeschlagen" : "Azione non riuscita", variant: "destructive" }),
  });

  const problemMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/driver/deliveries/${id}/problem`, {
        problemType,
        note: problemNote.trim() || null,
      });
      return r.json();
    },
    onSuccess: () => {
      setProblemOpen(false);
      invalidate();
      toast({ title: lang === "de" ? "Problem gemeldet" : "Problema segnalato" });
    },
    onError: () =>
      toast({ title: lang === "de" ? "Aktion fehlgeschlagen" : "Azione non riuscita", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/driver/deliveries/${id}/reject`, {
        reason: problemType,
        note: problemNote.trim() || null,
      });
      return r.json();
    },
    onSuccess: () => {
      setProblemOpen(false);
      invalidate();
      toast({
        title: lang === "de" ? "Lieferung abgelehnt" : "Consegna rifiutata",
        description: lang === "de"
          ? "Die Bestellung liegt jetzt beim Büro zur Prüfung."
          : "L'ordine è ora in ufficio per la verifica.",
      });
    },
    onError: () =>
      toast({ title: lang === "de" ? "Aktion fehlgeschlagen" : "Azione non riuscita", variant: "destructive" }),
  });

  const delayMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/driver/deliveries/${id}/delay`, {
        delayMinutes,
        note: problemNote.trim() || null,
      });
      return r.json();
    },
    onSuccess: (data: { affectedCount?: number }) => {
      setProblemOpen(false);
      invalidate();
      toast({
        title: lang === "de" ? "Verspätung gemeldet" : "Ritardo segnalato",
        description: lang === "de"
          ? `Ankunftszeiten von ${data.affectedCount ?? 0} Stopp(s) wurden angepasst.`
          : `Gli orari di arrivo di ${data.affectedCount ?? 0} fermata/e sono stati aggiornati.`,
      });
    },
    onError: () =>
      toast({ title: lang === "de" ? "Aktion fehlgeschlagen" : "Azione non riuscita", variant: "destructive" }),
  });

  const handlePhoto = async (file: File) => {
    setUploading(true);
    try {
      const r = await apiRequest("POST", "/api/uploads/request-url", {
        name: file.name,
        size: file.size,
        contentType: file.type || "image/jpeg",
        prefix: "pod-photos",
      });
      const { uploadURL, objectPath } = await r.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/jpeg" },
      });
      if (!putRes.ok) throw new Error("upload-failed");
      setPodPhoto({ url: objectPath, preview: URL.createObjectURL(file) });
    } catch {
      toast({ title: lang === "de" ? "Upload-Fehler" : "Errore upload", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoading || !delivery) {
    return (
      <div className="space-y-4 pt-2 pb-[var(--mobile-bottom-pad)] md:pb-6">
        <Skeleton className="h-10 w-32 rounded-full" />
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const r = delivery.restaurant;
  const address = [r.address, [r.postalCode, r.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const meta = DELIVERY_STATUS_META[delivery.status];
  const StatusIcon = meta.icon;
  const isDone = delivery.status === "delivered";
  const isProblem = delivery.status === "problem";
  const total = delivery.order.items.reduce((s, it) => s + parseFloat(it.totalPrice ?? "0"), 0);

  const nextAction: { label: string; sub: string; status: "picked_up" | "en_route" | "arriving" } | null =
    delivery.status === "assigned"
      ? {
          label: lang === "de" ? "Lieferung übernehmen" : "Ritira la consegna",
          sub: lang === "de" ? "Ware geladen, bereit zur Abfahrt" : "Merce caricata, pronta alla partenza",
          status: "picked_up",
        }
      : delivery.status === "picked_up"
        ? {
            label: lang === "de" ? "Losfahren" : "Parti",
            sub: lang === "de" ? "Kunde wird benachrichtigt" : "Il cliente verrà avvisato",
            status: "en_route",
          }
        : delivery.status === "en_route"
          ? {
              label: lang === "de" ? "Gleich da" : "Sto arrivando",
              sub: lang === "de" ? "Kunde wird benachrichtigt" : "Il cliente verrà avvisato",
              status: "arriving",
            }
          : null;

  return (
    <div className="space-y-4 pt-2 pb-[var(--mobile-bottom-pad)] md:pb-6" data-testid="page-delivery-detail">
      <button
        onClick={() => setLocation("/supplier")}
        className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
        data-testid="button-back"
      >
        <ArrowLeft className="h-4 w-4" />
        {lang === "de" ? "Zurück" : "Indietro"}
      </button>

      {/* Header card */}
      <div className="rounded-2xl border bg-card p-5 text-center space-y-3">
        <div
          className={`mx-auto h-14 w-14 rounded-full flex items-center justify-center ${meta.pillClass}`}
          data-testid="icon-status"
        >
          <StatusIcon className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-restaurant-name">
            {r.companyName || r.name}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">#{formatOrderNumber(delivery.order)}</p>
        </div>
        <div className="flex justify-center">
          <StatusPill status={delivery.status} lang={lang} />
        </div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {delivery.timeWindow && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {delivery.timeWindow}
            </span>
          )}
          {delivery.packages != null && (
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {delivery.packages} {lang === "de" ? "Pakete" : "colli"}
            </span>
          )}
          {delivery.priority === "high" && (
            <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
              <Flag className="h-3.5 w-3.5" />
              {lang === "de" ? "Dringend" : "Urgente"}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2">
        <a
          href={mapsDirectionsUrl(r)}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border bg-card p-3 flex flex-col items-center gap-1.5 hover:bg-muted/40 transition-colors"
          data-testid="button-navigate"
        >
          <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-medium">{lang === "de" ? "Navigation" : "Naviga"}</span>
        </a>
        {r.phone ? (
          <a
            href={`tel:${r.phone}`}
            className="rounded-2xl border bg-card p-3 flex flex-col items-center gap-1.5 hover:bg-muted/40 transition-colors"
            data-testid="button-call"
          >
            <Phone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium">{lang === "de" ? "Anrufen" : "Chiama"}</span>
          </a>
        ) : (
          <div className="rounded-2xl border bg-card p-3 flex flex-col items-center gap-1.5 opacity-40">
            <Phone className="h-5 w-5" />
            <span className="text-xs font-medium">{lang === "de" ? "Anrufen" : "Chiama"}</span>
          </div>
        )}
        <button
          onClick={() => setLocation(`/supplier/inbox?to=${r.id}`)}
          className="rounded-2xl border bg-card p-3 flex flex-col items-center gap-1.5 hover:bg-muted/40 transition-colors"
          data-testid="button-message"
        >
          <MessageCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <span className="text-xs font-medium">{lang === "de" ? "Nachricht" : "Messaggio"}</span>
        </button>
      </div>

      {/* Address */}
      {address && (
        <div className="rounded-2xl bg-muted/30 p-4 flex items-start gap-3" data-testid="card-address">
          <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">{address}</p>
            {delivery.notes && (
              <p className="text-sm text-muted-foreground mt-1" data-testid="text-delivery-notes">
                📝 {delivery.notes}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Problem banner */}
      {isProblem && delivery.problemType && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {PROBLEM_TYPE_LABELS[delivery.problemType]?.[lang] ?? delivery.problemType}
            </p>
            {delivery.problemNote && (
              <p className="text-sm text-red-700/80 dark:text-red-300/80 mt-0.5">{delivery.problemNote}</p>
            )}
          </div>
        </div>
      )}

      {/* POD info */}
      {isDone && (delivery.podRecipient || delivery.podNote || delivery.podPhotoUrl) && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            {lang === "de" ? "Zustellnachweis" : "Prova di consegna"}
          </p>
          {delivery.podRecipient && (
            <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">
              {lang === "de" ? "Empfangen von:" : "Ricevuto da:"} {delivery.podRecipient}
            </p>
          )}
          {delivery.podNote && (
            <p className="text-sm text-emerald-800/80 dark:text-emerald-300/80">{delivery.podNote}</p>
          )}
          {delivery.podPhotoUrl && (
            <img src={delivery.podPhotoUrl} alt="POD" className="rounded-xl max-h-48 object-cover" data-testid="img-pod" />
          )}
        </div>
      )}

      {/* Items */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <p className="px-4 pt-4 pb-2 text-sm font-semibold">
          {lang === "de" ? "Bestellte Artikel" : "Articoli ordinati"} ({delivery.order.items.length})
        </p>
        <div className="divide-y">
          {delivery.order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-item-${item.id}`}>
              {item.productImageUrl ? (
                <img src={item.productImageUrl} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity}x {item.productUnit ?? ""}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t bg-muted/20 flex justify-between text-sm font-semibold">
          <span>{lang === "de" ? "Gesamt" : "Totale"}</span>
          <span data-testid="text-order-total">€ {total.toFixed(2)}</span>
        </div>
      </div>

      {/* Actions */}
      {!isDone && (
        <div className="space-y-2 pt-1">
          {nextAction && (
            <Button
              size="lg"
              className="w-full h-14 text-base font-semibold rounded-2xl"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(nextAction.status)}
              data-testid="button-next-status"
            >
              {statusMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Truck className="h-5 w-5 mr-2" />
                  {nextAction.label}
                </>
              )}
            </Button>
          )}
          {(delivery.status === "en_route" || delivery.status === "arriving" || isProblem) && (
            <Button
              size="lg"
              className="w-full h-14 text-base font-semibold rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setCompleteOpen(true)}
              data-testid="button-mark-delivered"
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              {lang === "de" ? "Als geliefert markieren" : "Segna come consegnato"}
            </Button>
          )}
          {!isProblem && (
            <Button
              size="lg"
              variant="outline"
              className="w-full h-12 rounded-2xl text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => setProblemOpen(true)}
              data-testid="button-report-problem"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              {lang === "de" ? "Problem melden" : "Segnala un problema"}
            </Button>
          )}
        </div>
      )}

      {/* Complete dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>{lang === "de" ? "Lieferung abschließen" : "Completa la consegna"}</DialogTitle>
            <DialogDescription>
              {lang === "de"
                ? "Optional: Empfänger, Notiz und Foto als Zustellnachweis."
                : "Facoltativo: destinatario, nota e foto come prova di consegna."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pod-recipient">{lang === "de" ? "Empfangen von" : "Ricevuto da"}</Label>
              <Input
                id="pod-recipient"
                value={podRecipient}
                onChange={(e) => setPodRecipient(e.target.value)}
                placeholder={lang === "de" ? "z. B. Küchenchef Markus" : "es. Chef Marco"}
                data-testid="input-pod-recipient"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pod-note">{lang === "de" ? "Notiz" : "Nota"}</Label>
              <Textarea
                id="pod-note"
                value={podNote}
                onChange={(e) => setPodNote(e.target.value)}
                rows={2}
                placeholder={lang === "de" ? "z. B. an der Rampe abgestellt" : "es. lasciato alla rampa"}
                data-testid="input-pod-note"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
              data-testid="input-pod-photo"
            />
            {podPhoto ? (
              <div className="relative inline-block">
                <img src={podPhoto.preview} alt="POD" className="rounded-xl max-h-36 object-cover" />
                <button
                  onClick={() => setPodPhoto(null)}
                  className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center"
                  data-testid="button-remove-pod-photo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-add-pod-photo"
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                {lang === "de" ? "Foto aufnehmen" : "Scatta una foto"}
              </Button>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)} data-testid="button-cancel-complete">
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={completeMutation.isPending || uploading}
              onClick={() => completeMutation.mutate()}
              data-testid="button-confirm-complete"
            >
              {completeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {lang === "de" ? "Zugestellt" : "Consegnato"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Problem / delay / reject dialog */}
      <Dialog open={problemOpen} onOpenChange={setProblemOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>
              {problemMode === "delay"
                ? (lang === "de" ? "Verspätung melden" : "Segnala ritardo")
                : problemMode === "reject"
                  ? (lang === "de" ? "Lieferung ablehnen" : "Rifiuta la consegna")
                  : (lang === "de" ? "Problem melden" : "Segnala un problema")}
            </DialogTitle>
            <DialogDescription>
              {problemMode === "delay"
                ? (lang === "de"
                    ? "Nur zur Info – die Ankunftszeiten der weiteren Stopps werden automatisch angepasst."
                    : "Solo a titolo informativo: gli orari di arrivo delle fermate successive verranno aggiornati automaticamente.")
                : problemMode === "reject"
                  ? (lang === "de"
                      ? "Die Bestellung geht zurück ans Büro und wird dort neu geplant."
                      : "L'ordine torna in ufficio per essere ripianificato.")
                  : (lang === "de"
                      ? "Das Büro wird sofort benachrichtigt."
                      : "L'ufficio verrà avvisato immediatamente.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mode switcher */}
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted/50 p-1">
              {([
                ["problem", lang === "de" ? "Problem" : "Problema"],
                ["delay", lang === "de" ? "Verspätung" : "Ritardo"],
                ["reject", lang === "de" ? "Ablehnen" : "Rifiuta"],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => setProblemMode(m)}
                  className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                    problemMode === m
                      ? m === "delay"
                        ? "bg-amber-500 text-white"
                        : "bg-red-600 text-white"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                  data-testid={`mode-${m}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {problemMode === "delay" ? (
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDelayMinutes(m)}
                    className={`rounded-xl border p-2.5 text-sm font-semibold transition-colors ${
                      delayMinutes === m
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                        : "hover:bg-muted/40"
                    }`}
                    data-testid={`option-delay-${m}`}
                  >
                    +{m}′
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {(problemMode === "reject" ? REJECT_OPTIONS : PROBLEM_OPTIONS).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProblemType(p)}
                    className={`rounded-xl border p-2.5 text-xs font-medium text-left transition-colors ${
                      problemType === p
                        ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300"
                        : "hover:bg-muted/40"
                    }`}
                    data-testid={`option-problem-${p}`}
                  >
                    {PROBLEM_TYPE_LABELS[p][lang]}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              value={problemNote}
              onChange={(e) => setProblemNote(e.target.value)}
              rows={2}
              placeholder={lang === "de" ? "Details (optional)" : "Dettagli (facoltativo)"}
              data-testid="input-problem-note"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setProblemOpen(false)} data-testid="button-cancel-problem">
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            {problemMode === "delay" ? (
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white"
                disabled={delayMutation.isPending}
                onClick={() => delayMutation.mutate()}
                data-testid="button-confirm-delay"
              >
                {delayMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  lang === "de" ? `+${delayMinutes} Min. melden` : `Segnala +${delayMinutes} min`
                )}
              </Button>
            ) : problemMode === "reject" ? (
              <Button
                variant="destructive"
                disabled={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate()}
                data-testid="button-confirm-reject"
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  lang === "de" ? "Ablehnen" : "Rifiuta"
                )}
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={problemMutation.isPending}
                onClick={() => problemMutation.mutate()}
                data-testid="button-confirm-problem"
              >
                {problemMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  lang === "de" ? "Melden" : "Segnala"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
