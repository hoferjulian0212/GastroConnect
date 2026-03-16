import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@/context/UserContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Tag, Plus, Trash2, Package, Calendar, Percent, Loader2, Send, Check, ChevronRight, ChevronLeft, Users, MessageSquare, Search, X, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type { Product, PromotionWithProduct, User } from "@shared/schema";
import { format } from "date-fns";
import { de, it } from "date-fns/locale";
import { useLanguage } from "@/context/LanguageContext";
import { useT } from "@/lib/translations";

type PromotionGroup = {
  groupId: string | null;
  name: string | null;
  description: string | null;
  discountPercent: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  targetRestaurantIds: string[] | null;
  promotions: PromotionWithProduct[];
};

export default function SupplierPromotions() {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const { lang } = useLanguage();
  const t = useT(lang);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  const [promoName, setPromoName] = useState("");
  const [promoDescription, setPromoDescription] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<"all" | "specific">("all");
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);
  const [notifyChat, setNotifyChat] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [overwriteProduct, setOverwriteProduct] = useState<Product | null>(null);

  const { data: promotions, isLoading } = useQuery<PromotionWithProduct[]>({
    queryKey: [`/api/promotions?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: products } = useQuery<Product[]>({
    queryKey: [`/api/supplier/products?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const { data: restaurants } = useQuery<User[]>({
    queryKey: [`/api/supplier/restaurants?supplierId=${currentUser?.id}`],
    enabled: !!currentUser?.id,
  });

  const activePromoByProductId = useMemo(() => {
    const map = new Map<string, PromotionWithProduct>();
    if (!promotions) return map;
    const now = new Date();
    for (const promo of promotions) {
      if (promo.isActive && new Date(promo.startDate as any) <= now && new Date(promo.endDate as any) >= now) {
        map.set(promo.productId, promo);
      }
    }
    return map;
  }, [promotions]);

  const bulkCreateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/promotions/bulk", data);
    },
    onSuccess: async (_data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("promotionsPage", "promotionCreated") });

      if (notifyChat && currentUser) {
        const targetIds = targetMode === "all"
          ? (restaurants?.map(r => r.id) || [])
          : selectedRestaurantIds;
        if (targetIds.length > 0) {
          const promoProducts = selectedProductIds.map(id => {
            const p = products?.find(pr => pr.id === id);
            if (!p) return null;
            const orig = parseFloat(p.price);
            const disc = orig * (1 - (parseInt(discountPercent) || 0) / 100);
            return { id: p.id, name: p.name, originalPrice: orig.toFixed(2), discountedPrice: disc.toFixed(2), unit: p.unit, imageUrl: p.imageUrl };
          }).filter(Boolean);
          const promotionData = {
            name: promoName || (lang === "de" ? "Neue Aktion" : "Nuova promozione"),
            description: promoDescription || null,
            discountPercent: parseInt(discountPercent),
            startDate,
            endDate,
            products: promoProducts,
            supplierId: currentUser.id,
          };
          try {
            await apiRequest("POST", "/api/promotions/notify", {
              supplierId: currentUser.id,
              restaurantIds: targetIds,
              promotionData,
            });
            toast({ title: t("promotionsPage", "notificationSent"), description: t("promotionsPage", "notificationSentDesc") });
          } catch {
          }
        }
      }
      resetForm();
    },
    onError: () => {
      toast({ title: t("common", "error"), description: t("promotionsPage", "promotionError"), variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest("DELETE", `/api/promotions/group/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("promotionsPage", "promotionDeleted") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/promotions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/promotions?supplierId=${currentUser?.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: t("promotionsPage", "promotionDeleted") });
    },
  });

  const resetForm = () => {
    setIsDialogOpen(false);
    setWizardStep(1);
    setPromoName("");
    setPromoDescription("");
    setDiscountPercent("");
    setStartDate("");
    setEndDate("");
    setSelectedProductIds([]);
    setTargetMode("all");
    setSelectedRestaurantIds([]);
    setNotifyChat(false);
    setProductSearch("");
    setRestaurantSearch("");
  };

  const handleSubmit = () => {
    const discount = parseInt(discountPercent);
    const validProductIds = products
      ? selectedProductIds.filter(id => { const p = products.find(pr => pr.id === id); return p && p.inStock !== false; })
      : selectedProductIds;
    if (validProductIds.length === 0 || !discount || discount < 1 || discount > 99 || !startDate || !endDate) {
      toast({ title: t("common", "error"), variant: "destructive" });
      return;
    }

    bulkCreateMutation.mutate({
      productIds: validProductIds,
      supplierId: currentUser!.id,
      discountPercent: discount,
      startDate,
      endDate,
      name: promoName || null,
      description: promoDescription || null,
      targetRestaurantIds: targetMode === "specific" ? selectedRestaurantIds : null,
    });
  };

  const toggleProduct = (productId: string) => {
    if (selectedProductIds.includes(productId)) {
      setSelectedProductIds(prev => prev.filter(id => id !== productId));
      return;
    }
    const existingPromo = activePromoByProductId.get(productId);
    if (existingPromo) {
      const product = products?.find(p => p.id === productId);
      if (product) {
        setOverwriteProduct(product);
        return;
      }
    }
    setSelectedProductIds(prev => [...prev, productId]);
  };

  const confirmOverwrite = () => {
    if (overwriteProduct) {
      setSelectedProductIds(prev => [...prev, overwriteProduct.id]);
      setOverwriteProduct(null);
    }
  };

  const toggleRestaurant = (restaurantId: string) => {
    setSelectedRestaurantIds(prev =>
      prev.includes(restaurantId) ? prev.filter(id => id !== restaurantId) : [...prev, restaurantId]
    );
  };

  const promotionGroups = useMemo(() => {
    if (!promotions) return [];
    const groupMap = new Map<string, PromotionGroup>();
    for (const promo of promotions) {
      const key = promo.groupId || promo.id;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          groupId: promo.groupId,
          name: promo.name,
          description: promo.description,
          discountPercent: promo.discountPercent,
          startDate: promo.startDate as any,
          endDate: promo.endDate as any,
          isActive: promo.isActive,
          targetRestaurantIds: promo.targetRestaurantIds,
          promotions: [],
        });
      }
      groupMap.get(key)!.promotions.push(promo);
    }
    return Array.from(groupMap.values());
  }, [promotions]);

  const getGroupStatus = (group: PromotionGroup) => {
    const now = new Date();
    const start = new Date(group.startDate);
    const end = new Date(group.endDate);
    if (!group.isActive) return { label: lang === "de" ? "Deaktiviert" : "Disattivato", variant: "secondary" as const, color: "text-muted-foreground" };
    if (now < start) return { label: lang === "de" ? "Geplant" : "Pianificato", variant: "outline" as const, color: "text-blue-600" };
    if (now > end) return { label: t("promotionsPage", "expired"), variant: "secondary" as const, color: "text-muted-foreground" };
    return { label: t("promotionsPage", "active"), variant: "default" as const, color: "text-green-600" };
  };

  const isPending = bulkCreateMutation.isPending;
  const dateFnsLocale = lang === "de" ? de : it;

  const filteredProducts = products?.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.category?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredRestaurants = restaurants?.filter(r =>
    r.companyName?.toLowerCase().includes(restaurantSearch.toLowerCase()) ||
    r.name.toLowerCase().includes(restaurantSearch.toLowerCase())
  );

  const canGoToStep2 = promoName.trim().length > 0 && discountPercent && parseInt(discountPercent) >= 1 && parseInt(discountPercent) <= 99 && startDate && endDate && new Date(endDate) > new Date(startDate);
  const canGoToStep3 = selectedProductIds.length > 0;
  const canSubmit = canGoToStep3 && (targetMode === "all" || selectedRestaurantIds.length > 0);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 md:gap-3">
          <Tag className="h-6 w-6 md:h-8 md:w-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">{t("common", "promotions")}</h1>
            <p className="text-xs md:text-sm text-muted-foreground">{lang === "de" ? "Rabattaktionen für Ihre Produkte verwalten" : "Gestisci le promozioni per i tuoi prodotti"}</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} data-testid="button-create-promotion">
          <Plus className="h-4 w-4 mr-1.5" />
          {t("promotionsPage", "createPromotion")}
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-3 md:gap-4 auto-cols-fr">
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-primary" data-testid="text-total-promotions">{promotionGroups.length}</div>
              <p className="text-xs md:text-sm text-muted-foreground">{t("common", "total")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-green-600" data-testid="text-active-promotions">
                {promotionGroups.filter(g => {
                  const now = new Date();
                  return g.isActive && new Date(g.startDate) <= now && new Date(g.endDate) >= now;
                }).length}
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">{t("promotionsPage", "active")}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-6 p-3 md:p-6">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-muted-foreground" data-testid="text-expired-promotions">
                {promotionGroups.filter(g => new Date(g.endDate) < new Date()).length}
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">{t("promotionsPage", "expired")}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : promotionGroups.length > 0 ? (
          promotionGroups.map((group) => {
            const status = getGroupStatus(group);
            const isGroup = group.promotions.length > 1;
            return (
              <Card key={group.groupId || group.promotions[0].id} data-testid={`promotion-group-${group.groupId || group.promotions[0].id}`}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-sm md:text-base" data-testid={`text-promo-name-${group.groupId || group.promotions[0].id}`}>
                          {group.name || group.promotions[0].product.name}
                        </h3>
                        <Badge variant={status.variant}>{status.label}</Badge>
                        <Badge variant="secondary" className="text-[10px]">-{group.discountPercent}%</Badge>
                        {isGroup && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Package className="h-2.5 w-2.5" />
                            {group.promotions.length} {t("promotionsPage", "products")}
                          </Badge>
                        )}
                        {group.targetRestaurantIds && group.targetRestaurantIds.length > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Users className="h-2.5 w-2.5" />
                            {group.targetRestaurantIds.length}
                          </Badge>
                        )}
                      </div>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mb-1.5">{group.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {group.promotions.map(promo => {
                          const orig = parseFloat(promo.product.price);
                          const disc = orig * (1 - promo.discountPercent / 100);
                          return (
                            <div key={promo.id} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/50 text-[11px]">
                              <span className="font-medium">{promo.product.name}</span>
                              <span className="text-muted-foreground line-through">{orig.toFixed(2)}€</span>
                              <span className="font-semibold text-green-600 dark:text-green-400">{disc.toFixed(2)}€</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {format(new Date(group.startDate), "dd.MM.yyyy", { locale: dateFnsLocale })} - {format(new Date(group.endDate), "dd.MM.yyyy", { locale: dateFnsLocale })}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => {
                        if (group.groupId) {
                          deleteGroupMutation.mutate(group.groupId);
                        } else {
                          deleteMutation.mutate(group.promotions[0].id);
                        }
                      }}
                      disabled={deleteGroupMutation.isPending || deleteMutation.isPending}
                      data-testid={`button-delete-group-${group.groupId || group.promotions[0].id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="p-8 md:p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Tag className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">{t("promotionsPage", "noPromotions")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("promotionsPage", "noPromotionsDesc")}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("promotionsPage", "createPromotion")}</DialogTitle>
            <DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                {[1, 2, 3].map(step => (
                  <div key={step} className="flex items-center gap-1.5">
                    <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[11px] font-bold ${
                      wizardStep === step ? "bg-primary text-primary-foreground" :
                      wizardStep > step ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {wizardStep > step ? <Check className="h-3 w-3" /> : step}
                    </div>
                    <span className={`text-xs hidden sm:inline ${wizardStep === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {t("promotionsPage", step === 1 ? "step1" : step === 2 ? "step2" : "step3")}
                    </span>
                    {step < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                  </div>
                ))}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1">
            {wizardStep === 1 && (
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm">{t("promotionsPage", "promotionName")} *</Label>
                  <Input
                    value={promoName}
                    onChange={e => setPromoName(e.target.value)}
                    placeholder={t("promotionsPage", "promotionNamePlaceholder")}
                    className="mt-1"
                    data-testid="input-promo-name"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("promotionsPage", "promotionDescription")}</Label>
                  <Textarea
                    value={promoDescription}
                    onChange={e => setPromoDescription(e.target.value)}
                    placeholder={t("promotionsPage", "promotionDescPlaceholder")}
                    className="mt-1 resize-none"
                    rows={2}
                    data-testid="input-promo-description"
                  />
                </div>
                <div>
                  <Label className="text-sm">{t("promotionsPage", "discount")} *</Label>
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
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">{t("promotionsPage", "startDate")} *</Label>
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
                    <Label className="text-sm">{t("promotionsPage", "endDate")} *</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      min={startDate || format(new Date(), "yyyy-MM-dd")}
                      className="mt-1"
                      data-testid="input-end-date"
                    />
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">{t("promotionsPage", "selectProducts")} *</Label>
                  <Badge variant="secondary" className="text-xs">{selectedProductIds.length} {t("promotionsPage", "selectedProducts")}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("common", "search") + "..."}
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="pl-9 text-sm"
                    data-testid="input-search-products"
                  />
                </div>
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {filteredProducts?.map(product => {
                    const isSelected = selectedProductIds.includes(product.id);
                    const orig = parseFloat(product.price);
                    const disc = orig * (1 - (parseInt(discountPercent) || 0) / 100);
                    const outOfStock = product.inStock === false;
                    const existingPromo = activePromoByProductId.get(product.id);
                    const hasActivePromo = !!existingPromo && !isSelected;
                    return (
                      <div
                        key={product.id}
                        onClick={() => !outOfStock && toggleProduct(product.id)}
                        className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                          outOfStock ? "opacity-60 cursor-not-allowed bg-muted/30" :
                          isSelected ? "border-primary bg-primary/5 cursor-pointer" :
                          hasActivePromo ? "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20 cursor-pointer" :
                          "border-border hover:bg-muted/50 cursor-pointer"
                        }`}
                        data-testid={`product-option-${product.id}`}
                      >
                        <Checkbox checked={isSelected} disabled={outOfStock} className="pointer-events-none" />
                        {product.imageUrl ? (
                          <div className="w-8 h-8 rounded-md overflow-hidden bg-muted shrink-0">
                            <img src={product.imageUrl} alt={product.name} className={`w-full h-full object-cover ${outOfStock ? "grayscale" : ""}`} />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-3.5 w-3.5 text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{product.name}</p>
                            {existingPromo && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 shrink-0 whitespace-nowrap">
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                {lang === "de" ? "Bereits aktive Aktion" : "Promozione già attiva"}
                              </Badge>
                            )}
                          </div>
                          {outOfStock ? (
                            <p className="text-[11px] text-red-500 font-medium">{t("promotionsPage", "noStockAvailable")}</p>
                          ) : existingPromo && !isSelected ? (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-amber-600 dark:text-amber-400 font-medium">-{existingPromo.discountPercent}%</span>
                              <span className="text-muted-foreground">{existingPromo.name || (lang === "de" ? "Aktive Aktion" : "Promozione attiva")}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-muted-foreground line-through">{orig.toFixed(2)}€</span>
                              <span className="font-medium text-green-600 dark:text-green-400">{disc.toFixed(2)}€</span>
                              <span className="text-muted-foreground">/{product.unit}</span>
                            </div>
                          )}
                        </div>
                        {product.category && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{product.category}</Badge>
                        )}
                      </div>
                    );
                  })}
                  {filteredProducts?.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">{t("supplierProducts", "noProducts")}</p>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm font-medium">{t("promotionsPage", "targetRestaurants")}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button
                      onClick={() => { setTargetMode("all"); setSelectedRestaurantIds([]); }}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                        targetMode === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      data-testid="button-target-all"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("promotionsPage", "allRestaurants")}</span>
                    </button>
                    <button
                      onClick={() => setTargetMode("specific")}
                      className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-colors ${
                        targetMode === "specific" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      data-testid="button-target-specific"
                    >
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t("promotionsPage", "specificRestaurants")}</span>
                    </button>
                  </div>
                </div>

                {targetMode === "specific" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t("promotionsPage", "selectRestaurants")}</Label>
                      <Badge variant="secondary" className="text-xs">{selectedRestaurantIds.length}</Badge>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder={t("common", "search") + "..."}
                        value={restaurantSearch}
                        onChange={e => setRestaurantSearch(e.target.value)}
                        className="pl-9 text-sm"
                        data-testid="input-search-restaurants"
                      />
                    </div>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {filteredRestaurants?.map(restaurant => {
                        const isSelected = selectedRestaurantIds.includes(restaurant.id);
                        return (
                          <div
                            key={restaurant.id}
                            onClick={() => toggleRestaurant(restaurant.id)}
                            className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors ${
                              isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                            }`}
                            data-testid={`restaurant-option-${restaurant.id}`}
                          >
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={restaurant.profileImageUrl || undefined} />
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {(restaurant.companyName || restaurant.name).substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{restaurant.companyName || restaurant.name}</p>
                              {restaurant.city && <p className="text-[11px] text-muted-foreground">{restaurant.city}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4">
                  <div
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      notifyChat ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => setNotifyChat(!notifyChat)}
                    data-testid="checkbox-notify-chat"
                  >
                    <Checkbox checked={notifyChat} className="pointer-events-none" />
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{t("promotionsPage", "notifyRestaurants")}</p>
                      <p className="text-[11px] text-muted-foreground">{t("promotionsPage", "notifyDesc")}</p>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-muted/50 border space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{lang === "de" ? "Zusammenfassung" : "Riepilogo"}</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("promotionsPage", "promotionName")}:</span>
                      <span className="font-medium">{promoName || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("promotionsPage", "discount")}:</span>
                      <span className="font-medium text-green-600">-{discountPercent}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("promotionsPage", "products")}:</span>
                      <span className="font-medium">{selectedProductIds.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("promotionsPage", "targetRestaurants")}:</span>
                      <span className="font-medium">{targetMode === "all" ? t("promotionsPage", "allRestaurants") : `${selectedRestaurantIds.length} ${t("promotionsPage", "specificRestaurants")}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{lang === "de" ? "Zeitraum" : "Periodo"}:</span>
                      <span className="font-medium text-xs">{startDate && endDate ? `${format(new Date(startDate), "dd.MM.yy")} - ${format(new Date(endDate), "dd.MM.yy")}` : "—"}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t pt-3">
            {wizardStep > 1 && (
              <Button variant="outline" onClick={() => setWizardStep(wizardStep - 1)} data-testid="button-wizard-back">
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t("promotionsPage", "back")}
              </Button>
            )}
            <div className="flex-1" />
            {wizardStep < 3 ? (
              <Button
                onClick={() => setWizardStep(wizardStep + 1)}
                disabled={wizardStep === 1 ? !canGoToStep2 : !canGoToStep3}
                data-testid="button-wizard-next"
              >
                {t("promotionsPage", "next")}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={isPending || !canSubmit}
                data-testid="button-save-promotion"
              >
                {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                {t("common", "create")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!overwriteProduct} onOpenChange={(open) => { if (!open) setOverwriteProduct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {lang === "de" ? "Bereits aktive Aktion" : "Promozione già attiva"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {overwriteProduct && (() => {
                const existingPromo = activePromoByProductId.get(overwriteProduct.id);
                return lang === "de"
                  ? `"${overwriteProduct.name}" hat bereits eine aktive Aktion${existingPromo?.name ? ` ("${existingPromo.name}", -${existingPromo.discountPercent}%)` : ` (-${existingPromo?.discountPercent}%)`}. Wenn Sie fortfahren, wird die bestehende Aktion durch die neue ersetzt.`
                  : `"${overwriteProduct.name}" ha già una promozione attiva${existingPromo?.name ? ` ("${existingPromo.name}", -${existingPromo.discountPercent}%)` : ` (-${existingPromo?.discountPercent}%)`}. Se continui, la promozione esistente verrà sostituita dalla nuova.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-overwrite">
              {t("common", "cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmOverwrite}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-overwrite"
            >
              {lang === "de" ? "Überschreiben" : "Sovrascrivi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
