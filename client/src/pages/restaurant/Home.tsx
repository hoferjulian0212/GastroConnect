import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingBag, Package, Clock, Truck, Calendar, MessageSquare, Tag, ShoppingCart, Check, ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertTriangle, Send, ClipboardList, Loader2, ArrowRight, ArrowLeft, Plus, Sparkles, Trash2, Search, Save, Calculator, Target, TrendingUp, TrendingDown, Users, Euro, Flame } from "lucide-react";
import DraggableCardGrid from "@/components/DraggableCardGrid";
import { Input } from "@/components/ui/input";
import QuantityInput from "@/components/QuantityInput";
import type { OrderWithDetails, ConversationWithUser, ProductWithSupplierAndPromotion, OrderTemplateWithItems } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import { format, isToday, isTomorrow, differenceInDays, differenceInHours } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT, getOrderStatus } from "@/lib/translations";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function RestaurantHome() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const dateLocale = lang === "it" ? it : de;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [addedProductIds, setAddedProductIds] = useState<Set<string>>(new Set());
  const [addedTimers, setAddedTimers] = useState<Record<string, ReturnType<typeof setTimeout>>>({});
  const promoScrollRef = useRef<HTMLDivElement>(null);

  const { data: upcomingDeliveries, isLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ['/api/restaurant/upcoming-deliveries', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/restaurant/upcoming-deliveries?restaurantId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: conversations, isLoading: convLoading } = useQuery<ConversationWithUser[]>({
    queryKey: [`/api/conversations?userId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<OrderTemplateWithItems[]>({
    queryKey: [`/api/order-templates?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const costCurrentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  type CostAnalysisData = {
    month: string; totalOvernights: number; totalCosts: string;
    costPerGuest: string; targetCost: string; difference: string;
    percentageDeviation: string; orderCount: number; daysWithData: number;
  };
  type OvernightStayEntry = { id: string; restaurantId: string; date: string; overnightStays: number };

  const { data: costAnalysis, isLoading: costLoading } = useQuery<CostAnalysisData>({
    queryKey: [`/api/restaurant/cost-analysis?restaurantId=${currentUser?.id}&month=${costCurrentMonth}`],
    enabled: !!currentUser?.id,
  });

  const { data: overnightEntries } = useQuery<OvernightStayEntry[]>({
    queryKey: [`/api/restaurant/overnight-stays?restaurantId=${currentUser?.id}&month=${costCurrentMonth}`],
    enabled: !!currentUser?.id,
  });

  const [costStayDate, setCostStayDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [costStayGuests, setCostStayGuests] = useState("");

  const saveCostStayMutation = useMutation({
    mutationFn: (data: { restaurantId: string; date: string; overnightStays: number }) =>
      apiRequest("POST", "/api/restaurant/overnight-stays", data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0] as string;
          return typeof key === "string" && (key.startsWith("/api/restaurant/overnight-stays") || key.startsWith("/api/restaurant/cost-analysis"));
        },
      });
      setCostStayGuests("");
      toast({ title: lang === "de" ? "Gespeichert" : "Salvato" });
    },
    onError: () => {
      toast({ title: lang === "de" ? "Fehler beim Speichern" : "Errore nel salvataggio", variant: "destructive" });
    },
  });

  const todayEntry = useMemo(() => {
    if (!overnightEntries) return null;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return overnightEntries.find(e => e.date === todayStr) || null;
  }, [overnightEntries]);

  const [orderingTemplateId, setOrderingTemplateId] = useState<string | null>(null);
  const [wizardTemplate, setWizardTemplate] = useState<OrderTemplateWithItems | null>(null);
  const [wizardStep, setWizardStep] = useState<"items" | "browse_supplier" | "browse_products" | "review" | "done">("items");
  const [wizardQuantities, setWizardQuantities] = useState<Record<string, number>>({});
  const [wizardProducts, setWizardProducts] = useState<Record<string, ProductWithSupplierAndPromotion>>({});
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardBrowseSupplierId, setWizardBrowseSupplierId] = useState<string | null>(null);
  const [wizardBrowseSearch, setWizardBrowseSearch] = useState("");
  const [wizardTemplateChanged, setWizardTemplateChanged] = useState(false);
  const [wizardSavingTemplate, setWizardSavingTemplate] = useState(false);

  const openTemplateWizard = useCallback((tmpl: OrderTemplateWithItems) => {
    const qtys: Record<string, number> = {};
    const prods: Record<string, ProductWithSupplierAndPromotion> = {};
    for (const item of tmpl.items) {
      if (item.product.inStock !== false) {
        qtys[item.productId] = item.quantity;
        prods[item.productId] = item.product as ProductWithSupplierAndPromotion;
      }
    }
    setWizardQuantities(qtys);
    setWizardProducts(prods);
    setWizardTemplate(tmpl);
    setWizardStep("items");
    setWizardSubmitting(false);
    setWizardBrowseSupplierId(null);
    setWizardBrowseSearch("");
    setWizardTemplateChanged(false);
    setWizardSavingTemplate(false);
  }, []);

  const wizardSuppliers = useMemo(() => {
    if (!products) return [];
    const supplierMap = new Map<string, { id: string; name: string }>();
    for (const p of products) {
      if (p.inStock === false) continue;
      const sId = p.supplierId;
      if (!supplierMap.has(sId)) {
        supplierMap.set(sId, { id: sId, name: p.supplier?.companyName || p.supplier?.name || sId });
      }
    }
    return Array.from(supplierMap.values());
  }, [products]);

  const wizardBrowseProducts = useMemo(() => {
    if (!products || !wizardBrowseSupplierId) return [];
    return products.filter(p =>
      p.supplierId === wizardBrowseSupplierId &&
      p.inStock !== false &&
      (wizardBrowseSearch === "" || p.name.toLowerCase().includes(wizardBrowseSearch.toLowerCase()))
    );
  }, [products, wizardBrowseSupplierId, wizardBrowseSearch]);

  const wizardTotalEstimate = useMemo(() => {
    return Object.entries(wizardQuantities).reduce((sum, [pid, qty]) => {
      const prod = wizardProducts[pid];
      if (!prod) return sum;
      const price = parseFloat(prod.price);
      const hasPromo = prod.activePromotion;
      const finalPrice = hasPromo ? price * (1 - hasPromo.discountPercent / 100) : price;
      return sum + finalPrice * qty;
    }, 0);
  }, [wizardQuantities, wizardProducts]);

  const wizardItemsBySupplier = useMemo(() => {
    const groups: Record<string, { supplierName: string; items: { productId: string; product: ProductWithSupplierAndPromotion; qty: number }[] }> = {};
    for (const [pid, qty] of Object.entries(wizardQuantities)) {
      if (qty <= 0) continue;
      const prod = wizardProducts[pid];
      if (!prod) continue;
      const sId = prod.supplierId;
      if (!groups[sId]) {
        groups[sId] = { supplierName: prod.supplier?.companyName || prod.supplier?.name || "", items: [] };
      }
      groups[sId].items.push({ productId: pid, product: prod, qty });
    }
    return groups;
  }, [wizardQuantities, wizardProducts]);

  const wizardAddToCartMutation = useMutation({
    mutationFn: async () => {
      for (const [productId, qty] of Object.entries(wizardQuantities)) {
        if (qty <= 0) continue;
        const prod = wizardProducts[productId];
        if (!prod) continue;
        await apiRequest("POST", "/api/cart", {
          restaurantId: currentUser?.id,
          productId,
          supplierId: prod.supplierId,
          quantity: qty,
          mode: "set",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setWizardStep("done");
      setWizardSubmitting(false);
      setTimeout(() => {
        setWizardTemplate(null);
        navigate("/restaurant/cart");
      }, 3500);
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
      setWizardSubmitting(false);
    },
  });

  const handleWizardSubmit = () => {
    setWizardSubmitting(true);
    wizardAddToCartMutation.mutate();
  };

  const handleWizardSaveTemplate = async (mode: "overwrite" | "new") => {
    if (!wizardTemplate || !currentUser?.id) return;
    setWizardSavingTemplate(true);
    const items = Object.entries(wizardQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));
    try {
      if (mode === "overwrite") {
        await apiRequest("PATCH", `/api/order-templates/${wizardTemplate.id}`, {
          name: wizardTemplate.name,
          items,
        });
        toast({ title: lang === "de" ? "Vorlage aktualisiert" : "Modello aggiornato" });
      } else {
        await apiRequest("POST", "/api/order-templates", {
          restaurantId: currentUser.id,
          name: `${wizardTemplate.name} (2)`,
          items,
        });
        toast({ title: lang === "de" ? "Neue Vorlage gespeichert" : "Nuovo modello salvato" });
      }
      queryClient.invalidateQueries({ queryKey: [`/api/order-templates?restaurantId=${currentUser.id}`] });
      setWizardTemplateChanged(false);
    } catch {
      toast({ title: t("common", "error"), variant: "destructive" });
    } finally {
      setWizardSavingTemplate(false);
    }
  };

  const orderFromTemplateMutation = useMutation({
    mutationFn: async (template: OrderTemplateWithItems) => {
      const inStockItems = template.items.filter(i => i.product.inStock !== false);
      for (const item of inStockItems) {
        await apiRequest("POST", "/api/cart", {
          restaurantId: currentUser?.id,
          productId: item.productId,
          supplierId: item.product.supplierId,
          quantity: item.quantity,
          mode: "set",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({ title: lang === "de" ? "Zum Warenkorb hinzugefuegt" : "Aggiunto al carrello" });
      setOrderingTemplateId(null);
      navigate("/restaurant/cart");
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
      setOrderingTemplateId(null);
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, supplierId, quantity }: { productId: string; supplierId: string; quantity: number }) => {
      return apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId,
        supplierId,
        quantity,
        mode: "set",
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAddedProductIds(prev => new Set(prev).add(variables.productId));
      if (addedTimers[variables.productId]) clearTimeout(addedTimers[variables.productId]);
      const timer = setTimeout(() => {
        setAddedProductIds(prev => {
          const next = new Set(prev);
          next.delete(variables.productId);
          return next;
        });
      }, 2000);
      setAddedTimers(prev => ({ ...prev, [variables.productId]: timer }));
    },
    onError: () => {
      toast({
        title: t("common", "error"),
        description: t("common", "productAddError"),
        variant: "destructive",
      });
    },
  });

  const unreadConversations = useMemo(() => {
    if (!conversations) return [];
    return conversations.filter(c => c.unreadCount > 0).sort((a, b) => {
      const aPriority = a.lastMessage?.priority === "important" ? 1 : 0;
      const bPriority = b.lastMessage?.priority === "important" ? 1 : 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversations]);

  const promoProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.activePromotion);
  }, [products]);

  const getMinOrderQty = (product: ProductWithSupplierAndPromotion) => {
    return product.minOrderQuantity && product.minOrderQuantity > 1 ? product.minOrderQuantity : 1;
  };

  const updateQuantity = (productId: string, delta: number, minQty: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(minQty, (prev[productId] || minQty) + delta),
    }));
  };

  const handleAddToCart = (product: ProductWithSupplierAndPromotion) => {
    const minQty = getMinOrderQty(product);
    const quantity = quantities[product.id] || minQty;
    addToCartMutation.mutate({ productId: product.id, supplierId: product.supplierId, quantity });
  };

  const getMessagePreview = (conv: ConversationWithUser) => {
    if (!conv.lastMessage) return "";
    const msg = conv.lastMessage;
    try {
      if (msg.messageType === "order") {
        const data = JSON.parse(msg.content);
        const id = (data.orderId || msg.orderId || "")?.substring(0, 8);
        if (data.isFollowUp) {
          return id ? `${lang === "de" ? "Nachlieferung" : "Riconsegna"} #${id}` : (lang === "de" ? "Nachlieferung" : "Riconsegna");
        }
        return id ? `${lang === "de" ? "Neue Bestellung" : "Nuovo ordine"} #${id}` : (lang === "de" ? "Neue Bestellung" : "Nuovo ordine");
      }
      if (msg.messageType === "complaint") {
        const data = JSON.parse(msg.content);
        return data.title
          ? `${lang === "de" ? "Reklamation" : "Reclamo"}: ${data.title.replace("[PRIORITY IMMEDIATE] ", "")}`
          : (lang === "de" ? "Neue Reklamation" : "Nuovo reclamo");
      }
      if (msg.messageType === "document") {
        const data = JSON.parse(msg.content);
        const id = (data.orderId || "")?.substring(0, 8);
        return id ? `${lang === "de" ? "Lieferschein" : "Bolla di consegna"} #${id}` : (lang === "de" ? "Neuer Lieferschein" : "Nuova bolla");
      }
      if (msg.messageType === "order_change_request") {
        const data = JSON.parse(msg.content);
        const id = (data.orderId || msg.orderId || "")?.substring(0, 8);
        return id ? `${lang === "de" ? "Aenderungsanfrage" : "Richiesta di modifica"} #${id}` : (lang === "de" ? "Aenderungsanfrage" : "Richiesta di modifica");
      }
    } catch {}
    if (msg.messageType === "attachment") return lang === "de" ? "Anhang" : "Allegato";
    if (msg.messageType === "promotion") return lang === "de" ? "Neue Aktion" : "Nuova promozione";
    return msg.content?.slice(0, 80) || "";
  };

  const scrollPromos = (dir: "left" | "right") => {
    if (promoScrollRef.current) {
      const scrollAmount = 220;
      promoScrollRef.current.scrollBy({ left: dir === "left" ? -scrollAmount : scrollAmount, behavior: "smooth" });
    }
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5" />;
      case "confirmed": return <Package className="h-3.5 w-3.5" />;
      case "partially_confirmed": return <AlertTriangle className="h-3.5 w-3.5" />;
      case "in_delivery": return <Truck className="h-3.5 w-3.5" />;
      case "delivered": return <Package className="h-3.5 w-3.5" />;
      default: return <ShoppingBag className="h-3.5 w-3.5" />;
    }
  };

  const getDeliveryDateLabel = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    if (isToday(date)) return t("restaurantHome", "today");
    if (isTomorrow(date)) return t("restaurantHome", "tomorrow");
    return format(date, "EEEE, dd.MM.", { locale: dateLocale });
  };

  const getOrderDeliveryState = (order: OrderWithDetails): "delivered_today" | "overdue" | "delayed" | "upcoming" => {
    if (order.status === "delivered") {
      const updatedAt = order.updatedAt ? new Date(order.updatedAt) : null;
      if (updatedAt && isToday(updatedAt)) return "delivered_today";
      return "upcoming";
    }
    if (!order.requestedDeliveryDate) return "upcoming";
    const dd = new Date(order.requestedDeliveryDate + "T00:00:00");
    if (isNaN(dd.getTime())) return "upcoming";
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (dd < now) return "overdue";
    if (order.originalDeliveryDate) return "delayed";
    return "upcoming";
  };

  const groupedDeliveries = useMemo(() => {
    if (!upcomingDeliveries) return [];
    const overdueOrders: OrderWithDetails[] = [];
    const todayDeliveredOrders: OrderWithDetails[] = [];
    const regularGroups = new Map<string, OrderWithDetails[]>();

    for (const order of upcomingDeliveries) {
      const state = getOrderDeliveryState(order);
      if (state === "overdue") {
        overdueOrders.push(order);
      } else if (state === "delivered_today") {
        todayDeliveredOrders.push(order);
      } else {
        const dateKey = order.requestedDeliveryDate || "";
        if (!regularGroups.has(dateKey)) regularGroups.set(dateKey, []);
        regularGroups.get(dateKey)!.push(order);
      }
    }

    const result: { dateKey: string; label: string; isToday: boolean; type: "overdue" | "delivered" | "regular"; orders: OrderWithDetails[] }[] = [];

    if (overdueOrders.length > 0) {
      result.push({
        dateKey: "_overdue",
        label: lang === "de" ? "Überfällig" : "Scaduto",
        isToday: false,
        type: "overdue",
        orders: overdueOrders,
      });
    }

    for (const [dateKey, orders] of regularGroups.entries()) {
      const dtToday = isToday(new Date(dateKey + "T00:00:00"));
      result.push({
        dateKey,
        label: getDeliveryDateLabel(dateKey),
        isToday: dtToday,
        type: "regular",
        orders: [...orders, ...(dtToday ? todayDeliveredOrders : [])],
      });
    }

    if (todayDeliveredOrders.length > 0 && !result.some(g => g.type === "regular" && g.isToday)) {
      result.push({
        dateKey: "_delivered_today",
        label: t("restaurantHome", "today"),
        isToday: true,
        type: "delivered",
        orders: todayDeliveredOrders,
      });
    }

    if (!result.some(g => g.isToday)) {
      const insertIdx = result.findIndex(g => g.type !== "overdue");
      const todayEntry = {
        dateKey: "_today_empty",
        label: t("restaurantHome", "today"),
        isToday: true,
        type: "regular" as const,
        orders: [] as OrderWithDetails[],
      };
      if (insertIdx === -1) result.push(todayEntry);
      else result.splice(insertIdx, 0, todayEntry);
    }

    return result;
  }, [upcomingDeliveries, lang]);

  const totalUnread = unreadConversations.length;

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <div className="bg-[#161921] px-4 md:px-6 pt-6 pb-6 rounded-b-3xl">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-5" data-testid="text-page-title">
            {currentUser?.companyName || ""}
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Link href="/restaurant/inbox" data-testid="kpi-card-messages">
              <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[120px]">
                <span className="text-xs md:text-sm text-gray-400 font-medium">{lang === "de" ? "Neue Nachrichten" : "Nuovi messaggi"}</span>
                <div className="flex items-end justify-between mt-auto">
                  <p className="text-4xl md:text-5xl font-bold text-white leading-none" data-testid="kpi-unread-messages">{convLoading ? "..." : totalUnread}</p>
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-blue-500/20">
                    <MessageSquare className="h-5 w-5 text-blue-400" />
                  </div>
                </div>
              </div>
            </Link>
            <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 md:p-5 flex flex-col justify-between min-h-[120px]" data-testid="kpi-card-cost-per-guest">
              <span className="text-xs md:text-sm text-gray-400 font-medium">{lang === "de" ? "Wareneinsatz/Gast" : "Costo/ospite"}</span>
              <div className="flex items-end justify-between mt-auto">
                {costLoading ? (
                  <Skeleton className="h-10 w-20 bg-white/10" />
                ) : costAnalysis?.costPerGuest && parseFloat(costAnalysis.costPerGuest) > 0 ? (
                  <p className="text-3xl md:text-4xl font-bold text-white leading-none" data-testid="kpi-cost-per-guest">{parseFloat(costAnalysis.costPerGuest).toFixed(2)}€</p>
                ) : (
                  <p className="text-4xl font-bold text-gray-500 leading-none" data-testid="kpi-cost-per-guest">--</p>
                )}
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/20">
                  <Calculator className="h-5 w-5 text-emerald-400" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 md:p-5 flex flex-col justify-between min-h-[120px]" data-testid="kpi-card-empty">
              <span className="text-xs md:text-sm text-gray-400 font-medium">{lang === "de" ? "Kommt bald" : "In arrivo"}</span>
              <div className="flex items-end justify-between mt-auto">
                <p className="text-4xl font-bold text-gray-600 leading-none">--</p>
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.06]">
                  <Sparkles className="h-5 w-5 text-gray-500" />
                </div>
              </div>
            </div>
            <Link href="/restaurant/cost-analysis" data-testid="kpi-card-monthly-spending">
              <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-4 md:p-5 cursor-pointer hover:bg-white/[0.10] transition-colors h-full flex flex-col justify-between min-h-[120px]">
                <span className="text-xs md:text-sm text-gray-400 font-medium">{lang === "de" ? "Monatsausgaben" : "Spese mensili"}</span>
                <div className="flex items-end justify-between mt-auto">
                  {costLoading ? (
                    <Skeleton className="h-10 w-20 bg-white/10" />
                  ) : costAnalysis?.totalCosts && parseFloat(costAnalysis.totalCosts) > 0 ? (
                    <p className="text-3xl md:text-4xl font-bold text-white leading-none" data-testid="kpi-monthly-spending">{parseFloat(costAnalysis.totalCosts).toLocaleString(lang === "de" ? "de-DE" : "it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}€</p>
                  ) : (
                    <p className="text-4xl font-bold text-gray-500 leading-none" data-testid="kpi-monthly-spending">--</p>
                  )}
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-amber-500/20">
                    <Euro className="h-5 w-5 text-amber-400" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <DraggableCardGrid
        userId={currentUser?.id || ""}
        role="restaurant"
        sections={[
          { id: "upcoming-deliveries", content: (
      <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="text-lg md:text-xl font-bold" data-testid="text-upcoming-deliveries-title">
                {t("restaurantHome", "upcomingDeliveries")}
              </h2>
              <p className="text-xs text-muted-foreground hidden md:block">
                {t("restaurantHome", "upcomingDeliveriesDesc")}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
            <Link href="/restaurant/orders" data-testid="link-view-all-orders">{t("common", "all")}</Link>
          </Button>
        </div>
        <div className="md:px-5 md:pb-5">

        {isLoading ? (
          <div className="flex gap-3 overflow-hidden md:flex-col">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="min-w-[200px] h-[160px] md:min-w-0 md:h-16 rounded-xl shrink-0" />
            ))}
          </div>
        ) : groupedDeliveries.length > 0 ? (
          <div className="space-y-4">
            {groupedDeliveries.map((group) => (
              <div key={group.dateKey}>
                <div className="flex items-center gap-2 mb-2">
                  {group.type === "overdue" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Calendar className={`h-3.5 w-3.5 ${group.isToday ? "text-primary" : "text-muted-foreground"}`} />
                  )}
                  <span className={`text-xs font-semibold uppercase tracking-wide ${
                    group.type === "overdue" ? "text-red-500" : group.isToday ? "text-primary" : "text-muted-foreground"
                  }`}>
                    {group.label}
                  </span>
                  {group.isToday && group.type !== "overdue" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </div>

                {group.orders.length === 0 && group.isToday && (
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center" data-testid="today-no-deliveries">
                    <p className="text-sm text-muted-foreground">
                      {lang === "de" ? "Keine Lieferungen geplant f\u00FCr heute" : "Nessuna consegna prevista per oggi"}
                    </p>
                  </div>
                )}

                {group.orders.length > 0 && (
                  <>
                    {/* Mobile: horizontal scroll cards */}
                    <div
                      className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                      style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                    >
                      {group.orders.map((order) => {
                        const deliveryState = getOrderDeliveryState(order);
                        const isDelivered = deliveryState === "delivered_today";
                        const isOverdue = deliveryState === "overdue";
                        const isDelayed = deliveryState === "delayed";
                        const supplierName = order.supplier?.companyName || order.supplier?.name || t("common", "unknown");

                        return (
                          <div
                            key={order.id}
                            className={`min-w-[200px] w-[200px] shrink-0 snap-start rounded-2xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${
                              isDelivered
                                ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                                : isOverdue
                                  ? "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/20"
                                  : isDelayed
                                    ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/20"
                                    : "border-border bg-card"
                            }`}
                            onClick={() => navigate(`/restaurant/orders/${order.id}`)}
                            data-testid={`delivery-item-${order.id}`}
                          >
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className={`flex items-center justify-center h-10 w-10 rounded-xl shrink-0 ${
                                isDelivered
                                  ? "bg-green-100 dark:bg-green-900/30"
                                  : isOverdue
                                    ? "bg-red-100 dark:bg-red-900/30"
                                    : isDelayed
                                      ? "bg-amber-100 dark:bg-amber-900/30"
                                      : order.status === "in_delivery"
                                        ? "bg-purple-100 dark:bg-purple-900/30"
                                        : "bg-blue-100 dark:bg-blue-900/30"
                              }`}>
                                {isDelivered
                                  ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                                  : isOverdue
                                    ? <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                                    : isDelayed
                                      ? <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                      : order.status === "in_delivery"
                                        ? <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                        : <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                }
                              </div>
                              {isDelivered ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5" variant="outline">
                                  {lang === "de" ? "Geliefert" : "Consegnato"}
                                </Badge>
                              ) : isOverdue ? (
                                <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5" variant="outline">
                                  {lang === "de" ? "Überfällig" : "Scaduto"}
                                </Badge>
                              ) : isDelayed ? (
                                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5" variant="outline">
                                  {lang === "de" ? "In Verspätung" : "In ritardo"}
                                </Badge>
                              ) : (
                                <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                                  {getOrderStatus(order.status, lang)}
                                </Badge>
                              )}
                            </div>

                            <p className={`text-sm font-semibold truncate ${isOverdue ? "text-red-700 dark:text-red-400" : ""}`}>
                              {supplierName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {order.items?.length || 0} {t("common", "items")}
                            </p>

                            {isDelayed && order.originalDeliveryDate && (
                              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
                                {new Date(order.originalDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                                {" → "}
                                {new Date((order.requestedDeliveryDate || "") + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                              </p>
                            )}
                            {isOverdue && (
                              <p className="text-[10px] text-red-500 dark:text-red-400 mt-1.5">
                                {lang === "de" ? "Erwartet" : "Previsto"}: {new Date((order.requestedDeliveryDate || "") + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                              </p>
                            )}

                            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                              <span className="text-xs text-muted-foreground font-mono">#{order.id.slice(0, 8)}</span>
                              <span className="text-base font-bold">{order.totalAmount}€</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop: stacked list */}
                    <div className="hidden md:block space-y-2">
                      {group.orders.map((order) => {
                        const deliveryState = getOrderDeliveryState(order);
                        const isDelivered = deliveryState === "delivered_today";
                        const isOverdue = deliveryState === "overdue";
                        const isDelayed = deliveryState === "delayed";
                        const supplierName = order.supplier?.companyName || order.supplier?.name || t("common", "unknown");

                        return (
                          <div
                            key={order.id}
                            className={`rounded-xl border transition-all duration-200 ${
                              isDelivered
                                ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                                : isOverdue
                                  ? "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-950/20"
                                  : isDelayed
                                    ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/20"
                                    : "border-border bg-card hover:shadow-md hover:border-primary/20"
                            }`}
                            data-testid={`delivery-item-${order.id}`}
                          >
                            <div
                              className="flex items-center gap-3 p-3 cursor-pointer"
                              onClick={() => navigate(`/restaurant/orders/${order.id}`)}
                            >
                              <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                                isDelivered
                                  ? "bg-green-100 dark:bg-green-900/30"
                                  : isOverdue
                                    ? "bg-red-100 dark:bg-red-900/30"
                                    : isDelayed
                                      ? "bg-amber-100 dark:bg-amber-900/30"
                                      : order.status === "in_delivery"
                                        ? "bg-purple-100 dark:bg-purple-900/30"
                                        : "bg-blue-100 dark:bg-blue-900/30"
                              }`}>
                                {isDelivered
                                  ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                                  : isOverdue
                                    ? <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                                    : isDelayed
                                      ? <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                      : order.status === "in_delivery"
                                        ? <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                        : <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`text-sm font-medium truncate ${isOverdue ? "text-red-700 dark:text-red-400" : ""}`}>
                                    {supplierName}
                                  </span>
                                  {isDelivered ? (
                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5" variant="outline">
                                      {lang === "de" ? "Geliefert" : "Consegnato"}
                                    </Badge>
                                  ) : isOverdue ? (
                                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] px-1.5" variant="outline">
                                      {lang === "de" ? "Überfällig" : "Scaduto"}
                                    </Badge>
                                  ) : isDelayed ? (
                                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5" variant="outline">
                                      {lang === "de" ? "In Verspätung" : "In ritardo"}
                                    </Badge>
                                  ) : (
                                    <Badge className={`${getStatusColor(order.status)} text-[10px] px-1.5`} variant="outline">
                                      {getOrderStatus(order.status, lang)}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {order.items?.length || 0} {t("common", "items")} — #{order.id.slice(0, 8)}
                                  {order.createdByUser && (
                                    <span className="ml-1.5" data-testid={`text-created-by-${order.id}`}>— {order.createdByUser.name}</span>
                                  )}
                                </p>
                                {isDelayed && order.originalDeliveryDate && (
                                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                                    {lang === "de" ? "Ursprünglich" : "Originale"}: {new Date(order.originalDeliveryDate + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                                    {" → "}
                                    {new Date((order.requestedDeliveryDate || "") + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { day: "2-digit", month: "short" })}
                                  </p>
                                )}
                                {isOverdue && (
                                  <p className="text-[11px] text-red-500 dark:text-red-400 mt-0.5">
                                    {lang === "de" ? "Erwartet am" : "Previsto per il"} {new Date((order.requestedDeliveryDate || "") + "T00:00:00").toLocaleDateString(lang === "de" ? "de-DE" : "it-IT", { weekday: "short", day: "2-digit", month: "short" })}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-sm font-bold">{order.totalAmount}€</span>
                              </div>
                            </div>
                            {isOverdue && (
                              <div className="px-3 pb-3 flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs bg-white dark:bg-background text-foreground border-border h-7 px-2.5 rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/restaurant/inbox?to=${order.supplierId}`);
                                  }}
                                  data-testid={`button-send-overdue-msg-${order.id}`}
                                >
                                  <Send className="h-3 w-3 mr-1" />
                                  {lang === "de" ? "Nachricht" : "Messaggio"}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted/50 mb-3">
              <Truck className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t("restaurantHome", "noUpcomingDeliveries")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("restaurantHome", "noUpcomingDeliveriesDesc")}</p>
          </div>
        )}
        </div>
      </div>
          )},
          { id: "unread-messages", content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg md:text-xl font-bold" data-testid="text-unread-messages-title">
                      {t("restaurantHome", "unreadMessages")}
                    </h2>
                    {totalUnread > 0 && (
                      <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0 min-w-[20px] flex items-center justify-center" data-testid="badge-unread-count">
                        {totalUnread}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {t("restaurantHome", "unreadMessagesDesc")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/inbox" data-testid="link-view-all-messages">{t("restaurantHome", "allMessages")}</Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">

            {convLoading ? (
              <div className="flex gap-3 overflow-hidden md:flex-col">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="min-w-[220px] h-[130px] md:min-w-0 md:h-14 rounded-xl shrink-0" />
                ))}
              </div>
            ) : unreadConversations.length > 0 ? (
              <>
                {/* Mobile: horizontal scroll cards */}
                <div
                  className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                >
                  {unreadConversations.slice(0, 5).map((conv) => {
                    const isPriority = conv.lastMessage?.priority === "important";
                    return (
                      <div
                        key={conv.id}
                        className={`min-w-[220px] w-[220px] shrink-0 snap-start rounded-2xl border p-4 cursor-pointer transition-all active:scale-[0.98] ${isPriority ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20" : "border-border bg-card"}`}
                        onClick={() => navigate(`/restaurant/inbox?chat=${conv.id}`)}
                        data-testid={`unread-chat-${conv.id}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <Avatar className="h-10 w-10 shrink-0">
                            {conv.otherUser.profileImageUrl ? (
                              <AvatarImage src={conv.otherUser.profileImageUrl} alt={conv.otherUser.companyName || conv.otherUser.name} />
                            ) : null}
                            <AvatarFallback className={`text-xs font-bold ${isPriority ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                              {(conv.otherUser.companyName || conv.otherUser.name || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Badge className={`text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0 ${isPriority ? "bg-red-600" : "bg-blue-600"}`} data-testid={`badge-unread-conv-${conv.id}`}>
                            {conv.unreadCount}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5 mb-1">
                          {isPriority && <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                          <p className={`text-sm font-semibold truncate ${isPriority ? "text-red-700 dark:text-red-400" : ""}`} data-testid={`text-unread-supplier-${conv.id}`}>
                            {conv.otherUser.companyName || conv.otherUser.name}
                          </p>
                        </div>
                        <p className={`text-xs line-clamp-2 ${isPriority ? "text-red-600/70 dark:text-red-400/70" : "text-muted-foreground"}`} data-testid={`text-unread-preview-${conv.id}`}>
                          {getMessagePreview(conv)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-2" data-testid={`text-unread-time-${conv.id}`}>
                          {conv.lastMessage?.createdAt && format(new Date(conv.lastMessage.createdAt), "HH:mm", { locale: dateLocale })}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: stacked list */}
                <div className="hidden md:block space-y-2">
                  {unreadConversations.slice(0, 3).map((conv) => {
                    const isPriority = conv.lastMessage?.priority === "important";
                    return (
                    <div
                      key={conv.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md ${isPriority ? "border-red-300 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 hover:border-red-400" : "border-border bg-card hover:border-blue-300/40"}`}
                      onClick={() => navigate(`/restaurant/inbox?chat=${conv.id}`)}
                      data-testid={`unread-chat-desktop-${conv.id}`}
                    >
                      {isPriority && (
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30 shrink-0">
                          <Flame className="h-4 w-4 text-red-600" />
                        </div>
                      )}
                      {!isPriority && (
                      <Avatar className="h-9 w-9 shrink-0">
                        {conv.otherUser.profileImageUrl ? (
                          <AvatarImage src={conv.otherUser.profileImageUrl} alt={conv.otherUser.companyName || conv.otherUser.name} />
                        ) : null}
                        <AvatarFallback className="bg-blue-100 text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-400">
                          {(conv.otherUser.companyName || conv.otherUser.name || "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isPriority && (
                              <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            )}
                            <span className={`text-sm font-semibold truncate ${isPriority ? "text-red-700 dark:text-red-400" : ""}`}>
                              {conv.otherUser.companyName || conv.otherUser.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {conv.lastMessage?.createdAt && format(new Date(conv.lastMessage.createdAt), "HH:mm", { locale: dateLocale })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-xs truncate flex-1 ${isPriority ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                            {getMessagePreview(conv)}
                          </p>
                          <Badge className={`text-white text-[9px] px-1.5 py-0 min-w-[18px] flex items-center justify-center shrink-0 ${isPriority ? "bg-red-600" : "bg-blue-600"}`}>
                            {conv.unreadCount}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                  {totalUnread > 3 && (
                    <p className="text-xs text-muted-foreground text-center pt-1" data-testid="text-more-unread">
                      +{totalUnread - 3} {t("restaurantHome", "moreUnread")}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                  <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{t("restaurantHome", "noUnreadMessages")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("restaurantHome", "noUnreadMessagesDesc")}</p>
              </div>
            )}
            </div>
          </div>
          )},
          { id: "active-promotions", content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <h2 className="text-lg md:text-xl font-bold" data-testid="text-active-promotions-title">
                    {t("restaurantHome", "activePromotions")}
                  </h2>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {t("restaurantHome", "activePromotionsDesc")}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/catalog?promotions=true" data-testid="link-view-all-promotions">{t("restaurantHome", "allPromotions")}</Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">
              {productsLoading ? (
                <div className="flex gap-3 overflow-hidden">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="min-w-[180px] h-[260px] rounded-xl shrink-0" />
                  ))}
                </div>
              ) : promoProducts.length > 0 ? (
                <div className="relative group">
                  {promoProducts.length > 3 && (
                    <>
                      <button
                        onClick={() => scrollPromos("left")}
                        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid="button-scroll-promos-left"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => scrollPromos("right")}
                        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 z-10 h-8 w-8 rounded-full bg-background border border-border shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid="button-scroll-promos-right"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <div
                    ref={promoScrollRef}
                    className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {promoProducts.map((product) => {
                      const promo = product.activePromotion!;
                      const originalPrice = parseFloat(product.price);
                      const discountedPrice = originalPrice * (1 - promo.discountPercent / 100);
                      const minQty = getMinOrderQty(product);

                      return (
                        <div
                          key={product.id}
                          className="min-w-[160px] w-[160px] md:min-w-[150px] md:w-[150px] shrink-0 snap-start rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:shadow-md hover:border-green-300/40 ring-1 ring-green-400/30"
                          data-testid={`promo-card-${product.id}`}
                        >
                          <div className="relative">
                            {product.imageUrl ? (
                              <div className="w-full aspect-[4/3] bg-muted">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center">
                                <Package className="h-8 w-8 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="absolute top-1.5 left-1.5 flex items-center justify-center rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
                              -{promo.discountPercent}%
                            </div>
                          </div>
                          <div className="p-2.5 flex flex-col">
                            {product.inStock ? (
                              <span className="text-[10px] font-medium text-green-700 dark:text-green-400" data-testid={`text-promo-stock-${product.id}`}>
                                {t("common", "available")}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-red-600 dark:text-red-400" data-testid={`text-promo-stock-${product.id}`}>
                                {t("common", "unavailable")}
                              </span>
                            )}
                            <div className="flex items-center gap-1.5 mb-1" data-testid={`text-promo-supplier-${product.id}`}>
                              <Avatar className="h-5 w-5 shrink-0">
                                {product.supplier?.profileImageUrl ? (
                                  <AvatarImage src={product.supplier.profileImageUrl} alt={product.supplier?.companyName || product.supplier?.name} />
                                ) : null}
                                <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                                  {(product.supplier?.companyName || product.supplier?.name || "?").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-bold text-foreground truncate">
                                {product.supplier?.companyName || product.supplier?.name}
                              </span>
                            </div>
                            <h3 className="font-medium text-xs text-muted-foreground truncate" data-testid={`text-promo-name-${product.id}`}>{product.name}</h3>
                            <div className="flex items-baseline gap-1 mt-1 flex-wrap">
                              <span className="text-[10px] text-muted-foreground line-through" data-testid={`text-promo-original-price-${product.id}`}>{originalPrice.toFixed(2)}€</span>
                              <span className="font-bold text-sm text-green-600 dark:text-green-400" data-testid={`text-promo-discounted-price-${product.id}`}>{discountedPrice.toFixed(2)}€</span>
                              <span className="text-[10px] text-muted-foreground">/{product.unit}</span>
                            </div>
                            {promo.endDate && (() => {
                              const now = new Date();
                              const end = new Date(promo.endDate);
                              const daysLeft = differenceInDays(end, now);
                              const hoursLeft = differenceInHours(end, now);
                              let remainingText = "";
                              if (daysLeft <= 0 && hoursLeft > 0) {
                                remainingText = t("common", "endsToday");
                              } else if (daysLeft === 1) {
                                remainingText = t("common", "oneDay");
                              } else if (daysLeft > 1) {
                                remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
                              } else {
                                remainingText = t("common", "endsSoon");
                              }
                              return (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Clock className="h-2.5 w-2.5 text-green-600 dark:text-green-400 shrink-0" />
                                  <span className="text-[9px] text-green-600 dark:text-green-400 font-medium truncate">
                                    {remainingText}
                                  </span>
                                </div>
                              );
                            })()}
                            <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                              <QuantityInput
                                value={quantities[product.id] || minQty}
                                onChange={(val) => setQuantities(prev => ({ ...prev, [product.id]: val }))}
                                min={minQty}
                                disabled={!product.inStock}
                                size="sm"
                                testIdPrefix={`promo-qty-${product.id}`}
                              />
                              <Button
                                variant={addedProductIds.has(product.id) ? "default" : "outline"}
                                size="sm"
                                className={`gap-0.5 text-[10px] h-6 flex-1 min-w-0 ${
                                  addedProductIds.has(product.id)
                                    ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate animate-cart-added"
                                    : "transition-all duration-200"
                                }`}
                                disabled={!product.inStock || addToCartMutation.isPending}
                                onClick={() => handleAddToCart(product)}
                                data-testid={`button-promo-add-to-cart-${product.id}`}
                              >
                                {addedProductIds.has(product.id) ? (
                                  <Check className="h-3 w-3 shrink-0 animate-cart-check" />
                                ) : (
                                  <ShoppingCart className="h-3 w-3 shrink-0" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                    <Tag className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{t("restaurantHome", "noActivePromotions")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("restaurantHome", "noActivePromotionsDesc")}</p>
                </div>
              )}
            </div>
          </div>
          )},
          { id: "order-templates", content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <h2 className="text-lg md:text-xl font-bold" data-testid="text-templates-title">
                    {lang === "de" ? "Bestellvorlagen" : "Modelli d'ordine"}
                  </h2>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {lang === "de" ? "Wiederkehrende Bestellungen" : "Ordini ricorrenti"}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/orders?tab=templates" data-testid="link-view-all-templates">{t("common", "all")}</Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">
              {templatesLoading ? (
                <div className="flex gap-3 overflow-hidden md:flex-col">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="min-w-[200px] h-[140px] md:min-w-0 md:h-24 rounded-xl shrink-0" />
                  ))}
                </div>
              ) : templates && templates.length > 0 ? (
                <>
                  {/* Mobile: horizontal scroll template cards */}
                  <div
                    className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:hidden"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
                  >
                    {templates.slice(0, 5).map((tmpl) => {
                      const inStockItems = tmpl.items.filter(i => i.product.inStock !== false);
                      const outOfStockCount = tmpl.items.length - inStockItems.length;
                      const total = inStockItems.reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0);

                      return (
                        <div
                          key={tmpl.id}
                          className="min-w-[200px] w-[200px] shrink-0 snap-start rounded-2xl border border-border bg-card p-4 cursor-pointer transition-all active:scale-[0.98]"
                          onClick={() => openTemplateWizard(tmpl)}
                          data-testid={`template-card-${tmpl.id}`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 shrink-0">
                              <ClipboardList className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            </div>
                            {outOfStockCount > 0 && (
                              <Badge variant="outline" className="text-[10px] border-red-200 text-red-500 px-1 ml-auto">
                                {outOfStockCount} {lang === "de" ? "n.v." : "n.d."}
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm font-semibold truncate" data-testid={`text-template-name-${tmpl.id}`}>{tmpl.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tmpl.items.length} {t("common", "items")}
                          </p>

                          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
                            <span className="text-base font-bold tabular-nums">{total.toFixed(2)}&euro;</span>
                            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop: expandable stacked list */}
                  <div className="hidden md:block space-y-2">
                    {templates.slice(0, 3).map((tmpl) => {
                      const inStockItems = tmpl.items.filter(i => i.product.inStock !== false);
                      const outOfStockCount = tmpl.items.length - inStockItems.length;
                      const total = inStockItems.reduce((sum, i) => sum + parseFloat(i.product.price) * i.quantity, 0);
                      const isExpanded = expandedTemplateId === tmpl.id;

                      return (
                        <div
                          key={tmpl.id}
                          className="rounded-xl border border-border bg-card overflow-hidden transition-all"
                          data-testid={`template-card-desktop-${tmpl.id}`}
                        >
                          <div
                            className="flex items-center justify-between gap-2 p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedTemplateId(isExpanded ? null : tmpl.id)}
                            data-testid={`template-header-${tmpl.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <ClipboardList className="h-4 w-4 text-orange-500 shrink-0" />
                              <h3 className="text-sm font-semibold truncate">{tmpl.name}</h3>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-muted-foreground">
                                {tmpl.items.length} {t("common", "items")}
                              </span>
                              <span className="text-sm font-bold tabular-nums">{total.toFixed(2)}&euro;</span>
                              {outOfStockCount > 0 && (
                                <Badge variant="outline" className="text-[10px] border-red-200 text-red-500 px-1">
                                  {outOfStockCount}
                                </Badge>
                              )}
                              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-2.5 pb-2.5 space-y-2 border-t border-border/50 pt-2">
                              {(() => {
                                const supplierGroups = new Map<string, { name: string; items: typeof tmpl.items }>();
                                for (const item of tmpl.items) {
                                  const sid = item.product.supplierId;
                                  const sname = item.product.supplier?.companyName || item.product.supplier?.name || "";
                                  if (!supplierGroups.has(sid)) supplierGroups.set(sid, { name: sname, items: [] });
                                  supplierGroups.get(sid)!.items.push(item);
                                }
                                return Array.from(supplierGroups.entries()).map(([sid, group]) => (
                                  <div key={sid}>
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{group.name}</p>
                                    <div className="space-y-0.5 mt-0.5">
                                      {group.items.map((item) => {
                                        const oos = item.product.inStock === false;
                                        return (
                                          <div key={item.id} className={`flex items-center gap-2 text-xs ${oos ? "text-muted-foreground/50 line-through" : ""}`} data-testid={`template-item-${item.id}`}>
                                            {item.product.imageUrl ? (
                                              <img src={item.product.imageUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                                            ) : (
                                              <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                                                <Package className="h-3 w-3 text-muted-foreground" />
                                              </div>
                                            )}
                                            <span className="truncate flex-1">
                                              <span className="font-medium">{item.quantity}x</span> {item.product.name}
                                            </span>
                                            <span className="shrink-0 ml-2 tabular-nums">{(parseFloat(item.product.price) * item.quantity).toFixed(2)}&euro;</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ));
                              })()}
                              <div className="flex items-center justify-end gap-2 pt-1.5">
                                <Button
                                  size="sm"
                                  className="text-xs h-7 gap-1"
                                  disabled={inStockItems.length === 0}
                                  onClick={(e) => { e.stopPropagation(); openTemplateWizard(tmpl); }}
                                  data-testid={`button-order-template-${tmpl.id}`}
                                >
                                  <ShoppingCart className="h-3 w-3" />
                                  {lang === "de" ? "Bestellen" : "Ordina"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {templates.length > 3 && (
                      <Button variant="outline" className="w-full text-xs h-8" asChild>
                        <Link href="/restaurant/orders?tab=templates" data-testid="link-more-templates">
                          {lang === "de" ? `Alle ${templates.length} Vorlagen anzeigen` : `Mostra tutti ${templates.length} i modelli`}
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted/50 mb-3">
                    <ClipboardList className="h-6 w-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {lang === "de" ? "Keine Vorlagen" : "Nessun modello"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {lang === "de" ? "Erstellen Sie Vorlagen fuer wiederkehrende Bestellungen" : "Crea modelli per ordini ricorrenti"}
                  </p>
                  <Button variant="outline" size="sm" className="mt-3 text-xs" asChild>
                    <Link href="/restaurant/orders?tab=templates" data-testid="link-create-template">
                      {lang === "de" ? "Vorlage erstellen" : "Crea modello"}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
          )},
          { id: "cost-analysis", content: (
          <div className="md:rounded-xl md:border md:border-border md:bg-card md:shadow-sm" data-testid="card-cost-analysis-home">
            <div className="flex items-center justify-between gap-2 mb-3 md:mb-0 md:p-5 md:pb-4">
              <div className="flex items-center gap-2.5">
                <div>
                  <h2 className="text-lg md:text-xl font-bold" data-testid="text-cost-analysis-title">
                    {t("costAnalysis", "title")}
                  </h2>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    {(() => {
                      const monthNames = lang === "de"
                        ? ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]
                        : ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
                      const [y, m] = costCurrentMonth.split("-");
                      return `${monthNames[parseInt(m) - 1]} ${y}`;
                    })()}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="text-xs md:text-sm shrink-0" asChild>
                <Link href="/restaurant/cost-analysis" data-testid="link-cost-analysis-page">
                  {t("common", "all")}
                </Link>
              </Button>
            </div>
            <div className="md:px-5 md:pb-5">
              {costLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : (
                <div className="space-y-3">
                  {costAnalysis && costAnalysis.totalOvernights > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30" data-testid="kpi-cost-per-guest">
                        <div className="flex items-center gap-1.5 text-[10px] text-purple-600 dark:text-purple-400 font-medium mb-0.5">
                          <Calculator className="h-3 w-3" />
                          {t("costAnalysis", "costPerGuest")}
                        </div>
                        <div className="text-lg font-bold">{Number(costAnalysis.costPerGuest).toFixed(2)} EUR</div>
                        {parseFloat(costAnalysis.targetCost) > 0 && (() => {
                          const dev = parseFloat(costAnalysis.percentageDeviation);
                          const diff = parseFloat(costAnalysis.difference);
                          const isOk = Math.abs(dev) <= 5;
                          const isOver = diff > 0;
                          return (
                            <div className={`flex items-center gap-1 text-[10px] mt-0.5 ${isOk ? "text-green-600" : isOver ? "text-red-600" : "text-green-600"}`}>
                              {isOver ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                              {isOk ? t("costAnalysis", "onTarget") : isOver ? t("costAnalysis", "aboveTarget") : t("costAnalysis", "belowTarget")} ({dev > 0 ? "+" : ""}{dev.toFixed(1)}%)
                            </div>
                          );
                        })()}
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted/50 border" data-testid="kpi-target-cost">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium mb-0.5">
                          <Target className="h-3 w-3" />
                          {t("costAnalysis", "targetCost")}
                        </div>
                        <div className="text-lg font-bold">{parseFloat(costAnalysis.targetCost) > 0 ? `${parseFloat(costAnalysis.targetCost).toFixed(2)} EUR` : "--"}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted/50 border" data-testid="kpi-total-costs">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium mb-0.5">
                          <Euro className="h-3 w-3" />
                          {t("costAnalysis", "totalCosts")}
                        </div>
                        <div className="text-lg font-bold">{Number(costAnalysis.totalCosts).toFixed(2)}</div>
                        <div className="text-[10px] text-muted-foreground">{costAnalysis.orderCount} {t("costAnalysis", "orderCount")}</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted/50 border" data-testid="kpi-overnights">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium mb-0.5">
                          <Users className="h-3 w-3" />
                          {t("costAnalysis", "totalOvernights")}
                        </div>
                        <div className="text-lg font-bold">{costAnalysis.totalOvernights}</div>
                        <div className="text-[10px] text-muted-foreground">{costAnalysis.daysWithData} {t("costAnalysis", "daysRecorded")}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-muted/30 border text-center">
                      <Users className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">{t("costAnalysis", "noDataDesc")}</p>
                    </div>
                  )}

                  <div className="border-t pt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">{t("costAnalysis", "enterOvernights")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={costStayDate}
                        onChange={(e) => setCostStayDate(e.target.value)}
                        className="flex-1 h-8 text-xs"
                        data-testid="input-home-stay-date"
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder={t("costAnalysis", "guests")}
                        value={costStayGuests}
                        onChange={(e) => setCostStayGuests(e.target.value)}
                        className="w-20 h-8 text-xs"
                        data-testid="input-home-stay-guests"
                      />
                      <Button
                        size="sm"
                        className="h-8 px-2.5"
                        disabled={!costStayGuests || !costStayDate || saveCostStayMutation.isPending || isNaN(parseInt(costStayGuests)) || parseInt(costStayGuests) < 1}
                        onClick={() => {
                          const guests = Math.max(1, Math.floor(Number(costStayGuests)));
                          if (!isNaN(guests) && guests > 0 && costStayDate && currentUser?.id) {
                            saveCostStayMutation.mutate({
                              restaurantId: currentUser.id,
                              date: costStayDate,
                              overnightStays: guests,
                            });
                          }
                        }}
                        data-testid="button-home-save-stay"
                      >
                        {saveCostStayMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </Button>
                    </div>

                    {todayEntry && (
                      <div className="mt-2 flex items-center justify-between gap-2 p-2 rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/30 text-xs">
                        <span className="text-green-700 dark:text-green-400 font-medium">
                          {lang === "de" ? "Heute" : "Oggi"}: {todayEntry.overnightStays} {t("costAnalysis", "guests")}
                        </span>
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
          )},
        ]}
      />

      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-home-order-detail">
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
                  <span className="ml-1">{getOrderStatus(detailOrder.status, lang)}</span>
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
                  {detailOrder.items?.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2.5 text-sm p-2 rounded-xl bg-muted/30" data-testid={`home-detail-item-${item.id}`}>
                      {item.productImageUrl ? (
                        <img src={item.productImageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 truncate">
                        <span className="font-medium">{item.quantity}x</span>{" "}
                        <span>{item.productName}</span>
                        <span className="text-muted-foreground ml-1">@ {item.unitPrice}€</span>
                      </div>
                      <span className="font-medium shrink-0 ml-2">{item.totalPrice}€</span>
                    </div>
                  ))}
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
                <span className="text-lg font-bold" data-testid="text-home-detail-total">{detailOrder.totalAmount}€</span>
              </div>

              <div>
                <Button variant="outline" className="w-full rounded-lg" asChild>
                  <Link href="/restaurant/orders" data-testid="link-go-to-orders">
                    {t("common", "all")} {t("common", "orders")}
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!wizardTemplate} onOpenChange={(open) => { if (!open && wizardStep !== "done") setWizardTemplate(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0" data-testid="dialog-template-wizard">
          <DialogHeader className="sr-only">
            <DialogTitle>{wizardTemplate?.name}</DialogTitle>
            <DialogDescription>{lang === "de" ? "Bestellung aus Vorlage" : "Ordine da modello"}</DialogDescription>
          </DialogHeader>

          {wizardStep === "done" ? (
            <div className="flex flex-col items-center justify-center py-16 px-6" data-testid="wizard-step-done">
              <div className="relative mb-6">
                <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-wizard-circle">
                  <Check className="h-12 w-12 text-green-600 dark:text-green-400 animate-wizard-check" />
                </div>
                <div className="absolute inset-0 h-24 w-24 rounded-full border-4 border-green-400 animate-wizard-ring" />
              </div>
              <h3 className="text-xl font-bold text-center mb-2 animate-wizard-fade-in">
                {lang === "de" ? "Zum Warenkorb hinzugefuegt!" : "Aggiunto al carrello!"}
              </h3>
              <p className="text-sm text-muted-foreground text-center animate-wizard-fade-in-delay">
                {lang === "de" ? "Sie werden zum Warenkorb weitergeleitet..." : "Verrai reindirizzato al carrello..."}
              </p>
              <div className="mt-6 flex gap-1 animate-wizard-fade-in-delay">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "200ms" }} />
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-bounce" style={{ animationDelay: "400ms" }} />
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-500/10 shrink-0">
                    <ClipboardList className="h-5 w-5 text-orange-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-base truncate" data-testid="wizard-template-name">{wizardTemplate?.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {wizardStep === "items" && (lang === "de" ? "Schritt 1 von 2 — Produkte" : "Passo 1 di 2 — Prodotti")}
                      {wizardStep === "browse_supplier" && (lang === "de" ? "Haendler waehlen" : "Scegli commerciante")}
                      {wizardStep === "browse_products" && (lang === "de" ? "Produkte hinzufuegen" : "Aggiungi prodotti")}
                      {wizardStep === "review" && (lang === "de" ? "Schritt 2 von 2 — Warenkorb" : "Passo 2 di 2 — Carrello")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 mb-2">
                  <div className={`h-1 flex-1 rounded-full transition-colors ${["items", "browse_supplier", "browse_products", "review"].includes(wizardStep) ? "bg-primary" : "bg-muted"}`} />
                  <div className={`h-1 flex-1 rounded-full transition-colors ${wizardStep === "review" ? "bg-primary" : "bg-muted"}`} />
                </div>
              </div>

              {wizardStep === "items" && wizardTemplate && (
                <div className="px-5 pb-5 space-y-3" data-testid="wizard-step-items">
                  <p className="text-sm font-medium">
                    {lang === "de" ? "Produkte & Mengen" : "Prodotti e quantita"}
                  </p>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {Object.entries(wizardQuantities).map(([pid, qty]) => {
                      const prod = wizardProducts[pid];
                      if (!prod || qty <= 0) return null;
                      return (
                        <div
                          key={pid}
                          className="flex items-center gap-2.5 p-2.5 rounded-lg border border-border bg-card"
                          data-testid={`wizard-item-${pid}`}
                        >
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{prod.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {prod.supplier?.companyName || prod.supplier?.name}
                              <span className="ml-1">{parseFloat(prod.price).toFixed(2)}€/{prod.unit}</span>
                            </p>
                          </div>
                          <QuantityInput
                            value={qty}
                            onChange={(val) => {
                              setWizardQuantities(prev => ({ ...prev, [pid]: val }));
                              setWizardTemplateChanged(true);
                            }}
                            min={prod.minOrderQuantity && prod.minOrderQuantity > 1 ? prod.minOrderQuantity : 1}
                            size="sm"
                            testIdPrefix={`wizard-qty-${pid}`}
                          />
                          <button
                            onClick={() => {
                              setWizardQuantities(prev => { const n = { ...prev }; delete n[pid]; return n; });
                              setWizardProducts(prev => { const n = { ...prev }; delete n[pid]; return n; });
                              setWizardTemplateChanged(true);
                            }}
                            className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            data-testid={`wizard-remove-${pid}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                    {Object.keys(wizardQuantities).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {lang === "de" ? "Keine Produkte. Fuegen Sie welche hinzu." : "Nessun prodotto. Aggiungine alcuni."}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    onClick={() => {
                      setWizardBrowseSupplierId(null);
                      setWizardBrowseSearch("");
                      setWizardStep("browse_supplier");
                    }}
                    data-testid="wizard-add-products"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {lang === "de" ? "Produkte hinzufuegen" : "Aggiungi prodotti"}
                  </Button>
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <div>
                      <span className="text-xs text-muted-foreground">{lang === "de" ? "Geschaetzt" : "Stimato"}: </span>
                      <span className="text-sm font-bold">{wizardTotalEstimate.toFixed(2)}€</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setWizardStep("review")}
                      disabled={Object.keys(wizardQuantities).length === 0}
                      data-testid="wizard-next-step"
                    >
                      {lang === "de" ? "Weiter" : "Avanti"}
                      <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === "browse_supplier" && (
                <div className="px-5 pb-5 space-y-3" data-testid="wizard-step-browse-supplier">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setWizardStep("items")} data-testid="wizard-back-from-supplier">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <p className="text-sm font-medium">
                      {lang === "de" ? "Haendler waehlen" : "Scegli commerciante"}
                    </p>
                  </div>
                  <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                    {wizardSuppliers.map((s) => (
                      <button
                        key={s.id}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all text-left"
                        onClick={() => {
                          setWizardBrowseSupplierId(s.id);
                          setWizardBrowseSearch("");
                          setWizardStep("browse_products");
                        }}
                        data-testid={`wizard-supplier-${s.id}`}
                      >
                        <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 shrink-0">
                          <ShoppingBag className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {products?.filter(p => p.supplierId === s.id && p.inStock !== false).length || 0} {lang === "de" ? "Produkte" : "prodotti"}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                    {wizardSuppliers.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {lang === "de" ? "Keine Haendler verfuegbar" : "Nessun commerciante disponibile"}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {wizardStep === "browse_products" && (
                <div className="px-5 pb-5 space-y-3" data-testid="wizard-step-browse-products">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setWizardStep("browse_supplier")} data-testid="wizard-back-from-products">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <p className="text-sm font-medium truncate">
                      {wizardSuppliers.find(s => s.id === wizardBrowseSupplierId)?.name}
                    </p>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder={lang === "de" ? "Produkt suchen..." : "Cerca prodotto..."}
                      value={wizardBrowseSearch}
                      onChange={(e) => setWizardBrowseSearch(e.target.value)}
                      className="pl-8 h-9 text-sm"
                      data-testid="wizard-browse-search"
                    />
                  </div>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {wizardBrowseProducts.map((prod) => {
                      const alreadyAdded = wizardQuantities[prod.id] !== undefined && wizardQuantities[prod.id] > 0;
                      const hasPromo = !!prod.activePromotion;
                      const price = parseFloat(prod.price);
                      const discounted = hasPromo ? price * (1 - prod.activePromotion!.discountPercent / 100) : price;
                      return (
                        <div
                          key={prod.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${
                            alreadyAdded ? "border-green-400 bg-green-50/50 dark:bg-green-900/20" : "border-border bg-card"
                          }`}
                          data-testid={`wizard-browse-item-${prod.id}`}
                        >
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{prod.name}</p>
                              {hasPromo && (
                                <Badge variant="outline" className="text-[9px] border-green-300 text-green-600 px-1 py-0 shrink-0">
                                  -{prod.activePromotion!.discountPercent}%
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {hasPromo ? (
                                <><span className="line-through">{price.toFixed(2)}€</span> <span className="text-green-600 font-medium">{discounted.toFixed(2)}€</span></>
                              ) : (
                                <>{price.toFixed(2)}€</>
                              )}
                              /{prod.unit}
                            </p>
                          </div>
                          {alreadyAdded ? (
                            <QuantityInput
                              value={wizardQuantities[prod.id]}
                              onChange={(val) => {
                                if (val <= 0) {
                                  setWizardQuantities(prev => { const n = { ...prev }; delete n[prod.id]; return n; });
                                  setWizardProducts(prev => { const n = { ...prev }; delete n[prod.id]; return n; });
                                } else {
                                  setWizardQuantities(prev => ({ ...prev, [prod.id]: val }));
                                }
                                setWizardTemplateChanged(true);
                              }}
                              min={0}
                              size="sm"
                              testIdPrefix={`wizard-browse-qty-${prod.id}`}
                            />
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1 text-xs shrink-0"
                              onClick={() => {
                                const minQ = prod.minOrderQuantity && prod.minOrderQuantity > 1 ? prod.minOrderQuantity : 1;
                                setWizardQuantities(prev => ({ ...prev, [prod.id]: minQ }));
                                setWizardProducts(prev => ({ ...prev, [prod.id]: prod }));
                                setWizardTemplateChanged(true);
                              }}
                              data-testid={`wizard-browse-add-${prod.id}`}
                            >
                              <Plus className="h-3 w-3" />
                              {lang === "de" ? "Hinzufuegen" : "Aggiungi"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {wizardBrowseProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {lang === "de" ? "Keine Produkte gefunden" : "Nessun prodotto trovato"}
                      </p>
                    )}
                  </div>
                  <div className="pt-2 border-t border-border">
                    <Button size="sm" className="w-full" onClick={() => setWizardStep("items")} data-testid="wizard-done-adding">
                      {lang === "de" ? "Fertig" : "Fatto"}
                    </Button>
                  </div>
                </div>
              )}

              {wizardStep === "review" && (
                <div className="px-5 pb-5 space-y-3" data-testid="wizard-step-review">
                  <p className="text-sm font-medium">
                    {lang === "de" ? "Bestelluebersicht" : "Riepilogo ordine"}
                  </p>
                  <div className="space-y-3 max-h-[35vh] overflow-y-auto">
                    {Object.entries(wizardItemsBySupplier).map(([sId, group]) => (
                      <div key={sId} className="rounded-lg border border-border overflow-hidden">
                        <div className="bg-muted/50 px-3 py-2 flex items-center gap-2">
                          <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold">{group.supplierName}</span>
                        </div>
                        <div className="divide-y divide-border">
                          {group.items.map(({ productId, product: prod, qty }) => {
                            const itemPrice = parseFloat(prod.price);
                            const itemFinal = prod.activePromotion ? itemPrice * (1 - prod.activePromotion.discountPercent / 100) : itemPrice;
                            return (
                              <div key={productId} className="flex items-center gap-2 px-3 py-2">
                                <span className="text-xs font-medium text-primary w-7 shrink-0">{qty}x</span>
                                <span className="text-xs truncate flex-1">{prod.name}</span>
                                <span className="text-xs font-medium shrink-0">
                                  {(itemFinal * qty).toFixed(2)}€
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {wizardTemplateChanged && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-2" data-testid="wizard-save-template-section">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        {lang === "de" ? "Die Bestellung wurde geaendert. Vorlage aktualisieren?" : "L'ordine e stato modificato. Aggiornare il modello?"}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-8 gap-1"
                          onClick={() => handleWizardSaveTemplate("overwrite")}
                          disabled={wizardSavingTemplate}
                          data-testid="wizard-save-overwrite"
                        >
                          {wizardSavingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          {lang === "de" ? "Ueberschreiben" : "Sovrascrivi"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs h-8 gap-1"
                          onClick={() => handleWizardSaveTemplate("new")}
                          disabled={wizardSavingTemplate}
                          data-testid="wizard-save-new"
                        >
                          {wizardSavingTemplate ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          {lang === "de" ? "Neue Vorlage" : "Nuovo modello"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => setWizardStep("items")} data-testid="wizard-back-step">
                      {lang === "de" ? "Zurueck" : "Indietro"}
                    </Button>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold">{wizardTotalEstimate.toFixed(2)}€</span>
                      <Button
                        size="sm"
                        onClick={handleWizardSubmit}
                        disabled={wizardSubmitting || Object.keys(wizardQuantities).length === 0}
                        className="gap-1"
                        data-testid="wizard-submit"
                      >
                        {wizardSubmitting ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <ShoppingCart className="h-3.5 w-3.5" />
                            {lang === "de" ? "In den Warenkorb" : "Aggiungi al carrello"}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
