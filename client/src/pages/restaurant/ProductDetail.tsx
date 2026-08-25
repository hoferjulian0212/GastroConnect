import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ArrowLeft, Package, ShoppingCart, Check, Clock, Tag, Euro, Layers, Info, Percent, Store, History, Repeat, TrendingUp, TrendingDown, CalendarDays, AlertTriangle, ShieldCheck, Leaf, Flame, ZoomIn, User, Phone, Mail, MapPin, Recycle } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import QuantityInput from "@/components/QuantityInput";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { de, it } from "date-fns/locale";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { ProductWithSupplierAndPromotion, ProductWithLocalImpact, CartItemWithProduct, ProductPurchaseHistoryEntry } from "@shared/schema";
import { formatOrderNumber } from "@shared/schema";
import { productMatchKey, normalizeName } from "@shared/productMatch";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { useFlyToCart } from "@/hooks/use-fly-to-cart";
import { pluralizeUnit } from "@/lib/units";
import { ProductImage } from "@/components/ProductImage";
import { HeroPortal } from "@/context/HeroContext";
import { can } from "@shared/permissions";

export default function ProductDetail() {
  const [, params] = useRoute("/restaurant/product/:id");
  const productId = params?.id;
  const [, setLocation] = useLocation();
  const { currentUser, currentMember } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const dateLocale = lang === "it" ? it : de;
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { triggerFly } = useFlyToCart();

  const { data: products, isLoading } = useQuery<ProductWithLocalImpact[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: cartItems } = useQuery<CartItemWithProduct[]>({
    queryKey: [`/api/cart?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: purchaseHistory = [], isLoading: historyLoading } = useQuery<ProductPurchaseHistoryEntry[]>({
    queryKey: [`/api/products/${productId}/purchase-history?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id && !!productId,
  });

  const product = products?.find(p => p.id === productId);

  const getMinOrderQty = (p: ProductWithSupplierAndPromotion) =>
    p.minOrderQuantity && p.minOrderQuantity > 1 ? p.minOrderQuantity : 1;

  useEffect(() => {
    if (product) {
      const cartItem = cartItems?.find(ci => ci.productId === product.id);
      setQuantity(cartItem?.quantity || getMinOrderQty(product));
    }
  }, [product, cartItems]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("common", "productAddError"), variant: "destructive" });
    },
  });

  const handleAddToCart = (p: ProductWithSupplierAndPromotion, qty?: number, sourceEvent?: React.MouseEvent) => {
    const btn = sourceEvent?.currentTarget as HTMLElement | undefined;
    if (btn) {
      triggerFly(btn, p.imageUrl);
    }
    addToCartMutation.mutate({
      productId: p.id,
      supplierId: p.supplierId,
      quantity: qty || quantity,
    });
  };

  const outOfStockAlternatives = product && products && !product.inStock
    ? (() => {
        // When a product is out of stock, the strongest substitute is the SAME
        // product offered by a different supplier (matched by barcode, else by
        // a normalized name+unit key). After exact matches we fall back to the
        // same category / similar name, breaking ties by price closeness.
        const targetKey = productMatchKey({ name: product.name, unit: product.unit, gtin: product.gtin });
        const nameWords = normalizeName(product.name).split(/\s+/).filter(w => w.length > 2);
        const targetPrice = parseFloat(product.price);

        const candidates = products
          .filter(p => p.id !== product.id && p.inStock)
          .map(p => {
            const isExactMatch = productMatchKey({ name: p.name, unit: p.unit, gtin: p.gtin }) === targetKey;
            const isSameSupplier = p.supplierId === product.supplierId;
            const isSameCategory = !!(product.category && p.category && p.category === product.category);
            const pNameNorm = normalizeName(p.name);
            const nameMatchCount = nameWords.filter(w => pNameNorm.includes(w)).length;
            const nameMatchRatio = nameWords.length > 0 ? nameMatchCount / nameWords.length : 0;
            const unitMatch = p.unit === product.unit;
            const priceDelta = Number.isFinite(targetPrice) ? Math.abs(parseFloat(p.price) - targetPrice) : 0;

            if (!isExactMatch && !isSameCategory && nameMatchRatio === 0) return null;

            return {
              product: p,
              isExactMatch,
              isSameSupplier,
              isSameCategory,
              nameMatchRatio,
              unitMatch,
              priceDelta,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null)
          .sort((a, b) => {
            if (a.isExactMatch !== b.isExactMatch) return a.isExactMatch ? -1 : 1;
            if (a.isSameCategory !== b.isSameCategory) return a.isSameCategory ? -1 : 1;
            if (a.nameMatchRatio !== b.nameMatchRatio) return b.nameMatchRatio - a.nameMatchRatio;
            if (a.unitMatch !== b.unitMatch) return a.unitMatch ? -1 : 1;
            if (a.isSameSupplier !== b.isSameSupplier) return a.isSameSupplier ? -1 : 1;
            return a.priceDelta - b.priceDelta;
          })
          .slice(0, 6);

        return candidates;
      })()
    : [];


  const alsoFromSupplier = product && products
    ? products
        .filter(p => p.id !== product.id && p.supplierId === product.supplierId && p.category !== product.category && p.inStock)
        .slice(0, 6)
    : [];

  const [addedRelated, setAddedRelated] = useState<Set<string>>(new Set());
  const [relatedQuantities, setRelatedQuantities] = useState<Record<string, number>>({});

  const handleAddRelated = (p: ProductWithSupplierAndPromotion, sourceEvent?: React.MouseEvent) => {
    const btn = sourceEvent?.currentTarget as HTMLElement | undefined;
    if (btn) triggerFly(btn, p.imageUrl);
    const qty = relatedQuantities[p.id] || getMinOrderQty(p);
    addToCartMutation.mutate({ productId: p.id, supplierId: p.supplierId, quantity: qty }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
        setAddedRelated(prev => new Set(prev).add(p.id));
        setTimeout(() => setAddedRelated(prev => { const n = new Set(prev); n.delete(p.id); return n; }), 2000);
      },
    });
  };

  const renderRelatedCard = (p: ProductWithSupplierAndPromotion) => {
    const promo = p.activePromotion;
    const hasPromo = !!promo;
    const originalPrice = parseFloat(p.price);
    const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;
    const isAdded = addedRelated.has(p.id);

    return (
      <Card
        key={p.id}
        className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003]"
        data-testid={`related-product-card-${p.id}`}
        onClick={() => setLocation(`/restaurant/product/${p.id}`)}
      >
        <CardContent className="p-2.5 md:p-3 flex flex-col overflow-hidden">
          <div className="relative">
            <ProductImage src={p.imageUrl} alt={p.name} className="w-full aspect-square md:aspect-[4/3] rounded-lg" iconClassName="h-8 w-8" fallbackIconColor="text-muted-foreground/30" />
            {hasPromo && (
              <div className="absolute top-1.5 left-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold px-1.5 py-0.5 shadow-sm">
                -{promo.discountPercent}%
              </div>
            )}
          </div>
          <div className="mt-1.5 min-w-0 flex-1 flex flex-col">
            <h3 className="font-medium text-sm truncate">{p.name}</h3>
            {product && p.supplierId !== product.supplierId && (p.supplier?.companyName || p.supplier?.name) && (
              <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground truncate" data-testid={`text-related-supplier-${p.id}`}>
                <Store className="h-3 w-3 shrink-0" />
                <span className="truncate">{p.supplier?.companyName || p.supplier?.name}</span>
              </div>
            )}
            <div className="flex items-baseline gap-1 mt-0.5">
              {hasPromo ? (
                <>
                  <span className="text-[11px] text-muted-foreground line-through">{originalPrice.toFixed(2)}</span>
                  <span className="font-bold text-sm text-green-600 dark:text-green-400">{discountedPrice.toFixed(2)}€</span>
                </>
              ) : (
                <span className="font-bold text-sm">{originalPrice.toFixed(2)}€</span>
              )}
              <span className="text-xs text-muted-foreground">/{p.unit}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-auto pt-2">
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <QuantityInput
                  value={relatedQuantities[p.id] || getMinOrderQty(p)}
                  onChange={(val) => setRelatedQuantities(prev => ({ ...prev, [p.id]: val }))}
                  min={getMinOrderQty(p)}
                  disabled={!p.inStock}
                  size="sm"
                  testIdPrefix={`related-qty-${p.id}`}
                />
              </div>
              <Button
                variant={isAdded ? "default" : "outline"}
                size="sm"
                className={`gap-1 text-xs min-w-0 px-2 ${
                  isAdded
                    ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate animate-cart-added"
                    : "transition-all duration-200"
                }`}
                disabled={!p.inStock || addToCartMutation.isPending}
                onClick={(e) => { e.stopPropagation(); handleAddRelated(p, e); }}
                data-testid={`button-add-related-${p.id}`}
              >
                {isAdded ? <Check className="h-3.5 w-3.5 shrink-0 animate-cart-check" /> : <ShoppingCart className="h-3.5 w-3.5 shrink-0" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Package className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">{lang === "de" ? "Produkt nicht gefunden" : "Prodotto non trovato"}</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation("/restaurant/catalog")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {lang === "de" ? "Zurück zum Katalog" : "Torna al catalogo"}
        </Button>
      </div>
    );
  }

  const promo = product.activePromotion;
  const hasPromo = !!promo;
  const originalPrice = parseFloat(product.price);
  const discountedPrice = hasPromo ? originalPrice * (1 - promo.discountPercent / 100) : originalPrice;

  const remainingPromoText = (() => {
    if (!hasPromo || !promo.endDate) return null;
    const now = new Date();
    const end = new Date(promo.endDate);
    const daysLeft = differenceInDays(end, now);
    const hoursLeft = differenceInHours(end, now);
    let remainingText = "";
    if (daysLeft <= 0 && hoursLeft > 0) remainingText = t("common", "endsToday");
    else if (daysLeft === 1) remainingText = t("common", "oneDay");
    else if (daysLeft > 1) remainingText = `${t("common", "still")} ${daysLeft} ${t("common", "daysLeft")}`;
    else remainingText = t("common", "endsSoon");
    return `${remainingText} — ${format(end, "dd.MM.yyyy", { locale: dateLocale })}`;
  })();

  const historyStats = (() => {
    if (purchaseHistory.length === 0) return null;
    const totalQuantity = purchaseHistory.reduce((sum, e) => sum + e.quantity, 0);
    const totalSpent = purchaseHistory.reduce((sum, e) => sum + e.totalPrice, 0);
    const avgUnitPrice = totalQuantity > 0
      ? purchaseHistory.reduce((sum, e) => sum + e.unitPrice * e.quantity, 0) / totalQuantity
      : 0;
    const firstPrice = purchaseHistory[0].unitPrice;
    const lastPrice = purchaseHistory[purchaseHistory.length - 1].unitPrice;
    const priceDeltaPct = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
    const lastOrdered = purchaseHistory[purchaseHistory.length - 1].createdAt;
    const chartData = purchaseHistory.map((e) => ({
      date: format(new Date(e.createdAt), "dd.MM.yy", { locale: dateLocale }),
      price: Number(e.unitPrice.toFixed(2)),
    }));
    return {
      orderCount: purchaseHistory.length,
      totalQuantity,
      totalSpent,
      avgUnitPrice,
      priceDeltaPct,
      lastOrdered,
      chartData,
    };
  })();

  const statusLabel = (status: ProductPurchaseHistoryEntry["status"]) => {
    const map: Record<string, { de: string; it: string }> = {
      pending: { de: "Ausstehend", it: "In attesa" },
      confirmed: { de: "Bestätigt", it: "Confermato" },
      partially_confirmed: { de: "Teilbestätigt", it: "Parz. confermato" },
      scheduled: { de: "Geplant", it: "Pianificato" },
      in_delivery: { de: "Unterwegs", it: "In viaggio" },
      delivered: { de: "Geliefert", it: "Consegnato" },
      cancelled: { de: "Storniert", it: "Annullato" },
    };
    return lang === "de" ? map[status]?.de ?? status : map[status]?.it ?? status;
  };

  const effectiveUnitPrice = hasPromo ? discountedPrice : originalPrice;

  const nutritionRows = (() => {
    const n = product.nutrition;
    if (!n) return [] as { key: string; label: string; value: string; indent?: boolean }[];
    const rows: { key: string; label: string; value: string; indent?: boolean }[] = [];
    if (n.energyKcal != null) rows.push({ key: "energy", label: lang === "de" ? "Energie" : "Energia", value: `${n.energyKcal} kcal` });
    if (n.fat != null) rows.push({ key: "fat", label: lang === "de" ? "Fett" : "Grassi", value: `${n.fat} g` });
    if (n.saturatedFat != null) rows.push({ key: "saturatedFat", label: lang === "de" ? "davon gesättigte Fettsäuren" : "di cui acidi grassi saturi", value: `${n.saturatedFat} g`, indent: true });
    if (n.carbs != null) rows.push({ key: "carbs", label: lang === "de" ? "Kohlenhydrate" : "Carboidrati", value: `${n.carbs} g` });
    if (n.sugar != null) rows.push({ key: "sugar", label: lang === "de" ? "davon Zucker" : "di cui zuccheri", value: `${n.sugar} g`, indent: true });
    if (n.protein != null) rows.push({ key: "protein", label: lang === "de" ? "Eiweiß" : "Proteine", value: `${n.protein} g` });
    if (n.salt != null) rows.push({ key: "salt", label: lang === "de" ? "Salz" : "Sale", value: `${n.salt} g` });
    return rows;
  })();

  return (
    <div>
      <HeroPortal mobileWrapperClassName="!mx-2">
        <div className="px-3 md:px-6 pt-2 md:pt-1 pb-5 md:pb-6" data-testid="product-detail-hero">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 md:gap-8">
            <div className="flex items-start gap-3 md:gap-5 min-w-0">
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => product.imageUrl && setLightboxOpen(true)}
                  className={`relative group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${product.imageUrl ? "cursor-zoom-in" : "cursor-default"}`}
                  data-testid="button-zoom-product-image"
                  aria-label={lang === "de" ? "Bild vergrößern" : "Ingrandisci immagine"}
                >
                  <ProductImage
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-20 h-20 md:w-28 md:h-28 rounded-2xl ring-1 ring-white/10"
                    iconClassName="h-8 w-8 md:h-10 md:w-10"
                    fallbackIconColor="text-white/20"
                  />
                  {product.imageUrl && (
                    <span className="absolute inset-0 flex items-end justify-end p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center justify-center h-6 w-6 rounded-full bg-black/50 backdrop-blur-sm">
                        <ZoomIn className="h-3.5 w-3.5 text-white" />
                      </span>
                    </span>
                  )}
                </button>
              </div>
              <div className="min-w-0 space-y-2.5 pt-0.5">
                <div className="space-y-1">
                  <h1 className="text-xl md:text-3xl font-bold text-white leading-tight" data-testid="text-product-name">{product.name}</h1>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-4 w-4 shrink-0">
                      <AvatarImage src={product.supplier?.profileImageUrl || undefined} />
                      <AvatarFallback className="text-[8px] bg-white/10 text-white/70 font-semibold">
                        {(product.supplier?.companyName || product.supplier?.name || "").substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs md:text-sm text-white/60 truncate">{product.supplier?.companyName || product.supplier?.name}</span>
                    {product.articleNumber && (
                      <span className="text-[10px] font-mono tabular-nums text-white/40 shrink-0" data-testid="text-product-article-number">
                        · {product.articleNumber}
                      </span>
                    )}
                  </div>

                  {product.supplier && ((product.supplier.companyName && product.supplier.name) || product.supplier.phone || product.supplier.email) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {product.supplier.companyName && product.supplier.name && (
                        <span className="flex items-center gap-1 text-[11px] text-white/45">
                          <User className="h-3 w-3 shrink-0" />
                          <span>{product.supplier.name}</span>
                        </span>
                      )}
                      {product.supplier.phone && (
                        <a
                          href={`tel:${product.supplier.phone}`}
                          className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/70 transition-colors"
                          data-testid="link-supplier-phone"
                        >
                          <Phone className="h-3 w-3 shrink-0" />
                          <span>{product.supplier.phone}</span>
                        </a>
                      )}
                      {product.supplier.email && (
                        <a
                          href={`mailto:${product.supplier.email}`}
                          className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/70 transition-colors"
                          data-testid="link-supplier-email"
                        >
                          <Mail className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[160px]">{product.supplier.email}</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {product.inStock ? (
                    <Badge variant="outline" className="bg-green-500/15 text-green-300 border-green-500/30">
                      {lang === "de" ? "Verfügbar" : "Disponibile"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30">
                      {lang === "de" ? "Nicht verfügbar" : "Non disponibile"}
                    </Badge>
                  )}
                  {product.category && (
                    <Badge variant="outline" className="bg-white/10 text-white/80 border-white/15">{product.category}</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="md:shrink-0 md:min-w-[260px] md:max-w-[320px] space-y-3 md:text-right">
              {hasPromo ? (
                <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/25 md:text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Percent className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-semibold text-green-300">
                      {lang === "de" ? `Aktion: -${promo.discountPercent}% Rabatt` : `Promozione: -${promo.discountPercent}% sconto`}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-white/50 line-through text-sm">{originalPrice.toFixed(2)}€</span>
                    <span className="text-xl font-bold text-green-300">{discountedPrice.toFixed(2)}€/{product.unit}</span>
                  </div>
                  {remainingPromoText && (
                    <div className="flex items-center gap-1.5 text-xs text-green-400/90">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span className="font-medium">{remainingPromoText}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5 md:justify-end">
                  <span className="text-2xl md:text-3xl font-bold text-white">{originalPrice.toFixed(2)}€</span>
                  <span className="text-sm md:text-base text-white/50">/{product.unit}</span>
                </div>
              )}
            </div>
          </div>

          {!product.inStock && outOfStockAlternatives.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">
                  {lang === "de"
                    ? `${outOfStockAlternatives.length} verfügbare Alternative${outOfStockAlternatives.length !== 1 ? "n" : ""} gefunden`
                    : `${outOfStockAlternatives.length} alternativ${outOfStockAlternatives.length !== 1 ? "e" : "a"} disponibil${outOfStockAlternatives.length !== 1 ? "i" : "e"}`}
                </span>
              </div>
              <p className="text-xs text-amber-300/70 mt-1">
                {lang === "de" ? "Siehe unten für Details" : "Vedi sotto per i dettagli"}
              </p>
            </div>
          )}
        </div>
      </HeroPortal>

      {/* Back button: shown below the dark hero, outside it, in the same position on mobile and desktop */}
      <div className="block px-3 md:px-6 lg:px-8 pt-3">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-1 px-1"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
          {lang === "de" ? "Zurück" : "Indietro"}
        </button>
      </div>

      <div className="space-y-5 md:space-y-6 px-3 md:px-6 pt-4 md:pt-6 pb-[var(--mobile-bottom-pad)] md:pb-8">

        <div className="grid gap-5 md:gap-6 lg:grid-cols-12 lg:items-start">

          <div className="order-2 lg:order-1 lg:col-span-8 space-y-5 md:space-y-6 min-w-0">
            {product.localImpact && can(currentMember?.role, "impact.analytics") && (
              <section className="rounded-2xl border bg-card p-5 md:p-6" data-testid="section-local-impact">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                      <span aria-hidden="true" className="text-lg leading-none">🌱</span>
                      {lang === "de" ? "Local & Wirkung" : "Locale e impatto"}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lang === "de"
                        ? "Nur hinterlegte Angaben werden bewertet; fehlende Daten bleiben unverfügbar."
                        : "Vengono valutati solo i dati disponibili; quelli mancanti restano non disponibili."}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {product.localImpact.score === null ? (lang === "de" ? "Nicht verfügbar" : "Non disponibile") : `${product.localImpact.score}/100`}
                  </Badge>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-6">
                  {[
                    ["📍", lang === "de" ? "Herkunft" : "Origine", product.localImpact.originLabel],
                    ["🌱", lang === "de" ? "Saison" : "Stagione", product.localImpact.isSeasonal === null ? null : product.localImpact.isSeasonal ? (lang === "de" ? "Aktuell saisonal" : "Attualmente stagionale") : (lang === "de" ? "Außerhalb der Saison" : "Fuori stagione")],
                    ["♻️", lang === "de" ? "Verpackung" : "Imballaggio", product.localImpact.packagingType],
                    ["📍", lang === "de" ? "Entfernung" : "Distanza", product.localImpact.distanceKm === null ? null : `ca. ${product.localImpact.distanceKm} km`],
                  ].map(([emoji, label, value]) => {
                    return (
                    <div key={String(label)} className="flex items-center justify-between gap-3 py-2.5 border-b">
                      <span className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden="true">{emoji as string}</span>{label as string}</span>
                      <span className="text-sm font-medium text-right">{(value as string | null) ?? (lang === "de" ? "Nicht verfügbar" : "Non disponibile")}</span>
                    </div>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-2">{lang === "de" ? "Score-Aufschlüsselung" : "Dettaglio punteggio"}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {product.localImpact.scoreBreakdown.map((factor) => (
                      <div key={factor.key} className="rounded-lg bg-muted/40 p-2 text-center">
                        <div className="text-xs text-muted-foreground">{factor.key === "local" ? "Local" : factor.key === "seasonal" ? (lang === "de" ? "Saison" : "Stagione") : (lang === "de" ? "Verpackung" : "Imballaggio")}</div>
                        <div className="font-semibold text-sm mt-0.5">{factor.value === null ? "—" : factor.value}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-3">
                    {lang === "de"
                      ? `Berechnung ${product.localImpact.calculationVersion}; Distanz ist eine Luftlinien-Schätzung. Abdeckung ${Math.round(product.localImpact.coverage * 100)}%.`
                      : `Calcolo ${product.localImpact.calculationVersion}; la distanza è una stima in linea d'aria. Copertura ${Math.round(product.localImpact.coverage * 100)}%.`}
                  </p>
                </div>
              </section>
            )}

            {product.allergens && (
              <div className="rounded-2xl border bg-card p-5 md:p-6" data-testid="section-allergens">
                <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  {lang === "de" ? "Allergene" : "Allergeni"}
                </h2>
                {product.allergens.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {product.allergens.map((a) => (
                      <span
                        key={a}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 text-sm font-medium"
                        data-testid={`badge-allergen-${a}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400" data-testid="text-no-allergens">
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    {lang === "de" ? "Keine deklarationspflichtigen Allergene" : "Nessun allergene da dichiarare"}
                  </p>
                )}
              </div>
            )}

            {product.ingredients && (
              <div className="rounded-2xl border bg-card p-5 md:p-6" data-testid="section-ingredients">
                <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                  <Leaf className="h-5 w-5 text-green-600 dark:text-green-400" />
                  {lang === "de" ? "Zutaten" : "Ingredienti"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-ingredients">
                  {product.ingredients}
                </p>
              </div>
            )}

            {nutritionRows.length > 0 && (
              <div className="rounded-2xl border bg-card p-5 md:p-6" data-testid="section-nutrition">
                <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-500" />
                  {lang === "de" ? "Nährwerte" : "Valori nutrizionali"}
                  <span className="text-xs font-normal text-muted-foreground">
                    {lang === "de" ? "pro 100 g" : "per 100 g"}
                  </span>
                </h2>
                <div className="overflow-hidden rounded-xl border">
                  {nutritionRows.map((row) => (
                    <div
                      key={row.key}
                      className={`flex items-center justify-between gap-3 px-4 py-2.5 border-b last:border-b-0 ${row.indent ? "pl-8" : ""}`}
                      data-testid={`row-nutrition-${row.key}`}
                    >
                      <span className={`text-sm ${row.indent ? "text-muted-foreground" : ""}`}>{row.label}</span>
                      <span className="text-sm font-semibold tabular-nums">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {product.description && (
              <div className="rounded-2xl border bg-card p-5 md:p-6">
                <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                  <Info className="h-5 w-5 text-muted-foreground" />
                  {lang === "de" ? "Beschreibung" : "Descrizione"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-product-description">
                  {product.description}
                </p>
              </div>
            )}

            {historyStats && (
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4" data-testid="section-purchase-stats">
                <div className="rounded-2xl border bg-card p-4 md:p-5" data-testid="stat-order-count">
                  <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1.5">
                    <Repeat className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lang === "de" ? "Bestellungen" : "Ordini"}</span>
                  </div>
                  <p className="font-bold text-2xl md:text-3xl">{historyStats.orderCount}<span className="text-base md:text-lg font-medium text-muted-foreground">×</span></p>
                </div>
                <div className="rounded-2xl border bg-card p-4 md:p-5" data-testid="stat-total-quantity">
                  <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1.5">
                    <Package className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lang === "de" ? "Menge gesamt" : "Quantità tot."}</span>
                  </div>
                  <p className="font-bold text-2xl md:text-3xl truncate">{historyStats.totalQuantity}<span className="text-base md:text-lg font-medium text-muted-foreground"> {product.unit}</span></p>
                </div>
                <div className="rounded-2xl border bg-card p-4 md:p-5" data-testid="stat-avg-price">
                  <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1.5">
                    <Euro className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lang === "de" ? "Ø Preis" : "Prezzo medio"}</span>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="font-bold text-2xl md:text-3xl">{historyStats.avgUnitPrice.toFixed(2)}€</p>
                    {Math.abs(historyStats.priceDeltaPct) >= 0.5 && (
                      <span
                        className={`flex items-center gap-0.5 text-xs md:text-sm font-medium ${
                          historyStats.priceDeltaPct > 0 ? "text-red-500 dark:text-red-400" : "text-green-600 dark:text-green-400"
                        }`}
                        data-testid="text-price-trend"
                      >
                        {historyStats.priceDeltaPct > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {Math.abs(historyStats.priceDeltaPct).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border bg-card p-4 md:p-5" data-testid="stat-last-ordered">
                  <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground mb-1.5">
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span className="truncate">{lang === "de" ? "Zuletzt bestellt" : "Ultimo ordine"}</span>
                  </div>
                  <p className="font-bold text-2xl md:text-3xl">{format(new Date(historyStats.lastOrdered), "dd.MM.yy", { locale: dateLocale })}</p>
                </div>
              </section>
            )}

            {historyLoading && (
              <div className="rounded-2xl border bg-card p-5 md:p-6 space-y-3" data-testid="section-purchase-history">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-56 w-full rounded-xl" />
              </div>
            )}

            {!historyLoading && !historyStats && (
              <div className="rounded-2xl border bg-card p-8 md:p-10 flex flex-col items-center justify-center text-center" data-testid="section-no-history">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <h2 className="text-base md:text-lg font-semibold mb-1">
                  {lang === "de" ? "Noch kein Bestellverlauf" : "Nessuno storico ordini"}
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {lang === "de"
                    ? "Sobald Sie dieses Produkt bestellen, sehen Sie hier die Preisentwicklung und Ihren Bestellverlauf."
                    : "Una volta ordinato questo prodotto, qui vedrai l'andamento dei prezzi e il tuo storico ordini."}
                </p>
              </div>
            )}

            {historyStats && (
              <div className="rounded-2xl border bg-card p-5 md:p-6" data-testid="section-purchase-history">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                    <History className="h-5 w-5 text-muted-foreground" />
                    {lang === "de" ? "Preisentwicklung" : "Andamento prezzo"}
                  </h2>
                  <span className="text-xs md:text-sm text-muted-foreground">€/{product.unit}</span>
                </div>
                {historyStats.chartData.length >= 2 ? (
                  <div className="h-56 md:h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={historyStats.chartData} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={(v) => `${v}€`} />
                        <Tooltip
                          isAnimationActive={false}
                          cursor={{ stroke: "hsl(var(--border))" }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm">
                                <p className="text-[11px] text-muted-foreground">{label}</p>
                                <p className="text-xs font-semibold">{(payload[0].value as number).toFixed(2)}€/{product.unit}</p>
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#priceFill)" dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    {lang === "de" ? "Noch nicht genug Bestellungen für ein Diagramm." : "Non ci sono ancora abbastanza ordini per un grafico."}
                  </p>
                )}
              </div>
            )}

            {historyStats && (
              <div className="rounded-2xl border bg-card p-5 md:p-6" data-testid="section-order-list">
                <h2 className="text-base md:text-lg font-semibold flex items-center gap-2 mb-4">
                  <Repeat className="h-5 w-5 text-muted-foreground" />
                  {lang === "de" ? "Ihr Bestellverlauf" : "Il tuo storico ordini"}
                </h2>
                <div className="overflow-hidden rounded-xl border">
                  {[...purchaseHistory].reverse().map((entry) => (
                    <button
                      key={entry.orderId}
                      onClick={() => setLocation(`/restaurant/orders/${entry.orderId}`)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                      data-testid={`row-history-${entry.orderId}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {format(new Date(entry.createdAt), "dd. MMM yyyy", { locale: dateLocale })}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          <span className="text-blue-600 dark:text-blue-400 font-mono">#{formatOrderNumber({ orderNumber: entry.orderNumber, id: entry.orderId })}</span> · {statusLabel(entry.status)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{entry.quantity} {pluralizeUnit(entry.unit, entry.quantity)}</p>
                        <p className="text-xs text-muted-foreground">{entry.unitPrice.toFixed(2)}€/{entry.unit}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="order-1 lg:order-2 lg:col-span-4 lg:self-start">
            <div className="space-y-5 md:space-y-6 lg:sticky lg:top-6">
            <div id="order-card" tabIndex={-1} className={`rounded-2xl border-[3px] bg-card p-5 md:p-6 scroll-mt-20 focus:outline-none ${product.inStock ? "border-green-500/60" : "border-red-500/60"}`} data-testid="card-order">
              <h2 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                {lang === "de" ? "Jetzt bestellen" : "Ordina ora"}
              </h2>

              {hasPromo ? (
                <div className="mb-4">
                  <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-semibold">
                    <Percent className="h-3.5 w-3.5" />
                    {lang === "de" ? `-${promo.discountPercent}% Aktion` : `-${promo.discountPercent}% promo`}
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-3xl md:text-4xl font-bold text-green-600 dark:text-green-400" data-testid="text-order-price">{discountedPrice.toFixed(2)}€</span>
                    <span className="text-sm text-muted-foreground">/{product.unit}</span>
                    <span className="text-base text-muted-foreground line-through">{originalPrice.toFixed(2)}€</span>
                  </div>
                  {remainingPromoText && (
                    <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 mt-1.5">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium">{remainingPromoText}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl md:text-4xl font-bold" data-testid="text-order-price">{originalPrice.toFixed(2)}€</span>
                  <span className="text-sm text-muted-foreground">/{product.unit}</span>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4 text-sm" data-testid="text-order-stock">
                {product.inStock ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-green-600 dark:text-green-400 font-medium">{lang === "de" ? "Auf Lager" : "Disponibile"}</span>
                    {typeof product.stockQuantity === "number" && product.stockQuantity > 0 && (
                      <span className="text-muted-foreground">· {product.stockQuantity} {pluralizeUnit(product.unit, product.stockQuantity ?? 0)}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-red-600 dark:text-red-400 font-medium">{lang === "de" ? "Nicht verfügbar" : "Non disponibile"}</span>
                  </>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">{lang === "de" ? "Menge" : "Quantità"}</span>
                  <QuantityInput
                    value={quantity}
                    onChange={setQuantity}
                    min={getMinOrderQty(product)}
                    disabled={!product.inStock}
                    size="md"
                    testIdPrefix="detail-qty"
                  />
                </div>
                <Button
                  size="lg"
                  className={`w-full gap-2 text-base ${
                    added
                      ? "bg-green-500 border-green-500 text-white hover:bg-green-500 no-default-hover-elevate no-default-active-elevate"
                      : ""
                  }`}
                  disabled={!product.inStock || addToCartMutation.isPending}
                  onClick={(e) => handleAddToCart(product, undefined, e)}
                  data-testid="button-add-to-cart"
                >
                  {added ? (
                    <>
                      <Check className="h-5 w-5" />
                      {lang === "de" ? "Hinzugefuegt" : "Aggiunto"}
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-5 w-5" />
                      {lang === "de" ? "In den Warenkorb" : "Aggiungi al carrello"}
                    </>
                  )}
                </Button>
                {product.inStock && (
                  <p className="text-center text-sm text-muted-foreground" data-testid="text-order-subtotal">
                    {lang === "de" ? "Zwischensumme" : "Subtotale"}:{" "}
                    <span className="font-semibold text-foreground">{(effectiveUnitPrice * quantity).toFixed(2)}€</span>
                  </p>
                )}
              </div>

              {product.minOrderQuantity && product.minOrderQuantity > 1 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {t("supplierProducts", "belowMinOrder").replace("{min}", String(product.minOrderQuantity)).replace("{unit}", product.unit)}
                </p>
              )}
            </div>

            <div className="rounded-2xl border bg-card p-5 md:p-6">
              <h2 className="text-base md:text-lg font-semibold mb-4 flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                {lang === "de" ? "Produktdetails" : "Dettagli prodotto"}
              </h2>
              <div className="divide-y">
                <div className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Euro className="h-4 w-4 shrink-0" />
                    {hasPromo ? (lang === "de" ? "Originalpreis" : "Prezzo orig.") : (lang === "de" ? "Preis" : "Prezzo")}
                  </span>
                  <span className="font-semibold text-sm md:text-base text-right">{product.price}€/{product.unit}</span>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Layers className="h-4 w-4 shrink-0" />
                    {lang === "de" ? "Einheit" : "Unità"}
                  </span>
                  <span className="font-semibold text-sm md:text-base text-right">{product.unit}</span>
                </div>
                {product.category && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tag className="h-4 w-4 shrink-0" />
                      {lang === "de" ? "Kategorie" : "Categoria"}
                    </span>
                    <span className="font-medium text-sm md:text-base text-right truncate">{product.category}</span>
                  </div>
                )}
                {product.articleNumber && (
                  <div className="flex items-center justify-between gap-3 py-3">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4 shrink-0" />
                      {lang === "de" ? "Artikelnr." : "Cod. articolo"}
                    </span>
                    <span className="font-mono tabular-nums text-sm text-right">{product.articleNumber}</span>
                  </div>
                )}
              </div>
            </div>
            </div>
          </aside>
        </div>

        {!product.inStock && outOfStockAlternatives.length > 0 && (
          <section>
            <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
              <Package className="h-5 w-5 text-amber-500" />
              {lang === "de" ? "Verfügbare Alternativen" : "Alternative disponibili"}
            </h2>
            <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {outOfStockAlternatives.map(alt => renderRelatedCard(alt.product))}
            </div>
          </section>
        )}

        {alsoFromSupplier.length > 0 && (
          <section>
            <h2 className="text-base md:text-lg font-semibold mb-3">
              {lang === "de"
                ? `Mehr von ${product.supplier?.companyName || product.supplier?.name}`
                : `Altro da ${product.supplier?.companyName || product.supplier?.name}`}
            </h2>
            <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {alsoFromSupplier.map(renderRelatedCard)}
            </div>
          </section>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[90vw] md:max-w-2xl p-2 bg-black/90 border-white/10" data-testid="dialog-image-lightbox">
          <VisuallyHidden><DialogTitle>{product?.name}</DialogTitle></VisuallyHidden>
          <img
            src={product?.imageUrl ?? ""}
            alt={product?.name ?? ""}
            className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            data-testid="img-lightbox-product"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
