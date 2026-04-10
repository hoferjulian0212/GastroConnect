import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, ArrowUpDown, TrendingDown, TrendingUp, Store, Package, Filter, ChevronDown, ChevronUp, ShoppingBag } from "lucide-react";
import type { ProductWithSupplierAndPromotion } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

interface GroupedProduct {
  name: string;
  category: string;
  unit: string;
  offers: {
    product: ProductWithSupplierAndPromotion;
    effectivePrice: number;
    originalPrice: number;
    hasPromo: boolean;
    promoPercent: number;
  }[];
  cheapest: number;
  mostExpensive: number;
  savingsPercent: number;
}

export default function PriceComparison() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "savings" | "price">("savings");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const { data: products, isLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
    queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: customPrices } = useQuery<Array<{ productId: string; supplierId: string; restaurantId: string; customPrice: string }>>({
    queryKey: [`/api/custom-prices?restaurantId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const customPriceMap = useMemo(() => {
    const map = new Map<string, number>();
    if (customPrices) {
      customPrices.forEach(cp => {
        if (cp.restaurantId === currentUser?.id) {
          map.set(cp.productId, parseFloat(cp.customPrice));
        }
      });
    }
    return map;
  }, [customPrices, currentUser?.id]);

  const grouped = useMemo(() => {
    if (!products) return [];

    const inStockProducts = products.filter(p => p.inStock);

    const groups = new Map<string, GroupedProduct>();

    for (const product of inStockProducts) {
      const normalizedName = product.name.trim().toLowerCase();
      const key = `${normalizedName}__${product.unit}`;

      const basePrice = parseFloat(product.price);
      const customPrice = customPriceMap.get(product.id);
      let effectivePrice = customPrice ?? basePrice;
      let promoPercent = 0;
      const hasPromo = !!product.activePromotion;

      if (product.activePromotion) {
        promoPercent = product.activePromotion.discountPercent;
        effectivePrice = effectivePrice * (1 - promoPercent / 100);
      }

      const offer = {
        product,
        effectivePrice: Math.round(effectivePrice * 100) / 100,
        originalPrice: customPrice ?? basePrice,
        hasPromo,
        promoPercent,
      };

      if (groups.has(key)) {
        const group = groups.get(key)!;
        group.offers.push(offer);
      } else {
        groups.set(key, {
          name: product.name,
          category: product.category || (lang === "de" ? "Sonstige" : "Altro"),
          unit: product.unit,
          offers: [offer],
          cheapest: 0,
          mostExpensive: 0,
          savingsPercent: 0,
        });
      }
    }

    const result: GroupedProduct[] = [];

    groups.forEach(group => {
      if (group.offers.length < 2) return;

      group.offers.sort((a, b) => a.effectivePrice - b.effectivePrice);
      group.cheapest = group.offers[0].effectivePrice;
      group.mostExpensive = group.offers[group.offers.length - 1].effectivePrice;
      group.savingsPercent = group.mostExpensive > 0
        ? Math.round(((group.mostExpensive - group.cheapest) / group.mostExpensive) * 100)
        : 0;

      result.push(group);
    });

    return result;
  }, [products, customPriceMap, lang]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    grouped.forEach(g => cats.add(g.category));
    return Array.from(cats).sort();
  }, [grouped]);

  const filtered = useMemo(() => {
    let items = grouped;

    if (selectedCategory !== "all") {
      items = items.filter(g => g.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
      );
    }

    if (sortBy === "savings") {
      items = [...items].sort((a, b) => b.savingsPercent - a.savingsPercent);
    } else if (sortBy === "name") {
      items = [...items].sort((a, b) => a.name.localeCompare(b.name, "de"));
    } else if (sortBy === "price") {
      items = [...items].sort((a, b) => a.cheapest - b.cheapest);
    }

    return items;
  }, [grouped, selectedCategory, searchQuery, sortBy]);

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalComparisons = grouped.length;
  const avgSavings = grouped.length > 0
    ? Math.round(grouped.reduce((s, g) => s + g.savingsPercent, 0) / grouped.length)
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6 pb-4 md:pb-6">
        <div className="bg-[#161921] px-4 md:px-6 pt-4 pb-5 rounded-b-3xl space-y-3">
          <Skeleton className="h-8 w-48 bg-white/10" />
          <Skeleton className="h-4 w-72 bg-white/10" />
        </div>
        <div className="px-4 md:px-6 space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-4 md:pb-6">
      <div className="dark bg-[#161921] px-4 md:px-6 pt-4 pb-5 rounded-b-3xl space-y-4" data-testid="price-comparison-hero">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
            {lang === "de" ? "Preisvergleich" : "Confronto prezzi"}
          </h1>
          <p className="text-sm text-white/50 mt-1">
            {lang === "de"
              ? "Vergleichen Sie Preise gleicher Produkte von verschiedenen Lieferanten"
              : "Confronta i prezzi degli stessi prodotti da diversi fornitori"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5" data-testid="stat-comparisons">
            <div className="text-xs text-white/50">{lang === "de" ? "Vergleichbar" : "Confrontabili"}</div>
            <div className="text-xl font-bold text-white mt-0.5">{totalComparisons}</div>
            <div className="text-xs text-white/40">{lang === "de" ? "Produkte" : "Prodotti"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5" data-testid="stat-savings">
            <div className="text-xs text-white/50">{lang === "de" ? "Ø Ersparnis" : "Ø Risparmio"}</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{avgSavings}%</div>
            <div className="text-xs text-white/40">{lang === "de" ? "Preisunterschied" : "Differenza"}</div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            placeholder={lang === "de" ? "Produkt suchen..." : "Cerca prodotto..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white/[0.07] border-white/10 text-white pl-9 placeholder:text-white/30 rounded-xl h-10"
            data-testid="input-search"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
              selectedCategory === "all"
                ? "border-white/40 bg-white/20 text-white shadow-sm"
                : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
            }`}
            data-testid="filter-category-all"
          >
            {lang === "de" ? "Alle" : "Tutti"}
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
                selectedCategory === cat
                  ? "border-white/40 bg-white/20 text-white shadow-sm"
                  : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
              }`}
              data-testid={`filter-category-${cat}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">
            {filtered.length} {lang === "de" ? "Vergleiche" : "Confronti"}
          </span>
          <div className="flex gap-1">
            {([
              { key: "savings", label: lang === "de" ? "Ersparnis" : "Risparmio" },
              { key: "name", label: lang === "de" ? "Name" : "Nome" },
              { key: "price", label: lang === "de" ? "Preis" : "Prezzo" },
            ] as const).map(s => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  sortBy === s.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
                data-testid={`sort-${s.key}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? (lang === "de" ? "Keine Ergebnisse gefunden" : "Nessun risultato trovato")
                : (lang === "de"
                  ? "Keine vergleichbaren Produkte verfügbar. Vergleiche erscheinen, wenn mehrere Lieferanten das gleiche Produkt anbieten."
                  : "Nessun prodotto confrontabile. I confronti appaiono quando più fornitori offrono lo stesso prodotto."
                )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((group) => {
              const groupKey = `${group.name}__${group.unit}`;
              const isExpanded = expandedGroups.has(groupKey);
              const cheapestOffer = group.offers[0];
              const otherOffers = group.offers.slice(1);

              return (
                <div
                  key={`${group.name}__${group.unit}`}
                  className="rounded-xl border bg-card overflow-hidden"
                  data-testid={`comparison-card-${group.name}`}
                >
                  <button
                    onClick={() => toggleExpand(groupKey)}
                    className="w-full flex items-center gap-3 p-3.5 md:p-4 text-left hover:bg-muted/30 transition-colors"
                    data-testid={`toggle-comparison-${group.name}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm truncate">{group.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                          {group.unit}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{group.category}</span>
                        <span>·</span>
                        <span>{group.offers.length} {lang === "de" ? "Anbieter" : "Fornitori"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {cheapestOffer.effectivePrice.toFixed(2)}€
                        </div>
                        {group.savingsPercent > 0 && (
                          <div className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                            <TrendingDown className="h-3 w-3" />
                            <span>{lang === "de" ? "bis" : "fino a"} -{group.savingsPercent}%</span>
                          </div>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t divide-y">
                      {group.offers.map((offer, idx) => {
                        const isCheapest = idx === 0;
                        const priceDiff = offer.effectivePrice - group.cheapest;
                        const priceDiffPercent = group.cheapest > 0
                          ? Math.round((priceDiff / group.cheapest) * 100)
                          : 0;

                        return (
                          <div
                            key={offer.product.id}
                            className={`flex items-center gap-3 px-3.5 md:px-4 py-3 ${
                              isCheapest ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""
                            }`}
                            data-testid={`offer-${offer.product.id}`}
                          >
                            <Avatar className="h-8 w-8 shrink-0">
                              {offer.product.supplier?.profileImageUrl ? (
                                <AvatarImage src={offer.product.supplier.profileImageUrl} />
                              ) : null}
                              <AvatarFallback className="text-xs bg-muted">
                                {(offer.product.supplier?.companyName || offer.product.supplier?.name || "?").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {offer.product.supplier?.companyName || offer.product.supplier?.name}
                              </div>
                              {offer.hasPromo && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 mt-0.5">
                                  -{offer.promoPercent}%
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                {offer.hasPromo && (
                                  <div className="text-xs text-muted-foreground line-through">
                                    {offer.originalPrice.toFixed(2)}€
                                  </div>
                                )}
                                <div className={`text-sm font-bold ${
                                  isCheapest ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                                }`}>
                                  {offer.effectivePrice.toFixed(2)}€
                                </div>
                              </div>

                              {isCheapest ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[10px] px-1.5 py-0.5 shrink-0">
                                  {lang === "de" ? "Günstigster" : "Migliore"}
                                </Badge>
                              ) : priceDiffPercent > 0 ? (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800 shrink-0">
                                  +{priceDiffPercent}%
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
