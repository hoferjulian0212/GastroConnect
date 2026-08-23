import { Fragment, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getOrderStatus } from "@/lib/translations";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { ArrowLeft, Clock, Package, Truck, CheckCircle, XCircle, AlertTriangle, AlertCircle, ShoppingBag, Check, MessageSquare, Pencil, Send, Ban, FileText, CalendarDays, RefreshCw, ThumbsUp, ThumbsDown, Download, MoreHorizontal, X, Upload, UserRound } from "lucide-react";
import { DocumentUploadDialog } from "@/components/DocumentUploadDialog";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CounterpartyContactCard } from "@/components/CounterpartyContactCard";
import { ProductImage } from "@/components/ProductImage";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { TONE, orderStatusTone } from "@/lib/status-colors";
import { motion } from "framer-motion";
import { ReorderSheet } from "@/components/ReorderSheet";
import CountUp from "@/components/CountUp";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import { PartialConfirmationDialog } from "@/components/PartialConfirmationDialog";
import RatingCard from "@/components/RatingCard";
import { formatOrderNumber, dateChangeReasonLabel, type OrderWithDetails, type OrderStatusHistoryWithUser, type OrderTrackingInfo } from "@shared/schema";
import { DeliveryTracking } from "@/components/DeliveryTracking";
import { AssignDriverDialog } from "@/components/AssignDriverDialog";
import { HeroPortal } from "@/context/HeroContext";
import { pluralizeUnit } from "@/lib/units";

export default function OrderDetail() {
  const [, setLocation] = useLocation();
  const [matchRestaurant, paramsR] = useRoute("/restaurant/orders/:id");
  const [matchSupplier, paramsS] = useRoute("/supplier/orders/:id");
  const params = matchRestaurant ? paramsR : paramsS;
  const orderId = params?.id;
  const { currentUser, currentRole, currentMember } = useUser();
  const { lang } = useLanguage();
  const { toast } = useToast();
  const dateLocale = lang === "de" ? de : it;
  const isSupplier = currentRole === "supplier";

  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReorderSheet, setShowReorderSheet] = useState(false);
  const [showPartialConfirm, setShowPartialConfirm] = useState(false);
  const [changeRequestText, setChangeRequestText] = useState("");
  const [mobileTab, setMobileTab] = useState<"updates" | "details">("updates");
  const isMobile = useIsMobile();
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [showAssignDriver, setShowAssignDriver] = useState(false);

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

  // Supplier-side: current driver assignment for this order.
  const { data: trackingInfo } = useQuery<OrderTrackingInfo>({
    queryKey: ["/api/orders", orderId, "tracking"],
    enabled: isSupplier && !!orderId && !!order && ["confirmed", "partially_confirmed", "in_delivery", "delivered"].includes(order.status),
    retry: false,
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
        actingMemberId: currentMember?.id,
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
    mutationFn: async ({ date, reason }: { date: string; reason?: string }) => {
      await apiRequest("PATCH", `/api/orders/${orderId}/reschedule`, { requestedDeliveryDate: date, ...(reason ? { dateChangeReason: reason } : {}) });
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
    const refParams = `&orderRefId=${order.id}${order.orderNumber ? `&orderNumber=${encodeURIComponent(String(order.orderNumber))}` : ""}`;
    if (conv) {
      setLocation(`/${currentRole}/inbox?chat=${conv.id}${refParams}`);
    } else {
      setLocation(`/${currentRole}/inbox?${refParams.replace(/^&/, "")}&to=${counterpartyId}`);
    }
  };

  const getStatusIcon = (status: string, size = "h-5 w-5") => {
    switch (status) {
      case "pending": return <Clock className={size} />;
      case "confirmed": return <Package className={size} />;
      case "partially_confirmed": return <AlertTriangle className={size} />;
      case "scheduled": return <CalendarDays className={size} />;
      case "in_delivery": return <Truck className={size} />;
      case "delivered": return <CheckCircle className={size} />;
      case "cancelled": return <XCircle className={size} />;
      default: return <ShoppingBag className={size} />;
    }
  };

  const getStatusBg = (status: string) => TONE[orderStatusTone(status)].bg;
  const getStatusTextColor = (status: string) => TONE[orderStatusTone(status)].text;
  const getStatusBadgeColor = (status: string) => TONE[orderStatusTone(status)].badge;

  const getTimelineDotColor = (status: string, isCompleted: boolean) => {
    if (!isCompleted) return "border-muted-foreground/30 bg-background";
    switch (status) {
      case "pending": return "border-yellow-500 bg-yellow-500";
      case "confirmed": return "border-blue-500 bg-blue-500";
      case "partially_confirmed": return "border-orange-500 bg-orange-500";
      case "scheduled": return "border-sky-500 bg-sky-500";
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
        case "scheduled": return "Lieferung wurde geplant (Fahrer zugewiesen)";
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
      case "scheduled": return "Consegna pianificata (autista assegnato)";
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

  const statusSteps = ["pending", "confirmed", "scheduled", "in_delivery", "delivered"];
  const currentStepIndex = statusSteps.indexOf(order.status === "partially_confirmed" ? "confirmed" : order.status);

  const st = order.status;
  const isTerminal = st === "delivered" || st === "cancelled";

  const existingDeliveryNote = orderDocuments?.find((d: any) => d.type === "delivery_note");
  const downloadDeliveryNote = (doc: any) => {
    const url = `/api/orders/${doc.orderId}/delivery-note/download`;
    const a = window.document.createElement("a");
    a.href = url;
    a.setAttribute("download", "");
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
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
    // Set delivery date — the order keeps its status; delivery starts via driver app
    actions.push({
      label: lang === "de" ? "Lieferdatum setzen" : "Imposta data consegna",
      icon: CalendarDays,
      style: (st === "confirmed" || st === "partially_confirmed") ? "primary" : "secondary",
      category: "primary",
      action: () => setShowDatePicker(true),
      testId: "action-set-delivery-date",
      disabled: isTerminal,
      disabledReason: lang === "de" ? "Bestellung abgeschlossen" : "Ordine completato",
    });
    // Assign driver — required next step once the order is confirmed;
    // "scheduled" already has a driver, so it becomes a secondary reassign.
    actions.push({
      label: lang === "de" ? "Fahrer zuweisen" : "Assegna autista",
      icon: UserRound,
      style: (st === "confirmed" || st === "partially_confirmed") ? "primary" : "secondary",
      category: "primary",
      action: () => setShowAssignDriver(true),
      testId: "action-assign-driver",
      disabled: !(st === "confirmed" || st === "partially_confirmed" || st === "scheduled" || st === "in_delivery"),
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
      disabled: !(st === "in_delivery" || st === "scheduled" || st === "confirmed" || st === "partially_confirmed"),
      disabledReason: lang === "de" ? "Erst bestätigen" : "Conferma prima",
    });
    // Delivery note — once a note exists (auto-generated when shipping starts),
    // offer to view/download it; otherwise allow manual generation.
    if (existingDeliveryNote) {
      actions.push({
        label: lang === "de" ? "Lieferschein herunterladen" : "Scarica bolla di consegna",
        icon: Download,
        style: "secondary",
        category: "fulfillment",
        action: () => downloadDeliveryNote(existingDeliveryNote),
        testId: "action-download-delivery-note",
      });
    } else {
      actions.push({
        label: lang === "de" ? "Lieferschein erstellen" : "Crea bolla di consegna",
        icon: FileText,
        style: "secondary",
        category: "fulfillment",
        action: () => deliveryNoteMutation.mutate(),
        testId: "action-create-delivery-note",
        disabled: !(st === "scheduled" || st === "in_delivery" || st === "delivered") || deliveryNoteMutation.isPending,
        disabledReason: lang === "de" ? "Erst nach Lieferstart" : "Solo dopo l'avvio",
      });
    }
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
      action: () => setShowReorderSheet(true),
      testId: "action-reorder",
      disabled: false,
    });
    actions.push({
      label: lang === "de" ? "Problem melden" : "Segnala problema",
      icon: AlertCircle,
      style: "secondary",
      category: "communication",
      action: () => setLocation(`/restaurant/complaints?openWizard=1&orderId=${order.id}&supplierId=${order.supplierId || ""}`),
      testId: "action-report-problem",
      disabled: false,
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

  // Add document — always available
  actions.push({
    label: lang === "de" ? "Dokument hinzufügen" : "Aggiungi documento",
    icon: Upload,
    style: "secondary",
    category: "fulfillment",
    action: () => setShowUploadDoc(true),
    testId: "action-add-document",
  });

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

  const categoryLabels: Record<ActionCategory, { de: string; it: string }> = {
    primary: { de: "Statusänderung", it: "Modifica stato" },
    fulfillment: { de: "Abwicklung", it: "Gestione" },
    communication: { de: "Kommunikation", it: "Comunicazione" },
    destructive: { de: "Stornierung", it: "Annullamento" },
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
    <div className="min-h-dvh bg-background flex flex-col md:!pb-0" data-testid="page-order-detail">
      <div className="w-full flex-1">
        {/* Desktop: inject title + status + actions into the global dark app header (one continuous black header) */}
        <HeroPortal desktopOnly>
          <div className="px-6 pt-2 pb-5" data-testid="order-detail-hero-desktop">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`flex h-12 w-12 rounded-2xl ${getStatusBg(order.status)} items-center justify-center shrink-0`}>
                  <div className={getStatusTextColor(order.status)}>
                    {getStatusIcon(order.status, "h-6 w-6")}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">
                    {lang === "de" ? "Bestellung" : "Ordine"} · #{formatOrderNumber(order)}
                  </p>
                  <p className="text-xl md:text-2xl font-semibold text-white truncate">{counterpartyName}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-2.5">
                    <Badge className={`${getStatusBadgeColor(order.status)} rounded-full px-3 py-1.5 text-xs font-medium border-0`} variant="outline">
                      <span className="inline-flex items-center gap-1">
                        {getStatusIcon(order.status, "h-3.5 w-3.5")}
                        {getOrderStatus(order.status, lang, isSupplier)}
                      </span>
                    </Badge>
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
          data-testid="order-detail-hero"
        >
          {/* Eyebrow + status */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider truncate" data-testid="text-order-id">
              {lang === "de" ? "Bestellung" : "Ordine"} · #{formatOrderNumber(order)}
            </p>
            <Badge className={`${getStatusBadgeColor(order.status)} rounded-full px-2.5 py-1 text-[11px] font-medium border-0 shrink-0`} variant="outline">
              <span className="inline-flex items-center gap-1">
                {getStatusIcon(order.status, "h-3.5 w-3.5")}
                {getOrderStatus(order.status, lang, isSupplier)}
              </span>
            </Badge>
          </div>

          {/* Identity + order date */}
          <div className="flex items-center gap-3 mt-3">
            <div className={`h-11 w-11 rounded-2xl ${getStatusBg(order.status)} flex items-center justify-center shrink-0`}>
              <div className={getStatusTextColor(order.status)}>
                {getStatusIcon(order.status, "h-5 w-5")}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-white truncate leading-tight" data-testid="text-counterparty-mobile">{counterpartyName}</p>
              {order.createdAt && (
                <p className="text-[12px] text-white/50 truncate mt-0.5">
                  {(lang === "de" ? "Bestellt am " : "Ordinato il ")}
                  {format(new Date(order.createdAt), "dd.MM.yyyy", { locale: dateLocale })}
                </p>
              )}
            </div>
          </div>

          {/* Key stat tiles */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-2xl bg-white/[0.06] px-3 py-2.5 min-w-0">
              <p className="text-[9px] uppercase tracking-wide font-medium text-white/45 truncate">{lang === "de" ? "Gesamt" : "Totale"}</p>
              <p className="text-base font-bold text-white tabular-nums mt-1 truncate" data-testid="mobile-text-order-total">
                {Number(order.totalAmount).toFixed(2)}€
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.06] px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1 text-white/45">
                <CalendarDays className="h-3 w-3 shrink-0" />
                <span className="text-[9px] uppercase tracking-wide font-medium truncate">{lang === "de" ? "Lieferung" : "Consegna"}</span>
              </div>
              <p className="text-sm font-semibold text-white mt-1 truncate">
                {order.requestedDeliveryDate
                  ? format(new Date(order.requestedDeliveryDate + "T00:00:00"), "dd.MM.", { locale: dateLocale })
                  : <span className="text-white/40">{lang === "de" ? "Offen" : "Aperto"}</span>}
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.06] px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1 text-white/45">
                <Package className="h-3 w-3 shrink-0" />
                <span className="text-[9px] uppercase tracking-wide font-medium truncate">{lang === "de" ? "Artikel" : "Articoli"}</span>
              </div>
              <p className="text-sm font-semibold text-white mt-1 truncate">
                {order.items?.length || 0} <span className="text-[11px] font-normal text-white/45">{(order.items?.length || 0) === 1 ? (lang === "de" ? "Pos." : "voce") : (lang === "de" ? "Pos." : "voci")}</span>
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

        {/* Body: confirmation flows, KPIs, etc. */}
        <div className="px-4 md:px-6 lg:px-8 pt-3 pb-6">
          {/* Confirmation flows — desktop modal popups (mobile uses bottom sheets) */}
          <Dialog
            open={!isMobile && !!confirmAction}
            onOpenChange={(open) => { if (!open) { setConfirmAction(null); setChangeRequestText(""); } }}
          >
            <DialogContent className="max-w-md w-[calc(100%-2rem)] border-0 bg-transparent p-0 shadow-none" data-testid="section-confirm">
              <DialogTitle className="sr-only">{lang === "de" ? "Aktion bestätigen" : "Conferma azione"}</DialogTitle>
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
            </DialogContent>
          </Dialog>

          {/* KPI tiles: desktop only — mobile shows these stats in the dark hero above */}
          <div className="hidden md:grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl bg-card border border-border p-4 shadow-sm" data-testid="kpi-total">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{lang === "de" ? "Gesamt" : "Totale"}</p>
              <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1.5 leading-none tabular-nums" data-testid="text-order-total">
                <CountUp end={Number(order.totalAmount)} duration={900} decimals={2} suffix="€" />
              </p>
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
          <div className="space-y-3" data-testid="section-updates">
            {/* Mobile vertical timeline — replaces horizontal stepper on small screens */}
            {order.status !== "cancelled" && (
              <div className={`md:hidden rounded-xl border border-border bg-card p-4 shadow-sm ${mobileTab === "updates" ? "" : "hidden"}`} data-testid="status-stepper-mobile">
                <div className="space-y-0">
                  {statusSteps.map((step, i) => {
                    const completed = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    const stepLabels: Record<string, string> = lang === "de"
                      ? { pending: "Bestellt", confirmed: "Bestätigt", scheduled: "Geplant", in_delivery: "Unterwegs", delivered: "Geliefert" }
                      : { pending: "Effettuato", confirmed: "Confermato", scheduled: "Pianificato", in_delivery: "In consegna", delivered: "Consegnato" };
                    const stepEntry = timeline.find((e: any) => e.toStatus === step || (step === "confirmed" && e.toStatus === "partially_confirmed"));
                    const isLast = i === statusSteps.length - 1;
                    return (
                      <div key={`vstep-${step}`} className="flex gap-3 items-start" data-testid={`stepper-mobile-${step}`}>
                        <div className="flex flex-col items-center shrink-0">
                          <motion.div
                            className={`relative h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${completed ? getStatusBg(step) : 'bg-muted'}`}
                            initial={{ scale: 0.6, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 380, damping: 26, delay: i * 0.06 }}
                          >
                            {isCurrent && (
                              <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full ring-2 ring-primary/50"
                                animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                              />
                            )}
                            <div className={completed ? getStatusTextColor(step) : 'text-muted-foreground/50'}>
                              {completed && !isCurrent ? <Check className="h-4 w-4" /> : getStatusIcon(step, "h-4 w-4")}
                            </div>
                          </motion.div>
                          {!isLast && (
                            <div className="w-0.5 flex-1 bg-muted overflow-hidden mt-1 mb-1" style={{ minHeight: "24px" }}>
                              <motion.div
                                className="w-full bg-primary origin-top"
                                initial={{ scaleY: 0 }}
                                animate={{ scaleY: i < currentStepIndex ? 1 : 0 }}
                                transition={{ duration: 0.55, ease: "easeOut", delay: 0.15 + i * 0.1 }}
                                style={{ height: "100%" }}
                              />
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

            {/* Horizontal stepper — desktop only (vertical version above for mobile) */}
            {order.status !== "cancelled" && (
              <div className="hidden md:block rounded-xl border border-border bg-card p-5 shadow-sm" data-testid="status-stepper">
                {/* Steps + connectors are siblings so the first/last circle sit symmetrically inside the card padding */}
                <div className="flex items-start">
                  {statusSteps.flatMap((step, i) => {
                    const completed = i <= currentStepIndex;
                    const isCurrent = i === currentStepIndex;
                    const stepLabels: Record<string, string> = lang === "de"
                      ? { pending: "Bestellt", confirmed: "Bestätigt", scheduled: "Geplant", in_delivery: "Unterwegs", delivered: "Geliefert" }
                      : { pending: "Effettuato", confirmed: "Confermato", scheduled: "Pianificato", in_delivery: "In consegna", delivered: "Consegnato" };
                    const stepEntry = timeline.find((e: any) => e.toStatus === step || (step === "confirmed" && e.toStatus === "partially_confirmed"));
                    const nodes = [
                      <div key={`step-${step}`} className="flex flex-col items-center gap-2 shrink-0 w-20" data-testid={`stepper-${step}`}>
                        <motion.div
                          className={`relative h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${completed ? getStatusBg(step) : 'bg-muted'}`}
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: "spring", stiffness: 380, damping: 26, delay: i * 0.08 }}
                        >
                          {isCurrent && (
                            <motion.span
                              aria-hidden
                              className="absolute inset-0 rounded-full ring-2 ring-primary/50"
                              animate={{ scale: [1, 1.18, 1], opacity: [0.6, 0, 0.6] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                            />
                          )}
                          <div className={completed ? getStatusTextColor(step) : 'text-muted-foreground/50'}>
                            {completed && !isCurrent ? <Check className="h-4 w-4" /> : getStatusIcon(step, "h-4 w-4")}
                          </div>
                        </motion.div>
                        <p className={`text-[11px] font-medium text-center leading-tight truncate w-full ${completed ? 'text-foreground' : 'text-muted-foreground/60'}`}>{stepLabels[step]}</p>
                        {stepEntry && completed && (
                          <p className="text-[10px] text-muted-foreground/70 text-center leading-tight truncate w-full">
                            {format(new Date(stepEntry.createdAt), "dd.MM., HH:mm", { locale: dateLocale })}
                          </p>
                        )}
                      </div>,
                    ];
                    if (i < statusSteps.length - 1) {
                      const filled = i < currentStepIndex;
                      nodes.push(
                        <div key={`connector-${step}`} className="flex-1 h-0.5 mt-5 rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className="h-full bg-primary origin-left"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: filled ? 1 : 0 }}
                            transition={{ duration: 0.55, ease: "easeOut", delay: 0.15 + i * 0.12 }}
                            style={{ width: "100%" }}
                          />
                        </div>
                      );
                    }
                    return nodes;
                  })}
                </div>
              </div>
            )}

            {/* ── Status zone: live delivery tracking (all roles) ──────────────────
                 Rendered for both restaurant and supplier once a driver may be
                 active. The component returns null when no assignment exists, so
                 this never adds empty space. Gated on the "updates" mobile tab. */}
            {order && ["confirmed", "partially_confirmed", "scheduled", "in_delivery", "delivered"].includes(order.status) && (
              <div className={`min-w-0 ${tabClsUpdates}`}>
                <DeliveryTracking
                  orderId={order.id}
                  destinationLat={order.restaurant?.latitude}
                  destinationLng={order.restaurant?.longitude}
                  active={["confirmed", "partially_confirmed", "scheduled", "in_delivery", "delivered"].includes(order.status)}
                />
              </div>
            )}

            {/* ETA banner */}
            {order.status === "in_delivery" && order.requestedDeliveryDate && (
              <div className={`rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 p-4 md:flex items-start gap-3 ${mobileTab === "updates" ? "flex" : "hidden"}`} data-testid="eta-card">
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

            {/* Rating prompt — restaurant + delivered orders only */}
            {!isSupplier && order.status === "delivered" && (
              <div className={`mb-5 ${tabClsDetails}`} data-testid="section-rating">
                <RatingCard
                  orderId={order.id}
                  supplierId={order.supplierId}
                  supplierName={order.supplier?.companyName || order.supplier?.name}
                />
              </div>
            )}

            {/* Two-column layout: Products spans full height, Meta + History stack on the right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsDetails}`} data-testid="section-products">
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
                          {item.quantity}{item.productUnit ? ` ${pluralizeUnit(item.productUnit, item.quantity)}` : "x"} · {Number(item.unitPrice).toFixed(2)}€ {lang === "de" ? "pro Einheit" : "per unità"}
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
            <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsDetails}`} data-testid="section-meta">
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
                {order.originalDeliveryDate && order.originalDeliveryDate !== order.requestedDeliveryDate && (
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Urspr. Lieferdatum" : "Data consegna originale"}</p>
                    <p className="text-sm font-medium shrink-0 text-amber-600 dark:text-amber-400 line-through" data-testid="text-original-delivery-date">
                      {format(new Date(order.originalDeliveryDate + "T00:00:00"), "dd.MM.yyyy", { locale: dateLocale })}
                    </p>
                  </div>
                )}
                {order.deliveryDateChangeReason && (
                  <div className="px-4 py-3">
                    <p className="text-sm text-muted-foreground mb-1">{lang === "de" ? "Grund für Datumsänderung" : "Motivo del cambio data"}</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-date-change-reason">{dateChangeReasonLabel(order.deliveryDateChangeReason, lang)}</p>
                  </div>
                )}
                {(order.createdByMember || order.createdByUser) && (
                  <div className="flex justify-between items-center gap-2 px-4 py-3">
                    <p className="text-sm text-muted-foreground shrink-0">{lang === "de" ? "Erstellt von" : "Creato da"}</p>
                    <div className="flex items-center gap-2 min-w-0">
                      {order.createdByMember && (
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={order.createdByMember.profileImageUrl || undefined} alt={order.createdByMember.name} />
                          <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                            {order.createdByMember.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <p className="text-sm font-medium truncate text-right" data-testid="text-order-created-by">
                        {order.createdByMember?.name || order.createdByUser?.name}
                      </p>
                    </div>
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

            <CounterpartyContactCard
              supplierId={order.supplierId}
              restaurantId={order.restaurantId}
              isSupplier={isSupplier}
              supplier={order.supplier}
              restaurant={order.restaurant}
              onMessage={navigateToChat}
              lang={lang}
              className={tabClsDetails}
            />

            {/* Documents section — clickable list of generated docs for this order */}
            {orderDocuments && orderDocuments.length > 0 && (
              <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsDetails}`} data-testid="section-documents">
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                  <p className="text-sm font-semibold">{lang === "de" ? "Dokumente" : "Documenti"}</p>
                  <p className="text-[11px] text-muted-foreground">{orderDocuments.length}</p>
                </div>
                <div className="divide-y divide-border/20">
                  {orderDocuments.map((doc: any) => {
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
            <div className={`rounded-xl border border-border bg-card overflow-hidden shadow-sm min-w-0 ${tabClsUpdates}`} data-testid="section-history">
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
                            <span data-testid={`text-changed-by-${index}`}>{entry.changedByMember?.name || entry.changedByUser?.name}</span>
                          </span>
                        )}
                      </div>
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
          currentDate={order.requestedDeliveryDate || null}
          onConfirm={(date, deliveryNotes, reason) => {
            // Setting a delivery date never changes the order status — the
            // order stays confirmed. It only goes "Unterwegs" via the driver app.
            reschedMutation.mutate({ date, reason });
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

      {isSupplier && order && (
        <AssignDriverDialog
          order={order}
          open={showAssignDriver}
          onOpenChange={(open) => { setShowAssignDriver(open); if (!open) invalidateAll(); }}
        />
      )}

      {!isSupplier && order && (
        <ReorderSheet
          open={showReorderSheet}
          onOpenChange={setShowReorderSheet}
          currentOrderId={order.id}
          supplierId={order.supplierId}
          supplierName={order.supplier?.companyName || order.supplier?.name || ""}
          restaurantId={currentUser?.id || ""}
          lang={lang as "de" | "it"}
        />
      )}

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
                className="h-12 px-4 rounded-xl text-sm font-semibold bg-card border border-border text-foreground hover:bg-accent inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                onClick={() => setMoreSheetOpen(true)}
                data-testid="button-more-actions"
                aria-label={lang === "de" ? "Weitere Aktionen" : "Altre azioni"}
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="sr-only md:not-sr-only">{lang === "de" ? "Mehr" : "Altro"}</span>
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
              {lang === "de" ? "Weitere Aktionen für diese Bestellung" : "Altre azioni per questo ordine"}
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

      {/* Mobile confirmation drawer — mirrors the desktop inline confirm flows. Mounted only on mobile. */}
      <Drawer
        open={isMobile && !!confirmAction}
        onOpenChange={(open) => { if (!open) { setConfirmAction(null); setChangeRequestText(""); } }}
      >
        <DrawerContent className="md:hidden" data-testid="drawer-confirm-action">
          {confirmAction === "cancelled" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Bestellung stornieren?" : "Annullare l'ordine?"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Diese Aktion kann nicht rückgängig gemacht werden." : "Questa azione non può essere annullata."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 flex flex-col gap-2">
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white shadow-sm inline-flex items-center justify-center gap-2"
                  onClick={() => updateStatusMutation.mutate({ status: "cancelled" })}
                  disabled={updateStatusMutation.isPending}
                  data-testid="confirm-cancel-order-mobile"
                >
                  <Ban className="h-4 w-4" />
                  {updateStatusMutation.isPending
                    ? (lang === "de" ? "Wird storniert..." : "Annullamento...")
                    : (lang === "de" ? "Ja, stornieren" : "Si, annulla")}
                </button>
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                  onClick={() => setConfirmAction(null)}
                  disabled={updateStatusMutation.isPending}
                  data-testid="cancel-cancel-order-mobile"
                >
                  {lang === "de" ? "Abbrechen" : "Annulla"}
                </button>
              </div>
            </>
          )}
          {confirmAction === "delivered" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Als geliefert markieren?" : "Segnare come consegnato?"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Bestätigt die Auslieferung der Bestellung." : "Conferma la consegna dell'ordine."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 flex flex-col gap-2">
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white shadow-sm inline-flex items-center justify-center gap-2"
                  onClick={() => updateStatusMutation.mutate({ status: "delivered" })}
                  disabled={updateStatusMutation.isPending}
                  data-testid="confirm-mark-delivered-mobile"
                >
                  <CheckCircle className="h-4 w-4" />
                  {updateStatusMutation.isPending
                    ? (lang === "de" ? "Wird aktualisiert..." : "Aggiornamento...")
                    : (lang === "de" ? "Bestätigen" : "Conferma")}
                </button>
                <button
                  className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                  onClick={() => setConfirmAction(null)}
                  disabled={updateStatusMutation.isPending}
                  data-testid="cancel-mark-delivered-mobile"
                >
                  {lang === "de" ? "Abbrechen" : "Annulla"}
                </button>
              </div>
            </>
          )}
          {confirmAction === "change_request" && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle>{lang === "de" ? "Änderung anfragen" : "Richiedi modifica"}</DrawerTitle>
                <DrawerDescription>
                  {lang === "de" ? "Beschreibe kurz, was geändert werden soll." : "Descrivi brevemente la modifica richiesta."}
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6 space-y-3">
                <textarea
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  rows={4}
                  placeholder={lang === "de" ? "Was möchten Sie ändern?" : "Cosa vorresti modificare?"}
                  value={changeRequestText}
                  onChange={(e) => setChangeRequestText(e.target.value)}
                  autoFocus
                  data-testid="input-change-request-mobile"
                />
                <div className="flex flex-col gap-2">
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    onClick={() => changeRequestMutation.mutate(changeRequestText)}
                    disabled={!changeRequestText.trim() || changeRequestMutation.isPending}
                    data-testid="confirm-change-request-mobile"
                  >
                    <Send className="h-4 w-4" />
                    {changeRequestMutation.isPending
                      ? (lang === "de" ? "Wird gesendet..." : "Invio...")
                      : (lang === "de" ? "Senden" : "Invia")}
                  </button>
                  <button
                    className="w-full h-12 rounded-xl text-sm font-semibold bg-card border border-border text-foreground"
                    onClick={() => { setConfirmAction(null); setChangeRequestText(""); }}
                    disabled={changeRequestMutation.isPending}
                    data-testid="cancel-change-request-mobile"
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
        presetOrderId={orderId}
        lockTarget
        lockedLabel={order ? `#${formatOrderNumber(order)}` : undefined}
      />
    </div>
  );
}
