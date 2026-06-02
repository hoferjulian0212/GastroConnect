import { useState, useMemo } from "react";
import { HeroPortal } from "@/context/HeroContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatOrderNumber, type OrderTemplateWithItems, type Product, type User, type OrderWithDetails } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ShoppingCart, Search, Package, Edit2, ClipboardList, Check, X, ChevronRight, ArrowLeft, FileText, CheckCircle, Copy, Store, Pencil, AlertCircle, Star
} from "lucide-react";
import QuantityInput from "@/components/QuantityInput";
import SwipeableRow from "@/components/SwipeableRow";
import { format, formatDistanceToNow } from "date-fns";
import { de, it } from "date-fns/locale";
import { ProductImage } from "@/components/ProductImage";

type ProductWithSupplier = Product & { supplier: User };

export default function RestaurantTemplates({ embedded = false }: { embedded?: boolean }) {
  const { currentUser } = useUser();
  const { lang } = useLanguage();
  const t = useT(lang);
  const { toast } = useToast();
  const dateLocale = lang === "it" ? it : de;

  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<OrderTemplateWithItems | null>(null);
  const [useTemplate, setUseTemplate] = useState<OrderTemplateWithItems | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");


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

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const tmpl = templates?.find(t => t.id === id);
      if (!tmpl) return;
      await apiRequest("PATCH", `/api/order-templates/${id}`, {
        restaurantId: currentUser?.id,
        name,
        items: tmpl.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
      toast({ title: t("templates", "templateUpdated") });
      setEditingNameId(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (tmpl: OrderTemplateWithItems) => {
      const existingNames = templates?.map(t => t.name) || [];
      let copyName = `${tmpl.name} (2)`;
      let counter = 2;
      while (existingNames.includes(copyName)) {
        counter++;
        copyName = `${tmpl.name} (${counter})`;
      }
      await apiRequest("POST", "/api/order-templates", {
        restaurantId: currentUser?.id,
        name: copyName,
        items: tmpl.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
      toast({ title: t("templates", "templateDuplicated") });
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      await apiRequest("PATCH", `/api/order-templates/${id}/favorite`, { isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
      queryClient.invalidateQueries({ queryKey: [`/api/order-templates?restaurantId=${currentUser?.id}`] });
    },
    onError: (err: any) => {
      if (typeof err?.message === "string" && err.message.includes("MAX_FAVORITES")) {
        toast({ title: t("templates", "maxFavorites"), description: t("templates", "maxFavoritesDesc"), variant: "destructive" });
      } else {
        toast({ title: t("common", "error"), variant: "destructive" });
      }
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ templateId, productId }: { templateId: string; productId: string }) => {
      const tmpl = templates?.find(t => t.id === templateId);
      if (!tmpl) throw new Error("Template not found");
      const newItems = tmpl.items.filter(i => i.productId !== productId);
      if (newItems.length === 0) {
        await apiRequest("DELETE", `/api/order-templates/${templateId}`);
        return;
      }
      await apiRequest("PATCH", `/api/order-templates/${templateId}`, {
        restaurantId: currentUser?.id,
        name: tmpl.name,
        items: newItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const updateItemQtyMutation = useMutation({
    mutationFn: async ({ templateId, productId, quantity }: { templateId: string; productId: string; quantity: number }) => {
      const tmpl = templates?.find(t => t.id === templateId);
      if (!tmpl) throw new Error("Template not found");
      const newItems = tmpl.items.map(i =>
        i.productId === productId ? { productId: i.productId, quantity } : { productId: i.productId, quantity: i.quantity }
      );
      await apiRequest("PATCH", `/api/order-templates/${templateId}`, {
        restaurantId: currentUser?.id,
        name: tmpl.name,
        items: newItems,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/order-templates'] });
    },
    onError: () => {
      toast({ title: t("common", "error"), variant: "destructive" });
    },
  });

  const getSupplierGroups = (tmpl: OrderTemplateWithItems) => {
    const groups = new Map<string, { supplier: User; items: OrderTemplateWithItems['items'] }>();
    tmpl.items.forEach(item => {
      const suppId = item.product.supplierId;
      if (!groups.has(suppId)) {
        groups.set(suppId, { supplier: item.product.supplier, items: [] });
      }
      groups.get(suppId)!.items.push(item);
    });
    return Array.from(groups.values());
  };

  const getTotalEstimate = (tmpl: OrderTemplateWithItems) => {
    return tmpl.items.reduce((sum, item) => sum + item.quantity * parseFloat(item.product.price), 0);
  };

  const getAvailableCount = (tmpl: OrderTemplateWithItems) => {
    return tmpl.items.filter(i => i.product.inStock).length;
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-[var(--mobile-bottom-pad)] md:pb-0">
      {!embedded ? (
        <>
        <HeroPortal><div className="bg-[#161921] px-3 md:px-6 pt-3 md:pt-4 pb-4 md:pb-5 md:" data-testid="templates-hero">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white" data-testid="text-page-title">
                {t("templates", "orderTemplates")}
              </h1>
              <p className="text-sm text-white/50 mt-1">
                {t("templates", "orderTemplatesDesc")}
              </p>
            </div>
            <Button
              onClick={() => setShowCreate(true)}
              className="hidden md:inline-flex bg-white text-[#161921] hover:bg-white/90"
              data-testid="button-create-template"
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("templates", "newTemplate")}</span>
            </Button>
          </div>
        </div></HeroPortal>

        <Button
          onClick={() => setShowCreate(true)}
          className="md:hidden w-full gap-2"
          size="sm"
          data-testid="button-create-template-mobile"
        >
          <Plus className="h-4 w-4" />
          {t("templates", "newTemplate")}
        </Button>
        </>
      ) : (
        <div className="flex items-center justify-end gap-3">
          <Button onClick={() => setShowCreate(true)} data-testid="button-create-template">
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{t("templates", "newTemplate")}</span>
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
                <Skeleton className="h-px w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates && templates.length > 0 ? (
        <div className="space-y-4">
          {templates.map((tmpl) => {
            const supplierGroups = getSupplierGroups(tmpl);
            const totalEstimate = getTotalEstimate(tmpl);
            const availableCount = getAvailableCount(tmpl);
            const unavailableCount = tmpl.items.length - availableCount;
            const isEditingName = editingNameId === tmpl.id;
            const swipeLeftActions = isEditingName ? [] : [
              {
                icon: <ShoppingCart className="h-5 w-5" />,
                label: lang === "de" ? "Warenkorb" : "Carrello",
                color: "bg-emerald-500",
                onClick: () => setUseTemplate(tmpl),
                testId: `swipe-add-cart-${tmpl.id}`,
              },
            ];
            const swipeRightActions = isEditingName ? [] : [
              {
                icon: <Trash2 className="h-5 w-5" />,
                label: lang === "de" ? "Löschen" : "Elimina",
                color: "bg-red-500",
                onClick: () => setDeleteId(tmpl.id),
                testId: `swipe-delete-${tmpl.id}`,
              },
            ];

            return (
              <SwipeableRow key={tmpl.id} leftActions={swipeLeftActions} rightActions={swipeRightActions}>
              <Card className="overflow-hidden" data-testid={`template-card-${tmpl.id}`}>
                <CardContent className="p-0">
                  <div className="p-3 md:p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center h-10 w-10 md:h-11 md:w-11 rounded-lg bg-primary/10 shrink-0 mt-0.5">
                        <ClipboardList className="h-5 w-5 md:h-5.5 md:w-5.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {isEditingName ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={editNameValue}
                              onChange={(e) => setEditNameValue(e.target.value)}
                              className="h-8 text-sm font-semibold"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editNameValue.trim()) {
                                  renameMutation.mutate({ id: tmpl.id, name: editNameValue.trim() });
                                } else if (e.key === "Escape") {
                                  setEditingNameId(null);
                                }
                              }}
                              data-testid={`input-rename-${tmpl.id}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-primary"
                              onClick={() => editNameValue.trim() && renameMutation.mutate({ id: tmpl.id, name: editNameValue.trim() })}
                              disabled={renameMutation.isPending}
                              data-testid={`button-save-name-${tmpl.id}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => setEditingNameId(null)}
                              data-testid={`button-cancel-name-${tmpl.id}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={`h-6 w-6 shrink-0 ${tmpl.isFavorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/50 hover:text-amber-500"}`}
                              onClick={() => favoriteMutation.mutate({ id: tmpl.id, isFavorite: !tmpl.isFavorite })}
                              disabled={favoriteMutation.isPending}
                              title={tmpl.isFavorite ? t("templates", "removeFavorite") : t("templates", "markFavorite")}
                              data-testid={`button-favorite-${tmpl.id}`}
                            >
                              <Star className={`h-3.5 w-3.5 ${tmpl.isFavorite ? "fill-current" : ""}`} />
                            </Button>
                            <h3
                              className="text-sm md:text-base font-semibold truncate cursor-pointer hover:text-primary transition-colors"
                              onClick={() => { setEditingNameId(tmpl.id); setEditNameValue(tmpl.name); }}
                              data-testid={`text-template-name-${tmpl.id}`}
                            >
                              {tmpl.name}
                            </h3>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                              onClick={() => { setEditingNameId(tmpl.id); setEditNameValue(tmpl.name); }}
                              data-testid={`button-rename-${tmpl.id}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {tmpl.items.length} {t("templates", "products")}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Store className="h-3 w-3" />
                            {supplierGroups.length} {t("templates", supplierGroups.length === 1 ? "supplier" : "suppliers")}
                          </span>
                          {unavailableCount > 0 && (
                            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 dark:text-amber-400 gap-0.5">
                              <AlertCircle className="h-2.5 w-2.5" />
                              {unavailableCount} {t("templates", "outOfStock")}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base md:text-lg font-bold" data-testid={`text-total-${tmpl.id}`}>
                          {totalEstimate.toFixed(2)}&euro;
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {t("templates", "estimatedTotal")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/30">
                      {supplierGroups.map((group) => (
                        <div key={group.supplier.id} className="mb-2 last:mb-0">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Store className="h-2.5 w-2.5 text-muted-foreground" />
                            </div>
                            <span className="text-[11px] md:text-xs font-medium text-muted-foreground">
                              {group.supplier.companyName || group.supplier.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({group.items.length})
                            </span>
                          </div>
                          <div className="space-y-1 ml-6">
                            {group.items.map((item) => {
                              const isOutOfStock = !item.product.inStock;
                              const lineTotal = item.quantity * parseFloat(item.product.price);
                              return (
                                <div
                                  key={item.productId}
                                  className={`flex items-center gap-2 py-1.5 px-2 rounded-md ${isOutOfStock ? "bg-muted/30 opacity-60" : "bg-card"}`}
                                  data-testid={`template-item-${item.productId}`}
                                >
                                  <ProductImage src={item.product.imageUrl} className="h-8 w-8 rounded" iconClassName="h-3.5 w-3.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs md:text-sm font-medium truncate ${isOutOfStock ? "line-through" : ""}`}>
                                      {item.product.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      {item.product.price}&euro; {t("templates", "perUnit")} {item.product.unit}
                                    </p>
                                  </div>
                                  {isOutOfStock ? (
                                    <Badge variant="outline" className="text-[10px] border-red-200 text-red-500 shrink-0">
                                      {t("templates", "outOfStock")}
                                    </Badge>
                                  ) : (
                                    <QuantityInput
                                      value={item.quantity}
                                      onChange={(val) => updateItemQtyMutation.mutate({ templateId: tmpl.id, productId: item.productId, quantity: val })}
                                      min={item.product.minOrderQuantity || 1}
                                      disabled={updateItemQtyMutation.isPending}
                                      size="sm"
                                      testIdPrefix={`tmpl-qty-${item.productId}`}
                                    />
                                  )}
                                  <span className="text-xs md:text-sm font-semibold shrink-0 w-14 text-right tabular-nums">
                                    {isOutOfStock ? "-" : `${lineTotal.toFixed(2)}\u20AC`}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                                    onClick={() => removeItemMutation.mutate({ templateId: tmpl.id, productId: item.productId })}
                                    disabled={removeItemMutation.isPending}
                                    data-testid={`button-remove-item-${item.productId}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {t("templates", "lastUpdated")}: {formatDistanceToNow(new Date(tmpl.updatedAt), { addSuffix: true, locale: dateLocale })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2"
                          onClick={() => setEditTemplate(tmpl)}
                          data-testid={`button-add-products-${tmpl.id}`}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t("templates", "addProducts")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => duplicateMutation.mutate(tmpl)}
                          disabled={duplicateMutation.isPending}
                          data-testid={`button-duplicate-${tmpl.id}`}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(tmpl.id)}
                          data-testid={`button-delete-template-${tmpl.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 text-xs px-3"
                          onClick={() => setUseTemplate(tmpl)}
                          data-testid={`button-use-template-${tmpl.id}`}
                        >
                          <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                          {t("templates", "addToCart")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </SwipeableRow>
            );
          })}
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
          <DialogHeader className="sr-only">
            <DialogTitle>{t("templates", "deleteTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pt-5 pb-5 space-y-4">
            <h3 className="text-sm font-semibold">{t("templates", "deleteTemplate")}</h3>
            <p className="text-sm text-muted-foreground">{t("templates", "deleteConfirm")}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-lg" onClick={() => setDeleteId(null)} data-testid="button-cancel-delete">
                {t("common", "cancel")}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 rounded-lg"
                disabled={deleteMutation.isPending}
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                data-testid="button-confirm-delete"
              >
                {t("common", "delete")}
              </Button>
            </div>
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
  const dateFnsLocale = lang === "it" ? it : de;
  const [mode, setMode] = useState<"choose" | "scratch" | "from_order">(template ? "scratch" : "choose");
  const [name, setName] = useState(template?.name || "");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
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

  const { data: orders, isLoading: ordersLoading } = useQuery<OrderWithDetails[]>({
    queryKey: ["/api/orders", restaurantId],
    queryFn: async () => {
      const res = await fetch(`/api/orders?restaurantId=${restaurantId}`, { credentials: "include" });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: mode === "choose" || mode === "from_order",
  });

  const suppliers = useMemo(() => {
    if (!allProducts) return [];
    const map = new Map<string, User>();
    allProducts.forEach(p => { if (p.supplier) map.set(p.supplier.id, p.supplier); });
    return Array.from(map.values());
  }, [allProducts]);

  const availableProducts = useMemo(() => {
    if (!allProducts) return [];
    const selectedIds = new Set(selectedItems.map(i => i.productId));
    return allProducts
      .filter(p => !selectedIds.has(p.id) && p.inStock)
      .filter(p => !supplierFilter || p.supplierId === supplierFilter)
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.supplier?.companyName?.toLowerCase().includes(search.toLowerCase()));
  }, [allProducts, selectedItems, search, supplierFilter]);

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

  const loadFromOrder = (order: OrderWithDetails) => {
    if (!allProducts) return;
    const productMap = new Map(allProducts.map(p => [p.id, p]));
    const items = order.items
      .map(item => {
        const product = productMap.get(item.productId);
        if (!product) return null;
        return { productId: item.productId, quantity: item.quantity, product };
      })
      .filter(Boolean) as { productId: string; quantity: number; product: ProductWithSupplier }[];
    setSelectedItems(items);
    setName(name || `${order.supplier?.companyName || ""} ${format(new Date(order.createdAt), "dd.MM.yy", { locale: dateFnsLocale })}`.trim());
    setMode("scratch");
  };

  const isSelected = (productId: string) => selectedItems.some(i => i.productId === productId);

  if (mode === "choose") {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md" data-testid="dialog-choose-template-mode">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("templates", "newTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold">{t("templates", "newTemplate")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{t("templates", "orderTemplatesDesc")}</p>
          </div>
          <div className="space-y-3 px-5 pb-5">
            <button
              type="button"
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-transparent hover:border-primary/30 bg-muted/30 hover:bg-primary/5 transition-all text-left"
              onClick={() => setMode("scratch")}
              data-testid="button-mode-scratch"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 shrink-0">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t("templates", "createFromScratch")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("templates", "createFromScratchDesc")}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-transparent hover:border-primary/30 bg-muted/30 hover:bg-primary/5 transition-all text-left"
              onClick={() => setMode("from_order")}
              data-testid="button-mode-from-order"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 dark:bg-primary/20 shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t("templates", "createFromOrder")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("templates", "createFromOrderDesc")}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (mode === "from_order") {
    const sortedOrders = orders ? [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-from-order">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("templates", "selectOrder")}</DialogTitle>
          </DialogHeader>
          <div className="px-5 pt-5 pb-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setMode("choose")} data-testid="button-back-to-choose">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-sm font-semibold">{t("templates", "selectOrder")}</h3>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 pl-9">{t("templates", "createFromOrderDesc")}</p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 px-5 pb-5 pr-4">
            {ordersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border">
                    <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : sortedOrders.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {t("templates", "noOrders")}
              </div>
            ) : (
              sortedOrders.map(order => (
                <button
                  key={order.id}
                  type="button"
                  className="w-full flex items-start gap-3 p-3 rounded-lg border hover:border-primary/30 hover:bg-muted/30 transition-all text-left"
                  onClick={() => loadFromOrder(order)}
                  data-testid={`button-select-order-${order.id}`}
                >
                  <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-muted shrink-0 mt-0.5">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">#{formatOrderNumber(order)}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "dd.MM.yyyy", { locale: dateFnsLocale })}</span>
                    </div>
                    <p className="text-sm font-medium mt-0.5">{order.supplier?.companyName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {order.items.slice(0, 3).map(i => `${i.quantity}x ${i.productName}`).join(", ")}
                      {order.items.length > 3 && ` +${order.items.length - 3}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{order.totalAmount ? `${Number(order.totalAmount).toFixed(2)}\u20AC` : ""}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{order.items.length} {t("templates", "products")}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" data-testid="dialog-create-template">
        <DialogHeader className="sr-only">
          <DialogTitle>{template ? t("templates", "editTemplate") : t("templates", "newTemplate")}</DialogTitle>
        </DialogHeader>
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            {!template && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setMode("choose"); setSelectedItems([]); setName(""); }} data-testid="button-back-to-choose">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h3 className="text-sm font-semibold">{template ? t("templates", "editTemplate") : t("templates", "newTemplate")}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 pl-9">{t("templates", "orderTemplatesDesc")}</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 px-1 -mx-1">
          {!template && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t("templates", "templateName")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("templates", "templateNamePlaceholder")}
                data-testid="input-template-name"
              />
            </div>
          )}

          {selectedItems.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                {t("templates", "selectedProducts")} ({selectedItems.length})
              </label>
              <div className="space-y-1.5">
                {selectedItems.map(item => (
                  <div key={item.productId} className="flex items-center gap-2 p-2 rounded-lg border bg-card" data-testid={`selected-product-${item.productId}`}>
                    <ProductImage src={item.product.imageUrl} className="h-8 w-8 rounded" iconClassName="h-3.5 w-3.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.product.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.product.supplier?.companyName} — {item.product.price}&euro;/{item.product.unit}</p>
                    </div>
                    <QuantityInput
                      value={item.quantity}
                      onChange={(val) => setSelectedItems(prev => prev.map(i => i.productId === item.productId ? { ...i, quantity: val } : i))}
                      min={item.product.minOrderQuantity || 1}
                      size="sm"
                      testIdPrefix={`create-qty-${item.productId}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeProduct(item.productId)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("templates", "allProducts")}</label>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("templates", "searchProducts")}
                className="pl-9"
                data-testid="input-search-products"
              />
            </div>

            {suppliers.length > 1 && (
              <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
                <Badge
                  variant={supplierFilter === null ? "default" : "outline"}
                  className="cursor-pointer shrink-0 text-xs"
                  onClick={() => setSupplierFilter(null)}
                  data-testid="filter-supplier-all"
                >
                  {t("templates", "allProducts")}
                </Badge>
                {suppliers.map(s => (
                  <Badge
                    key={s.id}
                    variant={supplierFilter === s.id ? "default" : "outline"}
                    className="cursor-pointer shrink-0 text-xs"
                    onClick={() => setSupplierFilter(supplierFilter === s.id ? null : s.id)}
                    data-testid={`filter-supplier-${s.id}`}
                  >
                    {s.companyName}
                  </Badge>
                ))}
              </div>
            )}

            <div className="border rounded-lg max-h-60 overflow-y-auto divide-y">
              {availableProducts.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  {t("templates", "noProductsSelected")}
                </div>
              ) : (
                availableProducts.map(product => (
                  <button
                    key={product.id}
                    type="button"
                    className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => isSelected(product.id) ? removeProduct(product.id) : addProduct(product)}
                    data-testid={`button-add-product-${product.id}`}
                  >
                    <ProductImage src={product.imageUrl} className="h-8 w-8 rounded" iconClassName="h-3.5 w-3.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{product.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{product.supplier?.companyName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold">{product.price}&euro;</p>
                      <p className="text-[10px] text-muted-foreground">/{product.unit}</p>
                    </div>
                    {isSelected(product.id) ? (
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t("common", "cancel")}
          </Button>
          <Button
            className="flex-1"
            disabled={(!template && !name.trim()) || selectedItems.length === 0 || createMutation.isPending}
            onClick={() => {
              if (template) {
                createMutation.mutate();
              } else {
                createMutation.mutate();
              }
            }}
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
        <DialogHeader className="sr-only">
          <DialogTitle>{template.name}</DialogTitle>
        </DialogHeader>
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            <h3 className="text-sm font-semibold">{template.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 pl-6">{t("templates", "orderTemplatesDesc")}</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 px-5 pb-5 pr-4">
          {availableItems.map(item => (
            <div key={item.productId} className="flex items-center gap-2.5 p-2.5 rounded-lg border bg-card" data-testid={`use-item-${item.productId}`}>
              <ProductImage src={item.product.imageUrl} className="h-10 w-10 rounded" iconClassName="h-5 w-5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.product.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {item.product.supplier?.companyName} — {item.product.price}&euro;/{item.product.unit}
                </p>
              </div>
              <QuantityInput
                value={quantities[item.productId] || item.quantity}
                onChange={(val) => setQty(item.productId, val)}
                min={item.product.minOrderQuantity || 1}
                testIdPrefix={`use-qty-${item.productId}`}
              />
              <span className="text-sm font-semibold shrink-0 w-16 text-right">
                {((quantities[item.productId] || item.quantity) * parseFloat(item.product.price)).toFixed(2)}&euro;
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t("common", "total")} ({availableItems.length} {t("templates", "products")})</span>
            <span className="text-lg font-bold">{totalEstimate.toFixed(2)}&euro;</span>
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
