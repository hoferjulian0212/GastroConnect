import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getComplaintStatus } from "@/lib/translations";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { ArrowLeft, Clock, Loader2, CheckCircle, XCircle, AlertTriangle, Flame, Check, Image as ImageIcon, MessageSquare, Play, RotateCcw, Ban, Send, Truck, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProductImage } from "@/components/ProductImage";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatComplaintNumber, formatOrderNumber, type ComplaintWithDetails, type ComplaintStatusHistoryWithUser, type ComplaintCommentWithUser } from "@shared/schema";

type ConfirmAction = "in_progress" | "resolved" | "closed" | "reopen" | "follow_up" | "comment" | null;

export default function ComplaintDetail() {
  const [, setLocation] = useLocation();
  const [matchRestaurant, paramsR] = useRoute("/restaurant/complaints/:id");
  const [matchSupplier, paramsS] = useRoute("/supplier/complaints/:id");
  const params = matchRestaurant ? paramsR : paramsS;
  const complaintId = params?.id;
  const { currentRole, currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT();
  const { toast } = useToast();
  const dateLocale = lang === "de" ? de : it;
  const isSupplier = currentRole === "supplier";

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [commentText, setCommentText] = useState("");
  const [followUpDate, setFollowUpDate] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return t.toISOString().split("T")[0];
  });

  const { data: complaint, isLoading } = useQuery<ComplaintWithDetails>({
    queryKey: ["/api/complaints", complaintId],
    queryFn: async () => {
      const res = await fetch(`/api/complaints/${complaintId}`);
      if (!res.ok) throw new Error("Failed to fetch complaint");
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

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/complaints", complaintId] });
    queryClient.invalidateQueries({ queryKey: ["/api/complaints", complaintId, "status-history"] });
    queryClient.invalidateQueries({ queryKey: ["/api/complaints", complaintId, "comments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/complaints"] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (status: "open" | "in_progress" | "resolved" | "closed") => {
      await apiRequest("PATCH", `/api/complaints/${complaintId}`, {
        status,
        changedBy: currentUser?.name || currentUser?.id,
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      invalidateAll();
      toast({ title: lang === "de" ? "Status aktualisiert" : "Stato aggiornato" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
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
    mutationFn: async (date: string) => {
      if (!complaint) return;
      let items: any[] = [];
      try {
        items = JSON.parse((complaint.affectedItems as string) || "[]");
      } catch {}
      const orderItems = items
        .filter((i: any) => i.productId)
        .map((i: any) => ({
          productId: i.productId,
          productName: i.name || i.productName,
          quantity: Math.max(1, Math.round(Number(i.quantity || 1))),
          unitPrice: i.unitPrice,
        }));
      if (orderItems.length === 0) {
        throw new Error("no-items");
      }
      await apiRequest("POST", `/api/complaints/${complaintId}/follow-up-order`, {
        items: orderItems,
        deliveryDate: date,
        supplierId: complaint.supplierId,
        notes: lang === "de"
          ? `Nachlieferung zu Reklamation #${formatComplaintNumber(complaint)}`
          : `Riconsegna per reclamo #${formatComplaintNumber(complaint)}`,
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

  const navigateToChat = () => {
    if (!complaint) return;
    const counterpartyId = isSupplier ? complaint.restaurantId : complaint.supplierId;
    const conv = conversations?.find((c: any) => c.otherUser?.id === counterpartyId);
    if (conv) {
      setLocation(`/${currentRole}/inbox?chat=${conv.id}`);
    } else {
      setLocation(`/${currentRole}/inbox`);
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
      default: return <AlertTriangle className={size} />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-100 dark:bg-yellow-900/40";
      case "in_progress": return "bg-blue-100 dark:bg-blue-900/40";
      case "resolved": return "bg-green-100 dark:bg-green-900/40";
      case "closed": return "bg-muted";
      default: return "bg-muted";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "open": return "text-yellow-700 dark:text-yellow-400";
      case "in_progress": return "text-blue-700 dark:text-blue-400";
      case "resolved": return "text-green-700 dark:text-green-400";
      case "closed": return "text-muted-foreground";
      default: return "text-muted-foreground";
    }
  };

  const getTimelineDotColor = (status: string) => {
    switch (status) {
      case "open": return "border-yellow-500 bg-yellow-500";
      case "in_progress": return "border-blue-500 bg-blue-500";
      case "resolved": return "border-green-500 bg-green-500";
      case "closed": return "border-muted-foreground bg-muted-foreground";
      default: return "border-muted-foreground bg-muted-foreground";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "in_progress": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "resolved": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "closed": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getTimelineDescription = (toStatus: string) => {
    if (lang === "de") {
      switch (toStatus) {
        case "open": return "Reklamation wurde erstellt";
        case "in_progress": return "Reklamation wird bearbeitet";
        case "resolved": return "Reklamation wurde gelöst";
        case "closed": return "Reklamation wurde geschlossen";
        default: return "";
      }
    }
    switch (toStatus) {
      case "open": return "Reclamo creato";
      case "in_progress": return "Reclamo in lavorazione";
      case "resolved": return "Reclamo risolto";
      case "closed": return "Reclamo chiuso";
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

  const timeline = statusHistory && statusHistory.length > 0
    ? statusHistory
    : [{ id: "created", complaintId: complaint.id, fromStatus: null, toStatus: "open", changedBy: null, createdAt: complaint.createdAt }];

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
    action: () => setConfirmAction("closed"),
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

  return (
    <div className="min-h-dvh bg-background flex flex-col" data-testid="page-complaint-detail">
      <div className="w-full">
        {/* Dark hero: matches design used on list pages */}
        <div className="dark bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl mb-3 md:mb-4" data-testid="complaint-detail-hero">
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-12 w-12 rounded-2xl ${isUrgent ? "bg-red-500/15" : "bg-white/10"} flex items-center justify-center shrink-0`}>
                <div className={isUrgent ? "text-red-400" : "text-white"}>
                  {isUrgent ? <Flame className="h-6 w-6" /> : getStatusIcon(complaint.status, "h-6 w-6")}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider" data-testid="text-complaint-id">
                  {lang === "de" ? "Reklamation" : "Reclamo"} · #{formatComplaintNumber(complaint)}
                </p>
                <p className="text-xl md:text-2xl font-semibold text-white truncate" data-testid="text-complaint-title">{complaint.title}</p>
                <p className="text-xs text-white/60 truncate mt-0.5" data-testid="text-counterparty">{counterpartyName}</p>
                {/* Status row: placed below the title block, kept clear of the action buttons on the right */}
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
            <div className="flex items-center gap-2 shrink-0">
              {actions.length > 0 && !confirmAction && (
                <div className="hidden md:flex items-center gap-1.5 flex-wrap justify-end max-w-[55vw]" data-testid="actions-row-inline">
                  {actions.map((action) => {
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
                        data-testid={action.testId}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Back button: placed below the dark hero, matches OrderDetail */}
        <div className="px-4 md:px-6 lg:px-8 pt-3">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>

        {/* Mobile actions row */}
        {actions.length > 0 && !confirmAction && (
          <div className="md:hidden px-4 flex flex-wrap justify-center gap-2 pt-3" data-testid="actions-row-mobile">
            {actions.map((action) => {
              const Icon = action.icon;
              const isDestructive = action.category === "destructive";
              const baseCls = isDestructive
                ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/50"
                : getButtonClasses(action.style);
              const disabledCls = action.disabled
                ? "bg-muted/40 text-muted-foreground/60 border border-border/60 cursor-not-allowed hover:bg-muted/40"
                : baseCls;
              return (
                <button
                  key={action.testId}
                  className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${action.disabled ? "" : "active:scale-[0.97]"} ${disabledCls}`}
                  onClick={action.disabled ? undefined : action.action}
                  disabled={action.disabled}
                  title={action.disabled ? action.disabledReason : undefined}
                  data-testid={`${action.testId}-mobile`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Confirmation flows */}
        {confirmAction && (
          <div className="px-4 md:px-6 lg:px-8 pt-3">
            <div className="mx-auto max-w-md" data-testid="section-confirm">
              {(confirmAction === "in_progress" || confirmAction === "resolved" || confirmAction === "closed" || confirmAction === "reopen") && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <p className="text-sm font-medium text-center text-foreground">
                    {confirmAction === "in_progress" && (lang === "de" ? "Reklamation in Bearbeitung nehmen?" : "Prendere in lavorazione il reclamo?")}
                    {confirmAction === "resolved" && (lang === "de" ? "Reklamation als gelöst markieren?" : "Segnare il reclamo come risolto?")}
                    {confirmAction === "closed" && (lang === "de" ? "Reklamation wirklich schließen?" : "Chiudere davvero il reclamo?")}
                    {confirmAction === "reopen" && (lang === "de" ? "Reklamation wieder öffnen?" : "Riaprire il reclamo?")}
                  </p>
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
                      className={`h-9 px-4 rounded-lg text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5 ${
                        confirmAction === "closed"
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-primary hover:bg-primary/90"
                      }`}
                      onClick={() => {
                        const target = confirmAction === "reopen" ? "open" : (confirmAction as "in_progress" | "resolved" | "closed");
                        updateStatusMutation.mutate(target);
                      }}
                      disabled={updateStatusMutation.isPending}
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
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                      data-testid="input-follow-up-date"
                    />
                  </div>
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
                      onClick={() => followUpMutation.mutate(followUpDate)}
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
            </div>
          </div>
        )}

        {/* KPI strip + body */}
        <div className="px-3 md:px-6 pb-6 pt-3">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className="space-y-5">
            {/* Horizontal stepper */}
            {!isClosed && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="status-stepper">
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

            {/* Two-column grid: details left (spans 2 rows) + meta + history right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {/* Left: Description + Media + Affected items as one continuous card */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm md:row-span-2 min-w-0" data-testid="section-details">
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

              {/* Right top: Meta */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0" data-testid="section-meta">
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

              {/* Right bottom: Verlauf (timeline + comments) */}
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0" data-testid="section-history">
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                  <p className="text-sm font-semibold">{lang === "de" ? "Verlauf" : "Cronologia"}</p>
                  <p className="text-[11px] text-muted-foreground">{timeline.length} {lang === "de" ? (timeline.length === 1 ? "Eintrag" : "Einträge") : (timeline.length === 1 ? "voce" : "voci")}</p>
                </div>
                <div className="divide-y divide-border/20">
                  {timeline.map((entry: any, index: number) => (
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
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(entry.createdAt), "EEE, dd.MM.yyyy · HH:mm", { locale: dateLocale })}
                          {entry.changedByUser && <span> · {lang === "de" ? "von" : "da"} {entry.changedByUser.name}</span>}
                        </p>
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
  );
}
