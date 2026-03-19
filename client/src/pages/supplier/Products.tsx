import { useState, useRef } from "react";
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
import { Search, Package, Plus, Pencil, Trash2, Upload, X, ImageIcon, ArrowUp, ArrowDown, AlertTriangle, History, Warehouse, RefreshCw, Tag, Calendar, Percent, Loader2, ArrowLeft, Carrot, Apple, Beef, Fish, Milk, Wine, Wheat, Flame, MoreHorizontal, Droplets, Egg, Coffee } from "lucide-react";
import heroBannerImg from "@assets/6fefa2793fd6b494e2f8aabea0385afc_1773947302051.jpg";
import type { Product, StockMovement, PromotionWithProduct } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { z } from "zod";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { format, formatDistanceToNow } from "date-fns";
import { de, it as itLocale } from "date-fns/locale";

const productSchema = z.object({
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

function InventoryView({ products, lang, t }: { products: Product[]; lang: string; t: ReturnType<typeof useT> }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [activeAction, setActiveAction] = useState<{ productId: string; mode: "manual_in" | "manual_out" | "manual_set" } | null>(null);
  const [adjustQty, setAdjustQty] = useState(1);
  const [adjustNote, setAdjustNote] = useState("");
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const { data: stockMovements } = useQuery<StockMovement[]>({
    queryKey: [`/api/stock-movements?productId=${historyProduct?.id}`],
    enabled: !!historyProduct?.id,
  });

  const stockMovementMutation = useMutation({
    mutationFn: async (data: { productId: string; supplierId: string; type: "manual_in" | "manual_out" | "manual_set"; quantity: number; note?: string }) => {
      return apiRequest("POST", "/api/stock-movements", data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/stock-movements?productId=${variables.productId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/low-stock', currentUser?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplier/stats', currentUser?.id] });
      toast({ title: t("supplierProducts", "stockUpdated") });
      setActiveAction(null);
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

  const openAction = (productId: string, mode: "manual_in" | "manual_out" | "manual_set") => {
    if (activeAction?.productId === productId && activeAction?.mode === mode) {
      setActiveAction(null);
      setAdjustQty(1);
      setAdjustNote("");
      return;
    }
    const product = products.find(p => p.id === productId);
    setActiveAction({ productId, mode });
    setAdjustQty(mode === "manual_set" ? (product?.stockQuantity ?? 0) : 1);
    setAdjustNote("");
  };

  const getMaxOutQty = (product: Product) => Math.max(0, product.stockQuantity ?? 0);

  const getPreviewStock = (product: Product) => {
    const current = product.stockQuantity ?? 0;
    if (!activeAction || activeAction.productId !== product.id) return current;
    if (activeAction.mode === "manual_set") return adjustQty;
    if (activeAction.mode === "manual_in") return current + adjustQty;
    return current - Math.min(adjustQty, current);
  };

  const handleSubmit = (product: Product) => {
    if (!currentUser || !activeAction) return;
    const finalQty = activeAction.mode === "manual_out" ? Math.min(adjustQty, getMaxOutQty(product)) : adjustQty;
    if (activeAction.mode !== "manual_set" && finalQty < 1) return;
    stockMovementMutation.mutate({
      productId: product.id,
      supplierId: currentUser.id,
      type: activeAction.mode,
      quantity: finalQty,
      note: adjustNote || undefined,
    });
  };

  const filtered = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    if (showLowStockOnly) {
      return matchesSearch && p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold;
    }
    return matchesSearch;
  });

  const lowStockCount = products.filter(p => p.lowStockThreshold && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common", "search") + "..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm h-9"
            data-testid="input-search-inventory"
          />
        </div>
        <Button
          variant={showLowStockOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowLowStockOnly(!showLowStockOnly)}
          className="gap-1.5 shrink-0"
          data-testid="button-filter-low-stock"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("supplierProducts", "lowStockOnly")}
          {lowStockCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{lowStockCount}</Badge>
          )}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-8">
          <Warehouse className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {showLowStockOnly
              ? t("supplierProducts", "noLowStockProducts")
              : t("supplierProducts", "noProducts")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map((product) => {
            const isLowStock = product.lowStockThreshold && product.lowStockThreshold > 0 && (product.stockQuantity ?? 0) <= product.lowStockThreshold;
            const currentStock = product.stockQuantity ?? 0;
            const isActive = activeAction?.productId === product.id;
            const currentMode = isActive ? activeAction.mode : null;

            return (
              <div
                key={product.id}
                className={`rounded-lg border overflow-hidden ${isLowStock ? "border-orange-300 dark:border-orange-700" : "border-border"}`}
                data-testid={`inventory-card-${product.id}`}
              >
                <div className="p-2.5 md:p-3">
                  <div className="flex items-center gap-2.5">
                    {product.imageUrl ? (
                      <div className="w-9 h-9 shrink-0 rounded-md overflow-hidden bg-muted">
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 shrink-0 rounded-md bg-muted flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground/30" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-sm truncate">{product.name}</h3>
                        {product.category && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">{product.category}</Badge>
                        )}
                        {isLowStock && (
                          <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
                        )}
                      </div>
                      {product.lowStockThreshold != null && product.lowStockThreshold > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {t("supplierProducts", "threshold")}: {product.lowStockThreshold} {product.unit}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-center shrink-0 min-w-[48px]">
                      <span className={`text-xl font-bold tabular-nums leading-tight ${isLowStock ? "text-orange-600 dark:text-orange-400" : ""}`}>
                        {currentStock}
                      </span>
                      <span className="text-[9px] text-muted-foreground leading-tight">{product.unit}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 mt-2">
                    <Button
                      variant={currentMode === "manual_in" ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 gap-1 text-[11px] h-7 px-2 ${currentMode !== "manual_in" ? "border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30" : "bg-green-600 hover:bg-green-700 text-white"}`}
                      onClick={() => openAction(product.id, "manual_in")}
                      data-testid={`button-stock-in-${product.id}`}
                    >
                      <ArrowDown className="h-3 w-3" />
                      {t("supplierProducts", "stockIn")}
                    </Button>
                    <Button
                      variant={currentMode === "manual_out" ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 gap-1 text-[11px] h-7 px-2 ${currentMode !== "manual_out" ? "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30" : "bg-red-600 hover:bg-red-700 text-white"}`}
                      onClick={() => openAction(product.id, "manual_out")}
                      disabled={currentStock <= 0}
                      data-testid={`button-stock-out-${product.id}`}
                    >
                      <ArrowUp className="h-3 w-3" />
                      {t("supplierProducts", "stockOut")}
                    </Button>
                    <Button
                      variant={currentMode === "manual_set" ? "default" : "outline"}
                      size="sm"
                      className={`flex-1 gap-1 text-[11px] h-7 px-2 ${currentMode !== "manual_set" ? "border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                      onClick={() => openAction(product.id, "manual_set")}
                      data-testid={`button-stock-set-${product.id}`}
                    >
                      <RefreshCw className="h-3 w-3" />
                      {t("supplierProducts", "manualSet")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-7 w-7"
                      onClick={() => setHistoryProduct(product)}
                      data-testid={`button-history-${product.id}`}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {isActive && (
                  <div className={`border-t p-2.5 md:p-3 space-y-2 ${
                    currentMode === "manual_in" ? "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800/40" :
                    currentMode === "manual_out" ? "bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-800/40" :
                    "bg-blue-50/50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800/40"
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setAdjustQty(Math.max(currentMode === "manual_set" ? 0 : 1, adjustQty - 1))}
                          disabled={adjustQty <= (currentMode === "manual_set" ? 0 : 1)}
                          data-testid="button-adjust-qty-minus"
                        >
                          <span className="text-sm font-medium leading-none">−</span>
                        </Button>
                        <Input
                          type="number"
                          min={currentMode === "manual_set" ? 0 : 1}
                          max={currentMode === "manual_out" ? getMaxOutQty(product) : undefined}
                          value={adjustQty}
                          onChange={(e) => {
                            const min = currentMode === "manual_set" ? 0 : 1;
                            const max = currentMode === "manual_out" ? getMaxOutQty(product) : Infinity;
                            setAdjustQty(Math.min(max, Math.max(min, parseInt(e.target.value) || 0)));
                          }}
                          className="text-center text-sm font-bold w-16 h-7"
                          data-testid="input-adjust-qty"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            const max = currentMode === "manual_out" ? getMaxOutQty(product) : Infinity;
                            setAdjustQty(Math.min(max, adjustQty + 1));
                          }}
                          data-testid="button-adjust-qty-plus"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="text-[10px] text-muted-foreground">{product.unit}</span>
                      </div>

                      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/80 border text-[11px]">
                        <span className="text-muted-foreground">{currentStock}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={`font-bold ${
                          currentMode === "manual_in" ? "text-green-600 dark:text-green-400" :
                          currentMode === "manual_out" ? "text-red-600 dark:text-red-400" :
                          "text-blue-600 dark:text-blue-400"
                        }`}>{getPreviewStock(product)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Input
                        value={adjustNote}
                        onChange={(e) => setAdjustNote(e.target.value)}
                        placeholder={t("supplierProducts", "notePlaceholder")}
                        className="text-xs h-7 flex-1"
                        data-testid="input-adjust-note"
                      />
                      <Button
                        size="sm"
                        className={`gap-1 shrink-0 h-7 text-[11px] ${
                          currentMode === "manual_in" ? "bg-green-600 hover:bg-green-700" :
                          currentMode === "manual_out" ? "bg-red-600 hover:bg-red-700" :
                          "bg-blue-600 hover:bg-blue-700"
                        } text-white`}
                        onClick={() => handleSubmit(product)}
                        disabled={stockMovementMutation.isPending || (currentMode !== "manual_set" && adjustQty < 1)}
                        data-testid="button-adjust-confirm"
                      >
                        {stockMovementMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Package className="h-3 w-3" />
                        )}
                        {t("supplierProducts", "confirmAdjustment")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 h-7 w-7"
                        onClick={() => { setActiveAction(null); setAdjustQty(1); setAdjustNote(""); }}
                        data-testid="button-adjust-cancel"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!historyProduct} onOpenChange={(open) => { if (!open) setHistoryProduct(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("supplierProducts", "stockMovements")}
            </DialogTitle>
            <DialogDescription>
              {historyProduct?.name} — {historyProduct?.stockQuantity ?? 0} {historyProduct?.unit}
            </DialogDescription>
          </DialogHeader>
          {stockMovements && stockMovements.length > 0 ? (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {stockMovements.slice(0, 30).map((movement) => (
                <div key={movement.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs" data-testid={`stock-movement-${movement.id}`}>
                  <div className="flex items-center gap-2">
                    {(movement.type === "manual_in" || movement.type === "order_cancelled" || movement.type === "order_reversed" || movement.type === "manual_set") ? (
                      <ArrowDown className="h-3 w-3 text-green-600" />
                    ) : (
                      <ArrowUp className="h-3 w-3 text-red-600" />
                    )}
                    <div>
                      <span className="font-medium">{getMovementTypeLabel(movement.type)}</span>
                      {movement.note && <p className="text-muted-foreground">{movement.note}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`font-medium ${movement.type === "manual_set" ? "text-blue-600" : (movement.type === "manual_in" || movement.type === "order_cancelled" || movement.type === "order_reversed") ? "text-green-600" : "text-red-600"}`}>
                      {movement.type === "manual_set" ? `= ${movement.newStock}` : (movement.type === "manual_in" || movement.type === "order_cancelled" || movement.type === "order_reversed") ? `+${movement.quantity}` : `-${movement.quantity}`}
                    </span>
                    <p className="text-muted-foreground">
                      {movement.previousStock} → {movement.newStock}
                    </p>
                    <p className="text-muted-foreground">
                      {formatDistanceToNow(new Date(movement.createdAt), { addSuffix: true, locale: lang === "de" ? de : itLocale })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{t("supplierProducts", "noStockMovements")}</p>
          )}
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
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-2 md:gap-3 grid-cols-3 flex-1">
            <Card>
              <CardContent className="pt-3 p-2.5 md:pt-4 md:p-3">
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-primary" data-testid="text-total-promotions">{promotions?.length || 0}</div>
                  <p className="text-[10px] md:text-xs text-muted-foreground">{t("common", "total")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 p-2.5 md:pt-4 md:p-3">
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-green-600" data-testid="text-active-promotions">
                    {promotions?.filter(p => {
                      const now = new Date();
                      return p.isActive && new Date(p.startDate) <= now && new Date(p.endDate) >= now;
                    }).length || 0}
                  </div>
                  <p className="text-[10px] md:text-xs text-muted-foreground">{t("promotionsPage", "active")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 p-2.5 md:pt-4 md:p-3">
                <div className="text-center">
                  <div className="text-xl md:text-2xl font-bold text-muted-foreground" data-testid="text-expired-promotions">
                    {promotions?.filter(p => new Date(p.endDate) < new Date()).length || 0}
                  </div>
                  <p className="text-[10px] md:text-xs text-muted-foreground">{t("promotionsPage", "expired")}</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Button onClick={openCreateDialog} size="sm" className="gap-1.5 shrink-0 hidden md:flex" data-testid="button-create-promotion">
            <Plus className="h-4 w-4" />
            {t("promotionsPage", "createPromotion")}
          </Button>
        </div>
        <Button onClick={openCreateDialog} size="sm" className="gap-1.5 w-full md:hidden" data-testid="button-create-promotion-mobile">
          <Plus className="h-4 w-4" />
          {t("promotionsPage", "createPromotion")}
        </Button>
      </div>

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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPromo ? t("promotionsPage", "editPromotion") : lang === "de" ? "Neue Aktion erstellen" : "Crea nuova promozione"}</DialogTitle>
            <DialogDescription>
              {editingPromo ? (lang === "de" ? "Ändern Sie die Rabattaktion." : "Modifica la promozione.") : (lang === "de" ? "Erstellen Sie eine Rabattaktion für eines Ihrer Produkte." : "Crea una promozione per uno dei tuoi prodotti.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-promotion">
              {t("common", "cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !selectedProductId || !discountPercent || !startDate || !endDate}
              data-testid="button-save-promotion"
            >
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingPromo ? t("common", "save") : t("common", "create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SupplierProducts() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const urlParams = new URLSearchParams(window.location.search);
  const tabParam = urlParams.get("tab");
  const activeTab: "products" | "inventory" | "promotions" = 
    tabParam === "inventory" ? "inventory" : tabParam === "promotions" ? "promotions" : "products";
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
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
    mutationFn: async (data: ProductFormData) => {
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
    mutationFn: async (data: ProductFormData & { id: string }) => {
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
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    form.reset({
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
    if (editingProduct) {
      updateProductMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createProductMutation.mutate(data);
    }
  };

  const categories = ["Gemuese", "Obst", "Fleisch", "Fisch", "Milchprodukte", "Getraenke", "Trockenwaren", "Gewuerze", "Sonstiges"];

  const categoryConfig: Record<string, { de: string; it: string; icon: typeof Package; color: string }> = {
    "Gemuese": { de: "Gemuese", it: "Verdura", icon: Carrot, color: "bg-green-600" },
    "Obst": { de: "Obst", it: "Frutta", icon: Apple, color: "bg-red-500" },
    "Fleisch": { de: "Fleisch", it: "Carne", icon: Beef, color: "bg-rose-700" },
    "Fisch": { de: "Fisch", it: "Pesce", icon: Fish, color: "bg-cyan-600" },
    "Milchprodukte": { de: "Milchprodukte", it: "Latticini", icon: Milk, color: "bg-blue-400" },
    "Getraenke": { de: "Getraenke", it: "Bevande", icon: Wine, color: "bg-purple-600" },
    "Trockenwaren": { de: "Trockenwaren", it: "Prodotti secchi", icon: Wheat, color: "bg-amber-600" },
    "Gewuerze": { de: "Gewuerze", it: "Spezie", icon: Flame, color: "bg-orange-500" },
    "Sonstiges": { de: "Sonstiges", it: "Altro", icon: MoreHorizontal, color: "bg-gray-500" },
  };

  const productsByCategory = (cat: string) => {
    if (!products) return [];
    if (cat === "Sonstiges") {
      return products.filter(p => !p.category || !categories.includes(p.category));
    }
    return products.filter(p => p.category === cat);
  };

  const categoryProductCount = (cat: string) => productsByCategory(cat).length;

  const categoryFilteredProducts = selectedCategory
    ? productsByCategory(selectedCategory).filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-4 md:space-y-6">
      {(activeTab !== "products" || selectedCategory) && (
      <div className="flex items-center justify-between gap-3 md:gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
            {activeTab === "products"
              ? (lang === "de" ? "Produktkatalog" : "Catalogo prodotti")
              : activeTab === "inventory"
                ? t("supplierProducts", "stockManagement")
                : t("common", "promotions")}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {activeTab === "products"
              ? t("supplierProducts", "manageProducts")
              : activeTab === "inventory"
                ? t("supplierProducts", "manageStock")
                : (lang === "de" ? "Rabattaktionen für Ihre Produkte verwalten" : "Gestisci le promozioni per i tuoi prodotti")}
          </p>
        </div>
        {activeTab === "products" && (
          <Button className="gap-1.5 md:gap-2 text-sm" size="sm" onClick={openCreateDialog} data-testid="button-add-product">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{lang === "de" ? "Produkt hinzufügen" : "Aggiungi prodotto"}</span>
            <span className="sm:hidden">{t("common", "add")}</span>
          </Button>
        )}
      </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingProduct ? t("supplierProducts", "editProduct") : t("supplierProducts", "addProduct")}</DialogTitle>
                <DialogDescription>
                  {editingProduct 
                    ? (lang === "de" ? "Bearbeiten Sie die Produktinformationen" : "Modifica le informazioni del prodotto")
                    : (lang === "de" ? "Fügen Sie ein neues Produkt zu Ihrem Katalog hinzu" : "Aggiungi un nuovo prodotto al tuo catalogo")}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("supplierProducts", "productName")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("supplierProducts", "productNamePlaceholder")} autoComplete="off" {...field} data-testid="input-product-name" />
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
                            <Input type="number" step="0.01" placeholder="0.00" autoComplete="off" {...field} data-testid="input-product-price" />
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
                          <Select onValueChange={field.onChange} value={field.value}>
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
                        <Select onValueChange={field.onChange} value={field.value || ""}>
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
                      <FormItem className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <FormLabel className="mb-0">{t("common", "available")}</FormLabel>
                          <p className="text-xs text-muted-foreground">{t("supplierProducts", "inStock")}</p>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-product-in-stock"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      {t("common", "cancel")}
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createProductMutation.isPending || updateProductMutation.isPending || isUploading}
                      data-testid="button-save-product"
                    >
                      {editingProduct ? t("common", "save") : t("common", "create")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
      </Dialog>

      {activeTab === "promotions" ? (
        <PromotionsView lang={lang} t={t} />
      ) : activeTab === "products" ? (
        <>
          {!selectedCategory ? (
            <>
              <div className="relative w-full h-44 md:h-56 overflow-hidden -mt-2" style={{ maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)" }}>
                <img
                  src={heroBannerImg}
                  alt=""
                  className="w-full h-full object-cover object-center"
                />
              </div>

              <div>
                <h2 className="text-xl md:text-2xl font-bold">
                  {lang === "de" ? "Unser Sortiment" : "Il nostro assortimento"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {lang === "de"
                    ? "Frische Vielfalt - waehlen Sie eine Kategorie um die Produkte zu sehen."
                    : "Varieta fresca - seleziona una categoria per vedere i prodotti."}
                </p>
              </div>

              {isLoading ? (
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-36 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  {categories.map(cat => {
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
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setSelectedCategory(null); setSearchQuery(""); }}
                  className="flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors shrink-0"
                  data-testid="button-back-to-categories"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
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
                            {product.imageUrl ? (
                              <div className="w-12 h-12 md:w-16 md:h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 md:w-16 md:h-16 shrink-0 rounded-lg bg-muted flex items-center justify-center">
                                <Package className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-1 md:gap-2">
                                <h3 className="font-medium text-sm md:text-base line-clamp-1">{product.name}</h3>
                                <div className="flex shrink-0">
                                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDialog(product); }} data-testid={`button-edit-${product.id}`}>
                                    <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteProductMutation.mutate(product.id); }} disabled={deleteProductMutation.isPending} data-testid={`button-delete-${product.id}`}>
                                    <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5 text-destructive" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5 md:mt-1">
                                <span className="font-bold text-xs md:text-sm">{product.price} EUR</span>
                                <span className="text-[10px] md:text-xs text-muted-foreground">/{product.unit}</span>
                              </div>
                              <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-1.5 flex-wrap">
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
                        {lang === "de" ? "Produkt hinzufuegen" : "Aggiungi prodotto"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          <ProductDetailDialog
            product={detailProduct}
            open={!!detailProduct}
            onOpenChange={(open) => !open && setDetailProduct(null)}
          />
        </>
      ) : (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <InventoryView products={products} lang={lang} t={t} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Warehouse className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{t("supplierProducts", "noProducts")}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
