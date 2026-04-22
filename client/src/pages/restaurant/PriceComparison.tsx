import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Search, TrendingDown, Package, ChevronDown, ChevronUp, Tag } from "lucide-react";
import type { ProductWithSupplierAndPromotion } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";

interface Offer {
  product: ProductWithSupplierAndPromotion;
  effectivePrice: number;
  originalPrice: number;
  hasPromo: boolean;
  promoPercent: number;
}

interface GroupedProduct {
  name: string;
  category: string;
  unit: string;
  offers: Offer[];
  cheapest: number;
  mostExpensive: number;
  savingsPercent: number;
  savingsAbs: number;
}

interface CategoryStat {
  name: string;
  spend: number;
  sharePercent: number;
  groupCount: number;
  avgSavings: number;
  totalSavingsAbs: number;
  ampel: "green" | "orange" | "red";
}

function getAmpel(sharePercent: number, avgSavings: number): "green" | "orange" | "red" {
  if (sharePercent < 20 && avgSavings < 5) return "green";
  if (sharePercent > 30 || avgSavings > 15) return "red";
  return "orange";
}

const ampelStyles = {
  green: {
    dot: "bg-emerald-500",
    border: "border-emerald-200 dark:border-emerald-900/40",
    bg: "bg-emerald-50/40 dark:bg-emerald-950/10",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  orange: {
    dot: "bg-orange-500",
    border: "border-orange-200 dark:border-orange-900/40",
    bg: "bg-orange-50/40 dark:bg-orange-950/10",
    text: "text-orange-700 dark:text-orange-400",
  },
  red: {
    dot: "bg-red-500",
    border: "border-red-200 dark:border-red-900/40",
    bg: "bg-red-50/40 dark:bg-red-950/10",
    text: "text-red-700 dark:text-red-400",
  },
};

export default function PriceComparison() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"savings_abs" | "savings_pct" | "name" | "price">("savings_abs");
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

  const grouped = useMemo<GroupedProduct[]>(() => {
    if (!products) return [];
    const inStock = products.filter(p => p.inStock);
    const groups = new Map<string, GroupedProduct>();

    for (const product of inStock) {
      const key = `${product.name.trim().toLowerCase()}__${product.unit}`;
      const basePrice = parseFloat(product.price);
      const customPrice = customPriceMap.get(product.id);
      let effectivePrice = customPrice ?? basePrice;
      let promoPercent = 0;
      const hasPromo = !!product.activePromotion;
      if (product.activePromotion) {
        promoPercent = product.activePromotion.discountPercent;
        effectivePrice = effectivePrice * (1 - promoPercent / 100);
      }
      const offer: Offer = {
        product,
        effectivePrice: Math.round(effectivePrice * 100) / 100,
        originalPrice: customPrice ?? basePrice,
        hasPromo,
        promoPercent,
      };
      if (groups.has(key)) groups.get(key)!.offers.push(offer);
      else groups.set(key, {
        name: product.name,
        category: product.category || (lang === "de" ? "Sonstige" : "Altro"),
        unit: product.unit,
        offers: [offer],
        cheapest: 0,
        mostExpensive: 0,
        savingsPercent: 0,
        savingsAbs: 0,
      });
    }

    const result: GroupedProduct[] = [];
    groups.forEach(g => {
      if (g.offers.length < 2) return;
      g.offers.sort((a, b) => a.effectivePrice - b.effectivePrice);
      g.cheapest = g.offers[0].effectivePrice;
      g.mostExpensive = g.offers[g.offers.length - 1].effectivePrice;
      g.savingsAbs = Math.round((g.mostExpensive - g.cheapest) * 100) / 100;
      g.savingsPercent = g.mostExpensive > 0
        ? Math.round(((g.mostExpensive - g.cheapest) / g.mostExpensive) * 100)
        : 0;
      result.push(g);
    });
    return result;
  }, [products, customPriceMap, lang]);

  const categoryStats = useMemo<CategoryStat[]>(() => {
    if (grouped.length === 0) return [];
    const totalSpend = grouped.reduce((s, g) => s + g.mostExpensive, 0);
    const map = new Map<string, { spend: number; groupCount: number; sumSavings: number; totalSavingsAbs: number }>();
    grouped.forEach(g => {
      const e = map.get(g.category) ?? { spend: 0, groupCount: 0, sumSavings: 0, totalSavingsAbs: 0 };
      e.spend += g.mostExpensive;
      e.groupCount += 1;
      e.sumSavings += g.savingsPercent;
      e.totalSavingsAbs += g.savingsAbs;
      map.set(g.category, e);
    });
    const out: CategoryStat[] = [];
    map.forEach((e, name) => {
      const sharePercent = totalSpend > 0 ? Math.round((e.spend / totalSpend) * 100) : 0;
      const avgSavings = e.groupCount > 0 ? Math.round(e.sumSavings / e.groupCount) : 0;
      out.push({
        name,
        spend: e.spend,
        sharePercent,
        groupCount: e.groupCount,
        avgSavings,
        totalSavingsAbs: Math.round(e.totalSavingsAbs * 100) / 100,
        ampel: getAmpel(sharePercent, avgSavings),
      });
    });
    return out.sort((a, b) => b.sharePercent - a.sharePercent);
  }, [grouped]);

  const categories = useMemo(() => Array.from(new Set(grouped.map(g => g.category))).sort(), [grouped]);

  const filtered = useMemo(() => {
    let items = grouped;
    if (selectedCategory !== "all") items = items.filter(g => g.category === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(g => g.name.toLowerCase().includes(q) || g.category.toLowerCase().includes(q));
    }
    if (sortBy === "savings_abs") items = [...items].sort((a, b) => b.savingsAbs - a.savingsAbs);
    else if (sortBy === "savings_pct") items = [...items].sort((a, b) => b.savingsPercent - a.savingsPercent);
    else if (sortBy === "name") items = [...items].sort((a, b) => a.name.localeCompare(b.name, "de"));
    else if (sortBy === "price") items = [...items].sort((a, b) => a.cheapest - b.cheapest);
    return items;
  }, [grouped, selectedCategory, searchQuery, sortBy]);

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const totalComparisons = grouped.length;
  const avgSavings = grouped.length > 0
    ? Math.round(grouped.reduce((s, g) => s + g.savingsPercent, 0) / grouped.length)
    : 0;
  const totalSavingsAbs = grouped.reduce((s, g) => s + g.savingsAbs, 0);

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6 pb-4 md:pb-6">
        <div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl space-y-3">
          <Skeleton className="h-8 w-48 bg-white/10" />
          <Skeleton className="h-4 w-72 bg-white/10" />
        </div>
        <div className="px-4 md:px-6 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-4 md:pb-6">
      {/* EBENE 1 — Gesamtkontext (Hero, unverändert) */}
      <div className="dark bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 rounded-b-3xl space-y-4" data-testid="price-comparison-hero">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
            {lang === "de" ? "Preisvergleich" : "Confronto prezzi"}
          </h1>
          <p className="hidden md:block text-sm text-white/50 mt-1">
            {lang === "de"
              ? "Vergleichen Sie Preise gleicher Produkte von verschiedenen Lieferanten"
              : "Confronta i prezzi degli stessi prodotti da diversi fornitori"}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5" data-testid="stat-comparisons">
            <div className="text-xs text-white/50">{lang === "de" ? "Vergleichbar" : "Confrontabili"}</div>
            <div className="text-xl font-bold text-white mt-0.5">{totalComparisons}</div>
            <div className="text-xs text-white/40">{lang === "de" ? "Produkte" : "Prodotti"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5" data-testid="stat-savings-pct">
            <div className="text-xs text-white/50">{lang === "de" ? "Ø Ersparnis" : "Ø Risparmio"}</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{avgSavings}%</div>
            <div className="text-xs text-white/40">{lang === "de" ? "Preisunterschied" : "Differenza"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5" data-testid="stat-savings-abs">
            <div className="text-xs text-white/50">{lang === "de" ? "Hebel gesamt" : "Leva totale"}</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{totalSavingsAbs.toFixed(0)}€</div>
            <div className="text-xs text-white/40">{lang === "de" ? "pro Einheit" : "per unità"}</div>
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

      {/* EBENE 2 — Kategorie-Diagnose */}
      {categoryStats.length > 0 && (
        <div className="px-4 md:px-6" data-testid="section-category-diagnosis">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold">{lang === "de" ? "Kategorie-Diagnose" : "Diagnosi categorie"}</h2>
            <span className="text-xs text-muted-foreground">
              {lang === "de" ? "Wo sich Handeln am meisten lohnt" : "Dove conviene agire di più"}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categoryStats.map(cat => {
              const styles = ampelStyles[cat.ampel];
              const isActive = selectedCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(isActive ? "all" : cat.name)}
                  className={`rounded-xl border ${styles.border} ${styles.bg} p-3 text-left transition-all hover:shadow-sm ${
                    isActive ? "ring-2 ring-primary/40 shadow-sm" : ""
                  }`}
                  data-testid={`category-card-${cat.name}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} aria-hidden />
                    <span className="text-[11px] font-medium text-muted-foreground">{cat.sharePercent}%</span>
                  </div>
                  <div className="text-sm font-semibold truncate" title={cat.name}>{cat.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {cat.groupCount} {lang === "de" ? (cat.groupCount === 1 ? "Vergleich" : "Vergleiche") : (cat.groupCount === 1 ? "confronto" : "confronti")}
                  </div>
                  {cat.avgSavings >= 5 ? (
                    <div className={`text-[11px] mt-1.5 font-medium ${styles.text}`}>
                      Ø {cat.avgSavings}% {lang === "de" ? "günstiger möglich" : "più conveniente"}
                    </div>
                  ) : (
                    <div className="text-[11px] mt-1.5 text-muted-foreground/70">
                      {lang === "de" ? "Preise im Rahmen" : "Prezzi nella norma"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* EBENE 3 — Produktliste */}
      <div className="px-4 md:px-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">
            {filtered.length} {lang === "de" ? "Vergleiche" : "Confronti"}
            {selectedCategory !== "all" && (
              <span className="ml-1.5 text-xs text-primary">· {selectedCategory}</span>
            )}
          </span>
          <div className="flex gap-1 flex-wrap justify-end">
            {([
              { key: "savings_abs", label: lang === "de" ? "€ Hebel" : "€ Leva" },
              { key: "savings_pct", label: "%" },
              { key: "price", label: lang === "de" ? "Preis" : "Prezzo" },
              { key: "name", label: lang === "de" ? "Name" : "Nome" },
            ] as const).map(s => (
              <button
                key={s.key}
                onClick={() => setSortBy(s.key)}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
                  sortBy === s.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
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
                  : "Nessun prodotto confrontabile.")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((group) => {
              const groupKey = `${group.name}__${group.unit}`;
              const isExpanded = expandedGroups.has(groupKey);
              const cheapest = group.offers[0];
              const mostExpensive = group.offers[group.offers.length - 1];
              const anyPromo = group.offers.some(o => o.hasPromo);

              return (
                <div
                  key={groupKey}
                  className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"
                  data-testid={`comparison-card-${group.name}`}
                >
                  <button
                    onClick={() => toggleExpand(groupKey)}
                    className="w-full text-left hover:bg-muted/30 transition-colors"
                    data-testid={`toggle-comparison-${group.name}`}
                  >
                    <div className="px-3.5 md:px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-sm">{group.name}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{group.unit}</Badge>
                            <span className="text-[11px] text-muted-foreground">{group.category}</span>
                            <span className="text-[11px] text-muted-foreground">· {group.offers.length} {lang === "de" ? "Anbieter" : "Fornitori"}</span>
                            {anyPromo && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-0.5">
                                <Tag className="h-2.5 w-2.5" />
                                {lang === "de" ? "Aktion" : "Promo"}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 mt-0.5">
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>

                      <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
                        {/* Aktuell (höchster) */}
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            {lang === "de" ? "Aktuell" : "Attuale"}
                          </div>
                          <div className="text-sm font-semibold truncate">
                            {mostExpensive.effectivePrice.toFixed(2)}€
                            <span className="text-xs font-normal text-muted-foreground"> / {group.unit}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {mostExpensive.product.supplier?.companyName || mostExpensive.product.supplier?.name || "—"}
                          </div>
                        </div>

                        {/* Differenz */}
                        <div className="text-center px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 self-stretch flex flex-col justify-center">
                          <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 leading-tight tabular-nums">
                            -{group.savingsAbs.toFixed(2)}€
                          </div>
                          <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 leading-tight">
                            -{group.savingsPercent}%
                          </div>
                        </div>

                        {/* Bester */}
                        <div className="min-w-0 sm:text-right">
                          <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-medium">
                            {lang === "de" ? "Bester Preis" : "Miglior prezzo"}
                          </div>
                          <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                            {cheapest.effectivePrice.toFixed(2)}€
                            <span className="text-xs font-normal text-muted-foreground"> / {group.unit}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1 sm:justify-end">
                            <TrendingDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            {cheapest.product.supplier?.companyName || cheapest.product.supplier?.name || "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/60 divide-y divide-border/40">
                      {group.offers.map((offer, idx) => {
                        const isCheapest = idx === 0;
                        const priceDiffAbs = offer.effectivePrice - group.cheapest;
                        const priceDiffPercent = group.cheapest > 0 ? Math.round((priceDiffAbs / group.cheapest) * 100) : 0;
                        return (
                          <div
                            key={offer.product.id}
                            className={`flex items-center gap-3 px-3.5 md:px-4 py-3 ${isCheapest ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
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
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 mt-0.5 gap-0.5">
                                  <Tag className="h-2.5 w-2.5" />
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
                                <div className={`text-sm font-bold tabular-nums ${
                                  isCheapest ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                                }`}>
                                  {offer.effectivePrice.toFixed(2)}€
                                </div>
                              </div>
                              {isCheapest ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 text-[10px] px-1.5 py-0.5 shrink-0">
                                  {lang === "de" ? "Günstigster" : "Migliore"}
                                </Badge>
                              ) : (
                                <div className="text-right shrink-0 min-w-[64px]">
                                  <div className="text-[11px] font-medium text-orange-600 dark:text-orange-400 tabular-nums">
                                    +{priceDiffAbs.toFixed(2)}€
                                  </div>
                                  <div className="text-[10px] text-orange-600/80 dark:text-orange-400/80">
                                    +{priceDiffPercent}%
                                  </div>
                                </div>
                              )}
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
