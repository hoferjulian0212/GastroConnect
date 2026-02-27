import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { OrderTemplateWithItems, Product, User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ShoppingCart, Search, Package, Edit2, ClipboardList, Minus, Check, X, ChevronRight
} from "lucide-react";

type ProductWithSupplier = Product & { supplier: User };

export default function RestaurantTemplates() {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<OrderTemplateWithItems | null>(null);
  const [useTemplate, setUseTemplate] = useState<OrderTemplateWithItems | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: templates, isLoading } = useQuery<OrderTemplateWithItems[]>({
    queryKey: ['/api/order-templates', currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`/api/order-templates?restaurantId=${currentUser?.id}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!currentUser?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/order-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
      toast({ title: t("templates", "templateDeleted") });
      setDeleteId(null);
    },
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground" data-testid="text-page-title">
            {t("templates", "orderTemplates")}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("templates", "orderTemplatesDesc")}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} data-testid="button-create-template">
          <Plus className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">{t("templates", "newTemplate")}</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="space-y-3">
          {templates.map((tmpl) => (
            <Card key={tmpl.id} className="overflow-hidden" data-testid={`template-card-${tmpl.id}`}>
              <div className="flex items-center gap-3 p-3 md:p-4">
                <div className="flex items-center justify-center h-10 w-10 md:h-12 md:w-12 rounded-lg bg-primary/10 shrink-0">
                  <ClipboardList className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm md:text-base font-semibold truncate">{tmpl.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tmpl.items.length} {t("templates", "products")}
                    {tmpl.items.length > 0 && (
                      <span className="ml-1.5">
                        — {tmpl.items.slice(0, 3).map(i => i.product.name).join(", ")}
                        {tmpl.items.length > 3 && ` +${tmpl.items.length - 3}`}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setUseTemplate(tmpl)}
                    data-testid={`button-use-template-${tmpl.id}`}
                  >
                    <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                    <span className="hidden sm:inline">{t("templates", "use")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditTemplate(tmpl)}
                    data-testid={`button-edit-template-${tmpl.id}`}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(tmpl.id)}
                    data-testid={`button-delete-template-${tmpl.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted/50 mb-3">
              <ClipboardList className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">{t("templates", "noTemplates")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("templates", "noTemplatesDesc")}</p>
            <Button onClick={() => setShowCreate(true)} className="mt-4" data-testid="button-create-first-template">
              <Plus className="h-4 w-4 mr-1.5" />
              {t("templates", "newTemplate")}
            </Button>
          </CardContent>
        </Card>
      )}

      {(showCreate || editTemplate) && (
        <CreateEditDialog
          template={editTemplate}
          onClose={() => { setShowCreate(false); setEditTemplate(null); }}
          restaurantId={currentUser?.id || ""}
          lang={lang}
          t={t}
        />
      )}

      {useTemplate && (
        <UseTemplateDialog
          template={useTemplate}
          onClose={() => setUseTemplate(null)}
          restaurantId={currentUser?.id || ""}
          lang={lang}
          t={t}
        />
      )}

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("templates", "deleteTemplate")}</DialogTitle>
            <DialogDescription>{t("templates", "deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)} data-testid="button-cancel-delete">
              {t("common", "cancel")}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              {t("common", "delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateEditDialog({
  template,
  onClose,
  restaurantId,
  lang,
  t,
}: {
  template: OrderTemplateWithItems | null;
  onClose: () => void;
  restaurantId: string;
  lang: string;
  t: ReturnType<typeof useT>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(template?.name || "");
  const [search, setSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<{ productId: string; quantity: number; product: ProductWithSupplier }[]>(
    template?.items.map(i => ({ productId: i.productId, quantity: i.quantity, product: i.product })) || []
  );

  const { data: allProducts } = useQuery<ProductWithSupplier[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch(`/api/products?restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  const availableProducts = useMemo(() => {
    if (!allProducts) return [];
    const selectedIds = new Set(selectedItems.map(i => i.productId));
    return allProducts
      .filter(p => !selectedIds.has(p.id) && p.inStock)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.supplier?.companyName?.toLowerCase().includes(search.toLowerCase()));
  }, [allProducts, selectedItems, search]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        restaurantId,
        name,
        items: selectedItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
      };
      if (template) {
        await apiRequest("PATCH", `/api/order-templates/${template.id}`, payload);
      } else {
        await apiRequest("POST", "/api/order-templates", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
      toast({ title: template ? t("templates", "templateUpdated") : t("templates", "templateCreated") });
      onClose();
    },
  });

  const addProduct = (product: ProductWithSupplier) => {
    setSelectedItems(prev => [...prev, { productId: product.id, quantity: product.minOrderQuantity || 1, product }]);
    setSearch("");
  };

  const removeProduct = (productId: string) => {
    setSelectedItems(prev => prev.filter(i => i.productId !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setSelectedItems(prev => prev.map(i => {
      if (i.productId !== productId) return i;
      const min = i.product.minOrderQuantity || 1;
      const newQty = Math.max(min, i.quantity + delta);
      return { ...i, quantity: newQty };
    }));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-create-template">
        <DialogHeader>
          <DialogTitle>
            {template ? t("templates", "editTemplate") : t("templates", "newTemplate")}
          </DialogTitle>
          <DialogDescription>
            {t("templates", "orderTemplatesDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("templates", "templateName")}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templates", "templateNamePlaceholder")}
              data-testid="input-template-name"
            />
          </div>

          <Separator />

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("templates", "selectProducts")}</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("templates", "searchProducts")}
                className="pl-9"
                data-testid="input-search-products"
              />
            </div>

            {search && availableProducts.length > 0 && (
              <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto divide-y">
                {availableProducts.slice(0, 20).map(product => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full flex items-center gap-2.5 p-2.5 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => addProduct(product)}
                    data-testid={`button-add-product-${product.id}`}
                  >
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{product.supplier?.companyName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{product.price}€</p>
                      <p className="text-[10px] text-muted-foreground">/{product.unit}</p>
                    </div>
                    <Plus className="h-4 w-4 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {t("templates", "selectedProducts")} ({selectedItems.length})
            </label>
            {selectedItems.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border rounded-lg border-dashed">
                {t("templates", "noProductsSelected")}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedItems.map(item => (
                  <div key={item.productId} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card" data-testid={`selected-product-${item.productId}`}>
                    {item.product.imageUrl ? (
                      <img src={item.product.imageUrl} alt="" className="h-9 w-9 rounded object-cover shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.product.supplier?.companyName} — {item.product.price}€/{item.product.unit}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.productId, -1)}
                        disabled={item.quantity <= (item.product.minOrderQuantity || 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.productId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeProduct(item.productId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t("common", "cancel")}
          </Button>
          <Button
            className="flex-1"
            disabled={!name.trim() || selectedItems.length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            data-testid="button-save-template"
          >
            <Check className="h-4 w-4 mr-1.5" />
            {t("templates", "saveTemplate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UseTemplateDialog({
  template,
  onClose,
  restaurantId,
  lang,
  t,
}: {
  template: OrderTemplateWithItems;
  onClose: () => void;
  restaurantId: string;
  lang: string;
  t: ReturnType<typeof useT>;
}) {
  const { toast } = useToast();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(template.items.map(i => [i.productId, i.quantity]))
  );

  const updateQty = (productId: string, delta: number) => {
    setQuantities(prev => {
      const item = template.items.find(i => i.productId === productId);
      const min = item?.product.minOrderQuantity || 1;
      return { ...prev, [productId]: Math.max(min, (prev[productId] || 1) + delta) };
    });
  };

  const setQty = (productId: string, value: number) => {
    const item = template.items.find(i => i.productId === productId);
    const min = item?.product.minOrderQuantity || 1;
    setQuantities(prev => ({ ...prev, [productId]: Math.max(min, value) }));
  };

  const availableItems = template.items.filter(i => i.product.inStock);
  const unavailableItems = template.items.filter(i => !i.product.inStock);

  const totalEstimate = availableItems.reduce((sum, item) => {
    const qty = quantities[item.productId] || item.quantity;
    return sum + qty * parseFloat(item.product.price);
  }, 0);

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      for (const item of availableItems) {
        const qty = quantities[item.productId] || item.quantity;
        await apiRequest("POST", "/api/cart", {
          restaurantId,
          productId: item.productId,
          supplierId: item.product.supplierId,
          quantity: qty,
          mode: "add",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cart/count'] });
      toast({
        title: t("templates", "addedToCart"),
        description: t("templates", "addedToCartDesc"),
      });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-use-template">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {template.name}
          </DialogTitle>
          <DialogDescription>
            {t("templates", "orderTemplatesDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {availableItems.map(item => (
            <div key={item.productId} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card" data-testid={`use-item-${item.productId}`}>
              {item.product.imageUrl ? (
                <img src={item.product.imageUrl} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.product.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.product.supplier?.companyName} — {item.product.price}€/{item.product.unit}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateQty(item.productId, -1)}
                  disabled={(quantities[item.productId] || item.quantity) <= (item.product.minOrderQuantity || 1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <input
                  type="number"
                  className="w-12 text-center text-sm font-medium border rounded h-7 bg-background [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  value={quantities[item.productId] || item.quantity}
                  onChange={(e) => setQty(item.productId, parseInt(e.target.value) || 1)}
                  min={item.product.minOrderQuantity || 1}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => updateQty(item.productId, 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <span className="text-sm font-semibold shrink-0 w-16 text-right">
                {((quantities[item.productId] || item.quantity) * parseFloat(item.product.price)).toFixed(2)}€
              </span>
            </div>
          ))}

          {unavailableItems.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{t("templates", "unavailable")}</p>
              {unavailableItems.map(item => (
                <div key={item.productId} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-muted/30 opacity-50">
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate line-through">{item.product.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.product.supplier?.companyName}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{t("templates", "unavailable")}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("common", "total")} ({availableItems.length} {t("templates", "products")})</span>
            <span className="text-lg font-bold">{totalEstimate.toFixed(2)}€</span>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={availableItems.length === 0 || addToCartMutation.isPending}
            onClick={() => addToCartMutation.mutate()}
            data-testid="button-add-all-to-cart"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {t("templates", "addToCart")}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
