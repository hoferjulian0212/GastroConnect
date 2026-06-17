import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { SectionTabs } from "@/components/SectionTabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Package, Store, Tag, ArrowLeft, Carrot, Apple, Beef, Fish, Milk, Wine, Wheat, Flame, MoreHorizontal, Sandwich, Coffee, Droplets, Check, Trash2, ArrowRight, Plus, Minus } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User, ProductWithSupplierAndPromotion, CartItemWithProduct, Promotion } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { queryClient, apiRequest } from "@/lib/queryClient";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { ProductImage } from "@/components/ProductImage";
import { ShoppingCart, ChevronRight as ChevronRightIcon, History, Truck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer";
import QuantityInput from "@/components/QuantityInput";
import { useToast } from "@/hooks/use-toast";
import { useFlyToCart } from "@/hooks/use-fly-to-cart";
import { useScrollCompact } from "@/hooks/use-scroll-compact";
import { motion, AnimatePresence } from "framer-motion";

type CartItemWithPromo = CartItemWithProduct & { activePromotion?: Promotion | null };

function CategoryIndicator({
  icon: Icon,
  bg,
  label,
  testId,
}: {
  icon: typeof History;
  bg: string;
  label: string;
  testId: string;
}) {
  return (
    <>
      {/* Desktop: hover shows a short label (web only) */}
      <div className="hidden md:block">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center justify-center h-7 w-7 rounded-full ${bg} text-white shadow-md ring-1 ring-black/5`}
              aria-label={label}
              data-testid={testId}
            >
              <Icon className="h-4 w-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      </div>
      {/* Mobile: icon only, no tooltip */}
      <span
        className={`md:hidden inline-flex items-center justify-center h-8 w-8 rounded-full ${bg} text-white shadow-md ring-1 ring-black/5`}
        aria-label={label}
        data-testid={`${testId}-mobile`}
      >
        <Icon className="h-4 w-4" />
      </span>
    </>
  );
}

function QuickAddBar({
  product,
  lang,
  t,
}: {
  product: ProductWithSupplierAndPromotion;
  lang: string;
  t: ReturnType<typeof useT>;
}) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { triggerFly } = useFlyToCart();
  const min = product.minOrderQuantity && product.minOrderQuantity > 1 ? product.minOrderQuantity : 1;
  const [qty, setQty] = useState(min);
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQty(min);
  }, [min]);

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  const addMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/cart", {
        restaurantId: currentUser?.id,
        productId: product.id,
        supplierId: product.supplierId,
        quantity: qty,
        mode: "add",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAdded(true);
      setExpanded(false);
      setSheetOpen(false);
      setQty(min);
      if (addedTimer.current) clearTimeout(addedTimer.current);
      addedTimer.current = setTimeout(() => setAdded(false), 1500);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("common", "productAddError"), variant: "destructive" });
    },
  });

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const stopKey = (e: React.KeyboardEvent) => e.stopPropagation();

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerFly(e.currentTarget as HTMLElement, product.imageUrl);
    addMutation.mutate();
  };

  const promo = product.activePromotion;
  const unitPrice = promo ? parseFloat(product.price) * (1 - promo.discountPercent / 100) : parseFloat(product.price);
  const lineTotal = unitPrice * qty;

  return (
    <div
      className="shrink-0"
      onClick={stop}
      onKeyDown={stopKey}
      data-testid={`quick-add-${product.id}`}
    >
      {/* Desktop: inline expand-in-place quick add */}
      <div className="hidden md:block">
        {expanded ? (
          <div className="flex items-center h-7 rounded-full border border-border bg-background shadow-sm pl-0.5 pr-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQty((q) => Math.max(min, q - 1)); }}
              onKeyDown={stopKey}
              disabled={qty <= min}
              aria-label={lang === "de" ? "Weniger" : "Meno"}
              className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
              data-testid={`quick-qty-${product.id}-decrement`}
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-5 text-center text-[11px] font-semibold tabular-nums" data-testid={`quick-qty-${product.id}-value`}>{qty}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setQty((q) => q + 1); }}
              onKeyDown={stopKey}
              aria-label={lang === "de" ? "Mehr" : "Più"}
              className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted"
              data-testid={`quick-qty-${product.id}-increment`}
            >
              <Plus className="h-3 w-3" />
            </button>
            <Button
              size="icon"
              onClick={handleAdd}
              onKeyDown={stopKey}
              disabled={addMutation.isPending}
              aria-label={t("templates", "addToCart")}
              className="h-6 w-6 ml-0.5 rounded-full shrink-0"
              data-testid={`button-quick-add-confirm-${product.id}`}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            onKeyDown={stopKey}
            aria-label={t("templates", "addToCart")}
            title={t("templates", "addToCart")}
            className={`h-8 w-8 rounded-full shrink-0 shadow-md ring-1 ring-black/5 transition-colors duration-300 ${
              added ? "bg-green-600 hover:bg-green-600 text-white" : ""
            }`}
            data-testid={`button-quick-add-${product.id}`}
          >
            {added ? (
              <Check className="h-4 w-4 shrink-0 animate-status-dot" />
            ) : (
              <Plus className="h-4 w-4 shrink-0" />
            )}
          </Button>
        )}
      </div>

      {/* Mobile: tap opens a friendly amount sheet */}
      <Button
        size="icon"
        onClick={(e) => { e.stopPropagation(); setQty(min); setSheetOpen(true); }}
        onKeyDown={stopKey}
        aria-label={t("templates", "addToCart")}
        title={t("templates", "addToCart")}
        className={`md:hidden h-9 w-9 rounded-full shrink-0 shadow-md ring-1 ring-black/5 transition-colors duration-300 ${
          added ? "bg-green-600 hover:bg-green-600 text-white" : ""
        }`}
        data-testid={`button-quick-add-mobile-${product.id}`}
      >
        {added ? (
          <Check className="h-4 w-4 shrink-0 animate-status-dot" />
        ) : (
          <Plus className="h-4 w-4 shrink-0" />
        )}
      </Button>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="md:hidden" data-testid={`quick-add-sheet-${product.id}`}>
          <DrawerHeader className="px-4 pt-2 pb-3 text-left">
            <div className="flex items-center gap-3">
              <ProductImage src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-xl shrink-0" iconClassName="h-5 w-5" />
              <div className="min-w-0 flex-1">
                <DrawerTitle className="text-base truncate">{product.name}</DrawerTitle>
                <div className="text-xs text-muted-foreground truncate">{product.supplier?.companyName || product.supplier?.name}</div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  {promo ? (
                    <>
                      <span className="text-xs text-muted-foreground line-through">{parseFloat(product.price).toFixed(2)}</span>
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">{unitPrice.toFixed(2)}€</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold">{unitPrice.toFixed(2)}€</span>
                  )}
                  <span className="text-xs text-muted-foreground">/{product.unit}</span>
                </div>
              </div>
            </div>
          </DrawerHeader>

          <div className="px-4 pb-1">
            {min > 1 && (
              <p className="text-[11px] text-muted-foreground mb-3 text-center" data-testid={`sheet-min-note-${product.id}`}>
                {lang === "de" ? `Mindestbestellmenge: ${min} ${product.unit}` : `Quantità minima: ${min} ${product.unit}`}
              </p>
            )}
            <div className="flex items-center justify-center gap-6 py-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQty((q) => Math.max(min, q - 1)); }}
                disabled={qty <= min}
                aria-label={lang === "de" ? "Weniger" : "Meno"}
                className="h-14 w-14 rounded-full border border-border flex items-center justify-center text-foreground active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-transform"
                data-testid={`sheet-qty-${product.id}-decrement`}
              >
                <Minus className="h-6 w-6" />
              </button>
              <span className="w-16 text-center text-3xl font-bold tabular-nums" data-testid={`sheet-qty-${product.id}-value`}>{qty}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQty((q) => q + 1); }}
                aria-label={lang === "de" ? "Mehr" : "Più"}
                className="h-14 w-14 rounded-full border border-border flex items-center justify-center text-foreground active:scale-95 transition-transform"
                data-testid={`sheet-qty-${product.id}-increment`}
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
          </div>

          <DrawerFooter className="px-4 pt-3 pb-4 border-t border-border" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
            <Button
              className="w-full h-12 rounded-full font-semibold gap-2"
              onClick={handleAdd}
              disabled={addMutation.isPending}
              data-testid={`sheet-button-add-${product.id}`}
            >
              <ShoppingCart className="h-4 w-4" />
              {lang === "de" ? "In den Warenkorb" : "Aggiungi al carrello"}
              <span className="tabular-nums">· {lineTotal.toFixed(2)}€</span>
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}


const categoryConfig: Record<string, { de: string; it: string; icon: typeof Package; color: string }> = {
 "Gemüse": { de: "Gemüse", it: "Verdura", icon: Carrot, color: "bg-green-600" },
 "Obst": { de: "Obst", it: "Frutta", icon: Apple, color: "bg-red-500" },
 "Kräuter": { de: "Kräuter", it: "Erbe", icon: Carrot, color: "bg-lime-600" },
 "Fleisch": { de: "Fleisch", it: "Carne", icon: Beef, color: "bg-rose-700" },
 "Wurst": { de: "Wurst", it: "Salumi", icon: Beef, color: "bg-rose-800" },
 "Fisch": { de: "Fisch", it: "Pesce", icon: Fish, color: "bg-cyan-600" },
 "Meeresfrüchte": { de: "Meeresfrüchte", it: "Frutti di mare", icon: Fish, color: "bg-teal-600" },
 "Käse": { de: "Käse", it: "Formaggi", icon: Milk, color: "bg-yellow-500" },
 "Milchprodukte": { de: "Milchprodukte", it: "Latticini", icon: Milk, color: "bg-teal-400" },
 "Wein": { de: "Wein", it: "Vino", icon: Wine, color: "bg-purple-700" },
 "Spirituosen": { de: "Spirituosen", it: "Liquori", icon: Wine, color: "bg-fuchsia-700" },
 "Getränke": { de: "Getränke", it: "Bevande", icon: Droplets, color: "bg-purple-600" },
 "Kaffee": { de: "Kaffee", it: "Caffè", icon: Coffee, color: "bg-amber-800" },
 "Pasta": { de: "Pasta", it: "Pasta", icon: Wheat, color: "bg-amber-500" },
 "Trockenwaren": { de: "Trockenwaren", it: "Prodotti secchi", icon: Wheat, color: "bg-amber-700" },
 "Konserven": { de: "Konserven", it: "Conserve", icon: Package, color: "bg-slate-600" },
 "Saucen": { de: "Saucen", it: "Salse", icon: Droplets, color: "bg-red-700" },
 "Öl & Essig": { de: "Öl & Essig", it: "Olio & Aceto", icon: Droplets, color: "bg-yellow-600" },
 "Gewürze": { de: "Gewürze", it: "Spezie", icon: Flame, color: "bg-orange-500" },
 "Brot": { de: "Brot", it: "Pane", icon: Sandwich, color: "bg-yellow-700" },
 "Sonstiges": { de: "Sonstiges", it: "Altro", icon: MoreHorizontal, color: "bg-gray-500" },
};

const allCategories = Object.keys(categoryConfig);

function CartPillDesktop({ lang, setLocation }: { lang: string; setLocation: (p: string) => void }) {
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);
  const { data: countData } = useQuery<{ count: string | number }>({
    queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    refetchInterval: 5000,
  });
  const count = Number(countData?.count || 0);
  const { data: cartItems } = useQuery<CartItemWithPromo[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && open,
  });
  const updateQtyMut = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) =>
      apiRequest("PATCH", `/api/cart/${id}`, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });
  const removeMut = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/cart/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });

  const effPrice = (item: CartItemWithPromo) => {
    const base = parseFloat(item.product.price);
    return item.activePromotion ? base * (1 - item.activePromotion.discountPercent / 100) : base;
  };

  const grouped = useMemo(() => {
    if (!cartItems) return {} as Record<string, { supplier: CartItemWithPromo["supplier"]; items: CartItemWithPromo[] }>;
    const g: Record<string, { supplier: CartItemWithPromo["supplier"]; items: CartItemWithPromo[] }> = {};
    for (const it of cartItems) {
      if (!g[it.supplierId]) g[it.supplierId] = { supplier: it.supplier, items: [] };
      g[it.supplierId].items.push(it);
    }
    return g;
  }, [cartItems]);

  const total = useMemo(() => {
    if (!cartItems) return "0.00";
    return cartItems.reduce((s, it) => s + effPrice(it) * it.quantity, 0).toFixed(2);
  }, [cartItems]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!count) return null;
  return (
    <div className="hidden md:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex-col items-center pointer-events-none">
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-0 pointer-events-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              data-testid="desktop-cart-overlay"
            />
            <motion.div
              key="panel"
              className="relative z-10 mb-3 w-[380px] max-h-[60vh] flex flex-col rounded-3xl border border-border bg-background shadow-[0_16px_48px_rgba(0,0,0,0.18)] overflow-hidden pointer-events-auto"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              style={{ transformOrigin: "bottom center" }}
              role="dialog"
              aria-modal="true"
              aria-label={lang === "de" ? "Warenkorb" : "Carrello"}
              data-testid="desktop-cart-panel"
            >
              <div className="px-5 pt-4 pb-3 border-b border-border flex items-center justify-between">
                <div className="text-sm font-semibold">
                  {lang === "de" ? "Warenkorb" : "Carrello"}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {count} {lang === "de" ? "Artikel" : (count === 1 ? "Articolo" : "Articoli")}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4" data-testid="desktop-cart-body">
                {Object.entries(grouped).map(([sid, { supplier, items }]) => (
                  <div key={sid} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {supplier.companyName || supplier.name}
                    </div>
                    {items.map((it) => (
                      <div key={it.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0" data-testid={`desktop-cart-item-${it.id}`}>
                        <ProductImage src={it.product.imageUrl} alt={it.product.name} className="h-11 w-11 rounded-lg shrink-0" iconClassName="h-4 w-4" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{it.product.name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {effPrice(it).toFixed(2)}€/{it.product.unit}
                          </div>
                        </div>
                        <QuantityInput
                          value={it.quantity}
                          onChange={(v) => updateQtyMut.mutate({ id: it.id, quantity: v })}
                          min={it.product?.minOrderQuantity || 1}
                          disabled={updateQtyMut.isPending}
                          size="sm"
                          testIdPrefix={`desktop-qty-${it.id}`}
                        />
                        <button
                          onClick={() => removeMut.mutate(it.id)}
                          disabled={removeMut.isPending}
                          aria-label={lang === "de" ? "Entfernen" : "Rimuovi"}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10 active:scale-95"
                          data-testid={`desktop-remove-${it.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                {cartItems && cartItems.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {lang === "de" ? "Warenkorb ist leer" : "Carrello vuoto"}
                  </div>
                )}
                {!cartItems && (
                  <div className="space-y-3">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-11 w-11 rounded-lg" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-2/3" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-5 pt-3 pb-4 border-t border-border">
                <div className="flex items-center justify-between text-sm mb-2.5">
                  <span className="text-muted-foreground">{lang === "de" ? "Zwischensumme" : "Subtotale"}</span>
                  <span className="font-bold tabular-nums text-base" data-testid="desktop-cart-total">{total} €</span>
                </div>
                <Button
                  className="w-full h-11 rounded-full font-semibold gap-2"
                  onClick={() => { setOpen(false); setLocation("/restaurant/cart?step=summary"); }}
                  disabled={!cartItems || cartItems.length === 0}
                  data-testid="desktop-button-continue"
                >
                  {lang === "de" ? "Weiter zur Übersicht" : "Vai al riepilogo"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={lang === "de" ? `Warenkorb, ${count} Artikel` : `Carrello, ${count} articoli`}
        data-testid="button-desktop-cart-pill"
        className="relative z-10 inline-flex items-center gap-2.5 h-12 pl-3 pr-5 rounded-full bg-foreground text-background shadow-[0_8px_24px_rgba(0,0,0,0.25)] pointer-events-auto"
        whileTap={{ scale: 0.95 }}
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/15 shrink-0">
          <ShoppingCart className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold tabular-nums">{count}</span>
        <span className="text-sm font-semibold whitespace-nowrap">
          {lang === "de" ? "im Warenkorb" : "nel carrello"}
        </span>
        <ChevronRightIcon
          className={`h-4 w-4 opacity-70 transition-transform duration-200 ${open ? "-rotate-90" : "rotate-0"}`}
        />
      </motion.button>
    </div>
  );
}

function CartPillMobile({ lang, setLocation }: { lang: string; setLocation: (p: string) => void }) {
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);
  const compact = useScrollCompact();
  const { data: countData } = useQuery<{ count: string | number }>({
    queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
    refetchInterval: 5000,
  });
  const count = Number(countData?.count || 0);
  const { data: cartItems } = useQuery<CartItemWithPromo[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && open,
  });
  const updateQtyMut = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) =>
      apiRequest("PATCH", `/api/cart/${id}`, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });
  const removeMut = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/cart/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
    },
  });

  const effPrice = (item: CartItemWithPromo) => {
    const base = parseFloat(item.product.price);
    return item.activePromotion ? base * (1 - item.activePromotion.discountPercent / 100) : base;
  };

  const grouped = useMemo(() => {
    if (!cartItems) return {} as Record<string, { supplier: CartItemWithPromo["supplier"]; items: CartItemWithPromo[] }>;
    const g: Record<string, { supplier: CartItemWithPromo["supplier"]; items: CartItemWithPromo[] }> = {};
    for (const it of cartItems) {
      if (!g[it.supplierId]) g[it.supplierId] = { supplier: it.supplier, items: [] };
      g[it.supplierId].items.push(it);
    }
    return g;
  }, [cartItems]);

  const total = useMemo(() => {
    if (!cartItems) return "0.00";
    return cartItems.reduce((s, it) => s + effPrice(it) * it.quantity, 0).toFixed(2);
  }, [cartItems]);

  if (!count) return null;
  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        data-testid="button-mobile-cart-pill"
        className="md:hidden fixed left-1/2 z-30 inline-flex items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-foreground text-background shadow-[0_8px_24px_rgba(0,0,0,0.25)] origin-bottom"
        style={{ bottom: "var(--mobile-cta-offset)", pointerEvents: "auto" }}
        initial={false}
        animate={{
          x: "-50%",
          y: compact ? 5 : 0,
          scale: compact ? 0.9 : 1,
        }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        whileTap={{ scale: 0.93 }}
      >
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/15 shrink-0">
          <ShoppingCart className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-semibold m-num whitespace-nowrap shrink-0">
          {count}
        </span>
        <span
          className="grid transition-[grid-template-columns] duration-[280ms] ease-[cubic-bezier(0.4,0,0.2,1)] [will-change:grid-template-columns]"
          style={{ gridTemplateColumns: compact ? "0fr" : "1fr" }}
        >
          <span
            className={`flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[13px] font-semibold transition-opacity duration-200 ease-out ${
              compact ? "opacity-0" : "opacity-100 delay-[60ms]"
            }`}
          >
            {lang === "de" ? "im Warenkorb" : "nel carrello"}
            <ChevronRightIcon className="h-4 w-4 opacity-70" />
          </span>
        </span>
      </motion.button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="md:hidden max-h-[85vh]" data-testid="mobile-cart-sheet">
          <DrawerHeader className="px-4 pt-2 pb-2 text-left">
            <DrawerTitle className="text-base">
              {lang === "de" ? "Warenkorb" : "Carrello"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {count} {count === 1 ? (lang === "de" ? "Artikel" : "Articolo") : (lang === "de" ? "Artikel" : "Articoli")}
              </span>
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-2" data-testid="mobile-cart-sheet-body">
            {Object.entries(grouped).map(([sid, { supplier, items }]) => (
              <div key={sid} className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {supplier.companyName || supplier.name}
                </div>
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0" data-testid={`sheet-cart-item-${it.id}`}>
                    <ProductImage src={it.product.imageUrl} alt={it.product.name} className="h-12 w-12 rounded-lg shrink-0" iconClassName="h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.product.name}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {effPrice(it).toFixed(2)}€/{it.product.unit}
                      </div>
                    </div>
                    <QuantityInput
                      value={it.quantity}
                      onChange={(v) => updateQtyMut.mutate({ id: it.id, quantity: v })}
                      min={it.product?.minOrderQuantity || 1}
                      disabled={updateQtyMut.isPending}
                      size="sm"
                      testIdPrefix={`sheet-qty-${it.id}`}
                    />
                    <button
                      onClick={() => removeMut.mutate(it.id)}
                      disabled={removeMut.isPending}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-full text-destructive active:scale-95"
                      data-testid={`sheet-remove-${it.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {cartItems && cartItems.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {lang === "de" ? "Warenkorb ist leer" : "Carrello vuoto"}
              </div>
            )}
          </div>
          <DrawerFooter className="px-4 pt-3 pb-4 border-t border-border" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-muted-foreground">{lang === "de" ? "Zwischensumme" : "Subtotale"}</span>
              <span className="font-bold tabular-nums text-base" data-testid="sheet-total">{total} €</span>
            </div>
            <Button
              className="w-full h-12 rounded-full font-semibold gap-2"
              onClick={() => { setOpen(false); setLocation("/restaurant/cart?step=summary"); }}
              disabled={!cartItems || cartItems.length === 0}
              data-testid="sheet-button-continue"
            >
              {lang === "de" ? "Weiter zur Übersicht" : "Vai al riepilogo"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

export default function RestaurantCatalog() {
 const { currentUser } = useUser();
 const [location, setLocation] = useLocation();
 const [searchQuery, setSearchQuery] = useState("");
 const [globalSearch, setGlobalSearch] = useState("");
 const [showSuggestions, setShowSuggestions] = useState(false);
 const [highlightIndex, setHighlightIndex] = useState(-1);
 const searchContainerRef = useRef<HTMLDivElement>(null);
 const suggestionsRef = useRef<HTMLDivElement>(null);
 const [selectedSupplier, setSelectedSupplierState] = useState<string>("all");

 const setSelectedSupplier = (sup: string) => {
 setSelectedSupplierState(sup);
 const p = new URLSearchParams(window.location.search);
 if (sup && sup !== "all") {
 p.set("supplier", sup);
 } else {
 p.delete("supplier");
 }
 const qs = p.toString();
 const newUrl = `/restaurant/catalog${qs ? `?${qs}` : ""}`;
 window.history.pushState(null, "", newUrl);
 };
 const [onlyAvailable, setOnlyAvailable] = useState(false);
 const [onlyPromotions, setOnlyPromotions] = useState(false);
 const { lang } = useLanguage();
 const t = useT(lang);

 const [selectedCategory, setSelectedCategoryState] = useState<string | null>(null);

 const setSelectedCategory = (cat: string | null) => {
 setSelectedCategoryState(cat);
 const p = new URLSearchParams(window.location.search);
 if (cat) {
 p.set("category", cat);
 } else {
 p.delete("category");
 }
 const qs = p.toString();
 const newUrl = `/restaurant/catalog${qs ? `?${qs}` : ""}`;
 window.history.pushState(null, "", newUrl);
 };

 useEffect(() => {
 const syncFromUrl = () => {
 const p = new URLSearchParams(window.location.search);
 setSelectedCategoryState(p.get("category") || null);
 const supplierParam = p.get("supplier");
 setSelectedSupplierState(supplierParam || "all");
 const promotionsParam = p.get("promotions");
 setOnlyPromotions(promotionsParam === "true");
 };
 syncFromUrl();
 window.addEventListener("popstate", syncFromUrl);
 return () => window.removeEventListener("popstate", syncFromUrl);
 }, [location]);

 const { data: suppliers, isLoading: suppliersLoading } = useQuery<User[]>({
 queryKey: ["/api/suppliers"],
 });

 const { data: products, isLoading: productsLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
 queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const { data: cartItems } = useQuery<CartItemWithPromo[]>({
 queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const { data: orderInsights } = useQuery<Record<string, { timesOrdered: number; onTheWay: boolean }>>({
 queryKey: ["/api/products/order-insights"],
 enabled: !!currentUser?.id,
 });

 const cartQtyByProduct = useMemo(() => {
 const m = new Map<string, number>();
 if (cartItems) {
 for (const it of cartItems) {
 m.set(it.productId, (m.get(it.productId) || 0) + it.quantity);
 }
 }
 return m;
 }, [cartItems]);

 const knownCategories = allCategories.filter(c => c !== "Sonstiges");
 const productsByCategory = (cat: string) => {
 if (!products) return [];
 const supplierFiltered = selectedSupplier === "all"
 ? products
 : products.filter(p => p.supplierId === selectedSupplier);
 if (cat === "__all__") {
 return supplierFiltered;
 }
 if (cat === "Sonstiges") {
 return supplierFiltered.filter(p => !p.category || p.category === "Sonstiges" || !knownCategories.includes(p.category));
 }
 return supplierFiltered.filter(p => p.category === cat);
 };

 const categoryProductCount = (cat: string) => productsByCategory(cat).length;

 const categoriesWithProducts = allCategories.filter(cat => categoryProductCount(cat) > 0);

 const categoryFilteredProducts = selectedCategory
 ? productsByCategory(selectedCategory).filter(p => {
 const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
 p.description?.toLowerCase().includes(searchQuery.toLowerCase());
 const matchesAvailability = !onlyAvailable || p.inStock;
 const matchesPromotion = !onlyPromotions || !!p.activePromotion;
 return matchesSearch && matchesAvailability && matchesPromotion;
 })
 : [];

 const supplierCards = useMemo(() => {
 if (!suppliers || !products) return [];
 return suppliers.map(s => ({
 id: s.id,
 name: s.companyName || s.name || "",
 profileImageUrl: s.profileImageUrl || null,
 productCount: products.filter(p => p.supplierId === s.id).length,
 })).filter(s => s.productCount > 0);
 }, [suppliers, products]);

 const searchSuggestions = useMemo(() => {
 if (!products || globalSearch.length < 2) return [];
 const q = globalSearch.toLowerCase();
 const supplierFiltered = selectedSupplier === "all" ? products : products.filter(p => p.supplierId === selectedSupplier);
 return supplierFiltered
 .filter(p =>
 p.name.toLowerCase().includes(q) ||
 p.description?.toLowerCase().includes(q) ||
 p.supplier?.companyName?.toLowerCase().includes(q) ||
 p.supplier?.name?.toLowerCase().includes(q)
 )
 .slice(0, 8);
 }, [products, globalSearch, selectedSupplier]);

 useEffect(() => {
 const handleClickOutside = (e: MouseEvent) => {
 if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
 setShowSuggestions(false);
 }
 };
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 const handleGlobalSearchChange = useCallback((value: string) => {
 setGlobalSearch(value);
 setShowSuggestions(value.length >= 2);
 setHighlightIndex(-1);
 }, []);

 const handleSuggestionSelect = useCallback((product: ProductWithSupplierAndPromotion) => {
 setShowSuggestions(false);
 setGlobalSearch("");
 setSearchQuery("");
 setLocation(`/restaurant/product/${product.id}`);
 }, [setLocation]);

 const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
 if (e.key === "Escape") {
 setShowSuggestions(false);
 return;
 }
 if (!showSuggestions || searchSuggestions.length === 0) return;
 if (e.key === "ArrowDown") {
 e.preventDefault();
 setHighlightIndex(prev => prev < searchSuggestions.length - 1 ? prev + 1 : 0);
 } else if (e.key === "ArrowUp") {
 e.preventDefault();
 setHighlightIndex(prev => prev <= 0 ? searchSuggestions.length - 1 : prev - 1);
 } else if (e.key === "Enter" && highlightIndex >= 0 && highlightIndex < searchSuggestions.length) {
 e.preventDefault();
 handleSuggestionSelect(searchSuggestions[highlightIndex]);
 }
 }, [showSuggestions, searchSuggestions, highlightIndex, handleSuggestionSelect]);

 useEffect(() => {
 if (highlightIndex >= 0 && suggestionsRef.current) {
 const item = suggestionsRef.current.children[highlightIndex] as HTMLElement;
 item?.scrollIntoView({ block: "nearest" });
 }
 }, [highlightIndex]);

 const renderSuggestionDropdown = (isDark: boolean) => {
 if (!showSuggestions || globalSearch.length < 2) return null;
 return (
 <div
 ref={suggestionsRef}
 className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border shadow-xl overflow-hidden max-h-[320px] overflow-y-auto ${
 isDark
 ? "bg-[#1e2130] border-white/10"
 : "bg-background border-border"
 }`}
 data-testid="search-suggestions"
 >
 {searchSuggestions.length > 0 ? (
 searchSuggestions.map((product, idx) => {
 const promo = product.activePromotion;
 const hasPromo = !!promo;
 const originalPrice = parseFloat(product.price);
 const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;
 return (
 <button
 key={product.id}
 className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
 idx === highlightIndex
 ? isDark ? "bg-white/10" : "bg-muted"
 : isDark ? "hover:bg-white/[0.06]" : "hover:bg-muted/50"
 } ${idx > 0 ? isDark ? "border-t border-white/5" : "border-t border-border/50" : ""}`}
 onClick={() => handleSuggestionSelect(product)}
 data-testid={`suggestion-${product.id}`}
 >
 <ProductImage src={product.imageUrl} alt={product.name} className="h-10 w-10 rounded-lg" iconClassName="h-4 w-4" fallbackIconColor={isDark ? "text-white/20" : "text-muted-foreground/30"} />
 <div className="flex-1 min-w-0">
 <div className={`text-sm font-medium truncate ${isDark ? "text-white" : ""}`}>{product.name}</div>
 <div className={`text-[11px] truncate ${isDark ? "text-white/40" : "text-muted-foreground"}`}>
 {product.articleNumber && (
 <span className="font-mono tabular-nums">{product.articleNumber} · </span>
 )}
 {product.supplier?.companyName || product.supplier?.name}
 {product.category && ` · ${lang === "it" ? (categoryConfig[product.category]?.it || product.category) : (categoryConfig[product.category]?.de || product.category)}`}
 </div>
 </div>
 <div className="text-right shrink-0">
 {hasPromo ? (
 <div className="flex flex-col items-end">
 <span className={`text-[10px] line-through ${isDark ? "text-white/30" : "text-muted-foreground"}`}>{originalPrice.toFixed(2)}€</span>
 <span className="text-sm font-bold text-green-500">{discountedPrice.toFixed(2)}€</span>
 </div>
 ) : (
 <span className={`text-sm font-bold ${isDark ? "text-white" : ""}`}>{originalPrice.toFixed(2)}€</span>
 )}
 <span className={`text-[10px] ${isDark ? "text-white/30" : "text-muted-foreground"}`}>/{product.unit}</span>
 </div>
 {!product.inStock && (
 <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-500/30 text-red-400 shrink-0">
 {lang === "de" ? "Aus" : "Esaurito"}
 </Badge>
 )}
 </button>
 );
 })
 ) : (
 <div className={`px-4 py-6 text-center ${isDark ? "text-white/40" : "text-muted-foreground"}`}>
 <Package className={`h-6 w-6 mx-auto mb-2 ${isDark ? "text-white/20" : "text-muted-foreground/30"}`} />
 <p className="text-sm">{t("common", "noProductsFound")}</p>
 </div>
 )}
 </div>
 );
 };

 const renderProductCard = (product: ProductWithSupplierAndPromotion) => {
 const promo = product.activePromotion;
 const hasPromo = !!promo;
 const originalPrice = parseFloat(product.price);
 const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;
 const cartQty = cartQtyByProduct.get(product.id) || 0;
 const insight = orderInsights?.[product.id];
 const previouslyOrdered = (insight?.timesOrdered || 0) > 0;
 const onTheWay = !!insight?.onTheWay;

 return (
 <div
 key={product.id}
 role="button"
 tabIndex={0}
 className={`flex flex-col text-left rounded-xl border border-border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!product.inStock ? "opacity-60" : ""}`}
 onClick={() => setLocation(`/restaurant/product/${product.id}`)}
 onKeyDown={(e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 setLocation(`/restaurant/product/${product.id}`);
 }
 }}
 data-testid={`product-card-${product.id}`}
 >
 <div className="relative w-full aspect-[4/3] overflow-hidden">
 <ProductImage src={product.imageUrl} alt={product.name} className="w-full h-full" iconClassName="h-8 w-8" fallbackIconColor="text-muted-foreground/20" />
 {(hasPromo || previouslyOrdered || onTheWay) && (
 <div className="absolute top-1.5 left-1.5 z-10 flex flex-col items-start gap-1">
 {hasPromo && (
 <Badge className="bg-green-600 text-white border-0 text-[9px] leading-tight px-1.5 py-0.5 whitespace-nowrap">
 -{promo.discountPercent}%
 </Badge>
 )}
 {previouslyOrdered && (
 <CategoryIndicator
 icon={History}
 bg="bg-blue-600"
 label={lang === "de" ? "Schon mal bestellt" : "Già ordinato"}
 testId={`badge-previously-ordered-${product.id}`}
 />
 )}
 {onTheWay && (
 <CategoryIndicator
 icon={Truck}
 bg="bg-amber-500"
 label={lang === "de" ? "Bestellung unterwegs" : "Ordine in arrivo"}
 testId={`badge-on-the-way-${product.id}`}
 />
 )}
 </div>
 )}
 {!product.inStock && (
 <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/40 to-black/20 flex flex-col items-center justify-center gap-1.5">
 <span className="text-[9px] font-semibold text-white/90 bg-red-600/90 px-2 py-0.5 rounded-full tracking-wide uppercase">
 {lang === "de" ? "Nicht verfügbar" : "Non disponibile"}
 </span>
 <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full border border-white/25 hover:bg-white/30 transition-colors">
 {lang === "de" ? "Alternativen ansehen" : "Vedi alternative"}
 <ArrowLeft className="h-2.5 w-2.5 rotate-180" />
 </span>
 </div>
 )}
 {product.inStock && (
 <div className="absolute top-1.5 right-1.5 z-10">
 <QuickAddBar product={product} lang={lang} t={t} />
 </div>
 )}
 </div>
 <div className="p-2 flex flex-col gap-0.5 flex-1 overflow-hidden min-w-0">
 <span className="text-xs font-semibold truncate block">{product.name}</span>
 <span className="text-[10px] text-muted-foreground truncate block">
 {product.supplier?.companyName || product.supplier?.name}
 </span>
 <div className="mt-auto pt-1 flex items-center justify-between gap-1.5">
 <div className="min-w-0">
 {hasPromo ? (
 <div className="flex items-baseline gap-0.5 flex-wrap">
 <span className="text-[9px] text-muted-foreground line-through">{originalPrice.toFixed(2)}</span>
 <span className="text-[11px] font-bold text-green-600 dark:text-green-400">{discountedPrice.toFixed(2)}€</span>
 <span className="text-[9px] text-muted-foreground">/{product.unit}</span>
 </div>
 ) : (
 <div className="flex items-baseline gap-0.5 flex-wrap">
 <span className="text-[11px] font-bold">{originalPrice.toFixed(2)}€</span>
 <span className="text-[9px] text-muted-foreground">/{product.unit}</span>
 </div>
 )}
 </div>
 {product.inStock && cartQty > 0 && (
 <div
 className="inline-flex items-center gap-1 shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
 data-testid={`text-cart-qty-${product.id}`}
 >
 <ShoppingCart className="h-2.5 w-2.5 shrink-0" />
 {cartQty}
 </div>
 )}
 </div>
 </div>
 </div>
 );
 };

 return (
 <PullToRefreshWrapper
 onRefresh={async () => {
 await queryClient.invalidateQueries({
 predicate: (query) => {
 const key = query.queryKey[0];
 return typeof key === "string" && (key.startsWith("/api/products") || key.startsWith("/api/suppliers"));
 },
 });
 }}
 className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0"
 >
 {!selectedCategory ? (
 <>
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3" data-testid="catalog-hero"><SectionTabs />
 <div>
 <h1 className="m-type-display text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
 {lang === "de" ? "Produktkatalog" : "Catalogo prodotti"}
 </h1>
 <p className="text-sm text-white/50 mt-1">
 {lang === "de"
 ? "Durchsuchen Sie verfügbare Produkte Ihrer Lieferanten."
 : "Esplora i prodotti disponibili dei tuoi fornitori."}
 </p>
 </div>

 <div className="relative" ref={searchContainerRef}>
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 z-10" />
 <Input
 placeholder={lang === "de" ? "Produkt suchen..." : "Cerca prodotto..."}
 value={globalSearch}
 onChange={(e) => handleGlobalSearchChange(e.target.value)}
 onFocus={() => { if (globalSearch.length >= 2) setShowSuggestions(true); }}
 onKeyDown={handleSearchKeyDown}
 className="pl-9 h-10 text-sm bg-white/[0.07] border-white/10 text-white placeholder:text-white/30 focus:border-white/30 focus:ring-white/10"
 data-testid="input-global-search"
 />
 {renderSuggestionDropdown(true)}
 </div>

 {supplierCards.length > 1 && (
 <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
 <button
 onClick={() => setSelectedSupplier("all")}
 className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
 selectedSupplier === "all"
 ? "border-white/40 bg-white/20 text-white shadow-sm"
 : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
 }`}
 data-testid="filter-supplier-all"
 >
 <Store className="h-3.5 w-3.5" />
 <span>{t("common", "all")}</span>
 <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/15">{products?.length || 0}</span>
 </button>
 {supplierCards.map(supplier => {
 const isActive = selectedSupplier === supplier.id;
 return (
 <button
 key={supplier.id}
 onClick={() => setSelectedSupplier(supplier.id)}
 className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
 isActive
 ? "border-white/40 bg-white/20 text-white shadow-sm"
 : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
 }`}
 data-testid={`filter-supplier-${supplier.id}`}
 >
 <Avatar className="h-4 w-4">
 <AvatarImage src={supplier.profileImageUrl || undefined} />
 <AvatarFallback className="text-[7px] font-semibold bg-white/20 text-white">
 {supplier.name.substring(0, 2).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 <span className="max-w-[80px] truncate">{supplier.name}</span>
 <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/15">{supplier.productCount}</span>
 </button>
 );
 })}
 </div>
 )}
 </div></HeroPortal>

 {productsLoading ? (
 <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
 {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
 <Skeleton key={i} className="h-36 rounded-xl" />
 ))}
 </div>
 ) : categoriesWithProducts.length > 0 ? (
 <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
 {(() => {
 const allCount = productsByCategory("__all__").length;
 return (
 <button
 key="__all__"
 onClick={() => { setSelectedCategory("__all__"); setSearchQuery(""); }}
 className="flex flex-col items-center gap-3 p-5 md:p-6 rounded-xl border border-border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
 data-testid="category-button-all"
 >
 <div className="flex items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-full bg-foreground text-background shadow-lg group-hover:scale-105 transition-transform">
 <Package className="h-8 w-8 md:h-10 md:w-10" />
 </div>
 <span className="text-sm md:text-base font-semibold text-center leading-tight">
 {lang === "it" ? "Tutti" : "Alle"}
 </span>
 <span className="text-xs text-muted-foreground">
 {allCount} {allCount === 1 ? (lang === "de" ? "Produkt" : "prodotto") : (lang === "de" ? "Produkte" : "prodotti")}
 </span>
 </button>
 );
 })()}
 {categoriesWithProducts.map(cat => {
 const conf = categoryConfig[cat];
 const CatIcon = conf.icon;
 const count = categoryProductCount(cat);
 return (
 <button
 key={cat}
 onClick={() => { setSelectedCategory(cat); setSearchQuery(""); }}
 className="flex flex-col items-center gap-3 p-5 md:p-6 rounded-xl border border-border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
 data-testid={`category-button-${cat}`}
 >
 <div className={`flex items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-full ${conf.color} text-white shadow-lg group-hover:scale-105 transition-transform`}>
 <CatIcon className="h-8 w-8 md:h-10 md:w-10" />
 </div>
 <span className="text-sm md:text-base font-semibold text-center leading-tight">
 {lang === "it" ? conf.it : conf.de}
 </span>
 <span className="text-xs text-muted-foreground">
 {count} {count === 1 ? (lang === "de" ? "Produkt" : "prodotto") : (lang === "de" ? "Produkte" : "prodotti")}
 </span>
 </button>
 );
 })}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-12">
 <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
 <p className="text-muted-foreground">{t("common", "noProductsFound")}</p>
 </div>
 )}
 </>
 ) : (
 <>
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3" data-testid="catalog-category-hero">
 <div className="flex items-center gap-2">
 {(() => {
 const isAll = selectedCategory === "__all__";
 const conf = isAll ? null : categoryConfig[selectedCategory];
 const CatIcon = conf?.icon || Package;
 const title = isAll ? (lang === "it" ? "Tutti" : "Alle") : (lang === "it" ? conf?.it : conf?.de);
 return (
 <>
 <div className={`flex items-center justify-center h-8 w-8 rounded-full ${isAll ? "bg-foreground text-background" : `${conf?.color || "bg-gray-500"} text-white`} shrink-0`}>
 <CatIcon className="h-4 w-4" />
 </div>
 <h2 className="m-type-h1 text-lg md:text-xl font-bold text-white truncate">
 {title}
 </h2>
 </>
 );
 })()}
 </div>

 {supplierCards.length > 1 && (
 <div className="flex gap-2 md:gap-1.5 overflow-x-auto pb-1 scrollbar-hide -mx-3 md:mx-0 px-3 md:px-0 [mask-image:linear-gradient(to_right,transparent_0,black_16px,black_calc(100%-16px),transparent_100%)] md:[mask-image:none]">
 <button
 onClick={() => { setSelectedSupplier("all"); }}
 className={`flex items-center gap-1.5 min-h-[40px] md:min-h-0 px-3.5 py-2 md:px-2.5 md:py-1.5 rounded-full text-[14px] md:text-xs font-medium transition-all shrink-0 border ${
 selectedSupplier === "all"
 ? "border-white/40 bg-white/20 text-white shadow-sm"
 : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
 }`}
 data-testid="filter-supplier-all-inner"
 >
 <Store className="h-4 w-4 md:h-3.5 md:w-3.5 shrink-0" />
 <span>{t("common", "all")}</span>
 </button>
 {supplierCards.map(supplier => {
 const isActive = selectedSupplier === supplier.id;
 return (
 <button
 key={supplier.id}
 onClick={() => setSelectedSupplier(supplier.id)}
 className={`flex items-center gap-1.5 min-h-[40px] md:min-h-0 px-3.5 py-2 md:px-2.5 md:py-1.5 rounded-full text-[14px] md:text-xs font-medium transition-all shrink-0 border ${
 isActive
 ? "border-white/40 bg-white/20 text-white shadow-sm"
 : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
 }`}
 data-testid={`filter-supplier-inner-${supplier.id}`}
 >
 <Avatar className="h-5 w-5 md:h-4 md:w-4 shrink-0">
 <AvatarImage src={supplier.profileImageUrl || undefined} />
 <AvatarFallback className="text-[8px] md:text-[7px] font-semibold bg-white/20 text-white">
 {supplier.name.substring(0, 2).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 <span className="max-w-[120px] md:max-w-[80px] truncate">{supplier.name}</span>
 </button>
 );
 })}
 </div>
 )}
 </div></HeroPortal>

 <button
 onClick={() => { setSelectedCategory(null); setSearchQuery(""); }}
 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1"
 data-testid="button-back-to-categories"
 >
 <ArrowLeft className="h-4 w-4" />
 {lang === "de" ? "Zurück" : "Indietro"}
 </button>

 <div className="flex flex-col sm:flex-row gap-2 md:gap-4">
 <div className="relative flex-1" ref={!selectedCategory ? undefined : searchContainerRef}>
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground z-10" />
 <Input
 placeholder={t("common", "searchProducts")}
 value={searchQuery}
 onChange={(e) => {
 setSearchQuery(e.target.value);
 handleGlobalSearchChange(e.target.value);
 }}
 onFocus={() => { if (searchQuery.length >= 2) setShowSuggestions(true); }}
 onKeyDown={handleSearchKeyDown}
 className="pl-9 h-11 md:h-10 text-[14px]"
 data-testid="input-search-products"
 />
 {renderSuggestionDropdown(false)}
 </div>
 <div className="flex flex-row gap-2 flex-wrap">
 <Button
 variant={onlyAvailable ? "default" : "outline"}
 onClick={() => setOnlyAvailable(!onlyAvailable)}
 className={`text-xs md:text-sm toggle-elevate transition-all ${
 onlyAvailable
 ? "bg-primary text-primary-foreground border-primary font-semibold shadow-md ring-2 ring-primary/30 hover:bg-primary/90"
 : "bg-white dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-800"
 }`}
 data-testid="toggle-available-only"
 >
 <Package className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
 {t("common", "onlyAvailable")}
 {onlyAvailable && <Check className="h-3.5 w-3.5 ml-1.5" />}
 </Button>
 <Button
 variant={onlyPromotions ? "default" : "outline"}
 onClick={() => setOnlyPromotions(!onlyPromotions)}
 className={`text-xs md:text-sm toggle-elevate transition-all ${
 onlyPromotions
 ? "bg-primary text-primary-foreground border-primary font-semibold shadow-md ring-2 ring-primary/30 hover:bg-primary/90"
 : "bg-white dark:bg-zinc-900 hover:bg-white dark:hover:bg-zinc-800"
 }`}
 data-testid="toggle-promotions-only"
 >
 <Tag className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5" />
 {t("common", "promotions")}
 {onlyPromotions && <Check className="h-3.5 w-3.5 ml-1.5" />}
 </Button>
 </div>
 </div>

 {categoryFilteredProducts.length > 0 ? (
 <div className="grid gap-2 md:gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 mt-4 md:mt-5">
 {categoryFilteredProducts.map(renderProductCard)}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-12">
 <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
 <p className="text-muted-foreground">{t("common", "noProductsFound")}</p>
 <p className="text-sm text-muted-foreground mt-1">
 {t("common", "tryDifferentSearch")}
 </p>
 </div>
 )}
 </>
 )}

 <CartPillMobile lang={lang} setLocation={setLocation} />
 <CartPillDesktop lang={lang} setLocation={setLocation} />
 </PullToRefreshWrapper>
 );
}
