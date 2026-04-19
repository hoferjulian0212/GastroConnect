import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ShoppingBag, Clock, Package, Truck, CheckCircle, XCircle, Store, X, Pencil, Minus, Plus, Trash2, MessageSquareText, Loader2, CalendarDays, Zap, Search, PackagePlus, ArrowRight, Timer, SlidersHorizontal, ChevronDown, ChevronUp, Send, MessageSquare, ClipboardList, AlertTriangle, User as UserIcon, Download, FileText, RefreshCw, MoreVertical, Columns3, ArrowUpDown, Filter as FilterIcon, ArrowUp, ArrowDown, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { OrderWithDetails, Product, DeliverySchedule, ProductWithSupplierAndPromotion } from "@shared/schema";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { format, addDays, startOfDay, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { de, it } from "date-fns/locale";
import { Link, useSearch, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import SwipeableRow from "@/components/SwipeableRow";
import StaggeredList from "@/components/StaggeredList";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useResizableColumns } from "@/hooks/use-resizable-columns";
import { ColumnResizeHandle } from "@/components/ColumnResizeHandle";
import {
  RESTAURANT_ORDER_COL_DEFAULTS,
  RESTAURANT_ORDER_COLS_STORAGE_KEY,
  type RestaurantOrderColKey,
} from "@/lib/orderTableConfig";

interface EditableItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export default function RestaurantOrders() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const highlightOrderId = searchParams.get("orderId");
  const initialSupplierId = searchParams.get("supplierId");
  const highlightRef = useRef<HTMLDivElement>(null);

  const { containerRef: pullRefreshRef, pullDistance, isRefreshing, progress: pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
    },
  });
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>(initialSupplierId || "all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "deliveryDate" | "totalAmount" | "supplier" | "status">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [groupByDate, setGroupByDate] = useState(true);
  const ALL_COLUMNS = ["status", "supplier", "items", "deliveryDate", "createdAt", "total"] as const;
  type ColKey = typeof ALL_COLUMNS[number];
  const [visibleColumns, setVisibleColumns] = useState<Set<ColKey>>(() => {
    try {
      const saved = localStorage.getItem("restaurantOrdersVisibleCols");
      if (saved) return new Set(JSON.parse(saved));
    } catch {}
    return new Set(ALL_COLUMNS);
  });
  useEffect(() => {
    try { localStorage.setItem("restaurantOrdersVisibleCols", JSON.stringify(Array.from(visibleColumns))); } catch {}
  }, [visibleColumns]);
  const toggleColumn = (k: ColKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  const columnLabel = (k: ColKey): string => {
    const map: Record<ColKey, { de: string; it: string }> = {
      status: { de: "Status", it: "Stato" },
      supplier: { de: "Lieferant", it: "Fornitore" },
      items: { de: "Artikel", it: "Articoli" },
      deliveryDate: { de: "Lieferdatum", it: "Data consegna" },
      createdAt: { de: "Erstellt", it: "Creato" },
      total: { de: "Summe", it: "Totale" },
    };
    return map[k][lang === "de" ? "de" : "it"];
  };
  const visibleResizableKeys = useMemo<RestaurantOrderColKey[]>(
    () => ["orderNo", ...ALL_COLUMNS.filter((c) => visibleColumns.has(c)), "actions"],
    [visibleColumns],
  );
  const { gridTemplate, startResize: startColResize, resetWidths: resetColWidths } = useResizableColumns<RestaurantOrderColKey>(
    RESTAURANT_ORDER_COLS_STORAGE_KEY,
    RESTAURANT_ORDER_COL_DEFAULTS,
    visibleResizableKeys,
    { flexKey: "deliveryDate" },
  );
  type RowDensity = "compact" | "normal" | "comfortable";
  const [rowDensity, setRowDensity] = useState<RowDensity>(() => {
    try {
      const saved = localStorage.getItem("restaurantOrdersRowDensity") as RowDensity | null;
      if (saved === "compact" || saved === "normal" || saved === "comfortable") return saved;
    } catch {}
    return "normal";
  });
  useEffect(() => {
    try { localStorage.setItem("restaurantOrdersRowDensity", rowDensity); } catch {}
  }, [rowDensity]);
  const densityRowClass = rowDensity === "compact" ? "py-1 text-[12px]" : rowDensity === "comfortable" ? "py-4 text-sm" : "py-2.5 text-sm";
  const densityHeaderClass = rowDensity === "compact" ? "py-1.5" : rowDensity === "comfortable" ? "py-4" : "py-3";
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [editingOrder, setEditingOrder] = useState<OrderWithDetails | null>(null);
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [editProductSearch, setEditProductSearch] = useState("");
  const [editDeliveryOption, setEditDeliveryOption] = useState<"asap" | "date">("asap");
  const [editSelectedDeliveryDate, setEditSelectedDeliveryDate] = useState<string>("");
  const [changeRequestOrder, setChangeRequestOrder] = useState<OrderWithDetails | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [inlineEditItem, setInlineEditItem] = useState<{ orderId: string; itemId: string; quantity: number } | null>(null);
  const [changeRequestReason, setChangeRequestReason] = useState("");
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [orderMessage, setOrderMessage] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductWithSupplierAndPromotion | null>(null);

  const { data: orders, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: allProducts } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: ["/api/products"],
  });

  const productsMap = useMemo(() => {
    const map = new Map<string, ProductWithSupplierAndPromotion>();
    allProducts?.forEach(p => map.set(p.id, p));
    return map;
  }, [allProducts]);

  const editSupplierId = editingOrder?.supplierId;

  const { data: supplierProducts } = useQuery<Product[]>({
    queryKey: [`/api/products?supplierId=${editSupplierId}`],
    enabled: !!editSupplierId,
  });

  const { data: editDeliverySchedules } = useQuery<DeliverySchedule[]>({
    queryKey: [`/api/delivery-schedules/restaurant?supplierId=${editSupplierId}&restaurantId=${currentUser?.id}`],
    enabled: !!editSupplierId && !!currentUser?.id,
  });

  const editAllowedWeekdays = useMemo(() => {
    if (!editDeliverySchedules || editDeliverySchedules.length === 0) return [];
    return editDeliverySchedules.map(s => s.dayOfWeek);
  }, [editDeliverySchedules]);

  const editAvailableDeliveryDates = useMemo(() => {
    if (editAllowedWeekdays.length === 0) return [];
    const dates: { value: string; label: string }[] = [];
    const today = startOfDay(new Date());
    for (let i = 1; i <= 28; i++) {
      const date = addDays(today, i);
      if (editAllowedWeekdays.includes(date.getDay())) {
        dates.push({
          value: format(date, "yyyy-MM-dd"),
          label: format(date, "EEEE, dd. MMMM yyyy", { locale: dateLocale }),
        });
      }
    }
    return dates;
  }, [editAllowedWeekdays, dateLocale]);

  const addableProducts = useMemo(() => {
    if (!supplierProducts) return [];
    const existingProductIds = new Set(editItems.map(i => i.productId));
    return supplierProducts.filter(p => !existingProductIds.has(p.id) && p.inStock !== false);
  }, [supplierProducts, editItems]);

  const filteredAddableProducts = useMemo(() => {
    if (!editProductSearch.trim()) return addableProducts;
    const search = editProductSearch.toLowerCase();
    return addableProducts.filter(p => p.name.toLowerCase().includes(search));
  }, [addableProducts, editProductSearch]);

  const addProductToEdit = (product: Product) => {
    setEditItems(prev => [...prev, {
      id: `new-${product.id}`,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: product.price,
      totalPrice: product.price,
    }]);
    setEditProductSearch("");
  };

  const updateOrderItemsMutation = useMutation({
    mutationFn: async ({ orderId, items, requestedDeliveryDate }: { orderId: string; items: EditableItem[]; requestedDeliveryDate?: string | null }) => {
      return await apiRequest("PATCH", `/api/orders/${orderId}/items`, {
        restaurantId: currentUser?.id,
        items: items.map(i => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        requestedDeliveryDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/orders?supplierId=${editingOrder?.supplierId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setEditingOrder(null);
      toast({ title: t("orders", "orderUpdated"), description: t("orders", "orderUpdatedDesc") });
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("orders", "orderUpdateError"), variant: "destructive" });
    },
  });

  const inlineQuantityMutation = useMutation({
    mutationFn: async ({ orderId, itemId, quantity }: { orderId: string; itemId: string; quantity: number }) => {
      const order = orders?.find(o => o.id === orderId);
      if (!order) throw new Error("Order not found");
      const updatedItems = order.items.map(i => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.id === itemId ? quantity : i.quantity,
        unitPrice: i.unitPrice,
      }));
      return await apiRequest("PATCH", `/api/orders/${orderId}/items`, {
        restaurantId: currentUser?.id,
        items: updatedItems,
        requestedDeliveryDate: order.requestedDeliveryDate || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setInlineEditItem(null);
      toast({ title: lang === "de" ? "Menge aktualisiert" : "Quantità aggiornata" });
    },
    onError: () => {
      setInlineEditItem(null);
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const changeRequestMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return await apiRequest("POST", `/api/orders/${orderId}/change-request`, {
        restaurantId: currentUser?.id,
        reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      setChangeRequestOrder(null);
      setChangeRequestReason("");
      toast({ title: t("orders", "changeRequestSent"), description: t("orders", "changeRequestSentDesc") });
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("orders", "changeRequestError"), variant: "destructive" });
    },
  });

  const sendOrderMessageMutation = useMutation({
    mutationFn: async ({ order, message }: { order: OrderWithDetails; message: string }) => {
      const supplierName = order.supplier?.companyName || order.supplier?.name || "";
      const refLabel = `${lang === "de" ? "Bestellung" : "Ordine"} #${order.id.substring(0, 8)} - ${supplierName}`;
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

  const cancelOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: "cancelled" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/recent"] });
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant/upcoming-deliveries"] });
      toast({ title: lang === "de" ? "Bestellung storniert" : "Ordine annullato" });
      if (detailOrder) {
        setDetailOrder(null);
      }
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest("POST", `/api/orders/${orderId}/reorder`, { restaurantId: currentUser?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: lang === "de" ? "Artikel in den Warenkorb gelegt" : "Articoli aggiunti al carrello",
        description: lang === "de" ? "Die Bestellung wurde in Ihren Warenkorb kopiert." : "L'ordine è stato copiato nel carrello.",
      });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const handleExport = (format: "csv" | "pdf") => {
    const params = new URLSearchParams({
      userId: currentUser?.id || "",
      role: "restaurant",
      format,
    });
    if (filterDateFrom) params.set("dateFrom", filterDateFrom);
    if (filterDateTo) params.set("dateTo", filterDateTo);
    if (filterSupplier !== "all") params.set("supplierId", filterSupplier);
    window.open(`/api/orders/export?${params.toString()}`, "_blank");
    setShowExportMenu(false);
  };

  const uniqueSuppliers = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, { id: string; name: string; profileImageUrl: string | null; orderCount: number }>();
    orders.forEach(o => {
      if (o.supplier?.id) {
        const existing = map.get(o.supplier.id);
        if (existing) {
          existing.orderCount++;
        } else {
          map.set(o.supplier.id, {
            id: o.supplier.id,
            name: o.supplier.companyName || o.supplier.name || t("common", "unknown"),
            profileImageUrl: o.supplier.profileImageUrl || null,
            orderCount: 1,
          });
        }
      }
    });
    return Array.from(map.values());
  }, [orders]);

  const supplierIds = useMemo(() => uniqueSuppliers.map(s => s.id), [uniqueSuppliers]);

  const { data: avgDeliveryTimes } = useQuery<Record<string, { avgHours: number | null; avgDays: number | null; sampleSize: number }>>({
    queryKey: ["/api/suppliers/avg-delivery-times", supplierIds],
    queryFn: async () => {
      const results: Record<string, any> = {};
      await Promise.all(supplierIds.map(async (id) => {
        try {
          const res = await fetch(`/api/suppliers/${id}/avg-delivery-time`);
          if (res.ok) results[id] = await res.json();
        } catch {}
      }));
      return results;
    },
    enabled: supplierIds.length > 0,
  });

  const hasActiveFilters = filterSupplier !== "all" || filterDateFrom || filterDateTo;
  const hasSecondaryFilters = filterDateFrom || filterDateTo;

  const statusCounts = useMemo(() => {
    if (!orders) return { all: 0, pending: 0, confirmed: 0, in_delivery: 0, delivered: 0, cancelled: 0 };
    const filtered = orders.filter(o => {
      if (filterSupplier !== "all" && o.supplier?.id !== filterSupplier) return false;
      if (filterDateFrom) {
        const from = new Date(filterDateFrom);
        from.setHours(0, 0, 0, 0);
        if (new Date(o.createdAt) < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(o.createdAt) > to) return false;
      }
      return true;
    });
    const counts = { all: filtered.length, pending: 0, confirmed: 0, in_delivery: 0, delivered: 0, cancelled: 0 };
    filtered.forEach(o => {
      const s = o.status === "partially_confirmed" ? "confirmed" : o.status;
      if (s in counts) (counts as any)[s]++;
    });
    return counts;
  }, [orders, filterSupplier, filterDateFrom, filterDateTo]);

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterSupplier("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchQuery("");
  };

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
      case "partially_confirmed": return "bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/40";
      case "in_delivery": return "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/40";
      case "delivered": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "cancelled": return "bg-red-50/40 dark:bg-red-950/15 border-red-200 dark:border-red-800/40";
      default: return "";
    }
  };

  const getStatusLabel = (status: string) => getOrderStatus(status, lang);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "confirmed": return <Package className="h-4 w-4" />;
      case "partially_confirmed": return <AlertTriangle className="h-4 w-4" />;
      case "in_delivery": return <Truck className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "cancelled": return <XCircle className="h-4 w-4" />;
      default: return <ShoppingBag className="h-4 w-4" />;
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
      if (order) navigate(`/restaurant/orders/${order.id}`);
    }
  }, [highlightOrderId, orders]);

  const filterOrders = (status: string | null) => {
    if (!orders) return [];
    const q = searchQuery.trim().toLowerCase();
    return orders.filter(order => {
      if (status) {
        if (status === "confirmed") {
          if (order.status !== "confirmed" && order.status !== "partially_confirmed") return false;
        } else {
          if (order.status !== status) return false;
        }
      }
      if (filterSupplier !== "all" && order.supplier?.id !== filterSupplier) return false;
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
      if (q) {
        const supplierName = (order.supplier?.companyName || order.supplier?.name || "").toLowerCase();
        const idMatch = order.id.toLowerCase().includes(q);
        const supMatch = supplierName.includes(q);
        const itemMatch = order.items?.some((it: any) => it.productName?.toLowerCase().includes(q));
        if (!idMatch && !supMatch && !itemMatch) return false;
      }
      return true;
    });
  };

  const sortOrders = (list: OrderWithDetails[]) => {
    const dirMul = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "createdAt":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "deliveryDate": {
          const ad = a.requestedDeliveryDate ? new Date(a.requestedDeliveryDate + "T00:00:00").getTime() : Number.MAX_SAFE_INTEGER;
          const bd = b.requestedDeliveryDate ? new Date(b.requestedDeliveryDate + "T00:00:00").getTime() : Number.MAX_SAFE_INTEGER;
          cmp = ad - bd;
          break;
        }
        case "totalAmount":
          cmp = parseFloat(a.totalAmount) - parseFloat(b.totalAmount);
          break;
        case "supplier":
          cmp = (a.supplier?.companyName || a.supplier?.name || "").localeCompare(b.supplier?.companyName || b.supplier?.name || "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return cmp * dirMul;
    });
  };

  const openEditDialog = (order: OrderWithDetails) => {
    setEditItems(order.items.map(i => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
    })));
    if (order.requestedDeliveryDate) {
      setEditDeliveryOption("date");
      setEditSelectedDeliveryDate(order.requestedDeliveryDate);
    } else {
      setEditDeliveryOption("asap");
      setEditSelectedDeliveryDate("");
    }
    setEditProductSearch("");
    setEditingOrder(order);
  };

  const updateEditItemQuantity = (index: number, delta: number) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty, totalPrice: (parseFloat(item.unitPrice) * newQty).toFixed(2) };
    }));
  };

  const removeEditItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const editTotal = useMemo(() => {
    return editItems.reduce((sum, item) => sum + parseFloat(item.totalPrice), 0).toFixed(2);
  }, [editItems]);

  const canEditOrder = (order: OrderWithDetails) => order.status === "pending";
  const canRequestChange = (order: OrderWithDetails) => order.status === "confirmed" || order.status === "partially_confirmed";

  const statusSteps = ["pending", "confirmed", "partially_confirmed", "in_delivery", "delivered"];

  const getStepIndex = (status: string) => {
    if (status === "cancelled") return -1;
    return statusSteps.indexOf(status);
  };

  const getEstimatedDelivery = (order: OrderWithDetails) => {
    if (order.status === "delivered" || order.status === "cancelled") return null;
    if (order.requestedDeliveryDate) return null;
    const avg = avgDeliveryTimes?.[order.supplierId];
    if (!avg || avg.avgHours === null) return null;
    const estimatedDate = addDays(new Date(order.createdAt), avg.avgDays || 1);
    if (estimatedDate < new Date()) return null;
    return { date: estimatedDate, avgDays: avg.avgDays, sampleSize: avg.sampleSize };
  };

  const OrderCard = ({ order }: { order: OrderWithDetails }) => {
    const isHighlighted = order.id === highlightOrderId;
    const currentStep = getStepIndex(order.status);
    const isCancelled = order.status === "cancelled";
    const supplierName = order.supplier?.companyName || order.supplier?.name || t("orders", "unknownSupplier");
    const lastUpdate = order.updatedAt || order.createdAt;
    const estimatedDelivery = getEstimatedDelivery(order);

    return (
    <div ref={isHighlighted ? highlightRef : undefined}>
    <div className={`overflow-hidden rounded-md cursor-pointer ${isHighlighted ? "ring-2 ring-primary shadow-md" : ""}`} onClick={() => navigate(`/restaurant/orders/${order.id}`)} data-testid={`order-card-${order.id}`}>
      <Card className={`hover-elevate ${getStatusCardBg(order.status)}`}>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm md:text-base truncate" data-testid={`text-supplier-${order.id}`}>
                {supplierName}
              </p>
            </div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge className={`${getStatusColor(order.status)} text-[10px] md:text-xs shrink-0`} variant="outline">
                {getStatusIcon(order.status)}
                <span className="ml-1">{getStatusLabel(order.status)}</span>
              </Badge>
              <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground">
                <ShoppingBag className="h-3 w-3 shrink-0" />
                #{order.id.slice(0, 8)}
              </span>
              <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                {format(new Date(order.createdAt), "dd.MM.yy", { locale: dateLocale })}
              </span>
              <span className="text-[11px] md:text-xs text-muted-foreground">
                {order.items?.length || 0} {t("common", "items")}
              </span>
              {order.createdByUser && (
                <span className="flex items-center gap-1 text-[11px] md:text-xs text-muted-foreground" data-testid={`text-created-by-${order.id}`}>
                  <UserIcon className="h-3 w-3 shrink-0" />
                  {order.createdByUser.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base md:text-lg font-bold" data-testid={`text-total-${order.id}`}>{order.totalAmount}€</p>
          </div>
        </div>

        {order.status === "in_delivery" && order.requestedDeliveryDate && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 px-3 py-2" data-testid={`banner-delivery-date-${order.id}`}>
            <Truck className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] md:text-xs text-purple-600 dark:text-purple-400 font-medium">{t("orders", "deliveryOn")}</span>
              <p className="text-sm md:text-base font-bold text-purple-700 dark:text-purple-300" data-testid={`text-delivery-date-large-${order.id}`}>
                {new Date(order.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "long" })}
              </p>
              {order.originalDeliveryDate && (
                <p className="text-[10px] md:text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  {lang === "de" ? "Verschoben von" : "Rinviato da"} {new Date(order.originalDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                </p>
              )}
            </div>
            {order.originalDeliveryDate && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5 shrink-0" variant="outline">
                {lang === "de" ? "In Verspätung" : "In ritardo"}
              </Badge>
            )}
          </div>
        )}

        {order.status === "delivered" && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-2" data-testid={`banner-delivered-date-${order.id}`}>
            <CheckCircle className="h-4 w-4 md:h-5 md:w-5 text-green-600 dark:text-green-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-[10px] md:text-xs text-green-600 dark:text-green-400 font-medium">{t("orders", "deliveredOn")}</span>
              <p className="text-sm md:text-base font-bold text-green-700 dark:text-green-300" data-testid={`text-delivered-date-large-${order.id}`}>
                {format(new Date(lastUpdate), "EEEE, dd. MMMM yyyy", { locale: dateLocale })}
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
              {order.items.map((item: any) => {
                const isInlineEditing = inlineEditItem?.orderId === order.id && inlineEditItem?.itemId === item.id;
                return (
                <div key={item.id} className="flex items-center gap-2 text-xs md:text-sm" data-testid={`card-item-${item.id}`}>
                  {item.productImageUrl ? (
                    <img src={item.productImageUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-muted-foreground flex-1 truncate">
                    {order.status === "pending" && isInlineEditing ? (
                      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="h-5 w-5 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setInlineEditItem(prev => prev ? { ...prev, quantity: Math.max(1, prev.quantity - 1) } : null); }}
                          data-testid={`button-inline-qty-minus-${item.id}`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="font-bold text-foreground min-w-[1.5rem] text-center" data-testid={`text-inline-qty-${item.id}`}>{inlineEditItem.quantity}</span>
                        <button
                          className="h-5 w-5 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center shrink-0 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setInlineEditItem(prev => prev ? { ...prev, quantity: prev.quantity + 1 } : null); }}
                          data-testid={`button-inline-qty-plus-${item.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <button
                          className="ml-1 text-[10px] font-medium text-primary hover:underline"
                          onClick={(e) => { e.stopPropagation(); inlineQuantityMutation.mutate({ orderId: order.id, itemId: item.id, quantity: inlineEditItem.quantity }); }}
                          disabled={inlineQuantityMutation.isPending || inlineEditItem.quantity === item.quantity}
                          data-testid={`button-inline-qty-save-${item.id}`}
                        >
                          {inlineQuantityMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : (lang === "de" ? "OK" : "OK")}
                        </button>
                        <button
                          className="text-[10px] text-muted-foreground hover:underline"
                          onClick={(e) => { e.stopPropagation(); setInlineEditItem(null); }}
                          data-testid={`button-inline-qty-cancel-${item.id}`}
                        >
                          ✕
                        </button>
                      </span>
                    ) : order.status === "pending" ? (
                      <span
                        className={`font-medium text-foreground transition-colors border-b border-dashed border-muted-foreground/40 ${inlineQuantityMutation.isPending ? "opacity-50" : "cursor-pointer hover:text-primary hover:border-primary"}`}
                        onClick={(e) => { e.stopPropagation(); if (!inlineQuantityMutation.isPending) setInlineEditItem({ orderId: order.id, itemId: item.id, quantity: item.quantity }); }}
                        data-testid={`button-inline-qty-edit-${item.id}`}
                      >
                        {item.quantity}x
                      </span>
                    ) : (
                      <span className="font-medium text-foreground">{item.quantity}x</span>
                    )}
                    {" "}{item.productName}
                  </span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {isInlineEditing ? `${(parseFloat(item.unitPrice) * inlineEditItem.quantity).toFixed(2)}€` : `${item.totalPrice}€`}
                  </span>
                </div>
                );
              })}
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
                        {getStatusLabel(step)}
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
              {lang === "de" ? "Aktualisiert" : "Aggiornato"}: {formatDistanceToNow(new Date(lastUpdate), { addSuffix: true, locale: dateLocale })}
            </span>
            {estimatedDelivery && !order.requestedDeliveryDate && (
              <span className="flex items-center gap-1 text-muted-foreground italic" data-testid={`text-est-delivery-${order.id}`}>
                <Timer className="h-3 w-3" />
                ~{format(estimatedDelivery.date, "dd.MM.", { locale: dateLocale })}
                <span className="text-[9px] md:text-[10px]">({lang === "de" ? `Ø ${estimatedDelivery.avgDays}T` : `Ø ${estimatedDelivery.avgDays}g`})</span>
              </span>
            )}
          </div>
          {(canEditOrder(order) || canRequestChange(order) || order.status === "delivered") && (() => {
            const primary = canEditOrder(order)
              ? { label: t("orders", "editOrder"), icon: Pencil, color: "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20", action: () => openEditDialog(order), testId: `button-edit-order-${order.id}` }
              : canRequestChange(order)
              ? { label: t("orders", "requestChange"), icon: MessageSquareText, color: "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20", action: () => setChangeRequestOrder(order), testId: `button-change-request-${order.id}` }
              : order.status === "delivered"
              ? { label: lang === "de" ? "Nachbestellen" : "Riordinare", icon: ClipboardList, color: "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-600/20", action: () => reorderMutation.mutate(order.id), testId: `button-reorder-${order.id}`, isPending: reorderMutation.isPending }
              : null;
            const PrimaryIcon = primary?.icon;
            const showCancel = canEditOrder(order);
            return (
              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-end gap-2">
                {primary && PrimaryIcon && (
                  <button
                    className={`h-9 rounded-full text-sm font-semibold px-4 inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 ${primary.color}`}
                    onClick={(e) => { e.stopPropagation(); primary.action(); }}
                    disabled={primary.isPending}
                    data-testid={primary.testId}
                  >
                    {primary.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PrimaryIcon className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{primary.label}</span>
                  </button>
                )}
                {showCancel && (
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
                      <DropdownMenuItem
                        onClick={() => setCancelConfirmId(order.id)}
                        disabled={cancelOrderMutation.isPending}
                        className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300"
                        data-testid={`button-cancel-order-${order.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        {lang === "de" ? "Bestellung stornieren" : "Annulla ordine"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
    </div>
    </div>
    );
  };

  const OrderRow = ({ order }: { order: OrderWithDetails }) => {
    const isHighlighted = order.id === highlightOrderId;
    const supplierName = order.supplier?.companyName || order.supplier?.name || t("orders", "unknownSupplier");
    const estimatedDelivery = getEstimatedDelivery(order);
    const isOverdue = !!(order.requestedDeliveryDate && new Date(order.requestedDeliveryDate + "T00:00:00") < startOfDay(new Date()) && order.status !== "delivered" && order.status !== "cancelled");
    const isDelayed = !!order.originalDeliveryDate;

    const deliveryDateLabel = (() => {
      if (order.requestedDeliveryDate) {
        const d = new Date(order.requestedDeliveryDate + "T00:00:00");
        if (isToday(d)) return lang === "de" ? "Heute" : "Oggi";
        if (isYesterday(d)) return lang === "de" ? "Gestern" : "Ieri";
        return format(d, "EEE dd.MM.", { locale: dateLocale });
      }
      if (estimatedDelivery) return `~${format(estimatedDelivery.date, "dd.MM.", { locale: dateLocale })}`;
      return "—";
    })();

    const showCancelMenu = canEditOrder(order);
    const showEdit = canEditOrder(order);
    const showChangeReq = canRequestChange(order);
    const showReorder = order.status === "delivered";

    return (
      <div
        ref={isHighlighted ? highlightRef : undefined}
        className={`group/row border-b border-border last:border-b-0 transition-colors ${isHighlighted ? "bg-primary/5" : "hover:bg-muted/40"}`}
        data-testid={`order-row-${order.id}`}
      >
        {/* Desktop row */}
        <div className={`hidden md:grid items-stretch gap-0 [&>*]:px-3 [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:!text-center [&>*]:min-w-0 ${densityRowClass} [&>*+*]:border-l [&>*+*]:border-border`} style={{ gridTemplateColumns: gridTemplate }}>
          {/* Bestell-Nr — hyperlink */}
          <Link
            href={`/restaurant/orders/${order.id}`}
            className="font-mono text-[13px] text-primary hover:underline truncate"
            data-testid={`link-order-${order.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            #{order.id.slice(0, 8)}
          </Link>
          {visibleColumns.has("status") && (
            <div>
              <Badge className={`${getStatusColor(order.status)} text-[11px] rounded-full px-2.5 py-0.5 font-medium border-0`} variant="outline">
                <span className="inline-flex items-center gap-1">
                  {getStatusIcon(order.status)}
                  {getStatusLabel(order.status)}
                </span>
              </Badge>
            </div>
          )}
          {visibleColumns.has("supplier") && (
            <div className="min-w-0 !justify-start !text-left">
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={order.supplier?.profileImageUrl || undefined} />
                  <AvatarFallback className="text-[9px] font-semibold">{supplierName.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="truncate font-medium" data-testid={`text-supplier-${order.id}`}>{supplierName}</span>
              </div>
            </div>
          )}
          {visibleColumns.has("items") && (
            <div className="text-right tabular-nums text-muted-foreground">{order.items?.length || 0}</div>
          )}
          {visibleColumns.has("deliveryDate") && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`truncate ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : ""}`} data-testid={`text-delivery-${order.id}`}>
                {deliveryDateLabel}
              </span>
              {isOverdue && (
                <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[9px] rounded-full px-1.5 py-0 border-0 shrink-0">
                  {lang === "de" ? "Überfällig" : "Scaduto"}
                </Badge>
              )}
              {!isOverdue && isDelayed && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] rounded-full px-1.5 py-0 border-0 shrink-0">
                  {lang === "de" ? "Verspätet" : "Ritardo"}
                </Badge>
              )}
            </div>
          )}
          {visibleColumns.has("createdAt") && (
            <div className="text-muted-foreground text-[12px] truncate" title={format(new Date(order.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}>
              {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: dateLocale })}
            </div>
          )}
          {visibleColumns.has("total") && (
            <div className="text-right font-semibold tabular-nums" data-testid={`text-total-${order.id}`}>
              {parseFloat(order.totalAmount).toFixed(2)}€
            </div>
          )}
          {/* Aktionen */}
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-8 w-8 rounded-full inline-flex items-center justify-center hover:bg-muted transition-colors opacity-60 group-hover/row:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-row-actions-${order.id}`}
                  aria-label={lang === "de" ? "Aktionen" : "Azioni"}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => navigate(`/restaurant/orders/${order.id}`)} data-testid={`action-open-${order.id}`}>
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  {lang === "de" ? "Detail öffnen" : "Apri dettaglio"}
                </DropdownMenuItem>
                {showEdit && (
                  <DropdownMenuItem onClick={() => openEditDialog(order)} data-testid={`action-edit-${order.id}`}>
                    <Pencil className="h-4 w-4 mr-2" />
                    {t("orders", "editOrder")}
                  </DropdownMenuItem>
                )}
                {showChangeReq && (
                  <DropdownMenuItem onClick={() => setChangeRequestOrder(order)} data-testid={`action-change-${order.id}`}>
                    <MessageSquareText className="h-4 w-4 mr-2" />
                    {t("orders", "requestChange")}
                  </DropdownMenuItem>
                )}
                {showReorder && (
                  <DropdownMenuItem onClick={() => reorderMutation.mutate(order.id)} disabled={reorderMutation.isPending} data-testid={`action-reorder-${order.id}`}>
                    <ClipboardList className="h-4 w-4 mr-2" />
                    {lang === "de" ? "Nachbestellen" : "Riordinare"}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate(`/restaurant/inbox?to=${order.supplierId}&orderRefId=${order.id}`)} data-testid={`action-message-${order.id}`}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {lang === "de" ? "Nachricht senden" : "Invia messaggio"}
                </DropdownMenuItem>
                {showCancelMenu && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setCancelConfirmId(order.id)}
                      disabled={cancelOrderMutation.isPending}
                      className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300"
                      data-testid={`action-cancel-${order.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      {lang === "de" ? "Bestellung stornieren" : "Annulla ordine"}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile row — 2 lines */}
        <div
          className="md:hidden px-3 py-3 active:bg-muted/60 transition-colors cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/restaurant/orders/${order.id}`); } }}
          onClick={() => navigate(`/restaurant/orders/${order.id}`)}
          data-testid={`mobile-order-${order.id}`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={`/restaurant/orders/${order.id}`}
                className="font-mono text-[12px] text-primary hover:underline shrink-0"
                onClick={(e) => e.stopPropagation()}
                data-testid={`link-order-mobile-${order.id}`}
              >
                #{order.id.slice(0, 8)}
              </Link>
              <Badge className={`${getStatusColor(order.status)} text-[10px] rounded-full px-2 py-0 border-0 shrink-0`} variant="outline">
                {getStatusLabel(order.status)}
              </Badge>
            </div>
            <span className="text-sm font-bold tabular-nums shrink-0">{parseFloat(order.totalAmount).toFixed(2)}€</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <span className="truncate font-medium text-foreground">{supplierName}</span>
            <span>·</span>
            <span className="shrink-0">{order.items?.length || 0} {t("common", "items")}</span>
            <span>·</span>
            <span className={`shrink-0 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>{deliveryDateLabel}</span>
          </div>
        </div>
      </div>
    );
  };

  const getComplaintCardBg = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/40";
      case "in_progress": return "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40";
      case "resolved": return "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800/40";
      case "closed": return "bg-muted/30 border-border";
      default: return "";
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="dark bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl mb-3 md:mb-4 space-y-3" data-testid="orders-hero">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">{t("common", "orders")}</h1>
            <p className="hidden md:block text-sm text-white/50 mt-1">{t("orders", "allOrdersOverview")}</p>
          </div>
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

        {/* Toolbar moved out of hero — rendered above the orders table on the page content */}
        {false && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-1">
            {/* Suchen */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${searchQuery ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}
                  title={lang === "de" ? "Suchen" : "Cerca"}
                  data-testid="button-toolbar-search"
                >
                  <Search className="h-4 w-4" />
                  {searchQuery && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3">
                <div className="space-y-2">
                  <Label className="text-xs">{lang === "de" ? "Suchen in Bestellungen" : "Cerca negli ordini"}</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      autoFocus
                      placeholder={lang === "de" ? "Bestell-Nr, Lieferant, Artikel…" : "Ordine, fornitore, articolo…"}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 pl-8 text-sm"
                      data-testid="input-toolbar-search"
                    />
                  </div>
                  {searchQuery && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => setSearchQuery("")}>
                      <X className="h-3 w-3 mr-1" />{lang === "de" ? "Suche zurücksetzen" : "Cancella ricerca"}
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Spalten */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="relative inline-flex items-center justify-center h-9 w-9 rounded-full text-white/70 hover:text-white transition-colors hover-elevate"
                  title={lang === "de" ? "Spalten" : "Colonne"}
                  data-testid="button-toolbar-columns"
                >
                  <Columns3 className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-2">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {lang === "de" ? "Spalten" : "Colonne"}
                </div>
                {ALL_COLUMNS.map((c) => (
                  <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm" data-testid={`toggle-col-${c}`}>
                    <Checkbox checked={visibleColumns.has(c)} onCheckedChange={() => toggleColumn(c)} />
                    <span>{columnLabel(c)}</span>
                  </label>
                ))}
                <Separator className="my-1.5" />
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm" data-testid="toggle-group-by-date">
                  <Checkbox checked={groupByDate} onCheckedChange={(v) => setGroupByDate(!!v)} />
                  <span>{lang === "de" ? "Nach Datum gruppieren" : "Raggruppa per data"}</span>
                </label>
                <Button variant="ghost" size="sm" className="h-7 text-xs w-full mt-1" onClick={() => setVisibleColumns(new Set(ALL_COLUMNS))}>
                  {lang === "de" ? "Alle anzeigen" : "Mostra tutte"}
                </Button>
              </PopoverContent>
            </Popover>

            {/* Sortieren */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${sortBy !== "createdAt" || sortDir !== "desc" ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}
                  title={lang === "de" ? "Sortieren" : "Ordina"}
                  data-testid="button-toolbar-sort"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-2">
                <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {lang === "de" ? "Sortieren nach" : "Ordina per"}
                </div>
                {([
                  { key: "createdAt", label: lang === "de" ? "Erstellt" : "Creato" },
                  { key: "deliveryDate", label: lang === "de" ? "Lieferdatum" : "Data consegna" },
                  { key: "totalAmount", label: lang === "de" ? "Summe" : "Totale" },
                  { key: "supplier", label: lang === "de" ? "Lieferant" : "Fornitore" },
                  { key: "status", label: "Status" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSortBy(opt.key)}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm ${sortBy === opt.key ? "bg-muted font-medium" : "hover:bg-muted"}`}
                    data-testid={`sort-by-${opt.key}`}
                  >
                    <span>{opt.label}</span>
                    {sortBy === opt.key && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                ))}
                <Separator className="my-1.5" />
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => setSortDir("asc")}
                    className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs ${sortDir === "asc" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
                    data-testid="sort-dir-asc"
                  >
                    <ArrowUp className="h-3 w-3" />{lang === "de" ? "Aufsteigend" : "Crescente"}
                  </button>
                  <button
                    onClick={() => setSortDir("desc")}
                    className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs ${sortDir === "desc" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
                    data-testid="sort-dir-desc"
                  >
                    <ArrowDown className="h-3 w-3" />{lang === "de" ? "Absteigend" : "Decrescente"}
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${(filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo) ? "bg-white/15 text-white" : "text-white/70 hover:text-white"}`}
                  title="Filter"
                  data-testid="button-toolbar-filter"
                >
                  <FilterIcon className="h-4 w-4" />
                  {(filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo) && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                      {(filterStatus !== "all" ? 1 : 0) + (filterSupplier !== "all" ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3">
                <div className="space-y-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Status</Label>
                    <div className="grid grid-cols-3 gap-1">
                      {([
                        { key: "all", label: t("common", "all"), dot: "bg-gray-400" },
                        { key: "pending", label: getOrderStatus("pending", lang), dot: "bg-yellow-500" },
                        { key: "confirmed", label: getOrderStatus("confirmed", lang), dot: "bg-blue-500" },
                        { key: "in_delivery", label: getOrderStatus("in_delivery", lang), dot: "bg-purple-500" },
                        { key: "delivered", label: getOrderStatus("delivered", lang), dot: "bg-green-500" },
                        { key: "cancelled", label: getOrderStatus("cancelled", lang), dot: "bg-red-500" },
                      ] as const).map(({ key, label, dot }) => (
                        <button
                          key={key}
                          onClick={() => setFilterStatus(key)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterStatus === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                          data-testid={`filter-status-${key}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                          <span className="truncate">{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {uniqueSuppliers.length > 0 && (
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{lang === "de" ? "Lieferant" : "Fornitore"}</Label>
                      <select
                        value={filterSupplier}
                        onChange={(e) => setFilterSupplier(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        data-testid="filter-supplier-select"
                      >
                        <option value="all">{lang === "de" ? "Alle Lieferanten" : "Tutti i fornitori"}</option>
                        {uniqueSuppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.orderCount})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "from")}</Label>
                      <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 text-xs" data-testid="filter-date-from" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "to")}</Label>
                      <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 text-xs" data-testid="filter-date-to" />
                    </div>
                  </div>
                  {(filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo) && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={clearFilters} data-testid="button-clear-filters">
                      <X className="h-3 w-3 mr-1" />{t("common", "reset")}
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Aktive Filter Chips */}
          {filterStatus !== "all" && (
            <button onClick={() => setFilterStatus("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[11px] hover:bg-white/15" data-testid="chip-status">
              <span>{getOrderStatus(filterStatus as any, lang)}</span><X className="h-3 w-3" />
            </button>
          )}
          {filterSupplier !== "all" && (
            <button onClick={() => setFilterSupplier("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[11px] hover:bg-white/15" data-testid="chip-supplier">
              <span>{uniqueSuppliers.find(s => s.id === filterSupplier)?.name || "—"}</span><X className="h-3 w-3" />
            </button>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[11px] hover:bg-white/15" data-testid="chip-search">
              <span>"{searchQuery}"</span><X className="h-3 w-3" />
            </button>
          )}
        </div>
        )}
      </div>

      {/* Toolbar (Suchen · Spalten · Sortieren · Filter) — page-content area, right-aligned */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Active filter chips (left of toolbar) */}
        <div className="flex items-center gap-2 flex-wrap mr-auto">
          {filterStatus !== "all" && (
            <button onClick={() => setFilterStatus("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-status-content">
              <span>{getOrderStatus(filterStatus as any, lang)}</span><X className="h-3 w-3" />
            </button>
          )}
          {filterSupplier !== "all" && (
            <button onClick={() => setFilterSupplier("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-supplier-content">
              <span>{uniqueSuppliers.find(s => s.id === filterSupplier)?.name || "—"}</span><X className="h-3 w-3" />
            </button>
          )}
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-search-content">
              <span>"{searchQuery}"</span><X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-card border border-border p-1 shadow-sm">
          {/* Suchen */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${searchQuery ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title={lang === "de" ? "Suchen" : "Cerca"}
                data-testid="button-toolbar-search-content"
              >
                <Search className="h-4 w-4" />
                {searchQuery && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="space-y-2">
                <Label className="text-xs">{lang === "de" ? "Suchen in Bestellungen" : "Cerca negli ordini"}</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder={lang === "de" ? "Bestell-Nr, Lieferant, Artikel…" : "Ordine, fornitore, articolo…"}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-8 text-sm"
                    data-testid="input-toolbar-search-content"
                  />
                </div>
                {searchQuery && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => setSearchQuery("")}>
                    <X className="h-3 w-3 mr-1" />{lang === "de" ? "Suche zurücksetzen" : "Cancella ricerca"}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {/* Spalten */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-full text-muted-foreground hover:text-foreground transition-colors hover-elevate"
                title={lang === "de" ? "Spalten" : "Colonne"}
                data-testid="button-toolbar-columns-content"
              >
                <Columns3 className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {lang === "de" ? "Spalten" : "Colonne"}
              </div>
              {ALL_COLUMNS.map((c) => (
                <label key={c} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm" data-testid={`toggle-col-content-${c}`}>
                  <Checkbox checked={visibleColumns.has(c)} onCheckedChange={() => toggleColumn(c)} />
                  <span>{columnLabel(c)}</span>
                </label>
              ))}
              <Separator className="my-1.5" />
              <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm" data-testid="toggle-group-by-date-content">
                <Checkbox checked={groupByDate} onCheckedChange={(v) => setGroupByDate(!!v)} />
                <span>{lang === "de" ? "Nach Datum gruppieren" : "Raggruppa per data"}</span>
              </label>
              <Button variant="ghost" size="sm" className="h-7 text-xs w-full mt-1" onClick={() => setVisibleColumns(new Set(ALL_COLUMNS))}>
                {lang === "de" ? "Alle anzeigen" : "Mostra tutte"}
              </Button>
            </PopoverContent>
          </Popover>

          {/* Sortieren */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${sortBy !== "createdAt" || sortDir !== "desc" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title={lang === "de" ? "Sortieren" : "Ordina"}
                data-testid="button-toolbar-sort-content"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {lang === "de" ? "Sortieren nach" : "Ordina per"}
              </div>
              {([
                { key: "createdAt", label: lang === "de" ? "Erstellt" : "Creato" },
                { key: "deliveryDate", label: lang === "de" ? "Lieferdatum" : "Data consegna" },
                { key: "totalAmount", label: lang === "de" ? "Summe" : "Totale" },
                { key: "supplier", label: lang === "de" ? "Lieferant" : "Fornitore" },
                { key: "status", label: "Status" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm ${sortBy === opt.key ? "bg-muted font-medium" : "hover:bg-muted"}`}
                  data-testid={`sort-by-content-${opt.key}`}
                >
                  <span>{opt.label}</span>
                  {sortBy === opt.key && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              ))}
              <Separator className="my-1.5" />
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setSortDir("asc")}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs ${sortDir === "asc" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
                  data-testid="sort-dir-asc-content"
                >
                  <ArrowUp className="h-3 w-3" />{lang === "de" ? "Aufsteigend" : "Crescente"}
                </button>
                <button
                  onClick={() => setSortDir("desc")}
                  className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs ${sortDir === "desc" ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
                  data-testid="sort-dir-desc-content"
                >
                  <ArrowDown className="h-3 w-3" />{lang === "de" ? "Absteigend" : "Decrescente"}
                </button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${(filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo) ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                title="Filter"
                data-testid="button-toolbar-filter-content"
              >
                <FilterIcon className="h-4 w-4" />
                {(filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo) && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                    {(filterStatus !== "all" ? 1 : 0) + (filterSupplier !== "all" ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0)}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-3">
              <div className="space-y-3">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">Status</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { key: "all", label: t("common", "all"), dot: "bg-gray-400" },
                      { key: "pending", label: getOrderStatus("pending", lang), dot: "bg-yellow-500" },
                      { key: "confirmed", label: getOrderStatus("confirmed", lang), dot: "bg-blue-500" },
                      { key: "in_delivery", label: getOrderStatus("in_delivery", lang), dot: "bg-purple-500" },
                      { key: "delivered", label: getOrderStatus("delivered", lang), dot: "bg-green-500" },
                      { key: "cancelled", label: getOrderStatus("cancelled", lang), dot: "bg-red-500" },
                    ] as const).map(({ key, label, dot }) => (
                      <button
                        key={key}
                        onClick={() => setFilterStatus(key)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-medium border transition-all ${filterStatus === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-card hover:bg-muted text-muted-foreground"}`}
                        data-testid={`filter-status-content-${key}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {uniqueSuppliers.length > 0 && (
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{lang === "de" ? "Lieferant" : "Fornitore"}</Label>
                    <select
                      value={filterSupplier}
                      onChange={(e) => setFilterSupplier(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      data-testid="filter-supplier-select-content"
                    >
                      <option value="all">{lang === "de" ? "Alle Lieferanten" : "Tutti i fornitori"}</option>
                      {uniqueSuppliers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.orderCount})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "from")}</Label>
                    <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-9 text-xs" data-testid="filter-date-from-content" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">{t("common", "to")}</Label>
                    <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-9 text-xs" data-testid="filter-date-to-content" />
                  </div>
                </div>
                {(filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo) && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={clearFilters} data-testid="button-clear-filters-content">
                    <X className="h-3 w-3 mr-1" />{t("common", "reset")}
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div ref={pullRefreshRef} className="relative">
        {pullDistance > 0 && (
          <div className="absolute top-0 left-0 right-0 flex justify-center z-10 pointer-events-none md:hidden" style={{ transform: `translateY(${pullDistance - 40}px)` }}>
            <div className={`flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 border border-primary/20 ${isRefreshing ? "animate-pull-spin" : ""}`}>
              <RefreshCw className="h-4 w-4 text-primary" style={{ transform: isRefreshing ? undefined : `rotate(${pullProgress * 270}deg)`, opacity: pullProgress }} />
            </div>
          </div>
        )}
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-none border-b border-border last:border-b-0" />
          ))}
        </div>
      ) : (
        (() => {
          const filtered = filterOrders(filterStatus === "all" ? null : filterStatus);
          if (filtered.length === 0) {
            return (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ShoppingBag className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">{t("orders", "noOrdersFound")}</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <Link href="/restaurant/catalog" data-testid="link-browse-catalog">
                      {t("common", "browseCatalog")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          }
          const sorted = sortOrders(filtered);
          const groups: { label: string; orders: OrderWithDetails[] }[] = [];
          if (groupByDate) {
            const groupMap = new Map<string, OrderWithDetails[]>();
            for (const order of sorted) {
              const d = new Date(order.createdAt);
              const key = format(d, "yyyy-MM-dd");
              if (!groupMap.has(key)) groupMap.set(key, []);
              groupMap.get(key)!.push(order);
            }
            const groupEntries = Array.from(groupMap.entries());
            for (const [key, ords] of groupEntries) {
              const d = new Date(key + "T00:00:00");
              let label: string;
              if (isToday(d)) label = lang === "de" ? "Heute" : "Oggi";
              else if (isYesterday(d)) label = lang === "de" ? "Gestern" : "Ieri";
              else label = format(d, "dd. MMMM yyyy", { locale: dateLocale });
              groups.push({ label, orders: ords });
            }
          } else {
            groups.push({ label: "", orders: sorted });
          }
          return (
            <div className="rounded-2xl border border-border bg-card overflow-hidden md:overflow-x-auto" data-testid="orders-table">
              {/* Desktop column header */}
              <div
                className={`hidden md:grid items-stretch gap-0 [&>*]:px-3 [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:!text-center [&>*]:min-w-0 ${densityHeaderClass} bg-muted/40 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold [&>*+*]:border-l [&>*+*]:border-border`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="relative pr-2">{lang === "de" ? "Bestell-Nr" : "N. ordine"}<ColumnResizeHandle onPointerDown={startColResize("orderNo")} testId="resize-orderNo" /></div>
                {visibleColumns.has("status") && <div className="relative pr-2">Status<ColumnResizeHandle onPointerDown={startColResize("status")} testId="resize-status" /></div>}
                {visibleColumns.has("supplier") && <div className="relative pr-2 !justify-start !text-left">{lang === "de" ? "Lieferant" : "Fornitore"}<ColumnResizeHandle onPointerDown={startColResize("supplier")} testId="resize-supplier" /></div>}
                {visibleColumns.has("items") && <div className="relative pr-2 text-right">{lang === "de" ? "Artikel" : "Articoli"}<ColumnResizeHandle onPointerDown={startColResize("items")} testId="resize-items" /></div>}
                {visibleColumns.has("deliveryDate") && <div className="relative pr-2">{lang === "de" ? "Lieferdatum" : "Data consegna"}<ColumnResizeHandle onPointerDown={startColResize("deliveryDate")} testId="resize-deliveryDate" /></div>}
                {visibleColumns.has("createdAt") && <div className="relative pr-2">{lang === "de" ? "Erstellt" : "Creato"}<ColumnResizeHandle onPointerDown={startColResize("createdAt")} testId="resize-createdAt" /></div>}
                {visibleColumns.has("total") && <div className="relative pr-2 text-right">{lang === "de" ? "Summe" : "Totale"}<ColumnResizeHandle onPointerDown={startColResize("total")} testId="resize-total" /></div>}
                <div></div>
              </div>
              {groups.map((group, gIdx) => (
                <div key={group.label || `g-${gIdx}`} data-testid={`order-group-${group.label || 'all'}`}>
                  {group.label && (
                    <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center gap-2">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</h3>
                      <span className="text-[11px] text-muted-foreground/60">({group.orders.length})</span>
                    </div>
                  )}
                  {group.orders.map((order) => (
                    <SwipeableRow
                      key={order.id}
                      leftActions={[
                        {
                          icon: <MessageSquare className="h-5 w-5" />,
                          label: lang === "de" ? "Nachricht" : "Messaggio",
                          color: "bg-blue-500",
                          onClick: () => navigate(`/restaurant/inbox?to=${order.supplierId}&orderRefId=${order.id}`),
                          testId: `swipe-message-${order.id}`,
                        },
                      ]}
                      rightActions={
                        order.status === "pending"
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
                      <OrderRow order={order} />
                    </SwipeableRow>
                  ))}
                </div>
              ))}
            </div>
          );
        })()
      )}
      </div>

      <Dialog open={!!detailOrder} onOpenChange={(open) => { if (!open) { setDetailOrder(null); setShowMessageInput(false); setOrderMessage(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-order-detail">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("orders", "order")} #{detailOrder?.id.slice(0, 8)}</DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="px-5 pt-5 pb-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t("orders", "order")}</p>
                  <h3 className="text-base font-semibold">#{detailOrder.id.slice(0, 8)}</h3>
                </div>
                <Badge className={`${getStatusColor(detailOrder.status)}`} variant="outline">
                  {getStatusIcon(detailOrder.status)}
                  <span className="ml-1">{getStatusLabel(detailOrder.status)}</span>
                </Badge>
              </div>

              <div className="space-y-2 text-sm rounded-xl bg-muted/30 p-3">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">{t("common", "supplier")}</span>
                  <span className="font-medium text-right truncate">{detailOrder.supplier?.companyName || detailOrder.supplier?.name || t("common", "unknown")}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">{t("orders", "createdAt")}</span>
                  <span className="shrink-0">{format(new Date(detailOrder.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</span>
                </div>
                {detailOrder.createdByUser && (
                  <div className="flex justify-between gap-3" data-testid="detail-created-by">
                    <span className="text-muted-foreground shrink-0">{t("orders", "createdBy")}</span>
                    <span className="font-medium text-right truncate">{detailOrder.createdByUser.name}</span>
                  </div>
                )}
                {detailOrder.requestedDeliveryDate && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground shrink-0">{lang === "de" ? "Liefertermin" : "Data consegna"}</span>
                    <span className="text-right truncate">{new Date(detailOrder.requestedDeliveryDate + "T00:00:00").toLocaleDateString(lang === "it" ? "it-IT" : "de-DE", { weekday: "short", day: "2-digit", month: "long", year: "numeric" })}</span>
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
                            {(item as any).confirmedQuantity != null && (item as any).confirmedQuantity < item.quantity && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="h-3 w-3 text-orange-500" />
                                <span className="text-[10px] text-orange-600">
                                  {lang === "it" ? "Confermato" : "Bestätigt"}: {(item as any).confirmedQuantity}/{item.quantity}
                                  {(item as any).rejectedQuantity > 0 && (
                                    <span className="text-red-500 ml-1">(-{(item as any).rejectedQuantity})</span>
                                  )}
                                </span>
                              </div>
                            )}
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
                  <p className="text-sm font-medium mb-1">{t("orders", "notes")}</p>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              <div className="rounded-xl bg-muted/30 p-3 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("common", "total")}</span>
                <span className="text-lg font-bold" data-testid="text-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              <div className="space-y-2.5">
                {(canEditOrder(detailOrder) || canRequestChange(detailOrder)) && (
                  <div className="rounded-xl bg-muted/30 p-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {lang === "de" ? "Aktionen" : "Azioni"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {canEditOrder(detailOrder) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { const o = detailOrder; setDetailOrder(null); openEditDialog(o); }}
                            data-testid="button-detail-edit-order"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1.5" />
                            {t("orders", "editOrder")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive/30 text-destructive hover:bg-destructive/10"
                            onClick={() => setCancelConfirmId(detailOrder.id)}
                            disabled={cancelOrderMutation.isPending}
                            data-testid="button-detail-cancel-order"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            {lang === "de" ? "Stornieren" : "Annullare"}
                          </Button>
                        </>
                      )}
                      {canRequestChange(detailOrder) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { const o = detailOrder; setDetailOrder(null); setChangeRequestOrder(o); }}
                          data-testid="button-detail-change-request"
                        >
                          <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
                          {t("orders", "requestChange")}
                        </Button>
                      )}
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
                        {lang === "de" ? "Bestellung" : "Ordine"} #{detailOrder.id.substring(0, 8)} - {detailOrder.supplier?.companyName || detailOrder.supplier?.name}
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

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("orders", "editOrder")}</DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              <h3 className="text-sm font-semibold">{t("orders", "editOrder")}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 pl-6">
              {t("orders", "order")} #{editingOrder?.id.slice(0, 8)}
            </p>
          </div>

          <div className="space-y-4 px-5 pb-5">
            <div>
              <Label className="text-sm font-medium mb-2 block">{t("orders", "orderItems")}</Label>
              <div className="space-y-2">
                {editItems.map((item: any, index) => (
                  <div key={item.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30" data-testid={`edit-item-${item.productId}`}>
                    {item.productImageUrl ? (
                      <img src={item.productImageUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{parseFloat(item.unitPrice).toFixed(2)}€ {t("orders", "perUnit")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateEditItemQuantity(index, -1)}
                        disabled={item.quantity <= 1}
                        data-testid={`button-decrease-${item.productId}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium" data-testid={`text-quantity-${item.productId}`}>{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => updateEditItemQuantity(index, 1)}
                        data-testid={`button-increase-${item.productId}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEditItem(index)}
                        disabled={editItems.length <= 1}
                        data-testid={`button-remove-${item.productId}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{item.totalPrice}€</span>
                  </div>
                ))}
              </div>
            </div>

            {addableProducts.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <PackagePlus className="h-3.5 w-3.5" />
                  {t("orders", "addProduct")}
                </Label>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t("orders", "searchProductsToAdd")}
                    value={editProductSearch}
                    onChange={(e) => setEditProductSearch(e.target.value)}
                    className="pl-8"
                    data-testid="input-search-add-product"
                  />
                </div>
                {(editProductSearch.trim() ? filteredAddableProducts : addableProducts.slice(0, 5)).length > 0 ? (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {(editProductSearch.trim() ? filteredAddableProducts : addableProducts.slice(0, 5)).map(product => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer bg-muted/30"
                        onClick={() => addProductToEdit(product)}
                        data-testid={`add-product-${product.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground">{parseFloat(product.price).toFixed(2)}€ / {product.unit || t("common", "piece")}</p>
                        </div>
                        <Button variant="ghost" size="icon" data-testid={`button-add-product-${product.id}`}>
                          <Plus className="h-4 w-4 text-primary" />
                        </Button>
                      </div>
                    ))}
                    {!editProductSearch.trim() && addableProducts.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        {addableProducts.length - 5} {t("orders", "moreProductsAvailable")}
                      </p>
                    )}
                  </div>
                ) : editProductSearch.trim() ? (
                  <p className="text-xs text-muted-foreground py-2">{t("orders", "noMatchingProducts")}</p>
                ) : null}
              </div>
            )}

            <Separator />

            <div>
              <Label className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {t("orders", "requestedDeliveryDate")}
              </Label>
              <div className="space-y-2">
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    editDeliveryOption === "asap" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="edit-radio-delivery-asap"
                >
                  <input
                    type="radio"
                    name="editDeliveryOption"
                    checked={editDeliveryOption === "asap"}
                    onChange={() => { setEditDeliveryOption("asap"); setEditSelectedDeliveryDate(""); }}
                    className="accent-primary"
                  />
                  <Zap className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm">{t("cart", "asap")}</span>
                </label>
                <label
                  className={`flex items-center gap-2.5 p-2.5 rounded-md border cursor-pointer transition-colors ${
                    editDeliveryOption === "date" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                  data-testid="edit-radio-delivery-date"
                >
                  <input
                    type="radio"
                    name="editDeliveryOption"
                    checked={editDeliveryOption === "date"}
                    onChange={() => setEditDeliveryOption("date")}
                    className="accent-primary"
                  />
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{t("cart", "selectDeliveryDay")}</span>
                </label>
              </div>
              {editDeliveryOption === "date" && (
                <div className="pt-2">
                  {editAvailableDeliveryDates.length > 0 ? (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {editAvailableDeliveryDates.map(date => (
                        <label
                          key={date.value}
                          className={`flex items-center gap-2.5 p-2 rounded-md border cursor-pointer transition-colors text-sm ${
                            editSelectedDeliveryDate === date.value
                              ? "border-primary bg-primary/5"
                              : "border-border"
                          }`}
                          data-testid={`edit-delivery-date-${date.value}`}
                        >
                          <input
                            type="radio"
                            name="editDeliveryDate"
                            checked={editSelectedDeliveryDate === date.value}
                            onChange={() => setEditSelectedDeliveryDate(date.value)}
                            className="accent-primary"
                          />
                          <span>{date.label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-2">
                      {t("cart", "noDeliveryDays")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("common", "total")}</span>
              <span className="text-lg font-bold" data-testid="text-edit-total">{editTotal}€</span>
            </div>
          </div>

          <div className="flex gap-2 px-5 pb-5">
            <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setEditingOrder(null)} data-testid="button-cancel-edit">
              {t("common", "cancel")}
            </Button>
            <Button
              className="flex-1 rounded-lg"
              onClick={() => {
                if (!editingOrder) return;
                const deliveryDate = editDeliveryOption === "date" && editSelectedDeliveryDate ? editSelectedDeliveryDate : null;
                updateOrderItemsMutation.mutate({ orderId: editingOrder.id, items: editItems, requestedDeliveryDate: deliveryDate });
              }}
              disabled={editItems.length === 0 || updateOrderItemsMutation.isPending || (editDeliveryOption === "date" && !editSelectedDeliveryDate)}
              data-testid="button-save-edit"
            >
              {updateOrderItemsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("orders", "saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!changeRequestOrder} onOpenChange={(open) => { if (!open) { setChangeRequestOrder(null); setChangeRequestReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("orders", "requestChange")}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4" />
              <h3 className="text-sm font-semibold">{t("orders", "requestChange")}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 pl-6">
              {t("orders", "order")} #{changeRequestOrder?.id.slice(0, 8)}
            </p>
          </div>
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("orders", "changeRequestReason")}</label>
              <Textarea
                placeholder={t("orders", "changeRequestReasonPlaceholder")}
                value={changeRequestReason}
                onChange={(e) => setChangeRequestReason(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-change-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-lg" onClick={() => { setChangeRequestOrder(null); setChangeRequestReason(""); }} data-testid="button-cancel-request">
                {t("common", "cancel")}
              </Button>
              <Button
                className="flex-1 rounded-lg"
                onClick={() => changeRequestOrder && changeRequestMutation.mutate({ orderId: changeRequestOrder.id, reason: changeRequestReason })}
                disabled={!changeRequestReason.trim() || changeRequestMutation.isPending}
                data-testid="button-send-request"
              >
                {changeRequestMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("orders", "sendRequest")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ProductDetailDialog
        product={selectedProduct}
        open={!!selectedProduct}
        onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}
        supplierName={selectedProduct ? (allProducts?.find(p => p.id === selectedProduct.id)?.supplier as any)?.companyName : undefined}
      />

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
              onClick={() => { if (cancelConfirmId) { cancelOrderMutation.mutate(cancelConfirmId); setCancelConfirmId(null); } }}
              disabled={cancelOrderMutation.isPending}
              data-testid="button-cancel-confirm"
            >
              {cancelOrderMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
              {lang === "de" ? "Ja, stornieren" : "Sì, annulla"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
