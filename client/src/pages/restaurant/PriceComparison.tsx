import { useState, useMemo } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { SectionTabs } from "@/components/SectionTabs";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
 Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
 TrendingDown, Package, ChevronDown, ChevronUp, Tag, ShoppingCart, Search,
 ArrowUpDown, ArrowUp, ArrowDown, Filter as FilterIcon, X, Check,
 AlertTriangle, Truck, Clock, CheckCircle2, ArrowRight,
} from "lucide-react";
import type { ProductWithSupplierAndPromotion } from "@shared/schema";
import { productMatchKey } from "@shared/productMatch";
import { StarRating } from "@/components/StarRating";

interface OrderItemLite {
 productId: string;
 productName: string;
 quantity: number;
 unitPrice: string;
}
interface OrderLite {
 id: string;
 supplierId: string;
 status: string;
 createdAt: string;
 items?: OrderItemLite[];
}

interface VolumeRow {
 productId: string;
 supplierId: string;
 totalQuantity: number;
 orderCount: number;
 lastOrderedAt: string | null;
}

interface Offer {
 product: ProductWithSupplierAndPromotion;
 effectivePrice: number;
 originalPrice: number;
 hasPromo: boolean;
 promoPercent: number;
 promoEndsAt?: string | null;
}

interface GroupedProduct {
 key: string;
 name: string;
 category: string;
 unit: string;
 offers: Offer[];
 cheapestOffer: Offer;
 currentOffer: Offer | null; // The offer the restaurant is currently using
 monthlyVolume: number; // estimated units per 30 days
 unitDiff: number; // current - cheapest, per unit
 unitDiffPercent: number;
 monthlySaving: number; // unitDiff * monthlyVolume
 isAlreadyBest: boolean;
}

const DAYS_WINDOW = 90;

function formatEuro(n: number): string {
 return n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatEuroCompact(n: number): string {
 return n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function daysUntil(iso: string | null | undefined): number | null {
 if (!iso) return null;
 const ms = new Date(iso).getTime() - Date.now();
 if (Number.isNaN(ms)) return null;
 return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function PriceComparison() {
 const { currentUser } = useUser();
 const { lang } = useLanguage();
 const { toast } = useToast();
 const [, setLocation] = useLocation();

 // ── UI state ──────────────────────────────────────────────────────────────
 const [searchQuery, setSearchQuery] = useState("");
 const [sortBy, setSortBy] = useState<"saving" | "saving_pct" | "name" | "price">("saving");
 const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
 const [selectedCategory, setSelectedCategory] = useState<string>("all");
 const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
 const [onlyWithSavings, setOnlyWithSavings] = useState(true);
 const [showAll, setShowAll] = useState(false);
 const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
 const [wechselplanOpen, setWechselplanOpen] = useState(false);
 const [wechselplanSelected, setWechselplanSelected] = useState<Set<string>>(new Set());
 const [wechselplanQuantities, setWechselplanQuantities] = useState<Record<string, number>>({});

 // ── Data ──────────────────────────────────────────────────────────────────
 const { data: products, isLoading } = useQuery<ProductWithSupplierAndPromotion[]>({
 queryKey: [`/api/products?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const { data: customPrices } = useQuery<Array<{ productId: string; supplierId: string; restaurantId: string; customPrice: string }>>({
 queryKey: [`/api/custom-prices?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const { data: volumesResponse } = useQuery<{ days: number; volumes: VolumeRow[] }>({
 queryKey: [`/api/restaurant/product-volumes?restaurantId=${currentUser?.id}&days=${DAYS_WINDOW}`],
 enabled: !!currentUser?.id,
 });

 const { data: ordersHistory } = useQuery<OrderLite[]>({
 queryKey: [`/api/orders?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const { data: movMap } = useQuery<Record<string, { minimumValue: string; zone: string | null }>>({
 queryKey: [`/api/minimum-order-values/for-restaurant?restaurantId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const ratingSupplierIds = useMemo(() => {
 const ids = new Set<string>();
 (products ?? []).forEach(p => { if (p.supplierId) ids.add(p.supplierId); });
 return Array.from(ids).sort().join(",");
 }, [products]);

 const { data: ratingSummaries } = useQuery<Record<string, { avg: number; count: number }>>({
 queryKey: ["/api/supplier-ratings/summary", ratingSupplierIds],
 queryFn: async () => {
 if (!ratingSupplierIds) return {};
 const res = await fetch(`/api/supplier-ratings/summary?supplierIds=${encodeURIComponent(ratingSupplierIds)}`);
 if (!res.ok) throw new Error("Failed");
 return res.json();
 },
 enabled: !!ratingSupplierIds,
 });

 const currentMonth = useMemo(() => {
 const now = new Date();
 return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
 }, []);

 const { data: costAnalysis } = useQuery<{
 totalOvernights: number; totalCosts: string; costPerGuest: string;
 targetCost: string; difference: string;
 }>({
 queryKey: [`/api/restaurant/cost-analysis?restaurantId=${currentUser?.id}&month=${currentMonth}`],
 enabled: !!currentUser?.id,
 });

 // ── Lookup maps ───────────────────────────────────────────────────────────
 const customPriceMap = useMemo(() => {
 const m = new Map<string, number>();
 customPrices?.forEach(cp => {
 if (cp.restaurantId === currentUser?.id) m.set(cp.productId, parseFloat(cp.customPrice));
 });
 return m;
 }, [customPrices, currentUser?.id]);

 // Per (productId, supplierId) → volume row
 const volumeBySupplier = useMemo(() => {
 const m = new Map<string, VolumeRow>();
 volumesResponse?.volumes.forEach(v => m.set(`${v.productId}__${v.supplierId}`, v));
 return m;
 }, [volumesResponse]);

 // Per productId → total volume across all suppliers (90d)
 const volumeByProduct = useMemo(() => {
 const m = new Map<string, number>();
 volumesResponse?.volumes.forEach(v => {
 m.set(v.productId, (m.get(v.productId) || 0) + v.totalQuantity);
 });
 return m;
 }, [volumesResponse]);

 // For each productId, the timestamp of the most recent order in which it appeared.
 // Used to resolve "Du nutzt heute" when 90d volume data is empty.
 const lastOrderedAtByProduct = useMemo(() => {
 const m = new Map<string, number>(); // productId -> ms timestamp
 if (!ordersHistory) return m;
 for (const order of ordersHistory) {
 const ts = new Date(order.createdAt).getTime();
 if (!order.items) continue;
 for (const item of order.items) {
 const prev = m.get(item.productId) ?? 0;
 if (ts > prev) m.set(item.productId, ts);
 }
 }
 return m;
 }, [ordersHistory]);

 // ── Build product groups ──────────────────────────────────────────────────
 const grouped = useMemo<GroupedProduct[]>(() => {
 if (!products) return [];
 const inStock = products.filter(p => p.inStock);
 const groups = new Map<string, GroupedProduct>();

 for (const product of inStock) {
 // Match the "same product" across suppliers: prefer a shared barcode (GTIN),
 // otherwise a normalized name + unit (case/accent/unit-synonym insensitive).
 const key = productMatchKey({ name: product.name, unit: product.unit, gtin: product.gtin });
 const basePrice = parseFloat(product.price);
 const customPrice = customPriceMap.get(product.id);
 let effectivePrice = customPrice ?? basePrice;
 let promoPercent = 0;
 const hasPromo = !!product.activePromotion;
 let promoEndsAt: string | null = null;
 if (product.activePromotion) {
 promoPercent = product.activePromotion.discountPercent;
 effectivePrice = effectivePrice * (1 - promoPercent / 100);
 promoEndsAt = (product.activePromotion as any).endDate ?? null;
 }
 const offer: Offer = {
 product,
 effectivePrice: Math.round(effectivePrice * 100) / 100,
 originalPrice: customPrice ?? basePrice,
 hasPromo,
 promoPercent,
 promoEndsAt,
 };
 const g = groups.get(key);
 if (g) g.offers.push(offer);
 else groups.set(key, {
 key,
 name: product.name,
 category: product.category || (lang === "de" ? "Sonstige" : "Altro"),
 unit: product.unit,
 offers: [offer],
 cheapestOffer: offer,
 currentOffer: null,
 monthlyVolume: 0,
 unitDiff: 0,
 unitDiffPercent: 0,
 monthlySaving: 0,
 isAlreadyBest: false,
 });
 }

 const result: GroupedProduct[] = [];
 groups.forEach(g => {
 if (g.offers.length < 2) return; // need ≥2 suppliers to compare
 g.offers.sort((a, b) => a.effectivePrice - b.effectivePrice);
 g.cheapestOffer = g.offers[0];

 // Determine "current" offer: pick the offer in this group whose product
 // shows the most volume in last 90d for this restaurant. Fallback: most-
 // recently ordered offer within group (by timestamp). If none ordered → null.
 let bestVolume = 0;
 let chosen: Offer | null = null;
 for (const o of g.offers) {
 const v = volumeBySupplier.get(`${o.product.id}__${o.product.supplierId}`)?.totalQuantity ?? 0;
 if (v > bestVolume) {
 bestVolume = v;
 chosen = o;
 }
 }
 if (!chosen) {
 // Fallback: pick the offer ordered most recently
 let bestTs = 0;
 for (const o of g.offers) {
 const ts = lastOrderedAtByProduct.get(o.product.id) ?? 0;
 if (ts > bestTs) {
 bestTs = ts;
 chosen = o;
 }
 }
 }
 g.currentOffer = chosen;

 // Monthly volume = sum of 90d volumes across the group / 3
 const total90d = g.offers.reduce((s, o) => s + (volumeBySupplier.get(`${o.product.id}__${o.product.supplierId}`)?.totalQuantity ?? 0), 0);
 g.monthlyVolume = Math.round((total90d / 3) * 10) / 10;

 const reference = g.currentOffer ?? g.offers[g.offers.length - 1];
 g.unitDiff = Math.round((reference.effectivePrice - g.cheapestOffer.effectivePrice) * 100) / 100;
 g.unitDiffPercent = reference.effectivePrice > 0
 ? Math.round((g.unitDiff / reference.effectivePrice) * 100)
 : 0;
 g.monthlySaving = Math.round(g.unitDiff * g.monthlyVolume * 100) / 100;
 g.isAlreadyBest = !!g.currentOffer && g.currentOffer.product.id === g.cheapestOffer.product.id;

 result.push(g);
 });
 return result;
 }, [products, customPriceMap, volumeBySupplier, lastOrderedAtByProduct, lang]);

 // ── Aggregations ──────────────────────────────────────────────────────────
 const switchable = useMemo(() => grouped.filter(g => !g.isAlreadyBest && g.unitDiff > 0), [grouped]);
 const switchableWithVolume = useMemo(() => switchable.filter(g => g.monthlyVolume > 0), [switchable]);
 const totalMonthlySaving = useMemo(() => switchableWithVolume.reduce((s, g) => s + g.monthlySaving, 0), [switchableWithVolume]);
 const totalUnitSaving = useMemo(() => switchable.reduce((s, g) => s + g.unitDiff, 0), [switchable]);

 const categories = useMemo(() => Array.from(new Set(grouped.map(g => g.category))).sort(), [grouped]);
 const allSuppliers = useMemo(() => {
 const m = new Map<string, string>();
 grouped.forEach(g => g.offers.forEach(o => {
 const sid = o.product.supplierId;
 const sname = o.product.supplier?.companyName || o.product.supplier?.name || "—";
 if (!m.has(sid)) m.set(sid, sname);
 }));
 return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "de"));
 }, [grouped]);

 // ── Filter + sort ─────────────────────────────────────────────────────────
 const filtered = useMemo(() => {
 let items = grouped;
 if (onlyWithSavings) items = items.filter(g => g.unitDiff > 0);
 if (selectedCategory !== "all") items = items.filter(g => g.category === selectedCategory);
 if (selectedSupplier !== "all") items = items.filter(g => g.offers.some(o => o.product.supplierId === selectedSupplier));
 if (searchQuery.trim()) {
 const q = searchQuery.trim().toLowerCase();
 items = items.filter(g =>
 g.name.toLowerCase().includes(q) ||
 g.category.toLowerCase().includes(q) ||
 g.offers.some(o => (o.product.supplier?.companyName || o.product.supplier?.name || "").toLowerCase().includes(q))
 );
 }
 const dir = sortDir === "asc" ? 1 : -1;
 items = [...items].sort((a, b) => {
 switch (sortBy) {
 case "saving": return (a.monthlySaving - b.monthlySaving) * dir || (a.unitDiff - b.unitDiff) * dir;
 case "saving_pct": return (a.unitDiffPercent - b.unitDiffPercent) * dir;
 case "price": return (a.cheapestOffer.effectivePrice - b.cheapestOffer.effectivePrice) * dir;
 case "name": return a.name.localeCompare(b.name, "de") * (sortDir === "asc" ? 1 : -1);
 }
 });
 return items;
 }, [grouped, onlyWithSavings, selectedCategory, selectedSupplier, searchQuery, sortBy, sortDir]);

 const visible = showAll ? filtered : filtered.slice(0, 8);
 const hasActiveFilters = selectedCategory !== "all" || selectedSupplier !== "all" || !onlyWithSavings;
 const activeFilterCount = (selectedCategory !== "all" ? 1 : 0) + (selectedSupplier !== "all" ? 1 : 0) + (!onlyWithSavings ? 1 : 0);

 const clearFilters = () => {
 setSelectedCategory("all");
 setSelectedSupplier("all");
 setOnlyWithSavings(true);
 setSearchQuery("");
 };

 const toggleExpand = (key: string) => {
 setExpandedGroups(prev => {
 const next = new Set(prev);
 if (next.has(key)) next.delete(key); else next.add(key);
 return next;
 });
 };

 // ── Wechselplan ───────────────────────────────────────────────────────────
 const wechselplanCandidates = useMemo(
 () => [...switchableWithVolume].sort((a, b) => b.monthlySaving - a.monthlySaving),
 [switchableWithVolume]
 );

 const openWechselplan = () => {
 const top = wechselplanCandidates.slice(0, 10);
 setWechselplanSelected(new Set(top.map(g => g.key)));
 const qs: Record<string, number> = {};
 top.forEach(g => {
 const monthlyQty = Math.max(1, Math.round(g.monthlyVolume));
 qs[g.key] = monthlyQty;
 });
 setWechselplanQuantities(qs);
 setWechselplanOpen(true);
 };

 const wechselplanSelectedTotal = useMemo(() => {
 return wechselplanCandidates
 .filter(g => wechselplanSelected.has(g.key))
 .reduce((s, g) => {
 const qty = wechselplanQuantities[g.key] ?? Math.round(g.monthlyVolume);
 return s + g.unitDiff * qty;
 }, 0);
 }, [wechselplanCandidates, wechselplanSelected, wechselplanQuantities]);

 const wechselplanSubmitMutation = useMutation({
 mutationFn: async () => {
 const selected = wechselplanCandidates.filter(g => wechselplanSelected.has(g.key));
 let added = 0;
 let failed = 0;
 for (const g of selected) {
 const moq = g.cheapestOffer.product.minOrderQuantity ?? 1;
 const desired = Math.round(wechselplanQuantities[g.key] ?? g.monthlyVolume);
 const qty = Math.max(1, moq, desired);
 try {
 await apiRequest("POST", "/api/cart", {
 restaurantId: currentUser?.id,
 productId: g.cheapestOffer.product.id,
 supplierId: g.cheapestOffer.product.supplierId,
 quantity: qty,
 mode: "add",
 });
 added++;
 } catch {
 failed++;
 }
 }
 return { added, failed };
 },
 onSuccess: ({ added, failed }) => {
 queryClient.invalidateQueries({ queryKey: [`/api/cart?restaurantId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: [`/api/cart/count?restaurantId=${currentUser?.id}`] });
 setWechselplanOpen(false);
 toast({
 title: lang === "de" ? `${added} Produkte übernommen` : `${added} prodotti aggiunti`,
 description: failed > 0
 ? (lang === "de" ? `${failed} konnten nicht hinzugefügt werden (Mindestmenge?).` : `${failed} non aggiunti (quantità min?).`)
 : (lang === "de" ? "Im Warenkorb beim besten Anbieter." : "Nel carrello presso il miglior fornitore."),
 });
 },
 onError: () => {
 toast({ title: lang === "de" ? "Fehler" : "Errore", variant: "destructive" });
 },
 });

 const handleVisitSupplier = (g: GroupedProduct) => {
 const supplierId = g.cheapestOffer.product.supplierId;
 setLocation(`/restaurant/catalog?supplier=${supplierId}`);
 };

 // ── Loading skeleton ──────────────────────────────────────────────────────
 if (isLoading) {
 return (
 <div className="space-y-4 md:space-y-6 pb-4 md:pb-6">
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3"><SectionTabs />
 <Skeleton className="h-8 w-48 bg-white/10" />
 <Skeleton className="h-12 w-72 bg-white/10" />
 </div></HeroPortal>
 <div className="px-4 md:px-6 space-y-4">
 {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
 </div>
 </div>
 );
 }

 const hasRealVolume = switchableWithVolume.length > 0 && totalMonthlySaving > 0;
 const costPerGuestNum = costAnalysis ? Number(costAnalysis.costPerGuest) : 0;
 const costDifferenceNum = costAnalysis ? Number(costAnalysis.difference) : 0;
 const totalOvernightsNum = costAnalysis ? Number(costAnalysis.totalOvernights) : 0;
 const projectedCostPerGuestDelta = totalOvernightsNum > 0 ? totalMonthlySaving / totalOvernightsNum : 0;
 const projectedNewCostPerGuest = Math.max(0, costPerGuestNum - projectedCostPerGuestDelta);

 // Stable "Top-Hebel #N" rank: by monthlySaving across all switchable products with volume
 const rankByKey = (() => {
 const m = new Map<string, number>();
 [...switchableWithVolume]
 .sort((a, b) => b.monthlySaving - a.monthlySaving)
 .forEach((g, idx) => m.set(g.key, idx + 1));
 return m;
 })();

 return (
 <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-6">
 {/* ─── HERO (slim, single headline) ─────────────────────────────── */}
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 md:" data-testid="price-comparison-hero"><SectionTabs />
 <div className="flex items-start justify-between gap-3 mb-3">
 <div>
 <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
 {lang === "de" ? "Preisvergleich" : "Confronto prezzi"}
 </h1>
 <p className="text-sm text-white/50 mt-1">
 {lang === "de"
 ? "Hochrechnung auf dein Bestellvolumen der letzten 90 Tage."
 : "Proiezione sul tuo volume ordini degli ultimi 90 giorni."}
 </p>
 </div>
 </div>

 {/* Headline savings card */}
 <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-400/20 px-4 py-4 md:px-5 md:py-5">
 <div className="flex items-start justify-between gap-3 flex-wrap">
 <div className="flex-1 min-w-[200px]">
 <div className="text-[11px] uppercase tracking-wider text-emerald-300/80 font-semibold flex items-center gap-1.5">
 <TrendingDown className="h-3 w-3" />
 {lang === "de" ? "Möglicher Hebel" : "Risparmio potenziale"}
 </div>
 <div className="mt-1 flex items-baseline gap-2">
 <span className="text-3xl md:text-4xl font-bold text-emerald-300 tabular-nums" data-testid="hero-monthly-saving">
 {hasRealVolume ? formatEuroCompact(totalMonthlySaving) : formatEuroCompact(totalUnitSaving)}€
 </span>
 <span className="text-sm text-white/60">
 {hasRealVolume
 ? (lang === "de" ? "/ Monat" : "/ mese")
 : (lang === "de" ? "pro Einheit (theoretisch)" : "per unità (teorico)")}
 </span>
 </div>
 <div className="text-xs text-white/60 mt-1.5">
 {hasRealVolume ? (
 lang === "de"
 ? <>bei <span className="text-white font-medium">{switchableWithVolume.length}</span> möglichen Lieferantenwechseln · {switchable.length - switchableWithVolume.length > 0 && <>{switchable.length - switchableWithVolume.length} weitere ohne Bestellhistorie · </>}{grouped.filter(g => g.isAlreadyBest).length} bereits optimal</>
 : <>con <span className="text-white font-medium">{switchableWithVolume.length}</span> cambi possibili · {grouped.filter(g => g.isAlreadyBest).length} già ottimali</>
 ) : (
 lang === "de"
 ? <>{switchable.length} Produkte günstiger verfügbar · noch keine Bestellhistorie für Hochrechnung</>
 : <>{switchable.length} prodotti più convenienti · cronologia ordini insufficiente</>
 )}
 </div>
 </div>

 <Button
 size="sm"
 onClick={openWechselplan}
 disabled={wechselplanCandidates.length === 0}
 className="bg-emerald-500 hover:bg-emerald-400 text-white shrink-0 shadow-md"
 data-testid="button-open-wechselplan"
 >
 <ShoppingCart className="h-4 w-4 mr-1.5" />
 {lang === "de" ? "Wechselplan öffnen" : "Apri piano"}
 </Button>
 </div>

 {/* Cost-per-guest projection */}
 {costAnalysis && totalOvernightsNum > 0 && (
 <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
 <div className="flex items-center justify-between text-xs flex-wrap gap-2">
 <span className="text-white/50">
 {lang === "de" ? "Wareneinsatz aktueller Monat" : "Costo merci mese corrente"}
 </span>
 <span className="text-white/80 tabular-nums">
 <span className="font-semibold text-white">{formatEuro(costPerGuestNum)}€</span>
 <span className="text-white/50"> / {lang === "de" ? "Gast" : "ospite"}</span>
 {Number(costAnalysis.targetCost) > 0 && (
 <span className={`ml-2 ${costDifferenceNum > 0 ? "text-orange-300" : "text-emerald-300"}`}>
 {costDifferenceNum > 0 ? "+" : ""}{formatEuro(costDifferenceNum)}€ {lang === "de" ? "vs. Ziel" : "vs. obiettivo"}
 </span>
 )}
 </span>
 </div>
 {projectedCostPerGuestDelta > 0 && (
 <div className="flex items-center justify-between text-xs flex-wrap gap-2" data-testid="hero-cost-per-guest-projection">
 <span className="text-emerald-300/80 inline-flex items-center gap-1">
 <TrendingDown className="h-3 w-3" />
 {lang === "de" ? "Bei vollständigem Wechsel" : "A switch completo"}
 </span>
 <span className="tabular-nums">
 <span className="font-bold text-emerald-300">−{formatEuro(projectedCostPerGuestDelta)}€</span>
 <span className="text-white/60"> / {lang === "de" ? "Gast" : "ospite"}</span>
 <span className="text-white/40"> · {lang === "de" ? "neu" : "nuovo"} </span>
 <span className="text-white">{formatEuro(projectedNewCostPerGuest)}€</span>
 </span>
 </div>
 )}
 </div>
 )}
 </div>
 </div></HeroPortal>

 {/* ─── TOOLBAR (Suchen · Sortieren · Filter) ────────────────────── */}
 <div className="px-4 md:px-6">
 <div className="flex items-center gap-2 flex-wrap justify-start">
 {/* Active filter chips (right) */}
 <div className="flex items-center gap-2 flex-wrap ml-auto order-last">
 {selectedCategory !== "all" && (
 <button onClick={() => setSelectedCategory("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-category">
 <span>{selectedCategory}</span><X className="h-3 w-3" />
 </button>
 )}
 {selectedSupplier !== "all" && (
 <button onClick={() => setSelectedSupplier("all")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-supplier">
 <span>{allSuppliers.find(s => s.id === selectedSupplier)?.name || "—"}</span><X className="h-3 w-3" />
 </button>
 )}
 {!onlyWithSavings && (
 <button onClick={() => setOnlyWithSavings(true)} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-show-all">
 <span>{lang === "de" ? "Alle Vergleiche" : "Tutti i confronti"}</span><X className="h-3 w-3" />
 </button>
 )}
 {searchQuery && (
 <button onClick={() => setSearchQuery("")} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted border border-border text-foreground text-[11px] hover:bg-muted/70" data-testid="chip-search">
 <span>"{searchQuery}"</span><X className="h-3 w-3" />
 </button>
 )}
 </div>

 <div className="inline-flex items-center gap-1 rounded-full bg-card border border-border p-1 shadow-sm">
 {/* Search */}
 <Popover>
 <PopoverTrigger asChild>
 <button
 className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${searchQuery ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
 title={lang === "de" ? "Suchen" : "Cerca"}
 data-testid="button-toolbar-search"
 >
 <Search className="h-4 w-4" />
 {searchQuery && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
 </button>
 </PopoverTrigger>
 <PopoverContent align="end" className="w-72 p-3">
 <div className="space-y-2">
 <Label className="text-xs">{lang === "de" ? "Produkt, Lieferant, Kategorie" : "Prodotto, fornitore, categoria"}</Label>
 <div className="relative">
 <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
 <Input
 autoFocus
 placeholder={lang === "de" ? "Suchen…" : "Cerca…"}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="h-9 pl-8 text-sm"
 data-testid="input-toolbar-search"
 />
 </div>
 {searchQuery && (
 <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => setSearchQuery("")}>
 <X className="h-3 w-3 mr-1" />{lang === "de" ? "Suche zurücksetzen" : "Cancella"}
 </Button>
 )}
 </div>
 </PopoverContent>
 </Popover>

 {/* Sort */}
 <Popover>
 <PopoverTrigger asChild>
 <button
 className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${sortBy !== "saving" || sortDir !== "desc" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
 title={lang === "de" ? "Sortieren" : "Ordina"}
 data-testid="button-toolbar-sort"
 >
 <ArrowUpDown className="h-4 w-4" />
 </button>
 </PopoverTrigger>
 <PopoverContent align="end" className="w-56 p-2">
 <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
 {lang === "de" ? "Sortieren nach" : "Ordina per"}
 </div>
 {([
 { key: "saving", label: lang === "de" ? "Ersparnis €/Monat" : "Risparmio €/mese" },
 { key: "saving_pct", label: lang === "de" ? "Ersparnis %" : "Risparmio %" },
 { key: "price", label: lang === "de" ? "Bester Preis" : "Miglior prezzo" },
 { key: "name", label: lang === "de" ? "Name" : "Nome" },
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
 className={`relative inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors hover-elevate ${hasActiveFilters ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
 title="Filter"
 data-testid="button-toolbar-filter"
 >
 <FilterIcon className="h-4 w-4" />
 {hasActiveFilters && (
 <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 inline-flex items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
 {activeFilterCount}
 </span>
 )}
 </button>
 </PopoverTrigger>
 <PopoverContent align="end" className="w-80 p-3">
 <div className="space-y-3">
 <div>
 <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">
 {lang === "de" ? "Anzeige" : "Visualizza"}
 </Label>
 <div className="flex items-center gap-2">
 <Checkbox id="only-savings" checked={onlyWithSavings} onCheckedChange={(c) => setOnlyWithSavings(!!c)} data-testid="filter-only-savings" />
 <Label htmlFor="only-savings" className="text-sm cursor-pointer">
 {lang === "de" ? "Nur Produkte mit Ersparnis" : "Solo prodotti con risparmio"}
 </Label>
 </div>
 </div>
 {categories.length > 0 && (
 <div>
 <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">
 {lang === "de" ? "Kategorie" : "Categoria"}
 </Label>
 <select
 value={selectedCategory}
 onChange={(e) => setSelectedCategory(e.target.value)}
 className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
 data-testid="filter-category-select"
 >
 <option value="all">{lang === "de" ? "Alle Kategorien" : "Tutte le categorie"}</option>
 {categories.map(c => <option key={c} value={c}>{c}</option>)}
 </select>
 </div>
 )}
 {allSuppliers.length > 0 && (
 <div>
 <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5 block">
 {lang === "de" ? "Lieferant beteiligt" : "Fornitore coinvolto"}
 </Label>
 <select
 value={selectedSupplier}
 onChange={(e) => setSelectedSupplier(e.target.value)}
 className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
 data-testid="filter-supplier-select"
 >
 <option value="all">{lang === "de" ? "Alle Lieferanten" : "Tutti i fornitori"}</option>
 {allSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
 </select>
 </div>
 )}
 {(hasActiveFilters || searchQuery) && (
 <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={clearFilters}>
 <X className="h-3 w-3 mr-1" />{lang === "de" ? "Alle Filter zurücksetzen" : "Reset"}
 </Button>
 )}
 </div>
 </PopoverContent>
 </Popover>
 </div>

 <span className="text-xs text-muted-foreground" data-testid="text-result-count">
 {filtered.length} {lang === "de" ? (filtered.length === 1 ? "Vergleich" : "Vergleiche") : (filtered.length === 1 ? "confronto" : "confronti")}
 </span>
 </div>
 </div>

 {/* ─── PRODUCT LIST ─────────────────────────────────────────────── */}
 <div className="px-4 md:px-6">
 {filtered.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-16 text-center">
 <Package className="h-12 w-12 text-muted-foreground/30 mb-3" />
 <p className="text-sm text-muted-foreground max-w-md">
 {grouped.length === 0
 ? (lang === "de"
 ? "Keine vergleichbaren Produkte verfügbar. Vergleiche erscheinen, wenn mehrere Lieferanten das gleiche Produkt anbieten."
 : "Nessun prodotto confrontabile.")
 : (lang === "de"
 ? "Keine Vergleiche entsprechen den aktuellen Filtern."
 : "Nessun confronto corrisponde ai filtri.")}
 </p>
 {grouped.length > 0 && (
 <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
 {lang === "de" ? "Filter zurücksetzen" : "Reset filtri"}
 </Button>
 )}
 </div>
 ) : (
 <div className="space-y-3">
 {visible.map((g) => (
 <ComparisonCard
 key={g.key}
 group={g}
 rank={rankByKey.get(g.key) ?? null}
 lang={lang}
 expanded={expandedGroups.has(g.key)}
 onToggle={() => toggleExpand(g.key)}
 onVisitSupplier={() => handleVisitSupplier(g)}
 movMap={movMap}
 totalOvernights={totalOvernightsNum}
 ratingMap={ratingSummaries}
 />
 ))}

 {filtered.length > visible.length && !showAll && (
 <Button variant="outline" className="w-full" onClick={() => setShowAll(true)} data-testid="button-show-all">
 <ChevronDown className="h-4 w-4 mr-1" />
 {lang === "de"
 ? `Weitere ${filtered.length - visible.length} Vergleiche anzeigen`
 : `Mostra altri ${filtered.length - visible.length}`}
 </Button>
 )}
 {showAll && filtered.length > 8 && (
 <Button variant="ghost" className="w-full" onClick={() => setShowAll(false)} data-testid="button-show-less">
 <ChevronUp className="h-4 w-4 mr-1" />
 {lang === "de" ? "Weniger anzeigen" : "Mostra meno"}
 </Button>
 )}
 </div>
 )}
 </div>

 {/* ─── WECHSELPLAN DIALOG ───────────────────────────────────────── */}
 <Dialog open={wechselplanOpen} onOpenChange={setWechselplanOpen}>
 <DialogContent className="gap-0 max-w-2xl max-h-[90vh] flex flex-col p-0">
 <DialogHeader className="px-5 pt-5 pb-3 border-b">
 <DialogTitle className="flex items-center gap-2">
 <ArrowRight className="h-5 w-5 text-emerald-500" />
 {lang === "de" ? "Wechselplan" : "Piano di switch"}
 </DialogTitle>
 <DialogDescription>
 {lang === "de"
 ? "Wähle die Produkte, die du beim besten Anbieter in den Warenkorb legen willst. Mengen sind auf deinen Monatsbedarf vorausgefüllt."
 : "Seleziona i prodotti da aggiungere al carrello presso il miglior fornitore."}
 </DialogDescription>
 </DialogHeader>

 <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
 {wechselplanCandidates.length === 0 ? (
 <div className="text-center py-12 text-sm text-muted-foreground">
 <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
 {lang === "de" ? "Du holst bei allen Produkten bereits den besten Preis raus." : "Stai già ottenendo il miglior prezzo."}
 </div>
 ) : (
 wechselplanCandidates.map(g => {
 const checked = wechselplanSelected.has(g.key);
 const qty = wechselplanQuantities[g.key] ?? Math.round(g.monthlyVolume);
 const lineSaving = g.unitDiff * qty;
 const supName = g.cheapestOffer.product.supplier?.companyName || g.cheapestOffer.product.supplier?.name || "—";
 return (
 <div
 key={g.key}
 className={`rounded-lg border p-3 transition-colors ${checked ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/10" : "border-border"}`}
 data-testid={`wechselplan-item-${g.key}`}
 >
 <div className="flex items-start gap-3">
 <Checkbox
 checked={checked}
 onCheckedChange={(c) => {
 setWechselplanSelected(prev => {
 const next = new Set(prev);
 if (c) next.add(g.key); else next.delete(g.key);
 return next;
 });
 }}
 className="mt-0.5"
 data-testid={`wechselplan-checkbox-${g.key}`}
 />
 <div className="flex-1 min-w-0">
 <div className="flex items-baseline justify-between gap-2 flex-wrap">
 <div className="font-medium text-sm truncate">{g.name}</div>
 <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
 −{formatEuro(lineSaving)}€
 </div>
 </div>
 <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
 → {supName} · {formatEuro(g.cheapestOffer.effectivePrice)}€/{g.unit}
 {g.currentOffer && !g.isAlreadyBest && (
 <> · {lang === "de" ? "statt" : "invece di"} {formatEuro(g.currentOffer.effectivePrice)}€</>
 )}
 </div>
 <div className="mt-2 flex items-center gap-2">
 <Label className="text-[11px] text-muted-foreground shrink-0">
 {lang === "de" ? "Menge" : "Quantità"}
 </Label>
 <Input
 type="number"
 min={1}
 value={qty}
 onChange={(e) => setWechselplanQuantities(prev => ({ ...prev, [g.key]: Math.max(1, parseInt(e.target.value) || 1) }))}
 className="h-7 w-20 text-xs"
 data-testid={`wechselplan-qty-${g.key}`}
 />
 <span className="text-[11px] text-muted-foreground">{g.unit}</span>
 <span className="text-[11px] text-muted-foreground/70 ml-auto">
 ~{Math.round(g.monthlyVolume)} {g.unit}/{lang === "de" ? "Mt" : "mese"}
 </span>
 </div>
 </div>
 </div>
 </div>
 );
 })
 )}
 </div>

 <DialogFooter className="px-5 py-3 border-t bg-muted/30 flex-row items-center justify-between">
 <div className="text-sm">
 <span className="text-muted-foreground">{lang === "de" ? "Geschätzte Ersparnis:" : "Risparmio stimato:"}</span>
 <span className="ml-2 font-bold text-emerald-700 dark:text-emerald-400 tabular-nums" data-testid="wechselplan-total">
 {formatEuro(wechselplanSelectedTotal)}€
 </span>
 </div>
 <div className="flex gap-2">
 <Button variant="ghost" size="sm" onClick={() => setWechselplanOpen(false)}>
 {lang === "de" ? "Abbrechen" : "Annulla"}
 </Button>
 <Button
 size="sm"
 disabled={wechselplanSelected.size === 0 || wechselplanSubmitMutation.isPending}
 onClick={() => wechselplanSubmitMutation.mutate()}
 className="bg-emerald-500 hover:bg-emerald-400 text-white"
 data-testid="button-wechselplan-submit"
 >
 <ShoppingCart className="h-4 w-4 mr-1.5" />
 {lang === "de"
 ? `${wechselplanSelected.size} in Warenkorb`
 : `${wechselplanSelected.size} nel carrello`}
 </Button>
 </div>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>
 );
}

// ───────────────────────────────────────────────────────────────────────────
// ComparisonCard
// ───────────────────────────────────────────────────────────────────────────
interface ComparisonCardProps {
 group: GroupedProduct;
 rank: number | null;
 lang: "de" | "it";
 expanded: boolean;
 onToggle: () => void;
 onVisitSupplier: () => void;
 movMap?: Record<string, { minimumValue: string; zone: string | null }>;
 totalOvernights: number;
 ratingMap?: Record<string, { avg: number; count: number }>;
}

function ComparisonCard({ group, rank, lang, expanded, onToggle, onVisitSupplier, movMap, totalOvernights, ratingMap }: ComparisonCardProps) {
 const cheapest = group.cheapestOffer;
 const current = group.currentOffer;
 const anyPromo = group.offers.some(o => o.hasPromo);
 const promoEnding = group.offers.find(o => o.promoEndsAt);
 const promoDays = daysUntil(promoEnding?.promoEndsAt || null);

 const cheapestSupName = cheapest.product.supplier?.companyName || cheapest.product.supplier?.name || "—";
 const currentSupName = current?.product.supplier?.companyName || current?.product.supplier?.name || "—";
 const cheapestMov = movMap?.[cheapest.product.supplierId];

 const moq = cheapest.product.minOrderQuantity ?? 1;
 const swapQty = Math.max(1, moq, Math.round(group.monthlyVolume) || 1);

 const refPrice = current?.effectivePrice ?? cheapest.effectivePrice;
 const monthlyCurrentSpend = refPrice * group.monthlyVolume;
 const monthlyNewSpend = cheapest.effectivePrice * group.monthlyVolume;
 const costPerGuestImpact = totalOvernights > 0 ? group.monthlySaving / totalOvernights : 0;
 const isTopHebel = !group.isAlreadyBest && group.monthlySaving > 0 && rank !== null && rank <= 3;

 return (
 <div
 className={`rounded-xl border bg-card overflow-hidden shadow-sm ${isTopHebel ? "border-orange-300/60 dark:border-orange-700/40 ring-1 ring-orange-200/40 dark:ring-orange-900/20" : "border-border"}`}
 data-testid={`comparison-card-${group.key}`}
 >
 {/* ── Header: product name + headline saving ───────────────────── */}
 <div className="px-4 pt-3.5 pb-3 flex items-start gap-3">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 {isTopHebel && (
 <Badge className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 gap-0.5 font-bold" data-testid={`badge-top-hebel-${group.key}`}>
 <TrendingDown className="h-2.5 w-2.5" />
 {lang === "de" ? `Top-Hebel #${rank}` : `Top #${rank}`}
 </Badge>
 )}
 <span className="font-semibold text-base leading-tight truncate" data-testid={`text-product-name-${group.key}`}>
 {group.name}
 </span>
 </div>
 <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
 <span>{group.category}</span>
 <span>·</span>
 <span>{group.offers.length} {lang === "de" ? "Anbieter" : "fornitori"}</span>
 <span>·</span>
 <span>{lang === "de" ? "pro" : "per"} {group.unit}</span>
 {anyPromo && (
 <Badge variant="destructive" className="text-[9px] px-1.5 py-0 gap-0.5 ml-0.5">
 <Tag className="h-2.5 w-2.5" />
 {promoDays !== null && promoDays >= 0
 ? (lang === "de" ? `Aktion · ${promoDays}T` : `Promo · ${promoDays}g`)
 : (lang === "de" ? "Aktion" : "Promo")}
 </Badge>
 )}
 </div>
 </div>

 {/* Headline saving / "already best" */}
 {!group.isAlreadyBest ? (
 <div className="text-right shrink-0">
 <div className="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
 {lang === "de" ? "Du sparst" : "Risparmi"}
 </div>
 <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-none mt-0.5">
 −{formatEuro(group.unitDiff)}€
 </div>
 <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
 −{group.unitDiffPercent}% / {group.unit}
 </div>
 </div>
 ) : (
 <Badge className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 gap-1 shrink-0">
 <CheckCircle2 className="h-3 w-3" />
 {lang === "de" ? "Bereits Bestpreis" : "Già miglior prezzo"}
 </Badge>
 )}
 </div>

 {/* ── Before → After comparison ────────────────────────────────── */}
 <div className="px-4 pb-3">
 <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch">
 {/* Heute / Aktuell */}
 <div className="rounded-lg bg-muted/40 px-3 py-2.5 min-w-0">
 <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
 {lang === "de" ? "Heute" : "Oggi"}
 </div>
 {current ? (
 <>
 <div className="text-base font-semibold tabular-nums leading-tight">
 {formatEuro(current.effectivePrice)}€
 </div>
 <div className="text-[11px] text-muted-foreground truncate mt-1 flex items-center gap-1.5">
 <Avatar className="h-4 w-4 shrink-0">
 {current.product.supplier?.profileImageUrl ? <AvatarImage src={current.product.supplier.profileImageUrl} /> : null}
 <AvatarFallback className="text-[8px] bg-muted">{currentSupName.charAt(0).toUpperCase()}</AvatarFallback>
 </Avatar>
 <span className="truncate">{currentSupName}</span>
 </div>
 </>
 ) : (
 <>
 <div className="text-base font-semibold text-muted-foreground/60 leading-tight">—</div>
 <div className="text-[11px] text-muted-foreground/60 mt-1">
 {lang === "de" ? "Noch nicht bestellt" : "Mai ordinato"}
 </div>
 </>
 )}
 </div>

 {/* Arrow */}
 <div className="flex items-center justify-center px-0.5 text-emerald-500/70">
 <ArrowRight className="h-4 w-4" />
 </div>

 {/* Bester Preis */}
 <div className={`rounded-lg px-3 py-2.5 min-w-0 ${group.isAlreadyBest ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40" : "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40"}`}>
 <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold mb-1 flex items-center gap-1">
 <TrendingDown className="h-3 w-3" />
 {lang === "de" ? "Bester Preis" : "Miglior prezzo"}
 </div>
 <div className="text-base font-bold text-emerald-700 dark:text-emerald-400 tabular-nums leading-tight">
 {formatEuro(cheapest.effectivePrice)}€
 </div>
 <div className="text-[11px] text-muted-foreground truncate mt-1 flex items-center gap-1.5">
 <Avatar className="h-4 w-4 shrink-0">
 {cheapest.product.supplier?.profileImageUrl ? <AvatarImage src={cheapest.product.supplier.profileImageUrl} /> : null}
 <AvatarFallback className="text-[8px] bg-emerald-200/50 dark:bg-emerald-900/40">{cheapestSupName.charAt(0).toUpperCase()}</AvatarFallback>
 </Avatar>
 <span className="truncate font-medium text-foreground">{cheapestSupName}</span>
 </div>
 </div>
 </div>

 {/* Monthly purchase volume + cost-per-guest impact */}
 {group.monthlyVolume > 0 && !group.isAlreadyBest && group.monthlySaving > 0 && (
 <div className="mt-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-200/50 dark:border-emerald-900/30 px-3 py-2" data-testid={`impact-panel-${group.key}`}>
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-1.5 text-[11px] min-w-0">
 <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
 <span className="text-muted-foreground">{lang === "de" ? "Du kaufst" : "Acquisti"}</span>
 <span className="font-semibold tabular-nums text-foreground">
 ~{Math.round(group.monthlyVolume)} {group.unit}
 </span>
 <span className="text-muted-foreground">/{lang === "de" ? "Mt" : "mese"}</span>
 </div>
 <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
 <span className="text-muted-foreground line-through">{formatEuro(monthlyCurrentSpend)}€</span>
 <ArrowRight className="h-3 w-3 text-emerald-600/70" />
 <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatEuro(monthlyNewSpend)}€</span>
 <span className="text-muted-foreground">/{lang === "de" ? "Mt" : "mese"}</span>
 </div>
 </div>
 {totalOvernights > 0 && costPerGuestImpact > 0 && (
 <div className="mt-1.5 pt-1.5 border-t border-emerald-200/40 dark:border-emerald-900/30 flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
 <TrendingDown className="h-3.5 w-3.5 text-emerald-600/80" />
 <span>{lang === "de" ? "Wirkung auf Wareneinsatz" : "Impatto su costo merci"}</span>
 </div>
 <div className="text-[12px] tabular-nums">
 <span className="font-bold text-emerald-700 dark:text-emerald-400">−{formatEuro(costPerGuestImpact)}€</span>
 <span className="text-muted-foreground"> / {lang === "de" ? "Gast" : "ospite"}</span>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Trust signals: only volume (when no savings) + MBW + MOQ */}
 {((group.monthlyVolume > 0 && (group.monthlySaving === 0 || group.isAlreadyBest)) || cheapestMov || moq > 1) && (
 <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted-foreground">
 {group.monthlyVolume > 0 && (group.monthlySaving === 0 || group.isAlreadyBest) && (
 <span className="inline-flex items-center gap-1">
 <Clock className="h-3 w-3" />
 ~{Math.round(group.monthlyVolume)} {group.unit}/{lang === "de" ? "Monat" : "mese"}
 </span>
 )}
 {cheapestMov && (
 <span className="inline-flex items-center gap-1">
 <Truck className="h-3 w-3" />
 {lang === "de" ? "MBW" : "Min."} {formatEuro(parseFloat(cheapestMov.minimumValue))}€
 </span>
 )}
 {moq > 1 && (
 <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
 <AlertTriangle className="h-3 w-3" />
 {lang === "de" ? "Mindestmenge" : "Min."} {moq} {group.unit}
 </span>
 )}
 </div>
 )}
 </div>

 {/* ── Action bar ───────────────────────────────────────────────── */}
 <div className="border-t border-border/60 bg-muted/20 px-3 py-2.5 flex items-center gap-2 flex-wrap">
 {!group.isAlreadyBest ? (
 <>
 <Button
 size="sm"
 onClick={(e) => { e.stopPropagation(); onVisitSupplier(); }}
 className="bg-emerald-500 hover:bg-emerald-400 text-white h-8 text-xs"
 data-testid={`button-visit-supplier-${group.key}`}
 >
 <Package className="h-3.5 w-3.5 mr-1.5" />
 {lang === "de" ? `Bei ${cheapestSupName} einkaufen` : `Acquista da ${cheapestSupName}`}
 </Button>
 <Button
 variant="ghost"
 size="sm"
 onClick={onToggle}
 className="h-8 text-xs ml-auto"
 data-testid={`toggle-${group.key}`}
 >
 {expanded
 ? <>{lang === "de" ? "Weniger" : "Meno"} <ChevronUp className="h-3.5 w-3.5 ml-1" /></>
 : <>{lang === "de" ? `Alle ${group.offers.length} Anbieter` : `Tutti i ${group.offers.length}`} <ChevronDown className="h-3.5 w-3.5 ml-1" /></>
 }
 </Button>
 </>
 ) : (
 <Button
 variant="ghost"
 size="sm"
 onClick={onToggle}
 className="h-7 text-xs ml-auto"
 data-testid={`toggle-${group.key}`}
 >
 {expanded
 ? <>{lang === "de" ? "Weniger" : "Meno"} <ChevronUp className="h-3.5 w-3.5 ml-1" /></>
 : <>{lang === "de" ? `Alle ${group.offers.length} Anbieter zeigen` : `Mostra ${group.offers.length}`} <ChevronDown className="h-3.5 w-3.5 ml-1" /></>
 }
 </Button>
 )}
 </div>

 {/* ── Expanded supplier list ───────────────────────────────────── */}
 {expanded && (
 <div className="border-t border-border/60 divide-y divide-border/40">
 {group.offers.map((offer) => {
 const isCheapest = offer.product.id === cheapest.product.id;
 const isCurrent = current && offer.product.id === current.product.id;
 const diff = offer.effectivePrice - cheapest.effectivePrice;
 const diffPct = cheapest.effectivePrice > 0 ? Math.round((diff / cheapest.effectivePrice) * 100) : 0;
 const supName = offer.product.supplier?.companyName || offer.product.supplier?.name || "—";
 return (
 <div
 key={offer.product.id}
 className={`flex items-center gap-3 px-3.5 md:px-4 py-2.5 ${isCheapest ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}`}
 data-testid={`offer-${offer.product.id}`}
 >
 <Avatar className="h-8 w-8 shrink-0">
 {offer.product.supplier?.profileImageUrl ? <AvatarImage src={offer.product.supplier.profileImageUrl} /> : null}
 <AvatarFallback className="text-xs bg-muted">{supName.charAt(0).toUpperCase()}</AvatarFallback>
 </Avatar>
 <div className="flex-1 min-w-0">
 <div className="text-sm font-medium truncate flex items-center gap-1.5">
 {supName}
 {isCurrent && <Badge variant="outline" className="text-[9px] px-1 py-0">{lang === "de" ? "Aktuell" : "Attuale"}</Badge>}
 {ratingMap?.[offer.product.supplierId] && ratingMap[offer.product.supplierId].count > 0 && (
 <StarRating
 value={ratingMap[offer.product.supplierId].avg}
 size="sm"
 showValue
 count={ratingMap[offer.product.supplierId].count}
 data-testid={`offer-supplier-rating-${offer.product.supplierId}`}
 />
 )}
 </div>
 <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
 {offer.hasPromo && (
 <Badge variant="destructive" className="text-[9px] px-1 py-0 gap-0.5">
 <Tag className="h-2 w-2" />−{offer.promoPercent}%
 </Badge>
 )}
 {offer.product.minOrderQuantity && offer.product.minOrderQuantity > 1 && (
 <span>MOQ {offer.product.minOrderQuantity}</span>
 )}
 </div>
 </div>
 <div className="text-right shrink-0">
 <div className={`text-sm font-bold tabular-nums ${isCheapest ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
 {formatEuro(offer.effectivePrice)}€
 </div>
 {!isCheapest && (
 <div className="text-[10px] text-orange-600 dark:text-orange-400 tabular-nums">
 +{formatEuro(diff)}€ · +{diffPct}%
 </div>
 )}
 {isCheapest && (
 <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
 {lang === "de" ? "Günstigster" : "Migliore"}
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
}
