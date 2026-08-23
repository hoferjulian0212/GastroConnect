import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, useSearch } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getComplaintStatus } from "@/lib/translations";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { ArrowLeft, Clock, Loader2, CheckCircle, XCircle, AlertTriangle, AlertCircle, Flame, Check, Image as ImageIcon, MessageSquare, Play, RotateCcw, Ban, Send, Truck, Plus, MoreHorizontal, ThumbsDown, CheckSquare, Percent, Package, CalendarDays } from "lucide-react";
import { getComplaintReasonLabel } from "@/lib/complaintReasons";
import { Badge } from "@/components/ui/badge";
import { CounterpartyContactCard } from "@/components/CounterpartyContactCard";
import { DocumentUploadDialog } from "@/components/DocumentUploadDialog";
import { Upload, FileText, Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { TONE, complaintStatusTone } from "@/lib/status-colors";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProductImage } from "@/components/ProductImage";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatComplaintNumber, formatOrderNumber, type ComplaintWithDetails, type ComplaintStatusHistoryWithUser, type ComplaintCommentWithUser } from "@shared/schema";
import { HeroPortal } from "@/context/HeroContext";

type ConfirmAction = "in_progress" | "resolved" | "closed" | "reopen" | "follow_up" | "comment" | "proposal" | "rejected" | "partially_resolved" | null;
type ProposalKind = "credit" | "redelivery" | "cancel";

export default function ComplaintDetail() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [matchRestaurant, paramsR] = useRoute("/restaurant/complaints/:id");
  const [matchSupplier, paramsS] = useRoute("/supplier/complaints/:id");
  const params = matchRestaurant ? paramsR : paramsS;
  const complaintId = params?.id;
  const { currentRole, currentUser } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const dateLocale = lang === "de" ? de : it;
  const isSupplier = currentRole === "supplier";

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [commentText, setCommentText] = useState("");
  const [rejectionReasonText, setRejectionReasonText] = useState("");
  const [closeNoteText, setCloseNoteText] = useState("");
  const [followUpCompensation, setFollowUpCompensation] = useState(false);
  const [proposalKind, setProposalKind] = useState<ProposalKind>("credit");
  const [followUpDateTouched, setFollowUpDateTouched] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().split("T")[0];
  });
  const followUpDateAutoApplied = useRef(false);
  const [mobileTab, setMobileTab] = useState<"updates" | "details">("updates");
  const isMobile = useIsMobile();
  const resetConfirmState = () => {
    setConfirmAction(null);
    setCommentText("");
    setCloseNoteText("");
    setRejectionReasonText("");
    setFollowUpCompensation(false);
    setProposalKind("credit");
    setFollowUpDateTouched(false);
  };
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const actionApplied = useRef(false);

  useEffect(() => {
    if (actionApplied.current) return;
    const params = new URLSearchParams(searchString);
    const action = params.get("action");
    const allowed: ConfirmAction[] = ["in_progress", "rejected", "partially_resolved", "follow_up", "resolved", "closed", "comment"];
    if (action && (allowed as string[]).includes(action)) {
      setConfirmAction(action as ConfirmAction);
      actionApplied.current = true;
    }
  }, [searchString]);

  const { data: complaint, isLoading } = useQuery<ComplaintWithDetails>({
    queryKey: ["/api/complaints", complaintId],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}`);
      if (!res.ok) throw new Error("Failed to fetch complaint");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const { data: complaintDocuments } = useQuery<any[]>({
    queryKey: ["/api/complaints", complaintId, "documents"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}/documents`);
      if (!res.ok) throw new Error("Failed to fetch complaint documents");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const { data: statusHistory } = useQuery<ComplaintStatusHistoryWithUser[]>({
    queryKey: ["/api/complaints", complaintId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}/status-history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const { data: comments } = useQuery<ComplaintCommentWithUser[]>({
    queryKey: ["/api/complaints", complaintId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}/comments`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: !!complaintId,
  });

  const { data: conversations } = useQuery<any[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id && !!complaint,
  });

  const { data: deliverySchedules } = useQuery<any[]>({
    queryKey: [`/api/delivery-schedules/restaurant?supplierId=${complaint?.supplierId}&restaurantId=${complaint?.restaurantId}`],
    enabled: !!complaint?.supplierId && !!complaint?.restaurantId && isSupplier,
  });

  const suggestedFollowUpDate = (() => {
    const days = (deliverySchedules || []).map((s: any) => s.dayOfWeek).filter((d: any) => typeof d === "number");
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    if (days.length === 0) return fallback.toISOString().split("T")[0];
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (days.includes(d.getDay())) return d.toISOString().split("T")[0];
    }
    return fallback.toISOString().split("T")[0];
  })();

  useEffect(() => {
    if (followUpDateAutoApplied.current || followUpDateTouched) return;
    if (deliverySchedules && deliverySchedules.length > 0 && suggestedFollowUpDate) {
      setFollowUpDate(suggestedFollowUpDate);
      followUpDateAutoApplied.current = true;
    }
  }, [deliverySchedules, suggestedFollowUpDate, followUpDateTouched]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/complaints", complaintId] });
    queryClient.invalidateQueries({ queryKey: ["/api/complaints", complaintId, "status-history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/complaints", complaintId, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (vars: { status: "open" | "in_progress" | "resolved" | "closed" | "rejected" | "partially_resolved"; rejectionReason?: string; closeNote?: string }) => {
      await apiRequest("PATCH", `/api/complaints/${complaintId}`, {
        status: vars.status,
        changedBy: currentUser?.name || currentUser?.id,
        actorRole: currentRole,
        ...(vars.rejectionReason ? { rejectionReason: vars.rejectionReason } : {}),
        ...(vars.closeNote ? { closeNote: vars.closeNote } : {}),
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      setRejectionReasonText("");
      setCloseNoteText("");
      setCommentText("");
      invalidateAll();
      toast({ title: lang === "de" ? "Status aktualisiert" : "Stato aggiornato" });
    },
    onError: (err: any) => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", description: err?.message, variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      await apiRequest("POST", `/api/complaints/${complaintId}/comments`, {
        userId: currentUser?.id,
        content,
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      setCommentText("");
      invalidateAll();
      toast({ title: lang === "de" ? "Kommentar hinzugefügt" : "Commento aggiunto" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const followUpMutation = useMutation({
    mutationFn: async (vars: { date: string; compensation: boolean }) => {
      if (!complaint) return;
      let items: any[] = [];
      try {
        items = JSON.parse((complaint.affectedItems as string) || "[]");
      } catch {}
      const factor = vars.compensation ? 1.1 : 1;
      const orderItems = items
        .filter((i: any) => i.productId)
        .map((i: any) => ({
          productId: i.productId,
          productName: i.name || i.productName,
          quantity: Math.max(1, Math.round(Number(i.quantity || 1) * factor)),
          unitPrice: i.unitPrice,
        }));
      if (orderItems.length === 0) {
        throw new Error("no-items");
      }
      await apiRequest("POST", `/api/complaints/${complaintId}/follow-up-order`, {
        items: orderItems,
        deliveryDate: vars.date,
        supplierId: complaint.supplierId,
        notes: lang === "de"
          ? `Nachlieferung zu Reklamation #${formatComplaintNumber(complaint)}${vars.compensation ? " (+10% Kompensation)" : ""}`
          : `Riconsegna per reclamo #${formatComplaintNumber(complaint)}${vars.compensation ? " (+10% compensazione)" : ""}`,
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: lang === "de" ? "Nachlieferung erstellt" : "Riconsegna creata",
        description: lang === "de" ? "Die Folgebestellung wurde erstellt und bestätigt." : "L'ordine successivo è stato creato e confermato.",
      });
    },
    onError: (err: any) => {
      const isNoItems = err?.message === "no-items";
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        description: isNoItems
          ? (lang === "de" ? "Keine Produkte mit IDs verfügbar." : "Nessun prodotto con ID disponibile.")
          : undefined,
        variant: "destructive",
      });
    },
  });

  const sendProposalMutation = useMutation({
    mutationFn: async (kind: ProposalKind) => {
      const labels: Record<ProposalKind, { de: string; it: string; desc: { de: string; it: string }; impactSign: 1 | -1 | 0 }> = {
        credit:     { de: "Gutschrift",    it: "Nota di credito",   desc: { de: "Wert wird auf nächste Rechnung gutgeschrieben.",      it: "L'importo verrà accreditato sulla prossima fattura." }, impactSign: -1 },
        redelivery: { de: "Nachlieferung", it: "Riconsegna",        desc: { de: "Betroffene Artikel werden kostenfrei nachgeliefert.", it: "Gli articoli interessati verranno riconsegnati senza costi." }, impactSign: 0 },
        cancel:     { de: "Storno",        it: "Storno",            desc: { de: "Position wird storniert und nicht berechnet.",        it: "La posizione verrà annullata e non addebitata." }, impactSign: -1 },
      };
      let items: any[] = [];
      try {
        items = JSON.parse((complaint?.affectedItems as string) || "[]");
      } catch {}
      const total = items.reduce((sum: number, i: any) => {
        const qty = parseFloat(i.quantity) || 0;
        const price = parseFloat(i.unitPrice) || 0;
        return sum + qty * price;
      }, 0);
      const fmt = (n: number) => n.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const label = lang === "de" ? labels[kind].de : labels[kind].it;
      const desc = lang === "de" ? labels[kind].desc.de : labels[kind].desc.it;
      const impact = labels[kind].impactSign * total;
      const impactLine = total > 0
        ? (lang === "de"
            ? `Geschätzte Auswirkung: ${impact >= 0 ? "+" : "−"}${fmt(Math.abs(impact))} €`
            : `Impatto stimato: ${impact >= 0 ? "+" : "−"}${fmt(Math.abs(impact))} €`)
        : "";
      const headline = lang === "de" ? `Vorschlag: ${label}` : `Proposta: ${label}`;
      const content = [headline, desc, impactLine].filter(Boolean).join("\n");
      await apiRequest("POST", `/api/complaints/${complaintId}/comments`, {
        userId: currentUser?.id,
        content,
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      invalidateAll();
      toast({ title: lang === "de" ? "Vorschlag gesendet" : "Proposta inviata" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const navigateToChat = () => {
    if (!complaint) return;
    const counterpartyId = isSupplier ? complaint.restaurantId : complaint.supplierId;
    const conv = conversations?.find((c: any) => c.otherUser?.id === counterpartyId);
    const refParams = `&complaintRefId=${complaint.id}${complaint.complaintNumber ? `&complaintNumber=${encodeURIComponent(String(complaint.complaintNumber))}` : ""}`;
    if (conv) {
      setLocation(`/${currentRole}/inbox?chat=${conv.id}${refParams}`);
    } else {
      setLocation(`/${currentRole}/inbox?${refParams.replace(/^&/, "")}&to=${counterpartyId}`);
    }
  };

  const goBack = () => {
    setLocation(`/${currentRole}/complaints`);
  };

  const getStatusIcon = (status: string, size = "h-5 w-5") => {
    switch (status) {
      case "open": return <Clock className={size} />;
      case "in_progress": return <Loader2 className={size} />;
      case "resolved": return <CheckCircle className={size} />;
      case "closed": return <XCircle className={size} />;
      case "rejected": return <ThumbsDown className={size} />;
      case "partially_resolved": return <CheckSquare className={size} />;
      default: return <AlertTriangle className={size} />;
    }
  };

  const getStatusBg = (status: string) => TONE[complaintStatusTone(status)].bg;
  const getStatusTextColor = (status: string) => TONE[complaintStatusTone(status)].text;
  const getStatusBadgeColor = (status: string) => TONE[complaintStatusTone(status)].badge;
  const getTimelineDotColor = (status: string) => {
    switch (complaintStatusTone(status)) {
      case "emerald": return "border-emerald-500 bg-emerald-500";
      case "amber": return "border-amber-500 bg-amber-500";
      case "red": return "border-red-500 bg-red-500";
      case "indigo": return "border-indigo-500 bg-indigo-500";
      default: return "border-slate-400 bg-slate-400";
    }
  };

  const getTimelineDescription = (toStatus: string) => {
    if (lang === "de") {
      switch (toStatus) {
        case "open": return "Reklamation wurde erstellt";
        case "in_progress": return "Reklamation wird bearbeitet";
        case "resolved": return "Reklamation wurde gelöst";
        case "closed": return "Reklamation wurde geschlossen";
        case "rejected": return "Reklamation wurde abgelehnt";
        case "partially_resolved": return "Reklamation teilweise gelöst";
        default: return "";
      }
    }
    switch (toStatus) {
      case "open": return "Reclamo creato";
      case "in_progress": return "Reclamo in lavorazione";
      case "resolved": return "Reclamo risolto";
      case "closed": return "Reclamo chiuso";
      case "rejected": return "Reclamo rifiutato";
      case "partially_resolved": return "Reclamo parzialmente risolto";
      default: return "";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="p-4">
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-4 w-full max-w-sm px-6">
            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
            <Skeleton className="h-6 w-32 mx-auto" />
            <Skeleton className="h-10 w-48 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="px-4 md:px-6 lg:px-8 pt-4">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{lang === "de" ? "Reklamation nicht gefunden" : "Reclamo non trovato"}</p>
        </div>
      </div>
    );
  }

  const isUrgent = (complaint as any).priority === "urgent";
  const counterpartyName = isSupplier
    ? (complaint.restaurant?.companyName || complaint.restaurant?.name || "")
    : (complaint.supplier?.companyName || complaint.supplier?.name || "");

  const timeline: ComplaintStatusHistoryWithUser[] = statusHistory && statusHistory.length > 0
    ? statusHistory
    : [{ id: "created", complaintId: complaint.id, fromStatus: null, toStatus: "open", changedBy: null, changedByMemberId: null, createdAt: complaint.createdAt }];

  let affectedItems: any[] = [];
  try {
    if (complaint.affectedItems) {
      affectedItems = JSON.parse(complaint.affectedItems as string);
    }
  } catch {}

  const getMediaSrc = (url: string) => {
    if (url.startsWith("/objects/")) return url;
    if (url.startsWith("http")) return url;
    return `/objects/${url}`;
  };

  const statusSteps = ["open", "in_progress", "resolved"];
  const currentStepIndex = statusSteps.indexOf(complaint.status);
  const isClosed = complaint.status === "closed";
  const isResolved = complaint.status === "resolved";
  const isTerminal = isClosed || isResolved;
  const stepLabels: Record<string, string> = lang === "de"
    ? { open: "Offen", in_progress: "In Bearbeitung", resolved: "Gelöst" }
    : { open: "Aperto", in_progress: "In lavorazione", resolved: "Risolto" };

  const hasOrderableItems = affectedItems.some((i: any) => !!i.productId);

  const totalImpact = affectedItems.reduce((sum: number, i: any) => {
    const qty = parseFloat(i.quantity) || 0;
    const price = parseFloat(i.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
  const formatEuro = (n: number) =>
    n.toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const proposalLabels: Record<ProposalKind, { de: string; it: string; desc: { de: string; it: string }; impactSign: 1 | -1 | 0 }> = {
    credit:     { de: "Gutschrift",    it: "Nota di credito",   desc: { de: "Wert wird auf nächste Rechnung gutgeschrieben.",      it: "L'importo verrà accreditato sulla prossima fattura." }, impactSign: -1 },
    redelivery: { de: "Nachlieferung", it: "Riconsegna",        desc: { de: "Betroffene Artikel werden kostenfrei nachgeliefert.", it: "Gli articoli interessati verranno riconsegnati senza costi." }, impactSign: 0 },
    cancel:     { de: "Storno",        it: "Storno",            desc: { de: "Position wird storniert und nicht berechnet.",        it: "La posizione verrà annullata e non addebitata." }, impactSign: -1 },
  };

  type ActionCategory = "primary" | "fulfillment" | "communication" | "destructive";
  type ActionButton = {
    label: string;
    icon: typeof MessageSquare;
    style: "primary" | "secondary" | "destructive";
    category: ActionCategory;
    action: () => void;
    testId: string;
    disabled?: boolean;
    disabledReason?: string;
  };

  const actions: ActionButton[] = [];

  if (isSupplier) {
    // In Bearbeitung nehmen
    actions.push({
      label: lang === "de" ? "In Bearbeitung nehmen" : "In lavorazione",
      icon: Play,
      style: complaint.status === "open" ? "primary" : "secondary",
      category: "primary",
      action: () => setConfirmAction("in_progress"),
      testId: "action-set-in-progress",
      disabled: complaint.status !== "open",
      disabledReason: lang === "de" ? "Bereits gestartet" : "Già iniziato",
    });
    // Als gelöst markieren
    actions.push({
      label: lang === "de" ? "Als gelöst markieren" : "Segna come risolto",
      icon: CheckCircle,
      style: complaint.status === "in_progress" ? "primary" : "secondary",
      category: "primary",
      action: () => setConfirmAction("resolved"),
      testId: "action-mark-resolved",
      disabled: complaint.status === "resolved" || complaint.status === "closed",
      disabledReason: complaint.status === "open"
        ? (lang === "de" ? "Erst Bearbeitung starten" : "Avvia prima la lavorazione")
        : (lang === "de" ? "Bereits abgeschlossen" : "Già completato"),
    });
    // Folgebestellung
    actions.push({
      label: lang === "de" ? "Folgebestellung" : "Riconsegna",
      icon: Truck,
      style: "secondary",
      category: "fulfillment",
      action: () => setConfirmAction("follow_up"),
      testId: "action-create-follow-up",
      disabled: isTerminal || !hasOrderableItems || followUpMutation.isPending,
      disabledReason: !hasOrderableItems
        ? (lang === "de" ? "Keine Produkte verknüpft" : "Nessun prodotto collegato")
        : (lang === "de" ? "Reklamation abgeschlossen" : "Reclamo chiuso"),
    });
    // Teilweise gelöst
    actions.push({
      label: lang === "de" ? "Teilweise gelöst" : "Parzialmente risolto",
      icon: CheckSquare,
      style: "secondary",
      category: "primary",
      action: () => setConfirmAction("partially_resolved"),
      testId: "action-mark-partially-resolved",
      disabled: isTerminal,
      disabledReason: lang === "de" ? "Reklamation abgeschlossen" : "Reclamo chiuso",
    });
    // Ablehnen
    actions.push({
      label: lang === "de" ? "Ablehnen" : "Rifiuta",
      icon: ThumbsDown,
      style: "destructive",
      category: "destructive",
      action: () => { setRejectionReasonText(""); setConfirmAction("rejected"); },
      testId: "action-reject",
      disabled: isTerminal,
      disabledReason: lang === "de" ? "Reklamation abgeschlossen" : "Reclamo chiuso",
    });
  } else {
    // Restaurant: kann wieder öffnen wenn geschlossen/gelöst
    actions.push({
      label: lang === "de" ? "Wieder öffnen" : "Riapri",
      icon: RotateCcw,
      style: "secondary",
      category: "primary",
      action: () => setConfirmAction("reopen"),
      testId: "action-reopen",
      disabled: !isTerminal,
      disabledReason: lang === "de" ? "Reklamation ist offen" : "Reclamo aperto",
    });
  }

  // Kommentar hinzufügen — beide Rollen, immer
  actions.push({
    label: lang === "de" ? "Kommentar hinzufügen" : "Aggiungi commento",
    icon: Plus,
    style: "secondary",
    category: "communication",
    action: () => setConfirmAction("comment"),
    testId: "action-add-comment",
  });

  // Vorschlag senden — only suppliers, while complaint is active
  if (isSupplier) {
    actions.push({
      label: lang === "de" ? "Vorschlag senden" : "Invia proposta",
      icon: Send,
      style: "secondary",
      category: "communication",
      action: () => { setProposalKind("credit"); setConfirmAction("proposal"); },
      testId: "action-send-proposal",
      disabled: isTerminal,
      disabledReason: lang === "de" ? "Reklamation abgeschlossen" : "Reclamo concluso",
    });
  }

  // Nachricht schreiben — beide Rollen, immer
  actions.push({
    label: lang === "de" ? "Nachricht schreiben" : "Scrivi messaggio",
    icon: MessageSquare,
    style: "secondary",
    category: "communication",
    action: navigateToChat,
    testId: "action-write-message",
  });

  // Schließen — beide Rollen
  actions.push({
    label: lang === "de" ? "Reklamation schließen" : "Chiudi reclamo",
    icon: Ban,
    style: "destructive",
    category: "destructive",
    action: () => { setCloseNoteText(""); setConfirmAction("closed"); },
    testId: "action-close",
    disabled: complaint.status === "closed",
    disabledReason: lang === "de" ? "Bereits geschlossen" : "Già chiuso",
  });

  const getButtonClasses = (style: "primary" | "secondary" | "destructive") => {
    switch (style) {
      case "primary":
        return "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm";
      case "secondary":
        return "bg-card border border-border text-foreground hover:bg-accent";
      case "destructive":
        return "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/50";
    }
  };

  const categoryLabels: Record<ActionCategory, { de: string; it: string }> = {
    primary: { de: "Statusänderung", it: "Modifica stato" },
    fulfillment: { de: "Abwicklung", it: "Gestione" },
    communication: { de: "Kommunikation", it: "Comunicazione" },
    destructive: { de: "Abschluss", it: "Chiusura" },
  };
  const categoryOrder: ActionCategory[] = ["primary", "fulfillment", "communication", "destructive"];
  const groupedActions = categoryOrder
    .map((cat) => ({ cat, items: actions.filter((a) => a.category === cat) }))
    .filter((g) => g.items.length > 0);

  // Mobile primary CTA: first non-disabled "primary"-style action; fallback to first enabled action.
  const mobilePrimary =
    actions.find((a) => !a.disabled && a.style === "primary") ||
    actions.find((a) => !a.disabled);
  const mobileSecondaryByCat = categoryOrder
    .map((cat) => ({
      cat,
      items: actions.filter((a) => a.category === cat && a !== mobilePrimary),
    }))
    .filter((g) => g.items.length > 0);

  const tabClsUpdates = mobileTab === "updates" ? "" : "max-md:hidden";
  const tabClsDetails = mobileTab === "details" ? "" : "max-md:hidden";

  return (
    <div className="min-h-dvh bg-background flex flex-col md:!pb-0" data-testid="page-complaint-detail">
      <div className="w-full flex-1">
        {/* Desktop: inject title + status + actions into the global dark app header (one continuous black header) */}
        <HeroPortal desktopOnly>
          <div className="px-6 pt-2 pb-5" data-testid="complaint-detail-hero-desktop">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-12 w-12 rounded-2xl ${isUrgent ? "bg-red-500/15" : "bg-white/10"} items-center justify-center shrink-0`}>
                  <div className={isUrgent ? "text-red-400" : "text-white"}>
                    {isUrgent ? <Flame className="h-6 w-6" /> : getStatusIcon(complaint.status, "h-6 w-6")}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">
                    {lang === "de" ? "Reklamation" : "Reclamo"} · #{formatComplaintNumber(complaint)}
                  </p>
                  <p className="text-xl md:text-2xl font-semibold text-white truncate">{complaint.title}</p>
                  <p className="text-xs text-white/60 truncate mt-0.5">{counterpartyName}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-2.5">
                    <Badge className={`${getStatusBadgeColor(complaint.status)} rounded-full px-3 py-1.5 text-xs font-medium border-0`} variant="outline">
                      <span className="inline-flex items-center gap-1">
                        {getStatusIcon(complaint.status, "h-3.5 w-3.5")}
                        {getComplaintStatus(complaint.status, lang)}
                      </span>
                    </Badge>
                    {isUrgent && (
                      <Badge className="bg-red-500/15 text-red-400 rounded-full px-2.5 py-1 text-[11px] font-medium border-0" variant="outline">
                        <Flame className="h-3 w-3 mr-1" />
                        {lang === "de" ? "Dringend" : "Urgente"}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              {groupedActions.length > 0 && !confirmAction && (
                <div className="flex items-stretch gap-3 flex-wrap justify-end max-w-[70vw] xl:max-w-[60vw]" data-testid="actions-row-inline-desktop">
                  {groupedActions.map(({ cat, items }, gIdx) => (
                    <div
                      key={cat}
                      className={`flex flex-col gap-1.5 ${gIdx > 0 ? "pl-3 border-l border-white/10" : ""}`}
                      data-testid={`actions-group-desktop-${cat}`}
                    >
                      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-white/40 px-0.5">
                        {categoryLabels[cat][lang]}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {items.map((action) => {
                          const Icon = action.icon;
                          const isDestructive = action.category === "destructive";
                          const baseCls = isDestructive
                            ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
                            : getButtonClasses(action.style);
                          const disabledCls = action.disabled
                            ? "bg-white/5 text-white/40 border border-white/10 cursor-not-allowed hover:bg-white/5"
                            : baseCls;
                          return (
                            <button
                              key={action.testId}
                              className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${action.disabled ? "" : "active:scale-[0.97]"} ${disabledCls}`}
                              onClick={action.disabled ? undefined : action.action}
                              disabled={action.disabled}
                              title={action.disabled ? action.disabledReason : undefined}
                              data-testid={`${action.testId}-desktop`}
                            >
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span>{action.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </HeroPortal>

        {/* Mobile-only dark hero (app header shell is hidden on mobile, so the page provides its own) */}
        <div
          className="md:hidden dark bg-[#161921] px-4 pt-4 pb-5 rounded-3xl mx-2 overflow-hidden mb-3"
          style={{ marginTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}
          data-testid="complaint-detail-hero"
        >
          {/* Eyebrow + status */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider truncate" data-testid="text-complaint-id">
              {lang === "de" ? "Reklamation" : "Reclamo"} · #{formatComplaintNumber(complaint)}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {isUrgent && (
                <Badge className="bg-red-500/15 text-red-400 rounded-full px-2 py-1 text-[11px] font-medium border-0" variant="outline">
                  <Flame className="h-3 w-3 mr-0.5" />
                  {lang === "de" ? "Dringend" : "Urgente"}
                </Badge>
              )}
              <Badge className={`${getStatusBadgeColor(complaint.status)} rounded-full px-2.5 py-1 text-[11px] font-medium border-0`} variant="outline">
                <span className="inline-flex items-center gap-1">
                  {getStatusIcon(complaint.status, "h-3.5 w-3.5")}
                  {getComplaintStatus(complaint.status, lang)}
                </span>
              </Badge>
            </div>
          </div>

          {/* Identity */}
          <div className="flex items-center gap-3 mt-3">
            <div className={`h-11 w-11 rounded-2xl ${isUrgent ? "bg-red-500/15" : getStatusBg(complaint.status)} flex items-center justify-center shrink-0`}>
              <div className={isUrgent ? "text-red-400" : getStatusTextColor(complaint.status)}>
                {isUrgent ? <Flame className="h-5 w-5" /> : getStatusIcon(complaint.status, "h-5 w-5")}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-white truncate leading-tight" data-testid="text-complaint-title-mobile">{complaint.title}</p>
              <p className="text-[12px] text-white/50 truncate mt-0.5" data-testid="text-counterparty-mobile">{counterpartyName}</p>
            </div>
          </div>

          {/* Key stat tiles */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setLocation(`/${currentRole}/orders/${complaint.orderId}`)}
              className="rounded-2xl bg-white/[0.06] px-3 py-2.5 min-w-0 text-left active:scale-[0.97] transition-transform"
              data-testid="mobile-link-order"
            >
              <div className="flex items-center gap-1 text-white/45">
                <Package className="h-3 w-3 shrink-0" />
                <span className="text-[9px] uppercase tracking-wide font-medium truncate">{lang === "de" ? "Bestellung" : "Ordine"}</span>
              </div>
              <p className="text-sm font-semibold text-white mt-1 truncate tabular-nums underline underline-offset-2">#{formatOrderNumber(complaint.order)}</p>
            </button>
            <div className="rounded-2xl bg-white/[0.06] px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1 text-white/45">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span className="text-[9px] uppercase tracking-wide font-medium truncate">{lang === "de" ? "Betroffen" : "Interessati"}</span>
              </div>
              <p className="text-sm font-semibold text-white mt-1 truncate">
                {affectedItems.length} <span className="text-[11px] font-normal text-white/45">{affectedItems.length === 1 ? (lang === "de" ? "Prod." : "prod.") : (lang === "de" ? "Prod." : "prod.")}</span>
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.06] px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1 text-white/45">
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span className="text-[9px] uppercase tracking-wide font-medium truncate">{lang === "de" ? "Erstellt" : "Creato"}</span>
              </div>
              <p className="text-sm font-semibold text-white mt-1 truncate">
                {format(new Date(complaint.createdAt), "dd.MM.", { locale: dateLocale })}
              </p>
            </div>
          </div>
        </div>

        {/* Back button: shown below the dark hero, outside it, in the same position on mobile and desktop */}
        <div className="block px-4 md:px-6 lg:px-8 pt-3">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>

        {/* Confirmation flows — desktop modal popups; mobile uses bottom-sheet drawers */}
        <Dialog
          open={!isMobile && !!confirmAction}
          onOpenChange={(open) => { if (!open) resetConfirmState(); }}
        >
          <DialogContent className="max-w-md w-[calc(100%-2rem)] border-0 bg-transparent p-0 shadow-none" data-testid="section-confirm">
            <DialogTitle className="sr-only">{lang === "de" ? "Aktion bestätigen" : "Conferma azione"}</DialogTitle>
              {(confirmAction === "in_progress" || confirmAction === "resolved" || confirmAction === "closed" || confirmAction === "reopen") && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <p className="text-sm font-medium text-center text-foreground">
                    {confirmAction === "in_progress" && (lang === "de" ? "Reklamation in Bearbeitung nehmen?" : "Prendere in lavorazione il reclamo?")}
                    {confirmAction === "resolved" && (lang === "de" ? "Reklamation als gelöst markieren?" : "Segnare il reclamo come risolto?")}
                    {confirmAction === "closed" && (lang === "de" ? "Reklamation wirklich schließen?" : "Chiudere davvero il reclamo?")}
                    {confirmAction === "reopen" && (lang === "de" ? "Reklamation wieder öffnen?" : "Riaprire il reclamo?")}
                  </p>
                  {confirmAction === "closed" && !isSupplier && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        {lang === "de" ? "Begründung (Pflichtfeld)" : "Motivazione (obbligatorio)"}
                      </label>
                      <textarea
                        value={closeNoteText}
                        onChange={(e) => setCloseNoteText(e.target.value)}
                        placeholder={lang === "de" ? "Warum schließen Sie die Reklamation?" : "Perché chiudi il reclamo?"}
                        className="w-full min-h-[80px] rounded-lg border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        data-testid="textarea-close-note"
                      />
                    </div>
                  )}
                  <div className="flex justify-center gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => setConfirmAction(null)}
                      disabled={updateStatusMutation.isPending}
                      data-testid="cancel-status-change"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className={`h-9 px-4 rounded-lg text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                        confirmAction === "closed"
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-primary hover:bg-primary/90"
                      }`}
                      onClick={() => {
                        const target = confirmAction === "reopen" ? "open" : (confirmAction as "in_progress" | "resolved" | "closed");
                        updateStatusMutation.mutate({
                          status: target,
                          ...(target === "closed" && !isSupplier ? { closeNote: closeNoteText.trim() } : {}),
                        });
                      }}
                      disabled={updateStatusMutation.isPending || (confirmAction === "closed" && !isSupplier && !closeNoteText.trim())}
                      data-testid="confirm-status-change"
                    >
                      {updateStatusMutation.isPending
                        ? (lang === "de" ? "Wird gespeichert..." : "Salvataggio...")
                        : (lang === "de" ? "Bestätigen" : "Conferma")}
                    </button>
                  </div>
                </div>
              )}

              {confirmAction === "comment" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3" data-testid="section-comment">
                  <p className="text-sm font-medium text-foreground">
                    {lang === "de" ? "Neuer Kommentar" : "Nuovo commento"}
                  </p>
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={lang === "de" ? "Schreibe einen Kommentar..." : "Scrivi un commento..."}
                    className="w-full min-h-[88px] resize-y rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    data-testid="input-comment"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => { setConfirmAction(null); setCommentText(""); }}
                      disabled={addCommentMutation.isPending}
                      data-testid="cancel-comment"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => addCommentMutation.mutate(commentText.trim())}
                      disabled={!commentText.trim() || addCommentMutation.isPending}
                      data-testid="confirm-comment"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {addCommentMutation.isPending
                        ? (lang === "de" ? "Senden..." : "Invio...")
                        : (lang === "de" ? "Senden" : "Invia")}
                    </button>
                  </div>
                </div>
              )}

              {confirmAction === "proposal" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-4" data-testid="section-proposal">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {lang === "de" ? "Vorschlag senden" : "Invia proposta"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lang === "de"
                        ? "Wähle einen Lösungsvorschlag — er wird als Kommentar gepostet."
                        : "Scegli una proposta di risoluzione — verrà pubblicata come commento."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(Object.keys(proposalLabels) as ProposalKind[]).map((kind) => {
                      const isActive = proposalKind === kind;
                      const label = lang === "de" ? proposalLabels[kind].de : proposalLabels[kind].it;
                      const desc = lang === "de" ? proposalLabels[kind].desc.de : proposalLabels[kind].desc.it;
                      return (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => setProposalKind(kind)}
                          className={`text-left rounded-lg border p-3 transition-all hover-elevate active-elevate-2 ${
                            isActive ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"
                          }`}
                          data-testid={`proposal-option-${kind}`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                            <span className="text-sm font-semibold">{label}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{desc}</p>
                        </button>
                      );
                    })}
                  </div>

                  {totalImpact > 0 && (
                    <div className="rounded-lg bg-muted/50 border border-border p-3 flex items-center justify-between" data-testid="proposal-impact">
                      <span className="text-xs text-muted-foreground">
                        {lang === "de" ? "Geschätzte Auswirkung" : "Impatto stimato"}
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${
                        proposalLabels[proposalKind].impactSign === -1 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                      }`} data-testid="text-proposal-impact">
                        {proposalLabels[proposalKind].impactSign === -1 ? "−" : proposalLabels[proposalKind].impactSign === 1 ? "+" : "±"}
                        {formatEuro(totalImpact)} €
                      </span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => setConfirmAction(null)}
                      disabled={sendProposalMutation.isPending}
                      data-testid="cancel-proposal"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => sendProposalMutation.mutate(proposalKind)}
                      disabled={sendProposalMutation.isPending}
                      data-testid="confirm-proposal"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {sendProposalMutation.isPending
                        ? (lang === "de" ? "Senden..." : "Invio...")
                        : (lang === "de" ? "Vorschlag senden" : "Invia proposta")}
                    </button>
                  </div>
                </div>
              )}

              {confirmAction === "follow_up" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3" data-testid="section-follow-up">
                  <p className="text-sm font-medium text-foreground">
                    {lang === "de" ? "Folgebestellung erstellen" : "Crea riconsegna"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "de"
                      ? `Eine Nachlieferung wird mit ${affectedItems.filter((i:any)=>i.productId).length} Produkt(en) erstellt und automatisch bestätigt.`
                      : `Verrà creata una riconsegna con ${affectedItems.filter((i:any)=>i.productId).length} prodotto/i e confermata automaticamente.`}
                  </p>
                  <div>
                    <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                      {lang === "de" ? "Lieferdatum" : "Data di consegna"}
                    </label>
                    <input
                      type="date"
                      value={followUpDate}
                      min={new Date().toISOString().split("T")[0]}
                      onChange={(e) => { setFollowUpDate(e.target.value); setFollowUpDateTouched(true); }}
                      className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-follow-up-date"
                    />
                    {!followUpDateTouched && suggestedFollowUpDate && followUpDate !== suggestedFollowUpDate && (
                      <button
                        type="button"
                        onClick={() => { setFollowUpDate(suggestedFollowUpDate); setFollowUpDateTouched(true); }}
                        className="mt-1.5 text-[11px] text-primary hover:underline"
                        data-testid="suggest-follow-up-date"
                      >
                        {lang === "de" ? `Nächster Liefertag: ${suggestedFollowUpDate}` : `Prossima consegna: ${suggestedFollowUpDate}`}
                      </button>
                    )}
                  </div>
                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-border bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="toggle-followup-compensation">
                    <input
                      type="checkbox"
                      checked={followUpCompensation}
                      onChange={(e) => setFollowUpCompensation(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Percent className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-xs font-semibold">{lang === "de" ? "+10% Kompensation" : "+10% compensazione"}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{lang === "de" ? "Mengen werden um 10% erhöht als Entschädigung." : "Le quantità vengono aumentate del 10% come compensazione."}</p>
                    </div>
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => setConfirmAction(null)}
                      disabled={followUpMutation.isPending}
                      data-testid="cancel-follow-up"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-primary hover:bg-primary/90 text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => followUpMutation.mutate({ date: followUpDate, compensation: followUpCompensation })}
                      disabled={!followUpDate || followUpMutation.isPending}
                      data-testid="confirm-follow-up"
                    >
                      <Truck className="h-3.5 w-3.5" />
                      {followUpMutation.isPending
                        ? (lang === "de" ? "Wird erstellt..." : "Creazione...")
                        : (lang === "de" ? "Erstellen" : "Crea")}
                    </button>
                  </div>
                </div>
              )}

              {confirmAction === "rejected" && (
                <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 p-4 shadow-sm space-y-3" data-testid="section-reject">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    {lang === "de" ? "Reklamation ablehnen" : "Rifiuta reclamo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "de" ? "Bitte geben Sie einen Ablehnungsgrund an. Dieser ist für den Betrieb sichtbar." : "Indica un motivo del rifiuto. Sarà visibile al cliente."}
                  </p>
                  <textarea
                    value={rejectionReasonText}
                    onChange={(e) => setRejectionReasonText(e.target.value)}
                    placeholder={lang === "de" ? "z.B. Ware war zum Zeitpunkt der Lieferung einwandfrei..." : "es. La merce era in condizioni perfette al momento della consegna..."}
                    className="w-full min-h-[88px] resize-y rounded-lg border border-red-200 dark:border-red-900/40 bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40"
                    data-testid="input-rejection-reason"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent"
                      onClick={() => { setConfirmAction(null); setRejectionReasonText(""); }}
                      disabled={updateStatusMutation.isPending}
                      data-testid="cancel-reject"
                    >{lang === "de" ? "Abbrechen" : "Annulla"}</button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      onClick={() => updateStatusMutation.mutate({ status: "rejected", rejectionReason: rejectionReasonText.trim() })}
                      disabled={!rejectionReasonText.trim() || updateStatusMutation.isPending}
                      data-testid="confirm-reject"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      {lang === "de" ? "Ablehnen" : "Rifiuta"}
                    </button>
                  </div>
                </div>
              )}

              {confirmAction === "partially_resolved" && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4 shadow-sm space-y-3" data-testid="section-partial">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    {lang === "de" ? "Als teilweise gelöst markieren?" : "Segnare come parzialmente risolto?"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lang === "de" ? "Verwende diesen Status, wenn ein Teil der Reklamation behoben wurde, der Rest aber noch offen ist." : "Usa questo stato quando una parte del reclamo è risolta ma il resto rimane aperto."}
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent"
                      onClick={() => setConfirmAction(null)}
                      disabled={updateStatusMutation.isPending}
                      data-testid="cancel-partial"
                    >{lang === "de" ? "Abbrechen" : "Annulla"}</button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      onClick={() => updateStatusMutation.mutate({ status: "partially_resolved" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid="confirm-partial"
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                      {lang === "de" ? "Bestätigen" : "Conferma"}
                    </button>
                  </div>
                </div>
              )}
          </DialogContent>
        </Dialog>

        {/* Mobile tab switcher (summary data now lives in the dark hero above) */}
        <div className="md:hidden px-4 pt-3">
          {/* Pill tabs */}
          <div className="mt-4 inline-flex w-full p-1 rounded-full bg-muted" role="tablist" data-testid="mobile-tabs">
            <button
              type="button"
              onClick={() => setMobileTab("updates")}
              className={`flex-1 h-9 rounded-full text-xs font-semibold transition-all ${mobileTab === "updates" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="tab-updates"
            >
              {lang === "de" ? "Verlauf" : "Aggiornamenti"}
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("details")}
              className={`flex-1 h-9 rounded-full text-xs font-semibold transition-all ${mobileTab === "details" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="tab-details"
            >
              {lang === "de" ? "Details" : "Dettagli"}
            </button>
          </div>
        </div>

        {/* KPI strip + body */}
        <div className="px-3 md:px-6 pb-6 pt-3">
          {/* KPI tiles: desktop only — mobile shows these stats in the dark hero above */}
          <div className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-status">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Status" : "Stato"}</p>
              <p className={`text-base md:text-lg font-semibold mt-1.5 truncate ${getStatusTextColor(complaint.status)}`}>
                {getComplaintStatus(complaint.status, lang)}
              </p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-created">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Erstellt" : "Creato"}</p>
              <p className="text-base md:text-lg font-semibold mt-1.5 truncate">{format(new Date(complaint.createdAt), "dd.MM., HH:mm", { locale: dateLocale })}</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-order">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Bestellung" : "Ordine"}</p>
              <button
                onClick={() => setLocation(`/${currentRole}/orders/${complaint.orderId}`)}
                className="text-base md:text-lg font-semibold mt-1.5 truncate tabular-nums hover:underline text-left w-full"
                data-testid="link-order"
              >
                #{formatOrderNumber(complaint.order)}
              </button>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-items">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Betroffen" : "Interessati"}</p>
              <p className="text-base md:text-lg font-semibold mt-1.5">
                {affectedItems.length} <span className="text-sm font-normal text-muted-foreground">{affectedItems.length === 1 ? (lang === "de" ? "Produkt" : "prodotto") : (lang === "de" ? "Produkte" : "prodotti")}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-border/40 mx-4 md:mx-6 lg:mx-8" />

        {/* Body */}
        <div className="px-4 md:px-6 lg:px-8 pt-5 pb-8">
          <div className="space-y-3">
            {/* Mobile vertical timeline — replaces horizontal stepper on small screens */}
            {!isClosed && (
              <div className={`md:hidden rounded-xl border border-border bg-card p-4 shadow-sm ${mobileTab === "updates" ? "" : "hidden"}`} data-testid="status-stepper-mobile">
                <div className="space-y-0">
                  {statusSteps.map((step, i) => {
                    const completed = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    const stepEntry = timeline.find((e: any) => e.toStatus === step);
                    const isLast = i === statusSteps.length - 1;
                    return (
                      <div key={`vstep-${step}`} className="flex gap-3 items-start" data-testid={`stepper-mobile-${step}`}>
                        <div className="flex flex-col items-center shrink-0">
                          <div className={`relative h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${completed ? `${getStatusBg(step)} ${isCurrent ? 'ring-2 ring-offset-2 ring-offset-card ring-primary/40' : ''}` : 'bg-muted'}`}>
                            <div className={completed ? getStatusTextColor(step) : 'text-muted-foreground/50'}>
                              {completed && !isCurrent ? <Check className="h-4 w-4" /> : getStatusIcon(step, "h-4 w-4")}
                            </div>
                          </div>
                          {!isLast && (
                            <div className="w-0.5 flex-1 bg-muted overflow-hidden mt-1 mb-1" style={{ minHeight: "24px" }}>
                              <div className={`w-full transition-all ${i < currentStepIndex ? 'bg-primary h-full' : 'h-0'}`} />
                            </div>
                          )}
                        </div>
                        <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-4"}`}>
                          <p className={`text-sm font-medium leading-tight ${completed ? 'text-foreground' : 'text-muted-foreground/60'}`}>{stepLabels[step]}</p>
                          {stepEntry && completed && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {format(new Date(stepEntry.createdAt), "EEE, dd.MM. · HH:mm", { locale: dateLocale })}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Horizontal stepper — desktop only */}
            {!isClosed && (
              <div className="hidden md:block rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="status-stepper">
                <div className="flex items-start">
                  {statusSteps.flatMap((step, i) => {
                    const completed = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    const stepEntry = timeline.find((e: any) => e.toStatus === step);
                    const nodes = [
                      <div key={`step-${step}`} className="flex flex-col items-center gap-2 shrink-0 w-24" data-testid={`stepper-${step}`}>
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center transition-all shrink-0 ${completed ? `${getStatusBg(step)} ${isCurrent ? 'ring-2 ring-offset-2 ring-offset-card ring-primary/40' : ''}` : 'bg-muted'}`}>
                          <div className={completed ? getStatusTextColor(step) : 'text-muted-foreground/50'}>
                            {completed && !isCurrent ? <Check className="h-4 w-4" /> : getStatusIcon(step, "h-4 w-4")}
                          </div>
                        </div>
                        <p className={`text-[11px] font-medium text-center leading-tight truncate w-full ${completed ? 'text-foreground' : 'text-muted-foreground/60'}`}>{stepLabels[step]}</p>
                        {stepEntry && completed && (
                          <p className="text-[10px] text-muted-foreground/70 text-center leading-tight truncate w-full">
                            {format(new Date(stepEntry.createdAt), "dd.MM., HH:mm", { locale: dateLocale })}
                          </p>
                        )}
                      </div>,
                    ];
                    if (i < statusSteps.length - 1) {
                      nodes.push(
                        <div key={`connector-${step}`} className="flex-1 h-0.5 mt-5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full transition-all ${i < currentStepIndex ? 'bg-primary w-full' : 'w-0'}`} />
                        </div>
                      );
                    }
                    return nodes;
                  })}
                </div>
              </div>
            )}

            {/* Independent desktop columns prevent a short card from being
                pushed down by a taller card in the neighboring column. The
                contents behavior keeps the same single-column mobile flow. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              <div className="contents md:flex md:flex-col md:gap-3">
              {/* Left: Description + Media + Affected items as one continuous card */}
              <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsDetails}`} data-testid="section-details">
                <div className="px-4 py-3 border-b border-border/30">
                  <p className="text-sm font-semibold">{lang === "de" ? "Reklamationsdetails" : "Dettagli reclamo"}</p>
                </div>
                <div className="divide-y divide-border/20">
                  <div className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">{lang === "de" ? "Beschreibung" : "Descrizione"}</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{complaint.description}</p>
                  </div>

                  {complaint.mediaUrls && complaint.mediaUrls.length > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Anhänge" : "Allegati"} ({complaint.mediaUrls.length})</p>
                      </div>
                      <div className="flex gap-2 overflow-x-auto">
                        {complaint.mediaUrls.map((url: string, i: number) => (
                          <img
                            key={i}
                            src={getMediaSrc(url)}
                            alt=""
                            className="h-24 w-24 rounded-xl object-cover shrink-0"
                            data-testid={`media-${i}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {affectedItems.length > 0 && (
                    <div>
                      <div className="px-4 py-2.5 bg-muted/20">
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Betroffene Produkte" : "Prodotti interessati"}</p>
                      </div>
                      <div className="divide-y divide-border/20">
                        {affectedItems.map((item: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-3" data-testid={`affected-item-${i}`}>
                            <ProductImage src={item.imageUrl} className="h-11 w-11 rounded-xl" iconClassName="h-5 w-5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.name || item.productName}</p>
                              {item.quantity && (
                                <p className="text-xs text-muted-foreground mt-0.5">{lang === "de" ? "Menge" : "Quantità"}: {item.quantity}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              </div>
              <div className="contents md:flex md:flex-col md:gap-3">
              {/* Right top: Meta */}
              <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsDetails}`} data-testid="section-meta">
                <div className="px-4 py-3 border-b border-border/30">
                  <p className="text-sm font-semibold">{lang === "de" ? "Übersicht" : "Panoramica"}</p>
                </div>
                <div className="divide-y divide-border/20">
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Reklamations-Nr." : "Nr. Reclamo"}</p>
                    <p className="text-sm font-medium truncate text-right tabular-nums">#{formatComplaintNumber(complaint)}</p>
                  </div>
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{isSupplier ? (lang === "de" ? "Betrieb" : "Azienda") : (lang === "de" ? "Händler" : "Commerciante")}</p>
                    <p className="text-sm font-medium truncate text-right">{counterpartyName}</p>
                  </div>
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Bestellung" : "Ordine"}</p>
                    <button
                      onClick={() => setLocation(`/${currentRole}/orders/${complaint.orderId}`)}
                      className="text-sm font-medium truncate text-right tabular-nums hover:underline"
                      data-testid="link-order-meta"
                    >
                      #{formatOrderNumber(complaint.order)}
                    </button>
                  </div>
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt am" : "Creato il"}</p>
                    <p className="text-sm font-medium shrink-0">{format(new Date(complaint.createdAt), "dd.MM.yyyy, HH:mm", { locale: dateLocale })}</p>
                  </div>
                  {isUrgent && (
                    <div className="flex justify-between items-center gap-2 px-4 py-3">
                      <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Priorität" : "Priorità"}</p>
                      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 rounded-full px-2.5 py-1 text-[11px] font-medium" variant="outline">
                        <Flame className="h-3 w-3 mr-1" />
                        {lang === "de" ? "Dringend" : "Urgente"}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Documents */}
              <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsDetails}`} data-testid="section-complaint-documents">
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                  <p className="text-sm font-semibold">{lang === "de" ? "Dokumente" : "Documenti"}</p>
                  <button
                    type="button"
                    onClick={() => setShowUploadDoc(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    data-testid="button-add-complaint-document"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {lang === "de" ? "Hinzufügen" : "Aggiungi"}
                  </button>
                </div>
                {complaintDocuments && complaintDocuments.length > 0 ? (
                  <div className="divide-y divide-border/20">
                    {complaintDocuments.map((doc: any) => {
                      const isDeliveryNote = doc.type === "delivery_note";
                      const downloadUrl = isDeliveryNote && !doc.isUpload
                        ? `/api/orders/${doc.orderId}/delivery-note/download`
                        : doc.fileUrl;
                      const typeLabel = isDeliveryNote
                        ? (lang === "de" ? "Lieferschein" : "Bolla di consegna")
                        : doc.type === "invoice"
                          ? (lang === "de" ? "Rechnung" : "Fattura")
                          : (lang === "de" ? "Dokument" : "Documento");
                      return (
                        <a
                          key={doc.id}
                          href={downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                          data-testid={`complaint-document-${doc.id}`}
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-md shrink-0 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.title}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {typeLabel} · {format(new Date(doc.createdAt), "dd.MM.yyyy, HH:mm", { locale: dateLocale })}
                            </p>
                          </div>
                          <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-4 text-sm text-muted-foreground" data-testid="text-no-complaint-documents">
                    {lang === "de" ? "Noch keine Dokumente." : "Nessun documento."}
                  </div>
                )}
              </div>

              <CounterpartyContactCard
                supplierId={complaint.supplierId}
                restaurantId={complaint.restaurantId}
                isSupplier={isSupplier}
                supplier={complaint.supplier}
                restaurant={complaint.restaurant}
                onMessage={navigateToChat}
                lang={lang}
                className={tabClsDetails}
              />

              {/* Right bottom: Verlauf (timeline + comments) */}
              <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsUpdates}`} data-testid="section-history">
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                  <p className="text-sm font-semibold">{lang === "de" ? "Verlauf" : "Cronologia"}</p>
                  <p className="text-[11px] text-muted-foreground">{timeline.length} {lang === "de" ? (timeline.length === 1 ? "Eintrag" : "Einträge") : (timeline.length === 1 ? "voce" : "voci")}</p>
                </div>
                <div className="divide-y divide-border/20">
                  {timeline.map((entry: ComplaintStatusHistoryWithUser, index: number) => (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3" data-testid={`timeline-entry-${index}`}>
                      <div className={`h-9 w-9 rounded-full ${getStatusBg(entry.toStatus)} flex items-center justify-center shrink-0`}>
                        <div className={getStatusTextColor(entry.toStatus)}>
                          {getStatusIcon(entry.toStatus, "h-4 w-4")}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {getTimelineDescription(entry.toStatus)}
                        </p>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                          <span>{format(new Date(entry.createdAt), "EEE, dd.MM.yyyy · HH:mm", { locale: dateLocale })}</span>
                          {(entry.changedByMember || entry.changedByUser) && (
                            <span className="inline-flex items-center gap-1">
                              · {lang === "de" ? "von" : "da"}
                              <Avatar className="h-4 w-4 shrink-0">
                                <AvatarImage src={(entry.changedByMember?.profileImageUrl || entry.changedByUser?.profileImageUrl) || undefined} alt={entry.changedByMember?.name || entry.changedByUser?.name} />
                                <AvatarFallback className="bg-primary/10 text-primary text-[7px] font-semibold">
                                  {(entry.changedByMember?.name || entry.changedByUser?.name || "?").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <span>{entry.changedByMember?.name || entry.changedByUser?.name}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground/70 shrink-0 whitespace-nowrap mt-0.5">
                        {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true, locale: dateLocale })}
                      </p>
                    </div>
                  ))}

                  {comments && comments.length > 0 && (
                    <div>
                      <div className="px-4 py-2.5 bg-muted/20 flex items-center gap-2">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                          {lang === "de" ? "Kommentare" : "Commenti"} ({comments.length})
                        </p>
                      </div>
                      <div className="divide-y divide-border/20">
                        {comments.map((comment: ComplaintCommentWithUser, index: number) => {
                          const initials = comment.user?.name
                            ? comment.user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
                            : "?";
                          return (
                            <div key={comment.id} className="flex items-start gap-3 px-4 py-3" data-testid={`comment-${index}`}>
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={comment.user?.profileImageUrl || undefined} />
                                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium truncate">{comment.user?.name}</p>
                                  <p className="text-[11px] text-muted-foreground/70 shrink-0">
                                    {format(new Date(comment.createdAt), "dd.MM.yy HH:mm", { locale: dateLocale })}
                                  </p>
                                </div>
                                <p className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom CTA bar — in-flow `sticky bottom-0` as the last child of the
          page scroll content. Because it occupies real layout space, content above can
          never be hidden underneath it (no fixed-position + guessed-padding mismatch).
          Mobile-only (md:hidden); desktop actions live in the dark header. */}
      {!confirmAction && (mobilePrimary || mobileSecondaryByCat.length > 0) && (
        <div
          className="md:hidden sticky bottom-0 z-40 mt-auto bg-background/95 backdrop-blur-md border-t border-border px-3 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
          data-testid="mobile-action-bar"
        >
          <div className="flex gap-2">
            {mobilePrimary && (() => {
              const Icon = mobilePrimary.icon;
              const isDestructive = mobilePrimary.category === "destructive";
              const baseCls = isDestructive
                ? "bg-red-600 text-white hover:bg-red-700"
                : mobilePrimary.style === "primary"
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-card border border-border text-foreground hover:bg-accent";
              return (
                <button
                  className={`flex-1 h-12 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98] ${baseCls}`}
                  onClick={mobilePrimary.action}
                  data-testid={`${mobilePrimary.testId}-mobile-primary`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{mobilePrimary.label}</span>
                </button>
              );
            })()}
            {mobileSecondaryByCat.length > 0 && (
              <button
                className="h-12 px-4 rounded-xl text-sm font-semibold bg-card border border-border text-foreground hover:bg-accent inline-flex items-center justify-center transition-all active:scale-[0.98]"
                onClick={() => setMoreSheetOpen(true)}
                data-testid="button-more-actions"
                aria-label={lang === "de" ? "Weitere Aktionen" : "Altre azioni"}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile More-actions bottom sheet — only mounted on mobile so desktop never sees the overlay */}
      <Drawer open={isMobile && moreSheetOpen} onOpenChange={setMoreSheetOpen}>
        <DrawerContent className="md:hidden" data-testid="drawer-more-actions">
          <DrawerHeader className="text-left">
            <DrawerTitle>{lang === "de" ? "Aktionen" : "Azioni"}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {lang === "de" ? "Weitere Aktionen für diese Reklamation" : "Altre azioni per questo reclamo"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            {mobileSecondaryByCat.map(({ cat, items }) => (
              <div key={cat} className="space-y-2" data-testid={`drawer-group-${cat}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground px-1">
                  {categoryLabels[cat][lang]}
                </p>
                <div className="space-y-1.5">
                  {items.map((action) => {
                    const Icon = action.icon;
                    const isDestructive = action.category === "destructive";
                    const baseCls = isDestructive
                      ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40"
                      : "bg-card border border-border text-foreground";
                    return (
                      <button
                        key={action.testId}
                        className={`w-full h-12 px-4 rounded-xl text-sm font-medium inline-flex items-center gap-3 transition-all ${action.disabled ? "opacity-40 cursor-not-allowed" : "active:scale-[0.99] hover:bg-accent/50"} ${baseCls}`}
                        onClick={action.disabled ? undefined : () => { setMoreSheetOpen(false); action.action(); }}
                        disabled={action.disabled}
                        data-testid={`${action.testId}-sheet`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left truncate">{action.label}</span>
                        {action.disabled && action.disabledReason && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[40%]">{action.disabledReason}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Mobile confirmation drawer — mirrors desktop inline confirm flows. Mounted only on mobile. */}
      <Drawer
        open={isMobile && !!confirmAction}
        onOpenChange={(open) => { if (!open) resetConfirmState(); }}
      >
        <DrawerContent className="md:hidden" data-testid="drawer-confirm-action">
          {(confirmAction === "in_progress" || confirmAction === "resolved" || confirmAction === "closed" || confirmAction === "reopen") && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>
                  {confirmAction === "in_progress" && (lang === "de" ? "In Bearbeitung nehmen?" : "Prendere in lavorazione?")}
                  {confirmAction === "resolved" && (lang === "de" ? "Als gelöst markieren?" : "Segnare come risolto?")}
                  {confirmAction === "closed" && (lang === "de" ? "Reklamation schließen?" : "Chiudere il reclamo?")}
                  {confirmAction === "reopen" && (lang === "de" ? "Reklamation wieder öffnen?" : "Riaprire il reclamo?")}
                </DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Bestätige die Statusänderung." : "Conferma il cambio di stato."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 flex flex-col gap-2">
                {confirmAction === "closed" && !isSupplier && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">
                      {lang === "de" ? "Begründung (Pflichtfeld)" : "Motivazione (obbligatorio)"}
                    </label>
                    <textarea
                      value={closeNoteText}
                      onChange={(e) => setCloseNoteText(e.target.value)}
                      placeholder={lang === "de" ? "Warum schließen Sie die Reklamation?" : "Perché chiudi il reclamo?"}
                      className="w-full min-h-[80px] rounded-lg border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="textarea-close-note-mobile"
                    />
                  </div>
                )}
                <button
                  className={`w-full h-12 rounded-xl text-sm font-semibold text-white shadow-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${confirmAction === "closed" ? "bg-gray-700 hover:bg-gray-800" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}
                  onClick={() => {
                    const target = confirmAction === "reopen" ? "open" : (confirmAction as "in_progress" | "resolved" | "closed");
                    updateStatusMutation.mutate({
                      status: target,
                      ...(target === "closed" && !isSupplier ? { closeNote: closeNoteText.trim() } : {}),
                    });
                  }}
                  disabled={updateStatusMutation.isPending || (confirmAction === "closed" && !isSupplier && !closeNoteText.trim())}
                  data-testid={`confirm-status-${confirmAction}-mobile`}
                >
                  <Check className="h-4 w-4" />
                  {updateStatusMutation.isPending
                    ? (lang === "de" ? "Wird aktualisiert..." : "Aggiornamento...")
                    : (lang === "de" ? "Bestätigen" : "Conferma")}
                </button>
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                  onClick={() => setConfirmAction(null)}
                  disabled={updateStatusMutation.isPending}
                  data-testid={`cancel-status-${confirmAction}-mobile`}
                >
                  {lang === "de" ? "Abbrechen" : "Annulla"}
                </button>
              </div>
            </>
          )}
          {confirmAction === "follow_up" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Folgebestellung erstellen" : "Crea riconsegna"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de"
                    ? `Eine Nachlieferung wird mit ${affectedItems.filter((i:any)=>i.productId).length} Produkt(en) erstellt und automatisch bestätigt.`
                    : `Verrà creata una riconsegna con ${affectedItems.filter((i:any)=>i.productId).length} prodotto/i e confermata automaticamente.`}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-3">
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    {lang === "de" ? "Lieferdatum" : "Data di consegna"}
                  </label>
                  <input
                    type="date"
                    value={followUpDate}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => { setFollowUpDate(e.target.value); setFollowUpDateTouched(true); }}
                    className="mt-1 w-full rounded-xl border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    data-testid="input-follow-up-date-mobile"
                  />
                  {!followUpDateTouched && suggestedFollowUpDate && followUpDate !== suggestedFollowUpDate && (
                    <button
                      type="button"
                      onClick={() => { setFollowUpDate(suggestedFollowUpDate); setFollowUpDateTouched(true); }}
                      className="mt-1.5 text-[11px] text-primary hover:underline"
                      data-testid="suggest-follow-up-date-mobile"
                    >
                      {lang === "de" ? `Nächster Liefertag: ${suggestedFollowUpDate}` : `Prossima consegna: ${suggestedFollowUpDate}`}
                    </button>
                  )}
                </div>
                <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={followUpCompensation}
                    onChange={(e) => setFollowUpCompensation(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-semibold">{lang === "de" ? "+10% Kompensation" : "+10% compensazione"}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{lang === "de" ? "Mengen werden um 10% erhöht." : "Le quantità vengono aumentate del 10%."}</p>
                  </div>
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    onClick={() => followUpMutation.mutate({ date: followUpDate, compensation: followUpCompensation })}
                    disabled={!followUpDate || followUpMutation.isPending}
                    data-testid="confirm-follow-up-mobile"
                  >
                    <Truck className="h-4 w-4" />
                    {followUpMutation.isPending
                      ? (lang === "de" ? "Wird erstellt..." : "Creazione...")
                      : (lang === "de" ? "Erstellen" : "Crea")}
                  </button>
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                    onClick={() => setConfirmAction(null)}
                    disabled={followUpMutation.isPending}
                    data-testid="cancel-follow-up-mobile"
                  >
                    {lang === "de" ? "Abbrechen" : "Annulla"}
                  </button>
                </div>
              </div>
            </>
          )}
          {confirmAction === "proposal" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Vorschlag senden" : "Invia proposta"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de"
                    ? "Wähle einen Lösungsvorschlag — er wird als Kommentar gepostet."
                    : "Scegli una proposta di risoluzione — verrà pubblicata come commento."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-3">
                <div className="grid grid-cols-1 gap-2">
                  {(Object.keys(proposalLabels) as ProposalKind[]).map((kind) => {
                    const isActive = proposalKind === kind;
                    const label = lang === "de" ? proposalLabels[kind].de : proposalLabels[kind].it;
                    const desc = lang === "de" ? proposalLabels[kind].desc.de : proposalLabels[kind].desc.it;
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setProposalKind(kind)}
                        className={`text-left rounded-xl border p-3 transition-all ${isActive ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"}`}
                        data-testid={`proposal-option-mobile-${kind}`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
                          <span className="text-sm font-semibold">{label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{desc}</p>
                      </button>
                    );
                  })}
                </div>
                {totalImpact > 0 && (
                  <div className="rounded-xl bg-muted/50 border border-border p-3 flex items-center justify-between" data-testid="proposal-impact-mobile">
                    <span className="text-xs text-muted-foreground">
                      {lang === "de" ? "Geschätzte Auswirkung" : "Impatto stimato"}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${proposalLabels[proposalKind].impactSign === -1 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                      {proposalLabels[proposalKind].impactSign === -1 ? "−" : proposalLabels[proposalKind].impactSign === 1 ? "+" : "±"}
                      {formatEuro(totalImpact)} €
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    onClick={() => sendProposalMutation.mutate(proposalKind)}
                    disabled={sendProposalMutation.isPending}
                    data-testid="confirm-proposal-mobile"
                  >
                    <Send className="h-4 w-4" />
                    {sendProposalMutation.isPending
                      ? (lang === "de" ? "Senden..." : "Invio...")
                      : (lang === "de" ? "Vorschlag senden" : "Invia proposta")}
                  </button>
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                    onClick={() => setConfirmAction(null)}
                    disabled={sendProposalMutation.isPending}
                    data-testid="cancel-proposal-mobile"
                  >
                    {lang === "de" ? "Abbrechen" : "Annulla"}
                  </button>
                </div>
              </div>
            </>
          )}
          {confirmAction === "rejected" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Reklamation ablehnen" : "Rifiuta reclamo"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Bitte geben Sie einen Ablehnungsgrund an." : "Indica un motivo del rifiuto."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-3">
                <textarea
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  rows={4}
                  placeholder={lang === "de" ? "Begründung..." : "Motivo..."}
                  value={rejectionReasonText}
                  onChange={(e) => setRejectionReasonText(e.target.value)}
                  autoFocus
                  data-testid="input-rejection-reason-mobile"
                />
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    onClick={() => updateStatusMutation.mutate({ status: "rejected", rejectionReason: rejectionReasonText.trim() })}
                    disabled={!rejectionReasonText.trim() || updateStatusMutation.isPending}
                    data-testid="confirm-reject-mobile"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    {lang === "de" ? "Ablehnen" : "Rifiuta"}
                  </button>
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                    onClick={() => { setConfirmAction(null); setRejectionReasonText(""); }}
                    disabled={updateStatusMutation.isPending}
                    data-testid="cancel-reject-mobile"
                  >
                    {lang === "de" ? "Abbrechen" : "Annulla"}
                  </button>
                </div>
              </div>
            </>
          )}
          {confirmAction === "partially_resolved" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Teilweise gelöst?" : "Parzialmente risolto?"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Markiert die Reklamation als teilweise gelöst." : "Segna il reclamo come parzialmente risolto."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 flex flex-col gap-2">
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                  onClick={() => updateStatusMutation.mutate({ status: "partially_resolved" })}
                  disabled={updateStatusMutation.isPending}
                  data-testid="confirm-partial-mobile"
                >
                  <CheckSquare className="h-4 w-4" />
                  {lang === "de" ? "Bestätigen" : "Conferma"}
                </button>
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                  onClick={() => setConfirmAction(null)}
                  disabled={updateStatusMutation.isPending}
                  data-testid="cancel-partial-mobile"
                >
                  {lang === "de" ? "Abbrechen" : "Annulla"}
                </button>
              </div>
            </>
          )}
          {confirmAction === "comment" && (
            <>
              <DrawerHeader className="text-left" data-testid="drawer-comment-header">
                <DrawerTitle>{lang === "de" ? "Kommentar hinzufügen" : "Aggiungi commento"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Sichtbar für beide Seiten." : "Visibile a entrambe le parti."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-3">
                <textarea
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  rows={4}
                  placeholder={lang === "de" ? "Was möchten Sie mitteilen?" : "Cosa vorresti comunicare?"}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  autoFocus
                  data-testid="input-comment-mobile"
                />
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    onClick={() => addCommentMutation.mutate(commentText)}
                    disabled={!commentText.trim() || addCommentMutation.isPending}
                    data-testid="confirm-comment-mobile"
                  >
                    <Send className="h-4 w-4" />
                    {addCommentMutation.isPending
                      ? (lang === "de" ? "Wird gesendet..." : "Invio...")
                      : (lang === "de" ? "Senden" : "Invia")}
                  </button>
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                    onClick={() => { setConfirmAction(null); setCommentText(""); }}
                    disabled={addCommentMutation.isPending}
                    data-testid="cancel-comment-mobile"
                  >
                    {lang === "de" ? "Abbrechen" : "Annulla"}
                  </button>
                </div>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
      <DocumentUploadDialog
        open={showUploadDoc}
        onOpenChange={setShowUploadDoc}
        presetComplaintId={complaintId}
        lockTarget
        lockedLabel={complaint ? `#${formatComplaintNumber(complaint)}` : undefined}
      />
    </div>
  );
}
