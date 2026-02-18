import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@/context/UserContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Search, Package, Plus, Pencil, Trash2, Upload, X, ImageIcon, ArrowUp, ArrowDown, AlertTriangle, History, Warehouse, RefreshCw } from "lucide-react";
import type { Product, StockMovement } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ProductDetailDialog from "@/components/ProductDetailDialog";
import { z } from "zod";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { formatDistanceToNow } from "date-fns";
import { de, it as itLocale } from "date-fns/locale";

const productSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().optional(),
  price: z.string().min(1, "Preis ist erforderlich"),
  unit: z.string().min(1, "Einheit ist erforderlich"),
  category: z.string().optional(),
  inStock: z.boolean().default(true),
  stockQuantity: z.number().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  minOrderQuantity: z.number().int().min(1).default(1),
  imageUrl: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

function InventoryView({ products, lang, t }: { products: Product[]; lang: string; t: ReturnType<typeof useT> }) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [stockActions, setStockActions] = useState<Record<string, { type: "manual_in" | "manual_out" | "manual_set"; qty: number; note: string }>>({});
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
      setStockActions(prev => {
        const next = { ...prev };
        delete next[variables.productId];
        return next;
      });
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

  const getAction = (productId: string) => {
    return stockActions[productId] || { type: "manual_in" as const, qty: 1, note: "" };
  };

  const updateAction = (productId: string, updates: Partial<{ type: "manual_in" | "manual_out" | "manual_set"; qty: number; note: string }>) => {
    setStockActions(prev => ({
      ...prev,
      [productId]: { ...getAction(productId), ...updates },
    }));
  };

  const handleSubmitStock = (product: Product) => {
    if (!currentUser) return;
    const action = getAction(product.id);
    stockMovementMutation.mutate({
      productId: product.id,
      supplierId: currentUser.id,
      type: action.type,
      quantity: action.qty,
      note: action.note || undefined,
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
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common", "search") + "..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-sm"
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

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Warehouse className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {showLowStockOnly
                  ? t("supplierProducts", "noLowStockProducts")
                  : t("supplierProducts", "noProducts")}
              </p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((product) => {
            const action = getAction(product.id);
            const isLowStock = product.lowStockThreshold && product.lowStockThreshold > 0 && (product.stockQuantity ?? 0) <= product.lowStockThreshold;

            return (
              <Card
                key={product.id}
                className={isLowStock ? "border-orange-300 dark:border-orange-700" : ""}
                data-testid={`inventory-card-${product.id}`}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start gap-3">
                    {product.imageUrl ? (
                      <div className="w-10 h-10 shrink-0 rounded-md overflow-hidden bg-muted">
                        <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 shrink-0 rounded-md bg-muted flex items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground/30" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm">{product.name}</h3>
                        {product.category && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{product.category}</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-lg font-bold tabular-nums ${isLowStock ? "text-orange-600 dark:text-orange-400" : ""}`}>
                            {product.stockQuantity ?? 0}
                          </span>
                          <span className="text-xs text-muted-foreground">{product.unit}</span>
                          {isLowStock && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                        </div>
                        {product.lowStockThreshold != null && product.lowStockThreshold > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {t("supplierProducts", "threshold")}: {product.lowStockThreshold}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 ml-auto shrink-0"
                          onClick={() => setHistoryProduct(product)}
                          data-testid={`button-history-${product.id}`}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="flex items-end gap-2 mt-2 flex-wrap">
                        <div className="flex gap-1">
                          <Button
                            variant={action.type === "manual_in" ? "default" : "outline"}
                            size="sm"
                            className="gap-1 text-xs px-2"
                            onClick={() => updateAction(product.id, { type: "manual_in", qty: action.type === "manual_set" ? 1 : action.qty })}
                            data-testid={`button-stock-in-${product.id}`}
                          >
                            <ArrowDown className="h-3 w-3" />
                            {t("supplierProducts", "stockIn")}
                          </Button>
                          <Button
                            variant={action.type === "manual_out" ? "default" : "outline"}
                            size="sm"
                            className="gap-1 text-xs px-2"
                            onClick={() => updateAction(product.id, { type: "manual_out", qty: action.type === "manual_set" ? 1 : action.qty })}
                            data-testid={`button-stock-out-${product.id}`}
                          >
                            <ArrowUp className="h-3 w-3" />
                            {t("supplierProducts", "stockOut")}
                          </Button>
                          <Button
                            variant={action.type === "manual_set" ? "default" : "outline"}
                            size="sm"
                            className="gap-1 text-xs px-2"
                            onClick={() => updateAction(product.id, { type: "manual_set", qty: product.stockQuantity ?? 0 })}
                            data-testid={`button-stock-set-${product.id}`}
                          >
                            <RefreshCw className="h-3 w-3" />
                            {t("supplierProducts", "manualSet")}
                          </Button>
                        </div>

                        <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                          <Input
                            type="number"
                            min={action.type === "manual_set" ? 0 : 1}
                            value={action.qty}
                            onChange={(e) => updateAction(product.id, { qty: Math.max(action.type === "manual_set" ? 0 : 1, parseInt(e.target.value) || 0) })}
                            className="h-8 w-20 text-sm"
                            data-testid={`input-stock-qty-${product.id}`}
                          />
                          <Input
                            value={action.note}
                            onChange={(e) => updateAction(product.id, { note: e.target.value })}
                            placeholder={t("supplierProducts", "notePlaceholder")}
                            className="h-8 text-sm flex-1"
                            data-testid={`input-stock-note-${product.id}`}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSubmitStock(product)}
                            disabled={stockMovementMutation.isPending}
                            data-testid={`button-submit-stock-${product.id}`}
                          >
                            {t("supplierProducts", "applyToProduct")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={!!historyProduct} onOpenChange={(open) => { if (!open) setHistoryProduct(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("supplierProducts", "stockMovements")}
            </DialogTitle>
            <DialogDescription>
              {historyProduct?.name} - {historyProduct?.stockQuantity ?? 0} {historyProduct?.unit}
            </DialogDescription>
          </DialogHeader>
          {stockMovements && stockMovements.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
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

export default function SupplierProducts() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);
  const [activeTab, setActiveTab] = useState<"products" | "inventory">("products");
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
      return apiRequest("PATCH", `/api/products/${data.id}`, data);
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

  const categories = ["Gemüse", "Obst", "Fleisch", "Fisch", "Milchprodukte", "Getränke", "Trockenwaren", "Gewürze", "Sonstiges"];

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 md:gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
            {activeTab === "products"
              ? (lang === "de" ? "Produktkatalog" : "Catalogo prodotti")
              : t("supplierProducts", "stockManagement")}
          </h1>
          <p className="text-sm md:text-base text-muted-foreground">
            {activeTab === "products"
              ? t("supplierProducts", "manageProducts")
              : t("supplierProducts", "manageStock")}
          </p>
        </div>
        {activeTab === "products" && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-1.5 md:gap-2 text-sm" size="sm" onClick={openCreateDialog} data-testid="button-add-product">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{lang === "de" ? "Produkt hinzufügen" : "Aggiungi prodotto"}</span>
                <span className="sm:hidden">{t("common", "add")}</span>
              </Button>
            </DialogTrigger>
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
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
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
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
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
        )}
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-md w-fit" data-testid="tab-switcher-products">
        <Button
          variant={activeTab === "products" ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setActiveTab("products")}
          data-testid="tab-products"
        >
          <Package className="h-4 w-4" />
          {t("supplierProducts", "productsTab")}
        </Button>
        <Button
          variant={activeTab === "inventory" ? "default" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setActiveTab("inventory")}
          data-testid="tab-inventory"
        >
          <Warehouse className="h-4 w-4" />
          {t("supplierProducts", "inventoryTab")}
        </Button>
      </div>

      {activeTab === "products" ? (
        <>
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
              {isLoading ? (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} className="h-24 md:h-32" />
                  ))}
                </div>
              ) : filteredProducts && filteredProducts.length > 0 ? (
                <div className="grid gap-2 md:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredProducts.map((product) => (
                    <Card key={product.id} className="cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-px hover:scale-[1.003]" data-testid={`product-card-${product.id}`} onClick={() => setDetailProduct(product)}>
                      <CardContent className="p-2 md:p-3 flex gap-2 md:gap-3">
                        {product.imageUrl ? (
                          <div className="w-12 h-12 md:w-16 md:h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
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
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); openEditDialog(product); }}
                                data-testid={`button-edit-${product.id}`}
                              >
                                <Pencil className="h-3 w-3 md:h-3.5 md:w-3.5" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); deleteProductMutation.mutate(product.id); }}
                                disabled={deleteProductMutation.isPending}
                                data-testid={`button-delete-${product.id}`}
                              >
                                <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 md:mt-1">
                            <span className="font-bold text-xs md:text-sm">{product.price}€</span>
                            <span className="text-[10px] md:text-xs text-muted-foreground">/{product.unit}</span>
                          </div>
                          <div className="flex items-center gap-1 md:gap-1.5 mt-1 md:mt-1.5 flex-wrap">
                            {product.category && (
                              <Badge variant="secondary" className="text-[10px] md:text-xs px-1 md:px-1.5 py-0">
                                {product.category}
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
                  <p className="text-sm md:text-base text-muted-foreground">{t("supplierProducts", "noProducts")}</p>
                  <Button className="mt-3 md:mt-4 gap-2 text-sm" size="sm" onClick={openCreateDialog} data-testid="button-add-first-product">
                    <Plus className="h-4 w-4" />
                    {lang === "de" ? "Produkt hinzufügen" : "Aggiungi prodotto"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

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
