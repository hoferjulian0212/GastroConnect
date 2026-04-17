import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Clock, Package, Truck, CheckCircle, XCircle, Building2, FileText, Loader2, X, ShoppingBag, CalendarDays, Timer, Send, MessageSquare, Store, AlertTriangle, RotateCcw, User as UserIcon, SlidersHorizontal, ChevronUp, ChevronDown, Download, RefreshCw, Check, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import type { OrderWithDetails, ProductWithSupplierAndPromotion } from "@shared/schema";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { de, it } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSearch, useLocation } from "wouter";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import DeliveryDatePicker from "@/components/DeliveryDatePicker";
import { PartialConfirmationDialog } from "@/components/PartialConfirmationDialog";
import SwipeableRow from "@/components/SwipeableRow";
import StaggeredList from "@/components/StaggeredList";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export default function SupplierOrders() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [, navTo] = useLocation();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateFnsLocale = lang === "de" ? de : it;
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightOrderId = searchParams.get("orderId");
  const initialRestaurantId = searchParams.get("restaurantId");
  const initialStatus = searchParams.get("status");
  const highlightRef = useRef<HTMLDivElement>(null);

  const [activeStatusTab, setActiveStatusTab] = useState<string>(initialStatus || (highlightOrderId ? "all" : "pending"));

  const { containerRef: pullRefreshRef, pullDistance, isRefreshing, progress: pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
    },
  });
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [filterRestaurant, setFilterRestaurant] = useState<string>(initialRestaurantId || "all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [deliveryDatePicker, setDeliveryDatePicker] = useState<{ orderId: string; restaurantId: string } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithSupplierAndPromotion | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<OrderWithDetails | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showBatchCancelConfirm, setShowBatchCancelConfirm] = useState(false);

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: allProducts } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const productsMap = useMemo(() => {
    const map = new Map<string, ProductWithSupplierAndPromotion>();
    allProducts?.forEach(p => map.set(p.id, p));
    return map;
  }, [allProducts]);

  const uniqueRestaurants = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { id: string; name: string; profileImageUrl: string | null; orderCount: number }>();
    orders.forEach(o => {
      if (o.restaurant?.id) {
        const existing = map.get(o.restaurant.id);
        if (existing) {
          existing.orderCount++;
        } else {
          map.set(o.restaurant.id, {
            id: o.restaurant.id,
            name: o.restaurant.companyName || o.restaurant.name || t("common", "unknown"),
            profileImageUrl: o.restaurant.profileImageUrl || null,
            orderCount: 1,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [orders, t]);

  const hasActiveFilters = filterRestaurant !== "all" || filterDateFrom || filterDateTo;
  const hasSecondaryFilters = !!(filterDateFrom || filterDateTo);

  const clearFilters = () => {
    setFilterRestaurant("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const handleExport = (format: "csv" | "pdf") => {
    const params = new URLSearchParams({
      userId: currentUser?.id || "",
      role: "supplier",
      format,
    });
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    if (filterRestaurant !== "all") params.set("restaurantId", filterRestaurant);
    window.open(`/api/orders/export?${params.toString()}`, "_blank");
    setShowExportMenu(false);
  };

  const deliveryNoteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/delivery-note`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents", currentUser?.id, "supplier"] });
      toast({
        title: t("supplierOrders", "deliveryNoteCreated"),
        description: lang === "de" ? "Der Lieferschein wurde erfolgreich generiert und im Chat gesendet." : "La bolla di consegna è stata generata con successo e inviata in chat.",
      });
    },
    onError: (error: any) => {
      const msg = error?.message?.includes("already exists") 
        ? (lang === "de" ? "Ein Lieferschein existiert bereits für diese Bestellung." : "Una bolla di consegna esiste già per questo ordine.")
        : t("supplierOrders", "deliveryNoteError");
      toast({
        title: t("common", "error"),
        description: msg,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, requestedDeliveryDate }: { orderId: string; status: string; requestedDeliveryDate?: string }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, requestedDeliveryDate: requestedDeliveryDate || undefined });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent'] });
      const statusLabels: Record<string, Record<string, string>> = {
        confirmed: { de: "Bestellung bestätigt", it: "Ordine confermato" },
        in_delivery: { de: "Bestellung in Lieferung", it: "Ordine in consegna" },
        delivered: { de: "Bestellung geliefert", it: "Ordine consegnato" },
        cancelled: { de: "Bestellung storniert", it: "Ordine annullato" },
      };
      const label = statusLabels[variables.status]?.[lang] || (lang === "de" ? "Status aktualisiert" : "Stato aggiornato");
      toast({ title: label });
      setDetailOrder(null);
      setShowMessageInput(false);
      setOrderMessage("");
    },
    onError: (error: any) => {
      let title = t("common", "error");
      let description = t("supplierOrders", "statusUpdateError");
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

  const [rescheduleOrderId, setRescheduleOrderId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");

  const rescheduleMutation = useMutation({
    mutationFn: async ({ orderId, requestedDeliveryDate }: { orderId: string; requestedDeliveryDate: string }) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/reschedule`, { requestedDeliveryDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      toast({ title: lang === "de" ? "Liefertermin verschoben" : "Data di consegna rinviata" });
      setRescheduleOrderId(null);
      setRescheduleDate("");
      setDetailOrder(null);
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedOrders(new Set());
  };

  const batchConfirmMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/supplier/orders/batch-confirm", {
        orderIds: Array.from(selectedOrders),
        supplierId: currentUser?.id,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.includes?.("/api/supplier/detailed-stats") });
      toast({
        title: lang === "de" ? `${data.confirmed} Bestellungen bestätigt` : `${data.confirmed} ordini confermati`,
        ...(data.failed > 0 ? { description: lang === "de" ? `${data.failed} fehlgeschlagen` : `${data.failed} falliti` } : {}),
      });
      exitBatchMode();
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const batchCancelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/supplier/orders/batch-cancel", {
        orderIds: Array.from(selectedOrders),
        supplierId: currentUser?.id,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
      toast({
        title: lang === "de" ? `${data.cancelled} Bestellungen storniert` : `${data.cancelled} ordini annullati`,
        ...(data.failed > 0 ? { description: lang === "de" ? `${data.failed} fehlgeschlagen` : `${data.failed} falliti` } : {}),
      });
      exitBatchMode();
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const sendOrderMessageMutation = useMutation({
    mutationFn: async ({ order, message }: { order: OrderWithDetails; message: string }) => {
      const restaurantName = order.restaurant?.companyName || order.restaurant?.name || "";
      const refLabel = `${lang === "de" ? "Bestellung" : "Ordine"} #${order.id.substring(0, 8)} - ${restaurantName}`;
      return await apiRequest("POST", "/api/send-referenced-message", {
        senderId: currentUser?.id,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
        message,
        referenceType: "order",
        referenceId: order.id,
        referenceLabel: refLabel,
      });
    },
    onSuccess: () => {
      toast({ title: lang === "de" ? "Nachricht gesendet" : "Messaggio inviato" });
      setOrderMessage("");
      setShowMessageInput(false);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const getStatusColor = (status: string) => {
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

  const getStatusAccent = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-400 dark:bg-yellow-500";
      case "confirmed": return "bg-blue-400 dark:bg-blue-500";
      case "partially_confirmed": return "bg-orange-400 dark:bg-orange-500";
      case "in_delivery": return "bg-purple-400 dark:bg-purple-500";
      case "delivered": return "bg-green-400 dark:bg-green-500";
      case "cancelled": return "bg-red-400 dark:bg-red-500";
      default: return "bg-muted-foreground";
    }
  };

  const getStatusCardBg = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "confirmed": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "in_delivery": return "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
      case "delivered": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "cancelled": return "bg-red-50/40 dark:bg-red-950/15 border-red-200 dark:border-red-800/40";
      default: return "";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "confirmed": return <Package className="h-4 w-4" />;
      case "partially_confirmed": return <AlertTriangle className="h-4 w-4" />;
      case "in_delivery": return <Truck className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "cancelled": return <XCircle className="h-4 w-4" />;
      default: return <ClipboardList className="h-4 w-4" />;
    }
  };

  useEffect(() => {
    if (highlightOrderId && highlightRef.current && !isLoading) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [highlightOrderId, isLoading]);

  useEffect(() => {
    if (highlightOrderId && orders) {
      const order = orders.find(o => o.id === highlightOrderId);
      if (order) navTo(`/supplier/orders/${order.id}`);
    }
  }, [highlightOrderId, orders]);

  const filterOrders = (status: string | null) => {
    if (!orders) return [];
    return orders.filter(order => {
      if (status && order.status !== status) return false;
      if (filterRestaurant !== "all" && order.restaurant?.id !== filterRestaurant) return false;
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(order.createdAt) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(order.createdAt) > to) return false;
      }
      return true;
    });
  };

  const statusSteps = ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered"];

  const getStepIndex = (status: string) => {
    if (status === "cancelled") return -1;
    return statusSteps.indexOf(status);
  };

  const OrderCard = ({ order }: { order: OrderWithDetails }) => {
    const isHighlighted = order.id === highlightOrderId;
    const currentStep = getStepIndex(order.status);
    const isCancelled = order.status === "cancelled";
    const restaurantName = order.restaurant?.companyName || order.restaurant?.name || t("common", "unknown");
    const lastUpdate = order.updatedAt || order.createdAt;

    const isSelected = selectedOrders.has(order.id);

    return (
    <div ref={isHighlighted ? highlightRef : undefined}>
    <div className={`overflow-hidden rounded-md cursor-pointer ${isHighlighted ? "ring-2 ring-primary shadow-md" : ""} ${isSelected ? "ring-2 ring-primary" : ""}`} onClick={() => batchMode && order.status === "pending" ? toggleOrderSelection(order.id) : navTo(`/supplier/orders/${order.id}`)} data-testid={`order-card-${order.id}`}>
      <Card className={`hover-elevate ${getStatusCardBg(order.status)}`}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          {batchMode && order.status === "pending" && (
            <div className="flex items-center shrink-0 pt-0.5" onClick={(e) => { e.stopPropagation(); toggleOrderSelection(order.id); }}>
              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? "bg-primary border-primary" : "border-muted-foreground/40 bg-background"}`} data-testid={`checkbox-order-${order.id}`}>
                {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm md:text-base truncate" data-testid={`text-restaurant-${order.id}`}>
                {restaurantName}
              </p>
              <p className="text-base md:text-lg font-bold shrink-0" data-testid={`text-total-${order.id}`}>{order.totalAmount}€</p>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs shrink-0`} variant="outline">
                {getStatusIcon(order.status)}
                <span className="ml-1">{getOrderStatus(order.status, lang, true)}</span>
              </Badge>
              <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground">
                <ShoppingBag className="h-3 w-3 shrink-0" />
                #{order.id.slice(0, 8)}
              </span>
              <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                {format(new Date(order.createdAt), "dd.MM.yy", { locale: dateFnsLocale })}
              </span>
              <span className="text-[11px] md:text-xs text-muted-foreground">
                {order.items?.length || 0} {lang === "de" ? "Artikel" : "articoli"}
              </span>
              {order.createdByUser && (
                <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground" data-testid={`text-created-by-${order.id}`}>
                  <UserIcon className="h-3 w-3 shrink-0" />
                  {order.createdByUser.name}
                </span>
              )}
            </div>
          </div>
        </div>
        {order.status !== "delivered" && order.status !== "cancelled" && (() => {
          const primary = order.status === "pending"
            ? { label: lang === "de" ? "Bestätigen" : "Confermare", icon: CheckCircle, color: "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/20", action: () => setConfirmOrder(order), testId: `button-status-confirmed-${order.id}` }
            : (order.status === "confirmed" || order.status === "partially_confirmed")
            ? { label: lang === "de" ? "Lieferung starten" : "Avvia consegna", icon: Truck, color: "bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20", action: () => setDeliveryDatePicker({ orderId: order.id, restaurantId: order.restaurantId }), testId: `button-status-in_delivery-${order.id}` }
            : order.status === "in_delivery"
            ? { label: lang === "de" ? "Als geliefert markieren" : "Segna consegnato", icon: Package, color: "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/20", action: () => updateStatusMutation.mutate({ orderId: order.id, status: "delivered" }), testId: `button-status-delivered-${order.id}` }
            : null;
          const PrimaryIcon = primary?.icon;
          const showSetDate = !order.requestedDeliveryDate && order.status !== "pending";
          const showCancel = order.status !== "in_delivery";
          return (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
              {primary && PrimaryIcon && (
                <button
                  className={`h-9 rounded-full text-sm font-semibold px-4 inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 ${primary.color}`}
                  onClick={primary.action}
                  disabled={updateStatusMutation.isPending}
                  data-testid={primary.testId}
                >
                  <PrimaryIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{primary.label}</span>
                </button>
              )}
              {(showSetDate || showCancel) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-9 w-9 rounded-full inline-flex items-center justify-center border border-border bg-card hover:bg-accent transition-colors shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-more-actions-${order.id}`}
                      aria-label={lang === "de" ? "Mehr Aktionen" : "Altre azioni"}
                    >
                      <MoreVertical className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {showSetDate && (
                      <DropdownMenuItem onClick={() => setDeliveryDatePicker({ orderId: order.id, restaurantId: order.restaurantId })} data-testid={`button-set-date-${order.id}`}>
                        <CalendarDays className="h-4 w-4 mr-2 text-purple-600 dark:text-purple-400" />
                        {lang === "de" ? "Lieferdatum setzen" : "Imposta data"}
                      </DropdownMenuItem>
                    )}
                    {showSetDate && showCancel && <DropdownMenuSeparator />}
                    {showCancel && (
                      <DropdownMenuItem onClick={() => setCancelConfirmId(order.id)} className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300" data-testid={`button-status-cancelled-${order.id}`}>
                        <XCircle className="h-4 w-4 mr-2" />
                        {lang === "de" ? "Bestellung stornieren" : "Annulla ordine"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })()}

        {order.status === "in_delivery" && order.requestedDeliveryDate && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-3 py-2" data-testid={`banner-delivery-date-${order.id}`}>
            <Truck className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-purple-600 dark:text-purple-400 font-medium">{t("orders", "deliveryOn")}</span>
              <p className="text-sm md:text-base font-bold text-purple-700 dark:text-purple-300" data-testid={`text-delivery-date-large-${order.id}`}>
                {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long" })}
              </p>
            </div>
          </div>
        )}

        {order.status === "delivered" && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-2" data-testid={`banner-delivered-date-${order.id}`}>
            <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-green-600 dark:text-green-400 font-medium">{t("orders", "deliveredOn")}</span>
              <p className="text-sm md:text-base font-bold text-green-700 dark:text-green-300" data-testid={`text-delivered-date-large-${order.id}`}>
                {format(new Date(lastUpdate), "EEEE, dd. MMMM yyyy", { locale: dateFnsLocale })}
              </p>
            </div>
          </div>
        )}

        {order.status !== "in_delivery" && order.status !== "delivered" && order.requestedDeliveryDate && (
          <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-2.5 py-1.5" data-testid={`banner-planned-date-${order.id}`}>
            <CalendarDays className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-xs md:text-sm font-semibold text-blue-700 dark:text-blue-300">
              {t("orders", "deliveryOn")} {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long" })}
            </span>
          </div>
        )}

        {order.items && order.items.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="space-y-1">
              {order.items.map((item: any) => (
                <div key={item.id} className="flex items-center gap-2 text-xs md:text-sm" data-testid={`card-item-${item.id}`}>
                  {item.productImageUrl ? (
                    <img src={item.productImageUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-muted-foreground flex-1 truncate">
                    <span className="font-medium text-foreground">{item.quantity}x</span> {item.productName}
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-2">{item.totalPrice}€</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isCancelled && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-0">
              {statusSteps.map((step, i) => {
                const isActive = i <= currentStep;
                const isCurrent = i === currentStep;
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center" data-testid={`status-step-${step}-${order.id}`}>
                      <div
                        className={`flex items-center justify-center h-6 w-6 md:h-7 md:w-7 rounded-full border-2 ${isActive ? "animate-status-dot" : ""} ${
                          isCurrent
                            ? `${getStatusAccent(step)} border-transparent`
                            : isActive
                              ? `${getStatusAccent(step)} border-transparent opacity-60`
                              : "bg-muted/50 border-border"
                        }`}
                        style={isActive ? { animationDelay: `${i * 120}ms` } : undefined}
                      >
                        {i === 0 && <Clock className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 1 && <Package className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 2 && <AlertTriangle className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 3 && <Truck className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                        {i === 4 && <CheckCircle className={`h-3 w-3 ${isActive ? "text-white" : "text-muted-foreground"}`} />}
                      </div>
                      <span className={`hidden md:block text-[10px] mt-0.5 text-center leading-tight ${isCurrent ? "font-semibold text-foreground" : isActive ? "text-muted-foreground" : "text-muted-foreground/50"}`}>
                        {getOrderStatus(step, lang, true)}
                      </span>
                    </div>
                    {i < statusSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 rounded-full ${i < currentStep ? getStatusAccent(statusSteps[i + 1]) + " opacity-40 animate-status-line" : "bg-border"}`} style={i < currentStep ? { animationDelay: `${(i + 1) * 120}ms` } : undefined} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 text-[11px] md:text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1" data-testid={`text-last-update-${order.id}`}>
              <CalendarDays className="h-3 w-3" />
              {lang === "de" ? "Aktualisiert" : "Aggiornato"}: {formatDistanceToNow(new Date(lastUpdate), { addSuffix: true, locale: dateFnsLocale })}
            </span>
            {order.notes && (
              <span className="text-[10px] md:text-xs italic truncate max-w-[200px]">
                "{order.notes}"
              </span>
            )}
          </div>
          {order.status === "in_delivery" && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); deliveryNoteMutation.mutate(order.id); }}
              disabled={deliveryNoteMutation.isPending}
              data-testid={`button-delivery-note-${order.id}`}
            >
              {deliveryNoteMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5 mr-1" />
              )}
              {t("supplierOrders", "createDeliveryNote")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    </div>
    </div>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="dark bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl mb-3 md:mb-4 space-y-3" data-testid="orders-hero">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{lang === "de" ? "Aufträge" : "Ordini"}</h1>
            <p className="hidden md:block text-sm text-white/50 mt-1">{t("supplierOrders", "incomingOrders")}</p>
          </div>
          <div className="flex items-center gap-2">
            {activeStatusTab === "pending" && !batchMode && (
              <button
                onClick={() => setBatchMode(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/[0.07] text-white text-xs font-medium hover:bg-white/15 transition-all"
                data-testid="button-batch-mode"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>{lang === "de" ? "Auswählen" : "Seleziona"}</span>
              </button>
            )}
            {batchMode && (
              <button
                onClick={exitBatchMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/40 bg-white/20 text-white text-xs font-medium hover:bg-white/25 transition-all"
                data-testid="button-exit-batch"
              >
                <X className="h-3.5 w-3.5" />
                <span>{lang === "de" ? "Abbrechen" : "Annulla"}</span>
              </button>
            )}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/20 bg-white/[0.07] text-white text-xs font-medium hover:bg-white/15 transition-all"
              data-testid="button-export"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-[#1e2130] border border-white/10 rounded-xl shadow-xl z-30 min-w-[160px] py-1">
                <button
                  onClick={() => handleExport("csv")}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  data-testid="export-csv"
                >
                  <FileText className="h-4 w-4" />
                  CSV Export
                </button>
                <button
                  onClick={() => handleExport("pdf")}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  data-testid="export-pdf"
                >
                  <FileText className="h-4 w-4" />
                  PDF Export
                </button>
              </div>
            )}
          </div>
          </div>
        </div>

        {uniqueRestaurants.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setFilterRestaurant("all")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
                filterRestaurant === "all"
                  ? "border-white/40 bg-white/20 text-white shadow-sm"
                  : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
              }`}
              data-testid="filter-restaurant-all"
            >
              <Store className="h-3 w-3" />
              <span>{t("common", "all")}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/15">{orders?.length || 0}</span>
            </button>
            {uniqueRestaurants.map(restaurant => {
              const isActive = filterRestaurant === restaurant.id;
              return (
                <button
                  key={restaurant.id}
                  onClick={() => setFilterRestaurant(restaurant.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
                    isActive
                      ? "border-white/40 bg-white/20 text-white shadow-sm"
                      : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
                  }`}
                  data-testid={`filter-restaurant-${restaurant.id}`}
                >
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={restaurant.profileImageUrl || undefined} />
                    <AvatarFallback className="text-[7px] font-semibold bg-white/20 text-white">
                      {restaurant.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[80px] truncate">{restaurant.name}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/15">{restaurant.orderCount}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { key: "pending", dotColor: "bg-yellow-500" },
            { key: "confirmed", dotColor: "bg-blue-500" },
            { key: "partially_confirmed", dotColor: "bg-orange-500" },
            { key: "in_delivery", dotColor: "bg-purple-500" },
            { key: "delivered", dotColor: "bg-green-500" },
            { key: "cancelled", dotColor: "bg-red-500" },
            { key: "all", dotColor: "bg-gray-400" },
          ] as const).map(({ key, dotColor }) => {
            const count = filterOrders(key === "all" ? null : key).length;
            return (
              <button
                key={key}
                onClick={() => setActiveStatusTab(key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
                  activeStatusTab === key
                    ? "border-white/40 bg-white/20 text-white shadow-sm"
                    : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
                }`}
                data-testid={`filter-status-${key}`}
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
                <span className="whitespace-nowrap">
                  {key === "all" ? t("common", "all") : key === "in_delivery" ? (lang === "de" ? "Lieferung" : "Consegna") : getOrderStatus(key, lang, true)}
                </span>
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/15">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSecondaryFilters(!showSecondaryFilters)}
            className="flex items-center gap-1.5 text-xs md:text-sm text-white/60 hover:text-white rounded-md px-2 py-1.5 transition-colors"
            data-testid="button-toggle-filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{lang === "de" ? "Datum" : "Data"}</span>
            {hasSecondaryFilters && (
              <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                {(filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)}
              </span>
            )}
            {showSecondaryFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-white/60 hover:text-white rounded-md px-2 py-1.5 flex items-center gap-1 transition-colors shrink-0"
              data-testid="button-clear-filters"
            >
              <X className="h-3 w-3" />
              {t("common", "reset")}
            </button>
          )}
        </div>

        {showSecondaryFilters && (
          <div className="flex gap-2 pt-1">
            <div className="flex-1 min-w-0">
              <label className="text-[10px] md:text-xs text-white/50 mb-1 block">{t("common", "from")}</label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className={`h-9 text-xs md:text-sm w-full bg-white/10 border-white/20 text-white ${!filterDateFrom ? 'date-empty' : ''}`}
                data-testid="filter-date-from"
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[10px] md:text-xs text-white/50 mb-1 block">{t("common", "to")}</label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className={`h-9 text-xs md:text-sm w-full bg-white/10 border-white/20 text-white ${!filterDateTo ? 'date-empty' : ''}`}
                data-testid="filter-date-to"
              />
            </div>
          </div>
        )}
      </div>

      <div ref={pullRefreshRef} className="relative">
        {pullDistance > 0 && (
          <div className="absolute top-0 left-0 right-0 flex justify-center z-10 pointer-events-none md:hidden" style={{ transform: `translateY(${pullDistance - 40}px)` }}>
            <div className={`flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 border border-primary/20 ${isRefreshing ? "animate-pull-spin" : ""}`}>
              <RefreshCw className="h-4 w-4 text-primary" style={{ transform: isRefreshing ? undefined : `rotate(${pullProgress * 270}deg)`, opacity: pullProgress }} />
            </div>
          </div>
        )}
      <Tabs value={activeStatusTab} className="w-full">
        <div className="hidden"></div>

        {["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled", "all"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4 md:mt-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const filtered = filterOrders(tab === "all" ? null : tab);
                  if (filtered.length === 0) {
                    return (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                          <ClipboardList className="h-12 w-12 text-muted-foreground/50 mb-3" />
                          <p className="text-muted-foreground">{lang === "de" ? "Keine Bestellungen gefunden" : "Nessun ordine trovato"}</p>
                        </CardContent>
                      </Card>
                    );
                  }
                  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  const groups: { label: string; orders: OrderWithDetails[] }[] = [];
                  const groupMap = new Map<string, OrderWithDetails[]>();
                  for (const order of sorted) {
                    const d = new Date(order.createdAt);
                    const key = format(d, "yyyy-MM-dd");
                    if (!groupMap.has(key)) groupMap.set(key, []);
                    groupMap.get(key)!.push(order);
                  }
                  for (const [key, ords] of groupMap.entries()) {
                    const d = new Date(key + "T00:00:00");
                    let label: string;
                    if (isToday(d)) label = lang === "de" ? "Heute" : "Oggi";
                    else if (isYesterday(d)) label = lang === "de" ? "Gestern" : "Ieri";
                    else label = format(d, "dd. MMMM yyyy", { locale: dateFnsLocale });
                    groups.push({ label, orders: ords });
                  }
                  return groups.map((group) => (
                    <div key={group.label} data-testid={`order-group-${group.label}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
                        <span className="text-xs text-muted-foreground/60">({group.orders.length})</span>
                      </div>
                      <StaggeredList className="space-y-2 md:space-y-3" staggerDelay={40}>
                        {group.orders.map((order) => (
                          <SwipeableRow
                            key={order.id}
                            leftActions={
                              order.status === "pending"
                                ? [
                                    {
                                      icon: <CheckCircle className="h-5 w-5" />,
                                      label: lang === "de" ? "Bestätigen" : "Conferma",
                                      color: "bg-green-500",
                                      onClick: () => setConfirmOrder(order),
                                      testId: `swipe-confirm-${order.id}`,
                                    },
                                  ]
                                : order.status === "confirmed" || order.status === "partially_confirmed"
                                ? [
                                    {
                                      icon: <Truck className="h-5 w-5" />,
                                      label: lang === "de" ? "Lieferung" : "Consegna",
                                      color: "bg-blue-500",
                                      onClick: () => setDeliveryDatePicker({ orderId: order.id, restaurantId: order.restaurantId }),
                                      testId: `swipe-deliver-${order.id}`,
                                    },
                                  ]
                                : order.status === "in_delivery"
                                ? [
                                    {
                                      icon: <CheckCircle className="h-5 w-5" />,
                                      label: lang === "de" ? "Geliefert" : "Consegnato",
                                      color: "bg-green-500",
                                      onClick: () => updateStatusMutation.mutate({ orderId: order.id, status: "delivered" }),
                                      testId: `swipe-delivered-${order.id}`,
                                    },
                                  ]
                                : []
                            }
                            rightActions={
                              order.status !== "delivered" && order.status !== "cancelled" && order.status !== "in_delivery"
                                ? [
                                    {
                                      icon: <XCircle className="h-5 w-5" />,
                                      label: lang === "de" ? "Stornieren" : "Annulla",
                                      color: "bg-red-500",
                                      onClick: () => setCancelConfirmId(order.id),
                                      testId: `swipe-cancel-${order.id}`,
                                    },
                                  ]
                                : []
                            }
                          >
                            <OrderCard order={order} />
                          </SwipeableRow>
                        ))}
                      </StaggeredList>
                    </div>
                  ));
                })()}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      </div>

      <Dialog open={!!detailOrder} onOpenChange={(open) => { if (!open) { setDetailOrder(null); setShowMessageInput(false); setOrderMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-order-detail">
          <DialogHeader className="sr-only">
            <DialogTitle>{lang === "de" ? "Auftrag" : "Ordine"} #{detailOrder?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="px-5 pt-5 pb-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{lang === "de" ? "Auftrag" : "Ordine"}</p>
                  <h3 className="text-base font-semibold">#{detailOrder.id.slice(0, 8)}</h3>
                </div>
                <Badge className={`${getStatusColor(detailOrder.status)}`} variant="outline">
                  {getStatusIcon(detailOrder.status)}
                  <span className="ml-1">{getOrderStatus(detailOrder.status, lang, true)}</span>
                </Badge>
              </div>

              <div className="space-y-2 text-sm rounded-xl bg-muted/30 p-3">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">{t("common", "restaurant")}</span>
                  <span className="font-medium text-right truncate">{detailOrder.restaurant?.companyName || detailOrder.restaurant?.name || t("common", "unknown")}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">{lang === "de" ? "Bestellt am" : "Ordinato il"}</span>
                  <span className="shrink-0">{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: dateFnsLocale })}</span>
                </div>
                {detailOrder.createdByUser && (
                  <div className="flex justify-between gap-3" data-testid="detail-created-by">
                    <span className="text-muted-foreground shrink-0">{t("orders", "createdBy")}</span>
                    <span className="font-medium text-right truncate">{detailOrder.createdByUser.name}</span>
                  </div>
                )}
                {detailOrder.requestedDeliveryDate ? (
                  <div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground shrink-0">{lang === "de" ? "Liefertermin" : "Data consegna"}</span>
                      <span className="text-right truncate">{new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</span>
                    </div>
                    {detailOrder.originalDeliveryDate && (
                      <div className="flex justify-between gap-3 mt-1">
                        <span className="text-muted-foreground text-xs shrink-0">{lang === "de" ? "Urspr. Termin" : "Data originale"}</span>
                        <span className="text-xs text-amber-600 dark:text-amber-400 text-right truncate">{new Date(detailOrder.originalDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "short" })}</span>
                      </div>
                    )}
                    {(detailOrder.status === "in_delivery" || detailOrder.status === "confirmed") && new Date(detailOrder.requestedDeliveryDate + "T00:00:00") < new Date(new Date().toDateString()) && (
                      <div className="mt-2">
                        {rescheduleOrderId === detailOrder.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={rescheduleDate}
                              onChange={(e) => setRescheduleDate(e.target.value)}
                              min={new Date().toISOString().split("T")[0]}
                              className="text-xs h-8"
                              data-testid="input-reschedule-date"
                            />
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!rescheduleDate || rescheduleMutation.isPending}
                              onClick={() => rescheduleMutation.mutate({ orderId: detailOrder.id, requestedDeliveryDate: rescheduleDate })}
                              data-testid="button-confirm-reschedule"
                            >
                              {rescheduleMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (lang === "de" ? "OK" : "OK")}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setRescheduleOrderId(null); setRescheduleDate(""); }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
                            onClick={() => setRescheduleOrderId(detailOrder.id)}
                            data-testid="button-reschedule-delivery"
                          >
                            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                            {lang === "de" ? "Liefertermin verschieben" : "Rinvia data di consegna"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{lang === "de" ? "Liefertermin" : "Data consegna"}</span>
                    <span className="text-muted-foreground text-right truncate">{lang === "de" ? "Sobald wie möglich" : "Il prima possibile"}</span>
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-medium mb-2">{t("common", "items")} ({detailOrder.items?.length || 0})</p>
                <div className="space-y-2">
                  {detailOrder.items?.map((item) => {
                    const product = productsMap.get(item.productId);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 text-sm p-2 rounded-xl bg-muted/30 ${product ? "cursor-pointer hover:bg-muted transition-colors" : ""}`}
                        onClick={() => product && setSelectedProduct(product)}
                        data-testid={`detail-item-${item.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {product?.imageUrl ? (
                            <img src={product.imageUrl} alt={item.productName} className="h-8 w-8 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="min-w-0 truncate">
                            <span className="font-medium">{item.quantity}x</span>{" "}
                            <span className={product ? "underline decoration-dotted underline-offset-2" : ""}>{item.productName}</span>
                            <span className="text-muted-foreground ml-1">@ {item.unitPrice}€</span>
                          </div>
                        </div>
                        <span className="font-medium shrink-0 ml-2">{item.totalPrice}€</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {detailOrder.notes && (
                <div className="rounded-xl bg-muted/30 p-3">
                  <p className="text-sm font-medium mb-1">{lang === "de" ? "Anmerkungen" : "Note"}</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="rounded-xl bg-muted/30 p-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("common", "total")}</span>
                <span className="text-lg font-bold" data-testid="text-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              <div className="space-y-2.5">
                {detailOrder.status !== "delivered" && detailOrder.status !== "cancelled" && (
                  <div className="rounded-xl bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {lang === "de" ? "Aktionen" : "Azioni"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {detailOrder.status === "pending" && (
                        <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => { setDetailOrder(null); setConfirmOrder(detailOrder); }} data-testid="button-status-confirmed">
                          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                          {lang === "de" ? "Bestätigen" : "Confermare"}
                        </Button>
                      )}
                      {(detailOrder.status === "confirmed" || detailOrder.status === "partially_confirmed") && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setDeliveryDatePicker({ orderId: detailOrder.id, restaurantId: detailOrder.restaurantId })} disabled={updateStatusMutation.isPending} data-testid="button-status-in_delivery">
                          <Truck className="h-3.5 w-3.5 mr-1.5" />
                          {lang === "de" ? "In Lieferung" : "In consegna"}
                        </Button>
                      )}
                      {detailOrder.status === "in_delivery" && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => updateStatusMutation.mutate({ orderId: detailOrder.id, status: "delivered" })} disabled={updateStatusMutation.isPending} data-testid="button-status-delivered">
                          <Package className="h-3.5 w-3.5 mr-1.5" />
                          {lang === "de" ? "Geliefert" : "Consegnato"}
                        </Button>
                      )}
                      {!detailOrder.requestedDeliveryDate && detailOrder.status !== "pending" && (
                        <Button size="sm" variant="outline" onClick={() => setDeliveryDatePicker({ orderId: detailOrder.id, restaurantId: detailOrder.restaurantId })} disabled={updateStatusMutation.isPending} data-testid="button-set-date">
                          <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-purple-600" />
                          {lang === "de" ? "Datum setzen" : "Imposta data"}
                        </Button>
                      )}
                      {detailOrder.status !== "in_delivery" && (
                        <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setCancelConfirmId(detailOrder.id)} disabled={updateStatusMutation.isPending} data-testid="button-status-cancelled">
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          {lang === "de" ? "Stornieren" : "Annullare"}
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {detailOrder.status === "in_delivery" && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => deliveryNoteMutation.mutate(detailOrder.id)}
                    disabled={deliveryNoteMutation.isPending}
                    data-testid="button-detail-delivery-note"
                  >
                    {deliveryNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    {deliveryNoteMutation.isPending ? (lang === "de" ? "Wird erstellt..." : "Creazione...") : t("supplierOrders", "createDeliveryNote")}
                  </Button>
                )}

                {detailOrder.status !== "cancelled" && (
                  <div className="border rounded-lg p-3 bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground">
                        {lang === "de" ? "Status korrigieren" : "Correggi stato"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Select
                        onValueChange={(value) => {
                          if (value && value !== detailOrder.status) {
                            updateStatusMutation.mutate({ orderId: detailOrder.id, status: value });
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-status-correction">
                          <SelectValue placeholder={lang === "de" ? "Status wählen..." : "Seleziona stato..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered", "cancelled"]
                            .filter(s => s !== detailOrder.status)
                            .map(s => (
                              <SelectItem key={s} value={s} data-testid={`select-correction-${s}`}>
                                {getOrderStatus(s, lang, false)}
                              </SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {!showMessageInput ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowMessageInput(true)}
                    data-testid="button-order-write-message"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    {lang === "de" ? "Nachricht schreiben" : "Scrivi messaggio"}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border-l-3 border-primary/50">
                      <ShoppingBag className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">
                        {lang === "de" ? "Bestellung" : "Ordine"} #{detailOrder.id.substring(0, 8)} - {detailOrder.restaurant?.companyName || detailOrder.restaurant?.name}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Textarea
                        value={orderMessage}
                        onChange={(e) => setOrderMessage(e.target.value)}
                        placeholder={lang === "de" ? "Ihre Nachricht..." : "Il tuo messaggio..."}
                        rows={2}
                        className="flex-1"
                        data-testid="input-order-message"
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          size="icon"
                          onClick={() => detailOrder && sendOrderMessageMutation.mutate({ order: detailOrder, message: orderMessage.trim() })}
                          disabled={!orderMessage.trim() || sendOrderMessageMutation.isPending}
                          data-testid="button-send-order-message"
                        >
                          {sendOrderMessageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setShowMessageInput(false); setOrderMessage(""); }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeliveryDatePicker
        open={!!deliveryDatePicker}
        onOpenChange={(open) => { if (!open) setDeliveryDatePicker(null); }}
        supplierId={currentUser?.id || ""}
        restaurantId={deliveryDatePicker?.restaurantId || ""}
        isPending={updateStatusMutation.isPending}
        onConfirm={(date) => {
          if (deliveryDatePicker) {
            const order = orders?.find(o => o.id === deliveryDatePicker.orderId);
            if (order && (order.status === "confirmed" || order.status === "partially_confirmed")) {
              updateStatusMutation.mutate(
                { orderId: deliveryDatePicker.orderId, status: "in_delivery", requestedDeliveryDate: date },
                { onSuccess: () => { setDeliveryDatePicker(null); } }
              );
            } else {
              apiRequest("PATCH", `/api/orders/${deliveryDatePicker.orderId}/reschedule`, { requestedDeliveryDate: date })
                .then(() => {
                  queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${currentUser?.id}`] });
                  queryClient.invalidateQueries({ queryKey: ['/api/supplier/upcoming-deliveries'] });
                  setDeliveryDatePicker(null);
                  toast({ title: lang === "de" ? "Lieferdatum gesetzt" : "Data di consegna impostata" });
                })
                .catch(() => {
                  setDeliveryDatePicker(null);
                  toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
                });
            }
          }
        }}
      />

      <ProductDetailDialog
        product={selectedProduct}
        open={!!selectedProduct}
        onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}
      />

      {confirmOrder && (
        <PartialConfirmationDialog
          order={confirmOrder}
          open={!!confirmOrder}
          onOpenChange={(open) => { if (!open) setConfirmOrder(null); }}
          lang={lang}
          currentUserId={currentUser?.id}
          productsWithStock={allProducts as any}
          onSuccess={() => setConfirmOrder(null)}
        />
      )}

      <Dialog open={!!cancelConfirmId} onOpenChange={(open) => { if (!open) setCancelConfirmId(null); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-cancel-confirm">
          <DialogHeader>
            <DialogTitle>{lang === "de" ? "Bestellung stornieren?" : "Annullare l'ordine?"}</DialogTitle>
            <DialogDescription>
              {lang === "de"
                ? "Diese Aktion kann nicht rückgängig gemacht werden. Die Bestellung wird endgültig storniert."
                : "Questa azione non può essere annullata. L'ordine verrà annullato definitivamente."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setCancelConfirmId(null)} data-testid="button-cancel-abort">
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => { if (cancelConfirmId) { updateStatusMutation.mutate({ orderId: cancelConfirmId, status: "cancelled" }); setCancelConfirmId(null); } }}
              disabled={updateStatusMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {updateStatusMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              {lang === "de" ? "Ja, stornieren" : "Sì, annulla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBatchCancelConfirm} onOpenChange={(open) => { if (!open) setShowBatchCancelConfirm(false); }}>
        <DialogContent className="max-w-sm" data-testid="dialog-batch-cancel-confirm">
          <DialogHeader>
            <DialogTitle>{lang === "de" ? `${selectedOrders.size} Bestellungen stornieren?` : `Annullare ${selectedOrders.size} ordini?`}</DialogTitle>
            <DialogDescription>
              {lang === "de"
                ? "Alle ausgewählten Bestellungen werden endgültig storniert. Diese Aktion kann nicht rückgängig gemacht werden."
                : "Tutti gli ordini selezionati verranno annullati definitivamente. Questa azione non può essere annullata."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowBatchCancelConfirm(false)} data-testid="button-batch-cancel-abort">
              {lang === "de" ? "Abbrechen" : "Annulla"}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => { setShowBatchCancelConfirm(false); batchCancelMutation.mutate(); }}
              disabled={batchCancelMutation.isPending}
              data-testid="button-batch-cancel-confirm"
            >
              <XCircle className="h-4 w-4 mr-2" />
              {lang === "de" ? "Ja, alle stornieren" : "Sì, annulla tutti"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {batchMode && selectedOrders.size > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-200" data-testid="batch-action-bar">
          <div className="flex items-center gap-2 bg-[#161921] border border-white/15 rounded-2xl px-4 py-3 shadow-2xl">
            <span className="text-sm font-medium text-white/80 mr-2">
              {selectedOrders.size} {lang === "de" ? "ausgewählt" : "selezionati"}
            </span>
            <Button
              size="sm"
              className="text-xs gap-1"
              onClick={() => batchConfirmMutation.mutate()}
              disabled={batchConfirmMutation.isPending || batchCancelMutation.isPending}
              data-testid="button-batch-confirm"
            >
              {batchConfirmMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              {lang === "de" ? "Alle bestätigen" : "Conferma tutti"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="text-xs gap-1"
              onClick={() => setShowBatchCancelConfirm(true)}
              disabled={batchConfirmMutation.isPending || batchCancelMutation.isPending}
              data-testid="button-batch-cancel"
            >
              {batchCancelMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {lang === "de" ? "Alle stornieren" : "Annulla tutti"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
