import { Fragment, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { ArrowLeft, Clock, Package, Truck, CheckCircle, XCircle, AlertTriangle, ShoppingBag, Check, MessageSquare, Pencil, Send, Ban, FileText, CalendarDays, RefreshCw, ThumbsUp, ThumbsDown, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/ProductImage";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import { PartialConfirmationDialog } from "@/components/PartialConfirmationDialog";
import { formatOrderNumber, type OrderWithDetails, type OrderStatusHistoryWithUser } from "@shared/schema";

export default function OrderDetail() {
  const [, setLocation] = useLocation();
  const [matchRestaurant, paramsR] = useRoute("/restaurant/orders/:id");
  const [matchSupplier, paramsS] = useRoute("/supplier/orders/:id");
  const params = matchRestaurant ? paramsR : paramsS;
  const orderId = params?.id;
  const { currentUser, currentRole } = useUser();
  const { lang } = useLanguage();
  const t = useT();
  const { toast } = useToast();
  const dateLocale = lang === "de" ? de : it;
  const isSupplier = currentRole === "supplier";

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPartialConfirm, setShowPartialConfirm] = useState(false);
  const [changeRequestText, setChangeRequestText] = useState("");

  const { data: order, isLoading } = useQuery<OrderWithDetails>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!orderId,
  });

  const { data: statusHistory } = useQuery<OrderStatusHistoryWithUser[]>({
    queryKey: ["/api/orders", orderId, "status-history"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/status-history`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: !!orderId,
  });

  const { data: conversations } = useQuery<any[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id && !!order,
  });

  // Find the conversation between the two parties of this order
  const orderConversation = order
    ? conversations?.find((c: any) => c.otherUser?.id === (isSupplier ? order.restaurantId : order.supplierId))
    : null;

  // Query messages of that conversation to detect a pending change request for this order
  const { data: convMessages } = useQuery<any[]>({
    queryKey: [`/api/conversations/${orderConversation?.id}/messages`],
    enabled: !!orderConversation?.id,
  });

  const { data: orderDocuments } = useQuery<any[]>({
    queryKey: ["/api/orders", orderId, "documents", currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/documents?userId=${currentUser?.id}`);
      if (!res.ok) throw new Error("Failed to fetch order documents");
      return res.json();
    },
    enabled: !!orderId && !!currentUser?.id,
  });

  const hasPendingChangeRequest = (() => {
    if (!convMessages || !orderId) return false;
    let pending = false;
    for (const m of convMessages) {
      if (m.messageType !== "order_change_request") continue;
      try {
        const data = typeof m.content === "string" ? JSON.parse(m.content) : m.content;
        if (data?.orderId !== orderId) continue;
        if (data?.type === "change_request") pending = true;
        else if (data?.type === "change_request_response") pending = false;
      } catch {}
    }
    return pending;
  })();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "status-history"] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/upcoming-deliveries'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders'] });
    queryClient.invalidateQueries({ queryKey: ['/api/restaurant/orders'] });
    queryClient.invalidateQueries({ queryKey: ['/api/supplier/action-required'] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, requestedDeliveryDate, deliveryNotes }: { status: string; requestedDeliveryDate?: string; deliveryNotes?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status,
        changedBy: currentUser?.id,
        ...(requestedDeliveryDate ? { requestedDeliveryDate } : {}),
        ...(deliveryNotes !== undefined ? { deliveryNotes } : {}),
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      invalidateAll();
      toast({
        title: lang === "de" ? "Status aktualisiert" : "Stato aggiornato",
      });
    },
    onError: () => {
      setConfirmAction(null);
      toast({
        title: lang === "de" ? "Fehler" : "Errore",
        variant: "destructive",
      });
    },
  });

  const deliveryNoteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/delivery-note`);
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/eligible-orders"] });
      toast({ title: lang === "de" ? "Lieferschein erstellt" : "Bolla di consegna creata" });
      if (data?.documentUrl) window.open(data.documentUrl, "_blank");
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const changeRequestMutation = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest("POST", `/api/orders/${orderId}/change-request`, {
        requestedBy: currentUser?.id,
        description: text,
      });
    },
    onSuccess: () => {
      setConfirmAction(null);
      setChangeRequestText("");
      invalidateAll();
      toast({
        title: lang === "de" ? "Anfrage gesendet" : "Richiesta inviata",
      });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const reschedMutation = useMutation({
    mutationFn: async (date: string) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/reschedule`, { requestedDeliveryDate: date });
    },
    onSuccess: () => {
      setShowDatePicker(false);
      invalidateAll();
      toast({ title: lang === "de" ? "Lieferdatum gesetzt" : "Data di consegna impostata" });
    },
    onError: () => {
      setShowDatePicker(false);
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/orders/${orderId}/reorder`, { restaurantId: currentUser?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: lang === "de" ? "Artikel in den Warenkorb gelegt" : "Articoli aggiunti al carrello",
        description: lang === "de" ? "Die Bestellung wurde in Ihren Warenkorb kopiert." : "L'ordine è stato copiato nel carrello.",
      });
      setLocation(`/restaurant/cart`);
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const changeRequestRespondMutation = useMutation({
    mutationFn: async (approved: boolean) => {
      await apiRequest("POST", `/api/orders/${orderId}/change-request/respond`, {
        approved,
        respondedBy: currentUser?.id,
      });
    },
    onSuccess: (_data, approved) => {
      setConfirmAction(null);
      invalidateAll();
      if (orderConversation?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/conversations/${orderConversation.id}/messages`] });
      }
      toast({
        title: approved
          ? (lang === "de" ? "Änderung genehmigt" : "Modifica approvata")
          : (lang === "de" ? "Änderung abgelehnt" : "Modifica rifiutata"),
      });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
    },
  });

  const goBack = () => {
    setLocation(`/${currentRole}/orders`);
  };

  const navigateToChat = () => {
    if (!order) return;
    const counterpartyId = isSupplier ? order.restaurantId : order.supplierId;
    const conv = conversations?.find((c: any) => c.otherUser?.id === counterpartyId);
    if (conv) {
      setLocation(`/${currentRole}/inbox?chat=${conv.id}`);
    } else {
      setLocation(`/${currentRole}/inbox`);
    }
  };

  const getStatusIcon = (status: string, size = "h-5 w-5") => {
    switch (status) {
      case "pending": return <Clock className={size} />;
      case "confirmed": return <Package className={size} />;
      case "partially_confirmed": return <AlertTriangle className={size} />;
      case "in_delivery": return <Truck className={size} />;
      case "delivered": return <CheckCircle className={size} />;
      case "cancelled": return <XCircle className={size} />;
      default: return <ShoppingBag className={size} />;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 dark:bg-yellow-900/40";
      case "confirmed": return "bg-blue-100 dark:bg-blue-900/40";
      case "partially_confirmed": return "bg-orange-100 dark:bg-orange-900/40";
      case "in_delivery": return "bg-purple-100 dark:bg-purple-900/40";
      case "delivered": return "bg-green-100 dark:bg-green-900/40";
      case "cancelled": return "bg-red-100 dark:bg-red-900/40";
      default: return "bg-muted";
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case "pending": return "text-yellow-700 dark:text-yellow-400";
      case "confirmed": return "text-blue-700 dark:text-blue-400";
      case "partially_confirmed": return "text-orange-700 dark:text-orange-400";
      case "in_delivery": return "text-purple-700 dark:text-purple-400";
      case "delivered": return "text-green-700 dark:text-green-400";
      case "cancelled": return "text-red-700 dark:text-red-400";
      default: return "text-muted-foreground";
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "partially_confirmed": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
      case "in_delivery": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getTimelineDotColor = (status: string, isCompleted: boolean) => {
    if (!isCompleted) return "border-muted-foreground/30 bg-background";
    switch (status) {
      case "pending": return "border-yellow-500 bg-yellow-500";
      case "confirmed": return "border-blue-500 bg-blue-500";
      case "partially_confirmed": return "border-orange-500 bg-orange-500";
      case "in_delivery": return "border-purple-500 bg-purple-500";
      case "delivered": return "border-green-500 bg-green-500";
      case "cancelled": return "border-red-500 bg-red-500";
      default: return "border-muted-foreground bg-muted-foreground";
    }
  };

  const getTimelineDescription = (toStatus: string) => {
    if (lang === "de") {
      switch (toStatus) {
        case "pending": return "Bestellung wurde aufgegeben";
        case "confirmed": return "Bestellung wurde bestätigt";
        case "partially_confirmed": return "Bestellung wurde teilweise bestätigt";
        case "in_delivery": return "Bestellung ist unterwegs";
        case "delivered": return "Bestellung wurde geliefert";
        case "cancelled": return "Bestellung wurde storniert";
        default: return "";
      }
    }
    switch (toStatus) {
      case "pending": return "Ordine effettuato";
      case "confirmed": return "Ordine confermato";
      case "partially_confirmed": return "Ordine parzialmente confermato";
      case "in_delivery": return "Ordine in consegna";
      case "delivered": return "Ordine consegnato";
      case "cancelled": return "Ordine annullato";
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
            <Skeleton className="h-4 w-40 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-dvh bg-background flex flex-col">
        <div className="p-4">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">{lang === "de" ? "Bestellung nicht gefunden" : "Ordine non trovato"}</p>
        </div>
      </div>
    );
  }

  const counterpartyName = isSupplier
    ? (order.restaurant?.companyName || order.restaurant?.name || "")
    : (order.supplier?.companyName || order.supplier?.name || "");

  const timeline = statusHistory && statusHistory.length > 0
    ? statusHistory
    : [{ id: "created", orderId: order.id, fromStatus: null, toStatus: "pending", changedBy: null, createdAt: order.createdAt }];

  const statusSteps = ["pending", "confirmed", "in_delivery", "delivered"];
  const currentStepIndex = statusSteps.indexOf(order.status === "partially_confirmed" ? "confirmed" : order.status);

  const st = order.status;
  const isTerminal = st === "delivered" || st === "cancelled";

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
    // Pending change request — highlighted approve/reject pair
    if (hasPendingChangeRequest) {
      actions.push({
        label: lang === "de" ? "Änderung genehmigen" : "Approva modifica",
        icon: ThumbsUp,
        style: "primary",
        category: "primary",
        action: () => changeRequestRespondMutation.mutate(true),
        testId: "action-approve-change-request",
      });
      actions.push({
        label: lang === "de" ? "Änderung ablehnen" : "Rifiuta modifica",
        icon: ThumbsDown,
        style: "secondary",
        category: "primary",
        action: () => changeRequestRespondMutation.mutate(false),
        testId: "action-reject-change-request",
      });
    }
    // Confirm
    actions.push({
      label: lang === "de" ? "Bestellung bestätigen" : "Conferma ordine",
      icon: Check,
      style: st === "pending" ? "primary" : "secondary",
      category: "primary",
      action: () => setShowPartialConfirm(true),
      testId: "action-confirm-order",
      disabled: st !== "pending",
      disabledReason: lang === "de" ? "Bereits bestätigt" : "Già confermato",
    });
    // Start delivery
    actions.push({
      label: lang === "de" ? "Lieferung starten" : "Avvia consegna",
      icon: Truck,
      style: (st === "confirmed" || st === "partially_confirmed") ? "primary" : "secondary",
      category: "primary",
      action: () => setShowDatePicker(true),
      testId: "action-start-delivery",
      disabled: !(st === "confirmed" || st === "partially_confirmed"),
      disabledReason: st === "pending"
        ? (lang === "de" ? "Erst bestätigen" : "Conferma prima")
        : (lang === "de" ? "Nicht verfügbar" : "Non disponibile"),
    });
    // Mark delivered
    actions.push({
      label: lang === "de" ? "Als geliefert markieren" : "Segna come consegnato",
      icon: CheckCircle,
      style: st === "in_delivery" ? "primary" : "secondary",
      category: "primary",
      action: () => setConfirmAction("delivered"),
      testId: "action-mark-delivered",
      disabled: st !== "in_delivery",
      disabledReason: lang === "de" ? "Lieferung noch nicht gestartet" : "Consegna non avviata",
    });
    // Set delivery date — always shown when not terminal
    actions.push({
      label: lang === "de" ? "Lieferdatum setzen" : "Imposta data consegna",
      icon: CalendarDays,
      style: "secondary",
      category: "fulfillment",
      action: () => setShowDatePicker(true),
      testId: "action-set-delivery-date",
      disabled: isTerminal,
      disabledReason: lang === "de" ? "Bestellung abgeschlossen" : "Ordine completato",
    });
    // Delivery note
    actions.push({
      label: lang === "de" ? "Lieferschein erstellen" : "Crea bolla di consegna",
      icon: FileText,
      style: "secondary",
      category: "fulfillment",
      action: () => deliveryNoteMutation.mutate(),
      testId: "action-create-delivery-note",
      disabled: !(st === "in_delivery" || st === "delivered") || deliveryNoteMutation.isPending,
      disabledReason: lang === "de" ? "Erst nach Lieferstart" : "Solo dopo l'avvio",
    });
    // Cancel
    actions.push({
      label: lang === "de" ? "Bestellung stornieren" : "Annulla ordine",
      icon: Ban,
      style: "destructive",
      category: "destructive",
      action: () => setConfirmAction("cancelled"),
      testId: "action-cancel-order",
      disabled: isTerminal || st === "in_delivery",
      disabledReason: lang === "de" ? "Nicht mehr stornierbar" : "Non più annullabile",
    });
  } else {
    // Restaurant
    actions.push({
      label: lang === "de" ? "Bestellung bearbeiten" : "Modifica ordine",
      icon: Pencil,
      style: st === "pending" ? "primary" : "secondary",
      category: "fulfillment",
      action: () => setLocation(`/restaurant/orders?edit=${order.id}`),
      testId: "action-edit-order",
      disabled: st !== "pending",
      disabledReason: lang === "de" ? "Nur vor Bestätigung" : "Solo prima della conferma",
    });
    actions.push({
      label: lang === "de" ? "Änderung anfragen" : "Richiedi modifica",
      icon: Send,
      style: "secondary",
      category: "fulfillment",
      action: () => setConfirmAction("change_request"),
      testId: "action-request-change",
      disabled: !(st === "confirmed" || st === "partially_confirmed"),
      disabledReason: st === "pending"
        ? (lang === "de" ? "Direkt bearbeiten" : "Modifica direttamente")
        : (lang === "de" ? "Nicht verfügbar" : "Non disponibile"),
    });
    // Folgebestellung — always visible for restaurant
    actions.push({
      label: lang === "de" ? "Folgebestellung" : "Riordina",
      icon: RefreshCw,
      style: "secondary",
      category: "fulfillment",
      action: () => reorderMutation.mutate(),
      testId: "action-reorder",
      disabled: reorderMutation.isPending,
    });
    actions.push({
      label: lang === "de" ? "Bestellung stornieren" : "Annulla ordine",
      icon: Ban,
      style: "destructive",
      category: "destructive",
      action: () => setConfirmAction("cancelled"),
      testId: "action-cancel-order",
      disabled: isTerminal,
      disabledReason: lang === "de" ? "Bestellung abgeschlossen" : "Ordine completato",
    });
  }

  // Communication action — always available
  actions.push({
    label: lang === "de" ? "Nachricht schreiben" : "Scrivi messaggio",
    icon: MessageSquare,
    style: "secondary",
    category: "communication",
    action: navigateToChat,
    testId: "action-write-message",
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
    <div className="min-h-dvh bg-background" data-testid="page-order-detail">
      <div className="w-full">
        {/* Dark hero: matches Reklamationsdetails design */}
        <div className="dark bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl mb-3 md:mb-4" data-testid="order-detail-hero">
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-12 w-12 rounded-2xl ${getStatusBg(order.status)} flex items-center justify-center shrink-0`}>
                <div className={getStatusTextColor(order.status)}>
                  {getStatusIcon(order.status, "h-6 w-6")}
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider" data-testid="text-order-id">
                  {lang === "de" ? "Bestellung" : "Ordine"} · #{formatOrderNumber(order)}
                </p>
                <p className="text-xl md:text-2xl font-semibold text-white truncate" data-testid="text-counterparty">{counterpartyName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Status badge: inline next to title on all sizes (no overlap with action buttons) */}
              <Badge className={`${getStatusBadgeColor(order.status)} rounded-full px-3 py-1.5 text-xs font-medium border-0`} variant="outline">
                <span className="inline-flex items-center gap-1">
                  {getStatusIcon(order.status, "h-3.5 w-3.5")}
                  {getOrderStatus(order.status, lang, isSupplier)}
                </span>
              </Badge>
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

        {/* Back button: placed below the dark hero, matches Reklamationsdetails */}
        <div className="px-4 md:px-6 lg:px-8 pt-3">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {lang === "de" ? "Zurück" : "Indietro"}
          </button>
        </div>

        {/* Body: mobile actions, confirmation flows, KPIs, etc. */}
        <div className="px-4 md:px-6 lg:px-8 pt-3 pb-6">
          {/* Mobile actions row — centered, fixed-size buttons that don't stretch */}
          {actions.length > 0 && !confirmAction && (
            <div className="md:hidden flex flex-wrap justify-center gap-2 mb-5" data-testid="actions-row-mobile">
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

          {/* Confirmation flows — centered, compact */}
          {confirmAction && (
            <div className="mb-5 mx-auto max-w-md" data-testid="section-confirm">
              {confirmAction === "cancelled" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <p className="text-sm font-medium text-center text-foreground">
                    {lang === "de" ? "Bestellung wirklich stornieren?" : "Annullare davvero l'ordine?"}
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => setConfirmAction(null)}
                      disabled={updateStatusMutation.isPending}
                      data-testid="cancel-cancel-order"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5"
                      onClick={() => updateStatusMutation.mutate({ status: "cancelled" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid="confirm-cancel-order"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {updateStatusMutation.isPending
                        ? (lang === "de" ? "Wird storniert..." : "Annullamento...")
                        : (lang === "de" ? "Ja, stornieren" : "Si, annulla")}
                    </button>
                  </div>
                </div>
              )}
              {confirmAction === "delivered" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <p className="text-sm font-medium text-center text-foreground">
                    {lang === "de" ? "Bestellung als geliefert markieren?" : "Segnare l'ordine come consegnato?"}
                  </p>
                  <div className="flex justify-center gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => setConfirmAction(null)}
                      disabled={updateStatusMutation.isPending}
                      data-testid="cancel-mark-delivered"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white shadow-sm transition-all active:scale-[0.97] inline-flex items-center justify-center gap-1.5"
                      onClick={() => updateStatusMutation.mutate({ status: "delivered" })}
                      disabled={updateStatusMutation.isPending}
                      data-testid="confirm-mark-delivered"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {updateStatusMutation.isPending
                        ? (lang === "de" ? "Wird aktualisiert..." : "Aggiornamento...")
                        : (lang === "de" ? "Bestätigen" : "Conferma")}
                    </button>
                  </div>
                </div>
              )}
              {confirmAction === "change_request" && (
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    {lang === "de" ? "Änderung beschreiben" : "Descrivi la modifica"}
                  </p>
                  <textarea
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    rows={3}
                    placeholder={lang === "de" ? "Was möchten Sie ändern?" : "Cosa vorresti modificare?"}
                    value={changeRequestText}
                    onChange={(e) => setChangeRequestText(e.target.value)}
                    data-testid="input-change-request"
                  />
                  <div className="flex justify-center gap-2">
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-card border border-border text-foreground hover:bg-accent transition-all active:scale-[0.97]"
                      onClick={() => { setConfirmAction(null); setChangeRequestText(""); }}
                      disabled={changeRequestMutation.isPending}
                      data-testid="cancel-change-request"
                    >
                      {lang === "de" ? "Abbrechen" : "Annulla"}
                    </button>
                    <button
                      className="h-9 px-4 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all active:scale-[0.97] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                      onClick={() => changeRequestMutation.mutate(changeRequestText)}
                      disabled={!changeRequestText.trim() || changeRequestMutation.isPending}
                      data-testid="confirm-change-request"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {changeRequestMutation.isPending
                        ? (lang === "de" ? "Wird gesendet..." : "Invio...")
                        : (lang === "de" ? "Senden" : "Invia")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* KPI tiles: most important info big & scannable */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-total">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Gesamt" : "Totale"}</p>
              <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1.5 leading-none" data-testid="text-order-total">{Number(order.totalAmount).toFixed(2)}€</p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-delivery">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Lieferdatum" : "Data consegna"}</p>
              <p className="text-base md:text-lg font-semibold mt-1.5 truncate">
                {order.requestedDeliveryDate
                  ? format(new Date(order.requestedDeliveryDate + "T00:00:00"), "EEE, dd.MM.yyyy", { locale: dateLocale })
                  : <span className="text-muted-foreground">{lang === "de" ? "Offen" : "Aperto"}</span>}
              </p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-items">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Artikel" : "Articoli"}</p>
              <p className="text-base md:text-lg font-semibold mt-1.5">
                {order.items?.length || 0} <span className="text-sm font-normal text-muted-foreground">{(order.items?.length || 0) === 1 ? (lang === "de" ? "Position" : "voce") : (lang === "de" ? "Positionen" : "voci")}</span>
              </p>
            </div>
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-created">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Erstellt" : "Creato"}</p>
              <p className="text-base md:text-lg font-semibold mt-1.5 truncate">{format(new Date(order.createdAt), "dd.MM., HH:mm", { locale: dateLocale })}</p>
            </div>
          </div>
        </div>

        <div className="border-b border-border/40 mx-4 md:mx-6 lg:mx-8" />

        {/* Body: single column — content cards stacked, actions row at bottom */}
        <div className="px-4 md:px-6 lg:px-8 pt-5 pb-8">
          <div className="min-w-0">
            <div>
          <div className="space-y-5" data-testid="section-updates">
            {/* Horizontal stepper showing the overall journey */}
            {order.status !== "cancelled" && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="status-stepper">
                {/* Steps + connectors are siblings so the first/last circle sit symmetrically inside the card padding */}
                <div className="flex items-start">
                  {statusSteps.flatMap((step, i) => {
                    const completed = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    const stepLabels: Record<string, string> = lang === "de"
                      ? { pending: "Bestellt", confirmed: "Bestätigt", in_delivery: "Unterwegs", delivered: "Geliefert" }
                      : { pending: "Effettuato", confirmed: "Confermato", in_delivery: "In consegna", delivered: "Consegnato" };
                    const stepEntry = timeline.find((e: any) => e.toStatus === step || (step === "confirmed" && e.toStatus === "partially_confirmed"));
                    const nodes = [
                      <div key={`step-${step}`} className="flex flex-col items-center gap-2 shrink-0 w-20" data-testid={`stepper-${step}`}>
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

            {/* ETA banner */}
            {order.status === "in_delivery" && order.requestedDeliveryDate && (
              <div className="rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 p-4 flex items-start gap-3" data-testid="eta-card">
                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                  <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                    {lang === "de" ? "Voraussichtliche Lieferung" : "Consegna prevista"}
                  </p>
                  <p className="text-sm font-bold text-purple-700 dark:text-purple-300 truncate">
                    {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                  {order.deliveryNotes && (
                    <p className="text-xs text-purple-700 dark:text-purple-300/90 mt-1.5 whitespace-pre-wrap" data-testid="text-delivery-notes">
                      {order.deliveryNotes}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Two-column layout: Products spans full height, Meta + History stack on the right with minimal gap */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-1 items-start">
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm md:row-span-2 min-w-0" data-testid="section-products">
              <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                <p className="text-sm font-semibold">{lang === "de" ? "Produkte" : "Prodotti"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {order.items?.length || 0} {lang === "de" ? ((order.items?.length || 0) === 1 ? "Artikel" : "Artikel") : ((order.items?.length || 0) === 1 ? "articolo" : "articoli")}
                </p>
              </div>
              <div className="divide-y divide-border/20">
                {order.items?.map((item: any) => {
                  const hasPartial = item.confirmedQuantity !== null && item.confirmedQuantity !== undefined && item.confirmedQuantity !== item.quantity;
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3" data-testid={`detail-item-${item.id}`}>
                      <ProductImage src={item.productImageUrl} className="h-11 w-11 rounded-xl" iconClassName="h-5 w-5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.quantity}{item.productUnit ? ` ${item.productUnit}` : "x"} · {Number(item.unitPrice).toFixed(2)}€ {lang === "de" ? "pro Einheit" : "per unità"}
                        </p>
                        {hasPartial && (
                          <p className="text-[11px] text-orange-600 dark:text-orange-400 mt-0.5">
                            {lang === "de" ? "Bestätigt" : "Confermato"}: {item.confirmedQuantity} / {item.quantity}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">{Number(item.totalPrice).toFixed(2)}€</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t border-border/30 flex justify-between items-center bg-muted/20">
                <p className="text-sm font-semibold">{lang === "de" ? "Gesamt" : "Totale"}</p>
                <p className="text-base font-bold tabular-nums">{Number(order.totalAmount).toFixed(2)}€</p>
              </div>
            </div>

            {/* Meta details — top right of grid */}
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0" data-testid="section-meta">
              <div className="px-4 py-3 border-b border-border/30">
                <p className="text-sm font-semibold">{lang === "de" ? "Bestelldetails" : "Dettagli ordine"}</p>
              </div>
              <div className="divide-y divide-border/20">
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Bestell-Nr." : "Nr. Ordine"}</p>
                  <p className="text-sm font-medium truncate text-right tabular-nums">#{formatOrderNumber(order)}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{isSupplier ? (lang === "de" ? "Betrieb" : "Azienda") : (lang === "de" ? "Händler" : "Commerciante")}</p>
                  <p className="text-sm font-medium truncate text-right">{counterpartyName}</p>
                </div>
                <div className="flex justify-between items-center gap-2 px-4 py-3">
                  <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt am" : "Creato il"}</p>
                  <p className="text-sm font-medium shrink-0">{format(new Date(order.createdAt), "dd.MM.yyyy, HH:mm", { locale: dateLocale })}</p>
                </div>
                {order.requestedDeliveryDate && (
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Lieferdatum" : "Data consegna"}</p>
                    <p className="text-sm font-medium shrink-0">
                      {format(new Date(order.requestedDeliveryDate + "T00:00:00"), "dd.MM.yyyy", { locale: dateLocale })}
                    </p>
                  </div>
                )}
                {order.createdByUser && (
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt von" : "Creato da"}</p>
                    <p className="text-sm font-medium truncate text-right">{order.createdByUser.name}</p>
                  </div>
                )}
                {order.notes && (
                  <div className="px-4 py-3">
                    <p className="text-sm text-muted-foreground mb-1">{lang === "de" ? "Notizen" : "Note"}</p>
                    <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Documents section — clickable list of generated docs for this order */}
            {orderDocuments && orderDocuments.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0" data-testid="section-documents">
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                  <p className="text-sm font-semibold">{lang === "de" ? "Dokumente" : "Documenti"}</p>
                  <p className="text-[11px] text-muted-foreground">{orderDocuments.length}</p>
                </div>
                <div className="divide-y divide-border/20">
                  {orderDocuments.map((doc: any) => {
                    const isDeliveryNote = doc.type === "delivery_note";
                    const downloadUrl = isDeliveryNote
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
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                        data-testid={`order-document-${doc.id}`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-md shrink-0 ${isDeliveryNote ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" : "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"}`}>
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {typeLabel} · {format(new Date(doc.createdAt), "dd.MM.yyyy, HH:mm", { locale: dateLocale })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const a = window.document.createElement("a");
                            a.href = downloadUrl;
                            a.setAttribute("download", "");
                            window.document.body.appendChild(a);
                            a.click();
                            window.document.body.removeChild(a);
                          }}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted shrink-0"
                          data-testid={`button-download-document-${doc.id}`}
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detailed history list — bottom right of grid */}
            <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0">
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
              </div>
            </div>

            </div>
          </div>
            </div>
          </div>

        </div>
      </div>

      {showDatePicker && (
        <DeliveryDatePicker
          open={true}
          onOpenChange={(open) => { if (!open) setShowDatePicker(false); }}
          supplierId={isSupplier ? (currentUser?.id || "") : order.supplierId}
          restaurantId={isSupplier ? order.restaurantId : (currentUser?.id || "")}
          onConfirm={(date, deliveryNotes) => {
            if (isSupplier && (st === "confirmed" || st === "partially_confirmed")) {
              updateStatusMutation.mutate({ status: "in_delivery", requestedDeliveryDate: date, deliveryNotes });
              setShowDatePicker(false);
            } else {
              reschedMutation.mutate(date);
            }
          }}
          isPending={updateStatusMutation.isPending || reschedMutation.isPending}
        />
      )}

      {showPartialConfirm && order && (
        <PartialConfirmationDialog
          open={true}
          onOpenChange={(open) => { if (!open) setShowPartialConfirm(false); }}
          order={order}
          lang={lang as "de" | "it"}
          currentUserId={currentUser?.id}
          onSuccess={() => {
            setShowPartialConfirm(false);
            invalidateAll();
          }}
        />
      )}
    </div>
  );
}
