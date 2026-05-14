import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useUser } from "@/context/UserContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Package, Store, Tag, ArrowLeft, Carrot, Apple, Beef, Fish, Milk, Wine, Wheat, Flame, MoreHorizontal, Sandwich, Coffee, Droplets, Check } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User, ProductWithSupplierAndPromotion } from "@shared/schema";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { queryClient } from "@/lib/queryClient";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { ProductImage } from "@/components/ProductImage";
import { ShoppingCart, ChevronRight as ChevronRightIcon } from "lucide-react";


const categoryConfig: Record<string, { de: string; it: string; icon: typeof Package; color: string }> = {
 "Gemüse": { de: "Gemüse", it: "Verdura", icon: Carrot, color: "bg-green-600" },
 "Obst": { de: "Obst", it: "Frutta", icon: Apple, color: "bg-red-500" },
 "Kräuter": { de: "Kräuter", it: "Erbe", icon: Carrot, color: "bg-lime-600" },
 "Fleisch": { de: "Fleisch", it: "Carne", icon: Beef, color: "bg-rose-700" },
 "Wurst": { de: "Wurst", it: "Salumi", icon: Beef, color: "bg-rose-800" },
 "Fisch": { de: "Fisch", it: "Pesce", icon: Fish, color: "bg-cyan-600" },
 "Meeresfrüchte": { de: "Meeresfrüchte", it: "Frutti di mare", icon: Fish, color: "bg-blue-600" },
 "Käse": { de: "Käse", it: "Formaggi", icon: Milk, color: "bg-yellow-500" },
 "Milchprodukte": { de: "Milchprodukte", it: "Latticini", icon: Milk, color: "bg-blue-400" },
 "Wein": { de: "Wein", it: "Vino", icon: Wine, color: "bg-purple-700" },
 "Spirituosen": { de: "Spirituosen", it: "Liquori", icon: Wine, color: "bg-indigo-700" },
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

function CartPillMobile({ lang, setLocation }: { lang: string; setLocation: (p: string) => void }) {
 const { currentUser } = useUser();
 const { data } = useQuery<{ count: string | number }>({
 queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 refetchInterval: 5000,
 });
 const count = Number(data?.count || 0);
 if (!count) return null;
 return (
 <button
 onClick={() => setLocation("/restaurant/cart")}
 data-testid="button-mobile-cart-pill"
 className="md:hidden fixed left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-2 h-12 pl-3 pr-4 rounded-full bg-foreground text-background shadow-[0_8px_24px_rgba(0,0,0,0.25)] active:scale-95 transition-transform"
 style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)" }}
 >
 <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-background/15">
 <ShoppingCart className="h-4 w-4" />
 </span>
 <span className="text-[13px] font-semibold tabular-nums">
 {count} {lang === "de" ? "im Warenkorb" : "nel carrello"}
 </span>
 <ChevronRightIcon className="h-4 w-4 opacity-70" />
 </button>
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

 const knownCategories = allCategories.filter(c => c !== "Sonstiges");
 const productsByCategory = (cat: string) => {
 if (!products) return [];
 const supplierFiltered = selectedSupplier === "all"
 ? products
 : products.filter(p => p.supplierId === selectedSupplier);
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

 return (
 <button
 key={product.id}
 className={`flex flex-col text-left rounded-xl border border-border bg-background hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${!product.inStock ? "opacity-60" : ""}`}
 onClick={() => setLocation(`/restaurant/product/${product.id}`)}
 data-testid={`product-card-${product.id}`}
 >
 <div className="relative w-full aspect-[4/3] overflow-hidden">
 <ProductImage src={product.imageUrl} alt={product.name} className="w-full h-full" iconClassName="h-8 w-8" fallbackIconColor="text-muted-foreground/20" />
 {hasPromo && (
 <Badge className="absolute top-1 left-1 bg-green-600 text-white border-0 text-[9px] leading-tight px-1 py-0.5 max-w-[calc(100%-8px)] truncate">
 -{promo.discountPercent}%
 </Badge>
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
 </div>
 <div className="p-2 flex flex-col gap-0.5 flex-1 overflow-hidden min-w-0">
 <span className="text-xs font-semibold truncate block">{product.name}</span>
 <span className="text-[10px] text-muted-foreground truncate block">
 {product.supplier?.companyName || product.supplier?.name}
 </span>
 <div className="mt-auto pt-0.5 overflow-hidden">
 {hasPromo ? (
 <div className="flex items-baseline gap-0.5 overflow-hidden">
 <span className="text-[9px] text-muted-foreground line-through shrink-0">{originalPrice.toFixed(2)}</span>
 <span className="text-[11px] font-bold text-green-600 dark:text-green-400 shrink-0">{discountedPrice.toFixed(2)}€</span>
 <span className="text-[9px] text-muted-foreground truncate">/{product.unit}</span>
 </div>
 ) : (
 <div className="flex items-baseline gap-0.5">
 <span className="text-[11px] font-bold shrink-0">{originalPrice.toFixed(2)}€</span>
 <span className="text-[9px] text-muted-foreground truncate">/{product.unit}</span>
 </div>
 )}
 </div>
 </div>
 </button>
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
 className="space-y-4 md:space-y-6"
 >
 {!selectedCategory ? (
 <>
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3" data-testid="catalog-hero">
 <div>
 <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
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
 const conf = categoryConfig[selectedCategory];
 const CatIcon = conf?.icon || Package;
 return (
 <>
 <div className={`flex items-center justify-center h-8 w-8 rounded-full ${conf?.color || "bg-gray-500"} text-white shrink-0`}>
 <CatIcon className="h-4 w-4" />
 </div>
 <h2 className="text-lg md:text-xl font-bold text-white truncate">
 {lang === "it" ? conf?.it : conf?.de}
 </h2>
 </>
 );
 })()}
 </div>

 {supplierCards.length > 1 && (
 <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
 <button
 onClick={() => { setSelectedSupplier("all"); }}
 className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 border ${
 selectedSupplier === "all"
 ? "border-white/40 bg-white/20 text-white shadow-sm"
 : "border-white/10 bg-white/[0.07] text-white/60 hover:bg-white/15"
 }`}
 data-testid="filter-supplier-all-inner"
 >
 <Store className="h-3.5 w-3.5 shrink-0" />
 <span>{t("common", "all")}</span>
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
 data-testid={`filter-supplier-inner-${supplier.id}`}
 >
 <Avatar className="h-4 w-4 shrink-0">
 <AvatarImage src={supplier.profileImageUrl || undefined} />
 <AvatarFallback className="text-[7px] font-semibold bg-white/20 text-white">
 {supplier.name.substring(0, 2).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 <span className="max-w-[80px] truncate">{supplier.name}</span>
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
 className="pl-8 md:pl-9 h-9 md:h-10 text-sm"
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
 : ""
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
 : ""
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
 <div className="grid gap-2 md:gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
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
 </PullToRefreshWrapper>
 );
}
