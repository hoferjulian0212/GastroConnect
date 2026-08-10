import { searchIncludes } from "@shared/searchText";
import { useState, useRef, useEffect, useMemo, Fragment } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { SectionTabs } from "@/components/SectionTabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Search, Package, Plus, Pencil, Trash2, Upload, X, ImageIcon, ArrowUp, ArrowDown, AlertTriangle, History, Warehouse, RefreshCw, Tag, Calendar, Percent, Loader2, ArrowLeft, Carrot, Apple, Beef, Fish, Milk, Wine, Wheat, Flame, MoreHorizontal, Droplets, Egg, Coffee, Sandwich, ChevronDown, ChevronRight, User as UserIcon, Database } from "lucide-react";
import { ProductImage } from "@/components/ProductImage";

import type { Product, StockMovement, PromotionWithProduct } from "@shared/schema";
import { can } from "@shared/permissions";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { InventoryRiskWizard } from "@/components/InventoryRiskWizard";
import type { InventoryRiskRecordWithDetails } from "@shared/schema";
import BulkPriceUpdateDialog from "@/components/BulkPriceUpdateDialog";
import PriceListImportDialog from "@/components/PriceListImportDialog";
import { z } from "zod";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import PullToRefreshWrapper from "@/components/PullToRefreshWrapper";
import { format, formatDistanceToNow } from "date-fns";
import { de, it as itLocale } from "date-fns/locale";
import { useResizableColumns } from "@/hooks/use-resizable-columns";
import { pluralizeUnit } from "@/lib/units";
import { ColumnResizeHandle } from "@/components/ColumnResizeHandle";
import {
 INVENTORY_COL_DEFAULTS,
 INVENTORY_COL_MIN_WIDTHS,
 INVENTORY_COLS_STORAGE_KEY,
 INVENTORY_DENSITY_STORAGE_KEY,
 type InventoryColKey,
 type RowDensity,
 densityRowClass as densityRowClassFn,
 densityHeaderClass as densityHeaderClassFn,
} from "@/lib/orderTableConfig";

const productSchema = z.object({
 articleNumber: z.string().max(64, "Max 64 Zeichen").optional(),
 gtin: z.string().max(20, "Max 20 Zeichen").optional(),
 name: z.string().min(1, "Name ist erforderlich"),
 description: z.string().optional(),
 price: z.string().min(1, "Preis ist erforderlich"),
 unit: z.string().min(1, "Einheit ist erforderlich"),
 category: z.string().optional(),
 inStock: z.boolean().default(true),
 stockQuantity: z.preprocess((v) => (v === undefined || v === null || v === "" ? 0 : v), z.number().int().min(0)).optional(),
 lowStockThreshold: z.preprocess((v) => (v === undefined || v === null || v === "" ? 0 : v), z.number().int().min(0)).optional(),
 minOrderQuantity: z.preprocess((v) => (v === undefined || v === null || v === "" ? undefined : v), z.number().int().min(1, "Min. 1")).default(1),
 imageUrl: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

export function InventoryView({ products, lang, t }: { products: Product[]; lang: string; t: ReturnType<typeof useT> }) {
 const { currentUser } = useUser();
 const { toast } = useToast();
 const [searchQuery, setSearchQuery] = useState("");
 const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");
 const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
 const [adjustMode, setAdjustMode] = useState<"manual_in" | "manual_out" | "manual_set">("manual_in");
 const [adjustQty, setAdjustQty] = useState(1);
 const [adjustNote, setAdjustNote] = useState("");
 const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
 const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
 const toggleCategory = (cat: string) => setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));

 const INVENTORY_COLS: InventoryColKey[] = useMemo(() => ["product", "category", "stock", "threshold", "status", "actions"], []);
 const { gridTemplate: inventoryGridTemplate, startResize: startInventoryResize, containerRef: inventoryContainerRef } = useResizableColumns<InventoryColKey>(
 INVENTORY_COLS_STORAGE_KEY,
 INVENTORY_COL_DEFAULTS,
 INVENTORY_COLS,
 { flexKey: "product", minWidths: INVENTORY_COL_MIN_WIDTHS },
 );
 const [rowDensity, setRowDensity] = useState<RowDensity>(() => {
 try {
 const saved = localStorage.getItem(INVENTORY_DENSITY_STORAGE_KEY) as RowDensity | null;
 if (saved === "compact" || saved === "normal" || saved === "comfortable") return saved;
 } catch {}
 return "normal";
 });
 useEffect(() => {
 try { localStorage.setItem(INVENTORY_DENSITY_STORAGE_KEY, rowDensity); } catch {}
 }, [rowDensity]);
 const densityRowClass = densityRowClassFn(rowDensity);
 const densityHeaderClass = densityHeaderClassFn(rowDensity);

 const { data: stockMovements, isLoading: stockMovementsLoading } = useQuery<StockMovement[]>({
 queryKey: [`/api/stock-movements?productId=${historyProduct?.id}`],
 enabled: !!historyProduct?.id,
 });

 const stockMovementMutation = useMutation({
 mutationFn: async (data: { productId: string; supplierId: string; userId?: string; type: "manual_in" | "manual_out" | "manual_set"; quantity: number; note?: string }) => {
 return apiRequest("POST", "/api/stock-movements", data);
 },
 onSuccess: (_data, variables) => {
 queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: [`/api/stock-movements?productId=${variables.productId}`] });
 queryClient.invalidateQueries({ queryKey: ['/api/low-stock', currentUser?.id] });
 queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
 toast({ title: t("supplierProducts", "stockUpdated") });
 setAdjustProduct(null);
 setAdjustQty(1);
 setAdjustNote("");
 },
 onError: () => {
 toast({
 title: t("common", "error"),
 description: t("supplierProducts", "stockUpdateError"),
 variant: "destructive",
 });
 },
 });

 const quickAdjust = (product: Product, delta: number) => {
 if (!currentUser) return;
 const current = product.stockQuantity ?? 0;
 const newQty = current + delta;
 if (newQty < 0) return;
 stockMovementMutation.mutate({
 productId: product.id,
 supplierId: currentUser.id,
 userId: currentUser.id,
 type: delta > 0 ? "manual_in" : "manual_out",
 quantity: Math.abs(delta),
 });
 };

 const openAdjustDialog = (product: Product) => {
 setAdjustProduct(product);
 setAdjustMode("manual_in");
 setAdjustQty(1);
 setAdjustNote("");
 };

 const handleAdjustSubmit = () => {
 if (!currentUser || !adjustProduct) return;
 const current = adjustProduct.stockQuantity ?? 0;
 const maxOut = Math.max(0, current);
 const finalQty = adjustMode === "manual_out" ? Math.min(adjustQty, maxOut) : adjustQty;
 if (adjustMode !== "manual_set" && finalQty < 1) return;
 stockMovementMutation.mutate({
 productId: adjustProduct.id,
 supplierId: currentUser.id,
 userId: currentUser.id,
 type: adjustMode,
 quantity: finalQty,
 note: adjustNote || undefined,
 });
 };

 const getPreviewStock = () => {
 if (!adjustProduct) return 0;
 const current = adjustProduct.stockQuantity ?? 0;
 if (adjustMode === "manual_set") return adjustQty;
 if (adjustMode === "manual_in") return current + adjustQty;
 return current - Math.min(adjustQty, current);
 };

 const getMovementTypeLabel = (type: string) => {
 switch (type) {
 case "manual_in": return t("supplierProducts", "manualIn");
 case "manual_out": return t("supplierProducts", "manualOut");
 case "manual_set": return t("supplierProducts", "manualSetMovement");
 case "order_confirmed": return t("supplierProducts", "orderConfirmedMovement");
 case "order_cancelled": return t("supplierProducts", "orderCancelledMovement");
 case "order_reversed": return t("supplierProducts", "orderReversedMovement");
 default: return type;
 }
 };

 const outOfStockCount = products.filter(p => (p.stockQuantity ?? 0) === 0).length;
 const lowStockCount = products.filter(p => p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold && (p.stockQuantity ?? 0) > 0).length;

 const filtered = products.filter(p => {
 const matchesSearch = !searchQuery || searchIncludes(p.name, searchQuery) ||
 searchIncludes(p.category, searchQuery);
 if (!matchesSearch) return false;
 if (statusFilter === "low") return p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold && (p.stockQuantity ?? 0) > 0;
 if (statusFilter === "out") return (p.stockQuantity ?? 0) === 0;
 return true;
 });

 const getStockStatus = (p: Product) => {
 const qty = p.stockQuantity ?? 0;
 if (qty === 0) return "out";
 if (p.lowStockThreshold && p.lowStockThreshold > 0 && qty <= p.lowStockThreshold) return "low";
 return "ok";
 };

 const inventoryCategoryMeta: Record<string, { de: string; it: string; icon: typeof Package; dot: string }> = {
 "Gemüse": { de: "Gemüse", it: "Verdura", icon: Carrot, dot: "bg-green-600" },
 "Obst": { de: "Obst", it: "Frutta", icon: Apple, dot: "bg-red-500" },
 "Kräuter": { de: "Kräuter", it: "Erbe", icon: Carrot, dot: "bg-lime-600" },
 "Fleisch": { de: "Fleisch", it: "Carne", icon: Beef, dot: "bg-rose-700" },
 "Wurst": { de: "Wurst", it: "Salumi", icon: Beef, dot: "bg-rose-800" },
 "Fisch": { de: "Fisch", it: "Pesce", icon: Fish, dot: "bg-cyan-600" },
 "Meeresfrüchte": { de: "Meeresfrüchte", it: "Frutti di mare", icon: Fish, dot: "bg-teal-600" },
 "Käse": { de: "Käse", it: "Formaggi", icon: Milk, dot: "bg-yellow-500" },
 "Milchprodukte": { de: "Milchprodukte", it: "Latticini", icon: Milk, dot: "bg-teal-400" },
 "Wein": { de: "Wein", it: "Vino", icon: Wine, dot: "bg-purple-700" },
 "Spirituosen": { de: "Spirituosen", it: "Liquori", icon: Wine, dot: "bg-fuchsia-700" },
 "Getränke": { de: "Getränke", it: "Bevande", icon: Droplets, dot: "bg-purple-600" },
 "Kaffee": { de: "Kaffee", it: "Caffè", icon: Coffee, dot: "bg-amber-800" },
 "Pasta": { de: "Pasta", it: "Pasta", icon: Wheat, dot: "bg-amber-500" },
 "Trockenwaren": { de: "Trockenwaren", it: "Prodotti secchi", icon: Wheat, dot: "bg-amber-700" },
 "Konserven": { de: "Konserven", it: "Conserve", icon: Package, dot: "bg-slate-600" },
 "Saucen": { de: "Saucen", it: "Salse", icon: Droplets, dot: "bg-red-700" },
 "Öl & Essig": { de: "Öl & Essig", it: "Olio & Aceto", icon: Droplets, dot: "bg-yellow-600" },
 "Gewürze": { de: "Gewürze", it: "Spezie", icon: Flame, dot: "bg-orange-500" },
 "Brot": { de: "Brot", it: "Pane", icon: Sandwich, dot: "bg-yellow-700" },
 "Sonstiges": { de: "Sonstiges", it: "Altro", icon: MoreHorizontal, dot: "bg-gray-500" },
 };
 const knownInvCategories = Object.keys(inventoryCategoryMeta).filter(c => c !== "Sonstiges");
 const getCategoryMeta = (cat: string) => inventoryCategoryMeta[cat] || inventoryCategoryMeta["Sonstiges"];
 const slugifyCategory = (cat: string) =>
 cat
 .toLowerCase()
 .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-+|-+$/g, "") || "category";

 const groupedFiltered = useMemo(() => {
 const map = new Map<string, Product[]>();
 filtered.forEach(p => {
 const rawCat = p.category && knownInvCategories.includes(p.category) ? p.category : "Sonstiges";
 if (!map.has(rawCat)) map.set(rawCat, []);
 map.get(rawCat)!.push(p);
 });
 const order = [...Object.keys(inventoryCategoryMeta)];
 return Array.from(map.entries())
 .sort((a, b) => {
 const ai = order.indexOf(a[0]);
 const bi = order.indexOf(b[0]);
 return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
 })
 .map(([category, items]) => ({ category, items }));
 }, [filtered]);

 return (
 <div className="space-y-4">
 <div className="relative w-full sm:max-w-xs mb-4">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder={t("common", "search") + "..."}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-9 text-sm h-9"
 data-testid="input-search-inventory"
 />
 </div>

 {filtered.length === 0 ? (
 <div className="text-center py-10">
 <Warehouse className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
 <p className="text-sm text-muted-foreground">
 {statusFilter === "low"
 ? (lang === "de" ? "Keine Produkte mit niedrigem Bestand" : "Nessun prodotto con scorta bassa")
 : statusFilter === "out"
 ? (lang === "de" ? "Keine ausverkauften Produkte" : "Nessun prodotto esaurito")
 : t("supplierProducts", "noProducts")}
 </p>
 {statusFilter !== "all" && (
 <Button variant="ghost" size="sm" className="mt-2" onClick={() => setStatusFilter("all")} data-testid="button-show-all">
 {lang === "de" ? "Alle anzeigen" : "Mostra tutti"}
 </Button>
 )}
 </div>
 ) : (
 <>
 {/* Desktop Excel-style table grouped by category */}
 <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden" data-testid="inventory-table">
 <div
 ref={inventoryContainerRef}
 className={`grid items-stretch gap-0 [&>*]:px-3 [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:!text-center [&>*]:min-w-0 ${densityHeaderClass} bg-muted/40 border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground font-semibold [&>*+*]:border-l [&>*+*]:border-border`}
 style={{ gridTemplateColumns: inventoryGridTemplate }}
 >
 <div className="relative pr-2 !justify-start !text-left">{lang === "de" ? "Produkt" : "Prodotto"}<ColumnResizeHandle onPointerDown={startInventoryResize("product")} testId="resize-inv-product" /></div>
 <div className="relative pr-2">{lang === "de" ? "Kategorie" : "Categoria"}<ColumnResizeHandle onPointerDown={startInventoryResize("category")} testId="resize-inv-category" /></div>
 <div className="relative pr-2 text-right">{lang === "de" ? "Bestand" : "Scorta"}<ColumnResizeHandle onPointerDown={startInventoryResize("stock")} testId="resize-inv-stock" /></div>
 <div className="relative pr-2 text-right">{lang === "de" ? "Min" : "Min"}<ColumnResizeHandle onPointerDown={startInventoryResize("threshold")} testId="resize-inv-threshold" /></div>
 <div className="relative pr-2">Status<ColumnResizeHandle onPointerDown={startInventoryResize("status")} testId="resize-inv-status" /></div>
 <div></div>
 </div>
 {groupedFiltered.map((group) => {
 const meta = getCategoryMeta(group.category);
 const Icon = meta.icon;
 const collapsed = !!collapsedCategories[group.category];
 const slug = slugifyCategory(group.category);
 const groupOut = group.items.filter(p => (p.stockQuantity ?? 0) === 0).length;
 const groupLow = group.items.filter(p => p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold && (p.stockQuantity ?? 0) > 0).length;
 return (
 <Fragment key={group.category}>
 <button
 type="button"
 onClick={() => toggleCategory(group.category)}
 aria-expanded={!collapsed}
 aria-controls={`inventory-category-content-${slug}`}
 className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/30 hover:bg-muted/50 border-b border-border text-left transition-colors"
 data-testid={`inventory-category-band-${slug}`}
 >
 {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
 <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
 <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
 <span className="text-xs font-semibold text-foreground">{lang === "de" ? meta.de : meta.it}</span>
 <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full ml-1 font-medium">
 {group.items.length}
 </Badge>
 <div className="ml-auto flex items-center gap-1.5 text-[10px]">
 {groupOut > 0 && (
 <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 rounded-full px-1.5 py-0 font-medium">
 {groupOut} {lang === "de" ? "ausverkauft" : "esaurito"}
 </Badge>
 )}
 {groupLow > 0 && (
 <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 rounded-full px-1.5 py-0 font-medium">
 {groupLow} {lang === "de" ? "niedrig" : "basso"}
 </Badge>
 )}
 </div>
 </button>
 {!collapsed && (
 <div id={`inventory-category-content-${slug}`} role="region" aria-label={lang === "de" ? meta.de : meta.it}>
 {group.items.map((product) => {
 const status = getStockStatus(product);
 const currentStock = product.stockQuantity ?? 0;
 return (
 <div
 key={product.id}
 className={`grid items-stretch gap-0 [&>*]:px-3 [&>*]:flex [&>*]:items-center [&>*]:justify-center [&>*]:!text-center [&>*]:min-w-0 ${densityRowClass} border-b border-border last:border-b-0 cursor-pointer transition-colors [&>*+*]:border-l [&>*+*]:border-border ${
 status === "out" ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20" :
 status === "low" ? "bg-orange-50/40 dark:bg-orange-950/10 hover:bg-orange-50/70 dark:hover:bg-orange-950/20" :
 "hover:bg-muted/40"
 }`}
 style={{ gridTemplateColumns: inventoryGridTemplate }}
 onClick={() => openAdjustDialog(product)}
 data-testid={`inventory-row-${product.id}`}
 >
 {/* Product (image + name) */}
 <div className="flex items-center gap-2.5 min-w-0 pr-2 !justify-start !text-left">
 <ProductImage src={product.imageUrl} alt={product.name} className="w-8 h-8 rounded-md" iconClassName="h-3.5 w-3.5" fallbackBg="bg-muted/60" fallbackIconColor="text-muted-foreground/40" />
 <div className="flex flex-col min-w-0">
 <span className="font-medium truncate" data-testid={`text-name-${product.id}`}>{product.name}</span>
 {product.articleNumber && (
 <span className="text-[10px] text-muted-foreground/80 font-mono tabular-nums truncate" data-testid={`text-article-number-${product.id}`}>
 {product.articleNumber}
 </span>
 )}
 </div>
 </div>
 {/* Category */}
 <div className="truncate text-muted-foreground pr-2">
 {product.category || <span className="text-muted-foreground/40">—</span>}
 </div>
 {/* Stock */}
 <div className="text-right tabular-nums pr-2 !flex-col !items-end !justify-center gap-0.5">
 <div>
 <span className={`font-semibold ${
 status === "out" ? "text-red-600 dark:text-red-400" :
 status === "low" ? "text-orange-600 dark:text-orange-400" : ""
 }`}>{currentStock}</span>
 <span className="text-muted-foreground text-[11px] ml-1">{product.unit}</span>
 </div>
 {(product.reservedQuantity ?? 0) > 0 && (
 <span className="text-[10px] text-blue-600 dark:text-blue-400" data-testid={`text-reserved-${product.id}`}>
 {lang === "de" ? "reserviert" : "riservato"}: {product.reservedQuantity}
 </span>
 )}
 </div>
 {/* Threshold */}
 <div className="text-right tabular-nums text-muted-foreground pr-2">
 {product.lowStockThreshold && product.lowStockThreshold > 0
 ? product.lowStockThreshold
 : <span className="text-muted-foreground/40">—</span>}
 </div>
 {/* Status badge */}
 <div className="pr-2">
 {status === "out" ? (
 <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-[10px] rounded-full px-2 py-0.5 font-medium">
 {lang === "de" ? "Ausverkauft" : "Esaurito"}
 </Badge>
 ) : status === "low" ? (
 <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 text-[10px] rounded-full px-2 py-0.5 font-medium">
 <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
 {lang === "de" ? "Niedrig" : "Basso"}
 </Badge>
 ) : (
 <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px] rounded-full px-2 py-0.5 font-medium">
 OK
 </Badge>
 )}
 </div>
 {/* Actions */}
 <div className="flex items-center justify-end gap-0.5">
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 rounded-md"
 onClick={(e) => { e.stopPropagation(); openAdjustDialog(product); }}
 data-testid={`button-stock-adjust-${product.id}`}
 title={lang === "de" ? "Bestand anpassen" : "Regola scorta"}
 >
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 <Button
 variant="ghost"
 size="icon"
 className="h-7 w-7 rounded-md"
 onClick={(e) => { e.stopPropagation(); setHistoryProduct(product); }}
 data-testid={`button-history-${product.id}`}
 title={lang === "de" ? "Verlauf" : "Cronologia"}
 >
 <History className="h-3.5 w-3.5 text-muted-foreground" />
 </Button>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </Fragment>
 );
 })}
 </div>

 {/* Mobile cards grouped by category */}
 <div className="md:hidden space-y-3">
 {groupedFiltered.map((group) => {
 const meta = getCategoryMeta(group.category);
 const Icon = meta.icon;
 const collapsed = !!collapsedCategories[group.category];
 const slug = slugifyCategory(group.category);
 const groupOut = group.items.filter(p => (p.stockQuantity ?? 0) === 0).length;
 const groupLow = group.items.filter(p => p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold && (p.stockQuantity ?? 0) > 0).length;
 return (
 <div key={group.category} data-testid={`inventory-mobile-group-${slug}`}>
 <button
 type="button"
 onClick={() => toggleCategory(group.category)}
 aria-expanded={!collapsed}
 aria-controls={`inventory-mobile-content-${slug}`}
 data-testid={`inventory-mobile-category-band-${slug}`}
 className="w-full flex items-center gap-2 px-2 py-1.5 mb-1.5 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
 >
 {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
 <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${meta.dot}`} />
 <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
 <span className="text-xs font-semibold text-foreground">{lang === "de" ? meta.de : meta.it}</span>
 <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full ml-1 font-medium">{group.items.length}</Badge>
 <div className="ml-auto flex items-center gap-1 text-[10px]">
 {groupOut > 0 && (
 <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 rounded-full px-1.5 py-0 font-medium">{groupOut}</Badge>
 )}
 {groupLow > 0 && (
 <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 rounded-full px-1.5 py-0 font-medium">{groupLow}</Badge>
 )}
 </div>
 </button>
 {!collapsed && (
 <div id={`inventory-mobile-content-${slug}`} role="region" aria-label={lang === "de" ? meta.de : meta.it} className="space-y-1.5">
 {group.items.map((product) => {
 const status = getStockStatus(product);
 const currentStock = product.stockQuantity ?? 0;
 return (
 <div
 key={product.id}
 className={`rounded-xl border p-3 transition-colors ${
 status === "out" ? "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-950/10" :
 status === "low" ? "border-orange-200 dark:border-orange-900/50 bg-orange-50/30 dark:bg-orange-950/10" :
 "border-border"
 }`}
 data-testid={`inventory-card-${product.id}`}
 >
 <div className="flex items-center gap-3">
 <ProductImage src={product.imageUrl} alt={product.name} className="w-10 h-10 rounded-lg" iconClassName="h-4 w-4" fallbackBg="bg-muted/60" fallbackIconColor="text-muted-foreground/30" />

 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5">
 <h3 className="font-semibold text-sm truncate">{product.name}</h3>
 {status === "out" && (
 <Badge variant="outline" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800 text-[9px] px-1.5 py-0 shrink-0">
 {lang === "de" ? "Ausverkauft" : "Esaurito"}
 </Badge>
 )}
 {status === "low" && (
 <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800 text-[9px] px-1.5 py-0 shrink-0">
 <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
 {lang === "de" ? "Niedrig" : "Basso"}
 </Badge>
 )}
 </div>
 {product.articleNumber && (
 <p className="text-[10px] text-muted-foreground/80 font-mono tabular-nums truncate mt-0.5" data-testid={`text-article-number-mobile-${product.id}`}>
 {product.articleNumber}
 </p>
 )}
 <p className="text-[10px] text-muted-foreground mt-0.5">
 {product.category && <span>{product.category}</span>}
 {product.category && product.lowStockThreshold != null && product.lowStockThreshold > 0 && <span> · </span>}
 {product.lowStockThreshold != null && product.lowStockThreshold > 0 && (
 <span>{lang === "de" ? "Min" : "Min"}: {product.lowStockThreshold} {pluralizeUnit(product.unit, product.lowStockThreshold ?? 0)}</span>
 )}
 </p>
 </div>

 <div className="flex items-center gap-1.5 shrink-0">
 <div className="flex flex-col items-center min-w-[44px]">
 <span className={`text-lg font-bold m-num leading-tight ${
 status === "out" ? "text-red-600 dark:text-red-400" :
 status === "low" ? "text-orange-600 dark:text-orange-400" : ""
 }`}>
 {currentStock}
 </span>
 <span className="text-[9px] text-muted-foreground leading-tight">{product.unit}</span>
 {(product.reservedQuantity ?? 0) > 0 && (
 <span className="text-[9px] text-blue-600 dark:text-blue-400 leading-tight" data-testid={`text-reserved-mobile-${product.id}`}>
 {lang === "de" ? "res." : "ris."} {product.reservedQuantity}
 </span>
 )}
 </div>

 <Button
 variant="outline"
 size="icon"
 className="h-8 w-8 rounded-lg"
 onClick={() => openAdjustDialog(product)}
 data-testid={`button-stock-adjust-${product.id}`}
 title={lang === "de" ? "Bestand anpassen" : "Regola scorta"}
 >
 <Pencil className="h-3.5 w-3.5" />
 </Button>

 <Button
 variant="ghost"
 size="icon"
 className="h-8 w-8 rounded-lg ml-0.5"
 onClick={() => setHistoryProduct(product)}
 data-testid={`button-history-${product.id}`}
 >
 <History className="h-3.5 w-3.5 text-muted-foreground" />
 </Button>
 </div>
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
 </>
 )}

 <Dialog open={!!adjustProduct} onOpenChange={(open) => { if (!open) { setAdjustProduct(null); setAdjustQty(1); setAdjustNote(""); } }}>
 <DialogContent className="p-0 gap-0 max-w-sm">
 <DialogHeader className="sr-only">
 <DialogTitle>{t("supplierProducts", "adjustStock")}</DialogTitle>
 </DialogHeader>
 <div className="px-6 pt-6 pb-2">
 <div className="flex items-center gap-2">
 <Package className="h-4 w-4" />
 <h3 className="text-sm font-semibold">{t("supplierProducts", "adjustStock")}</h3>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5 pl-6">{adjustProduct?.name}</p>
 </div>

 <div className="px-6 pb-6 space-y-4">
 <div className="rounded-xl bg-muted/30 p-4 text-center">
 <p className="text-xs text-muted-foreground mb-1">{lang === "de" ? "Aktueller Bestand" : "Scorta attuale"}</p>
 <p className="text-3xl font-bold tabular-nums">{adjustProduct?.stockQuantity ?? 0} <span className="text-sm font-normal text-muted-foreground">{pluralizeUnit(adjustProduct?.unit, adjustProduct?.stockQuantity ?? 0)}</span></p>
 </div>

 <div className="flex gap-1 p-0.5 rounded-lg bg-muted/40">
 {(["manual_in", "manual_out", "manual_set"] as const).map((mode) => {
 const isOutDisabled = mode === "manual_out" && (adjustProduct?.stockQuantity ?? 0) === 0;
 return (
 <button
 key={mode}
 disabled={isOutDisabled}
 className={`flex-1 text-xs font-medium py-2 rounded-md transition-colors ${
 isOutDisabled ? "text-muted-foreground/40 cursor-not-allowed" :
 adjustMode === mode
 ? mode === "manual_in" ? "bg-green-600 text-white shadow-sm" :
 mode === "manual_out" ? "bg-red-600 text-white shadow-sm" :
 "bg-neutral-900 text-white shadow-sm"
 : "text-muted-foreground hover:text-foreground"
 }`}
 onClick={() => {
 if (isOutDisabled) return;
 setAdjustMode(mode);
 setAdjustQty(mode === "manual_set" ? (adjustProduct?.stockQuantity ?? 0) : 1);
 }}
 data-testid={`button-mode-${mode}`}
 >
 {mode === "manual_in" ? t("supplierProducts", "stockIn") :
 mode === "manual_out" ? t("supplierProducts", "stockOut") :
 t("supplierProducts", "manualSet")}
 </button>
 );
 })}
 </div>

 <div className="flex items-center justify-center gap-3">
 <Button
 variant="outline"
 size="icon"
 className="h-10 w-10 rounded-xl"
 onClick={() => setAdjustQty(Math.max(adjustMode === "manual_set" ? 0 : 1, adjustQty - 1))}
 disabled={adjustQty <= (adjustMode === "manual_set" ? 0 : 1)}
 data-testid="button-adjust-qty-minus"
 >
 <span className="text-lg font-medium leading-none">−</span>
 </Button>
 <Input
 type="number"
 min={adjustMode === "manual_set" ? 0 : 1}
 max={adjustMode === "manual_out" ? Math.max(0, adjustProduct?.stockQuantity ?? 0) : undefined}
 value={adjustQty}
 onChange={(e) => {
 const min = adjustMode === "manual_set" ? 0 : 1;
 const max = adjustMode === "manual_out" ? Math.max(0, adjustProduct?.stockQuantity ?? 0) : Infinity;
 setAdjustQty(Math.min(max, Math.max(min, parseInt(e.target.value) || 0)));
 }}
 className="text-center text-xl font-bold w-24 h-12"
 data-testid="input-adjust-qty"
 />
 <Button
 variant="outline"
 size="icon"
 className="h-10 w-10 rounded-xl"
 onClick={() => {
 const max = adjustMode === "manual_out" ? Math.max(0, adjustProduct?.stockQuantity ?? 0) : Infinity;
 setAdjustQty(Math.min(max, adjustQty + 1));
 }}
 data-testid="button-adjust-qty-plus"
 >
 <Plus className="h-4 w-4" />
 </Button>
 </div>

 <div className="rounded-xl bg-muted/30 p-3 flex items-center justify-center gap-3 text-sm">
 <span className="text-muted-foreground tabular-nums">{adjustProduct?.stockQuantity ?? 0}</span>
 <span className="text-muted-foreground">→</span>
 <span className={`font-bold tabular-nums text-base ${
 adjustMode === "manual_in" ? "text-green-600 dark:text-green-400" :
 adjustMode === "manual_out" ? "text-red-600 dark:text-red-400" :
 "text-foreground"
 }`}>{getPreviewStock()}</span>
 <span className="text-muted-foreground text-xs">{pluralizeUnit(adjustProduct?.unit, getPreviewStock())}</span>
 </div>

 <Input
 value={adjustNote}
 onChange={(e) => setAdjustNote(e.target.value)}
 placeholder={t("supplierProducts", "notePlaceholder")}
 className="text-sm"
 data-testid="input-adjust-note"
 />

 <div className="flex gap-2">
 <Button
 variant="outline"
 className="flex-1 rounded-lg"
 onClick={() => { setAdjustProduct(null); setAdjustQty(1); setAdjustNote(""); }}
 data-testid="button-adjust-cancel"
 >
 {t("common", "cancel")}
 </Button>
 <Button
 className={`flex-1 rounded-lg ${
 adjustMode === "manual_in" ? "bg-green-600 hover:bg-green-700" :
 adjustMode === "manual_out" ? "bg-red-600 hover:bg-red-700" :
 "bg-neutral-900 hover:bg-neutral-800 text-white"
 } text-white`}
 onClick={handleAdjustSubmit}
 disabled={stockMovementMutation.isPending || (adjustMode !== "manual_set" && adjustQty < 1)}
 data-testid="button-adjust-confirm"
 >
 {stockMovementMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
 {t("supplierProducts", "confirmAdjustment")}
 </Button>
 </div>
 </div>
 </DialogContent>
 </Dialog>

 <Dialog open={!!historyProduct} onOpenChange={(open) => { if (!open) setHistoryProduct(null); }}>
 <DialogContent className="p-0 gap-0 max-w-lg max-h-[85vh]">
 <DialogHeader className="sr-only">
 <DialogTitle>{t("supplierProducts", "stockMovements")}</DialogTitle>
 </DialogHeader>
 <div className="px-6 pt-6 pb-2">
 <div className="flex items-center gap-2">
 <History className="h-4 w-4" />
 <h3 className="text-sm font-semibold">{t("supplierProducts", "stockMovements")}</h3>
 </div>
 <p className="text-xs text-muted-foreground mt-0.5 pl-6">{historyProduct?.name} — {historyProduct?.stockQuantity ?? 0} {pluralizeUnit(historyProduct?.unit, historyProduct?.stockQuantity ?? 0)}</p>
 </div>

 <div className="px-6 pb-6">
 {stockMovementsLoading ? (
 <div className="space-y-1.5">
 {[1, 2, 3].map((i) => (
 <Skeleton key={i} className="h-14 rounded-xl" />
 ))}
 </div>
 ) : stockMovements && stockMovements.length > 0 ? (
 <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
 {stockMovements.slice(0, 50).map((movement) => {
 const isIncrease = movement.type === "manual_in" || movement.type === "order_cancelled" || movement.type === "order_reversed";
 const isSet = movement.type === "manual_set";
 return (
 <div key={movement.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30" data-testid={`stock-movement-${movement.id}`}>
 <div className={`flex items-center justify-center h-8 w-8 rounded-lg shrink-0 ${
 isSet ? "bg-muted" :
 isIncrease ? "bg-green-100 dark:bg-green-900/30" :
 "bg-red-100 dark:bg-red-900/30"
 }`}>
 {isSet ? (
 <RefreshCw className="h-3.5 w-3.5 text-foreground" />
 ) : isIncrease ? (
 <ArrowDown className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
 ) : (
 <ArrowUp className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
 )}
 </div>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2">
 <span className="text-xs font-medium truncate">{getMovementTypeLabel(movement.type)}</span>
 <span className={`text-xs font-bold tabular-nums shrink-0 ${
 isSet ? "text-foreground" :
 isIncrease ? "text-green-600 dark:text-green-400" :
 "text-red-600 dark:text-red-400"
 }`}>
 {isSet ? `= ${movement.newStock}` : isIncrease ? `+${movement.quantity}` : `−${movement.quantity}`}
 </span>
 </div>
 <div className="flex items-center justify-between gap-2 mt-0.5">
 <span className="text-[10px] text-muted-foreground truncate">
 {movement.note || `${movement.previousStock} → ${movement.newStock}`}
 </span>
 <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums" title={formatDistanceToNow(new Date(movement.createdAt), { addSuffix: true, locale: lang === "de" ? de : itLocale })}>
 {format(new Date(movement.createdAt), lang === "de" ? "dd.MM.yyyy, HH:mm" : "dd/MM/yyyy, HH:mm")}
 </span>
 </div>
 {movement.userName && (
 <div className="flex items-center gap-1 mt-0.5">
 <UserIcon className="h-2.5 w-2.5 text-muted-foreground/70" />
 <span className="text-[10px] text-muted-foreground/80 truncate" data-testid={`stock-movement-user-${movement.id}`}>
 {movement.userName}
 </span>
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 ) : (
 <div className="text-center py-8">
 <History className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
 <p className="text-sm text-muted-foreground">{t("supplierProducts", "noStockMovements")}</p>
 </div>
 )}
 </div>
 </DialogContent>
 </Dialog>
 </div>
 );
}

function PromotionsView({ lang, t }: { lang: string; t: ReturnType<typeof useT> }) {
 const { currentUser } = useUser();
 const { toast } = useToast();

 const [isDialogOpen, setIsDialogOpen] = useState(false);
 const [editingPromo, setEditingPromo] = useState<PromotionWithProduct | null>(null);
 const [selectedProductId, setSelectedProductId] = useState<string>("");
 const [discountPercent, setDiscountPercent] = useState<string>("");
 const [startDate, setStartDate] = useState<string>("");
 const [endDate, setEndDate] = useState<string>("");

 const { data: promotions, isLoading } = useQuery<PromotionWithProduct[]>({
 queryKey: [`/api/promotions?supplierId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const { data: products } = useQuery<Product[]>({
 queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const createMutation = useMutation({
 mutationFn: async (data: { productId: string; supplierId: string; discountPercent: number; startDate: string; endDate: string }) => {
 return apiRequest("POST", "/api/promotions", data);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: ["/api/products"] });
 toast({ title: t("promotionsPage", "promotionCreated"), description: lang === "de" ? "Die Rabattaktion wurde erfolgreich erstellt." : "La promozione è stata creata con successo." });
 resetForm();
 },
 onError: () => {
 toast({ title: t("common", "error"), description: t("promotionsPage", "promotionError"), variant: "destructive" });
 },
 });

 const updateMutation = useMutation({
 mutationFn: async ({ id, data }: { id: string; data: any }) => {
 return apiRequest("PATCH", `/api/promotions/${id}`, data);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: ["/api/products"] });
 toast({ title: t("promotionsPage", "promotionUpdated"), description: lang === "de" ? "Die Rabattaktion wurde aktualisiert." : "La promozione è stata aggiornata." });
 resetForm();
 },
 onError: () => {
 toast({ title: t("common", "error"), description: t("promotionsPage", "promotionError"), variant: "destructive" });
 },
 });

 const deleteMutation = useMutation({
 mutationFn: async (id: string) => {
 return apiRequest("DELETE", `/api/promotions/${id}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: ["/api/products"] });
 toast({ title: t("promotionsPage", "promotionDeleted"), description: lang === "de" ? "Die Rabattaktion wurde gelöscht." : "La promozione è stata eliminata." });
 },
 onError: () => {
 toast({ title: t("common", "error"), description: lang === "de" ? "Die Aktion konnte nicht gelöscht werden." : "Impossibile eliminare la promozione.", variant: "destructive" });
 },
 });

 const resetForm = () => {
 setIsDialogOpen(false);
 setEditingPromo(null);
 setSelectedProductId("");
 setDiscountPercent("");
 setStartDate("");
 setEndDate("");
 };

 const openCreateDialog = () => {
 resetForm();
 setIsDialogOpen(true);
 };

 const openEditDialog = (promo: PromotionWithProduct) => {
 setEditingPromo(promo);
 setSelectedProductId(promo.productId);
 setDiscountPercent(String(promo.discountPercent));
 setStartDate(format(new Date(promo.startDate), "yyyy-MM-dd"));
 setEndDate(format(new Date(promo.endDate), "yyyy-MM-dd"));
 setIsDialogOpen(true);
 };

 const handleSubmit = () => {
 const discount = parseInt(discountPercent);
 if (!selectedProductId || !discount || discount < 1 || discount > 99 || !startDate || !endDate) {
 toast({ title: t("common", "error"), description: lang === "de" ? "Bitte füllen Sie alle Felder korrekt aus." : "Compila tutti i campi correttamente.", variant: "destructive" });
 return;
 }
 const today = format(new Date(), "yyyy-MM-dd");
 if (startDate < today) {
 toast({ title: t("common", "error"), description: lang === "de" ? "Das Startdatum darf nicht in der Vergangenheit liegen." : "La data di inizio non può essere nel passato.", variant: "destructive" });
 return;
 }
 if (endDate < today) {
 toast({ title: t("common", "error"), description: lang === "de" ? "Das Enddatum darf nicht in der Vergangenheit liegen." : "La data di fine non può essere nel passato.", variant: "destructive" });
 return;
 }
 if (new Date(endDate) <= new Date(startDate)) {
 toast({ title: t("common", "error"), description: lang === "de" ? "Das Enddatum muss nach dem Startdatum liegen." : "La data di fine deve essere successiva alla data di inizio.", variant: "destructive" });
 return;
 }

 if (editingPromo) {
 updateMutation.mutate({
 id: editingPromo.id,
 data: { productId: selectedProductId, discountPercent: discount, startDate, endDate },
 });
 } else {
 createMutation.mutate({
 productId: selectedProductId,
 supplierId: currentUser!.id,
 discountPercent: discount,
 startDate,
 endDate,
 });
 }
 };

 const getPromoStatus = (promo: PromotionWithProduct) => {
 const now = new Date();
 const start = new Date(promo.startDate);
 const end = new Date(promo.endDate);
 if (!promo.isActive) return { label: lang === "de" ? "Deaktiviert" : "Disattivato", variant: "secondary" as const };
 if (now < start) return { label: lang === "de" ? "Geplant" : "Pianificato", variant: "outline" as const };
 if (now > end) return { label: t("promotionsPage", "expired"), variant: "secondary" as const };
 return { label: t("promotionsPage", "active"), variant: "default" as const };
 };

 const isPending = createMutation.isPending || updateMutation.isPending;
 const dateFnsLocale = lang === "de" ? de : itLocale;

 return (
 <div className="space-y-4">

 {isLoading ? (
 <div className="space-y-3">
 {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
 </div>
 ) : promotions && promotions.length > 0 ? (
 <div className="space-y-3">
 {promotions.map(promo => {
 const status = getPromoStatus(promo);
 const originalPrice = parseFloat(promo.product.price);
 const discountedPrice = originalPrice * (1 - promo.discountPercent / 100);
 return (
 <Card key={promo.id} data-testid={`promotion-card-${promo.id}`}>
 <CardContent className="p-3 md:p-4">
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-start gap-3 min-w-0 flex-1">
 <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
 <Percent className="h-5 w-5 text-primary" />
 </div>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="font-medium text-sm truncate" data-testid={`text-promo-product-${promo.id}`}>
 {promo.product.name}
 </h3>
 <Badge variant={status.variant} data-testid={`badge-promo-status-${promo.id}`}>
 {status.label}
 </Badge>
 </div>
 <div className="flex items-center gap-3 mt-1 flex-wrap">
 <span className="text-sm font-bold text-primary" data-testid={`text-promo-discount-${promo.id}`}>
 -{promo.discountPercent}%
 </span>
 <span className="text-xs text-muted-foreground line-through">
 {originalPrice.toFixed(2)}€
 </span>
 <span className="text-sm font-semibold text-green-600 dark:text-green-400">
 {discountedPrice.toFixed(2)}€
 </span>
 <span className="text-xs text-muted-foreground">/{promo.product.unit}</span>
 </div>
 <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
 <Calendar className="h-3 w-3" />
 <span>
 {format(new Date(promo.startDate), "dd.MM.yyyy", { locale: dateFnsLocale })} - {format(new Date(promo.endDate), "dd.MM.yyyy", { locale: dateFnsLocale })}
 </span>
 </div>
 </div>
 </div>
 <div className="flex items-center gap-1 shrink-0">
 <Button variant="ghost" size="icon" onClick={() => openEditDialog(promo)} data-testid={`button-edit-promo-${promo.id}`}>
 <Pencil className="h-4 w-4" />
 </Button>
 <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(promo.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-promo-${promo.id}`}>
 <Trash2 className="h-4 w-4 text-destructive" />
 </Button>
 </div>
 </div>
 </CardContent>
 </Card>
 );
 })}
 </div>
 ) : (
 <Card>
 <CardContent className="flex flex-col items-center justify-center py-12">
 <Tag className="h-12 w-12 text-muted-foreground/50 mb-3" />
 <p className="text-muted-foreground">{t("promotionsPage", "noPromotions")}</p>
 <p className="text-sm text-muted-foreground mt-1">{t("promotionsPage", "noPromotionsDesc")}</p>
 </CardContent>
 </Card>
 )}

 <Dialog open={isDialogOpen} onOpenChange={(open) => !open && resetForm()}>
 <DialogContent className="p-0 gap-0 max-w-md">
 <DialogHeader className="sr-only">
 <DialogTitle>{editingPromo ? t("promotionsPage", "editPromotion") : lang === "de" ? "Neue Aktion erstellen" : "Crea nuova promozione"}</DialogTitle>
 </DialogHeader>
 <div className="px-6 pt-6 pb-2">
 <h3 className="text-sm font-semibold">{editingPromo ? t("promotionsPage", "editPromotion") : lang === "de" ? "Neue Aktion erstellen" : "Crea nuova promozione"}</h3>
 <p className="text-xs text-muted-foreground mt-0.5">
 {editingPromo ? (lang === "de" ? "Ändern Sie die Rabattaktion." : "Modifica la promozione.") : (lang === "de" ? "Rabattaktion erstellen" : "Crea promozione")}
 </p>
 </div>
 <div className="space-y-4 px-6 pb-6">
 <div>
 <Label className="text-sm">{lang === "de" ? "Produkt" : "Prodotto"}</Label>
 <Select value={selectedProductId} onValueChange={setSelectedProductId}>
 <SelectTrigger className="mt-1" data-testid="select-promotion-product">
 <Package className="h-4 w-4 mr-2 shrink-0" />
 <SelectValue placeholder={t("promotionsPage", "selectProductPlaceholder")} />
 </SelectTrigger>
 <SelectContent>
 {products?.map(p => (
 <SelectItem key={p.id} value={p.id}>
 {p.name} ({p.price}€/{p.unit})
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 <div>
 <Label className="text-sm">{t("promotionsPage", "discount")}</Label>
 <div className="relative mt-1">
 <Input
 type="number"
 min={1}
 max={99}
 value={discountPercent}
 onChange={e => setDiscountPercent(e.target.value)}
 placeholder={lang === "de" ? "z.B. 15" : "es. 15"}
 data-testid="input-discount-percent"
 />
 <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 </div>
 {selectedProductId && discountPercent && (
 <div className="mt-1.5 text-xs text-muted-foreground">
 {(() => {
 const product = products?.find(p => p.id === selectedProductId);
 if (!product) return null;
 const orig = parseFloat(product.price);
 const disc = orig * (1 - parseInt(discountPercent) / 100);
 return (
 <span>
 <span className="line-through">{orig.toFixed(2)}€</span>
 {" → "}
 <span className="font-medium text-green-600 dark:text-green-400">{disc.toFixed(2)}€</span>
 <span> /{product.unit}</span>
 </span>
 );
 })()}
 </div>
 )}
 </div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <Label className="text-sm">{t("promotionsPage", "startDate")}</Label>
 <Input
 type="date"
 value={startDate}
 onChange={e => setStartDate(e.target.value)}
 min={format(new Date(), "yyyy-MM-dd")}
 className="mt-1"
 data-testid="input-start-date"
 />
 </div>
 <div>
 <Label className="text-sm">{t("promotionsPage", "endDate")}</Label>
 <Input
 type="date"
 value={endDate}
 onChange={e => setEndDate(e.target.value)}
 min={format(new Date(), "yyyy-MM-dd")}
 className="mt-1"
 data-testid="input-end-date"
 />
 </div>
 </div>
 </div>
 <div className="flex gap-2">
 <Button variant="outline" className="flex-1 rounded-lg" onClick={resetForm} data-testid="button-cancel-promotion">
 {t("common", "cancel")}
 </Button>
 <Button
 className="flex-1 rounded-lg"
 onClick={handleSubmit}
 disabled={isPending || !selectedProductId || !discountPercent || !startDate || !endDate}
 data-testid="button-save-promotion"
 >
 {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
 {editingPromo ? t("common", "save") : t("common", "create")}
 </Button>
 </div>
 </DialogContent>
 </Dialog>
 </div>
 );
}

export default function SupplierProducts() {
 const { currentUser, currentMember } = useUser();
 const canManageProducts = !currentMember || can(currentMember.role, "products.manage");
 const { toast } = useToast();
 const { lang } = useLanguage();
 const t = useT(lang);
 const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
 const [searchQuery, setSearchQuery] = useState("");
 const [isDialogOpen, setIsDialogOpen] = useState(false);
 const [editingProduct, setEditingProduct] = useState<Product | null>(null);
 const [isUploading, setIsUploading] = useState(false);
 const [previewImage, setPreviewImage] = useState<string | null>(null);
 const [detailProduct, setDetailProduct] = useState<Product | null>(null);
 const [riskProductId, setRiskProductId] = useState<string | null>(null);
 const canReportRisk = !currentMember || can(currentMember.role, "inventory_risk.create");
 const { data: openRisks } = useQuery<InventoryRiskRecordWithDetails[]>({
   queryKey: ["/api/inventory-risks", "status=Open"],
   queryFn: async () => {
     const r = await fetch("/api/inventory-risks?status=Open");
     if (!r.ok) throw new Error("fail");
     return r.json();
   },
   enabled: !!currentUser?.id && canReportRisk,
 });
 const riskProductIds = useMemo(() => new Set((openRisks ?? []).map((r) => r.productId)), [openRisks]);
 const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
 const [isImportOpen, setIsImportOpen] = useState(false);
 const fileInputRef = useRef<HTMLInputElement>(null);

 const form = useForm<ProductFormData>({
 resolver: zodResolver(productSchema),
 defaultValues: {
 articleNumber: "",
 gtin: "",
 name: "",
 description: "",
 price: "",
 unit: "Stück",
 category: "",
 inStock: true,
 stockQuantity: 0,
 lowStockThreshold: 0,
 minOrderQuantity: 1,
 imageUrl: "",
 },
 });

 const { data: products, isLoading } = useQuery<Product[]>({
 queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
 enabled: !!currentUser?.id,
 });

 const createProductMutation = useMutation({
 mutationFn: async (data: Omit<ProductFormData, "gtin"> & { gtin: string | null }) => {
 return apiRequest("POST", "/api/products", {
 ...data,
 supplierId: currentUser?.id,
 });
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: ["/api/products"] });
 queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
 toast({
 title: t("supplierProducts", "productCreated"),
 description: t("supplierProducts", "productCreatedDesc"),
 });
 setIsDialogOpen(false);
 form.reset();
 setPreviewImage(null);
 },
 onError: () => {
 toast({
 title: t("common", "error"),
 description: t("supplierProducts", "productError"),
 variant: "destructive",
 });
 },
 });

 const updateProductMutation = useMutation({
 mutationFn: async (data: Omit<ProductFormData, "gtin"> & { id: string; gtin: string | null }) => {
 const { id, ...body } = data;
 return apiRequest("PATCH", `/api/products/${id}`, body);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: ["/api/products"] });
 queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
 toast({
 title: t("supplierProducts", "productUpdated"),
 description: t("supplierProducts", "productUpdatedDesc"),
 });
 setIsDialogOpen(false);
 setEditingProduct(null);
 form.reset();
 setPreviewImage(null);
 },
 onError: () => {
 toast({
 title: t("common", "error"),
 description: t("supplierProducts", "productError"),
 variant: "destructive",
 });
 },
 });

 const deleteProductMutation = useMutation({
 mutationFn: async (productId: string) => {
 return apiRequest("DELETE", `/api/products/${productId}`);
 },
 onSuccess: () => {
 queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] });
 queryClient.invalidateQueries({ queryKey: ["/api/products"] });
 queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
 toast({
 title: t("supplierProducts", "productDeleted"),
 description: lang === "de" ? "Das Produkt wurde erfolgreich gelöscht." : "Il prodotto è stato eliminato con successo.",
 });
 },
 onError: () => {
 toast({
 title: t("common", "error"),
 description: lang === "de" ? "Das Produkt konnte nicht gelöscht werden." : "Impossibile eliminare il prodotto.",
 variant: "destructive",
 });
 },
 });

 const filteredProducts = products?.filter(product =>
 searchIncludes(product.name, searchQuery) ||
 searchIncludes(product.description, searchQuery) ||
 searchIncludes(product.category, searchQuery)
 );

 const openEditDialog = (product: Product) => {
 setEditingProduct(product);
 form.reset({
 articleNumber: product.articleNumber || "",
 gtin: product.gtin || "",
 name: product.name,
 description: product.description || "",
 price: product.price,
 unit: product.unit,
 category: product.category || "",
 inStock: product.inStock,
 stockQuantity: product.stockQuantity || 0,
 lowStockThreshold: product.lowStockThreshold || 0,
 minOrderQuantity: product.minOrderQuantity || 1,
 imageUrl: product.imageUrl || "",
 });
 setPreviewImage(product.imageUrl || null);
 setIsDialogOpen(true);
 };

 const openCreateDialog = () => {
 setEditingProduct(null);
 form.reset();
 setPreviewImage(null);
 setIsDialogOpen(true);
 };

 const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];
 if (!file) return;

 if (!file.type.startsWith("image/")) {
 toast({
 title: t("common", "error"),
 description: lang === "de" ? "Bitte wählen Sie eine Bilddatei aus." : "Seleziona un file immagine.",
 variant: "destructive",
 });
 return;
 }

 if (file.size > 5 * 1024 * 1024) {
 toast({
 title: t("common", "error"),
 description: lang === "de" ? "Das Bild darf maximal 5MB groß sein." : "L'immagine non può superare i 5 MB.",
 variant: "destructive",
 });
 return;
 }

 setIsUploading(true);

 try {
 const response = await fetch("/api/uploads/request-url", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 name: file.name,
 size: file.size,
 contentType: file.type,
 }),
 });

 if (!response.ok) {
 throw new Error("Failed to get upload URL");
 }

 const { uploadURL, objectPath } = await response.json();

 await fetch(uploadURL, {
 method: "PUT",
 body: file,
 headers: { "Content-Type": file.type },
 });

 form.setValue("imageUrl", objectPath);
 setPreviewImage(objectPath);

 toast({
 title: lang === "de" ? "Bild hochgeladen" : "Immagine caricata",
 description: lang === "de" ? "Das Bild wurde erfolgreich hochgeladen." : "L'immagine è stata caricata con successo.",
 });
 } catch (error) {
 console.error("Upload error:", error);
 toast({
 title: t("common", "error"),
 description: lang === "de" ? "Das Bild konnte nicht hochgeladen werden." : "Impossibile caricare l'immagine.",
 variant: "destructive",
 });
 } finally {
 setIsUploading(false);
 if (fileInputRef.current) {
 fileInputRef.current.value = "";
 }
 }
 };

 const removeImage = () => {
 form.setValue("imageUrl", "");
 setPreviewImage(null);
 };

 const onSubmit = (data: ProductFormData) => {
 const cleaned = { ...data, gtin: data.gtin?.trim() ? data.gtin.trim() : null };
 if (editingProduct) {
 // Stock quantity is managed on the Inventory page via audited stock
 // movements, so never overwrite it directly from the product editor.
 const { stockQuantity: _omitStock, ...editPayload } = cleaned;
 updateProductMutation.mutate({ ...editPayload, id: editingProduct.id });
 } else {
 createProductMutation.mutate(cleaned);
 }
 };

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

 const categories = Object.keys(categoryConfig);

 const knownCategories = Object.keys(categoryConfig).filter(c => c !== "Sonstiges");
 const productsByCategory = (cat: string) => {
 if (!products) return [];
 if (cat === "Sonstiges") {
 return products.filter(p => !p.category || p.category === "Sonstiges" || !knownCategories.includes(p.category));
 }
 return products.filter(p => p.category === cat);
 };

 const categoryProductCount = (cat: string) => productsByCategory(cat).length;

 const categoryFilteredProducts = selectedCategory
 ? productsByCategory(selectedCategory).filter(p =>
 searchIncludes(p.name, searchQuery) ||
 searchIncludes(p.description, searchQuery)
 )
 : [];

 // ERP-managed products: the ERP is the source of truth, so its owned fields
 // are read-only in this dialog (image + low-stock threshold stay editable).
 const erpLocked = !!editingProduct?.erpManaged;

 return (
 <PullToRefreshWrapper
 onRefresh={async () => {
 await queryClient.invalidateQueries({
 predicate: (query) => {
 const key = query.queryKey[0];
 return typeof key === "string" && key.startsWith("/api/supplier/products");
 },
 });
 }}
 className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0"
 >
 <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 space-y-3" data-testid="products-hero"><SectionTabs />
 <div className="flex items-center justify-between gap-3">
 <div>
 <h1 className="m-type-display text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
 {lang === "de" ? "Produkte" : "Prodotti"}
 </h1>
 <p className="text-sm text-white/50 mt-1">
 {t("supplierProducts", "manageProducts")}
 </p>
 </div>
 <div className="flex items-center gap-2">
 <Button className="hidden md:inline-flex rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 gap-1.5 md:gap-2 text-sm" size="sm" variant="ghost" onClick={() => setIsImportOpen(true)} data-testid="button-import-price-list">
 <Upload className="h-4 w-4" />
 <span className="hidden sm:inline">{lang === "de" ? "Preisliste importieren" : "Importa listino"}</span>
 </Button>
 <Button className="hidden md:inline-flex rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 gap-1.5 md:gap-2 text-sm" size="sm" variant="ghost" onClick={() => setIsBulkUpdateOpen(true)} data-testid="button-bulk-update">
 <Upload className="h-4 w-4" />
 <span className="hidden sm:inline">{lang === "de" ? "Massen-Update" : "Aggiornamento in massa"}</span>
 </Button>
 <Button className="hidden md:inline-flex rounded-full border border-white/20 bg-white/[0.07] text-white hover:bg-white/15 gap-1.5 md:gap-2 text-sm" size="sm" onClick={openCreateDialog} disabled={!canManageProducts} data-testid="button-add-product">
 <Plus className="h-4 w-4" />
 <span className="hidden sm:inline">{lang === "de" ? "Produkt hinzufügen" : "Aggiungi prodotto"}</span>
 <span className="sm:hidden">{t("common", "add")}</span>
 </Button>
 </div>
 </div>
 </div></HeroPortal>

 <div className="md:hidden grid grid-cols-3 gap-2 mb-5">
 <Button variant="outline" className="h-auto flex-col gap-1.5 py-2.5 text-xs font-medium bg-card hover:bg-muted" onClick={() => setIsImportOpen(true)} data-testid="button-import-price-list-mobile">
 <Upload className="h-4 w-4" />
 {lang === "de" ? "Preisliste" : "Listino"}
 </Button>
 <Button variant="outline" className="h-auto flex-col gap-1.5 py-2.5 text-xs font-medium bg-card hover:bg-muted" onClick={() => setIsBulkUpdateOpen(true)} data-testid="button-bulk-update-mobile">
 <Upload className="h-4 w-4" />
 {lang === "de" ? "Massen-Update" : "In massa"}
 </Button>
 <Button variant="outline" className="h-auto flex-col gap-1.5 py-2.5 text-xs font-medium bg-card hover:bg-muted" onClick={openCreateDialog} disabled={!canManageProducts} data-testid="button-add-product-mobile">
 <Plus className="h-4 w-4" />
 {lang === "de" ? "Produkt" : "Prodotto"}
 </Button>
 </div>

 {currentUser && (
 <BulkPriceUpdateDialog
 open={isBulkUpdateOpen}
 onOpenChange={setIsBulkUpdateOpen}
 supplierId={currentUser.id}
 userId={currentUser.id}
 lang={lang as "de" | "it"}
 />
 )}

 {currentUser && (
 <PriceListImportDialog
 open={isImportOpen}
 onOpenChange={setIsImportOpen}
 supplierId={currentUser.id}
 userId={currentUser.id}
 userName={currentUser.name}
 />
 )}

 <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
 <DialogContent className="p-0 gap-0 !max-w-4xl w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-h-[92vh] overflow-y-auto">
 <DialogHeader className="sr-only">
 <DialogTitle>{editingProduct ? t("supplierProducts", "editProduct") : t("supplierProducts", "addProduct")}</DialogTitle>
 </DialogHeader>
 <div className="px-6 pt-6 pb-2">
 <h3 className="text-sm font-semibold">{editingProduct ? t("supplierProducts", "editProduct") : t("supplierProducts", "addProduct")}</h3>
 <p className="text-xs text-muted-foreground mt-0.5">
 {editingProduct 
 ? (lang === "de" ? "Produktinformationen bearbeiten" : "Modifica le informazioni del prodotto")
 : (lang === "de" ? "Neues Produkt zum Katalog hinzufügen" : "Aggiungi un nuovo prodotto al catalogo")}
 </p>
 </div>
 {erpLocked && (
 <div className="mx-6 mb-2 flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs p-3" data-testid="banner-erp-managed">
 <Database className="w-4 h-4 shrink-0 mt-0.5" />
 <span>{t("supplierErp", "erpManagedHint")}</span>
 </div>
 )}
 <Form {...form}>
 <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 px-6 pb-6">
 <div className="space-y-2">
 <FormLabel>{t("supplierProducts", "productImage")}</FormLabel>
 <div className="flex flex-col gap-3">
 {previewImage ? (
 <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted">
 <img 
 src={previewImage} 
 alt={lang === "de" ? "Produktvorschau" : "Anteprima prodotto"}
 className="w-full h-full object-cover"
 />
 <Button
 type="button"
 variant="destructive"
 size="icon"
 className="absolute top-2 right-2 h-8 w-8"
 onClick={removeImage}
 data-testid="button-remove-image"
 >
 <X className="h-4 w-4" />
 </Button>
 </div>
 ) : (
 <div 
 className="w-full h-40 rounded-lg border-2 border-dashed border-muted-foreground/25 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
 onClick={() => fileInputRef.current?.click()}
 >
 <ImageIcon className="h-10 w-10 text-muted-foreground/50" />
 <p className="text-sm text-muted-foreground">{lang === "de" ? "Klicken um Bild hochzuladen" : "Clicca per caricare un'immagine"}</p>
 </div>
 )}
 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 className="hidden"
 onChange={handleImageUpload}
 data-testid="input-product-image"
 />
 {!previewImage && (
 <Button
 type="button"
 variant="outline"
 className="gap-2"
 onClick={() => fileInputRef.current?.click()}
 disabled={isUploading}
 data-testid="button-upload-image"
 >
 <Upload className="h-4 w-4" />
 {isUploading ? (lang === "de" ? "Wird hochgeladen..." : "Caricamento...") : (lang === "de" ? "Bild auswählen" : "Seleziona immagine")}
 </Button>
 )}
 </div>
 </div>

 <FormField
 control={form.control}
 name="articleNumber"
 render={({ field }) => (
 <FormItem>
 <FormLabel>
 {lang === "de" ? "Artikelnummer" : "Codice articolo"}
 <span className="ml-2 text-xs font-normal text-muted-foreground">
 {lang === "de" ? "(optional, wird sonst automatisch erzeugt)" : "(opzionale, altrimenti generato automaticamente)"}
 </span>
 </FormLabel>
 <FormControl>
 <Input
 placeholder={editingProduct?.articleNumber || (lang === "de" ? "z. B. ART-001 oder leer lassen" : "es. ART-001 o lasciare vuoto")}
 autoComplete="off"
 disabled={erpLocked}
 {...field}
 value={field.value ?? ""}
 data-testid="input-product-article-number"
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="gtin"
 render={({ field }) => (
 <FormItem>
 <FormLabel>
 {lang === "de" ? "Barcode / GTIN" : "Codice a barre / GTIN"}
 <span className="ml-2 text-xs font-normal text-muted-foreground">
 {lang === "de" ? "(optional, für Preisvergleich über Lieferanten)" : "(opzionale, per confronto prezzi tra fornitori)"}
 </span>
 </FormLabel>
 <FormControl>
 <Input
 placeholder={lang === "de" ? "z. B. 4006381333931" : "es. 4006381333931"}
 inputMode="numeric"
 autoComplete="off"
 disabled={erpLocked}
 {...field}
 value={field.value ?? ""}
 data-testid="input-product-gtin"
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="name"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("supplierProducts", "productName")}</FormLabel>
 <FormControl>
 <Input placeholder={t("supplierProducts", "productNamePlaceholder")} autoComplete="off" disabled={erpLocked} {...field} data-testid="input-product-name" />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="description"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("common", "description")}</FormLabel>
 <FormControl>
 <Textarea 
 placeholder={lang === "de" ? "Produktbeschreibung..." : "Descrizione prodotto..."}
 className="resize-none"
 autoComplete="off"
 disabled={erpLocked}
 {...field} 
 data-testid="textarea-product-description" 
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />

 <div className="grid grid-cols-2 gap-4">
 <FormField
 control={form.control}
 name="price"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("supplierProducts", "price")}</FormLabel>
 <FormControl>
 <Input type="number" step="0.01" placeholder="0.00" autoComplete="off" disabled={erpLocked} {...field} data-testid="input-product-price" />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="unit"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("supplierProducts", "unit")}</FormLabel>
 <Select onValueChange={field.onChange} value={field.value} disabled={erpLocked}>
 <FormControl>
 <SelectTrigger data-testid="select-product-unit">
 <SelectValue placeholder={lang === "de" ? "Einheit wählen" : "Scegli unità"} />
 </SelectTrigger>
 </FormControl>
 <SelectContent>
 <SelectItem value="Stück">Stück</SelectItem>
 <SelectItem value="kg">kg</SelectItem>
 <SelectItem value="Liter">Liter</SelectItem>
 <SelectItem value="Packung">Packung</SelectItem>
 <SelectItem value="Karton">Karton</SelectItem>
 <SelectItem value="Kiste">Kiste</SelectItem>
 </SelectContent>
 </Select>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <FormField
 control={form.control}
 name="category"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("common", "category")}</FormLabel>
 <Select onValueChange={field.onChange} value={field.value || ""} disabled={erpLocked}>
 <FormControl>
 <SelectTrigger data-testid="select-product-category">
 <SelectValue placeholder={lang === "de" ? "Kategorie wählen" : "Scegli categoria"} />
 </SelectTrigger>
 </FormControl>
 <SelectContent>
 {categories.map((cat) => (
 <SelectItem key={cat} value={cat}>{lang === "it" ? categoryConfig[cat]?.it : categoryConfig[cat]?.de}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 <FormMessage />
 </FormItem>
 )}
 />

 <FormField
 control={form.control}
 name="minOrderQuantity"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("supplierProducts", "minOrderQuantity")}</FormLabel>
 <FormControl>
 <Input
 type="number"
 min={1}
 placeholder="1"
 disabled={erpLocked}
 data-testid="input-product-moq"
 {...field}
 value={field.value ?? ""}
 onChange={(e) => {
 const raw = e.target.value;
 if (raw === "") { field.onChange(undefined as any); return; }
 const parsed = parseInt(raw);
 if (!isNaN(parsed)) field.onChange(parsed);
 }}
 onBlur={() => {
 if (field.value === undefined || field.value === null || (field.value as any) === "" || field.value < 1) {
 field.onChange(1);
 }
 }}
 />
 </FormControl>
 <p className="text-xs text-muted-foreground">{t("supplierProducts", "minOrderQuantityDesc")}</p>
 <FormMessage />
 </FormItem>
 )}
 />

 <div className="grid grid-cols-2 gap-4">
 {editingProduct ? (
 <FormItem>
 <FormLabel>{t("supplierProducts", "stockQuantity")}</FormLabel>
 <div
 className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm tabular-nums"
 data-testid="text-product-stock-readonly"
 >
 {(editingProduct.stockQuantity ?? 0)} {editingProduct.unit}
 </div>
 <p className="text-xs text-muted-foreground">
 {lang === "de"
 ? "Bestand wird auf der Bestandsseite mit Verlauf angepasst."
 : "La giacenza si modifica nella pagina Inventario con cronologia."}
 </p>
 </FormItem>
 ) : (
 <FormField
 control={form.control}
 name="stockQuantity"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("supplierProducts", "stockQuantity")}</FormLabel>
 <FormControl>
 <Input
 type="number"
 min={0}
 placeholder="0"
 disabled={erpLocked}
 data-testid="input-product-stock"
 {...field}
 value={field.value ?? ""}
 onChange={(e) => {
 const raw = e.target.value;
 if (raw === "") { field.onChange(undefined as any); return; }
 const parsed = parseInt(raw);
 if (!isNaN(parsed)) field.onChange(parsed);
 }}
 onBlur={() => {
 if (field.value === undefined || field.value === null || (field.value as any) === "") {
 field.onChange(0);
 }
 }}
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 )}
 <FormField
 control={form.control}
 name="lowStockThreshold"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{t("supplierProducts", "lowStockThreshold")}</FormLabel>
 <FormControl>
 <Input
 type="number"
 min={0}
 placeholder="0"
 data-testid="input-product-threshold"
 {...field}
 value={field.value ?? ""}
 onChange={(e) => {
 const raw = e.target.value;
 if (raw === "") { field.onChange(undefined as any); return; }
 const parsed = parseInt(raw);
 if (!isNaN(parsed)) field.onChange(parsed);
 }}
 onBlur={() => {
 if (field.value === undefined || field.value === null || (field.value as any) === "") {
 field.onChange(0);
 }
 }}
 />
 </FormControl>
 <p className="text-xs text-muted-foreground">{t("supplierProducts", "lowStockThresholdDesc")}</p>
 <FormMessage />
 </FormItem>
 )}
 />
 </div>

 <FormField
 control={form.control}
 name="inStock"
 render={({ field }) => (
 <FormItem className="flex items-center justify-between gap-2 rounded-md border p-3">
 <div>
 <FormLabel className="mb-0">{t("common", "available")}</FormLabel>
 <p className="text-xs text-muted-foreground">{t("supplierProducts", "inStock")}</p>
 </div>
 <FormControl>
 <Switch
 checked={field.value}
 onCheckedChange={field.onChange}
 disabled={erpLocked}
 data-testid="switch-product-in-stock"
 />
 </FormControl>
 </FormItem>
 )}
 />

 <div className="flex gap-2 pt-2">
 <Button type="button" variant="outline" className="flex-1 rounded-lg" onClick={() => setIsDialogOpen(false)}>
 {t("common", "cancel")}
 </Button>
 <Button 
 type="submit" 
 className="flex-1 rounded-lg"
 disabled={createProductMutation.isPending || updateProductMutation.isPending || isUploading}
 data-testid="button-save-product"
 >
 {editingProduct ? t("common", "save") : t("common", "create")}
 </Button>
 </div>
 </form>
 </Form>
 </DialogContent>
 </Dialog>

 <>
 {!selectedCategory ? (
 <>
 {isLoading ? (
 <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
 {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
 <Skeleton key={i} className="h-36 rounded-xl" />
 ))}
 </div>
 ) : (
 <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
 {categories.filter(cat => categoryProductCount(cat) > 0).map(cat => {
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
 )}
 </>
 ) : (
 <>
 <button
 onClick={() => { setSelectedCategory(null); setSearchQuery(""); }}
 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3 px-1"
 data-testid="button-back-to-categories"
 >
 <ArrowLeft className="h-4 w-4" />
 {lang === "de" ? "Zurück" : "Indietro"}
 </button>
 <div className="flex items-center gap-3 mb-4">
 <div className="flex items-center gap-2 flex-1 min-w-0">
 {(() => {
 const conf = categoryConfig[selectedCategory];
 const CatIcon = conf?.icon || Package;
 return (
 <>
 <div className={`flex items-center justify-center h-8 w-8 rounded-full ${conf?.color || "bg-gray-500"} text-white shrink-0`}>
 <CatIcon className="h-4 w-4" />
 </div>
 <h2 className="text-lg font-bold truncate">
 {lang === "it" ? conf?.it : conf?.de}
 </h2>
 </>
 );
 })()}
 <Badge variant="secondary" className="shrink-0">{categoryFilteredProducts.length}</Badge>
 </div>
 </div>

 <Card>
 <div className="p-3 md:p-4 pb-2 md:pb-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
 <Input
 placeholder={t("common", "search") + "..."}
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-9 text-sm"
 data-testid="input-search-products"
 />
 </div>
 </div>
 <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
 {categoryFilteredProducts.length > 0 ? (
 <div className="grid gap-2 md:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
 {categoryFilteredProducts.map((product) => (
 <Card key={product.id} className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003]" data-testid={`product-card-${product.id}`} onClick={() => setDetailProduct(product)}>
 <CardContent className="p-2 md:p-3 flex gap-2 md:gap-3">
 <ProductImage src={product.imageUrl} alt={product.name} className="w-12 h-12 md:w-16 md:h-16 rounded-lg" iconClassName="h-5 w-5 md:h-6 md:w-6" fallbackIconColor="text-muted-foreground/30" />
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between gap-1 md:gap-2">
 <h3 className="font-medium text-sm md:text-base line-clamp-1">{product.name}</h3>
 <div className="flex shrink-0">
 {canReportRisk && (
 <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setRiskProductId(product.id); }} data-testid={`button-report-risk-${product.id}`} title={t("inventoryRisk", "reportRisk")}>
 <AlertTriangle className="h-3 w-3 md:h-3.5 md:w-3.5 text-amber-600" />
 </Button>
 )}
 <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDialog(product); }} disabled={!canManageProducts} data-testid={`button-edit-${product.id}`}>
 <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5" />
 </Button>
 <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteProductMutation.mutate(product.id); }} disabled={!canManageProducts || deleteProductMutation.isPending} data-testid={`button-delete-${product.id}`}>
 <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5 text-destructive" />
 </Button>
 </div>
 </div>
 <div className="flex items-center gap-1 mt-0.5 md:mt-1">
 <span className="font-bold text-xs md:text-sm">{product.price} EUR</span>
 <span className="text-[10px] md:text-xs text-muted-foreground">/{product.unit}</span>
 </div>
 <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-1.5 flex-wrap">
 {riskProductIds.has(product.id) && (
 <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 text-[10px] md:text-xs px-1 md:px-1.5 py-0" data-testid={`badge-risk-${product.id}`}>
 {t("inventoryRisk", "openRisks")}
 </Badge>
 )}
 {product.discontinued && (
 <Badge variant="outline" className="bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 text-[10px] md:text-xs px-1 md:px-1.5 py-0" data-testid={`badge-discontinued-${product.id}`}>
 {t("supplierErp", "discontinuedBadge")}
 </Badge>
 )}
 {product.erpManaged && !product.discontinued && (
 <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0" data-testid={`badge-erp-managed-${product.id}`}>
 {t("supplierErp", "erpManagedBadge")}
 </Badge>
 )}
 {product.inStock ? (
 <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
 {t("common", "available")}
 </Badge>
 ) : (
 <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px] md:text-xs px-1 md:px-1.5 py-0">
 {t("common", "unavailable")}
 </Badge>
 )}
 {product.minOrderQuantity && product.minOrderQuantity > 1 && (
 <Badge variant="outline" className="text-[10px] md:text-xs px-1 md:px-1.5 py-0">
 {t("supplierProducts", "minOrderQuantityShort")} {product.minOrderQuantity}
 </Badge>
 )}
 {product.stockQuantity != null && (
 <Badge
 variant="outline"
 className={`text-[10px] md:text-xs px-1 md:px-1.5 py-0 ${
 product.lowStockThreshold && product.lowStockThreshold > 0 && product.stockQuantity <= product.lowStockThreshold
 ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
 : ""
 }`}
 data-testid={`badge-stock-${product.id}`}
 >
 {product.lowStockThreshold && product.lowStockThreshold > 0 && product.stockQuantity <= product.lowStockThreshold && (
 <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
 )}
 {product.stockQuantity} {product.unit}
 </Badge>
 )}
 </div>
 </div>
 </CardContent>
 </Card>
 ))}
 </div>
 ) : (
 <div className="flex flex-col items-center justify-center py-8 md:py-12">
 <Package className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground/50 mb-2 md:mb-3" />
 <p className="text-sm md:text-base text-muted-foreground">
 {searchQuery
 ? (lang === "de" ? "Keine Treffer" : "Nessun risultato")
 : (lang === "de" ? "Keine Produkte in dieser Kategorie" : "Nessun prodotto in questa categoria")}
 </p>
 <Button className="mt-3 md:mt-4 gap-2 text-sm" size="sm" onClick={openCreateDialog} data-testid="button-add-first-product">
 <Plus className="h-4 w-4" />
 {lang === "de" ? "Produkt hinzufügen" : "Aggiungi prodotto"}
 </Button>
 </div>
 )}
 </CardContent>
 </Card>
 </>
 )}

 <ProductDetailDialog
 product={detailProduct as any}
 open={!!detailProduct}
 onOpenChange={(open) => !open && setDetailProduct(null)}
 />
 <InventoryRiskWizard
 open={!!riskProductId}
 onOpenChange={(open) => !open && setRiskProductId(null)}
 products={products ?? []}
 defaultProductId={riskProductId ?? undefined}
 />
 </>
 </PullToRefreshWrapper>
 );
}
