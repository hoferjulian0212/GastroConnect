import { MobilePageHeader } from "@/components/mobile";
import { useConfetti } from "@/hooks/use-confetti";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ShoppingCart, Trash2, Package, ArrowRight, CalendarDays, Truck, Tag, CheckCircle2, ShoppingBag, ClipboardList, Send, Loader2, Clock, StickyNote, AlertCircle, Check, ChevronLeft, MapPin, Receipt, Leaf } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import QuantityInput from "@/components/QuantityInput";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatOrderNumber, type CartItemWithProduct, type Promotion } from "@shared/schema";
import type { LocalImpact } from "@shared/localImpact";
import { summarizeLocalImpact, unavailableLocalImpact } from "@shared/localImpact";
import { can } from "@shared/permissions";
import { ProductImage } from "@/components/ProductImage";
import { checkoutFingerprint, clearPendingCheckoutKey, getPendingCheckoutKey } from "@/lib/checkoutIdempotency";

type CartItemWithPromotion = CartItemWithProduct & { product: CartItemWithProduct["product"] & { localImpact?: LocalImpact }; activePromotion?: Promotion | null };

type WheelOption = { value: string; label: string };

function WheelDatePicker({
  options,
  value,
  onChange,
  testId,
}: {
  options: WheelOption[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ITEM_H = 40;
  const VISIBLE = 5;
  const HEIGHT = ITEM_H * VISIBLE;
  const PAD = (HEIGHT - ITEM_H) / 2;
  const timer = useRef<number | null>(null);
  const lastEmitted = useRef<string>(value);

  useEffect(() => {
    if (!ref.current) return;
    const idx = Math.max(0, options.findIndex(o => o.value === value));
    ref.current.scrollTop = idx * ITEM_H;
    lastEmitted.current = value;
  }, [value, options]);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(options.length - 1, idx));
      const targetTop = clamped * ITEM_H;
      if (Math.abs(ref.current.scrollTop - targetTop) > 1) {
        ref.current.scrollTo({ top: targetTop, behavior: "smooth" });
      }
      const next = options[clamped]?.value;
      if (next && next !== lastEmitted.current) {
        lastEmitted.current = next;
        onChange(next);
      }
    }, 120);
  }, [options, onChange]);

  return (
    <div className="relative select-none" style={{ height: HEIGHT }} data-testid={testId}>
      <div
        className="absolute inset-x-0 pointer-events-none rounded-xl border-y border-border bg-muted/40"
        style={{ top: PAD, height: ITEM_H }}
      />
      <div
        className="absolute inset-x-0 top-0 pointer-events-none z-10"
        style={{
          height: PAD,
          background: "linear-gradient(to bottom, hsl(var(--background)) 0%, hsla(var(--background)/0) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
        style={{
          height: PAD,
          background: "linear-gradient(to top, hsl(var(--background)) 0%, hsla(var(--background)/0) 100%)",
        }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: "y mandatory" }}
      >
        <div style={{ height: PAD }} />
        {options.map((o) => {
          const isActive = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                const idx = options.findIndex(x => x.value === o.value);
                if (ref.current && idx >= 0) {
                  ref.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
                }
                if (o.value !== lastEmitted.current) {
                  lastEmitted.current = o.value;
                  onChange(o.value);
                }
              }}
              className={`w-full snap-center flex items-center justify-center text-center transition-all ${
                isActive ? "text-foreground font-semibold text-[15px]" : "text-muted-foreground text-[13px]"
              }`}
              style={{ height: ITEM_H, scrollSnapAlign: "center" }}
              data-testid={`wheel-option-${o.value}`}
            >
              {o.label}
            </button>
          );
        })}
        <div style={{ height: PAD }} />
      </div>
    </div>
  );
}
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { format, addDays, startOfDay, parse } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { useMobileKeyboardInset } from "@/hooks/use-sticky-action-bar";

function extractErrorMessage(err: unknown): string | null {
  const raw = (err as { message?: string })?.message;
  if (!raw) return null;
  // apiRequest throws "<status>: <body>"; body is usually JSON like { message }.
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (parsed?.message) return parsed.message as string;
      if (parsed?.error) return parsed.error as string;
    } catch {
      /* fall through */
    }
  }
  return raw;
}

export default function RestaurantCart() {
  const { currentUser, currentMember } = useUser();
  const canPlaceOrder = !currentMember || can(currentMember.role, "orders.create");
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const fireConfetti = useConfetti();
  useMobileKeyboardInset();
  const [orderNotes, setOrderNotes] = useState<Record<string, string>>({});
  const [deliveryOptions, setDeliveryOptions] = useState<Record<string, "asap" | "date">>({});
  const [selectedDeliveryDates, setSelectedDeliveryDates] = useState<Record<string, string>>({});
  const [calendarOpen, setCalendarOpen] = useState<Record<string, boolean>>({});
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderId: string;
    orderUuid: string | null;
    total: string;
    itemCount: number;
    suppliers: string[];
    orders: { id: string; orderNumber: string; supplierName: string }[];
    deliveryDate: string | null;
    notes: string;
    createdAt: string;
  } | null>(null);
  const [sendingSupplier, setSendingSupplier] = useState<string | null>(null);
  const [mobileStep, setMobileStep] = useState<"preview" | "summary">("summary");
  const [mobileValidationError, setMobileValidationError] = useState<string | null>(null);
  const [preConfirmDialog, setPreConfirmDialog] = useState<{
    mode: "all" | "single";
    supplierId?: string;
    orderCount: number;
    supplierName: string;
    items: { name: string; quantity: number; price: string; unit: string }[];
    total: string;
    deliveryDate: string | null;
    notes: string;
  } | null>(null);
  const { lang } = useLanguage();
  const t = useT(lang);
  const [location, setLocation] = useLocation();
  const fromTemplate = typeof window !== "undefined" && new URLSearchParams(location.split("?")[1] || window.location.search).get("from") === "template";

  const { data: cartItems, isLoading } = useQuery<CartItemWithPromotion[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: movData } = useQuery<Record<string, { minimumValue: string; zone: string | null }>>({
    queryKey: [`/api/minimum-order-values/for-restaurant?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) => {
      return apiRequest("PATCH", `/api/cart/${cartItemId}`, { quantity });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (cartItemId: string) => {
      return apiRequest("DELETE", `/api/cart/${cartItemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      toast({
        title: t("cart", "itemRemoved"),
        description: t("cart", "itemRemovedDesc"),
      });
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const perSupplierDates: Record<string, string | null> = {};
      for (const sid of supplierIds) {
        perSupplierDates[sid] = deliveryOptions[sid] === "date" && selectedDeliveryDates[sid] ? selectedDeliveryDates[sid] : null;
      }
      const fingerprint = checkoutFingerprint({
        scope: "all",
        items: (cartItems || []).map(item => ({
          id: item.id, productId: item.productId, supplierId: item.supplierId, quantity: item.quantity,
        })).sort((a, b) => a.id.localeCompare(b.id)),
        notes: orderNotes,
        deliveryDates: perSupplierDates,
      });
      const idempotencyKey = getPendingCheckoutKey(`gc-checkout:${currentUser?.id}:all`, fingerprint);
      const res = await apiRequest("POST", "/api/orders", {
        restaurantId: currentUser?.id,
        perSupplierNotes: orderNotes,
        deliveryDates: perSupplierDates,
        createdByUserId: currentUser?.id,
        actingMemberId: currentMember?.id,
      }, { headers: { "Idempotency-Key": idempotencyKey, "Idempotency-Request-Fingerprint": fingerprint } });
      return res.json();
    },
    onSuccess: (data) => {
      clearPendingCheckoutKey(`gc-checkout:${currentUser?.id}:all`);
      fireConfetti("center");
      const supplierNames = Object.values(groupedBySupplier || {}).map(g => g.supplier.companyName || g.supplier.name);
      const itemCount = cartItems?.length || 0;
      const orders = Array.isArray(data) ? data : [data];
      const orderId = orders.length === 1 ? formatOrderNumber(orders[0]) : orders.map(o => formatOrderNumber(o)).join(", ");
      const firstOrderUuid: string | null = (orders[0] as { id?: string } | undefined)?.id || null;
      const firstDeliveryDate = Object.values(selectedDeliveryDates).find(d => d) || null;
      const allNotes = Object.values(orderNotes).filter(n => n.trim()).join("; ");
      setOrderConfirmation({
        orderId: orderId || "",
        orderUuid: firstOrderUuid,
        total: grandTotal,
        itemCount,
        suppliers: supplierNames,
        orders: orders.map((order, index) => ({
          id: order.id,
          orderNumber: formatOrderNumber(order),
          supplierName: supplierNames[index] || "",
        })),
        deliveryDate: firstDeliveryDate,
        notes: allNotes,
        createdAt: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/orders/recent'] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: (err: unknown) => {
      const msg = extractErrorMessage(err) || t("cart", "orderError");
      setMobileValidationError(msg);
      toast({
        title: t("common", "error"),
        description: msg,
        variant: "destructive",
      });
    },
  });

  const createSupplierOrderMutation = useMutation({
    mutationFn: async (supplierId: string) => {
      setSendingSupplier(supplierId);
      const deliveryDate = deliveryOptions[supplierId] === "date" && selectedDeliveryDates[supplierId] ? selectedDeliveryDates[supplierId] : null;
      const fingerprint = checkoutFingerprint({
        scope: "supplier",
        supplierId,
        items: (groupedBySupplier?.[supplierId]?.items || []).map(item => ({
          id: item.id, productId: item.productId, quantity: item.quantity,
        })).sort((a, b) => a.id.localeCompare(b.id)),
        notes: orderNotes[supplierId] || "",
        deliveryDate,
      });
      const idempotencyKey = getPendingCheckoutKey(`gc-checkout:${currentUser?.id}:supplier:${supplierId}`, fingerprint);
      const res = await apiRequest("POST", "/api/orders", {
        restaurantId: currentUser?.id,
        supplierId,
        notes: orderNotes[supplierId] || "",
        requestedDeliveryDate: deliveryDate,
        createdByUserId: currentUser?.id,
        actingMemberId: currentMember?.id,
      }, { headers: { "Idempotency-Key": idempotencyKey, "Idempotency-Request-Fingerprint": fingerprint } });
      return res.json();
    },
    onSuccess: (data, supplierId) => {
      setSendingSupplier(null);
      clearPendingCheckoutKey(`gc-checkout:${currentUser?.id}:supplier:${supplierId}`);
      const supplierGroup = groupedBySupplier?.[supplierId];
      const supplierName = supplierGroup?.supplier.companyName || supplierGroup?.supplier.name || "";
      toast({
        title: t("cart", "orderSentTitle"),
        description: `${supplierName}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/orders?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/restaurant/stats', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/recent', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: [`/api/conversations?userId=${currentUser?.id}`] });
    },
    onError: (err: unknown) => {
      setSendingSupplier(null);
      const msg = extractErrorMessage(err) || t("cart", "orderError");
      setMobileValidationError(msg);
      toast({
        title: t("common", "error"),
        description: msg,
        variant: "destructive",
      });
    },
  });

  const supplierIds = useMemo(() => {
    if (!cartItems) return [];
    return Array.from(new Set(cartItems.map(item => item.supplierId)));
  }, [cartItems]);

  const supplierScheduleKey = supplierIds.sort().join(",");
  type DeliveryCandidate = { date: string; timeWindow: { from: string; to: string }; timeZone: string };
  const { data: deliveryCandidatesBySupplier } = useQuery<Record<string, DeliveryCandidate[]>>({
    queryKey: ["/api/delivery-constraints/candidates", supplierScheduleKey],
    queryFn: async () => {
      if (supplierIds.length === 0) return {};
      const results: Record<string, DeliveryCandidate[]> = {};
      await Promise.all(
        supplierIds.map(async (supplierId) => {
          const res = await fetch(`/api/delivery-constraints/candidates?supplierId=${supplierId}`);
          if (res.ok) {
            const body = await res.json();
            results[supplierId] = body.candidates ?? [];
          }
        })
      );
      return results;
    },
    enabled: !!currentUser?.id && supplierIds.length > 0,
  });

  const dateLocale = lang === "it" ? it : de;

  const perSupplierDeliveryDates = useMemo(() => {
    if (!deliveryCandidatesBySupplier) return {};
    const result: Record<string, { value: string; label: string }[]> = {};
    for (const sid of supplierIds) {
      result[sid] = (deliveryCandidatesBySupplier[sid] || []).map((candidate) => ({
        value: candidate.date,
        label: `${format(parse(candidate.date, "yyyy-MM-dd", new Date()), "EEEE, dd. MMMM yyyy", { locale: dateLocale })} (${candidate.timeWindow.from} - ${candidate.timeWindow.to})`,
      }));
    }
    return result;
  }, [deliveryCandidatesBySupplier, supplierIds, dateLocale]);

  useEffect(() => {
    if (mobileStep !== "summary") return;
    setDeliveryOptions(prev => {
      let optsChanged = false;
      const nextOpts = { ...prev };
      const nextDates: Record<string, string> = { ...selectedDeliveryDates };
      let datesChanged = false;
      for (const sid of supplierIds) {
        const allowedDates = (perSupplierDeliveryDates[sid] || []).map(d => d.value);
        const cur = nextOpts[sid];
        const curDate = nextDates[sid];
        if (cur === "date" && curDate && !allowedDates.includes(curDate)) {
          nextOpts[sid] = "asap";
          nextDates[sid] = "";
          optsChanged = true;
          datesChanged = true;
        }
      }
      if (datesChanged) setSelectedDeliveryDates(nextDates);
      return optsChanged ? nextOpts : prev;
    });
  }, [mobileStep, supplierIds, perSupplierDeliveryDates]); // eslint-disable-line react-hooks/exhaustive-deps

  const getEffectivePrice = (item: CartItemWithPromotion) => {
    const originalPrice = parseFloat(item.product.price);
    if (item.activePromotion) {
      return originalPrice * (1 - item.activePromotion.discountPercent / 100);
    }
    return originalPrice;
  };

  const groupedBySupplier = useMemo(() => {
    if (!cartItems) return undefined;
    const sorted = [...cartItems].sort((a, b) => a.id.localeCompare(b.id));
    const groups: Record<string, { supplier: typeof cartItems[0]["supplier"]; items: CartItemWithPromotion[] }> = {};
    for (const item of sorted) {
      if (!groups[item.supplierId]) {
        groups[item.supplierId] = { supplier: item.supplier, items: [] };
      }
      groups[item.supplierId].items.push(item);
    }
    return groups;
  }, [cartItems]);

  const calculateTotal = (items: CartItemWithPromotion[]) => {
    return items.reduce((total, item) => total + getEffectivePrice(item) * item.quantity, 0).toFixed(2);
  };

  const getSupplierMov = (supplierId: string): number => {
    if (!movData || !movData[supplierId]) return 0;
    return parseFloat(movData[supplierId].minimumValue) || 0;
  };

  const isBelowMov = (supplierId: string, items: CartItemWithPromotion[]): boolean => {
    const mov = getSupplierMov(supplierId);
    if (mov <= 0) return false;
    const total = items.reduce((sum, item) => sum + getEffectivePrice(item) * item.quantity, 0);
    return total < mov;
  };

  const grandTotal = cartItems?.reduce(
    (total, item) => total + getEffectivePrice(item) * item.quantity,
    0
  ).toFixed(2) || "0.00";

  const dateLocaleObj = lang === "it" ? it : de;

  if (orderConfirmation) {
    const trackHref = orderConfirmation.orderUuid
      ? `/restaurant/orders/${orderConfirmation.orderUuid}`
      : "/restaurant/orders";

    const successHeader = (
      <>
        <div className="relative mx-auto w-20 h-20">
          <span className="absolute inset-0 rounded-full bg-green-400/40 dark:bg-green-500/30 animate-wizard-ring" />
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 animate-wizard-circle">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400 animate-wizard-check" />
          </div>
        </div>

        <div className="space-y-2 animate-wizard-fade-in">
          <h1 className="m-type-display text-2xl font-bold" data-testid="text-order-sent-title">{t("cart", "orderSentTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("cart", "orderSentDesc")}</p>
        </div>
      </>
    );

    const detailsCard = (
      <Card className="text-left animate-wizard-fade-in-delay">
        <CardContent className="p-4 space-y-3">
          <div className="flex justify-between items-center gap-3 py-1">
            <span className="text-sm text-muted-foreground shrink-0">{t("cart", "orderNumber")}</span>
            <span className="text-sm font-mono font-medium truncate" data-testid="text-order-id">#{orderConfirmation.orderId}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center gap-3 py-1">
            <span className="text-sm text-muted-foreground shrink-0">{t("cart", "orderDate")}</span>
            <span className="text-sm font-medium shrink-0">{format(new Date(orderConfirmation.createdAt), "dd. MMM yyyy, HH:mm", { locale: dateLocaleObj })}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-start gap-4 py-1">
            <span className="text-sm text-muted-foreground shrink-0">{t("common", "suppliers")}</span>
            <div className="flex flex-col items-end gap-0.5">
              {orderConfirmation.orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/restaurant/orders/${order.id}`}
                  className="text-sm font-medium hover:underline"
                  data-testid={`link-confirmed-order-${order.id}`}
                >
                  #{order.orderNumber} · {order.supplierName}
                </Link>
              ))}
            </div>
          </div>
          <Separator />
          <div className="flex justify-between items-center gap-3 py-1">
            <span className="text-sm text-muted-foreground shrink-0">{t("common", "items")}</span>
            <span className="text-sm font-medium">{orderConfirmation.itemCount}</span>
          </div>
          <Separator />
          <div className="flex justify-between items-center gap-3 py-1">
            <span className="text-sm text-muted-foreground shrink-0">{t("cart", "deliveryDateLabel")}</span>
            <span className="text-sm font-medium text-right truncate">
              {orderConfirmation.deliveryDate
                ? format(new Date(orderConfirmation.deliveryDate), "dd. MMM yyyy", { locale: dateLocaleObj })
                : t("cart", "asapDelivery")}
            </span>
          </div>
          {orderConfirmation.notes && (
            <>
              <Separator />
              <div className="flex justify-between items-start gap-4 py-1">
                <span className="text-sm text-muted-foreground shrink-0">{t("cart", "notesLabel")}</span>
                <span className="text-sm text-right">{orderConfirmation.notes}</span>
              </div>
            </>
          )}
          <Separator />
          <div className="flex justify-between items-center gap-3 py-1">
            <span className="text-sm font-medium shrink-0">{t("common", "total")}</span>
            <span className="text-lg font-bold shrink-0" data-testid="text-order-total">{orderConfirmation.total}€</span>
          </div>
        </CardContent>
      </Card>
    );

    const trackButton = (
      <Button className="flex-1 gap-2" asChild>
        <Link href={trackHref} data-testid="link-track-order">
          <ClipboardList className="h-4 w-4" />
          {lang === "de" ? "Status verfolgen" : "Traccia stato"}
        </Link>
      </Button>
    );

    const homeButton = (
      <Button variant="outline" className="flex-1 gap-2" asChild>
        <Link href="/restaurant" data-testid="link-home">
          <Check className="h-4 w-4" />
          {lang === "de" ? "Zur Startseite" : "Vai alla home"}
        </Link>
      </Button>
    );

    if (isMobile) {
      return createPortal((
        <div
          className="fixed inset-0 z-[70] bg-background flex flex-col"
          data-testid="mobile-order-confirmation"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col items-center justify-center px-5 py-8 text-center">
            <div className="w-full max-w-md mx-auto space-y-6">
              {successHeader}
              {detailsCard}
            </div>
          </div>
          <div
            className="shrink-0 border-t border-border bg-background px-5 pt-3 flex flex-col gap-2 animate-wizard-fade-in-delay"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
          >
            {trackButton}
            {homeButton}
          </div>
        </div>
      ), document.body);
    }

    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md mx-auto text-center space-y-6">
          {successHeader}
          {detailsCard}
          <div className="flex flex-col sm:flex-row gap-3 animate-wizard-fade-in-delay">
            {trackButton}
            {homeButton}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
    <PullToRefreshWrapper
      onRefresh={async () => {
        await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && (key.startsWith("/api/cart") || key.startsWith("/api/minimum-order-values") || key.startsWith("/api/delivery-schedules"));
          },
        });
      }}
      className="space-y-4 md:space-y-6 md:pb-6 pb-[var(--mobile-cart-bottom-pad)]"
    >
      <MobilePageHeader
        title={lang === "de" ? "Warenkorb" : "Carrello"}
        subtitle={lang === "de" ? "Ihre ausgewählten Produkte" : "I tuoi prodotti selezionati"}
        testId="mobile-header-cart"
      />
      {cartItems && cartItems.length > 0 && can(currentMember?.role, "impact.analytics") && (() => {
        const impact = summarizeLocalImpact(cartItems
          .map((item) => ({ impact: item.product.localImpact ?? unavailableLocalImpact(), quantity: item.quantity })));
        return (
          <details className="rounded-xl border bg-card" data-testid="cart-impact-summary">
            <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2 text-sm font-semibold">
              <Leaf className="h-4 w-4 text-green-600" />
              {lang === "de" ? "Wirkung dieser Bestellung" : "Impatto di questo ordine"}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {impact.score === null ? (lang === "de" ? "Nicht verfügbar" : "Non disponibile") : `${impact.score}/100`}
              </span>
            </summary>
            <div className="border-t px-4 py-3 grid grid-cols-3 gap-3 text-center">
              {[
                [lang === "de" ? "Local" : "Locale", impact.localItemCount],
                [lang === "de" ? "Saisonal" : "Stagionale", impact.seasonalItemCount],
                ["Low Waste", impact.lowWasteItemCount],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <div className="font-semibold">{value === null ? "—" : value}</div>
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                </div>
              ))}
              <p className="col-span-3 text-[11px] text-left text-muted-foreground">
                {lang === "de"
                  ? `Nur verfügbare Produktdaten · ${impact.calculationVersion} · Abdeckung ${Math.round(impact.coverage * 100)}%`
                  : `Solo dati prodotto disponibili · ${impact.calculationVersion} · Copertura ${Math.round(impact.coverage * 100)}%`}
              </p>
            </div>
          </details>
        );
      })()}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : cartItems && cartItems.length > 0 ? (
        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3 md:space-y-4">
            {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
              <Card key={supplierId} data-testid={`cart-supplier-${supplierId}`}>
                <CardHeader className="pb-2 md:pb-3 p-3 md:p-6">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-md bg-secondary/20 shrink-0">
                      <Package className="h-4 w-4 md:h-5 md:w-5 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base md:text-lg truncate">{supplier.companyName || supplier.name}</CardTitle>
                      <CardDescription className="text-xs md:text-sm">{items.length} {t("common", "items")}</CardDescription>
                    </div>
                    <div className="ml-auto text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{t("common", "subtotal")}</div>
                      <div className="text-base md:text-lg font-bold tabular-nums" data-testid={`supplier-subtotal-${supplierId}`}>{calculateTotal(items)}€</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="hidden md:flex items-center gap-3 pb-2 mb-1 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="flex-1">{t("common", "item")}</span>
                    <span className="w-28 text-right">{t("cart", "unitPriceLabel")}</span>
                    <span className="w-[104px] text-center">{t("cart", "quantityLabel")}</span>
                    <span className="w-24 text-right">{t("cart", "lineTotalLabel")}</span>
                    <span className="w-9" />
                  </div>
                  <div>
                    {items.map((item) => {
                      const effPrice = getEffectivePrice(item);
                      const hasPromo = !!item.activePromotion;
                      const unitPriceNode = hasPromo ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          <span className="line-through text-muted-foreground">{item.product.price}€</span>
                          <span className="font-medium text-green-600 dark:text-green-400">{effPrice.toFixed(2)}€</span>
                          <span className="text-muted-foreground">/ {item.product.unit}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{item.product.price}€ / {item.product.unit}</span>
                      );
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 py-3 border-b border-border/60 last:border-0"
                          data-testid={`cart-item-${item.id}`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <ProductImage src={item.product.imageUrl} alt={item.product.name} className="h-10 w-10 md:h-12 md:w-12 rounded-md shrink-0" iconClassName="h-4 w-4 md:h-5 md:w-5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium text-sm md:text-base truncate">{item.product.name}</p>
                                {hasPromo && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 px-1 rounded shrink-0">
                                    <Tag className="h-2.5 w-2.5" />
                                    -{item.activePromotion!.discountPercent}%
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] md:text-xs text-muted-foreground">
                                {item.product.articleNumber && (
                                  <span className="font-mono" data-testid={`text-article-${item.id}`}>{t("cart", "articleNo")} {item.product.articleNumber}</span>
                                )}
                                <span className="md:hidden">{unitPriceNode}</span>
                                {item.product?.minOrderQuantity && item.product.minOrderQuantity > 1 && (
                                  <span>{t("supplierProducts", "minOrderQuantityShort")} {item.product.minOrderQuantity} {item.product.unit}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="hidden md:block w-28 text-right text-sm tabular-nums">{unitPriceNode}</div>
                          <div className="w-[104px] flex justify-center shrink-0">
                            <QuantityInput
                              value={item.quantity}
                              onChange={(val) => updateQuantityMutation.mutate({ cartItemId: item.id, quantity: val })}
                              min={item.product?.minOrderQuantity || 1}
                              disabled={updateQuantityMutation.isPending}
                              size="md"
                              testIdPrefix={`qty-${item.id}`}
                            />
                          </div>
                          <span className="w-20 md:w-24 text-right font-semibold text-sm md:text-base tabular-nums" data-testid={`line-total-${item.id}`}>
                            {(effPrice * item.quantity).toFixed(2)}€
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => removeItemMutation.mutate(item.id)}
                            disabled={removeItemMutation.isPending}
                            data-testid={`button-remove-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
                <div className="hidden md:block border-t border-border px-3 md:px-6 py-3 md:py-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 dark:bg-primary/20">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <Label className="text-xs md:text-sm font-semibold">
                      {t("cart", "deliveryDate")}
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        (deliveryOptions[supplierId] || "asap") === "asap"
                          ? "border-primary bg-primary/10 dark:bg-primary/20 shadow-sm"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                      onClick={() => {
                        setDeliveryOptions(prev => ({ ...prev, [supplierId]: "asap" }));
                        setSelectedDeliveryDates(prev => ({ ...prev, [supplierId]: "" }));
                      }}
                      data-testid={`radio-delivery-asap-${supplierId}`}
                    >
                      <div className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                        (deliveryOptions[supplierId] || "asap") === "asap"
                          ? "bg-primary/15 dark:bg-primary/25"
                          : "bg-muted"
                      }`}>
                        <Clock className={`h-4 w-4 ${
                          (deliveryOptions[supplierId] || "asap") === "asap"
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`} />
                      </div>
                      <span className={`text-xs font-medium ${
                        (deliveryOptions[supplierId] || "asap") === "asap"
                          ? "text-primary"
                          : "text-muted-foreground"
                      }`}>{t("cart", "asap")}</span>
                    </button>
                    <Popover
                      open={calendarOpen[supplierId] || false}
                      onOpenChange={(open) => {
                        setCalendarOpen(prev => ({ ...prev, [supplierId]: open }));
                        if (open) setDeliveryOptions(prev => ({ ...prev, [supplierId]: "date" }));
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                            deliveryOptions[supplierId] === "date"
                              ? "border-primary bg-primary/10 dark:bg-primary/20 shadow-sm"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                          data-testid={`radio-delivery-date-${supplierId}`}
                        >
                          <div className={`flex items-center justify-center h-8 w-8 rounded-full transition-colors ${
                            deliveryOptions[supplierId] === "date"
                              ? "bg-primary/15 dark:bg-primary/25"
                              : "bg-muted"
                          }`}>
                            <Truck className={`h-4 w-4 ${
                              deliveryOptions[supplierId] === "date"
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`} />
                          </div>
                          <span className={`text-xs font-medium ${
                            deliveryOptions[supplierId] === "date"
                              ? "text-primary"
                              : "text-muted-foreground"
                          }`}>{t("cart", "selectDeliveryDay")}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="center" sideOffset={8}>
                        {(perSupplierDeliveryDates[supplierId] || []).length > 0 ? (
                          <Calendar
                            mode="single"
                            selected={selectedDeliveryDates[supplierId] ? parse(selectedDeliveryDates[supplierId], "yyyy-MM-dd", new Date()) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                setSelectedDeliveryDates(prev => ({ ...prev, [supplierId]: format(date, "yyyy-MM-dd") }));
                                setCalendarOpen(prev => ({ ...prev, [supplierId]: false }));
                              }
                            }}
                            disabled={(date) => {
                              const allowedDates = new Set((perSupplierDeliveryDates[supplierId] || []).map((candidate) => candidate.value));
                              return !allowedDates.has(format(date, "yyyy-MM-dd"));
                            }}
                            locale={dateLocale}
                            fromDate={addDays(new Date(), 1)}
                            toDate={addDays(new Date(), 28)}
                            data-testid={`calendar-${supplierId}`}
                          />
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-xs text-muted-foreground">
                              {t("cart", "noDeliveryDays")}
                            </p>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                  {deliveryOptions[supplierId] === "date" && selectedDeliveryDates[supplierId] && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" data-testid={`selected-date-${supplierId}`}>
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-300">
                        {format(parse(selectedDeliveryDates[supplierId], "yyyy-MM-dd", new Date()), "EEEE, dd. MMMM yyyy", { locale: dateLocale })}
                      </span>
                    </div>
                  )}
                  <div className="relative mt-4 pt-3 border-t border-border/50">
                    <StickyNote className="absolute left-2.5 top-[calc(0.75rem+10px)] h-3.5 w-3.5 text-amber-500/60 dark:text-amber-400/60 pointer-events-none" />
                    <Textarea
                      placeholder={t("cart", "orderNotesPlaceholder")}
                      value={orderNotes[supplierId] || ""}
                      onChange={(e) => setOrderNotes(prev => ({ ...prev, [supplierId]: e.target.value }))}
                      className="resize-none text-xs min-h-0 pl-8"
                      rows={2}
                      data-testid={`textarea-order-notes-${supplierId}`}
                    />
                  </div>
                </div>
                {getSupplierMov(supplierId) > 0 && (() => {
                  const mov = getSupplierMov(supplierId);
                  const supTotal = items.reduce((s, i) => s + getEffectivePrice(i) * i.quantity, 0);
                  const below = supTotal < mov;
                  const pct = Math.min(100, Math.round((supTotal / mov) * 100));
                  return (
                    <div className="border-t border-border px-3 md:px-6 py-3 space-y-1.5">
                      {below ? (
                        <>
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-red-600 dark:text-red-400" data-testid={`mov-warning-${supplierId}`}>
                              {t("cart", "minOrderRemaining").replace("{amount}", (mov - supTotal).toFixed(2))}
                            </span>
                            <span className="text-muted-foreground tabular-nums shrink-0">{supTotal.toFixed(2)} / {mov.toFixed(2)}€</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-red-500/70 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium" data-testid={`mov-ok-${supplierId}`}>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          {t("cart", "minOrderReached")} · {mov.toFixed(2)}€
                        </div>
                      )}
                    </div>
                  );
                })()}
                {Object.keys(groupedBySupplier || {}).length > 1 && (
                  <CardFooter className="hidden md:flex border-t border-border pt-3 md:pt-4 p-3 md:p-6 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs md:text-sm shrink-0"
                      onClick={() => {
                        const deliveryDate = deliveryOptions[supplierId] === "date" && selectedDeliveryDates[supplierId]
                          ? format(parse(selectedDeliveryDates[supplierId], "yyyy-MM-dd", new Date()), "EEEE, dd. MMMM yyyy", { locale: dateLocale })
                          : null;
                        setPreConfirmDialog({
                          mode: "single",
                          supplierId,
                          orderCount: 1,
                          supplierName: supplier.companyName || supplier.name,
                          items: items.map(item => ({ name: item.product.name, quantity: item.quantity, price: (getEffectivePrice(item) * item.quantity).toFixed(2), unit: item.product.unit })),
                          total: calculateTotal(items),
                          deliveryDate,
                          notes: orderNotes[supplierId] || "",
                        });
                      }}
                      disabled={!canPlaceOrder || createSupplierOrderMutation.isPending || createOrderMutation.isPending || isBelowMov(supplierId, items) || (deliveryOptions[supplierId] === "date" && !selectedDeliveryDates[supplierId] && (perSupplierDeliveryDates[supplierId] || []).length > 0)}
                      data-testid={`button-send-supplier-${supplierId}`}
                    >
                      {sendingSupplier === supplierId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{t("cart", "sendToSupplier")}</span>
                    </Button>
                  </CardFooter>
                )}
              </Card>
            ))}
          </div>

          <div className="hidden lg:block lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="p-3 md:p-6 pb-0 md:pb-0">
                <CardTitle className="text-base md:text-lg">{t("cart", "orderSummary")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-3 md:p-6">
                {(currentUser?.address || currentUser?.city || currentUser?.companyName) && (
                  <div className="rounded-lg bg-muted/40 p-3 space-y-0.5" data-testid="summary-delivery-address">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {t("cart", "deliveryAddress")}
                    </div>
                    {(currentUser?.companyName || currentUser?.name) && (
                      <p className="text-sm font-medium">{currentUser?.companyName || currentUser?.name}</p>
                    )}
                    {currentUser?.address && <p className="text-sm text-muted-foreground">{currentUser.address}</p>}
                    {(currentUser?.postalCode || currentUser?.city) && (
                      <p className="text-sm text-muted-foreground">{[currentUser?.postalCode, currentUser?.city].filter(Boolean).join(" ")}</p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {Object.entries(groupedBySupplier || {}).map(([supplierId, { supplier, items }]) => (
                    <div key={supplierId} className="flex justify-between gap-3 text-sm">
                      <span className="text-muted-foreground truncate min-w-0">{supplier.companyName || supplier.name}</span>
                      <span className="shrink-0 tabular-nums">{calculateTotal(items)}€</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{t("common", "items")}</span>
                  <span className="tabular-nums">{cartItems?.length ?? 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between gap-3 font-bold text-base md:text-lg">
                  <span className="shrink-0">{t("common", "total")}</span>
                  <span className="shrink-0 tabular-nums" data-testid="text-total-amount">{grandTotal}€</span>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Receipt className="h-3 w-3 shrink-0" />
                  {t("cart", "vatNote")}
                </p>
              </CardContent>
              <CardFooter className="p-3 md:p-6 pt-0 md:pt-0">
                <Button
                  className="w-full gap-2 text-sm md:text-base"
                  size="default"
                  onClick={() => {
                    const allSuppliers = Object.entries(groupedBySupplier || {});
                    const supplierNames = allSuppliers.map(([, g]) => g.supplier.companyName || g.supplier.name).join(", ");
                    const allItems = allSuppliers.flatMap(([, g]) => g.items.map(item => ({ name: item.product.name, quantity: item.quantity, price: (getEffectivePrice(item) * item.quantity).toFixed(2), unit: item.product.unit })));
                    const firstDate = Object.entries(selectedDeliveryDates).find(([sid, d]) => d && deliveryOptions[sid] === "date");
                    const deliveryDateStr = firstDate ? format(parse(firstDate[1], "yyyy-MM-dd", new Date()), "EEEE, dd. MMMM yyyy", { locale: dateLocale }) : null;
                    setPreConfirmDialog({
                      mode: "all",
                      orderCount: allSuppliers.length,
                      supplierName: supplierNames,
                      items: allItems,
                      total: grandTotal,
                      deliveryDate: deliveryDateStr,
                      notes: Object.values(orderNotes).filter(n => n.trim()).join("; "),
                    });
                  }}
                  disabled={!canPlaceOrder || createOrderMutation.isPending || createSupplierOrderMutation.isPending || supplierIds.some(sid => isBelowMov(sid, (groupedBySupplier || {})[sid]?.items || [])) || supplierIds.some(sid => deliveryOptions[sid] === "date" && !selectedDeliveryDates[sid] && (perSupplierDeliveryDates[sid] || []).length > 0)}
                  data-testid="button-checkout"
                >
                  {Object.keys(groupedBySupplier || {}).length > 1 ? t("cart", "placeAllOrders") : t("cart", "placeOrder")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-medium">{t("cart", "emptyCart")}</h2>
            <p className="text-muted-foreground mt-1">
              {t("cart", "addFromCatalog")}
            </p>
            <Button className="mt-4" asChild>
              <Link href="/restaurant/catalog" data-testid="link-browse-catalog">
                {t("cart", "goToCatalog")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!preConfirmDialog} onOpenChange={(open) => { if (!open) setPreConfirmDialog(null); }}>
        <DialogContent className="z-[80] p-0 gap-0 !max-w-2xl w-[calc(100vw-2rem)]" data-testid="dialog-order-confirm">
          <DialogHeader className="px-8 pt-8 pb-3">
            <DialogTitle className="flex items-center gap-2.5 text-xl">
              <ShoppingBag className="h-5 w-5 text-primary" />
              {lang === "de" ? "Bestellung bestätigen" : "Conferma ordine"}
            </DialogTitle>
            <DialogDescription className="mt-1">
              {lang === "de" ? "Bitte überprüfen Sie Ihre Bestellung vor dem Absenden." : "Controlla il tuo ordine prima di inviarlo."}
            </DialogDescription>
          </DialogHeader>
          {preConfirmDialog && (
            <div className="space-y-5 px-8">
              <div className="rounded-xl bg-muted/40 p-5 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground shrink-0">{preConfirmDialog.supplierName.includes(",") ? (lang === "de" ? "Lieferanten" : "Fornitori") : (lang === "de" ? "Lieferant" : "Fornitore")}</span>
                  <span className="font-semibold ml-auto text-right">{preConfirmDialog.supplierName}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground shrink-0">{lang === "de" ? "Lieferung" : "Consegna"}</span>
                  <span className="font-semibold ml-auto text-right">{preConfirmDialog.deliveryDate || (lang === "de" ? "Schnellstmöglich" : "Il prima possibile")}</span>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-3">
                {preConfirmDialog.items.map((item, i) => (
                  <div key={i} className="flex justify-between items-center text-sm gap-4 py-1">
                    <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                    <span className="font-medium shrink-0 tabular-nums">{item.price}€</span>
                  </div>
                ))}
              </div>

              {preConfirmDialog.notes && (
                <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 px-4 py-3">
                  <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">{preConfirmDialog.notes}</p>
                </div>
              )}

              <Separator />
              <div className="flex justify-between items-center font-bold text-xl py-1">
                <span>{lang === "de" ? "Gesamt" : "Totale"}</span>
                <span data-testid="confirm-total" className="tabular-nums">{preConfirmDialog.total}€</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0 px-8 pb-8 pt-6">
            <Button variant="outline" onClick={() => setPreConfirmDialog(null)} data-testid="button-confirm-cancel">
              {lang === "de" ? "Zurück" : "Indietro"}
            </Button>
            <Button
              onClick={() => {
                if (preConfirmDialog?.mode === "single" && preConfirmDialog.supplierId) {
                  createSupplierOrderMutation.mutate(preConfirmDialog.supplierId);
                } else {
                  createOrderMutation.mutate();
                }
                setPreConfirmDialog(null);
              }}
              disabled={!canPlaceOrder || createOrderMutation.isPending || createSupplierOrderMutation.isPending}
              className="gap-2"
              data-testid="button-confirm-send"
            >
              {(createOrderMutation.isPending || createSupplierOrderMutation.isPending) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {lang === "de"
                ? `${preConfirmDialog?.orderCount ?? 1} ${(preConfirmDialog?.orderCount ?? 1) === 1 ? "Bestellung" : "Bestellungen"} für ${preConfirmDialog?.total ?? "0.00"} € senden`
                : `Invia ${preConfirmDialog?.orderCount ?? 1} ${(preConfirmDialog?.orderCount ?? 1) === 1 ? "ordine" : "ordini"} per ${preConfirmDialog?.total ?? "0.00"} €`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PullToRefreshWrapper>
    {cartItems && cartItems.length > 0 && !orderConfirmation && mobileStep === "summary" && (() => {
      const supplierEntries = Object.entries(groupedBySupplier || {});
      const hasMovError = supplierIds.some(sid => isBelowMov(sid, (groupedBySupplier || {})[sid]?.items || []));
      const wheelOptionsFor = (sid: string): WheelOption[] => {
        const dates = perSupplierDeliveryDates[sid] || [];
        const asap: WheelOption = { value: "asap", label: lang === "de" ? "Schnellstmöglich" : "Il prima possibile" };
        const dateOpts: WheelOption[] = dates.map(d => ({
          value: d.value,
          label: format(parse(d.value, "yyyy-MM-dd", new Date()), "EEE, dd. MMM", { locale: dateLocale }),
        }));
        return [asap, ...dateOpts];
      };
      const wheelValueFor = (sid: string) => {
        if (deliveryOptions[sid] === "date" && selectedDeliveryDates[sid]) return selectedDeliveryDates[sid];
        return "asap";
      };
      const setWheelValueFor = (sid: string, v: string) => {
        setMobileValidationError(null);
        if (v === "asap") {
          setDeliveryOptions(prev => ({ ...prev, [sid]: "asap" }));
          setSelectedDeliveryDates(prev => ({ ...prev, [sid]: "" }));
        } else {
          setDeliveryOptions(prev => ({ ...prev, [sid]: "date" }));
          setSelectedDeliveryDates(prev => ({ ...prev, [sid]: v }));
        }
      };
      const submit = () => {
        if (hasMovError) {
          setMobileValidationError(lang === "de" ? "Mindestbestellwert nicht erreicht." : "Valore minimo d'ordine non raggiunto.");
          return;
        }
        setMobileValidationError(null);
        const allSuppliers = supplierEntries;
        const allItems = allSuppliers.flatMap(([, group]) =>
          group.items.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            price: (getEffectivePrice(item) * item.quantity).toFixed(2),
            unit: item.product.unit,
          })),
        );
        const firstDate = Object.entries(selectedDeliveryDates).find(([sid, date]) =>
          date && deliveryOptions[sid] === "date",
        );
        setPreConfirmDialog({
          mode: "all",
          orderCount: allSuppliers.length,
          supplierName: allSuppliers.map(([, group]) => group.supplier.companyName || group.supplier.name).join(", "),
          items: allItems,
          total: grandTotal,
          deliveryDate: firstDate
            ? format(parse(firstDate[1], "yyyy-MM-dd", new Date()), "EEEE, dd. MMMM yyyy", { locale: dateLocale })
            : null,
          notes: Object.values(orderNotes).filter((note) => note.trim()).join("; "),
        });
      };
      return createPortal((
        <div
          className="md:hidden fixed inset-0 z-[70] bg-background flex flex-col animate-in slide-in-from-bottom duration-300"
          data-testid="mobile-cart-summary"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={() => setLocation("/restaurant/catalog")}
              data-testid="button-mobile-summary-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold leading-tight">
                {lang === "de" ? "Bestellübersicht" : "Riepilogo ordine"}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {supplierEntries.length} {supplierEntries.length === 1 ? (lang === "de" ? "Lieferant" : "Fornitore") : (lang === "de" ? "Lieferanten" : "Fornitori")} · {cartItems.length} {t("common", "items")}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t("common", "total")}</div>
              <div className="text-base font-bold m-num">{grandTotal} €</div>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto px-3 py-4 space-y-4"
            style={{ paddingBottom: "calc(120px + env(safe-area-inset-bottom))" }}
          >
            {supplierEntries.map(([supplierId, { supplier, items }]) => {
              const opts = wheelOptionsFor(supplierId);
              const curValue = wheelValueFor(supplierId);
              const supplierTotal = calculateTotal(items);
              const belowMov = isBelowMov(supplierId, items);
              const mov = getSupplierMov(supplierId);
              return (
                <div
                  key={supplierId}
                  className="rounded-2xl border border-border bg-card p-4 space-y-3"
                  data-testid={`mobile-summary-supplier-${supplierId}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{supplier.companyName || supplier.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {items.length} {t("common", "items")} · {supplierTotal}€
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      <CalendarDays className="h-3 w-3" />
                      {t("cart", "deliveryDate")}
                    </div>
                    <WheelDatePicker
                      options={opts}
                      value={curValue}
                      onChange={(v) => setWheelValueFor(supplierId, v)}
                      testId={`mobile-wheel-${supplierId}`}
                    />
                  </div>

                  <Textarea
                    placeholder={t("cart", "orderNotesPlaceholder")}
                    value={orderNotes[supplierId] || ""}
                    onChange={(e) => setOrderNotes(prev => ({ ...prev, [supplierId]: e.target.value }))}
                    className="resize-none text-xs min-h-0"
                    rows={2}
                    data-testid={`mobile-textarea-notes-${supplierId}`}
                  />

                  {belowMov && (
                    <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 px-3 py-2">
                      <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 dark:text-red-300 font-medium" data-testid={`mobile-mov-warning-${supplierId}`}>
                        {t("cart", "belowMinOrderValue").replace("{min}", mov.toFixed(2))}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="border-t border-border bg-background/95 backdrop-blur-md px-3 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
          >
            {mobileValidationError && (
              <div className="mb-2 flex items-center gap-2 text-xs text-red-600 dark:text-red-400" data-testid="mobile-validation-error">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{mobileValidationError}</span>
              </div>
            )}
            <Button
              className="w-full h-12 rounded-full font-semibold gap-2"
              onClick={submit}
              disabled={!canPlaceOrder || createOrderMutation.isPending || hasMovError}
              data-testid="button-mobile-send-order"
            >
              {createOrderMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {lang === "de" ? "Bestellung senden" : "Invia ordine"} · {grandTotal} €
            </Button>
          </div>
        </div>
      ), document.body);
    })()}
    </div>
  );
}
